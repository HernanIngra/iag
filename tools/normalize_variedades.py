"""
Normaliza nombres de variedades en la tabla `entradas` de Supabase.

Reglas aplicadas (en orden):
  1. Uppercase + strip espacios
  2. Corrección de prefijos de marca por OCR (0M→DM, OM→DM, 810→BIO, etc.)
  3. Eliminación de todos los espacios internos
  4. Sustitución dígito/letra en código numérico: B↔8, O↔0, I↔1
     (solo cuando el carácter está rodeado de dígitos, para no romper sufijos como IPRO, SCE, etc.)

Por defecto genera el reporte sin modificar. Pasá --apply para escribir en la DB.
Correr desde raíz del proyecto: python3 tools/normalize_variedades.py [--apply]
"""

import sys, re, requests

APPLY = "--apply" in sys.argv

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
}

# ── Normalización ─────────────────────────────────────────────────────────────

# Sufijos reconocidos (de mayor a menor longitud para evitar match parcial)
KNOWN_SUFFIXES = sorted(
    [
        "IPROSTS", "RRSTS", "GRTS", "IPRO", "SCE", "STS", "RSF", "RR", "CE", "SE", "PRO", "GR", "TS", "E",
        # Technology/trait names — NOT OCR errors
        "VIP3CL", "VTPRO4", "VIP3", "VIP4", "PRO4",
    ],
    key=len, reverse=True,
)

# Correcciones de prefijo de marca por OCR
OCR_BRAND_FIXES = [
    (r"^0M",  "DM"),   # 0 misread como D
    (r"^OM",  "DM"),   # O misread como D
    (r"^810", "BIO"),  # 8→B, 1→I, 0→O
    (r"^8IO", "BIO"),
    (r"^81O", "BIO"),
    (r"^8IO", "BIO"),
    (r"^8RV", "BRV"),  # 8→B
]

DIGIT_SUBS = {"B": "8", "O": "0", "I": "1"}


def normalize(raw: str) -> str:
    """
    Devuelve el nombre normalizado.
    El string vacío indica que hay que omitir la entrada.
    """
    s = raw.strip().upper()
    if not s:
        return s

    # 1. Corregir prefijo de marca por OCR
    for pattern, replacement in OCR_BRAND_FIXES:
        s = re.sub(pattern, replacement, s)

    # 2. Eliminar todos los espacios
    s = s.replace(" ", "")

    # 3. Separar: marca (alpha inicial) + resto
    m = re.match(r"^([A-Z]*)(.*)$", s)
    brand = m.group(1) if m else ""
    rest  = m.group(2) if m else s

    # 4. Separar sufijo reconocido del final
    suffix = ""
    for suf in KNOWN_SUFFIXES:
        if rest.endswith(suf):
            suffix = suf
            rest = rest[: -len(suf)]
            break

    # 5. Sustituciones B↔8, O↔0, I↔1 en código numérico
    #    Solo cuando el carácter está dentro de un radio de 2 de algún dígito
    core = list(rest)
    for i, c in enumerate(core):
        if c in DIGIT_SUBS:
            window = rest[max(0, i - 2): i] + rest[i + 1: min(len(rest), i + 3)]
            if any(x.isdigit() for x in window):
                core[i] = DIGIT_SUBS[c]
    rest = "".join(core)

    return brand + rest + suffix


# ── Leer todas las entradas ───────────────────────────────────────────────────

print("→ Leyendo entradas desde Supabase…")
r = requests.get(
    f"{URL}/rest/v1/entradas",
    headers={**HEADERS, "Range": "0-9999", "Prefer": "count=exact"},
    params={"select": "id,hibrido,ensayo_id"},
)
if not r.ok:
    raise SystemExit(f"Error al leer entradas: {r.status_code} {r.text[:200]}")

entradas = r.json()
print(f"  {len(entradas)} entradas totales")

# ── Calcular cambios ──────────────────────────────────────────────────────────

changes: list[dict] = []   # {id, old, new}
no_change = 0

for e in entradas:
    old = e["hibrido"]
    new = normalize(old)
    if new and new != old:
        changes.append({"id": e["id"], "old": old, "new": new})
    else:
        no_change += 1

print(f"  {len(changes)} nombres cambian · {no_change} ya están normalizados\n")

# ── Reporte ───────────────────────────────────────────────────────────────────

# Agrupar por tipo de cambio
only_spaces    = [c for c in changes if c["old"].replace(" ", "").upper() == c["new"]]
ocr_prefix     = [c for c in changes if c not in only_spaces and
                  any(re.match(p, c["old"].strip().upper()) for p, _ in OCR_BRAND_FIXES)]
char_sub       = [c for c in changes if c not in only_spaces and c not in ocr_prefix and
                  c["old"].strip().upper().replace(" ", "") != c["new"]]
other          = [c for c in changes if c not in only_spaces and c not in ocr_prefix and c not in char_sub]

print(f"{'TIPO':<22} {'CANTIDAD':>8}")
print(f"{'─'*22} {'─'*8}")
print(f"{'Solo espacios':<22} {len(only_spaces):>8}")
print(f"{'OCR prefijo marca':<22} {len(ocr_prefix):>8}")
print(f"{'Sustitución carácter':<22} {len(char_sub):>8}")
print(f"{'Otro':<22} {len(other):>8}")
print(f"{'TOTAL':<22} {len(changes):>8}\n")

print(f"{'ID':>6}  {'ANTES':<40} {'DESPUÉS'}")
print(f"{'─'*6}  {'─'*40} {'─'*35}")

for c in sorted(changes, key=lambda x: x["old"]):
    print(f"{c['id']:>6}  {c['old']!r:<40} → {c['new']!r}")

# ── Aplicar si se pidió ───────────────────────────────────────────────────────

if not APPLY:
    print(f"\n[PREVIEW] {len(changes)} cambios pendientes. Corré con --apply para escribir.")
    sys.exit(0)

print(f"\n→ Aplicando {len(changes)} correcciones…")
ok = err = 0
for c in changes:
    r = requests.patch(
        f"{URL}/rest/v1/entradas",
        headers={**HEADERS, "Prefer": "return=minimal"},
        params={"id": f"eq.{c['id']}"},
        json={"hibrido": c["new"]},
    )
    if r.ok:
        ok += 1
    else:
        print(f"  ✗ id={c['id']}: {r.status_code} {r.text[:100]}")
        err += 1

print(f"✓ {ok} actualizadas · {err} errores")
