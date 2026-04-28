export interface Ensayo {
  id: string;
  campana: string;
  cultivo: "maiz" | "soja";
  institucion: string;
  red: string;
  localidad: string;
  productor: string | null;
  ambiente: string | null;
  zona: string | null;
  lat: number | null;
  lng: number | null;
  fecha_siembra: string | null;
  created_at: string;
}

export interface Entrada {
  id: string;
  ensayo_id: string;
  hibrido: string;
  rendimiento: number;
}

export interface EnsayoConEntradas extends Ensayo {
  entradas: Entrada[];
}

export interface InaseCatalogEntry {
  n: number;
  c: string; // cultivar
  e: "MAIZ" | "SOJA";
  s: string;  // solicitante_rnc (empresa)
}
