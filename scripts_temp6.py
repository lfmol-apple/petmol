import re
path = "/Users/leonardomol/PETMOL H1/services/price-service/src/pets/document_router.py"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# Update the return in _gemini_classify_sync:
text = text.replace("return categoria, doc_date, est\n", "return categoria, doc_date, est, data.get('titulo')\n")

with open(path, "w", encoding="utf-8") as f:
    f.write(text)
