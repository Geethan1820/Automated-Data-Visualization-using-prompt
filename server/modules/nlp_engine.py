import re
from thefuzz import process, fuzz

CHART_KEYWORDS = {
    "pie": ["pie", "composition", "share", "percentage"],
    "donut": ["donut", "doughnut"],
    "bar": ["bar", "ranking", "comparison", "highest", "lowest", "top"],
    "line": ["line", "trend", "over time", "growth", "fluctuation", "timeline"],
    "area": ["area", "cumulative"],
    "scatter": ["scatter", "correlation", "relationship", "vs", "versus"],
    "histogram": ["histogram", "distribution", "frequency", "spread"],
    "heatmap": ["heatmap", "matrix", "intensity"],
    "box": ["box", "outliers", "quartile", "range"]
}

def detect_chart_type_strict(prompt_lower):
    """Detects if the user explicitly requested a specific chart type."""
    for chart, keywords in CHART_KEYWORDS.items():
        # strict check: the chart name strictly needs to be in the prompt or very strong keywords
        # e.g., "show me a pie chart" -> explicit. "show me share" -> fuzzy/intent based.
        # We prioritize the explicit chart name usually.
        if f"{chart} chart" in prompt_lower or f"{chart} plot" in prompt_lower or f"{chart} graph" in prompt_lower:
            return chart
    return None

def detect_intent_chart(prompt_lower):
    """Detects chart type based on intense/keywords if no strict type found."""
    for chart, keywords in CHART_KEYWORDS.items():
        for kw in keywords:
            if kw in prompt_lower:
                return chart
    return "bar" # Default

def parse_prompt(prompt: str, columns: list, last_context: dict = None):
    """
    Enhanced intent detection with strict selection, reasoning, time-series awareness, and context memory.
    """
    prompt_lower = prompt.lower()
    
    # 1. Fuzzy match columns
    found_cols = []
    confidence_threshold = 75 
    
    # Sort columns by length desc to match longer names first
    sorted_columns = sorted(columns, key=len, reverse=True)
    
    for col in sorted_columns:
        if col.lower() in prompt_lower:
            found_cols.append(col)
            continue
            
        score = fuzz.partial_ratio(col.lower(), prompt_lower)
        if score > confidence_threshold:
            found_cols.append(col)
            
    found_cols = list(dict.fromkeys(found_cols)) # Dedupe

    # 1.5 Color Detection (Basic)
    custom_color = None
    colors = ["red", "blue", "green", "yellow", "purple", "orange", "black", "white", "gray", "pink", "cyan", "magenta"]
    for color in colors:
        if color in prompt_lower:
            custom_color = color
            break

    # 2. Variable Detection logic
    x_col = None
    y_col = None
    
    # Heuristics for Time Series
    time_keywords = ["date", "time", "year", "month", "day", "quarter"]
    time_cols = [c for c in columns if any(k in c.lower() for k in time_keywords)]
    
    # 3. Chart Type Detection
    explicit_chart = detect_chart_type_strict(prompt_lower)
    is_explicit = False
    chart_type = None
    reasoning = ""

    if explicit_chart:
        chart_type = explicit_chart
        reasoning = f"You explicitly requested a {explicit_chart} chart."
        is_explicit = True
    else:
        # Detect intent but don't commit yet if context exists
        detected_chart = detect_intent_chart(prompt_lower)
        # If the user prompt is very short/vague, we might want to rely on context
        chart_type = detected_chart

    # 4. Context Application
    # If we have a context, and the current prompt didn't yield enough info, try to fill gaps
    if last_context:
        # If no columns found in new prompt, reuse old columns
        if not found_cols and last_context.get("found_columns"):
            found_cols = last_context["found_columns"]
            reasoning += " Kept the same data columns from previous chart."
            # Also restore x/y if possible
            x_col = last_context.get("x_column")
            y_col = last_context.get("y_column")
        
        # If no explicit chart requested, and we are just changing columns or color, maybe keep old chart type?
        # But if we found columns, we might default to bar, unless the user said "same chart"
        # For now, if no explicit chart matches, and we are just refining, use context's chart type
        if not explicit_chart and last_context.get("chart_type"):
            # Only if the current prompt doesn't strongly suggest a new type (heuristic)
            # simplest: if prompt is just "make it red", use old chart
            if "change" in prompt_lower or "color" in prompt_lower or len(found_cols) == 0:
                 chart_type = last_context["chart_type"]
                 reasoning += f" maintained the {chart_type} chart type."

    # 5. Fallback/Refinement of Chart Selection
    if not is_explicit and not (last_context and chart_type == last_context.get("chart_type")):
        if "over time" in prompt_lower or "trend" in prompt_lower:
            chart_type = "line"
            reasoning = "A line chart is best for showing trends over time."
            if time_cols and not any(c in found_cols for c in time_cols):
                found_cols.insert(0, time_cols[0])
                reasoning += f" I automatically selected '{time_cols[0]}' as the time axis."
        else:
             # Default to bar if nothing else caught it
             if not chart_type: 
                 chart_type = "bar"
                 reasoning = f"I selected a {chart_type} chart based on your prompt's keywords."

    # 6. Assign X and Y (if not already set by context)
    if not x_col or not y_col:
        if len(found_cols) >= 2:
            if chart_type in ["line", "area"]:
                potential_time = [c for c in found_cols if c in time_cols]
                if potential_time:
                    x_col = potential_time[0]
                    y_col = [c for c in found_cols if c != x_col][0]
                else:
                    x_col = found_cols[0]
                    y_col = found_cols[1]
            else:
                x_col = found_cols[0]
                y_col = found_cols[1]
        elif len(found_cols) == 1:
            col = found_cols[0]
            if chart_type in ["histogram", "box"]:
                x_col = col 
            else:
                x_col = col
                y_col = "count" 
    
    # Fallback reasoning
    if x_col and y_col == "count":
        reasoning += f" Showing count of records by '{x_col}'."
    elif x_col and y_col:
        reasoning += f" Visualization of '{y_col}' vs '{x_col}'."

    return {
        "intent": "plot",
        "chart_type": chart_type,
        "x_column": x_col,
        "y_column": y_col,
        "found_columns": found_cols,
        "original_prompt": prompt,
        "is_explicit": is_explicit,
        "reasoning": reasoning,
        "custom_color": custom_color
    }
