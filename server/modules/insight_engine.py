"""
insight_engine.py — AI Smart Insights Module for DataSight.
Generates automatic natural-language insights, KPIs, trend detection,
outlier detection, peak/trough analysis from Pandas DataFrames.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional


def _safe_pct_change(first: float, last: float) -> Optional[float]:
    if first == 0 or np.isnan(first) or np.isnan(last):
        return None
    return ((last - first) / abs(first)) * 100


def _detect_outliers_iqr(series: pd.Series) -> pd.Series:
    """Return mask of outlier rows using IQR method."""
    q1, q3 = series.quantile(0.25), series.quantile(0.75)
    iqr = q3 - q1
    return (series < q1 - 1.5 * iqr) | (series > q3 + 1.5 * iqr)


def _format_number(val: float) -> str:
    if abs(val) >= 1_000_000:
        return f"{val / 1_000_000:.2f}M"
    if abs(val) >= 1_000:
        return f"{val / 1_000:.1f}K"
    return f"{val:,.2f}"


def generate_insights(
    df: pd.DataFrame,
    intent: Dict[str, Any],
    chart_data: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """
    Generate AI-powered insights for a given dataset + intent.

    Returns:
        {
            "insights": [list of NL sentences],
            "summary":  "executive summary paragraph",
            "kpis":     {total, avg, max, min, count, std},
            "confidence": 0.0–1.0
        }
    """
    insights: List[str] = []
    x_col: Optional[str] = intent.get("x_column")
    y_col: Optional[str] = intent.get("y_column")
    chart_type: str = intent.get("chart_type", "bar")

    confidence = 0.5  # Start with baseline

    # ── 1. KPI Summary ───────────────────────────────────────────────────────
    kpis: Dict[str, Any] = {}
    numeric_col = y_col if y_col and y_col in df.columns and pd.api.types.is_numeric_dtype(df[y_col]) else None
    if not numeric_col:
        # Try to find any numeric column
        num_cols = df.select_dtypes(include=np.number).columns.tolist()
        numeric_col = num_cols[0] if num_cols else None

    if numeric_col:
        series = df[numeric_col].dropna()
        total = float(series.sum())
        avg = float(series.mean())
        mx = float(series.max())
        mn = float(series.min())
        count = int(series.count())
        std = float(series.std()) if count > 1 else 0.0

        kpis = {
            "column": numeric_col,
            "total":  round(total, 2),
            "average": round(avg, 2),
            "max":    round(mx, 2),
            "min":    round(mn, 2),
            "count":  count,
            "std_dev": round(std, 2),
        }
        confidence += 0.15

    # ── 2. Trend Detection (line / area) ─────────────────────────────────────
    if chart_type in ("line", "area") and chart_data and len(chart_data) >= 2:
        try:
            first_val = float(chart_data[0].get(y_col, 0))
            last_val  = float(chart_data[-1].get(y_col, 0))
            pct = _safe_pct_change(first_val, last_val)

            if pct is not None:
                direction = "increased" if pct > 0 else "decreased"
                abs_pct = abs(pct)

                # Peak detection
                values = [float(p.get(y_col, 0)) for p in chart_data if p.get(y_col) is not None]
                peak_idx = int(np.argmax(values))
                trough_idx = int(np.argmin(values))
                peak_label = chart_data[peak_idx].get(x_col, f"point {peak_idx+1}")
                trough_label = chart_data[trough_idx].get(x_col, f"point {trough_idx+1}")

                insights.append(
                    f"📈 {y_col} {direction} by {abs_pct:.1f}% from the first to the last period."
                )
                insights.append(
                    f"🔝 Peak value of {_format_number(values[peak_idx])} was reached at {peak_label}."
                )
                if peak_idx != trough_idx:
                    insights.append(
                        f"📉 Lowest value of {_format_number(values[trough_idx])} occurred at {trough_label}."
                    )
                confidence += 0.2
        except (TypeError, ValueError, KeyError):
            pass

    # ── 3. Bar Chart — Top/Bottom Insights ──────────────────────────────────
    elif chart_type in ("bar", "histogram") and chart_data and x_col and y_col:
        try:
            sorted_data = sorted(
                [p for p in chart_data if p.get(y_col) is not None],
                key=lambda p: float(p[y_col]), reverse=True
            )
            if sorted_data:
                top = sorted_data[0]
                bottom = sorted_data[-1]
                insights.append(
                    f"🏆 Highest: {top.get(x_col)} with {_format_number(float(top[y_col]))}."
                )
                if len(sorted_data) > 1:
                    insights.append(
                        f"⬇️ Lowest: {bottom.get(x_col)} with {_format_number(float(bottom[y_col]))}."
                    )

                # Spread insight
                if len(sorted_data) >= 3 and kpis:
                    spread = kpis["max"] - kpis["min"]
                    insights.append(
                        f"📊 Range spans {_format_number(spread)} — "
                        f"avg is {_format_number(kpis['average'])}."
                    )
                confidence += 0.15
        except (TypeError, ValueError, KeyError):
            pass

    # ── 4. Scatter — Correlation ─────────────────────────────────────────────
    elif chart_type == "scatter" and x_col and y_col:
        try:
            if (x_col in df.columns and y_col in df.columns
                    and pd.api.types.is_numeric_dtype(df[x_col])
                    and pd.api.types.is_numeric_dtype(df[y_col])):
                corr = float(df[x_col].corr(df[y_col]))
                if abs(corr) >= 0.7:
                    strength = "strong"
                elif abs(corr) >= 0.4:
                    strength = "moderate"
                else:
                    strength = "weak"
                direction_str = "positive" if corr >= 0 else "negative"
                insights.append(
                    f"🔗 {strength.capitalize()} {direction_str} correlation ({corr:.2f}) "
                    f"between {x_col} and {y_col}."
                )
                if corr > 0.7:
                    insights.append(
                        f"💡 As {x_col} increases, {y_col} tends to increase proportionally."
                    )
                elif corr < -0.7:
                    insights.append(
                        f"💡 As {x_col} increases, {y_col} tends to decrease proportionally."
                    )
                confidence += 0.2
        except Exception:
            pass

    # ── 5. Pie / Donut — Composition ─────────────────────────────────────────
    elif chart_type in ("pie", "donut") and chart_data and x_col and y_col:
        try:
            total = sum(float(p.get(y_col, 0)) for p in chart_data)
            if total > 0:
                sorted_pie = sorted(
                    [p for p in chart_data if p.get(y_col) is not None],
                    key=lambda p: float(p[y_col]), reverse=True
                )
                top_item = sorted_pie[0]
                top_pct = (float(top_item[y_col]) / total) * 100
                insights.append(
                    f"🥇 {top_item.get(x_col)} dominates with "
                    f"{top_pct:.1f}% share ({_format_number(float(top_item[y_col]))})."
                )
                if len(sorted_pie) >= 2:
                    top3_val = sum(float(p[y_col]) for p in sorted_pie[:3])
                    top3_pct = (top3_val / total) * 100
                    if top3_pct > 60:
                        insights.append(
                            f"📌 Top 3 categories account for {top3_pct:.1f}% of total."
                        )
                confidence += 0.15
        except (TypeError, ValueError, KeyError):
            pass

    # ── 6. Outlier Detection ─────────────────────────────────────────────────
    if numeric_col and numeric_col in df.columns:
        try:
            series = df[numeric_col].dropna()
            if len(series) >= 10:
                outlier_mask = _detect_outliers_iqr(series)
                outlier_count = int(outlier_mask.sum())
                if outlier_count > 0:
                    pct_outliers = (outlier_count / len(series)) * 100
                    insights.append(
                        f"⚠️ Detected {outlier_count} outlier(s) ({pct_outliers:.1f}%) "
                        f"in {numeric_col} using IQR method."
                    )
                    confidence += 0.05
        except Exception:
            pass

    # ── 7. Distribution Summary ──────────────────────────────────────────────
    if kpis and kpis.get("std_dev", 0) > 0:
        cv = (kpis["std_dev"] / abs(kpis["average"])) * 100 if kpis["average"] != 0 else 0
        if cv > 50:
            insights.append(
                f"📐 High variability in {numeric_col} (CV: {cv:.0f}%) — "
                f"data is widely spread around the mean."
            )
        elif cv < 15:
            insights.append(
                f"📐 Low variability in {numeric_col} (CV: {cv:.0f}%) — "
                f"values are tightly clustered around the mean."
            )

    # ── 8. Row count context ─────────────────────────────────────────────────
    insights.append(f"📁 Analysis based on {len(df):,} records across {len(df.columns)} columns.")

    # ── 9. Build Summary ─────────────────────────────────────────────────────
    if not insights:
        summary = f"Visualized {y_col or 'data'} by {x_col or 'category'} using a {chart_type} chart."
    else:
        summary = insights[0]
        if kpis:
            summary += (
                f" Total {kpis['column']}: {_format_number(kpis['total'])}, "
                f"Average: {_format_number(kpis['average'])}, "
                f"Max: {_format_number(kpis['max'])}."
            )

    # Clamp confidence
    confidence = min(0.98, max(0.4, confidence))

    return {
        "insights": insights,
        "summary": summary,
        "kpis": kpis,
        "confidence": round(confidence, 2),
    }
