import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment from root folder
dotenv_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path, override=True)

api_key = os.environ.get("GEMINI_API_KEY", "")
print(f"Using API Key: {api_key[:5]}...{api_key[-5:]}")

genai.configure(api_key=api_key, transport='rest')

try:
    print("Listing models...")
    models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
    print(f"Available models: {models}")
    
    if models:
        model_name = models[0]
        print(f"Testing model: {model_name}")
        model = genai.GenerativeModel(model_name)
        response = model.generate_content("Say hello")
        print(f"Response: {response.text}")
    else:
        print("No models found!")
except Exception as e:
    print(f"Error: {e}")
