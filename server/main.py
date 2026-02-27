"""
main.py — GVS DataNova FastAPI Backend (Upgraded)
Endpoints: /upload, /query, /history/{file_id}, /files,
           /signup, /login, /dashboard/{file_id}, /chat/{chat_id}
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Body, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import pandas as pd
import numpy as np
import os
import shutil
import uuid
import time

from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional, List

import db
from modules.data_processor import clean_dataset, calculate_quality_score, detect_column_types
from modules.nlp_engine import parse_prompt
from modules.insight_engine import generate_insights
from modules.ml_engine import detect_ml_intent, run_ml

# ─── CONFIG ───────────────────────────────────────────────────────────────────

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "datasight-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="GVS DataNova API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login", auto_error=False)

# ─── STARTUP ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    db.init_db()
    print("[GVS DataNova] Backend v2.0 started. DB initialized.")

# ─── IN-MEMORY SESSION (fast follow-up; DB is ground-truth) ──────────────────

SESSION_CONTEXT = {}  # file_id -> last intent context

# ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode["exp"] = expire
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> Optional[dict]:
    """Optional auth — returns None if no token provided (allow anonymous)."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        user = db.get_user_by_username(username)
        return user
    except JWTError:
        return None

# ─── HEALTH ───────────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "GVS DataNova Backend is Running", "version": "2.0.0"}

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
    success = db.create_user(user_id, username, password)
    if not success:
        raise HTTPException(409, "Username already exists. Please choose another.")

    token = create_access_token(
        {"sub": username, "user_id": user_id},
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {"access_token": token, "token_type": "bearer", "username": username}


@app.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = db.get_user_by_username(form_data.username)
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
    }

# ─── FILE OPERATIONS ──────────────────────────────────────────────────────────

@app.get("/files")
async def get_files(current_user=Depends(get_current_user)):
    user_id = current_user["id"] if current_user else None
    files = db.get_all_files(user_id)
    return {"files": files}


@app.delete("/files/{file_id}")
async def delete_file(file_id: str, current_user=Depends(get_current_user)):
    """Permanently delete a file session and all its chat history."""
    # Remove physical files from disk
    file_record = db.get_file(file_id)
    if file_record:
        for path in [file_record["filepath"], file_record["filepath"].replace("_clean.csv", "")]:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass

    # Remove from in-memory caches
    DATASETS.pop(file_id, None)
    SESSION_CONTEXT.pop(file_id, None)

    deleted = db.delete_file(file_id)
    if not deleted:
        raise HTTPException(404, "File not found.")
    return {"success": True, "file_id": file_id}


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
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
        db.save_file(
            file_id=file_id,
            filename=file.filename,
            filepath=clean_path,
            rows=raw_stats["rows"],
            columns=raw_stats["columns"],
            quality_score=score,
            user_id=current_user["id"] if current_user else None,
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

# In-memory dataset cache (file_id -> DataFrame + metadata)
DATASETS = {}


def _load_dataset(file_id: str) -> dict:
    """Load dataset from cache or DB fallback."""
    if file_id in DATASETS:
        return DATASETS[file_id]

    file_record = db.get_file(file_id)
    if not file_record:
        raise HTTPException(404, "Dataset not found. Please re-upload the file.")

    filepath = file_record["filepath"]
    if not os.path.exists(filepath):
        raise HTTPException(404, f"Dataset file missing on server. Please re-upload.")

    df = pd.read_csv(filepath)
    meta = {
        "filename": file_record["filename"],
        "columns": df.columns.tolist(),
        "path": filepath,
        "score": file_record["quality_score"],
        "column_details": detect_column_types(df),
        "stats": {"rows": len(df), "columns": len(df.columns)},
    }
    DATASETS[file_id] = meta
    return meta


@app.post("/query")
async def process_query(
    prompt: str = Body(...),
    file_id: str = Body(...),
    current_user=Depends(get_current_user),
):
    t_start = time.time()

    metadata = _load_dataset(file_id)
    df = pd.read_csv(metadata["path"])

    # Context from session + DB fallback
    last_context = SESSION_CONTEXT.get(file_id)
    if not last_context:
        last_context = db.get_context(file_id)
        if last_context:
            # Map DB fields to expected keys
            last_context = {
                "chart_type": last_context.get("last_chart_type"),
                "x_column": last_context.get("last_x"),
                "y_column": last_context.get("last_y"),
                "custom_color": last_context.get("last_color"),
                "found_columns": last_context.get("found_columns", []),
            }

    # Check for ML intent BEFORE NLP parsing
    ml_intent = detect_ml_intent(prompt)

    # Parse NLP intent
    intent_data = parse_prompt(prompt, metadata["columns"], last_context=last_context)

    # Handle dashboard intent
    if intent_data.get("is_dashboard"):
        return await _generate_dashboard_response(df, metadata, file_id)

    # If ML intent detected, run ML pipeline
    if ml_intent:
        return await _handle_ml_query(
            df=df,
            ml_intent=ml_intent,
            intent_data=intent_data,
            metadata=metadata,
            file_id=file_id,
            prompt=prompt,
            t_start=t_start,
        )

    # Standard visualization query
    if not intent_data["found_columns"] and not intent_data.get("custom_color"):
        return {
            "error": True,
            "message": "I couldn't identify any relevant columns in your prompt. Please mention column names.",
            "suggestions": [f"Show {c} distribution" for c in metadata["columns"][:4]],
        }

    # Apply year filter if present
    year_filter = intent_data.get("year_filter")
    if year_filter:
        for col in df.columns:
            try:
                df_dates = pd.to_datetime(df[col], errors="coerce")
                if df_dates.notna().mean() > 0.5:
                    df = df[df_dates.dt.year == year_filter]
                    break
            except Exception:
                pass

    chart_data, insights_result = [], {}
    x_col   = intent_data.get("x_column")
    y_col   = intent_data.get("y_column")
    chart_type = intent_data["chart_type"]
    custom_color = intent_data.get("custom_color")
    aggregation = intent_data.get("aggregation", "sum")

    try:
        is_numeric_x = pd.api.types.is_numeric_dtype(df[x_col]) if x_col and x_col in df.columns else False
        is_numeric_y = pd.api.types.is_numeric_dtype(df[y_col]) if y_col and y_col in df.columns else False

        # ── Validation for explicit chart types ───────────────────────────────
        if intent_data.get("is_explicit"):
            if chart_type in ("line", "area", "scatter") and not x_col:
                return {
                    "error": True,
                    "message": f"{chart_type.title()} chart requires an X-axis column (usually time or numeric). {intent_data['reasoning']}",
                    "suggestions": ["Specify the X column in your prompt.", "Try a bar chart instead."],
                }
            if chart_type in ("pie", "donut") and (not x_col or not y_col):
                return {
                    "error": True,
                    "message": "Pie/Donut chart requires both a category (X) and a value (Y) column.",
                    "suggestions": [f"Try: 'Show {metadata['columns'][0]} breakdown'"],
                }

        # ── Data Generation ────────────────────────────────────────────────────
        chart_data = _generate_chart_data(df, chart_type, x_col, y_col, is_numeric_x, is_numeric_y, aggregation)

        # ── Insights ───────────────────────────────────────────────────────────
        insights_result = generate_insights(df, intent_data, chart_data)

        # ── Update Context ─────────────────────────────────────────────────────
        new_context = {
            "chart_type": chart_type,
            "x_column": x_col,
            "y_column": y_col,
            "custom_color": custom_color,
            "found_columns": intent_data["found_columns"],
        }
        SESSION_CONTEXT[file_id] = new_context
        db.save_context(file_id, chart_type, x_col, y_col, custom_color, intent_data["found_columns"])

        # ── Save Chat to DB ────────────────────────────────────────────────────
        chat_id = str(uuid.uuid4())
        db.save_chat(
            chat_id=chat_id,
            file_id=file_id,
            user_prompt=prompt,
            chart_type=chart_type,
            x_column=x_col,
            y_column=y_col,
            aggregation=aggregation,
            chart_data=chart_data,
            insights=insights_result.get("insights", []),
            kpis=insights_result.get("kpis"),
            summary=insights_result.get("summary"),
            color=custom_color,
            confidence=intent_data.get("confidence"),
            reasoning=intent_data.get("reasoning"),
        )

        elapsed = round(time.time() - t_start, 3)
        return {
            "intent": intent_data,
            "chart_data": chart_data,
            "insights": insights_result.get("insights", []),
            "kpis": insights_result.get("kpis"),
            "summary": insights_result.get("summary", ""),
            "custom_color": custom_color,
            "confidence": intent_data.get("confidence"),
            "chat_id": chat_id,
            "response_time": elapsed,
            "error": False,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "error": True,
            "message": f"Couldn't generate chart: {str(e)}",
            "suggestions": ["Check column names", "Try a simpler query"],
        }


def _generate_chart_data(
    df: pd.DataFrame,
    chart_type: str,
    x_col: Optional[str],
    y_col: Optional[str],
    is_numeric_x: bool,
    is_numeric_y: bool,
    aggregation: str = "sum",
):
    """Core data generation with aggregation support."""
    chart_data = []

    AGG_FUNCS = {"sum": "sum", "avg": "mean", "count": "count", "max": "max", "min": "min"}
    agg_fn = AGG_FUNCS.get(aggregation, "sum")

    if chart_type == "histogram" and x_col:
        if is_numeric_x:
            counts, bins = np.histogram(df[x_col].dropna(), bins=15)
            chart_data = [
                {"bin": f"{int(bins[i])}-{int(bins[i+1])}", "count": int(counts[i])}
                for i in range(len(counts))
            ]
        else:
            raise ValueError("Histogram requires numeric data.")

    elif chart_type == "scatter" and x_col and y_col:
        sample_df = df[[x_col, y_col]].dropna().sample(min(200, len(df)), random_state=42)
        chart_data = sample_df.replace({np.nan: None}).to_dict(orient="records")

    elif chart_type in ("line", "area") and x_col and y_col:
        try:
            df = df.copy()
            df[x_col] = pd.to_datetime(df[x_col])
            grouped = df.groupby(x_col)[y_col]
            grouped = getattr(grouped, agg_fn)().reset_index().sort_values(x_col)
            grouped[x_col] = grouped[x_col].dt.strftime("%Y-%m-%d")
        except Exception:
            grouped = df.groupby(x_col)[y_col]
            grouped = getattr(grouped, agg_fn)().reset_index()
            if is_numeric_x:
                grouped = grouped.sort_values(x_col)
        chart_data = grouped.replace({np.nan: None}).to_dict(orient="records")

    elif x_col and y_col:
        if is_numeric_y:
            grouped = df.groupby(x_col)[y_col]
            grouped = getattr(grouped, agg_fn)().reset_index()
            grouped = grouped.sort_values(y_col, ascending=False)
            if chart_type in ("bar", "pie", "donut") and len(grouped) > 20:
                grouped = grouped.head(20)
            chart_data = grouped.replace({np.nan: None}).to_dict(orient="records")
        else:
            grouped = df.groupby(x_col).size().reset_index(name="count")
            chart_data = grouped.sort_values("count", ascending=False).head(20).to_dict(orient="records")

    elif x_col:
        grouped = df[x_col].value_counts().reset_index()
        grouped.columns = [x_col, "count"]
        chart_data = grouped.head(15).to_dict(orient="records")

    return chart_data


async def _handle_ml_query(df, ml_intent, intent_data, metadata, file_id, prompt, t_start):
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
    db.save_chat(
        chat_id=chat_id,
        file_id=file_id,
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
        "confidence": 0.85,
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

    # KPIs from first numeric column
    kpis = {}
    if num_cols:
        s = df[num_cols[0]].dropna()
        kpis = {
            "column": num_cols[0],
            "total": round(float(s.sum()), 2),
            "average": round(float(s.mean()), 2),
            "max": round(float(s.max()), 2),
            "min": round(float(s.min()), 2),
            "count": int(s.count()),
        }

    return {
        "is_dashboard": True,
        "dashboard_charts": dashboard_charts,
        "kpis": kpis,
        "summary": f"Dashboard overview for {metadata['filename']} with {len(df):,} records.",
        "error": False,
    }


# ─── HISTORY ENDPOINTS ─────────────────────────────────────────────────────────

@app.get("/history/{file_id}")
async def get_history(file_id: str):
    """Return full chat history for a file session."""
    chats = db.get_chat_history(file_id)
    return {"file_id": file_id, "chats": chats, "count": len(chats)}


@app.get("/chat/{chat_id}")
async def get_chat(chat_id: str):
    """Return a single chat record."""
    chat = db.get_chat(chat_id)
    if not chat:
        raise HTTPException(404, "Chat not found.")
    return chat


@app.post("/restore-context")
async def restore_context(file_id: str = Body(...)):
    """Restore context for a previous session into in-memory store."""
    ctx = db.get_context(file_id)
    if ctx:
        SESSION_CONTEXT[file_id] = {
            "chart_type": ctx.get("last_chart_type"),
            "x_column": ctx.get("last_x"),
            "y_column": ctx.get("last_y"),
            "custom_color": ctx.get("last_color"),
            "found_columns": ctx.get("found_columns", []),
        }
    return {"restored": bool(ctx), "file_id": file_id}


# ─── DASHBOARD ENDPOINT ────────────────────────────────────────────────────────

@app.get("/dashboard/{file_id}")
async def get_dashboard(file_id: str):
    """Generate quick multi-chart dashboard for a dataset."""
    metadata = _load_dataset(file_id)
    df = pd.read_csv(metadata["path"])
    return await _generate_dashboard_response(df, metadata, file_id)
