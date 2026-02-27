"""
ml_engine.py — Machine Learning Module for DataSight.
Supports: Forecasting, Regression, Clustering, Classification.
Uses: scikit-learn (no heavy deps like Prophet or statsmodels required).
"""

import re
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional, List, Tuple

# Lazy imports to avoid crashing if scikit-learn not installed
try:
    from sklearn.linear_model import LinearRegression, LogisticRegression
    from sklearn.cluster import KMeans
    from sklearn.preprocessing import LabelEncoder, StandardScaler
    from sklearn.metrics import r2_score
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


# ─── INTENT DETECTION ────────────────────────────────────────────────────────

FORECAST_KEYWORDS = [
    "predict", "forecast", "next", "future", "upcoming", "projection",
    "estimate", "expected", "projection"
]
CLUSTER_KEYWORDS = [
    "cluster", "group", "segment", "kmeans", "categorize", "partition"
]
CLASSIFY_KEYWORDS = [
    "classify", "classification", "label", "categorize", "detect", "identify"
]
REGRESSION_KEYWORDS = [
    "regression", "linear", "relationship between", "based on", "depends on",
    "using", "from"
]


def detect_ml_intent(prompt: str) -> Optional[Dict[str, Any]]:
    """
    Detect if the prompt is asking for a machine learning operation.
    Returns dict with {"ml_type": ..., "n_periods": ..., "target": ...} or None.
    """
    pl = prompt.lower()

    # Forecast: "predict next 6 months sales"
    if any(kw in pl for kw in FORECAST_KEYWORDS):
        # Extract number of periods
        match = re.search(r"(\d+)\s*(month|week|day|year|period|quarter)", pl)
        n_periods = int(match.group(1)) if match else 6
        return {
            "ml_type": "forecast",
            "n_periods": n_periods,
            "description": f"Forecasting next {n_periods} period(s) using linear trend regression"
        }

    # Clustering
    if any(kw in pl for kw in CLUSTER_KEYWORDS):
        match = re.search(r"(\d+)\s*(cluster|group|segment)", pl)
        k = int(match.group(1)) if match else 3
        return {
            "ml_type": "cluster",
            "k": k,
            "description": f"K-Means clustering with {k} clusters"
        }

    # Classification
    if any(kw in pl for kw in CLASSIFY_KEYWORDS):
        return {
            "ml_type": "classify",
            "description": "Logistic regression classification"
        }

    # Regression: "predict salary based on experience"
    if any(kw in pl for kw in REGRESSION_KEYWORDS) and "predict" in pl:
        return {
            "ml_type": "regression",
            "description": "Linear regression prediction"
        }

    return None


# ─── ML EXECUTION ────────────────────────────────────────────────────────────

def run_ml(
    df: pd.DataFrame,
    ml_intent: Dict[str, Any],
    columns: List[str],
    x_col: Optional[str] = None,
    y_col: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute the ML operation defined by ml_intent.
    Returns chart-ready data + summary.
    """
    if not SKLEARN_AVAILABLE:
        return {
            "error": True,
            "message": "scikit-learn not installed. Run: pip install scikit-learn"
        }

    ml_type = ml_intent.get("ml_type")

    try:
        if ml_type == "forecast":
            return _run_forecast(df, ml_intent, x_col, y_col)
        elif ml_type == "cluster":
            return _run_clustering(df, ml_intent, columns, x_col, y_col)
        elif ml_type == "regression":
            return _run_regression(df, x_col, y_col)
        elif ml_type == "classify":
            return _run_classification(df, x_col, y_col)
        else:
            return {"error": True, "message": f"Unknown ML type: {ml_type}"}
    except Exception as e:
        return {"error": True, "message": f"ML error: {str(e)}"}


def _run_forecast(
    df: pd.DataFrame,
    ml_intent: Dict,
    x_col: Optional[str],
    y_col: Optional[str],
) -> Dict[str, Any]:
    """Linear trend forecasting."""
    n_periods = ml_intent.get("n_periods", 6)

    # Auto-pick y_col (first numeric column)
    if not y_col or y_col not in df.columns:
        num_cols = df.select_dtypes(include=np.number).columns.tolist()
        if not num_cols:
            return {"error": True, "message": "No numeric column found for forecasting."}
        y_col = num_cols[0]

    # Try to parse x_col as dates, else use index
    use_dates = False
    date_labels = []
    if x_col and x_col in df.columns:
        try:
            dates = pd.to_datetime(df[x_col])
            df = df.copy()
            df[x_col] = dates
            df = df.sort_values(x_col)
            use_dates = True
            date_labels = df[x_col].dt.strftime("%Y-%m-%d").tolist()
        except Exception:
            pass

    # Aggregate for trend if needed
    if use_dates:
        grouped = df.groupby(x_col)[y_col].sum().reset_index()
        X = np.arange(len(grouped)).reshape(-1, 1)
        y = grouped[y_col].values.astype(float)
        labels = grouped[x_col].dt.strftime("%Y-%m-%d").tolist()
    else:
        if y_col in df.columns:
            series = df[y_col].dropna().values.astype(float)
        else:
            return {"error": True, "message": f"Column '{y_col}' not found."}
        X = np.arange(len(series)).reshape(-1, 1)
        y = series
        labels = [f"Period {i+1}" for i in range(len(y))]

    # Fit linear regression
    model = LinearRegression()
    model.fit(X, y)
    r2 = float(r2_score(y, model.predict(X)))

    # Historical predictions (fitted)
    historical = [
        {"label": lbl, "actual": float(val), "predicted": float(model.predict([[i]])[0]), "type": "historical"}
        for i, (lbl, val) in enumerate(zip(labels, y))
    ]

    # Future predictions
    last_idx = len(y)
    future = []
    for i in range(n_periods):
        pred_val = float(model.predict([[last_idx + i]])[0])
        if use_dates and labels:
            try:
                last_date = pd.to_datetime(labels[-1])
                freq_days = (pd.to_datetime(labels[-1]) - pd.to_datetime(labels[0])).days // max(len(labels) - 1, 1)
                future_date = last_date + pd.Timedelta(days=freq_days * (i + 1))
                lbl = future_date.strftime("%Y-%m-%d")
            except Exception:
                lbl = f"Future {i+1}"
        else:
            lbl = f"Period {last_idx + i + 1}"
        future.append({"label": lbl, "predicted": max(0, pred_val), "type": "forecast"})

    all_data = historical + future

    # Build summary
    trend_dir = "upward" if model.coef_[0] > 0 else "downward"
    summary = (
        f"Linear trend forecast for '{y_col}': {trend_dir} trend detected "
        f"(slope: {model.coef_[0]:+.2f} per period, R²: {r2:.2f}). "
        f"Projected next {n_periods} period(s) added."
    )

    return {
        "ml_type": "forecast",
        "chart_type": "line",
        "x_key": "label",
        "y_key": "predicted",
        "actual_key": "actual",
        "data": all_data,
        "summary": summary,
        "r2_score": round(r2, 3),
        "slope": round(float(model.coef_[0]), 4),
        "n_periods": n_periods,
        "target_column": y_col,
        "error": False,
    }


def _run_clustering(
    df: pd.DataFrame,
    ml_intent: Dict,
    columns: List[str],
    x_col: Optional[str],
    y_col: Optional[str],
) -> Dict[str, Any]:
    """KMeans clustering on numeric columns."""
    k = ml_intent.get("k", 3)

    # Use x and y if both numeric, else pick 2 best numeric columns
    num_cols = df.select_dtypes(include=np.number).columns.tolist()
    if len(num_cols) < 2:
        return {"error": True, "message": "Need at least 2 numeric columns for clustering."}

    feat_cols = []
    if x_col and x_col in num_cols:
        feat_cols.append(x_col)
    if y_col and y_col in num_cols and y_col not in feat_cols:
        feat_cols.append(y_col)
    while len(feat_cols) < 2 and num_cols:
        c = num_cols.pop(0)
        if c not in feat_cols:
            feat_cols.append(c)

    sample = df[feat_cols].dropna().sample(min(500, len(df)), random_state=42)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(sample)

    kmeans = KMeans(n_clusters=min(k, len(sample)), random_state=42, n_init=10)
    labels = kmeans.fit_predict(X_scaled)

    result_data = []
    for i, row in enumerate(sample.itertuples(index=False)):
        result_data.append({
            feat_cols[0]: float(getattr(row, feat_cols[0])),
            feat_cols[1]: float(getattr(row, feat_cols[1])),
            "cluster": f"Cluster {labels[i] + 1}",
        })

    # Cluster sizes
    unique, counts = np.unique(labels, return_counts=True)
    cluster_sizes = {f"Cluster {u+1}": int(c) for u, c in zip(unique, counts)}

    summary = (
        f"K-Means clustering ({k} clusters) on '{feat_cols[0]}' vs '{feat_cols[1]}'. "
        f"Cluster sizes: {cluster_sizes}."
    )

    return {
        "ml_type": "cluster",
        "chart_type": "scatter",
        "x_key": feat_cols[0],
        "y_key": feat_cols[1],
        "color_key": "cluster",
        "data": result_data,
        "cluster_sizes": cluster_sizes,
        "summary": summary,
        "features": feat_cols,
        "error": False,
    }


def _run_regression(
    df: pd.DataFrame,
    x_col: Optional[str],
    y_col: Optional[str],
) -> Dict[str, Any]:
    """Simple linear regression: predict y from x."""
    num_cols = df.select_dtypes(include=np.number).columns.tolist()
    if not x_col or x_col not in num_cols:
        x_col = num_cols[0] if num_cols else None
    if not y_col or y_col not in num_cols:
        y_col = num_cols[1] if len(num_cols) >= 2 else None

    if not x_col or not y_col:
        return {"error": True, "message": "Need 2 numeric columns for regression."}

    clean = df[[x_col, y_col]].dropna()
    X = clean[x_col].values.reshape(-1, 1)
    y = clean[y_col].values.astype(float)

    model = LinearRegression()
    model.fit(X, y)
    r2 = float(r2_score(y, model.predict(X)))

    # Build regression line across range
    x_min, x_max = float(X.min()), float(X.max())
    line_x = np.linspace(x_min, x_max, 50)
    line_y = model.predict(line_x.reshape(-1, 1))

    scatter_data = [
        {x_col: float(row[0]), y_col: float(row[1]), "type": "actual"}
        for row in clean[[x_col, y_col]].values[:200]
    ]
    line_data = [
        {x_col: float(lx), "regression_line": float(ly), "type": "predicted"}
        for lx, ly in zip(line_x, line_y)
    ]

    summary = (
        f"Linear regression: {y_col} = {model.coef_[0]:.3f} × {x_col} + {model.intercept_:.2f}. "
        f"R² = {r2:.3f} — model explains {r2*100:.1f}% of variance."
    )

    return {
        "ml_type": "regression",
        "chart_type": "scatter",
        "x_key": x_col,
        "y_key": y_col,
        "data": scatter_data,
        "line_data": line_data,
        "r2_score": round(r2, 3),
        "slope": round(float(model.coef_[0]), 4),
        "intercept": round(float(model.intercept_), 4),
        "summary": summary,
        "error": False,
    }


def _run_classification(
    df: pd.DataFrame,
    x_col: Optional[str],
    y_col: Optional[str],
) -> Dict[str, Any]:
    """Simple classification report using logistic regression."""
    num_cols = df.select_dtypes(include=np.number).columns.tolist()
    cat_cols = df.select_dtypes(include="object").columns.tolist()

    target_col = y_col if y_col and y_col in cat_cols else (cat_cols[0] if cat_cols else None)
    feature_col = x_col if x_col and x_col in num_cols else (num_cols[0] if num_cols else None)

    if not target_col or not feature_col:
        return {"error": True, "message": "Need a numeric feature and a categorical target for classification."}

    clean = df[[feature_col, target_col]].dropna()
    le = LabelEncoder()
    y_encoded = le.fit_transform(clean[target_col])
    X = clean[feature_col].values.reshape(-1, 1)

    model = LogisticRegression(max_iter=1000)
    model.fit(X, y_encoded)
    accuracy = float(model.score(X, y_encoded))

    class_counts = clean[target_col].value_counts().to_dict()
    result_data = [{"category": k, "count": int(v)} for k, v in class_counts.items()]

    summary = (
        f"Logistic classification on '{target_col}' from '{feature_col}'. "
        f"Model accuracy: {accuracy*100:.1f}%. "
        f"Classes: {', '.join(le.classes_[:5])}."
    )

    return {
        "ml_type": "classify",
        "chart_type": "bar",
        "x_key": "category",
        "y_key": "count",
        "data": result_data,
        "accuracy": round(accuracy, 3),
        "classes": list(le.classes_),
        "summary": summary,
        "error": False,
    }
