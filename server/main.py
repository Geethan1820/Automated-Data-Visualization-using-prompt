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
import hashlib

from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

import db
from modules.data_processor import clean_dataset, calculate_quality_score, detect_column_types
from modules import llm_engine as ai
from modules import cache
from modules.insight_engine import generate_insights
from modules.ml_engine import detect_ml_intent, run_ml

import logging
from config import settings

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("DataNova")

# ─── CONFIG ───────────────────────────────────────────────────────────────────

SECRET_KEY = settings.JWT_SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES

UPLOAD_DIR = settings.DATA_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login", auto_error=True)

# ─── STARTUP ──────────────────────────────────────────────────────────────────

import logging

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("DataNova")

# ─── STARTUP ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def on_startup():
    await db.init_db()
    key = os.environ.get("GEMINI_API_KEY", "")
    key_status = f"LOADED ({key[:5]}...)" if key else "MISSING"
    logger.info("================================================================")
    logger.info("Backend v2.0 started.")
    logger.info(f"AI API Status: {key_status}")
    logger.info("Server URL: http://localhost:8000")
    logger.info("================================================================")

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
    paths_to_remove = {file_record["filepath"]}
    raw_path = file_record["filepath"].replace("_clean.csv", ".csv")
    if "_clean.csv" not in file_record["filepath"]:
         raw_path = file_record["filepath"] + ".raw" 
    paths_to_remove.add(raw_path)

    for path in paths_to_remove:
        try:
            if os.path.exists(path):
                os.remove(path)
        except Exception as e:
            logger.warning(f"Failed to delete file at {path}: {e}")
    
    cache.clear_df_cache(file_id)
    deleted = await db.delete_file(file_id, current_user["id"])
    if not deleted:
        raise HTTPException(404, "File not found in database.")
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
    prompt: str, intent: Dict[str, Any], columns: List[str], memory: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Intelligent merging of previous context with new intent.
    - Preserves columns if user only asks for chart change.
    - Prioritizes new columns if detected in prompt.
    """
    if not memory:
        return intent
    
    out = {**intent}
    pl = prompt.lower()
    
    # 1. Detect if the user is explicitly asking for NEW columns
    # We look at the AI intent's x_axis and y_axes. If they were filled by the AI
    # from the current prompt, we should probably respect them.
    # However, if the AI returned the SAME columns as memory, it might be a follow-up.
    
    # 2. Check for explicit chart type change signals
    is_chart_switch = any(s in pl for s in ["change to", "switch to", "make it", "as a", "to a", "instead of"])
    
    # 3. Inheritance logic
    mem_x = memory.get("x_column")
    mem_ys = memory.get("y_columns") or ([memory.get("y_column")] if memory.get("y_column") else [])
    mem_ys = [c for c in mem_ys if c]

    curr_x = out.get("x_axis") or out.get("x_column")
    curr_ys = out.get("y_axes") or ([out.get("y_axis")] if out.get("y_axis") else [])
    curr_ys = [c for c in curr_ys if c]

    # If the user didn't name new columns but asked for a chart change, inherit
    if not curr_ys and mem_ys:
        out["x_axis"] = mem_x
        out["y_axes"] = mem_ys
        out["y_axis"] = mem_ys[0]
        out["inherited"] = True

    # 4. Explicit Chart Type Forcing
    if any(k in pl for k in ("line chart", "trend", "over time")): out["chart_type"] = "line"
    elif any(k in pl for k in ("bar chart", "comparison", "compare")): out["chart_type"] = "bar"
    elif any(k in pl for k in ("pie chart", "share", "composition")): out["chart_type"] = "pie"
    elif any(k in pl for k in ("scatter", "vs", "correlation")): out["chart_type"] = "scatter"
    elif any(k in pl for k in ("area", "filled")): out["chart_type"] = "area"

    return out


def _validate_and_fix_intent(intent: Dict[str, Any], df: pd.DataFrame, col_meta: List[Dict]) -> Dict[str, Any]:
    """
    Hallucination Guard & Auto-Correction Logic.
    Ensures columns exist and chart types are mathematically sound for the data types.
    """
    from thefuzz import process as fuzz_process
    
    out = {**intent}
    cols = df.columns.tolist()
    meta_map = {m["name"]: m for m in col_meta}

    def find_best_match(target: str):
        if not target or target in cols: return target
        match, score = fuzz_process.extractOne(target, cols)
        return match if score > 80 else None

    # 1. Validate Columns (The Hallucination Guard)
    x_raw = out.get("x_axis") or out.get("x_column")
    x_fixed = find_best_match(x_raw)
    
    y_raws = out.get("y_axes") or ([out.get("y_axis")] if out.get("y_axis") else [])
    y_fixed = [find_best_match(y) for y in y_raws if find_best_match(y)]

    # Fallback if AI totally failed to pick valid columns
    if not x_fixed and cols: x_fixed = cols[0]
    if not y_fixed:
        numeric_cols = [m["name"] for m in col_meta if m["is_numeric"]]
        y_fixed = [numeric_cols[0]] if numeric_cols else ([cols[1]] if len(cols) > 1 else [cols[0]])

    out["x_axis"] = x_fixed
    out["y_axes"] = y_fixed
    out["y_axis"] = y_fixed[0] if y_fixed else None

    # 2. Mathematical Soundness (Auto-Correction)
    chart_type = out.get("chart_type", "bar")
    x_meta = meta_map.get(x_fixed)
    y_meta = meta_map.get(y_fixed[0]) if y_fixed else None

    # Line chart requires a temporal or ordinal progression
    if chart_type == "line" and x_meta and not x_meta["is_datetime"]:
        date_cols = [m["name"] for m in col_meta if m["is_datetime"]]
        if date_cols and x_fixed not in date_cols:
            # Auto-correction: If user asked for line but x is not date, and date exists, swap!
            out["x_axis"] = date_cols[0]
            out["reasoning"] = (out.get("reasoning", "") + 
                                f" [Auto-Correct] Swapped X-axis to '{date_cols[0]}' for better line chart visualization.")
        else:
            # If no date column, line chart is riskier, maybe bar is better if categories are few
            if x_meta.get("unique_count", 100) < 15:
                out["chart_type"] = "bar"
                out["reasoning"] = (out.get("reasoning", "") + 
                                    " [Auto-Correct] Switched from Line to Bar as X-axis is categorical.")

    # Scatter Plot requires Numeric vs Numeric
    if chart_type == "scatter":
        if x_meta and not x_meta["is_numeric"]:
            # Check if any numeric column is available to swap
            num_cols = [m["name"] for m in col_meta if m["is_numeric"]]
            if num_cols:
                out["x_axis"] = num_cols[0]
            else:
                out["chart_type"] = "bar"

    # Pie Chart Cardinality Check
    if chart_type == "pie" and x_meta and x_meta.get("unique_count", 100) > 12:
        out["chart_type"] = "bar"
        out["reasoning"] = (out.get("reasoning", "") + 
                            " [Auto-Correct] Switched from Pie to Bar due to high cardinality of categories.")

    # Aggregation Safety
    if out.get("aggregation") in ["sum", "avg"]:
        if y_meta and not y_meta["is_numeric"]:
            out["aggregation"] = "count"
            out["reasoning"] = (out.get("reasoning", "") + 
                                " [Auto-Correct] Switched aggregation to 'count' as Y-axis is non-numeric.")

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

    # 1.2. Load Session Memory (Last successful chart context)
    session_memory = cache.get_session_memory(file_id)

    # 1.5. Query Caching (Saves Quota for Demo)
    # Generate a unique key for this query on this dataset
    query_key = f"qcache_{file_id}_{hashlib.md5(prompt.strip().lower().encode()).hexdigest()}"
    cached_intent = cache.cache_client.get(query_key)
    
    if cached_intent:
        print(f"[AI CACHE] Instant Hit for: {prompt}")
        intent = cached_intent
    else:
        # 2. Prepare Sample for LLM
        # We send columns and 3 sample rows to give the LLM context.
        sample_data = df.head(3).replace({np.nan: None}).to_dict(orient="records")
        col_meta = detect_column_types(df)
        
        # 3. Call AI Engine (LLM) — include session memory and rich type metadata
        intent = ai.parse_with_llm(
            prompt, metadata["columns"], sample_data, type_info=col_meta, previous_context=session_memory
        )
        
        # Cache the valid intent (before merging memory which changes per turn)
        if intent and not intent.get("error"):
            cache.cache_client.set(query_key, intent)
    
    # 4. Intent Merging (Context Preservation)
    intent = _merge_chart_memory(prompt, intent, metadata["columns"], session_memory)
    
    # 5. Intent Validation (Hallucination Guard & Auto-Correction)
    intent = _validate_and_fix_intent(intent, df, col_meta)
    
    # 6. Branch based on Intent Type (Text vs. Visualization)
    if intent.get("intent_type") == "text_answer":
        elapsed = round(time.time() - t_start, 3)
        return {
            "intent": intent,
            "is_text": True,
            "answer": intent.get("answer", "I couldn't generate a text response, but here is your data summary."),
            "insights": intent.get("insights", []),
            "response_time": elapsed,
            "error": False,
        }
    
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
            "is_text": False,
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
            
            # Intelligent Sorting Selection
            is_time_series = any(k in x_col.lower() for k in ("date", "time", "year", "month", "day", "created"))
            
            if is_time_series or chart_type in ("line", "area"):
                try:
                    df_temp = grouped.copy()
                    # Try converting to datetime to sort correctly
                    df_temp[x_col] = pd.to_datetime(df_temp[x_col], errors='coerce')
                    grouped = df_temp.sort_values(x_col).dropna(subset=[x_col])
                    # Restore string format for JSON response
                    grouped[x_col] = grouped[x_col].dt.strftime("%Y-%m-%d")
                except:
                    # Fallback to alphanumeric sort for X
                    grouped = grouped.sort_values(x_col)
            elif chart_type in ("bar", "pie", "donut"):
                # Sort by the aggregate volume (sum of all numeric Y columns) descending
                grouped["_total_volume"] = grouped[numeric_y].sum(axis=1)
                grouped = grouped.sort_values("_total_volume", ascending=False).drop(columns=["_total_volume"])
                if len(grouped) > 30:
                    grouped = grouped.head(30)
            
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
        # If the request looks like a file (has an extension), check if it exists
        if "." in full_path:
            file_path = os.path.join(STATIC_DIR, full_path)
            if os.path.isfile(file_path):
                return FileResponse(file_path)
        
        # Otherwise, always serve index.html to allow React Router to handle the URL
        index_path = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        
        # If frontend is not built, provide a helpful error
        raise HTTPException(
            status_code=404, 
            detail="Frontend build not found. Run 'cd client; npm run build' or access via http://localhost:5173"
        )
else:
    print(f"⚠️  WARNING: Pre-built Frontend (client/dist) NOT FOUND at {STATIC_DIR}")
    print(f"👉 To use the integrated UI, run 'cd client; npm run build' first.")
    print(f"👉 Otherwise, run the Frontend separately with 'cd client; npm run dev'")
