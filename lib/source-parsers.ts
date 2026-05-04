import * as XLSX from "xlsx";
import type { ParsedRow } from "./data-parser";

// ── Source format identifiers ─────────────────────────────────────────────────

export type SourceFormat =
  | "finnegans"
  | "synagro"
  | "excel-propio"
  | "generic";

export const SOURCE_LABELS: Record<SourceFormat, string> = {
  finnegans:      "Finnegans",
  synagro:        "Synagro",
  "excel-propio": "Excel propio",
  generic:        "Otro / mapear manualmente",
};

// ── Type normalization ────────────────────────────────────────────────────────

const CANONICAL_TYPES: Record<string, string> = {
  herbicida:     "Herbicida",
  fungicida:     "Fungicida",
  insecticida:   "Insecticida",
  fertilizante:  "Fertilizante",
  fertil:        "Fertilizante",
  coadyuvante:   "Coadyuvante",
  semilla:       "Semilla",
  laboreo:       "Laboreo",
  fumigacion:    "Fumigación",
  fumigación:    "Fumigación",
  inoculante:    "Inoculante",
  acaricida:     "Acaricida",
  nematicida:    "Nematicida",
  regulador:     "Regulador de crecimiento",
};

export function normalizeProductType(raw: string): string {
  if (!raw) return "";
  const lower = raw.toLowerCase().trim();
  if (CANONICAL_TYPES[lower]) return CANONICAL_TYPES[lower];
  for (const [key, val] of Object.entries(CANONICAL_TYPES)) {
    if (lower.startsWith(key)) return val;
  }
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// ── Campaign normalization ────────────────────────────────────────────────────

function normalizeCampaign(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  const stripped = s.replace(/^C\s*/i, "");           // 'C 25-26' → '25-26'
  const slashMatch = stripped.match(/^(\d{4})\/(\d{4})$/);
  if (slashMatch) return `${slashMatch[1].slice(2)}-${slashMatch[2].slice(2)}`; // '2025/2026' → '25-26'
  return stripped;
}

// ── Date parsing ──────────────────────────────────────────────────────────────

function parseDateCell(raw: unknown): { fecha: Date | null; fechaStr: string; campaign: string } {
  let fecha: Date | null = null;

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    fecha = new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
  } else if (typeof raw === "number" && raw > 40000) {
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
    fecha = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  } else if (typeof raw === "string" && raw.trim()) {
    const s = raw.trim();
    const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (dmyMatch) {
      let [, dd, mm, yy] = dmyMatch;
      if (yy.length === 2) yy = (parseInt(yy) < 50 ? "20" : "19") + yy;
      fecha = new Date(parseInt(yy), parseInt(mm) - 1, parseInt(dd));
    } else {
      const d = new Date(s);
      if (!isNaN(d.getTime())) fecha = d;
    }
  }

  if (!fecha || isNaN(fecha.getTime())) return { fecha: null, fechaStr: "", campaign: "" };

  const fechaStr = fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const m = fecha.getMonth() + 1;
  const y = fecha.getFullYear();
  const startY = m >= 7 ? y : y - 1;
  return { fecha, fechaStr, campaign: `${String(startY).slice(2)}-${String(startY + 1).slice(2)}` };
}

// ── File reader ───────────────────────────────────────────────────────────────

type RawRow = Record<string, unknown>;

function cleanKey(k: string): string {
  return k.replace(/_x000D_/g, "").replace(/[\r\n]+/g, "").trim();
}

async function readAllSheets(file: File): Promise<Record<string, RawRow[]>> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const result: Record<string, RawRow[]> = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    result[name] = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "", header: 1 }) as RawRow[];
  }
  return result;
}

async function readFirstSheet(file: File): Promise<RawRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRow>(ws, { defval: "", header: 1 }) as RawRow[];
}

function findHeaderRow(rows: RawRow[], mustContain: string[]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const vals = Object.values(rows[i]).map((v) => cleanKey(String(v ?? "")).trim());
    if (mustContain.every((k) => vals.some((v) => v.toLowerCase() === k.toLowerCase()))) return i;
  }
  return 0;
}

function applyHeader(rows: RawRow[], headerIdx: number): RawRow[] {
  const headers = Object.values(rows[headerIdx]).map((v) => cleanKey(String(v ?? "")));
  return rows.slice(headerIdx + 1).map((row) => {
    const out: RawRow = {};
    Object.values(row).forEach((v, i) => {
      const k = headers[i] ?? `col${i}`;
      if (k) out[k] = v;
    });
    return out;
  });
}

function colsOf(rows: RawRow[]): string[] {
  return rows.length ? Object.keys(rows[0]).map(cleanKey) : [];
}

// ── Auto-detection (public — used for SourceSelectorModal suggestion) ─────────

export function detectSourceFormat(cols: string[]): SourceFormat {
  const has = (k: string) => cols.some((c) => cleanKey(c).toLowerCase() === k.toLowerCase());
  const hasPartial = (k: string) => cols.some((c) => cleanKey(c).toLowerCase().includes(k.toLowerCase()));

  if (has("TipoDeLabor") || has("Labor/producto") || has("Documento")) return "finnegans";
  if (hasPartial("Lote - Actividad") || (has("Tarea") && has("Insumo"))) return "synagro";
  if (hasPartial("PRODUC")) return "excel-propio";
  return "generic";
}

// ── Row factory ───────────────────────────────────────────────────────────────

function makeRow(
  base: RawRow,
  fields: {
    lote: string; fecha: Date | null; fechaStr: string; campaign: string;
    labor: string; prod: string; tipo: string; dosis: unknown;
    unid: string; cultivo: string; sup: unknown;
  },
  fileName: string
): ParsedRow {
  return {
    ...base,
    _linkKey: fields.lote,
    _fecha: fields.fecha,
    _fechaStr: fields.fechaStr,
    _campaign: fields.campaign,
    _labor: fields.labor,
    _prod: fields.prod,
    _tipo: fields.tipo,
    _dosis: fields.dosis,
    _unid: fields.unid,
    _cultivo: fields.cultivo,
    _genetica: "",
    _sup: fields.sup,
    _file: fileName,
  } as ParsedRow;
}

// ── Finnegans parsers ─────────────────────────────────────────────────────────

function parseFinnegansBase(rows: RawRow[], fileName: string): ParsedRow[] {
  const laborMap = new Map<string, string>();
  for (const row of rows) {
    if (String(row["Tipo"] ?? "").toLowerCase() === "laboreo") {
      const doc = String(row["Documento"] ?? "").trim();
      if (doc) laborMap.set(doc, String(row["Labor/producto"] ?? "").trim());
    }
  }
  return rows
    .filter((row) => String(row["Tipo"] ?? "").toLowerCase() === "insumo")
    .map((row) => {
      const lote = String(row["Lote"] ?? "").trim();
      if (!lote) return null;
      const doc = String(row["Documento"] ?? "").trim();
      const { fecha, fechaStr, campaign } = parseDateCell(row["Fecha"]);
      return makeRow(row, {
        lote,
        fecha, fechaStr,
        campaign: normalizeCampaign(row["Campaña"] as string) || campaign,
        labor: laborMap.get(doc) ?? "",
        prod: String(row["Labor/producto"] ?? "").trim(),
        tipo: normalizeProductType(String(row["Familia"] ?? row["Subfamilia"] ?? "")),
        dosis: row["Cant./ha"],
        unid: String(row["Unidad"] ?? "").trim(),
        cultivo: String(row["Actividad"] ?? "").trim(),
        sup: row["Superficie"],
      }, fileName);
    })
    .filter((r): r is ParsedRow => r !== null && !!r._linkKey);
}

function parseFinnegansCarreta(rows: RawRow[], fileName: string): ParsedRow[] {
  return rows
    .map((row) => {
      const lote = String(row["Lote"] ?? "").trim();
      if (!lote) return null;
      const prod = String(row["Insumo"] ?? "").trim();
      if (!prod) return null;
      const rawDate = row["FechaEjecucion"] ?? row["FechaOrdenada"];
      const { fecha, fechaStr, campaign } = parseDateCell(rawDate);
      return makeRow(row, {
        lote,
        fecha, fechaStr,
        campaign: normalizeCampaign(row["Campana"] as string) || campaign,
        labor: String(row["TipoDeLabor"] ?? "").trim(),
        prod,
        tipo: normalizeProductType(String(row["TipoInsumo"] ?? "")),
        dosis: row["DosisEjecutada"] ?? row["DosisOrdenada"],
        unid: String(row["Unidad"] ?? "").trim(),
        cultivo: String(row["Cultivo"] ?? "").trim(),
        sup: row["SuperficieAplicada"] ?? row["AreaSembrada"],
      }, fileName);
    })
    .filter((r): r is ParsedRow => r !== null && !!r._linkKey);
}

async function parseFinnegans(file: File, fileName: string): Promise<ParsedRow[]> {
  const sheets = await readAllSheets(file);

  // Try Carpeta Agrícola first (has TipoDeLabor)
  for (const [, rawRows] of Object.entries(sheets)) {
    const headerIdx = findHeaderRow(rawRows, ["TipoDeLabor", "Insumo"]);
    const rows = applyHeader(rawRows, headerIdx);
    const cols = colsOf(rows);
    if (cols.includes("TipoDeLabor") && cols.includes("Insumo")) {
      const result = parseFinnegansCarreta(rows, fileName);
      if (result.length > 0) return result;
    }
  }

  // Fallback: Finnegans Base (has Labor/producto + Documento)
  const baseSheetName = Object.keys(sheets).find((n) => n.trim().toLowerCase() === "base") ?? Object.keys(sheets)[0];
  const rawRows = sheets[baseSheetName];
  const headerIdx = findHeaderRow(rawRows, ["Labor/producto", "Tipo"]);
  const rows = applyHeader(rawRows, headerIdx);
  const result = parseFinnegansBase(rows, fileName);
  if (result.length > 0) return result;

  throw new Error("No se pudo interpretar el archivo como Finnegans. Probá con 'Otro / mapear manualmente'.");
}

// ── Synagro parsers ───────────────────────────────────────────────────────────

function parseSynagroInsumos(rows: RawRow[], fileName: string): ParsedRow[] {
  return rows
    .map((row) => {
      const lote = String(row["Lote"] ?? "").trim();
      if (!lote) return null;
      const prod = String(row["Insumo"] ?? "").trim();
      if (!prod) return null;
      const { fecha, fechaStr, campaign } = parseDateCell(row["Fecha"]);
      const cantRaw = String(row["Cant. Aplic."] ?? "").trim();
      const supMatch = cantRaw.match(/^([\d.,]+)/);
      return makeRow(row, {
        lote,
        fecha, fechaStr, campaign,
        labor: String(row["Tarea"] ?? "").trim(),
        prod,
        tipo: "",
        dosis: row["Dosis"],
        unid: String(row["UM"] ?? "").trim(),
        cultivo: String(row["Actividad"] ?? "").trim(),
        sup: supMatch ? parseFloat(supMatch[1].replace(",", ".")) : "",
      }, fileName);
    })
    .filter((r): r is ParsedRow => r !== null && !!r._linkKey);
}

function parseSynagroTareas(rows: RawRow[], fileName: string): ParsedRow[] {
  const sampleCols = colsOf(rows);
  const combinedKey = sampleCols.find((k) => k.includes("Actividad") && k.includes("Lote")) ?? "Lote - Actividad - Establec.";
  return rows
    .map((row) => {
      const combined = String(row[combinedKey] ?? "").trim();
      if (!combined) return null;
      const prod = String(row["Insumo"] ?? "").trim();
      if (!prod) return null;
      const parts = combined.split("-").map((p) => p.trim());
      const lote = parts[0] ?? "";
      if (!lote) return null;
      const { fecha, fechaStr, campaign } = parseDateCell(row["Fecha"]);
      return makeRow(row, {
        lote,
        fecha, fechaStr, campaign,
        labor: String(row["Tarea"] ?? "").trim(),
        prod,
        tipo: "",
        dosis: row["Dosis"],
        unid: String(row["UM"] ?? "").trim(),
        cultivo: parts[1] ?? "",
        sup: row["Superf."] ?? row["Superficie"],
      }, fileName);
    })
    .filter((r): r is ParsedRow => r !== null && !!r._linkKey);
}

async function parseSynagro(file: File, fileName: string): Promise<ParsedRow[]> {
  const rawRows = await readFirstSheet(file);

  // Try Tareas Diarias first (has combined Lote-Actividad column)
  const tareasHeaderIdx = findHeaderRow(rawRows, ["Tarea", "Insumo"]);
  const tareasRows = applyHeader(rawRows, tareasHeaderIdx);
  const tareasCols = colsOf(tareasRows);
  if (tareasCols.some((c) => c.includes("Actividad") && c.includes("Lote"))) {
    const result = parseSynagroTareas(tareasRows, fileName);
    if (result.length > 0) return result;
  }

  // Fallback: Synagro Insumos (has Tarea + Insumo + Establecimiento)
  const insumosHeaderIdx = findHeaderRow(rawRows, ["Tarea", "Insumo", "Establecimiento"]);
  const insumosRows = applyHeader(rawRows, insumosHeaderIdx);
  const result = parseSynagroInsumos(insumosRows, fileName);
  if (result.length > 0) return result;

  throw new Error("No se pudo interpretar el archivo como Synagro. Probá con 'Otro / mapear manualmente'.");
}

// ── Excel propio ──────────────────────────────────────────────────────────────

const LABOR_KEYWORDS = ["siembra", "fumig", "cosecha", "labranz", "admin", "direcc", "labor", "riego", "pulveriz"];

function isLaborType(tipo: string): boolean {
  const lower = tipo.toLowerCase();
  return LABOR_KEYWORDS.some((k) => lower.includes(k));
}

async function parseExcelPropio(file: File, fileName: string): Promise<ParsedRow[]> {
  const rawRows = await readFirstSheet(file);

  // Find header row containing LOTE + a PRODUC-like column
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const vals = Object.values(rawRows[i]).map((v) => String(v ?? "").trim().toUpperCase());
    if (vals.some((v) => v === "LOTE") && vals.some((v) => v.includes("PRODUC"))) {
      headerIdx = i;
      break;
    }
  }
  const rows = applyHeader(rawRows, headerIdx);
  const sampleCols = colsOf(rows);

  const prodLaborKey = sampleCols.find((k) => k.toUpperCase().replace(/[\s/]/g, "").includes("PRODUC")) ?? "PRODUC/LABOR";
  const tipoKey   = sampleCols.find((k) => k.toUpperCase() === "TIPO")    ?? "TIPO";
  const loteKey   = sampleCols.find((k) => k.toUpperCase() === "LOTE")    ?? "LOTE";
  const cultivoKey = sampleCols.find((k) => k.toUpperCase() === "CULTIVO") ?? "CULTIVO";
  const dosisKey  = sampleCols.find((k) => k.toUpperCase() === "DOSIS")   ?? "DOSIS";
  const unidKey   = sampleCols.find((k) => k.toUpperCase() === "UNID")    ?? "UNID";
  const supKey    = sampleCols.find((k) => k.toUpperCase() === "SUP")     ?? "SUP";
  const fechaKey  = sampleCols.find((k) => k.toUpperCase() === "FECHA")   ?? "FECHA";
  const mesKey    = sampleCols.find((k) => k.toUpperCase() === "MES")     ?? "MES";
  const anioKey   = sampleCols.find((k) => k.toUpperCase() === "AÑO" || k.toUpperCase() === "ANO") ?? "AÑO";

  return rows
    .map((row) => {
      const lote = String(row[loteKey] ?? "").trim();
      if (!lote || lote.toUpperCase() === "LOTE") return null;
      const prodLabor = String(row[prodLaborKey] ?? "").trim();
      if (!prodLabor) return null;
      const tipo = String(row[tipoKey] ?? "").trim();
      let { fecha, fechaStr, campaign } = parseDateCell(row[fechaKey]);
      if (!campaign) {
        const m = Number(row[mesKey]);
        const y = Number(row[anioKey]);
        if (!isNaN(m) && !isNaN(y) && y > 2000) {
          const startY = m >= 7 ? y : y - 1;
          campaign = `${String(startY).slice(2)}-${String(startY + 1).slice(2)}`;
        }
      }
      const isLabor = isLaborType(tipo);
      return makeRow(row, {
        lote,
        fecha, fechaStr, campaign,
        labor: isLabor ? prodLabor : "",
        prod: isLabor ? "" : prodLabor,
        tipo: isLabor ? "" : normalizeProductType(tipo),
        dosis: row[dosisKey],
        unid: String(row[unidKey] ?? "").trim(),
        cultivo: String(row[cultivoKey] ?? "").trim(),
        sup: row[supKey],
      }, fileName);
    })
    .filter((r): r is ParsedRow => r !== null && !!r._linkKey);
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function parseWithSource(
  file: File,
  source: SourceFormat,
  fileName?: string
): Promise<ParsedRow[] | null> {
  const name = fileName ?? file.name;
  switch (source) {
    case "finnegans":     return parseFinnegans(file, name);
    case "synagro":       return parseSynagro(file, name);
    case "excel-propio":  return parseExcelPropio(file, name);
    case "generic":       return null;
  }
}
