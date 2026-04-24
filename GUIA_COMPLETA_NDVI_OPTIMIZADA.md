# Guía Completa: Descarga NDVI Optimizada de Google Earth Engine

## Resumen ejecutivo

Esta guía recapitula el proceso completo para descargar imágenes NDVI de Google Earth Engine de forma optimizada. Incluye 3 versiones de scripts que evolucionan desde lo básico hasta análisis temporal avanzado.

**Versión mejorada**: Descarga general + crop automático (vs. archivo individual por lote)

---

## 1. Conceptos Fundamentales

### ¿Qué es NDVI?

**NDVI** = Normalized Difference Vegetation Index (Índice de Vegetación por Diferencia Normalizada)

Fórmula:
```
NDVI = (NIR - RED) / (NIR + RED)
```

Donde:
- **NIR** = Infrarrojo cercano (banda 8 de Sentinel-2)
- **RED** = Luz roja visible (banda 4 de Sentinel-2)

### Interpretación

| Rango | Interpretación |
|-------|----------------|
| -1 a 0 | Agua, nubes, suelo desnudo |
| 0 a 0.3 | Vegetación escasa / Estrés hídrico |
| 0.3 a 0.5 | Vegetación moderada |
| 0.5 a 0.8 | Vegetación buena / Normal |
| 0.8 a 1.0 | Máxima biomasa / Estado ideal |

### Casos de uso agrícola

- **Detección de estrés hídrico**: NDVI bajo + decreciente = falta agua
- **Estimación de rendimiento**: NDVI promedio alto correlaciona con mejor cosecha
- **Detección de plagas**: Parches de NDVI bajo indican problemas fitosanitarios
- **Prescripción variable**: Crear mapas de aplicación diferenciada por NDVI
- **Monitoreo temporal**: Series de imágenes para validar modelos de cultivos

---

## 2. Configuración de Google Earth Engine

### Requisitos previos

1. **Cuenta Google** (gratuita)
2. **Registro en Google Earth Engine** (https://developers.google.com/earth-engine/guides/access)
3. **Google Cloud Project** con Earth Engine API habilitada
4. **Python 3.7+**

### Instalación de librerías

```bash
pip install earthengine-api geopandas pandas matplotlib openpyxl --break-system-packages
```

### Pasos de configuración

#### 1. Registrarse en Earth Engine
1. Ve a: https://developers.google.com/earth-engine/guides/access
2. Click en "Sign Up"
3. Completa el formulario (ejemplo: "Análisis NDVI de campos agrícolas")
4. Espera aprobación (generalmente inmediata)

#### 2. Habilitar Earth Engine API en Google Cloud
1. Ve a: https://console.cloud.google.com/
2. Verifica estar en tu proyecto correcto
3. Habilita la API: https://console.cloud.google.com/apis/library/earthengine.googleapis.com
4. Click en "ENABLE" (botón azul)
5. Espera 1-2 minutos

#### 3. Autenticación en Python
```python
import ee

# Primera vez
ee.Authenticate()      # Abre navegador para autorizar

# En sesiones posteriores (con proyecto específico)
ee.Initialize(project='astral-charter-457215-j0')
```

**Nota crítica**: El `project` debe ser el ID exacto de tu Google Cloud Project.

---

## 3. Las 3 Versiones de Scripts

### Versión 1: GEOTIFF_SIMPLE (Original)

**Archivo**: `descarga_NDVI_GEOTIFF_SIMPLE.py`

**Estrategia**:
- Para cada lote y cada fecha: descarga, calcula NDVI, exporta

**Resultado**:
- 800 archivos (40 lotes × 20 fechas)
- 2 GB de almacenamiento
- 40-50 minutos de procesamiento

**Cuándo usar**:
- Análisis simple por fecha
- Eres principiante con GIS
- No importa el tamaño de descarga

```bash
python descarga_NDVI_GEOTIFF_SIMPLE.py
```

---

### Versión 2: CROPPED (Optimizada) ⭐ RECOMENDADA

**Archivo**: `descarga_NDVI_CROPPED.py`

**Estrategia**:
```
Para cada fecha:
  1. Descargar imagen general (bounding box de todos los lotes)
  2. Calcular NDVI
  3. Para cada lote: cropear al polígono
  4. Exportar lote cropeado a Google Drive
```

**Resultado**:
- 800 archivos (40 lotes × 20 fechas)
- **400 MB - 1 GB** total (4x menos)
- **15-20 minutos** (2-3x más rápido)
- Valores NDVI consistentes entre lotes adyacentes

**Ventajas**:
- ✅ Mucho más rápido
- ✅ Menos almacenamiento
- ✅ Precisión geográfica garantizada
- ✅ Compatible con QGIS/ArcGIS
- ✅ Análisis por lote detallado

**Cuándo usar**:
- ✅ Análisis por lote detallado
- ✅ Comparaciones entre lotes adyacentes
- ✅ Validación de modelos
- ✅ **Para la mayoría de casos**

```bash
python descarga_NDVI_CROPPED.py
```

---

### Versión 3: MOSAIC (Análisis temporal)

**Archivo**: `descarga_NDVI_MOSAIC.py`

**Estrategia**:
```
Para cada lote:
  1. Descargar todas las imágenes (todas las fechas)
  2. Calcular NDVI para todas
  3. Apilar (stack) en una sola imagen
  4. Cropear al polígono
  5. Exportar 1 TIF con 20 bandas (=20 fechas)
```

**Resultado**:
- **40 archivos totales** (uno por lote)
- **200-400 MB** total
- **5-10 minutos** de procesamiento
- 20 bandas por archivo (una por fecha)

**Ventajas**:
- ✅ Súper rápido (solo 40 descargas)
- ✅ Mínimo almacenamiento
- ✅ Análisis temporal nativo en QGIS
- ✅ Ideal para machine learning

**Cuándo usar**:
- ✅ Análisis temporal (series de tiempo)
- ✅ Detección de cambios
- ✅ Modelos predictivos
- ✅ Stack de datos para análisis avanzado

```bash
python descarga_NDVI_MOSAIC.py
```

**Ejemplo de uso en QGIS**:
```
1. Abre NDVI_MOSAIC_EM5.tif
2. En Propiedades → Simbología
3. Elige banda (1-20) para ver fecha específica
4. Banda 1 = 2025-11-01, Banda 2 = 2025-11-06, etc.
```

---

## 4. Errores Comunes y Soluciones

### Error: "Not signed up for Earth Engine or project is not registered"

**Causa**: El proyecto Google Cloud no tiene Earth Engine API habilitada.

**Solución**:
1. Ve a Google Cloud Console: https://console.cloud.google.com/
2. Verifica estar en el proyecto correcto (esquina superior izquierda)
3. Ve a: https://console.cloud.google.com/apis/library/earthengine.googleapis.com
4. Click en "ENABLE" (botón azul)
5. Espera 1-2 minutos
6. Intenta de nuevo

### Error: "SSL: CERTIFICATE_VERIFY_FAILED"

**Causa**: Problemas con certificados SSL del sistema.

**Solución macOS**:
```bash
/Applications/Python\ 3.13/Install\ Certificates.command
```

**Solución universal**:
```bash
pip install --upgrade certifi --break-system-packages
```

### Error: "AttributeError: 'Polygon' object has no attribute 'geom_geojson'"

**Causa**: Versión incompatible de `shapely`.

**Solución**: Usar `__geo_interface__` en lugar de `geom_geojson()`:
```python
geom = ee.Geometry(row.geometry.__geo_interface__)  # ✅ Funciona en todas las versiones
```

### Error: "Invalid GeoJSON geometry" al crear bounding box

**Causa**: Formato incorrecto del bounding box.

**Solución correcta**:
```python
bounds = shp.total_bounds  # [minx, miny, maxx, maxy]
bbox_polygon = {
    'type': 'Polygon',
    'coordinates': [[
        [bounds[0], bounds[1]],
        [bounds[2], bounds[1]],
        [bounds[2], bounds[3]],
        [bounds[0], bounds[3]],
        [bounds[0], bounds[1]]  # Cerrar polígono
    ]]
}
aoi = ee.Geometry(bbox_polygon)
```

### Error: "Not authorized" o credenciales expiradas

**Solución**:
```bash
# Eliminar credenciales en caché
rm ~/.config/earthengine/credentials

# Re-autenticar desde cero
python
>>> import ee
>>> ee.Authenticate()
>>> ee.Initialize(project='astral-charter-457215-j0')
>>> exit()
```

---

## 5. Optimización: De Individual a General + Crop

### ¿Por qué es más eficiente?

| Métrica | Individual | General + Crop |
|---------|-----------|----------------|
| Descargas GEE | 800 | 800 (pero más rápidas) |
| Tiempo procesamiento | 40-50 min | 15-20 min |
| Almacenamiento | 2 GB | 400-1000 MB |
| Consistencia espacial | ❌ Inconsistente | ✅ Consistente |

### Flujo comparado

**ANTES (Individual)**:
```
Fecha 1, Lote 1: Descargar → Calcular NDVI → Exportar
Fecha 1, Lote 2: Descargar → Calcular NDVI → Exportar
...
800 ciclos totales
```

**AHORA (General + Crop)**:
```
Fecha 1: Descargar imagen general (1 vez)
         Calcular NDVI (1 vez)
         ├─ Lote 1: Cropear → Exportar
         ├─ Lote 2: Cropear → Exportar
         └─ Lote 40: Cropear → Exportar
20 ciclos totales (una por fecha)
```

### Ventaja adicional: Consistencia

Con descarga individual, los valores NDVI en los bordes de polígonos adyacentes pueden diferir porque provienen de imágenes ligeramente diferentes.

Con descarga general + crop, todos los lotes usan la **misma imagen base**, garantizando consistencia en bordes compartidos.

---

## 6. Flujo de Trabajo Completo

### Paso 1: Instalación y configuración (primera vez)

```bash
pip install earthengine-api geopandas pandas matplotlib openpyxl --break-system-packages
```

### Paso 2: Autenticación

```bash
python

>>> import ee
>>> ee.Authenticate()  # Se abre navegador, autoriza
>>> ee.Initialize(project='astral-charter-457215-j0')
>>> exit()
```

### Paso 3: Ejecutar script elegido

**Opción A (Recomendada)**:
```bash
python descarga_NDVI_CROPPED.py
```

**Opción B (Análisis temporal)**:
```bash
python descarga_NDVI_MOSAIC.py
```

### Paso 4: Descargar de Google Drive

1. Ve a https://drive.google.com/
2. Busca carpeta: `NDVI_Tarpuy_Cropped/` (o `NDVI_Mosaicos/`)
3. Descarga todos los `.tif`

### Paso 5: Visualizar en QGIS

```
Capa → Añadir capa raster → Selecciona .tif
```

---

## 7. Componentes Clave de los Scripts

### Autenticación e inicialización

```python
import ee

try:
    try:
        ee.Initialize(project='astral-charter-457215-j0')
    except:
        ee.Initialize()
    print("✓ Conectado")
except Exception as e:
    print(f"✗ Error: {e}")
    exit(1)
```

**Por qué el try/except doble**: Algunos proyectos requieren especificar el ID, otros no.

### Cargar y filtrar polígonos

```python
import geopandas as gpd

shp = gpd.read_file('Campos Tarpuy.shp')

# Filtrar solo El Mistol (EM) y La Iluminada (LI)
shp = shp[shp['Lote'].str.startswith(('EM', 'LI'))].reset_index(drop=True)

# Convertir a geometría Earth Engine
geom = ee.Geometry(row.geometry.__geo_interface__)
```

### Crear bounding box para el área de estudio

```python
# CORRECTO (GeoJSON válido)
bounds = shp.total_bounds  # [minx, miny, maxx, maxy]
bbox_polygon = {
    'type': 'Polygon',
    'coordinates': [[
        [bounds[0], bounds[1]],
        [bounds[2], bounds[1]],
        [bounds[2], bounds[3]],
        [bounds[0], bounds[3]],
        [bounds[0], bounds[1]]
    ]]
}
aoi = ee.Geometry(bbox_polygon).buffer(100)

# INCORRECTO ❌
aoi = ee.Geometry(shp.total_bounds.tolist())  # No es GeoJSON válido
```

### Cargar colección Sentinel-2

```python
sentinel = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
            .filterDate('2025-11-01', '2026-04-24')
            .filterBounds(aoi)  # Filtro crucial para velocidad
            .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 20))
```

**Parámetros clave**:
- `'COPERNICUS/S2_SR_HARMONIZED'`: Sentinel-2 con corrección radiométrica
- `filterDate()`: Rango temporal (ISO 8601: YYYY-MM-DD)
- `filterBounds(aoi)`: ⭐ Fundamental para velocidad (filtra antes de procesamiento)
- `filterMetadata()`: Filtro de nubes (0-100%, recomendado < 20%)

### Calcular NDVI

```python
# En Sentinel-2: B8=NIR, B4=RED
ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
```

### Cropear imagen al polígono

```python
# Versión CROPPED: Cropear cada lote
ndvi_cropped = ndvi.clip(geom)

# Esto reduce el tamaño del archivo final
# Y garantiza que solo se exporta el área del lote
```

### Exportar como GeoTIFF

```python
task = ee.batch.Export.image.toDrive(
    image=ndvi_cropped,
    description='NDVI_EM5_20251101',
    folder='NDVI_Tarpuy_Cropped',    # Carpeta en Google Drive
    fileNamePrefix='NDVI_EM5_20251101',
    scale=10,                         # Resolución en metros
    region=geom.bounds(),             # Área a exportar
    fileFormat='GeoTIFF',
    crs='EPSG:4326'                   # WGS84 (lat/lon)
)
task.start()
```

**Importante**: Las imágenes se exportan a Google Drive, no localmente.

### Apilar múltiples imágenes (MOSAIC)

```python
# Stack temporal: combina múltiples NDVI en bandas
mosaico = lote_images.toBands()

# Esto crea 1 imagen con N bandas (N = número de fechas)
# Banda 1 = NDVI fecha 1
# Banda 2 = NDVI fecha 2
# ... etc
```

---

## 8. Datos Sentinel-2

### Bandas principales

| Banda | Nombre | Longitud onda | Resolución | Uso |
|-------|--------|---------------|-----------|-----|
| B2 | Azul | 490 nm | 10m | Agua, nubes |
| B3 | Verde | 560 nm | 10m | Vegetación |
| B4 | Rojo | 665 nm | 10m | **NDVI (RED)** |
| B8 | NIR | 842 nm | 10m | **NDVI (NIR)** |
| B11 | SWIR | 1610 nm | 20m | Humedad |

### Características de Sentinel-2

- **Resolución**: 10-60m según banda
- **Cobertura**: Mundo entero
- **Revisita**: Cada 5 días
- **Datos**: Abiertos (Copernicus)
- **Cobertura nubosa**: Variable por región (15-25 imágenes en 6 meses típicamente)

---

## 9. Casos de Uso Reales

### Caso 1: Detección de estrés hídrico

**Proceso**:
1. Descargar NDVI semanal (script CROPPED)
2. Plotear tendencia temporal para cada lote
3. NDVI decreciente = falta agua

### Caso 2: Predicción de rendimiento

**Proceso**:
1. Descargar NDVI todo el ciclo (script CROPPED)
2. Calcular NDVI promedio del ciclo
3. Correlacionar con rendimiento histórico

### Caso 3: Análisis temporal avanzado

**Proceso**:
1. Descargar mosaico temporal (script MOSAIC)
2. En QGIS: visualizar cambios banda a banda
3. En Python: calcular índices de volatilidad

---

## 10. Lecciones Aprendidas

### Configuración crítica

1. **Proyecto Google Cloud debe estar especificado**: `ee.Initialize(project='...')`
2. **Earth Engine API debe estar habilitada**: En Google Cloud Console
3. **Usuario debe estar registrado**: En el programa de Earth Engine

### Debugging

```python
# Verificar autenticación
ee.Authenticate()  # Debe devolver True

# Verificar inicialización
ee.Initialize(project='astral-charter-457215-j0')  # Sin errores

# Probar con pequeña colección
ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').size().getInfo()
```

### Compatibilidad

- **Shapely**: Usar `__geo_interface__` (universal)
- **Geopandas**: Compatible con Shapely 2.0+
- **GeoJSON**: Estructura válida es crítica

### Performance

- **Sentinel-2**: Pasa cada 5 días (~36 imágenes en 6 meses, menos con nubes)
- **Filtro de área**: `filterBounds()` es fundamental (acelera 10x)
- **Google Drive**: Cuello de botella para descargas (pero es donde se guardan)

---

## 11. Ejemplo de Código Mínimo

```python
import ee
import geopandas as gpd
import pandas as pd

# Autenticar
ee.Initialize(project='astral-charter-457215-j0')

# Cargar polígonos
shp = gpd.read_file('Campos Tarpuy.shp')
shp = shp[shp['Lote'].str.startswith(('EM', 'LI'))]

# Crear bounding box
bounds = shp.total_bounds
bbox_polygon = {
    'type': 'Polygon',
    'coordinates': [[
        [bounds[0], bounds[1]],
        [bounds[2], bounds[1]],
        [bounds[2], bounds[3]],
        [bounds[0], bounds[3]],
        [bounds[0], bounds[1]]
    ]]
}
aoi = ee.Geometry(bbox_polygon)

# Sentinel-2
sentinel = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
            .filterDate('2025-11-01', '2026-04-24')
            .filterBounds(aoi)
            .filterMetadata('CLOUDY_PIXEL_PERCENTAGE', 'less_than', 20))

# Procesar
results = []
for idx, row in shp.iterrows():
    lote = row['Lote']
    geom = ee.Geometry(row.geometry.__geo_interface__)
    
    lote_images = sentinel.filterBounds(geom)
    
    for img_feature in lote_images.getInfo()['features'][:1]:  # Primera imagen
        image = ee.Image(img_feature['id'])
        ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
        ndvi_cropped = ndvi.clip(geom)
        
        # Estadísticas
        stats = ndvi_cropped.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=geom,
            scale=10,
            maxPixels=1e8
        ).getInfo()
        
        # Exportar
        task = ee.batch.Export.image.toDrive(
            image=ndvi_cropped,
            description=f'NDVI_{lote}',
            folder='NDVI_Example',
            scale=10,
            region=geom.bounds(),
            fileFormat='GeoTIFF',
            crs='EPSG:4326'
        )
        task.start()

print(f"✓ {len(results)} imágenes en descarga")
```

---

## 12. Checklist para Próximos Proyectos

- [ ] Google Account con Earth Engine registrado
- [ ] Google Cloud Project con API habilitada
- [ ] Python 3.7+ instalado
- [ ] Librerías instaladas: `earthengine-api geopandas pandas matplotlib openpyxl`
- [ ] Shapefile con polígonos de estudio
- [ ] Rango de fechas definido
- [ ] Proyecto ID correcto en script
- [ ] Google Drive con espacio disponible
- [ ] QGIS o ArcGIS para visualizar

---

## 13. Referencias Útiles

- **Google Earth Engine**: https://developers.google.com/earth-engine
- **Sentinel-2**: https://sentinel.esa.int/web/sentinel/missions/sentinel-2
- **NDVI**: https://en.wikipedia.org/wiki/Normalized_difference_vegetation_index
- **GeoTIFF**: https://www.awaresystems.be/imaging/tiff/geotiff/
- **QGIS**: https://www.qgis.org/

---

## 14. Resumen Final

### 3 Scripts disponibles

| Script | Velocidad | Almacenamiento | Mejor para |
|--------|-----------|-----------------|-----------|
| GEOTIFF_SIMPLE | Lento (40-50 min) | 2 GB | Aprendizaje |
| **CROPPED** | Rápido (15-20 min) | 400-1 GB | **Uso general** |
| MOSAIC | Muy rápido (5-10 min) | 200-400 MB | Análisis temporal |

### Recomendación: Usa CROPPED

```bash
python descarga_NDVI_CROPPED.py
```

Es el equilibrio perfecto entre velocidad, almacenamiento y usabilidad.

---

**Documento actualizado**: Abril 2026  
**Versión**: 2.0 (Optimizada con descarga general + crop)  
**Caso de uso**: Análisis NDVI de campos agrícolas (Tarpuy)  
**Tecnología**: Google Earth Engine + Sentinel-2 + Python
