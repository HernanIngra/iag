import * as XLSX from "xlsx";
import Papa from "papaparse";

export interface ParsedRow {
  [key: string]: unknown;
  _linkKey: string;
  _fecha: Date | null;
  _fechaStr: string;
  _tipo: string;
  _labor: string;
  _prod: string;
  _dosis: unknown;
  _unid: string;
  _cultivo: string;
  _genetica: string;
  _sup: unknown;
  _campaign: string;
  _file: string;
}

export interface RindeRow {
  campana: string;
  cultivo: string;
  tipoCorr: string;
  genetica: string;
  rinde: number;
}

export type LotData = Record<string, ParsedRow[]>;
export type RindeData = Record<string, RindeRow[]>;

// Canonical column mapping — all keys optional (empty string = not mapped)
export interface ColumnMapping {
  linkCol: string;
  dateCol: string;
  tipoCol: string;
  laborCol: string;
  prodCol: string;
  dosisCol: string;
  unidCol: string;
  cultivoCol: string;
  geneticaCol: string;
  supCol: string;
}

function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    Object.entries(row).forEach(([k, v]) => {
      const cleanKey = k.replace(/_x000D_/g, "").replace(/[\r\n]+/g, "").trim();
      out[cleanKey] = v;
    });
    return out;
  });
}

function detectDelimiter(text: string): string {
  const sample = text.slice(0, 800);
  const counts: Record<string, number> = {
    ";": (sample.match(/;/g) || []).length,
    ",": (sample.match(/,/g) || []).length,
    "\t": (sample.match(/\t/g) || []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

async function readFile(file: File): Promise<Record<string, unknown>[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    const delim = detectDelimiter(text);
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: delim,
    });
    return normalizeRows(result.data);
  }
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return normalizeRows(XLSX.utils.sheet_to_json(ws, { defval: "" }));
}

function parseDateCell(rawDate: unknown): { fecha: Date | null; fechaStr: string; campaign: string } {
  let fecha: Date | null = null;
  let fechaStr = "";
  let campaign = "";

  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    fecha = new Date(rawDate.getUTCFullYear(), rawDate.getUTCMonth(), rawDate.getUTCDate());
  } else if (typeof rawDate === "number" && rawDate > 40000) {
    const d = new Date(Date.UTC(1899, 11, 30) + rawDate * 86400000);
    fecha = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  } else if (typeof rawDate === "string" && rawDate.trim()) {
    const s = rawDate.trim();
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

  if (fecha && !isNaN(fecha.getTime())) {
    fechaStr = fecha.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const m = fecha.getMonth() + 1;
    const y = fecha.getFullYear();
    const startY = m >= 8 ? y : y - 1;
    campaign = `${String(startY).slice(2)}-${String(startY + 1).slice(2)}`;
  }

  return { fecha, fechaStr, campaign };
}

// Auto-detect canonical column mapping from a list of column names.
// Returns best guesses; empty string means "not found".
export function detectColumnMapping(cols: string[], linkCol: string): ColumnMapping {
  const uc = (s: string) => s.toUpperCase();

  const laborCol = cols.find((c) => uc(c) === "LABOR") ?? "";
  const prodCol =
    cols.find((c) => uc(c).replace(/[\s/]/g, "") === "PRODUCTOLABOR") ??
    cols.find((c) => uc(c).includes("PRODUC") && uc(c) !== "LABOR") ??
    "";

  return {
    linkCol,
    dateCol: cols.find((c) => uc(c) === "FECHA") ?? "",
    tipoCol: cols.find((c) => uc(c) === "TIPO") ?? "",
    laborCol,
    prodCol: prodCol || laborCol,
    dosisCol: cols.find((c) => uc(c) === "DOSIS") ?? "",
    unidCol: cols.find((c) => uc(c) === "UNID") ?? "",
    cultivoCol: cols.find((c) => uc(c) === "CULTIVO") ?? "",
    geneticaCol:
      cols.find((c) =>
        ["GENETICA", "GENÉTICA", "VARIEDAD", "VARIETAL", "HIBRIDO", "HÍBRIDO"].includes(
          uc(c).replace(/\s/g, "")
        )
      ) ?? "",
    supCol: cols.find((c) => uc(c) === "SUP") ?? "",
  };
}

export async function parseManagementFile(
  file: File,
  mapping: ColumnMapping,
  fileName?: string
): Promise<{ rows: ParsedRow[]; lotData: LotData }> {
  const raw = await readFile(file);
  if (!raw.length) throw new Error("El archivo está vacío");

  const { linkCol, dateCol, tipoCol, laborCol, prodCol, dosisCol, unidCol, cultivoCol, geneticaCol, supCol } = mapping;
  const hasSeparateLaborProd = !!(laborCol && prodCol && laborCol !== prodCol);

  const cols = Object.keys(raw[0]);
  const mesCol = cols.find((c) => c.toUpperCase() === "MES");
  const anioCol = cols.find((c) => c.toUpperCase() === "AÑO" || c.toUpperCase() === "ANO");

  const allRows: ParsedRow[] = raw
    .map((row) => {
      let { fecha, fechaStr, campaign } = parseDateCell(dateCol ? row[dateCol] : undefined);
      if (!campaign && anioCol && mesCol) {
        const m = Number(row[mesCol]);
        const y = Number(row[anioCol]);
        const startY = m >= 8 ? y : y - 1;
        campaign = `${String(startY).slice(2)}-${String(startY + 1).slice(2)}`;
      }
      return {
        ...row,
        _linkKey: String(row[linkCol] ?? "").trim(),
        _fecha: fecha,
        _fechaStr: fechaStr,
        _tipo: tipoCol ? String(row[tipoCol] ?? "").trim() : "",
        _labor: hasSeparateLaborProd ? String(row[laborCol!] ?? "").trim() : "",
        _prod: prodCol ? String(row[prodCol] ?? "").trim() : "",
        _dosis: dosisCol ? row[dosisCol] : "",
        _unid: unidCol ? String(row[unidCol] ?? "").trim() : "",
        _cultivo: cultivoCol ? String(row[cultivoCol] ?? "").trim() : "",
        _genetica: geneticaCol ? String(row[geneticaCol] ?? "").trim() : "",
        _sup: supCol ? row[supCol] : "",
        _campaign: campaign,
        _file: fileName ?? file.name,
      } as ParsedRow;
    })
    .filter((r) => r._linkKey);

  const lotData: LotData = {};
  allRows.forEach((row) => {
    if (!lotData[row._linkKey]) lotData[row._linkKey] = [];
    lotData[row._linkKey].push(row);
  });

  return { rows: allRows, lotData };
}

export async function parseRindeFile(file: File, linkColumn?: string): Promise<RindeData> {
  const raw = await readFile(file);
  if (!raw.length) throw new Error("El archivo está vacío");

  const cols = Object.keys(raw[0]);

  const lotCol =
    linkColumn ||
    cols.find((c) => c.trim().toUpperCase().replace(/\s+/g, "") === "LOTECORREGIDO") ||
    cols.find((c) => c.trim().toUpperCase() === "LOTE");
  const campCol = cols.find((c) => c.trim().toUpperCase().includes("CAMPA"));
  const cultivoCol =
    cols.find((c) => c.trim() === "Cultivo corregido") ||
    cols.find((c) => c.trim().toUpperCase().includes("CULTIVO CORREGIDO")) ||
    cols.find((c) => c.trim().toUpperCase().includes("CULTIVO"));
  const tipoCorCol =
    cols.find((c) => c.trim() === "Tipo corregido") ||
    cols.find((c) => c.trim().toUpperCase().includes("TIPO CORREGIDO"));
  const geneticaCol =
    cols.find((c) => c.trim() === "Genetica corregida") ||
    cols.find((c) => c.trim().toUpperCase().includes("GENETIC"));
  const rindeCol =
    cols.find((c) => c.trim() === "Rendimiento/ha") ||
    cols.find((c) => c.trim().toUpperCase().includes("RENDIMIENTO"));

  if (!lotCol) throw new Error(`No se encontró columna "Lote". Columnas: ${cols.slice(0, 5).join(", ")}`);

  const rindeData: RindeData = {};

  raw.forEach((row) => {
    const key = String(row[lotCol] ?? "").trim();
    if (!key || key.startsWith("=")) return;
    const rinde = Number(row[rindeCol ?? ""] ?? 0);
    if (rinde <= 0 || isNaN(rinde)) return;

    if (!rindeData[key]) rindeData[key] = [];
    rindeData[key].push({
      campana: String(row[campCol ?? ""] ?? "").trim(),
      cultivo: String(row[cultivoCol ?? ""] ?? "").trim(),
      tipoCorr: tipoCorCol ? String(row[tipoCorCol] ?? "").trim() : "",
      genetica: geneticaCol ? String(row[geneticaCol] ?? "").trim() : "",
      rinde,
    });
  });

  return rindeData;
}

export function detectLinkColumns(file: File): Promise<string[]> {
  return readFile(file).then((rows) => {
    if (!rows.length) return [];
    return Object.keys(rows[0]);
  });
}
