"""
data_processor.py — Enhanced Data Quality Engine for DataSight.
Real quality scoring, outlier detection, and health recommendations.
"""

import pandas as pd
import numpy as np
from typing import Tuple, Dict, Any, List


def clean_dataset(df: pd.DataFrame) -> pd.DataFrame:
    """
    Perform comprehensive cleaning:
    - Remove exact duplicates
    - Strip whitespace from string columns
    - Attempt numeric coercion for columns that look numeric
    - Fill missing numeric values with median (more robust than mean)
    - Fill missing categorical values with mode or 'Unknown'
    """
    # Strip whitespace from string columns
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].astype(str).str.strip()
        df[col] = df[col].replace("nan", np.nan)

    # Remove exact duplicates
    before = len(df)
    df = df.drop_duplicates()

    # Attempt to coerce string columns that look numeric
    for col in df.select_dtypes(include="object").columns:
        try:
            cleaned = df[col].str.replace(r"[,\$\£\€%]", "", regex=True).str.strip()
            converted = pd.to_numeric(cleaned, errors="coerce")
            non_null_pct = converted.notna().mean()
            if non_null_pct > 0.8:  # If 80%+ values are numeric, convert
                df[col] = converted
        except Exception:
            pass

    # Fill missing values
    for col in df.columns:
        if pd.api.types.is_numeric_dtype(df[col]):
            median_val = df[col].median()
            if pd.isna(median_val):
                df[col] = df[col].fillna(0)
            else:
                df[col] = df[col].fillna(median_val)
        else:
            if df[col].notna().any():
                mode_val = df[col].mode()
                if len(mode_val) > 0:
                    df[col] = df[col].fillna(mode_val.iloc[0])
                else:
                    df[col] = df[col].fillna("Unknown")
            else:
                df[col] = df[col].fillna("Unknown")

    return df


def calculate_quality_score(
    raw_df: pd.DataFrame,
    clean_df: pd.DataFrame,
) -> Tuple[int, Dict[str, Any]]:
    """
    Calculate a real 0–100 quality score and recommendations.

    Scoring breakdown:
      - Completeness (no missing values):   40 points
      - Uniqueness (no duplicates):         20 points
      - Consistency (type uniformity):      20 points
      - Volume (enough rows for analysis):  20 points

    Returns:
        (score: int, report: dict)
    """
    report: Dict[str, Any] = {}
    recommendations: List[str] = []
    score = 100

    total_cells = raw_df.shape[0] * raw_df.shape[1]

    # ── Completeness ─────────────────────────────────────────────────────────
    total_missing = int(raw_df.isnull().sum().sum())
    missing_pct = (total_missing / total_cells * 100) if total_cells > 0 else 0
    completeness_score = max(0, 40 - int(missing_pct * 2))

    report["missing_cells"] = total_missing
    report["missing_pct"] = round(missing_pct, 2)
    if missing_pct > 10:
        recommendations.append(f"⚠️ {missing_pct:.1f}% missing values detected. Consider imputation or removal.")
    elif missing_pct > 0:
        recommendations.append(f"✅ Minor missing data ({missing_pct:.1f}%) — auto-filled with median/mode.")

    # ── Uniqueness ───────────────────────────────────────────────────────────
    duplicate_rows = int(raw_df.duplicated().sum())
    dup_pct = (duplicate_rows / len(raw_df) * 100) if len(raw_df) > 0 else 0
    uniqueness_score = max(0, 20 - int(dup_pct * 2))

    report["duplicate_rows"] = duplicate_rows
    report["duplicate_pct"] = round(dup_pct, 2)
    if duplicate_rows > 0:
        recommendations.append(f"🔁 {duplicate_rows} duplicate row(s) removed during cleaning.")

    # ── Consistency ───────────────────────────────────────────────────────────
    inconsistent_cols = 0
    col_types: List[Dict] = []
    for col in raw_df.columns:
        dtype = str(raw_df[col].dtype)
        col_types.append({"name": col, "dtype": dtype})
        # Check if object columns have mostly numeric content (inconsistency)
        if raw_df[col].dtype == object:
            try:
                numeric_count = pd.to_numeric(
                    raw_df[col].astype(str).str.replace(r"[,\$\£\€%]", "", regex=True),
                    errors="coerce"
                ).notna().sum()
                if 0 < numeric_count < len(raw_df) * 0.9:
                    inconsistent_cols += 1
            except Exception:
                pass

    consistency_score = max(0, 20 - inconsistent_cols * 3)
    report["inconsistent_columns"] = inconsistent_cols
    if inconsistent_cols > 0:
        recommendations.append(f"🔢 {inconsistent_cols} column(s) have mixed data types. Check for formatting issues.")

    # ── Volume ────────────────────────────────────────────────────────────────
    row_count = len(raw_df)
    if row_count >= 1000:
        volume_score = 20
    elif row_count >= 100:
        volume_score = 15
    elif row_count >= 20:
        volume_score = 10
    else:
        volume_score = 5
        recommendations.append("📉 Small dataset (<20 rows). Analysis may be limited.")

    report["row_count"] = row_count
    report["column_count"] = len(raw_df.columns)

    # ── Final Score ───────────────────────────────────────────────────────────
    total_score = completeness_score + uniqueness_score + consistency_score + volume_score
    total_score = max(0, min(100, total_score))

    if not recommendations:
        recommendations.append("✅ Dataset looks clean and ready for analysis!")

    report["recommendations"] = recommendations
    report["breakdown"] = {
        "completeness": completeness_score,
        "uniqueness": uniqueness_score,
        "consistency": consistency_score,
        "volume": volume_score,
    }

    return total_score, report


def detect_column_types(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """Returns per-column type details for the DataPreview."""
    result = []
    for col in df.columns:
        dtype = str(df[col].dtype)
        is_time = False
        try:
            pd.to_datetime(df[col], errors="raise")
            is_time = True
        except Exception:
            pass

        result.append({
            "name": col,
            "dtype": dtype,
            "is_numeric": pd.api.types.is_numeric_dtype(df[col]),
            "is_datetime": is_time,
            "unique_count": int(df[col].nunique()),
            "missing": int(df[col].isnull().sum()),
        })
    return result
