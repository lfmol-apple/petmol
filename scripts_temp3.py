import os

path = "/Users/leonardomol/PETMOL H1/services/price-service/src/vision/document_classifier.py"
with open(path, "r") as f:
    content = f.read()

import re

old_call = """            response = self.model.generate_content([
                prompt,
                {"mime_type": "image/jpeg", "data": image_bytes}
            ])"""

new_call = """            mime = "application/pdf" if image_bytes.startswith(b"%PDF") else "image/jpeg"
            response = self.model.generate_content([
                prompt,
                {"mime_type": mime, "data": image_bytes}
            ])"""

content = content.replace(old_call, new_call)

with open(path, "w") as f:
    f.write(content)
