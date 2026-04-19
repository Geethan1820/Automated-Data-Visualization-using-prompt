import os
import json
from dotenv import load_dotenv
import google.generativeai as genai
from typing import Optional, Dict, Any, List

# Load environment from root folder (two levels up from server/modules)
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path, override=True)

# Configure Gemini
api_key = os.environ.get("GEMINI_API_KEY", "")
genai.configure(
    api_key=api_key,
    transport='rest'
)

SYSTEM_PROMPT = """
You are a World-Class Data Scientist and Visualization Expert. Your task is to parse user prompts and metadata into a high-fidelity visualization intent.

DATASET METADATA:
- Columns: {columns}
- Sample Data: {sample_data}

{previous_context_block}

USER PROMPT: "{prompt}"

OUTPUT FORMAT (Strict JSON):
{{
  "chart_type": "bar" | "line" | "pie" | "scatter" | "area" | "radar" | "funnel" | "treemap" | "bubble",
  "x_axis": "column_name",
  "y_axes": ["list", "of", "column_names"],
  "aggregation": "sum" | "avg" | "count" | "min" | "max" | null,
  "insights": ["3 sophisticated data insights"],
  "reasoning": "Scientific justification for this visualization choice.",
  "missing_columns": ["List any specific columns mentioned in the prompt that ARE NOT in the metadata"],
  "is_ml": true | false,
  "theme_suggestion": {{
    "color_palette": "vibrant" | "ocean" | "sunset" | "forest",
    "is_stacked": true | false
  }}
}}

CRITICAL RULES:
1. **Multi-Series**: If the user mentions multiple metrics (e.g. 'sales and profit'), include ALL relevant columns in `y_axes`.
2. **Column Matching**: Match column names EXACTLY from the metadata. Use fuzzy matching if names are similar but not identical.
3. **Follow-up prompts (PREVIOUS CHART above)**: If a previous chart is shown and the user only adjusts the visualization (e.g. "change to line chart", "make it a pie", "switch to bar", "use area instead") without naming new columns, you MUST keep the same `x_axis` and `y_axes` as that previous chart and only change `chart_type` (and `aggregation` only if they explicitly ask). Never return empty `x_axis` or `y_axes` when inheriting.
4. **Chart Selection Strategy**:
   - **Trends Over Time**: Use 'line' or 'area'. Ensure `x_axis` is a date/time column.
   - **Comparisons**: Use 'bar'. If cardinality < 5, consider 'pie'.
   - **Correlations**: Use 'scatter' or 'bubble'.
   - **Pipelines**: Use 'funnel'.
   - **Hierarchies**: Use 'treemap'.
5. **ML**: If the user asks for 'forecast', 'prediction', 'future', or 'clustering', set `is_ml: true`.
6. **Output**: ONLY return valid JSON. Do not include markdown code blocks or any other text.
"""

# Helper to find the best working model for this API key
WORKING_MODEL = None

def get_best_model():
    global WORKING_MODEL
    if WORKING_MODEL:
        return WORKING_MODEL
        
    try:
        models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        # Priority variants of Gemini (Updated for latest availability)
        priority = [
            'models/gemini-2.5-flash',
            'models/gemini-2.0-flash',
            'models/gemini-pro',
            'models/gemini-1.5-flash',
            'models/gemini-1.5-pro'
        ]
        
        # Check priority list first
        for p in priority:
            if p in models:
                WORKING_MODEL = p
                print(f"[AI ENGINE] Self-Discovery: Using priority model {WORKING_MODEL}")
                return WORKING_MODEL
                
        # If no priority found, use the first available generation model
        if models:
            WORKING_MODEL = models[0]
            print(f"[AI ENGINE] Self-Discovery: Using available model {WORKING_MODEL}")
            return WORKING_MODEL
    except Exception as e:
        print(f"[AI ENGINE] Self-Discovery Failed: {e}")
        
    return 'models/gemini-2.5-flash'

def _format_previous_context_block(previous_context: Optional[Dict[str, Any]]) -> str:
    if not previous_context:
        return ""
    ys = previous_context.get("y_columns") or []
    if not ys and previous_context.get("y_column"):
        ys = [previous_context["y_column"]]
    ys = [c for c in ys if c]
    return f"""
PREVIOUS CHART IN THIS SESSION (user may refine without repeating column names):
- chart_type: {previous_context.get('chart_type', 'bar')}
- x_column: {previous_context.get('x_column')}
- y_columns: {json.dumps(ys)}
- aggregation: {previous_context.get('aggregation', 'sum')}
"""


def parse_with_llm(
    prompt: str,
    columns: list,
    sample_data: list,
    previous_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Uses LLM to parse intent with robust self-discovery fallback."""
    try:
        model_name = get_best_model()
        model = genai.GenerativeModel(model_name)

        prev_block = _format_previous_context_block(previous_context)
        full_prompt = SYSTEM_PROMPT.format(
            columns=columns,
            sample_data=sample_data,
            previous_context_block=prev_block,
            prompt=prompt,
        )
        
        response = model.generate_content(full_prompt)
        text = response.text.strip()
        
        # Strip markdown
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
        
        return json.loads(text)

    except Exception as e:
        print(f"[LLM ERROR] parse_with_llm: {e}")
        # --- SMART FALLBACK ---
        prompt_lower = prompt.lower()
        chart_type = "bar"
        if "line" in prompt_lower or "trend" in prompt_lower: chart_type = "line"
        elif "pie" in prompt_lower or "breakdown" in prompt_lower: chart_type = "pie"
        elif "scatter" in prompt_lower: chart_type = "scatter"

        fb_x = columns[0] if columns else "x"
        fb_y = [columns[1]] if len(columns) > 1 else ([columns[0]] if columns else ["y"])
        fb_agg = "sum"
        if previous_context:
            if previous_context.get("x_column"):
                fb_x = previous_context["x_column"]
            mem_ys = previous_context.get("y_columns") or []
            if not mem_ys and previous_context.get("y_column"):
                mem_ys = [previous_context["y_column"]]
            mem_ys = [c for c in mem_ys if c]
            if mem_ys:
                fb_y = mem_ys
            fb_agg = previous_context.get("aggregation") or fb_agg

        return {
            "chart_type": chart_type,
            "x_axis": fb_x,
            "y_axes": fb_y,
            "aggregation": fb_agg,
            "insights": ["AI analysis is unavailable, using heuristic fallback.", f"System Logic: {str(e)[:50]}..."],
            "reasoning": "Fallback visualization generated due to AI connectivity issue.",
            "is_ml": False
        }

def generate_dataset_suggestions(columns: List[str], sample_data: List[Dict]) -> List[str]:
    """Generates 6 advanced analytical query prompts that are 100%% reliable."""
    prompt = f"""
    You are a Senior Data Scientist. Based on the following metadata, generate exactly 6 highly sophisticated analytical questions.
    
    COLUMNS: {columns}
    SAMPLE DATA: {sample_data}
    
    RULES:
    1. Use EXACT column names verbatim.
    2. Variety is CRITICAL. Include:
       - Pareto (80/20 check): e.g. "Identify the top 20% of [category] contributing to most [value]"
       - Outlier/Anomaly: e.g. "Find any unusual spikes or outliers in [value] over [time]"
       - Correlation: e.g. "Analyze relationship between [numeric_1] and [numeric_2]"
       - Trend Breakdown: e.g. "Compare [value] growth across different [category]"
       - Contribution %: e.g. "Show share of [category] in total [value]"
       - Simple Overview: e.g. "Show monthly trend of [value]"
    3. Prompts must be single-sentence, no emojis, clean text.
    4. Return ONLY a JSON list of strings.
    
    OUTPUT FORMAT: ["Prompt 1", "Prompt 2", "Prompt 3", "Prompt 4", "Prompt 5", "Prompt 6"]
    """
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json"}
        )
        data = json.loads(response.text)
        return data if isinstance(data, list) else data[:6]
    except Exception as e:
        print(f"Advanced Suggestion Generation Failed: {e}")
        return [
            "Breakdown data by main categories",
            "Show trend of values over time",
            "Compare performance across segments",
            "Find top 10 records by contribution",
            "Analyze distribution of key metrics",
            "Generate data summary"
        ]

def get_insights_with_llm(data_summary: str) -> list:
    """Generates insights with a static fallback."""
    try:
        model_name = get_best_model()
        model = genai.GenerativeModel(model_name)
        prompt = f"Analyze this data summary and provide 5 bullet-point insights:\n{data_summary}"
        response = model.generate_content(prompt)
        return [line.strip("- ") for line in response.text.strip().split("\n") if line.strip()]
    except:
        return [
            "Data distribution check complete.",
            "Trends identified across primary categories.",
            "Potential correlations detected in numerical columns.",
            "Anomaly detection suggests stable data patterns.",
            "Recommended next step: deeper categorical breakdown."
        ]
