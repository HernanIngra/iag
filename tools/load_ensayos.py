"""
Carga los ensayos de Ensayos_norte_24-25.xlsx a Supabase.
Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local
Correr desde la raíz del proyecto: python3 tools/load_ensayos.py
"""
import openpyxl, requests
from collections import defaultdict

# ── Leer .env.local ──────────────────────────────────────────────────────────

env = {}
with open(".env.local") as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()

URL = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
KEY = env.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not URL or not KEY:
    raise SystemExit("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")

HEADERS = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation,resolution=merge-duplicates",
}

# ── Leer Excel ───────────────────────────────────────────────────────────────

XLSX = "comparador/Info/Ensayos_norte_24-25.xlsx"
wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
ws = wb.active

# Columnas: Institución(0) Red(1) Loc(2) Productor(3) Ambiente(4) Zona(5)
#           IA(6) Rango(7) Híbrido(8) Rendimiento(9) Latitud(10) Longitud(11)

trials: dict[tuple, dict] = {}
trial_entradas: dict[tuple, list] = defaultdict(list)

for row in ws.iter_rows(min_row=2, values_only=True):
    inst = str(row[0] or "").strip()
    red  = str(row[1] or "").strip()
    loc  = str(row[2] or "").strip()
    prod = str(row[3] or "").strip() or None
    amb  = str(row[4] or "").strip() or None
    zona = str(row[5] or "").strip() or None
    hibrido = str(row[8] or "").strip()
    rend    = row[9]
    lat     = row[10]
    lng     = row[11]

    if not inst or not loc or not hibrido or rend is None:
        continue

    key = (inst, red, loc, amb)
    if key not in trials:
        trials[key] = {
            "campana": "24-25",
            "cultivo": "maiz",
            "institucion": inst,
            "red": red,
            "localidad": loc,
            "productor": prod,
            "ambiente": amb,
            "zona": zona,
            "lat": float(lat) if lat is not None else None,
            "lng": float(lng) if lng is not None else None,
        }

    trial_entradas[key].append({
        "hibrido": hibrido,
        "rendimiento": float(rend),
    })

wb.close()
print(f"→ {len(trials)} ensayos encontrados en el Excel")

# ── Insertar ensayos ─────────────────────────────────────────────────────────

ok = 0
for key, ensayo in trials.items():
    r = requests.post(f"{URL}/rest/v1/ensayos", headers=HEADERS, json=ensayo)
    if not r.ok:
        print(f"  ✗ ensayo {key}: {r.status_code} {r.text[:120]}")
        continue

    data = r.json()
    ensayo_id = data[0]["id"] if isinstance(data, list) else data["id"]

    entradas = [{"ensayo_id": ensayo_id, **e} for e in trial_entradas[key]]
    re = requests.post(f"{URL}/rest/v1/entradas", headers={**HEADERS, "Prefer": "return=minimal"}, json=entradas)
    if not re.ok:
        print(f"  ✗ entradas {key}: {re.status_code} {re.text[:120]}")
        continue

    ok += 1

print(f"✓ {ok}/{len(trials)} ensayos cargados correctamente")
