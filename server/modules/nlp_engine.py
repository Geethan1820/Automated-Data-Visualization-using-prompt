"""
nlp_engine.py — Upgraded NLP Engine for DataSight.
Enhancements: aggregation detection, ML intent passthrough, 
dashboard intent, confidence scoring, time filter detection.
"""

import re
from typing import Optional, Dict, Any, List
from thefuzz import process, fuzz

# ─── KEYWORD MAPS ─────────────────────────────────────────────────────────────

CHART_KEYWORDS: Dict[str, List[str]] = {
    "pie":       ["pie", "composition", "share", "percentage", "proportion"],
    "donut":     ["donut", "doughnut", "ring"],
    "bar":       ["bar", "ranking", "comparison", "highest", "lowest", "top", "bottom", "best", "worst"],
    "line":      ["line", "trend", "over time", "growth", "fluctuation", "timeline", "progression"],
    "area":      ["area", "cumulative", "filled"],
    "scatter":   ["scatter", "correlation", "relationship", "vs", "versus", "compare"],
    "histogram": ["histogram", "distribution", "frequency", "spread", "bell"],
    "heatmap":   ["heatmap", "matrix", "intensity", "heat"],
    "box":       ["box", "outliers", "quartile", "range", "whisker"],
    "radar":     ["radar", "spider", "web", "polygon", "radial"],
    "treemap":   ["treemap", "tree map", "hierarchy", "nested"],
    "funnel":    ["funnel", "conversion", "pipeline", "stages"],
    "bubble":    ["bubble", "sized", "three variables"],
}

AGGREGATION_KEYWORDS: Dict[str, List[str]] = {
    "sum":   ["total", "sum", "cumulative", "overall", "aggregate"],
    "avg":   ["average", "mean", "avg"],
    "count": ["count", "number of", "how many", "frequency", "occurrences"],
    "max":   ["max", "maximum", "highest", "largest", "greatest", "top"],
    "min":   ["min", "minimum", "lowest", "smallest", "least"],
}

DASHBOARD_KEYWORDS = [
    "dashboard", "overview", "summary", "show all", "give me all",
    "full report", "all charts", "quick view", "entire dataset"
]

TIME_KEYWORDS = ["date", "time", "year", "month", "day", "quarter", "week", "period"]


# ─── DETECTION HELPERS ────────────────────────────────────────────────────────

def detect_chart_type_strict(prompt_lower: str) -> Optional[str]:
    """Detect explicitly named chart type (e.g., 'show me a pie chart')."""
    for chart, keywords in CHART_KEYWORDS.items():
        if (f"{chart} chart" in prompt_lower
                or f"{chart} plot" in prompt_lower
                or f"{chart} graph" in prompt_lower):
            return chart
        # Also check exact chart name alone
        if chart in prompt_lower:
            return chart
    return None


def detect_intent_chart(prompt_lower: str) -> str:
    """Keyword-based chart type detection with scoring."""
    scores: Dict[str, int] = {}
    for chart, keywords in CHART_KEYWORDS.items():
        for kw in keywords:
            if kw in prompt_lower:
                scores[chart] = scores.get(chart, 0) + 1
    if scores:
        return max(scores, key=lambda k: scores[k])
    return "bar"


def detect_aggregation(prompt_lower: str) -> str:
    """Detect SUM/AVG/COUNT/MAX/MIN from prompt keywords."""
    for agg, keywords in AGGREGATION_KEYWORDS.items():
        if any(kw in prompt_lower for kw in keywords):
            return agg
    return "sum"  # Default


def detect_dashboard_intent(prompt_lower: str) -> bool:
    """Return True if user is asking for a dashboard/overview."""
    return any(kw in prompt_lower for kw in DASHBOARD_KEYWORDS)


def _extract_year_filter(prompt_lower: str) -> Optional[int]:
    """Parse a 4-digit year mention from prompt (e.g., 'filter 2023')."""
    match = re.search(r"\b(20\d{2})\b", prompt_lower)
    return int(match.group(1)) if match else None


def _compute_column_confidence(found_cols: List[str], columns: List[str]) -> float:
    """Estimate confidence based on how well columns were matched."""
    if not found_cols:
        return 0.3
    # Check if found_cols are exact matches
    exact = sum(1 for c in found_cols if c in columns)
    return min(0.95, 0.5 + (exact / max(len(columns), 1)) * 0.5)


# ─── FOLLOW-UP DETECTION ──────────────────────────────────────────────────────

CHANGE_SIGNALS = [
    "change", "switch", "convert", "make it", "show as", "use",
    "try", "display as", "turn into", "transform", "modify",
    "update to", "set to", "change to", "switch to", "convert to",
]


def _is_followup_prompt(prompt_lower: str) -> bool:
    """Detect if the prompt is a follow-up that modifies a previous chart
    (e.g., 'change to line chart', 'make it red', 'switch to bar')."""
    return any(signal in prompt_lower for signal in CHANGE_SIGNALS)


# ─── MAIN PARSE FUNCTION ──────────────────────────────────────────────────────

def parse_prompt(
    prompt: str,
    columns: List[str],
    last_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Enhanced intent parsing with:
    - Fuzzy column matching (thefuzz)
    - Aggregation detection (SUM/AVG/COUNT/MIN/MAX)
    - Dashboard intent detection
    - ML intent passthrough marker
    - Confidence scoring
    - Time filter extraction
    - Follow-up context memory
    """
    prompt_lower = prompt.lower().strip()

    # ── 1. Dashboard intent check ─────────────────────────────────────────────
    is_dashboard = detect_dashboard_intent(prompt_lower)

    # ── 2. Detect if this is a follow-up / modification prompt ────────────────
    is_followup = _is_followup_prompt(prompt_lower)

    # ── 3. Fuzzy column matching ──────────────────────────────────────────────
    found_cols: List[str] = []
    confidence_threshold = 75
    sorted_columns = sorted(columns, key=len, reverse=True)

    for col in sorted_columns:
        if col.lower() in prompt_lower:
            found_cols.append(col)
            continue
        score = fuzz.partial_ratio(col.lower(), prompt_lower)
        if score > confidence_threshold:
            found_cols.append(col)

    found_cols = list(dict.fromkeys(found_cols))  # Deduplicate, preserve order

    # ── 4. Color detection ────────────────────────────────────────────────────
    custom_color: Optional[str] = None
    colors = [
        "red", "blue", "green", "yellow", "purple", "orange",
        "black", "white", "gray", "pink", "cyan", "magenta", "teal", "indigo"
    ]
    for color in colors:
        if color in prompt_lower:
            custom_color = color
            break

    # ── 5. Aggregation detection ──────────────────────────────────────────────
    aggregation = detect_aggregation(prompt_lower)

    # ── 6. Time filter ────────────────────────────────────────────────────────
    year_filter = _extract_year_filter(prompt_lower)

    # ── 7. Chart type detection ───────────────────────────────────────────────
    explicit_chart = detect_chart_type_strict(prompt_lower)
    is_explicit = bool(explicit_chart)
    chart_type = explicit_chart or None
    reasoning = ""

    if explicit_chart:
        reasoning = f"You explicitly requested a {explicit_chart} chart."
    
    if not chart_type:
        detected = detect_intent_chart(prompt_lower)
        chart_type = detected

    # ── 8. Context memory (carry-over from previous query) ────────────────────
    x_col: Optional[str] = None
    y_col: Optional[str] = None
    used_context = False

    time_cols = [c for c in columns if any(k in c.lower() for k in TIME_KEYWORDS)]

    if last_context:
        prev_found = last_context.get("found_columns") or []
        prev_x = last_context.get("x_column")
        prev_y = last_context.get("y_column")

        # Carry over columns when no new columns were found in the prompt,
        # OR when this is a follow-up / modification prompt (e.g. "change to line chart")
        if prev_found and (not found_cols or (is_followup and not found_cols)):
            found_cols = list(prev_found)  # copy to avoid mutating context
            x_col = prev_x
            y_col = prev_y
            used_context = True
            reasoning += " Kept previous data columns from context."

        # Carry over chart type ONLY if no explicit/new chart was detected
        if not explicit_chart and last_context.get("chart_type"):
            if is_followup or not found_cols:
                chart_type = last_context["chart_type"]
                reasoning += f" Maintained {chart_type} chart type from context."

        # Carry over color if not explicitly changed
        if not custom_color and last_context.get("custom_color"):
            custom_color = last_context["custom_color"]

    # ── 9. Re-assign x/y when chart type changed but columns came from context ─
    #    e.g. previous was scatter (x=Sales, y=Profit), now user wants line chart
    if used_context and explicit_chart and x_col and y_col:
        # The chart type changed; re-evaluate x/y for the new chart type
        if explicit_chart in ("line", "area"):
            # Prefer a time column as x-axis for line/area charts
            potential_time = [c for c in found_cols if c in time_cols]
            if potential_time:
                x_col = potential_time[0]
                y_col = next((c for c in found_cols if c != x_col), y_col)
                reasoning += f" Auto-selected time column '{x_col}' for {explicit_chart} chart."

    # ── 10. Smart chart type refinement ───────────────────────────────────────
    if not is_explicit:
        if "over time" in prompt_lower or "trend" in prompt_lower or "growth" in prompt_lower:
            chart_type = "line"
            reasoning = "Line chart selected: time-series trend detected."
            if time_cols and not any(c in found_cols for c in time_cols):
                found_cols.insert(0, time_cols[0])
                reasoning += f" Auto-selected time column '{time_cols[0]}'."
        elif aggregation == "count" and not chart_type:
            chart_type = "bar"
            reasoning = "Bar chart selected for count aggregation."
        elif not chart_type:
            chart_type = "bar"
            reasoning = f"Bar chart selected as default based on prompt context."

    # ── 11. X/Y column assignment (only if not already set from context) ──────
    if not x_col or not y_col:
        if len(found_cols) >= 2:
            if chart_type in ("line", "area"):
                potential_time = [c for c in found_cols if c in time_cols]
                if potential_time:
                    x_col = potential_time[0]
                    y_col = next((c for c in found_cols if c != x_col), found_cols[1])
                else:
                    x_col, y_col = found_cols[0], found_cols[1]
            else:
                x_col, y_col = found_cols[0], found_cols[1]
        elif len(found_cols) == 1:
            col = found_cols[0]
            if chart_type in ("histogram", "box"):
                x_col = col
            else:
                x_col = col
                y_col = "count"

    # ── 12. Reasoning suffix ──────────────────────────────────────────────────
    if x_col and y_col and y_col != "count":
        reasoning += f" Showing '{y_col}' ({aggregation}) grouped by '{x_col}'."
    elif x_col:
        reasoning += f" Counting records by '{x_col}'."

    # ── 13. Confidence score ──────────────────────────────────────────────────
    confidence = _compute_column_confidence(found_cols, columns)
    if is_explicit:
        confidence = min(0.99, confidence + 0.1)
    if aggregation != "sum":
        confidence = min(0.99, confidence + 0.05)
    if used_context:
        confidence = min(0.99, confidence + 0.05)

    return {
        "intent": "plot",
        "chart_type": chart_type,
        "x_column": x_col,
        "y_column": y_col,
        "found_columns": found_cols,
        "original_prompt": prompt,
        "is_explicit": is_explicit,
        "is_dashboard": is_dashboard,
        "is_followup": is_followup,
        "aggregation": aggregation,
        "year_filter": year_filter,
        "reasoning": reasoning.strip(),
        "custom_color": custom_color,
        "confidence": round(confidence, 2),
    }
