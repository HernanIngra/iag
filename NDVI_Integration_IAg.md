# NDVI Integration in IAg

Documento de referencia para integrar imágenes NDVI de Sentinel-2 en el módulo Recorredor de IAg.
Para implementar cuando Recorredor esté estable. No es un cambio estructural — es una capa adicional sobre el mapa.

---

## 1. Para qué sirve en el contexto de IAg

El scout (ing. agrónomo o monitoreador) está en campo con su tablet o teléfono. Antes de caminar el lote, mira el NDVI satelital de los últimos días para decidir **a qué zona del lote ir**. No es el NDVI del momento exacto — es el del último pasaje de Sentinel-2 (cada ~5 días).

Casos de uso directos:
- Detectar manchas de estrés hídrico o sanitario antes de recorrer
- Estimar en qué parte del lote tiene sentido tomar muestras
- Validar si una aplicación previa tuvo efecto (NDVI antes/después)
- Correlacionar observaciones de la recorrida con el estado satelital

---

## 2. Arquitectura propuesta para la app

**Stack existente:** Next.js + Supabase. Polígonos de lotes ya modelados en GeoJSON.

**Archivos clave ya existentes:**
- `lib/shapefile.ts` — polígonos GeoJSON de los lotes
- `app/recorredor/RecorredorApp.tsx` — módulo principal del Recorredor
- `lib/recorredor-types.ts` — tipos y filtros de campaña

**Componentes a agregar:**

1. **Mapa** — Leaflet o MapLibre GL. Liviano, funciona bien en mobile/tablet.
2. **Capa NDVI como tiles WMS/WMTS** — no se descargan imágenes completas; el servicio devuelve tiles ya renderizados para el bbox visible. Clave para campo con internet móvil limitado.
3. **Selector de fecha** — dropdown con fechas disponibles de la campaña. Al cambiar, se recargan los tiles.
4. **Overlay del lote** — el polígono de Supabase se dibuja sobre el raster NDVI.

---

## 3. Proveedor recomendado: Sentinel Hub

- NDVI pre-calculado vía WMS/WMTS. Una URL de capa, listo.
- Free tier: ~30k requests/mes (suficiente para MVP con varios recorredores).
- Catalog API para listar imágenes disponibles por AOI y rango de fechas con filtro de nubosidad (<20%).
- Planes pagos si escala.

**Seguridad:** las API keys de Sentinel Hub van en `.env`, nunca en el cliente. El cliente consume los tiles vía un API route propio que firma las requests.

### Alternativas evaluadas

| Proveedor | Ventaja | Contra |
|-----------|---------|--------|
| **Sentinel Hub** ⭐ | Llave, tiles listos, free tier | Pago al escalar |
| Google Earth Engine | Gratis, potente para series | Cuotas, no pensado para muchos usuarios concurrentes |
| Copernicus Data Space (ESA) | Oficial, Sentinel-2 crudo | Más trabajo de procesamiento |
| AWS Open Data | Gratuito, S3 | Requiere procesar bandas manualmente |
| Planet / EOSDA | Alta resolución, NDVI listo | Comercial |

---

## 4. Pasos de implementación (cuando arranquemos)

1. Crear cuenta en Sentinel Hub y generar una "configuration" con el layer NDVI.
2. Agregar mapa a `RecorredorApp` (MapLibre GL preferido por performance en mobile).
3. Sumar la capa WMS de Sentinel Hub usando el `instance ID`.
4. Construir el selector de fechas consultando el Catalog API para ver qué imágenes hay sobre el lote con baja nubosidad.
5. Guardar en Supabase las fechas "útiles" por lote para evitar llamadas repetidas al catálogo.

**Prototipo mínimo sugerido para validar:** mapa + lote + NDVI de una fecha fija. Verificar performance en mobile y calidad visual antes de sumar selector dinámico.

---

## 5. Lo que ya existe: pipeline de descarga con GEE

Mientras se integra la visualización en la app, ya hay un pipeline funcional en Python para descargar GeoTIFFs NDVI via Google Earth Engine. Útil para análisis offline, correlación con rendimiento histórico, o alimentar modelos.

**Proyecto GCP:** `astral-charter-457215-j0`
**Lotes trabajados:** campos Tarpuy (El Mistol `EM` y La Iluminada `LI`)
**Guía completa:** `GUIA_COMPLETA_NDVI_OPTIMIZADA.md`

### Scripts disponibles

| Script | Tiempo | Almacenamiento | Uso |
|--------|--------|----------------|-----|
| `descarga_NDVI_GEOTIFF_SIMPLE.py` | 40-50 min | 2 GB | Aprendizaje |
| `descarga_NDVI_CROPPED.py` ⭐ | 15-20 min | 400MB-1GB | Uso general |
| `descarga_NDVI_MOSAIC.py` | 5-10 min | 200-400MB | Análisis temporal |

**Estrategia CROPPED (recomendada):** descarga una imagen general por fecha, calcula NDVI una vez, y recorta al polígono de cada lote. 20 ciclos en vez de 800.

### Patrón de código central

```python
import ee
import geopandas as gpd

ee.Initialize(project='astral-charter-457215-j0')

shp = gpd.read_file('Campos Tarpuy.shp')
shp = shp[shp['Lote'].str.startswith(('EM', 'LI'))]

sentinel = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
            .filterDate('2025-11-01', '2026-04-24')
            .filterBounds(aoi)
            .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 20))

# NDVI: bandas B8 (NIR) y B4 (RED) de Sentinel-2
ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
```

Salida: GeoTIFFs en Google Drive, carpeta `NDVI_Tarpuy_Cropped/`.

---

## 6. Referencia rápida NDVI

| Rango | Interpretación |
|-------|----------------|
| -1 a 0 | Agua, nubes, suelo desnudo |
| 0 a 0.3 | Vegetación escasa / Estrés hídrico |
| 0.3 a 0.5 | Vegetación moderada |
| 0.5 a 0.8 | Vegetación buena / Normal |
| 0.8 a 1.0 | Máxima biomasa / Estado ideal |

- **Fórmula:** `NDVI = (NIR - RED) / (NIR + RED)`
- **Sentinel-2:** NIR = Banda B8, RED = Banda B4, resolución 10m
- **Revisita:** cada ~5 días (15-25 imágenes útiles por campaña de 6 meses, dependiendo de nubes)

---

*Pendiente de implementar. Prioridad: después de que Recorredor esté estable.*
