"""
Normaliza y carga RECSO Soja Norte histórico + ensayo Grupo Lajitas 24-25 a Supabase.

Por defecto muestra preview. Pasá --insert para cargar realmente.
Correr desde la raíz del proyecto: python3 tools/load_recso_soja.py [--insert]
"""

import sys, csv, re, difflib, openpyxl, requests
from collections import defaultdict

DRY_RUN = "--insert" not in sys.argv

# ── Config ────────────────────────────────────────────────────────────────────

env = {}
with open(".env.local") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

URL = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation,resolution=merge-duplicates",
}

# ── Cargar catálogo INASE (solo SOJA) ─────────────────────────────────────────

inase_soja: set[str] = set()
with open("comparador/Info/catalogo_consulta.csv", encoding="utf-8") as f:
    reader = csv.DictReader(f, delimiter=";")
    for row in reader:
        if row.get("especie", "").upper() == "SOJA":
            name = row["cultivar"].strip().upper()
            if name:
                inase_soja.add(name)

print(f"→ INASE: {len(inase_soja)} variedades de soja cargadas")

# ── Normalización de nombres ───────────────────────────────────────────────────

SKIP_NAMES = {"PROMEDIOS", "PROMEDIO", "LLUVIAS", "LLUVIA", "MEDIA", "LSD", "CV", "TESTIGO", ""}

# Caracteres que indican garbage/OCR artifact
GARBAGE_CHARS = set("| ~ [ ] { } $ € £ ¢ % @ # ^ \\ ; — ——".split())

# Prefijos de código que indican marca (para formato BRAND-BRANDPREFIXCODE)
BRAND_PREFIX_MAP = {
    "PIONEER": "P",
    "STINE":   "ST",
    "BREVANT": "BRV",
    "DM":      "DM",
    "NEOGEN":  "NEO",
    "NIDERA":  "NS",
    "ILLINOIS":"IS",
    "NK":      "NK",
    "ACA":     "ACA",
}


def is_valid_variety_name(name: str) -> bool:
    """True si el nombre parece un código de variedad real (no garbage/OCR)."""
    if not name or len(name) < 3 or len(name) > 45:
        return False
    if any(c in name for c in GARBAGE_CHARS):
        return False
    # Debe empezar con carácter alfanumérico
    if not name[0].isalnum():
        return False
    # No puede ser mayormente no-alfanumérico
    alnum_count = sum(1 for c in name if c.isalnum() or c in " .-_")
    if alnum_count / len(name) < 0.70:
        return False
    return True


def add_space_before_suffix(code: str) -> str:
    """DM70K70SCE → DM 70K70 SCE  |  56123SCE → 56123 SCE"""
    # space before trailing all-caps suffix (CE, SCE, SE, STS, IPRO, E)
    code = re.sub(r"(\d)([A-Z]{2,})$", r"\1 \2", code)
    # space after leading digits-letter runs for codes like 70K70
    return code.strip()


def normalize_variety(raw: str) -> tuple[str, str]:
    """
    Returns (normalized_name, status).
    status: 'skip' | 'exact' | 'fuzzy' | 'rule' | 'raw'
    """
    cleaned = raw.strip()
    upper   = cleaned.upper()

    if not cleaned or len(cleaned) <= 1:
        return cleaned, "skip"
    if upper in SKIP_NAMES:
        return cleaned, "skip"
    # Purely numeric (subtotals in Excel)
    if re.fullmatch(r"[\d\s,\.]+", cleaned):
        return cleaned, "skip"
    # OCR/scan garbage: invalid characters or low alphanumeric ratio
    if not is_valid_variety_name(cleaned):
        return cleaned, "skip"

    # ── Pattern: BRAND-CODE  (e.g. "STINE-ST62KA62", "Pioneer-P80A02SCE") ────
    if "-" in cleaned:
        parts = cleaned.split("-", 1)
        if len(parts) == 2:
            brand_raw, code_raw = parts
            brand = brand_raw.strip().upper()
            code  = code_raw.strip().upper()

            # Remove redundant brand prefix from code
            prefix = BRAND_PREFIX_MAP.get(brand, brand[:2])
            if code.startswith(prefix):
                code_stripped = code[len(prefix):]
            else:
                code_stripped = code

            code_spaced = add_space_before_suffix(code_stripped)
            candidate   = f"{brand} {code_spaced}".strip()

            # Some brands store as just the code (BRV, IS, NS, P...)
            short_brand = BRAND_PREFIX_MAP.get(brand, brand)
            candidate_short = f"{short_brand} {code_spaced}".strip()

            for try_name in [candidate, candidate_short, f"{brand} {code}"]:
                if try_name in inase_soja:
                    return try_name, "exact"

            # Fuzzy match
            for try_name in [candidate, candidate_short]:
                m = difflib.get_close_matches(try_name, inase_soja, n=1, cutoff=0.80)
                if m:
                    return m[0], "fuzzy"

            return candidate, "rule"

    # ── No dash: normalize spacing/case (e.g. "DM 80k80SCE") ─────────────────
    normalized = upper
    normalized = add_space_before_suffix(normalized)

    if normalized in inase_soja:
        return normalized, "exact"
    if upper in inase_soja:
        return upper, "exact"

    m = difflib.get_close_matches(normalized, inase_soja, n=1, cutoff=0.80)
    if m:
        return m[0], "fuzzy"

    m = difflib.get_close_matches(upper, inase_soja, n=1, cutoff=0.75)
    if m:
        return m[0], "fuzzy"

    return normalized, "raw"


# ── Helpers ───────────────────────────────────────────────────────────────────

def normalize_campana(raw: str) -> str:
    """'2024/25' → '24-25'"""
    m = re.search(r"20(\d{2})/(\d{2})", str(raw))
    return f"{m.group(1)}-{m.group(2)}" if m else str(raw).strip()


def to_float(v) -> float | None:
    try:
        return float(str(v).replace(",", ".")) if v is not None else None
    except (ValueError, TypeError):
        return None


# ── RECSO Norte Histórico ─────────────────────────────────────────────────────

RECSO_PATH = (
    "/Users/hernaningrassia/Library/Mobile Documents/"
    "com~apple~CloudDocs/INICIO HERNAN/05Profesional/01 AgriDat/"
    "Ensayos 3ros + datos zonales previos/RECSO_Norte_historico.xlsx"
)

print(f"\n→ Leyendo RECSO desde:\n  {RECSO_PATH}")
wb = openpyxl.load_workbook(RECSO_PATH, read_only=True, data_only=True)
ws = wb["Base RECSO Norte"]

# Detect headers from row 1
headers = [str(c.value or "").strip() for c in next(ws.iter_rows(min_row=1, max_row=1))]
print(f"  Columnas: {headers}")

# Locate columns by name (case-insensitive)
def col(name: str) -> int:
    name = name.lower()
    for i, h in enumerate(headers):
        if name in h.lower():
            return i
    return -1

C_CAMP  = col("campa")     # Campaña
C_INST  = col("instit")    # Institución
C_RED   = col("red")       # Red
C_REG   = col("regi")      # Región / Zona
C_LOC   = col("localid")   # Localidad
C_GM    = col("gm")        # Grupo de Madurez
C_RANG  = col("rango")     # Rango ambiental
C_HYB   = col("híbrido") if col("híbrido") >= 0 else col("hibrido")
C_REND  = col("rendim")    # Rendimiento
C_LAT   = col("latit")     # Latitud
C_LNG   = col("longit")    # Longitud

print(f"  Índices: camp={C_CAMP} inst={C_INST} red={C_RED} reg={C_REG} "
      f"loc={C_LOC} gm={C_GM} hyb={C_HYB} rend={C_REND} lat={C_LAT} lng={C_LNG}")

trials: dict = {}
trial_entradas: dict = defaultdict(list)
skip_count = 0
norm_stats = {"exact": 0, "fuzzy": 0, "rule": 0, "raw": 0}
unmatched_map: dict[str, str] = {}  # raw_name → normalized (for report)

for row in ws.iter_rows(min_row=2, values_only=True):
    def g(idx): return str(row[idx] or "").strip() if idx >= 0 else ""

    campana = normalize_campana(g(C_CAMP))
    inst    = g(C_INST) or "INTA"
    red     = g(C_RED)  or "RECSO"
    region  = g(C_REG)
    loc     = g(C_LOC)
    gm      = g(C_GM)
    rango   = g(C_RANG) or None
    hibrido_raw = g(C_HYB)
    rend    = to_float(row[C_REND] if C_REND >= 0 else None)
    lat     = to_float(row[C_LAT]  if C_LAT >= 0  else None)
    lng     = to_float(row[C_LNG]  if C_LNG >= 0  else None)

    if not campana or not loc or rend is None:
        skip_count += 1
        continue

    hibrido, status = normalize_variety(hibrido_raw)
    if status == "skip":
        skip_count += 1
        continue

    norm_stats[status if status in norm_stats else "raw"] += 1
    if status in ("raw", "rule"):
        unmatched_map[hibrido_raw] = hibrido

    # Key: campana + localidad + GM group (separate trial per GM at same location)
    key = (campana, loc, gm)
    if key not in trials:
        trials[key] = {
            "campana":    campana,
            "cultivo":    "soja",
            "institucion": inst,
            "red":        red,
            "localidad":  loc,
            "ambiente":   gm or rango or None,
            "zona":       region or None,
            "lat":        lat,
            "lng":        lng,
        }

    trial_entradas[key].append({"hibrido": hibrido, "rendimiento": rend})

wb.close()

total_entries = sum(len(v) for v in trial_entradas.values())
print(f"\n  {len(trials)} ensayos · {total_entries} entradas · {skip_count} filas omitidas")
print(f"  Normalización → exact: {norm_stats['exact']} · "
      f"fuzzy: {norm_stats['fuzzy']} · rule: {norm_stats['rule']} · raw: {norm_stats['raw']}")

if unmatched_map:
    print(f"\n  Variedades sin match INASE ({len(unmatched_map)} únicas) — con sugerencias a ≥60%:")
    print(f"  {'Nombre en archivo':<35} {'Normalizado':<30} {'Sugerencia INASE'}")
    print(f"  {'-'*35} {'-'*30} {'-'*30}")
    for raw_name, norm in sorted(unmatched_map.items()):
        suggestions = difflib.get_close_matches(norm, inase_soja, n=1, cutoff=0.60)
        sug = suggestions[0] if suggestions else "—"
        print(f"  {raw_name!r:<35} {norm!r:<30} → {sug}")

# ── Ensayo Grupo Lajitas 24-25 (de imagen) ────────────────────────────────────
# Fecha siembra: 9-1-2025 → campaña 24-25 | coords: 24°57'09.3"S 64°21'11.4"W
#
# Normalización manual (el formato de imagen es BRAND-BRANDPREFIXCODE):
#   INASE almacena Pioneer sin prefijo P:    P80A02SCE → "P 80A02 SCE"
#   STINE: "STINE XXKAXXX"                  ST62KA62  → "STINE 62KA62" ✓ (INASE exact)
#   NEO:   "NEO XXSXX XX"                   NEO69S23CE→ "NEO 69S23 CE" ✓ (INASE exact)
#   NS:    "NS XXXX IPRO STS"               NS6721    → "NS 6721 IPRO STS" ✓ (INASE exact)
#   IS:    IS 69.5 CE ≠ IS 69.2 CE (otra variedad distinta en INASE)
#   BRV/DM: variedades más nuevas que el catálogo INASE

LAJITAS_ENTRIES = [
    # (nombre_normalizado, rendimiento_kgha)
    # "~ " = no en INASE (variedad nueva), "✓" = match INASE
    ("P 80A02 SCE",       3394.93),  # ~ Pioneer P80A02 SCE (más nuevo que catálogo)
    ("STINE 78KA42",      3115.64),  # ~ no en INASE
    ("BRV 56123 SCE",     2991.20),  # ~ Brevant, no en INASE
    ("BRV 6524 SE",       2881.19),  # ~ Brevant, no en INASE
    ("DM 80K80 SCE",      2823.20),  # ~ DM, no en INASE
    ("P 70A06 SCE",       2810.79),  # ~ Pioneer P70A06 SCE, no en INASE
    ("DM 70K70 SCE",      2731.91),  # ~ DM, no en INASE
    ("BRV 57122 CE",      2726.35),  # ~ Brevant, no en INASE
    ("STINE 62KA62",      2666.20),  # ✓ INASE exact
    ("NEO 69S23 CE",      2578.94),  # ✓ INASE exact
    ("IS 69.5 CE",        2517.18),  # ~ ILLINOIS (IS 69.2 CE es otra variedad)
    ("NS 6721 IPRO STS",  2385.77),  # ✓ INASE exact
]

lajitas_key = ("24-25", "Lajitas", "")
lajitas_ensayo = {
    "campana":    "24-25",
    "cultivo":    "soja",
    "institucion":"Grupo Lajitas",
    "red":        "Ensayos particulares",
    "localidad":  "Lajitas",
    "ambiente":   None,
    "zona":       "Norte",
    "lat":        -24.9526,
    "lng":        -64.3532,
}
lajitas_entradas = [{"hibrido": h, "rendimiento": r} for h, r in LAJITAS_ENTRIES]

print(f"\n→ Ensayo Grupo Lajitas 24-25:")
for h, r in LAJITAS_ENTRIES:
    in_inase = "✓" if h.upper() in inase_soja else "~"
    print(f"  {in_inase} {h!r:30s} → {r} kg/ha")

# ── Insertar ──────────────────────────────────────────────────────────────────

if DRY_RUN:
    print(f"\n[PREVIEW] Nada insertado. Corré con --insert para cargar.")
    sys.exit(0)

print(f"\n→ Insertando en Supabase…")

def insert_ensayo(ensayo: dict, entradas: list) -> bool:
    r = requests.post(f"{URL}/rest/v1/ensayos", headers=HEADERS, json=ensayo)
    if not r.ok:
        print(f"  ✗ {ensayo['localidad']} {ensayo['campana']}: {r.status_code} {r.text[:150]}")
        return False
    data = r.json()
    eid = data[0]["id"] if isinstance(data, list) else data["id"]
    payload = [{"ensayo_id": eid, **e} for e in entradas]
    r2 = requests.post(
        f"{URL}/rest/v1/entradas",
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=payload,
    )
    if not r2.ok:
        print(f"  ✗ entradas {ensayo['localidad']}: {r2.status_code} {r2.text[:150]}")
        return False
    return True

ok = 0
for key, ensayo in trials.items():
    if insert_ensayo(ensayo, trial_entradas[key]):
        ok += 1
    else:
        print(f"  ✗ {key}")

print(f"  RECSO: {ok}/{len(trials)} ensayos cargados")

if insert_ensayo(lajitas_ensayo, lajitas_entradas):
    print(f"  Grupo Lajitas: 1 ensayo · {len(lajitas_entradas)} variedades ✓")
else:
    print(f"  Grupo Lajitas: ✗ error")
