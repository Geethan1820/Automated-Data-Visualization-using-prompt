import os
import json
from dotenv import load_dotenv
import google.generativeai as genai

# Absolute path load
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
api_key = os.environ.get("GEMINI_API_KEY")

print(f"DEBUG: Key starts with: {api_key[:10] if api_key else 'NONE'}")

genai.configure(api_key=api_key)

print("DEBUG: Attempting to list models...")
try:
    models = genai.list_models()
    for m in models:
        print(f" - {m.name}")
except Exception as e:
    print(f"ERROR listing models: {e}")

print("\nDEBUG: Attempting generation with discovered model...")
try:
    models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
    if not models:
        print("ERROR: No generation models found.")
    else:
        target_model = models[0]
        print(f"DEBUG: Using model: {target_model}")
        model = genai.GenerativeModel(target_model)
        response = model.generate_content("Say hello")
        print(f"SUCCESS: {response.text}")
except Exception as e:
    print(f"ERROR: {e}")
