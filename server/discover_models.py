import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
key = os.environ.get("GEMINI_API_KEY", "").strip("'\" ")
print(f"Key loaded: {key[:4]}...{key[-4:]}")

genai.configure(api_key=key)

print("\n--- AVAILABLE MODELS ---")
try:
    models = list(genai.list_models())
    for m in models:
        methods = ", ".join(m.supported_generation_methods)
        print(f"Name: {m.name} | Methods: [{methods}]")
except Exception as e:
    print(f"Failed to list models: {e}")

print("\n--- TESTING CONNECTIVITY ---")
test_models = [
    'models/gemini-1.5-flash',
    'models/gemini-1.5-flash-latest',
    'models/gemini-1.5-pro',
    'models/gemini-2.0-flash',
    'models/gemini-1.0-pro'
]

for tm in test_models:
    print(f"\nTesting {tm}...")
    try:
        model = genai.GenerativeModel(tm)
        response = model.generate_content("Hi", generation_config={"max_output_tokens": 10})
        print(f"  SUCCESS: {response.text.strip()}")
    except Exception as e:
        print(f"  FAILED: {str(e)[:100]}")
