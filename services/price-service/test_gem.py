import google.generativeai as genai
import os
import base64

api_key = os.environ.get("GEMINI_API_KEY") 
if not api_key:
    print("NO API KEY")
    exit(1)
genai.configure(api_key=api_key)
model = genai.GenerativeModel("gemini-2.0-flash")

b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
content = base64.b64decode(b64)

try:
    print("Trying bytes...")
    part = {"mime_type": "image/png", "data": content}
    res = model.generate_content(["Hello", part])
    print(res.text)
except Exception as e:
    print("ERR:", e)

try:
    print("Trying explicit dict with base64 string...")
    part2 = {"mime_type": "image/png", "data": b64}
    res2 = model.generate_content(["Hello", part2])
    print(res2.text)
except Exception as e:
    print("ERR2:", e)

