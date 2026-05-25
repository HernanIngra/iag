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
  fertilizacion: "Fertilizante",
  fertilización: "Fertilizante",
  coadyuvante:  "Coadyuvante",
  semilla:      "Semilla",
  siembra:      "Semilla",       // "Siembra" como tarea → tipo Semilla
  curasemilla:  "Curasemilla",
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

// ── Cultivo normalization ─────────────────────────────────────────────────────
// Catálogo centralizado: los valores de la izquierda son como vienen de cada
// fuente (case-insensitive). Los de la derecha son la forma canónica.
// Sufijos de campo (LL, PB, etc.) se eliminan — el campo no es parte del cultivo.

const CULTIVO_CATALOG: Record<string, string> = {
  // Maíz
  "maiz":                  "Maíz",
  "maíz":                  "Maíz",
  "maiz comun":            "Maíz Común",
  "maíz comun":            "Maíz Común",
  "maíz común":            "Maíz Común",
  "maiz comun ll":         "Maíz Común",
  "maíz común ll":         "Maíz Común",
  "maiz comun pb":         "Maíz Común",
  "maíz común pb":         "Maíz Común",
  "maiz ganadero":         "Maíz Ganadero",
  "maíz ganadero":         "Maíz Ganadero",
  "maiz ganadero ll":      "Maíz Ganadero",
  "maíz ganadero ll":      "Maíz Ganadero",
  // Soja
  "soja":                  "Soja",
  // Trigo
  "trigo":                 "Trigo",
  "trigo pb":              "Trigo",
  "trigo p.b.":            "Trigo",
  // Poroto
  "poroto":                "Poroto",
  "poroto ll":             "Poroto",
  "poroto pb":             "Poroto",
  "por.blanco":            "Poroto Blanco",
  "poroto blanco":         "Poroto Blanco",
  "poroto general":        "Poroto",
  "poroto general ll":     "Poroto",
  "poroto general pb":     "Poroto",
  // Sorgo
  "sorgo":                 "Sorgo",
  "sorgo ll":              "Sorgo",
  "sorgo pb":              "Sorgo",
  // Otros cultivos
  "mungo":                 "Mungo",
  "cayote":                "Cayote",
  "cayote ll":             "Cayote",
  "garbanzo":              "Garbanzo",
  "girasol":               "Girasol",
  "alfalfa":               "Alfalfa",
  "pasturas":              "Pasturas",
  "pastura":               "Pasturas",
  "gramma":                "Gramilla",
  "gramilla":              "Gramilla",
  // Administrativos — quedan vacíos (la fila igual se guarda, filtros la ignoran)
  "estructura":            "Estructura",
  "servicios":             "Servicios",
  "casa ll":               "Servicios",
};

export function normalizeCultivo(raw: string): string {
  if (!raw) return "";
  const key = raw.toLowerCase().trim();
  if (CULTIVO_CATALOG[key] !== undefined) return CULTIVO_CATALOG[key];
  // Fallback: primera letra mayúscula, resto tal como viene
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
