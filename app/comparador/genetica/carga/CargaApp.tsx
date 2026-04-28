"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { insertEnsayo, insertEntradas } from "@/lib/comparador-db";
import type { InaseCatalogEntry } from "@/lib/comparador-types";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EntradaRow {
  hibrido: string;
  rendimiento: string;
}

interface FormState {
  campana: string;
  cultivo: "maiz" | "soja";
  institucion: string;
  red: string;
  localidad: string;
  productor: string;
  ambiente: string;
  zona: string;
  lat: string;
  lng: string;
  fecha_siembra: string;
  entradas: EntradaRow[];
}

interface PreviewRow {
  [key: string]: string | number | null;
}

// ── INASE autocomplete input ──────────────────────────────────────────────────

function InaseInput({
  value,
  onChange,
  catalog,
  cultivo,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  catalog: InaseCatalogEntry[];
  cultivo: "maiz" | "soja";
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const especie = cultivo === "maiz" ? "MAIZ" : "SOJA";
  const suggestions = catalog
    .filter(
      (e) =>
        e.e === especie && e.c.toLowerCase().includes(value.toLowerCase())
    )
    .slice(0, 12);

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "Híbrido / variedad…"}
        style={{
          width: "100%",
          background: "#0f2040",
          border: "1px solid #1a4a80",
          borderRadius: 8,
          padding: "7px 10px",
          color: "#e0e0e0",
          fontSize: 13,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {open && suggestions.length > 0 && (
        <ul
          style={{
            position: "absolute",
            zIndex: 200,
            top: "100%",
            left: 0,
            right: 0,
            background: "#16213e",
            border: "1px solid #0f3460",
            borderRadius: 8,
            margin: "2px 0 0",
            padding: 0,
            listStyle: "none",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {suggestions.map((s) => (
            <li
              key={s.n + s.c}
              onMouseDown={() => {
                onChange(s.c);
                setOpen(false);
              }}
              style={{
                padding: "7px 12px",
                cursor: "pointer",
                fontSize: 12,
                color: "#aac4e0",
                borderBottom: "1px solid #0f2040",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#1a3060")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "transparent")
              }
            >
              {s.c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Formulario tab ────────────────────────────────────────────────────────────

function FormularioTab({
  catalog,
}: {
  catalog: InaseCatalogEntry[];
}) {
  const supabase = createSupabaseBrowserClient();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [form, setForm] = useState<FormState>({
    campana: "24-25",
    cultivo: "maiz",
    institucion: "",
    red: "",
    localidad: "",
    productor: "",
    ambiente: "",
    zona: "",
    lat: "",
    lng: "",
    fecha_siembra: "",
    entradas: [{ hibrido: "", rendimiento: "" }],
  });

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function setEntrada(i: number, k: keyof EntradaRow, v: string) {
    setForm((prev) => ({
      ...prev,
      entradas: prev.entradas.map((e, j) => (j === i ? { ...e, [k]: v } : e)),
    }));
  }

  function addEntrada() {
    setForm((prev) => ({
      ...prev,
      entradas: [...prev.entradas, { hibrido: "", rendimiento: "" }],
    }));
  }

  function removeEntrada(i: number) {
    setForm((prev) => ({
      ...prev,
      entradas: prev.entradas.filter((_, j) => j !== i),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const validEntradas = form.entradas.filter(
      (row) => row.hibrido.trim() && row.rendimiento.trim()
    );
    if (!form.institucion || !form.localidad || validEntradas.length === 0) {
      setMsg({ type: "err", text: "Completá institución, localidad y al menos una entrada." });
      return;
    }

    setSaving(true);
    try {
      const ensayoData = {
        campana: form.campana,
        cultivo: form.cultivo,
        institucion: form.institucion,
        red: form.red,
        localidad: form.localidad,
        productor: form.productor || null,
        ambiente: form.ambiente || null,
        zona: form.zona || null,
        lat: form.lat ? parseFloat(form.lat) : null,
        lng: form.lng ? parseFloat(form.lng) : null,
        fecha_siembra: form.fecha_siembra || null,
      };
      const { id } = await insertEnsayo(supabase, ensayoData);
      await insertEntradas(
        supabase,
        validEntradas.map((row) => ({
          ensayo_id: id,
          hibrido: row.hibrido.trim(),
          rendimiento: parseFloat(row.rendimiento),
        }))
      );
      setMsg({ type: "ok", text: `✓ Ensayo guardado (${validEntradas.length} entradas).` });
      setForm((prev) => ({ ...prev, entradas: [{ hibrido: "", rendimiento: "" }] }));
    } catch (err) {
      setMsg({ type: "err", text: String(err) });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%",
    background: "#0f2040",
    border: "1px solid #1a4a80",
    borderRadius: 8,
    padding: "8px 10px",
    color: "#e0e0e0",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const labelStyle = { fontSize: 11, color: "#6a8ab0", fontWeight: 600, marginBottom: 4, display: "block" as const };

  const gridStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Ensayo data */}
      <div
        style={{
          background: "#16213e",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h3 style={{ color: "#e2b04a", fontSize: 14, fontWeight: 700, margin: 0 }}>
          Datos del ensayo
        </h3>

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Campaña</label>
            <input value={form.campana} onChange={(e) => set("campana", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Cultivo</label>
            <select
              value={form.cultivo}
              onChange={(e) => set("cultivo", e.target.value as "maiz" | "soja")}
              style={{ ...inputStyle }}
            >
              <option value="maiz">Maíz</option>
              <option value="soja">Soja</option>
            </select>
          </div>
        </div>

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Institución *</label>
            <input value={form.institucion} onChange={(e) => set("institucion", e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Red de ensayos</label>
            <input value={form.red} onChange={(e) => set("red", e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Localidad *</label>
            <input value={form.localidad} onChange={(e) => set("localidad", e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Zona</label>
            <input value={form.zona} onChange={(e) => set("zona", e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Productor</label>
            <input value={form.productor} onChange={(e) => set("productor", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Ambiente</label>
            <input value={form.ambiente} onChange={(e) => set("ambiente", e.target.value)} placeholder="Ej: A1, Alto, Bajo…" style={inputStyle} />
          </div>
        </div>

        <div style={gridStyle}>
          <div>
            <label style={labelStyle}>Latitud</label>
            <input type="number" step="any" value={form.lat} onChange={(e) => set("lat", e.target.value)} placeholder="-26.5" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Longitud</label>
            <input type="number" step="any" value={form.lng} onChange={(e) => set("lng", e.target.value)} placeholder="-63.5" style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Fecha de siembra</label>
          <input type="date" value={form.fecha_siembra} onChange={(e) => set("fecha_siembra", e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} />
        </div>
      </div>

      {/* Entradas */}
      <div
        style={{
          background: "#16213e",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <h3 style={{ color: "#e2b04a", fontSize: 14, fontWeight: 700, margin: 0 }}>
          Entradas (híbridos)
        </h3>

        {form.entradas.map((row, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <InaseInput
              value={row.hibrido}
              onChange={(v) => setEntrada(i, "hibrido", v)}
              catalog={catalog}
              cultivo={form.cultivo}
            />
            <input
              type="number"
              step="any"
              value={row.rendimiento}
              onChange={(e) => setEntrada(i, "rendimiento", e.target.value)}
              placeholder="kg/ha"
              style={{ ...inputStyle, width: 90, flexShrink: 0 }}
            />
            {form.entradas.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntrada(i)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#4a6a8a",
                  cursor: "pointer",
                  fontSize: 18,
                  padding: "0 4px",
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={addEntrada}
          style={{
            background: "none",
            border: "1px dashed #1a4a80",
            borderRadius: 8,
            color: "#4a6a8a",
            cursor: "pointer",
            padding: "8px",
            fontSize: 13,
          }}
        >
          + Agregar entrada
        </button>
      </div>

      {msg && (
        <p
          style={{
            background: msg.type === "ok" ? "#0a2a0f" : "#2a0a1a",
            color: msg.type === "ok" ? "#3dbb6e" : "#e24a7a",
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
          }}
        >
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        style={{
          background: saving ? "#1a4a80" : "#3dbb6e",
          border: "none",
          borderRadius: 12,
          color: "#fff",
          fontWeight: 700,
          fontSize: 15,
          padding: "14px",
          cursor: saving ? "not-allowed" : "pointer",
        }}
      >
        {saving ? "Guardando…" : "Guardar ensayo"}
      </button>
    </form>
  );
}

// ── CSV tab ───────────────────────────────────────────────────────────────────

function CSVTab() {
  const supabase = createSupabaseBrowserClient();
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [allRows, setAllRows] = useState<PreviewRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMsg(null);
    try {
      const XLSX = (await import("xlsx")).default;
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<PreviewRow>(ws, { defval: null });
      if (rows.length === 0) {
        setMsg({ type: "err", text: "El archivo está vacío." });
        setLoading(false);
        return;
      }
      setHeaders(Object.keys(rows[0]));
      setAllRows(rows);
      setPreview(rows.slice(0, 10));
    } catch (err) {
      setMsg({ type: "err", text: `Error leyendo archivo: ${err}` });
    } finally {
      setLoading(false);
    }
    e.target.value = "";
  }

  async function handleUpload() {
    if (allRows.length === 0) return;
    setSaving(true);
    setMsg(null);

    // Group by (Institución, Red, Localidad, Ambiente) — matching Excel column names
    const groups = new Map<string, { meta: PreviewRow; entradas: { hibrido: string; rendimiento: number }[] }>();

    for (const row of allRows) {
      const inst = String(row["Institución"] ?? row["Institucion"] ?? "").trim();
      const red = String(row["Red"] ?? "").trim();
      const loc = String(row["Loc"] ?? row["Localidad"] ?? "").trim();
      const amb = String(row["Ambiente"] ?? "").trim() || null;
      const hibrido = String(row["Híbrido"] ?? row["Hibrido"] ?? "").trim();
      const rend = parseFloat(String(row["Rendimiento"] ?? "0").replace(",", "."));

      if (!inst || !loc || !hibrido || isNaN(rend)) continue;

      const key = `${inst}||${red}||${loc}||${amb ?? ""}`;
      if (!groups.has(key)) {
        groups.set(key, { meta: row, entradas: [] });
      }
      groups.get(key)!.entradas.push({ hibrido, rendimiento: rend });
    }

    let ok = 0;
    let fail = 0;
    for (const [, { meta, entradas }] of groups) {
      const inst = String(meta["Institución"] ?? meta["Institucion"] ?? "").trim();
      const red = String(meta["Red"] ?? "").trim();
      const loc = String(meta["Loc"] ?? meta["Localidad"] ?? "").trim();
      const prod = String(meta["Productor"] ?? "").trim() || null;
      const amb = String(meta["Ambiente"] ?? "").trim() || null;
      const zona = String(meta["Zona"] ?? "").trim() || null;
      const lat = parseFloat(String(meta["Latitud"] ?? ""));
      const lng = parseFloat(String(meta["Longitud"] ?? ""));

      try {
        const { id } = await insertEnsayo(supabase, {
          campana: "24-25",
          cultivo: "maiz",
          institucion: inst,
          red,
          localidad: loc,
          productor: prod,
          ambiente: amb,
          zona,
          lat: isNaN(lat) ? null : lat,
          lng: isNaN(lng) ? null : lng,
          fecha_siembra: null,
        });
        await insertEntradas(
          supabase,
          entradas.map((e) => ({ ensayo_id: id, ...e }))
        );
        ok++;
      } catch {
        fail++;
      }
    }
    setSaving(false);
    setMsg({
      type: fail === 0 ? "ok" : "err",
      text: `${ok} ensayo${ok !== 1 ? "s" : ""} cargado${ok !== 1 ? "s" : ""}${fail > 0 ? ` · ${fail} fallido${fail !== 1 ? "s" : ""}` : ""}.`,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "#16213e",
          borderRadius: 12,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h3 style={{ color: "#e2b04a", fontSize: 14, fontWeight: 700, margin: 0 }}>
          Subir archivo CSV o XLSX
        </h3>
        <p style={{ color: "#4a6a8a", fontSize: 12, margin: 0 }}>
          Columnas esperadas: Institución, Red, Loc, Productor, Ambiente, Zona, Híbrido,
          Rendimiento, Latitud, Longitud (mismo formato que Ensayos_norte_24-25.xlsx)
        </p>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            border: "2px dashed #1a4a80",
            borderRadius: 10,
            padding: 24,
            cursor: "pointer",
            color: "#4a6a8a",
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 28 }}>📁</span>
          {loading ? "Leyendo…" : "Elegir archivo (.xlsx, .csv)"}
          <input
            type="file"
            accept=".xlsx,.csv,.xls"
            onChange={handleFile}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div
          style={{
            background: "#16213e",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <p style={{ color: "#aac4e0", fontSize: 13, margin: 0 }}>
            {allRows.length} filas · primeras {preview.length} mostradas
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: "100%" }}>
              <thead>
                <tr>
                  {headers.slice(0, 10).map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "4px 10px",
                        borderBottom: "1px solid #0f3460",
                        color: "#e2b04a",
                        fontWeight: 600,
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {headers.slice(0, 10).map((h) => (
                      <td
                        key={h}
                        style={{
                          padding: "3px 10px",
                          borderBottom: "1px solid #0f2040",
                          color: "#aac4e0",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row[h] !== null ? String(row[h]).slice(0, 20) : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {msg && (
            <p
              style={{
                background: msg.type === "ok" ? "#0a2a0f" : "#2a0a1a",
                color: msg.type === "ok" ? "#3dbb6e" : "#e24a7a",
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
              }}
            >
              {msg.text}
            </p>
          )}

          <button
            onClick={handleUpload}
            disabled={saving}
            style={{
              background: saving ? "#1a4a80" : "#3dbb6e",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              padding: "12px",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Cargando…" : `Cargar ${allRows.length} filas →`}
          </button>
        </div>
      )}

      {msg && preview.length === 0 && (
        <p
          style={{
            background: msg.type === "ok" ? "#0a2a0f" : "#2a0a1a",
            color: msg.type === "ok" ? "#3dbb6e" : "#e24a7a",
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
          }}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CargaApp() {
  const [tab, setTab] = useState<"formulario" | "csv">("formulario");
  const [catalog, setCatalog] = useState<InaseCatalogEntry[]>([]);

  useEffect(() => {
    fetch("/comparador/inase-catalog.json")
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => {});
  }, []);

  return (
    <main style={{ background: "#1a1a2e", minHeight: "100vh", padding: "16px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <Link href="/comparador" style={{ color: "#4a6a8a", fontSize: 13, display: "block", marginBottom: 16 }}>
            ← Comparador
          </Link>
          <h1 style={{ color: "#e2b04a", fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
            Carga de ensayos
          </h1>
          <p style={{ color: "#6a8ab0", fontSize: 13 }}>
            Agregá nuevos ECR a la base de datos.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#0f2040", borderRadius: 10, padding: 4 }}>
          {(["formulario", "csv"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: tab === t ? "#16213e" : "transparent",
                color: tab === t ? "#e2b04a" : "#4a6a8a",
                fontWeight: tab === t ? 700 : 400,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {t === "formulario" ? "📝 Formulario" : "📁 CSV / XLSX"}
            </button>
          ))}
        </div>

        {tab === "formulario" ? (
          <FormularioTab catalog={catalog} />
        ) : (
          <CSVTab />
        )}
      </div>
    </main>
  );
}
