import re

path = "/Users/leonardomol/PETMOL H1/services/price-service/src/pets/document_router.py"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. Update _GEMINI_PROMPT
old_prompt_regex = r"(_GEMINI_PROMPT\s*=\s*\"\"\"\\)(.*?)(═══ CATEGORIA ═══)"
new_prompt_repl = r'\1\nVocê é um especialista veterinário.\nRetorne JSON válido com 4 chaves:\n{"categoria": "...", "data": "YYYY-MM-DD ou null", "estabelecimento": "nome ou null", "titulo": "O que é (Curto) ou null"}\n\n\3'
text = re.sub(old_prompt_regex, new_prompt_repl, text, flags=re.DOTALL)

# 2. Update _gemini_classify_sync
old_gemini_sig = r"def _gemini_classify_sync\([\s\S]*?-> tuple\[str, date_type \| None, str \| None\] \| None:"
new_gemini_sig = "def _gemini_classify_sync(\n    content: bytes, mime: str, filename: str, api_key: str\n) -> tuple[str, date_type | None, str | None, str | None] | None:"
text = re.sub(old_gemini_sig, new_gemini_sig, text)

# find the return in _gemini_classify_sync
old_gemini_ret = r"        return categoria, doc_date, str\(data\['estabelecimento'\]\) if data\.get\('estabelecimento'\) else None"
new_gemini_ret = r"        estab = str(data['estabelecimento']) if data.get('estabelecimento') else None\n        titulo = str(data['titulo']) if data.get('titulo') else None\n        return categoria, doc_date, estab, titulo"
text = re.sub(old_gemini_ret, new_gemini_ret, text)

# 3. Update _classify_local
old_local_sig = r"def _classify_local\(content: bytes, mime: str, filename: str\) -> tuple\[str, date_type \| None, str \| None\]:"
new_local_sig = "def _classify_local(content: bytes, mime: str, filename: str) -> tuple[str, date_type | None, str | None, str | None]:"
text = re.sub(old_local_sig, new_local_sig, text)

old_local_ret = r"    return _category_from_filename\(filename\), detected_date, establishment"
new_local_ret = "    return _category_from_filename(filename), detected_date, establishment, None"
text = re.sub(old_local_ret, new_local_ret, text)

# 4. _classify_from_content definition
old_from_sig = r"async def _classify_from_content\([\s\S]*?\) -> tuple\[str, date_type \| None, str \| None\]:"
new_from_sig = "async def _classify_from_content(\n    content: bytes, mime: str, filename: str\n) -> tuple[str, date_type | None, str | None, str | None]:"
text = re.sub(old_from_sig, new_from_sig, text)

# Force ai_enabled to True in _classify_from_content!
old_ai_flag = r'ai_enabled = os\.environ\.get\("DOCUMENT_AI_CLASSIFY_ENABLED", "false"\)\.lower\(\) not in \("false", "0", "no"\)'
new_ai_flag = r'ai_enabled = True'
text = re.sub(old_ai_flag, new_ai_flag, text)

# 5. usages
text = text.replace("cat, detected_date, establishment = await _classify_from_content(", "cat, detected_date, establishment, titulo = await _classify_from_content(")
text = text.replace("cat, detected_date, establishment = \"other\", None, None", "cat, detected_date, establishment, titulo = \"other\", None, None, None")
text = text.replace("category, doc_date, establishment = await _classify_from_content(", "category, doc_date, establishment, titulo = await _classify_from_content(")
text = text.replace("ai_cat, ai_date, ai_est = await _classify_from_content(", "ai_cat, ai_date, ai_est, ai_titulo = await _classify_from_content(")

# Update usages inside upload_documents batch_items struct:
old_batch = """            "ext": ext,
            "category": category,
            "doc_date": doc_date,
            "establishment": establishment,
        })"""
new_batch = """            "ext": ext,
            "category": category,
            "doc_date": doc_date,
            "establishment": establishment,
            "title": titulo,
        })"""
text = text.replace(old_batch, new_batch)

# Inside upload_documents batch_items loop where doc happens:
old_doc_create = """        doc = PetDocument(
            pet_id=pet_id,
            kind="file",
            title=_form_title or item["fname"],
            category=item["category"],
            document_date=_form_date or merged_date,"""
new_doc_create = """        doc = PetDocument(
            pet_id=pet_id,
            kind="file",
            title=_form_title or item.get("title") or item["fname"],
            category=item["category"],
            document_date=_form_date or merged_date,"""
text = text.replace(old_doc_create, new_doc_create)

# In extract_zip
old_zip_item = """                zip_items.append({
                    "content": data,
                    "mime": mime,
                    "fname": fname,
                    "category": cat,
                    "doc_date": detected_date,
                    "establishment": establishment,
                })"""
new_zip_item = """                zip_items.append({
                    "content": data,
                    "mime": mime,
                    "fname": fname,
                    "category": cat,
                    "doc_date": detected_date,
                    "establishment": establishment,
                    "title": titulo,
                })"""
text = text.replace(old_zip_item, new_zip_item)

old_zip_doc = """            doc = PetDocument(
                pet_id=pet_id, kind="file",
                title=item["fname"],
                category=item["category"],
                document_date=merged_date,"""
new_zip_doc = """            doc = PetDocument(
                pet_id=pet_id, kind="file",
                title=item.get("title") or item["fname"],
                category=item["category"],
                document_date=merged_date,"""
text = text.replace(old_zip_doc, new_zip_doc)

with open(path, "w", encoding="utf-8") as f:
    f.write(text)
