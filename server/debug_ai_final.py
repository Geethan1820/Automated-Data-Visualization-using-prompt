import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load from .env
load_dotenv()
key = os.environ.get("GEMINI_API_KEY", "").strip("'\" ")
print(f"Key loaded: {key[:4]}...{key[-4:]} (Length: {len(key)})")

genai.configure(api_key=key)

print("\n--- Testing Model Discovery ---")
try:
    models = list(genai.list_models())
    for m in models:
        if 'generateContent' in m.supported_generation_methods:
            print(f"AVAILABLE: {m.name}")
except Exception as e:
    print(f"FAILED TO LIST: {e}")

print("\n--- Testing Simple Generation ---")
try:
    # Try gemini-1.5-flash as the safest bet
    model = genai.GenerativeModel('gemini-1.5-flash')
    response = model.generate_content("Hello! Are you online?")
    print(f"SUCCESS: {response.text}")
except Exception as e:
    print(f"GENERATION FAILED: {e}")
