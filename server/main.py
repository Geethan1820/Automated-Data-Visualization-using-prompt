import os
from dotenv import load_dotenv
# Load environment from root folder explicitly at the very start with OVERRIDE
dotenv_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path, override=True)

"""
main.py — GVS DataNova FastAPI Backend (Upgraded)
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import pandas as pd
import numpy as np
import os
import shutil
import uuid
import time

from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

import db
from modules.data_processor import clean_dataset, calculate_quality_score, detect_column_types
from modules import llm_engine as ai
from modules import cache
from modules.insight_engine import generate_insights
from modules.ml_engine import detect_ml_intent, run_ml

# ─── CONFIG ───────────────────────────────────────────────────────────────────

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "datasight-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

UPLOAD_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="GVS DataNova API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login", auto_error=True)

# ─── STARTUP ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    await db.init_db()
    key = os.environ.get("GEMINI_API_KEY", "")
    key_status = f"LOADED ({key[:5]}...)" if key else "MISSING"
    print("================================================================")
    print("[GVS DataNova] Backend v2.0 started.")
    print(f"[GVS DataNova] AI API Status: {key_status}")
    print("[GVS DataNova] Server URL: http://localhost:8000")
    print("================================================================")

# Session logic now uses in-memory caching via the 'cache' module.

# ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Validate JWT and return user id + username."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        username = payload.get("sub")
        if not user_id or not username:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return {"id": user_id, "username": username}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# ─── AUTH ENDPOINTS ───────────────────────────────────────────────────────────

@app.post("/signup")
async def signup(
    username: str = Body(...),
    password: str = Body(...),
):
    if len(username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters.")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters.")

    user_id = str(uuid.uuid4())
    success = await db.create_user(user_id, username, password)
    if not success:
        raise HTTPException(409, "Username already exists. Please choose another.")

    token = create_access_token(
        {"sub": username, "user_id": user_id},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": username,
        "user_id": user_id,
    }


@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = await db.get_user_by_username(form_data.username)
    if not user or not db.verify_password(form_data.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect username or password.")

    token = create_access_token(
        {"sub": user["username"], "user_id": user["id"]},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user["username"],
        "user_id": user["id"],
    }

# ─── FILE OPERATIONS ──────────────────────────────────────────────────────────

@app.get("/files")
async def get_files(current_user: dict = Depends(get_current_user)):
    files = await db.get_all_files(current_user["id"])
    return {"files": files}


@app.delete("/files/{file_id}")
async def delete_file(file_id: str, current_user: dict = Depends(get_current_user)):
    """Permanently delete a file session and all its chat history (owner only)."""
    file_record = await db.get_file(file_id)
    if not file_record or file_record.get("user_id") != current_user["id"]:
        raise HTTPException(404, "File not found.")
    for path in [file_record["filepath"], file_record["filepath"].replace("_clean.csv", "")]:
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception:
            pass
    cache.clear_df_cache(file_id)
    deleted = await db.delete_file(file_id, current_user["id"])
    if not deleted:
        raise HTTPException(404, "File not found.")
    return {"success": True, "file_id": file_id}


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    try:
        file_ext = file.filename.rsplit(".", 1)[-1].lower()
        if file_ext not in ("csv", "xlsx", "xls"):
            raise HTTPException(400, "Unsupported file format. Use CSV or Excel.")

        file_id = str(uuid.uuid4())
        file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{file_ext}")

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if file_ext == "csv":
            df = pd.read_csv(file_path, encoding_errors="replace")
        else:
            df = pd.read_excel(file_path)

        raw_stats = {
            "rows": len(df),
            "columns": len(df.columns),
            "missing_count": int(df.isnull().sum().sum()),
        }

        df_clean = clean_dataset(df.copy())
        score, quality_report = calculate_quality_score(df, df_clean)
        column_details = detect_column_types(df_clean)

        clean_path = os.path.join(UPLOAD_DIR, f"{file_id}_clean.csv")
        df_clean.to_csv(clean_path, index=False)

        # Save to DB
        await db.save_file(
            file_id=file_id,
            filename=file.filename,
            filepath=clean_path,
            rows=raw_stats["rows"],
            columns=raw_stats["columns"],
            quality_score=score,
            user_id=current_user["id"],
        )

        return {
            "file_id": file_id,
            "filename": file.filename,
            "columns": df_clean.columns.tolist(),
            "score": score,
            "quality_report": quality_report,
            "stats": raw_stats,
            "column_details": column_details,
            "preview": df_clean.head(10).replace({np.nan: None}).to_dict(orient="records"),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Upload error: {str(e)}")


# ─── QUERY ENDPOINT ───────────────────────────────────────────────────────────

async def _load_dataset(file_id: str, user_id: str) -> dict:
    """Load dataset metadata and cache DataFrame in memory (owner only)."""
    df = cache.get_df_cache(file_id)

    file_record = await db.get_file(file_id)
    if not file_record or file_record.get("user_id") != user_id:
        raise HTTPException(404, "Dataset not found. Please re-upload.")

    if df is None:
        filepath = file_record["filepath"]
        if not os.path.exists(filepath):
            raise HTTPException(404, "Dataset file missing on server. Please re-upload.")
        df = pd.read_csv(filepath)
        # 2. Cache back to memory
        cache.set_df_cache(file_id, df)

    meta = {
        "filename": file_record["filename"],
        "columns": df.columns.tolist(),
        "path": file_record["filepath"],
        "score": file_record["quality_score"],
        "column_details": detect_column_types(df),
        "stats": {"rows": len(df), "columns": len(df.columns)},
        "df": df # Return the DF object for the caller
    }
    return meta


@app.get("/suggestions/{file_id}")
async def get_suggestions(file_id: str, current_user: dict = Depends(get_current_user)):
    """Fetch or generate dynamic AI suggestions for a specific dataset."""
    # 1. Check Cache
    cached = cache.get_json_cache(f"suggestions_{file_id}")
    if cached: return cached

    # 2. Load Metadata
    try:
        meta = await _load_dataset(file_id, current_user["id"])
        df = meta["df"]
        cols = meta["columns"]
        sample = df.head(3).replace({np.nan: None}).to_dict(orient="records")
        
        # 3. Generate with AI
        suggestions = ai.generate_dataset_suggestions(cols, sample)
        
        # 4. Cache and Return
        cache.set_json_cache(f"suggestions_{file_id}", suggestions)
        return suggestions
    except Exception as e:
        print(f"Suggestions API Error: {e}")
        return ["Show data distribution", "Compare categories", "Analyze trends"]


def _merge_chart_memory(
    prompt: str, intent: Dict[str, Any], memory: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Reuse last chart columns when the user sends a follow-up (e.g. only 'change to line chart').
    Session memory is keyed by file_id in cache.
    """
    if not memory:
        return intent
    out = {**intent}
    mem_x = memory.get("x_column")
    mem_ys = memory.get("y_columns") or []
    if not mem_ys and memory.get("y_column"):
        mem_ys = [memory["y_column"]]
    mem_ys = [c for c in mem_ys if c]

    xa = out.get("x_axis") or out.get("x_column")
    ya = out.get("y_axes") or []
    if not ya and out.get("y_axis"):
        ya = [out.get("y_axis")]
    ya = [c for c in ya if c]

    ya_was_empty = not ya
    x_was_empty = not xa

    if mem_x and x_was_empty:
        out["x_axis"] = mem_x
        out["x_column"] = mem_x
    if mem_ys and ya_was_empty:
        out["y_axes"] = mem_ys
        out["y_axis"] = mem_ys[0]

    if not out.get("aggregation") and memory.get("aggregation"):
        out["aggregation"] = memory["aggregation"]

    # If we had to restore Y from memory, treat as chart-only follow-up and lock chart_type from wording
    if ya_was_empty and mem_ys:
        pl = prompt.lower()
        if any(k in pl for k in ("line chart", "line graph", "to line", "as a line")):
            out["chart_type"] = "line"
        elif any(k in pl for k in ("bar chart", "to bar", "as a bar")):
            out["chart_type"] = "bar"
        elif any(k in pl for k in ("pie chart", "to pie", "as a pie")):
            out["chart_type"] = "pie"
        elif any(k in pl for k in ("area chart", "to area", "as an area")):
            out["chart_type"] = "area"
        elif "scatter" in pl:
            out["chart_type"] = "scatter"

    # User explicitly asked to change chart type; LLM may have left the previous chart_type
    pl_all = prompt.lower()
    wants_chart_change = memory and any(
        v in pl_all
        for v in (
            "change",
            "switch",
            "make it",
            "convert",
            "instead",
            "turn into",
            "to line",
            "to bar",
            "to pie",
            "to area",
        )
    )
    if wants_chart_change:
        if any(k in pl_all for k in ("line chart", "line graph", "to line", "as a line")):
            out["chart_type"] = "line"
        elif any(k in pl_all for k in ("bar chart", "to bar", "as a bar")):
            out["chart_type"] = "bar"
        elif any(k in pl_all for k in ("pie chart", "to pie", "as a pie")):
            out["chart_type"] = "pie"
        elif any(k in pl_all for k in ("area chart", "to area", "as an area")):
            out["chart_type"] = "area"
        elif "scatter" in pl_all:
            out["chart_type"] = "scatter"

    return out


@app.post("/chart/recompute")
async def recompute_chart(
    file_id: str = Body(...),
    x_col: str = Body(...),
    y_cols: List[str] = Body(...),
    aggregation: str = Body(...),
    chart_type: str = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Instant re-calculation of chart data with new aggregation/columns."""
    try:
        meta = await _load_dataset(file_id, current_user["id"])
        df = meta["df"]
        
        # Perform recompute using the core data engine
        chart_data = _generate_chart_data(df, chart_type, x_col, y_cols, aggregation)
        
        return {
            "chart_data": chart_data,
            "aggregation": aggregation,
            "success": True
        }
    except Exception as e:
        raise HTTPException(500, f"Recompute error: {str(e)}")


@app.post("/query")
async def process_query(
    prompt: str = Body(...),
    file_id: str = Body(...),
    current_user: dict = Depends(get_current_user),
):
    t_start = time.time()
    user_id = current_user["id"]

    # 1. Load Data (In-Memory Caching enabled) — owner only
    metadata = await _load_dataset(file_id, user_id)
    await db.log_user_query(user_id, prompt)
    df = metadata["df"]

    # Last successful chart for this file (follow-ups like "change to line chart")
    session_memory = cache.get_session_memory(file_id)
    
    # 2. Prepare Sample for LLM
    # We send columns and 3 sample rows to give the LLM context.
    sample_data = df.head(3).replace({np.nan: None}).to_dict(orient="records")
    
    # 3. Call AI Engine (LLM) — include session memory so follow-ups inherit columns
    intent = ai.parse_with_llm(
        prompt, metadata["columns"], sample_data, previous_context=session_memory
    )
    intent = _merge_chart_memory(prompt, intent, session_memory)
    
    # --- POLITE REFUSAL FOR MISSING COLUMNS ---
    missing = intent.get("missing_columns", [])
    if missing:
        return {
            "error": True,
            "message": f"I couldn't find the following columns in your dataset: {', '.join(missing)}. Please check the names and try again!",
            "suggestions": [f"Available columns: {', '.join(metadata['columns'][:10])}..."]
        }

    if intent.get("error"):
        return {
            "error": True,
            "message": f"AI Error: {intent.get('message')}",
            "suggestions": ["Try rephrasing your question.", "Check if columns are mentioned correctly."]
        }

    # 4. Handle ML Logic (If requested)
    if intent.get("is_ml") or intent.get("chart_type") == "ml_forecast":
        # Use detect_ml_intent for accurate ML type detection
        detected = detect_ml_intent(prompt)
        ml_intent = detected if detected else {
            "ml_type": "forecast" if "forecast" in intent.get("chart_type", "").lower() else "regression",
            "description": intent.get("reasoning", "")
        }
        x_col_ml = intent.get("x_axis") or intent.get("x_column")
        y_cols_ml = intent.get("y_axes") or ([intent.get("y_axis")] if intent.get("y_axis") else [])
        y_col_ml = y_cols_ml[0] if y_cols_ml else None
        return await _handle_ml_query(
            df=df,
            ml_intent=ml_intent,
            intent_data={
                "x_column": x_col_ml,
                "y_column": y_col_ml,
                "found_columns": [x_col_ml] + y_cols_ml if x_col_ml else y_cols_ml,
            },
            metadata=metadata,
            file_id=file_id,
            prompt=prompt,
            t_start=t_start,
            user_id=user_id,
        )

    try:
        # 5. Extract variables from intent
        chart_type  = intent.get("chart_type", "bar")
        x_col       = intent.get("x_axis") or intent.get("x_column")
        aggregation = intent.get("aggregation") or "sum"

        y_cols = intent.get("y_axes") or []
        if not y_cols and intent.get("y_axis"):
            y_cols = [intent.get("y_axis")]
        # Ensure y_cols contains only non-None strings
        y_cols = [c for c in y_cols if c]
        y_col  = y_cols[0] if y_cols else None

        # Guard: need at least x and y
        if not x_col or not y_cols:
            return {
                "error": True,
                "message": "Could not determine which columns to visualize. Please mention specific column names.",
                "suggestions": [f"Available columns: {', '.join(metadata['columns'][:10])}"],
            }

        # Fuzzy rescue for columns not found exactly
        from thefuzz import process as fuzz_process
        if x_col not in df.columns:
            match = fuzz_process.extractOne(x_col, df.columns.tolist())
            if match and match[1] > 75:
                x_col = match[0]
            else:
                return {
                    "error": True,
                    "message": f"Column '{x_col}' not found. Available: {', '.join(metadata['columns'][:10])}",
                    "suggestions": [],
                }

        fixed_y = []
        for col in y_cols:
            if col in df.columns:
                fixed_y.append(col)
            else:
                match = fuzz_process.extractOne(col, df.columns.tolist())
                if match and match[1] > 75:
                    fixed_y.append(match[0])
        y_cols = fixed_y if fixed_y else y_cols
        y_col  = y_cols[0] if y_cols else None

        chart_data = _generate_chart_data(df, chart_type, x_col, y_cols, aggregation)

        # 6. Insights
        insights_list = intent.get("insights") or ["Analysis complete."]

        # 7. Update Session Memory
        cache.set_session_memory(file_id, {
            "chart_type": chart_type,
            "x_column": x_col,
            "y_column": y_col,
            "y_columns": y_cols,
            "aggregation": aggregation,
        })

        # 8. Save Chat Record
        chat_id = str(uuid.uuid4())
        await db.save_chat(
            chat_id=chat_id,
            file_id=file_id,
            user_id=user_id,
            user_prompt=prompt,
            chart_type=chart_type,
            x_column=x_col,
            y_column=y_col,
            aggregation=aggregation,
            chart_data=chart_data,
            insights=insights_list,
            summary=intent.get("reasoning"),
            reasoning=intent.get("reasoning"),
        )

        elapsed = round(time.time() - t_start, 3)
        return {
            "intent": intent,
            "chart_data": chart_data,
            "insights": insights_list,
            "summary": intent.get("reasoning"),
            "chat_id": chat_id,
            "response_time": elapsed,
            "error": False,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "error": True,
            "message": f"Visualization Error: {str(e)}",
            "suggestions": ["Try a different chart type.", "Verify column names."],
        }


def _generate_chart_data(
    df: pd.DataFrame,
    chart_type: str,
    x_col: Optional[str],
    y_cols: List[str],
    aggregation: str = "sum",
):
    """Core data generation supporting multiple series (multi-column Y)."""
    chart_data = []
    if not x_col or not y_cols: return []

    AGG_FUNCS = {"sum": "sum", "avg": "mean", "count": "count", "max": "max", "min": "min"}
    agg_fn = AGG_FUNCS.get(aggregation, "sum")

    # Filter to only existing columns to prevent crashes
    y_cols = [c for c in y_cols if c in df.columns]
    if not y_cols: return []

    if chart_type == "histogram" and x_col:
        is_numeric_x = pd.api.types.is_numeric_dtype(df[x_col])
        if is_numeric_x:
            counts, bins = np.histogram(df[x_col].dropna(), bins=15)
            chart_data = [
                {"bin": f"{int(bins[i])}-{int(bins[i+1])}", "count": int(counts[i])}
                for i in range(len(counts))
            ]
        else:
            raise ValueError("Histogram requires numeric data.")

    elif chart_type == "scatter" and x_col and len(y_cols) >= 1:
        y_col = y_cols[0]
        sample_size = min(500, len(df))
        sample_df = df[[x_col, y_col]].dropna().sample(sample_size, random_state=42)
        chart_data = sample_df.replace({np.nan: None}).to_dict(orient="records")

    elif x_col and y_cols:
        # Check if all Y columns are numeric
        numeric_y = [c for c in y_cols if pd.api.types.is_numeric_dtype(df[c])]
        
        if numeric_y:
            grouped = df.groupby(x_col)[numeric_y]
            grouped = getattr(grouped, agg_fn)().reset_index()
            
            # Sort by first Y column descending for better viz
            grouped = grouped.sort_values(numeric_y[0], ascending=False)
            
            if chart_type in ("bar", "pie", "donut") and len(grouped) > 30:
                grouped = grouped.head(30)
            
            # For time series, sort by X
            if chart_type in ("line", "area"):
                try:
                    df_temp = grouped.copy()
                    df_temp[x_col] = pd.to_datetime(df_temp[x_col])
                    grouped = df_temp.sort_values(x_col)
                    grouped[x_col] = grouped[x_col].dt.strftime("%Y-%m-%d")
                except:
                    pass

            chart_data = grouped.replace({np.nan: None}).to_dict(orient="records")
        else:
            # Fallback to count if non-numeric
            grouped = df.groupby(x_col).size().reset_index(name="count")
            chart_data = grouped.sort_values("count", ascending=False).head(30).to_dict(orient="records")

    return chart_data


async def _handle_ml_query(df, ml_intent, intent_data, metadata, file_id, prompt, t_start, user_id: str):
    """Route to ML engine and format response."""
    ml_result = run_ml(
        df=df,
        ml_intent=ml_intent,
        columns=metadata["columns"],
        x_col=intent_data.get("x_column"),
        y_col=intent_data.get("y_column"),
    )

    if ml_result.get("error"):
        return {
            "error": True,
            "message": ml_result.get("message", "ML error occurred."),
            "suggestions": ["Try: 'Predict next 6 months sales'", "Ensure numeric columns exist."],
        }

    # Save ML chat to DB
    chat_id = str(uuid.uuid4())
    await db.save_chat(
        chat_id=chat_id,
        file_id=file_id,
        user_id=user_id,
        user_prompt=prompt,
        chart_type=ml_result.get("chart_type", "line"),
        x_column=ml_result.get("x_key"),
        y_column=ml_result.get("y_key"),
        chart_data=ml_result.get("data", []),
        ml_result=ml_result,
        summary=ml_result.get("summary"),
        confidence=0.85,
        reasoning=ml_intent.get("description", ""),
    )

    elapsed = round(time.time() - t_start, 3)
    return {
        "intent": intent_data,
        "is_ml": True,
        "ml_type": ml_intent["ml_type"],
        "ml_result": ml_result,
        "chart_data": ml_result.get("data", []),
        "insights": [ml_result.get("summary", "")],
        "summary": ml_result.get("summary", ""),
        "chat_id": chat_id,
        "response_time": elapsed,
        "error": False,
    }


async def _generate_dashboard_response(df, metadata, file_id):
    """Generate a multi-chart dashboard overview."""
    columns = metadata["columns"]
    num_cols = [c for c in columns if pd.api.types.is_numeric_dtype(df[c])]
    cat_cols = [c for c in columns if not pd.api.types.is_numeric_dtype(df[c])]

    dashboard_charts = []

    # Chart 1: Top category by first numeric column
    if cat_cols and num_cols:
        grouped = df.groupby(cat_cols[0])[num_cols[0]].sum().reset_index()
        grouped = grouped.sort_values(num_cols[0], ascending=False).head(10)
        dashboard_charts.append({
            "chart_type": "bar",
            "x_key": cat_cols[0],
            "y_key": num_cols[0],
            "data": grouped.replace({np.nan: None}).to_dict(orient="records"),
            "title": f"Top {cat_cols[0]} by {num_cols[0]}",
        })

    # Chart 2: Distribution of second numeric column
    if len(num_cols) >= 2:
        counts, bins = np.histogram(df[num_cols[1]].dropna(), bins=10)
        dashboard_charts.append({
            "chart_type": "histogram",
            "x_key": "bin",
            "y_key": "count",
            "data": [{"bin": f"{int(bins[i])}-{int(bins[i+1])}", "count": int(counts[i])} for i in range(len(counts))],
            "title": f"Distribution of {num_cols[1]}",
        })

    # Chart 3: Pie chart of first categorical column
    if cat_cols:
        pie_data = df[cat_cols[0]].value_counts().head(8).reset_index()
        pie_data.columns = [cat_cols[0], "count"]
        dashboard_charts.append({
            "chart_type": "pie",
            "x_key": cat_cols[0],
            "y_key": "count",
            "data": pie_data.to_dict(orient="records"),
            "title": f"{cat_cols[0]} Composition",
        })

    # Chart 4: Scatter if 2+ numeric cols
    if len(num_cols) >= 2:
        sample = df[[num_cols[0], num_cols[1]]].dropna().sample(min(100, len(df)), random_state=42)
        dashboard_charts.append({
            "chart_type": "scatter",
            "x_key": num_cols[0],
            "y_key": num_cols[1],
            "data": sample.to_dict(orient="records"),
            "title": f"{num_cols[0]} vs {num_cols[1]}",
        })

    # Generate smart insights using the insight engine
    insight_intent = {
        "x_column": cat_cols[0] if cat_cols else None,
        "y_column": num_cols[0] if num_cols else None,
        "chart_type": "bar",
    }
    insight_result = generate_insights(df, insight_intent, dashboard_charts[0]["data"] if dashboard_charts else None)
    insights_list = insight_result.get("insights", [])

    return {
        "is_dashboard": True,
        "dashboard_charts": dashboard_charts,
        "insights": insights_list,
        "summary": f"Dashboard overview for {metadata['filename']} with {len(df):,} records.",
        "error": False,
    }


# ─── HISTORY ENDPOINTS ─────────────────────────────────────────────────────────

@app.get("/history/{file_id}")
async def get_history(file_id: str, current_user: dict = Depends(get_current_user)):
    """Return full chat history for a file session (owner only)."""
    chats = await db.get_chat_history(file_id, current_user["id"])
    return {"file_id": file_id, "chats": chats, "count": len(chats)}


@app.get("/chat/{chat_id}")
async def get_chat(chat_id: str, current_user: dict = Depends(get_current_user)):
    """Return a single chat record (owner only)."""
    chat = await db.get_chat(chat_id, current_user["id"])
    if not chat:
        raise HTTPException(404, "Chat not found.")
    return chat


# Legacy context restoration removed. In-memory cache handles persistence.


# ─── DASHBOARD ENDPOINT ────────────────────────────────────────────────────────

@app.get("/dashboard/{file_id}")
async def get_dashboard(file_id: str, current_user: dict = Depends(get_current_user)):
    """Generate quick multi-chart dashboard for a dataset."""
    metadata = await _load_dataset(file_id, current_user["id"])
    df = metadata["df"]
    columns = metadata["columns"]
    num_cols = [c for c in columns if pd.api.types.is_numeric_dtype(df[c])]
    cat_cols = [c for c in columns if not pd.api.types.is_numeric_dtype(df[c])]
    result = await _generate_dashboard_response(df, metadata, file_id)
    result["columns"] = columns
    result["num_cols"] = num_cols
    result["cat_cols"] = cat_cols
    return result


@app.post("/dashboard/chart")
async def build_dashboard_chart(
    file_id: str = Body(...),
    chart_type: str = Body(...),
    x_col: str = Body(...),
    y_col: str = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Build a single chart panel with user-chosen columns and type."""
    try:
        meta = await _load_dataset(file_id, current_user["id"])
        df = meta["df"]
        data = _generate_chart_data(df, chart_type, x_col, [y_col], "sum")
        return {"success": True, "data": data, "x_key": x_col, "y_key": y_col, "chart_type": chart_type}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.post("/restore-context")
async def restore_context(
    file_id: str = Body(embed=True),
    current_user: dict = Depends(get_current_user),
):
    """Verify file access and warm dataset cache."""
    await _load_dataset(file_id, current_user["id"])
    return {"status": "ok", "file_id": file_id}


# ─── STATIC FILE SERVING ────────────────────────────────────────────────────────
# Instead of a separate frontend server, the backend can serve the pre-built React app.
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "client", "dist")

if os.path.exists(STATIC_DIR):
    print(f"[GVS DataNova] Serving pre-built Frontend from: {STATIC_DIR}")
    # Serve static assets (JS, CSS)
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Catch-all: serve index.html for any non-API route (SPA routing)."""
        # Exclude common API-like paths from SPA routing if they don't exist
        if full_path.startswith("api/") or full_path in ["login", "signup", "upload", "query"]:
             raise HTTPException(status_code=404, detail="API route not found")
             
        file_path = os.path.join(STATIC_DIR, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
else:
    print(f"⚠️  WARNING: Pre-built Frontend (client/dist) NOT FOUND at {STATIC_DIR}")
    print(f"👉 To use the integrated UI, run 'cd client; npm run build' first.")
    print(f"👉 Otherwise, run the Frontend separately with 'cd client; npm run dev'")
