declare module "shpjs" {
  import type { FeatureCollection } from "geojson";

  function shp(data: ArrayBuffer | string): Promise<FeatureCollection | FeatureCollection[]>;
  namespace shp {
    function parseShp(buffer: ArrayBuffer): unknown;
    function parseDbf(buffer: ArrayBuffer): unknown;
    function combine(parts: [unknown, unknown]): Promise<FeatureCollection>;
  }
  export = shp;
}
