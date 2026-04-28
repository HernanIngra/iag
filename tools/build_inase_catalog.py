"""
Genera public/comparador/inase-catalog.json
Filtra el catalogo_consulta.csv de INASE a MAIZ + SOJA de los últimos 10 años.
Correr desde la raíz del proyecto: python3 tools/build_inase_catalog.py
"""
import csv, json, os
from datetime import date

SRC = "comparador/Info/catalogo_consulta.csv"
DST = "public/comparador/inase-catalog.json"
CUTOFF = date.today().year - 10

def parse_year(fecha_str: str) -> int | None:
    if not fecha_str:
        return None
    for sep in ("/", "-"):
        parts = fecha_str.strip().split(sep)
        if len(parts) == 3:
            try:
                y = int(parts[2])
                if y < 100:
                    y += 2000 if y < 50 else 1900
                return y
            except ValueError:
                pass
    return None

entries = []
with open(SRC, encoding="utf-8", errors="replace") as f:
    reader = csv.DictReader(f, delimiter=";")
    for row in reader:
        especie = (row.get("especie") or "").upper().strip()
        if especie not in ("MAIZ", "SOJA"):
            continue
        year = parse_year(row.get("inscripcion_rnc") or "")
        if year and year < CUTOFF:
            continue
        cultivar = (row.get("cultivar") or "").strip()
        if not cultivar:
            continue
        try:
            num = int(float((row.get("numero") or "0").replace(",", ".")))
        except (ValueError, AttributeError):
            num = 0
        solicitante = (row.get("solicitante_rnc") or "").strip()
        entries.append({
            "n": num,
            "c": cultivar,
            "e": especie,
            "s": solicitante,
        })

os.makedirs(os.path.dirname(DST), exist_ok=True)
with open(DST, "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, separators=(",", ":"))

print(f"✓ {len(entries)} entradas escritas en {DST}")
