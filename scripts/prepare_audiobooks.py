"""Extract every PDF page for private local narration. Never publishes source text."""
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path
import pymupdf

root = Path(sys.argv[1]).resolve()
plan = json.loads((root / "conversion-plan.json").read_text(encoding="utf-8"))
reports = []
for entry in plan:
    pdf = root / "pdfs" / (entry["slug"] + ".pdf")
    folder = root / "work" / entry["slug"]
    folder.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(pdf)
    pages, chunks, issues = [], [], []
    for number, page in enumerate(doc, 1):
        raw = page.get_text(sort=False)
        (folder / f"page-{number:04d}-raw.txt").write_text(raw, encoding="utf-8")
        clean = unicodedata.normalize("NFKC", raw).replace("\u00ad", "")
        clean = re.sub(r"(?<=\w)-[ \t]*\n[ \t]*(?=\w)", "", clean)
        clean = re.sub(r"\s+", " ", clean).strip()
        override = root / "transcriptions" / entry["slug"] / f"{number:04d}.txt"
        if override.exists():
            clean = override.read_text(encoding="utf-8").strip()
        if len(clean) < 20 and page.get_images() and not override.exists():
            issues.append({"page": number, "reason": "Página com imagem e pouco texto: requer OCR ou transcrição conferida."})
        if clean.count("\ufffd") > 3:
            issues.append({"page": number, "reason": "Caracteres Unicode não recuperados."})
        page_chunks = []
        # A whitespace-only split preserves the full normalized text, without truncation.
        remaining = clean
        while remaining:
            cut = min(3000, len(remaining))
            if cut < len(remaining):
                boundary = remaining.rfind(" ", 0, cut)
                if boundary > 0: cut = boundary
            text, remaining = remaining[:cut], remaining[cut:].lstrip()
            index = len(chunks) + 1
            target = folder / f"chunk-{index:05d}.txt"
            target.write_text(text, encoding="utf-8")
            chunks.append({"index": index, "page": number, "text": str(target), "sha256": hashlib.sha256(text.encode()).hexdigest(), "characters": len(text)})
            page_chunks.append(text)
        if " ".join(page_chunks) != clean:
            raise RuntimeError(f"Texto não preservado: {entry['slug']} página {number}")
        pages.append({"page": number, "raw_characters": len(raw), "spoken_characters": len(clean), "chunk_count": len(page_chunks), "manual_transcription": override.exists()})
    manifest = {**entry, "pdf": str(pdf), "pdf_sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(), "page_count": len(doc), "pages": pages, "chunks": chunks, "issues": issues, "normalization": "NFKC; remoção de hifens de quebra de linha e espaços de diagramação. Sem resumo ou exclusão de parágrafos, notas ou índices."}
    target = folder / "manifest.json"
    target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    reports.append({"slug": entry["slug"], "pages": len(doc), "characters": sum(x["spoken_characters"] for x in pages), "chunks": len(chunks), "issues": issues, "manifest": str(target)})
(root / "extraction-audit.json").write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(reports, ensure_ascii=True, indent=2))
