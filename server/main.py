from fastapi import FastAPI, UploadFile, File, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import os
import shutil
import uuid
from modules.data_processor import clean_dataset, calculate_quality_score
from modules.nlp_engine import parse_prompt

app = FastAPI(title="DataSight API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex="https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "../data"
os.makedirs(UPLOAD_DIR, exist_ok=True)
DATASETS = {}

@app.get("/")
def read_root():
    return {"message": "DataSight Backend is Running"}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_id = str(uuid.uuid4())
        file_ext = file.filename.split(".")[-1]
        file_path = os.path.join(UPLOAD_DIR, f"{file_id}.{file_ext}")
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        if file_ext == "csv":
            df = pd.read_csv(file_path)
        elif file_ext in ["xlsx", "xls"]:
            df = pd.read_excel(file_path)
        else:
            return {"error": "Unsupported file format"}
            
        raw_stats = {
            "rows": len(df),
            "columns": len(df.columns),
            "missing_count": int(df.isnull().sum().sum()),
        }

        df_clean = clean_dataset(df)
        score = calculate_quality_score(df_clean, raw_stats["rows"])
        
        clean_path = os.path.join(UPLOAD_DIR, f"{file_id}_clean.csv")
        df_clean.to_csv(clean_path, index=False)
        
        column_details = []
        for col in df_clean.columns:
            column_details.append({
                "name": col,
                "type": str(df_clean[col].dtype),
                "missing": int(df[col].isnull().sum())
            })

        DATASETS[file_id] = {
            "filename": file.filename,
            "columns": df_clean.columns.tolist(),
            "path": clean_path,
            "score": score,
            "column_details": column_details,
            "stats": raw_stats # Store stats
        }
        
        return {
            "file_id": file_id,
            "filename": file.filename,
            "columns": df_clean.columns.tolist(),
            "score": score,
            "stats": raw_stats,
            "column_details": column_details,
            "preview": df_clean.head(10).replace({np.nan: None}).to_dict(orient="records")
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


SESSION_CONTEXT = {}

@app.post("/query")
async def process_query(prompt: str = Body(...), file_id: str = Body(...)):
    if file_id not in DATASETS:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    metadata = DATASETS[file_id]
    df = pd.read_csv(metadata["path"])
    
    # Context Logic
    last_context = SESSION_CONTEXT.get(file_id)
    intent_data = parse_prompt(prompt, metadata["columns"], last_context=last_context)
    
    if not intent_data["found_columns"] and not intent_data.get("custom_color"):
        # Allow pass-thru if just color change
        return {
            "error": True,
            "message": "I couldn't identify any relevant columns. Please specify column names.",
            "suggestions": [f"Visualisation for {c}" for c in metadata["columns"][:3]]
        }

    chart_data = []
    x_col = intent_data.get("x_column")
    y_col = intent_data.get("y_column")
    chart_type = intent_data["chart_type"]
    custom_color = intent_data.get("custom_color")
    
    try:
        # Suitability Check Logic
        is_numeric_x = pd.api.types.is_numeric_dtype(df[x_col]) if x_col else False
        is_numeric_y = pd.api.types.is_numeric_dtype(df[y_col]) if y_col else False
        
        # Explicit request validation
        if intent_data.get("is_explicit"):
            valid = True
            error_msg = ""
            
            if chart_type in ["line", "area", "scatter"] and not x_col:
                 valid = False
                 error_msg = f"{chart_type.title()} chart requires an X-axis column (usually time or numeric)."
            elif chart_type in ["pie", "donut"] and (not x_col or not y_col):
                 valid = False
                 error_msg = f"{chart_type.title()} chart requires both a category (X) and a value (Y) column."
            elif chart_type == "histogram" and not is_numeric_x:
                 valid = False
                 error_msg = "Histogram requires a numeric X-axis column."
            
            if not valid:
                return {
                    "error": True, 
                    "message": f"Cannot generate {chart_type} chart: {error_msg}. {intent_data['reasoning']}",
                    "suggestions": ["Try a different chart type", "Check column names"]
                }

        # Data Generation logic
        chart_data = []
        insights = []
        
        if chart_type == "histogram" and x_col:
            if is_numeric_x:
                counts, bins = np.histogram(df[x_col].dropna(), bins=10)
                chart_data = [{"bin": f"{int(bins[i])}-{int(bins[i+1])}", "count": int(counts[i])} for i in range(len(counts))]
                intent_data["x_column"] = "bin"
                intent_data["y_column"] = "count"
                insights.append(f"Most data points fall in the {chart_data[np.argmax(counts)]['bin']} range.")
            else:
                 return {"error": True, "message": "Histogram requires numeric data."}

        elif chart_type == "scatter" and x_col and y_col:
             sample_df = df[[x_col, y_col]].dropna().sample(min(100, len(df)))
             chart_data = sample_df.to_dict(orient="records")
             correlation = df[x_col].corr(df[y_col], method='pearson') if is_numeric_x and is_numeric_y else 0
             insights.append(f"Correlation: {correlation:.2f} (1 is perfect positive, -1 is perfect negative).")

        elif chart_type in ["line", "area"] and x_col and y_col:
             # Time Series Handling
             # Check if X is likely date, try to convert
             try:
                 df[x_col] = pd.to_datetime(df[x_col])
                 grouped = df.groupby(x_col)[y_col].sum().reset_index()
                 grouped = grouped.sort_values(x_col)
                 # Reformat date for JSON
                 grouped[x_col] = grouped[x_col].dt.strftime('%Y-%m-%d')
             except:
                 # If not date, treat as standard numerical/categorical sort
                 grouped = df.groupby(x_col)[y_col].sum().reset_index()
                 if is_numeric_x:
                    grouped = grouped.sort_values(x_col)
                 
             chart_data = grouped.to_dict(orient="records")
             
             # Trend Insight
             if len(chart_data) > 1:
                 first = chart_data[0][y_col]
                 last = chart_data[-1][y_col]
                 change = ((last - first) / first) * 100 if first != 0 else 0
                 insights.append(f"Overall trend: {change:.1f}% change from start to end.")

        elif x_col and y_col:
            # Bar, Pie, Donut, Heatmap (simplified as Bar for now or similar aggregation)
            if is_numeric_y:
                 grouped = df.groupby(x_col)[y_col].sum().reset_index()
                 grouped = grouped.sort_values(y_col, ascending=False)
                 
                 if chart_type in ["bar", "pie", "donut"] and len(grouped) > 20:
                     grouped = grouped.head(20)
                     
                 chart_data = grouped.to_dict(orient="records")
                 
                 # Min/Max Insight
                 max_val = grouped.iloc[0]
                 insights.append(f"Highest value: {max_val[x_col]} ({max_val[y_col]}).")
            else:
                 # If both are categorical, we usually want to count occurrences of x_col
                 # or count occurrences of y_col per x_col. 
                 # For a simple Bar chart, grouping by x_col only is often what's intended.
                 grouped = df.groupby(x_col).size().reset_index(name='count')
                 intent_data['y_column'] = 'count'
                 chart_data = grouped.sort_values('count', ascending=False).head(20).to_dict(orient="records")
                 insights.append(f"Counted occurrences of items per '{x_col}'.")

        elif x_col:
             # Single column fallback
             grouped = df[x_col].value_counts().reset_index()
             grouped.columns = [x_col, "count"]
             chart_data = grouped.head(10).to_dict(orient="records")
             intent_data["y_column"] = "count"
             insights.append(f"Top category: {grouped.iloc[0][x_col]} with {grouped.iloc[0]['count']} occurrences.")

        # Update Context Memory
        SESSION_CONTEXT[file_id] = {
             "chart_type": chart_type,
             "x_column": x_col,
             "y_column": y_col,
             "found_columns": intent_data["found_columns"],
             "custom_color": custom_color or intent_data.get("custom_color")
        }

        return {
            "intent": intent_data,
            "chart_data": chart_data,
            "summary": f"Generated {chart_type} chart. {intent_data.get('reasoning', '')}",
            "insights": insights,
            "custom_color": custom_color,
            "error": False
        }
    except Exception as e:
        print(f"Error: {e}")
        return {
            "error": True,
            "message": f"Couldn't generate chart: {str(e)}",
            "suggestions": ["Check your column names", "Try a simpler query"]
        }
