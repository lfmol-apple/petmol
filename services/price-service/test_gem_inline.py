import google.generativeai as genai
import os
import base64

api_key = os.environ.get("GEMINI_API_KEY") 
genai.configure(api_key=api_key)
model = genai.GenerativeModel("gemini-2.0-flash")

b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

try:
    print("Trying inline_data struct with base64 string...")
    part = {"inline_data": {"mime_type": "image/png", "data": b64}}
    res = model.generate_content(["Hello", part])
    print(res.text)
except Exception as e:
    print("ERR:", e)

