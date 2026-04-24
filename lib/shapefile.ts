import type { FeatureCollection, Feature, Geometry } from "geojson";

export type GeoCollection = FeatureCollection<Geometry, Record<string, unknown>>;

function fixEncoding(str: string): string {
  try {
    return decodeURIComponent(escape(str));
  } catch {
    return str;
  }
}

function fixCollectionEncoding(col: GeoCollection): GeoCollection {
  col.features.forEach((f) => {
    const p = f.properties ?? {};
    Object.keys(p).forEach((k) => {
      if (typeof p[k] === "string") p[k] = fixEncoding(p[k] as string);
    });
  });
  return col;
}

export function getLotName(props: Record<string, unknown>): string {
  return String(props.Lote ?? props.LOTE ?? props.lote ?? "?").trim();
}

export function getCampo(props: Record<string, unknown>): string {
  return (
    String(
      props.establecimiento ??
        props.Establecimiento ??
        props.ESTABLECIMIENTO ??
        props.campo ??
        props.Campo ??
        props.CAMPO ??
        props.layer ??
        props.Layer ??
        props.LAYER ??
        props.zona ??
        props.Zona ??
        props.ZONA ??
        ""
    ).trim() || "Sin campo"
  );
}

export async function loadShapefiles(files: FileList | File[]): Promise<GeoCollection[]> {
  const fileArr = Array.from(files);

  // Dynamic import — shpjs uses browser APIs, cannot be imported at module level
  const shp = (await import("shpjs")).default;

  const zipFile = fileArr.find((f) => f.name.toLowerCase().endsWith(".zip"));
  if (zipFile) {
    const buffer = await zipFile.arrayBuffer();
    const geojson = await shp(buffer);
    const collections = Array.isArray(geojson) ? geojson : [geojson];
    return (collections as GeoCollection[]).map(fixCollectionEncoding);
  }

  const shpFile = fileArr.find((f) => f.name.toLowerCase().endsWith(".shp"));
  const dbfFile = fileArr.find((f) => f.name.toLowerCase().endsWith(".dbf"));
  const shxFile = fileArr.find((f) => f.name.toLowerCase().endsWith(".shx"));

  if (!shpFile || !dbfFile) throw new Error("Falta el .shp o el .dbf");

  const [shpBuf, dbfBuf] = await Promise.all([
    shpFile.arrayBuffer(),
    dbfFile.arrayBuffer(),
    shxFile ? shxFile.arrayBuffer() : Promise.resolve(null),
  ]);

  const geojson = (await shp.combine([
    shp.parseShp(shpBuf),
    shp.parseDbf(dbfBuf),
  ])) as GeoCollection;

  return [fixCollectionEncoding(geojson)];
}

export const ZONE_COLORS = [
  "#e2b04a", "#4a9ee2", "#3dbb6e", "#e24a7a", "#9b59b6",
  "#1abc9c", "#e67e22", "#3498db", "#e91e63", "#00bcd4",
];

export const CULTIVO_COLORS = [
  "#3dbb6e", "#e2b04a", "#4a9ee2", "#e24a7a", "#9b59b6",
  "#1abc9c", "#f39c12", "#e74c3c", "#2980b9", "#8e44ad",
];

export function buildColorMap(collections: GeoCollection[]): Record<string, string> {
  const zones = new Set<string>();
  collections.forEach((col) =>
    col.features.forEach((f) => zones.add(getCampo(f.properties ?? {})))
  );
  const map: Record<string, string> = {};
  Array.from(zones).forEach((z, i) => {
    map[z] = ZONE_COLORS[i % ZONE_COLORS.length];
  });
  return map;
}

export function buildCultivoColorMap(cultivoNames: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  [...cultivoNames].sort().forEach((c, i) => {
    map[c] = CULTIVO_COLORS[i % CULTIVO_COLORS.length];
  });
  return map;
}
