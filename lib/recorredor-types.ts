import type { GeoCollection } from "./shapefile";
import type { LotData, RindeData } from "./data-parser";

export type { GeoCollection, LotData, RindeData };

export interface ActiveFilters {
  campaign: string;
  from: string;
  to: string;
  tipos: string[];
  cultivo: string;
  genetica: string;
  prod: string;
}

export const DEFAULT_FILTERS: ActiveFilters = {
  campaign: "",
  from: "",
  to: "",
  tipos: [],
  cultivo: "",
  genetica: "",
  prod: "",
};

// ── Tipo normalization (canonical casing + singular) ─────────────────────────

const CANONICAL_TYPES: Record<string, string> = {
  herbicida:    "Herbicida",
  fungicida:    "Fungicida",
  insecticida:  "Insecticida",
  fertilizante: "Fertilizante",
  fertil:       "Fertilizante",
  coadyuvante:  "Coadyuvante",
  semilla:      "Semilla",
  laboreo:      "Laboreo",
  labranza:     "Labranza",
  fumigacion:   "Fumigación",
  fumigación:   "Fumigación",
  inoculante:   "Inoculante",
  acaricida:    "Acaricida",
  nematicida:   "Nematicida",
  regulador:    "Regulador de crecimiento",
  riego:        "Riego",
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

export const TIPO_COLORS: Record<string, string> = {
  HERBICIDA: "#e2b04a",
  FUNGICIDA: "#3dbb6e",
  INSECTICIDA: "#e24a7a",
  LABRANZA: "#4a9ee2",
  FERTILIZANTE: "#9b59b6",
  SEMILLA: "#1abc9c",
  RIEGO: "#00bcd4",
};

export function tipoColor(tipo: string): string {
  return TIPO_COLORS[tipo?.toUpperCase()] ?? "#8ab";
}

export const WINTER_CROPS = ["trigo", "garbanzo", "cártamo", "cartamo", "cebada"];
export const EMPTY_VAR = ["sd", "s/d", "sin dato", "sindato", "-", "n/a", "na", "nd", "s/i", "sin_dato"];

export function isWinterCrop(cultivo: string): boolean {
  return WINTER_CROPS.some((w) => (cultivo ?? "").toLowerCase().includes(w));
}

export function cleanVariedad(v: string): string {
  return EMPTY_VAR.includes((v ?? "").toLowerCase().trim()) ? "" : (v ?? "").trim();
}

export function cultivoIcon(cultivo: string): string {
  const c = (cultivo ?? "").toLowerCase();
  if (c.includes("maíz") || c.includes("maiz")) return "🌽";
  if (c.includes("soja")) return "🫘";
  if (c.includes("poroto")) return "🫘";
  if (c.includes("trigo")) return "🌾";
  if (c.includes("girasol")) return "🌻";
  if (c.includes("sorgo")) return "🌾";
  if (c.includes("cebada")) return "🌾";
  if (c.includes("alfalfa")) return "🌿";
  if (c.includes("arveja")) return "🫘";
  if (c.includes("garbanzo")) return "🫘";
  if (c.includes("algodón") || c.includes("algodon")) return "🤍";
  return "🌱";
}
