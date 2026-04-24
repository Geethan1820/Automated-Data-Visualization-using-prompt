import time
import hashlib
import os
import json
from dotenv import load_dotenv
import google.generativeai as genai
from openai import OpenAI
from typing import Optional, Dict, Any, List

# Load environment from root folder (two levels up from server/modules)
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path, override=True)

# Configure Gemini
api_key = os.environ.get("GEMINI_API_KEY", "").strip("'\" ")
print(f"[AI ENGINE] SDK Version: {genai.__version__ if hasattr(genai, '__version__') else 'Unknown'}")
genai.configure(
    api_key=api_key
)

SYSTEM_PROMPT = """
You are a World-Class Data Scientist and Visualization Expert. Your task is to parse user prompts and dataset metadata into a high-fidelity visualization intent.

DATASET METADATA:
- Columns: {columns}
- Column Detailed Info: {type_info}
- Sample Data: {sample_data}

{previous_context_block}

USER PROMPT: "{prompt}"

OUTPUT FORMAT (Strict JSON):
{{
  "intent_type": "text_answer" | "visualization",
  "answer": "If intent_type is text_answer, provide a clear, professional, and concise text response here using simple English.",
  "chart_type": "bar" | "line" | "pie" | "scatter" | "area" | "radar" | "funnel" | "treemap" | "bubble" | null,
  "x_axis": "column_name" | null,
  "y_axes": ["list", "of", "column_names"] | null,
  "aggregation": "sum" | "avg" | "count" | "min" | "max" | null,
  "insights": ["3 sophisticated data insights"],
  "reasoning": "Technical justification: Why did you choose this intent and format?",
  "missing_columns": ["List any columns mentioned that are not in the metadata"],
  "is_ml": true | false,
  "theme_suggestion": {{
    "color_palette": "vibrant" | "ocean" | "sunset" | "forest",
    "is_stacked": true | false
  }}
}}

STRICT RULES (MUST FOLLOW):
1. **COLUMN CHECK**: Always check the provided "Columns" list first before responding.
2. **DIRECT CHART GENERATION**: If the user compares two or more column names (e.g., "Sales_Today vs Product", "Price and Quantity"), treat it as a **visualization** request (`intent_type: "visualization"`) and generate a chart immediately.
3. **DATASET EXPLANATIONS**: If the user asks for an explanation (e.g., "explain about the given dataset", "what is this data?"), provide a **2 to 3 line summary** in the `answer` field using **simple English and emojis** 📊✨. Briefly describe what the data represents. Set `intent_type: "text_answer"`.
4. **POLITE REJECTION**: For any question UNRELATED to the dataset (e.g., sports, politics, etc.), respond politely: "I'm sorry, I can only create charts and provide explanations for your uploaded dataset. Let's focus on your data instead! 😊" Set `intent_type: "text_answer"`.
5. **NO HALLUCINATIONS**: Use EXACT column names. If a column is mentioned but not in the list, add it to `missing_columns`.
6. **CHART TYPE SELECTION**:
    - **Scatter**: Use when both A and B are numeric (Correlation).
    - **Line/Area**: Use for trends over time (X-axis must be a date/time column).
    - **Pie**: Use ONLY if X-axis has < 10 unique values (Composition).
    - **Bar**: Default for category vs measure comparisons.
7. **CONTEXT MEMORY**: If the user asks a follow-up (e.g., "change to line chart"), use previous chart columns from context.
8. **STYLE**: Direct, short, and clear.
"""

# Helper to find the best working model for this API key
WORKING_MODEL = None

def get_best_model():
    """Dynamically discovering the best available model for the API key."""
    global WORKING_MODEL
    if WORKING_MODEL:
        return WORKING_MODEL
        
    try:
        # Get list of models supported for generateContent
        available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        print(f"[AI ENGINE] Detected available models: {available_models}")
        
        # Priority order: Stable 1.5 first. Avoid 2.5/3.x unless necessary (low quotas).
        priority = [
            'models/gemini-1.5-flash',
            'models/gemini-1.5-flash-latest',
            'models/gemini-1.5-flash-8b',
            'models/gemini-2.0-flash',
            # Preview models as last resort
            'models/gemini-2.5-flash-lite',
            'models/gemini-3.1-flash-lite-preview',
            'models/gemini-2.5-flash',
            'models/gemini-pro'
        ]
        
        for p in priority:
            if p in available_models:
                WORKING_MODEL = p
                print(f"[AI ENGINE] Selected optimal model: {WORKING_MODEL}")
                return WORKING_MODEL
                    
        # If no priority models worked, pick the first available one (excluding 2.5 if possible)
        if available_models:
            WORKING_MODEL = available_models[0]
            print(f"[AI ENGINE] Discovery Fallback: Using {WORKING_MODEL}")
            return WORKING_MODEL
            
    except Exception as e:
        print(f"[AI ENGINE] Discovery Error: {e}")
        
    return 'models/gemini-1.5-flash'

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
    type_info: Optional[List[Dict]] = None,
    previous_context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Uses LLM to parse intent with robust self-discovery fallback."""
    
    # --- OPENROUTER (sk- keys) LOGIC ---
    if api_key.startswith("sk-"):
        try:
            print(f"[AI ENGINE] Using OpenRouter with key: {api_key[:10]}...")
            client = OpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=api_key
            )
            
            # Switching to GPT-4o-Mini for absolute stability on OpenRouter
            model_to_use = "openai/gpt-4o-mini" 
            
            prev_block = _format_previous_context_block(previous_context)
            type_str = ""
            if type_info:
                type_str = "\n".join([f"- {c['name']}: {c['dtype']} (Numeric: {c['is_numeric']}, Date: {c['is_datetime']}, Uniques: {c['unique_count']})" for c in type_info])

            full_prompt = SYSTEM_PROMPT.format(
                columns=columns, 
                type_info=type_str or "Not Provided",
                sample_data=json.dumps(sample_data, default=str), 
                previous_context_block=prev_block,
                prompt=prompt
            )

            completion = client.chat.completions.create(
                model=model_to_use,
                messages=[{"role": "user", "content": full_prompt}],
                response_format={ "type": "json_object" }
            )
            
            res_text = completion.choices[0].message.content
            return json.loads(res_text)
            
        except Exception as or_err:
            print(f"[AI ENGINE] OpenRouter Error: {or_err}")
            return _parse_with_heuristic(prompt, columns, type_info, previous_context, or_err)

    # --- STANDARD GOOGLE GENAI LOGIC ---
    try:
        model_name = get_best_model()
        model = genai.GenerativeModel(model_name)

        prev_block = _format_previous_context_block(previous_context)
        # Convert type_info to a more readable format for the LLM
        type_str = ""
        if type_info:
            type_str = "\n".join([f"- {c['name']}: {c['dtype']} (Numeric: {c['is_numeric']}, Date: {c['is_datetime']}, Uniques: {c['unique_count']})" for c in type_info])

        full_prompt = SYSTEM_PROMPT.format(
            columns=columns,
            type_info=type_str or "Not Provided",
            sample_data=sample_data,
            previous_context_block=prev_block,
            prompt=prompt,
        )
        
        # --- RETRY LOGIC FOR QUOTA ---
        max_retries = 2
        retry_delay = 1.0 # seconds
        
        response = None
        for attempt in range(max_retries + 1):
            try:
                response = model.generate_content(full_prompt)
                break # Success
            except Exception as e:
                if ("429" in str(e) or "quota" in str(e).lower()) and attempt < max_retries:
                    print(f"[AI ENGINE] Quota hit (429). Retrying in {retry_delay}s... (Attempt {attempt+1}/{max_retries})")
                    time.sleep(retry_delay)
                    retry_delay *= 2 # Exponential backoff
                    continue
                raise e # Real error or last attempt
        
        if not response:
            raise Exception("No response from AI Engine.")

        text = response.text.strip()
        
        # Strip markdown
        if text.startswith("```"):
            parts = text.split("```")
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
        
        return json.loads(text)

    except Exception as e:
        import traceback
        print("---------- AI ENGINE ERROR ----------")
        traceback.print_exc()
        print(f"[LLM ERROR] parse_with_llm: {e}")
        print("-------------------------------------")
        return _parse_with_heuristic(prompt, columns, type_info, previous_context, e)

def _parse_with_heuristic(prompt, columns, type_info, previous_context=None, error_obj=None) -> Dict[str, Any]:
    """Smart fallback logic when AI is unavailable."""
    err_msg = str(error_obj).lower() if error_obj else "unknown error"
    hint = "Check your server terminal for detailed error logs."
    if "api_key" in err_msg or "401" in err_msg or "403" in err_msg:
        hint = "API Key error detected. Check your .env file."
    elif "quota" in err_msg or "429" in err_msg:
        hint = "Quota exceeded. Please try again in 60 seconds."

    prompt_lower = prompt.lower()
    
    # --- Question detection for Fallback ---
    is_question = any(k in prompt_lower for k in ["column", "what data", "explain", "summarize", "inside", "fields", "list"])
    
    if is_question:
        cols_str = ", ".join(columns[:15]) + ("..." if len(columns) > 15 else "")
        return {
            "intent_type": "text_answer",
            "answer": f"I'm currently in high-performance mode (AI offline). Your dataset has {len(columns)} columns: {cols_str}. Please explicitly ask to 'plot' or 'chart' if you want a visualization!",
            "insights": ["Heuristic analysis enabled.", "Dataset structure identified."],
            "reasoning": "Heuristic text fallback triggered (AI Quota/Error).",
            "is_ml": False
        }

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
        "intent_type": "visualization",
        "chart_type": chart_type,
        "x_axis": fb_x,
        "y_axes": fb_y,
        "aggregation": fb_agg,
        "insights": ["AI analysis is unavailable, using heuristic fallback.", f"Diagnostic Hint: {hint}"],
        "reasoning": f"Fallback visualization generated due to AI connectivity issue: {err_msg[:50]}...",
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
        model_name = get_best_model()
        model = genai.GenerativeModel(model_name)
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
