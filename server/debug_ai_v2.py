import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
key = os.environ.get("GEMINI_API_KEY", "").strip("'\" ")
print(f"Key loaded: {key[:4]}...{key[-4:]} (Length: {len(key)})")

genai.configure(api_key=key)

def get_best_model():
    try:
        models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        priority = [
            'models/gemini-2.5-flash',
            'models/gemini-2.0-flash',
            'models/gemini-1.5-flash',
            'models/gemini-pro'
        ]
        for p in priority:
            if p in models:
                return p
        return models[0] if models else None
    except Exception as e:
        print(f"Discovery failed: {e}")
        return 'models/gemini-2.0-flash'

target = get_best_model()
print(f"\n--- Strategy: Using {target} ---")

try:
    model = genai.GenerativeModel(target)
    response = model.generate_content("Hello! Are you online?")
    print(f"SUCCESS: {response.text}")
except Exception as e:
    print(f"GENERATION FAILED: {e}")
