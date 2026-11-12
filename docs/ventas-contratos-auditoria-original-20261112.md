# Auditoría actualizada de CONTRATOS.xlsx — 12 noviembre 2026

## Fuente real (Cobranza)

Archivo leído en modo solo lectura: `Cobranza / Documentos compartidos / 1. Conciliacion Bancos / ENTRADAS / CONTRATOS / CONTRATOS.xlsx`.

Hojas originales detectadas: `LOTES`, `CHURUBUSCO`, `AGUA FRIA` (sin acento). Todas poseen registros heterogéneos y renglones separadores de mes. La numeración de fila NO es clave estable.

- `LOTES`: 5,319 filas candidatas identificadas por patrón de número de contrato en B.
- `CHURUBUSCO`: 4,994 filas candidatas.
- `AGUA FRIA`: 3,819 filas candidatas.
- **Total:** 14,132 filas candidatas. No equivalen a ventas certificadas; contienen fechas vacías, importes no numéricos, claves repetidas y señales de cancelación.

### Lectura de fechas

- `LOTES` y `AGUA FRIA`: principalmente AA=día, AB=mes, AC=año.
- `CHURUBUSCO`: principalmente AC=día, AD=mes, AE=año.
- Existen filas con columnas desplazadas: detectar ambas ternas por fecha válida e impedir que se use una terna ambigua. No inferir fecha a partir de separadores mensuales.

### Conciliación con la hoja DASHBOARD, corte del archivo examinado

El consolidado contenía 1,099 transacciones, 9 claves `Clave_Registro` repetidas.
Búsqueda por `hoja|número contrato|referencia` contra las tres hojas originales:

| Resultado | Registros |
| --- | ---: |
| Registros consolidados | 1,099 |
| Coincidencias únicas contra originales | 1,078 |
| No encontrados bajo la misma clave | 20 |
| Clave con correspondencia ambigua | 1 |
| Coincidencias únicas con diferencia de fila | 221 |
| Coincidencias únicas con fecha conciliada | 1,078 |
| Coincidencias únicas con importe conciliado | 1,078 |

De 1,078 coincidencias únicas, **todas coinciden tanto en fecha como en importe**. El hecho de que 221 registros se encuentren en otra fila confirma que la fila de origen NO debe usarse como identidad.

Los 20 no encontrados y la coincidencia ambigua requieren revisión de las claves originales y de la lógica actual de actualización. No aplicar deduplicación arbitraria sobre registros cancelados o contratos modificados.

### Auditoría preliminar de 2026 por las ternas de fechas

| Hoja | Filas candidatas con fecha de 2026 |
| --- | ---: |
| LOTES | 447 |
| CHURUBUSCO | 376 |
| AGUA FRIA | 513 |
| **TOTAL** | **1,336** |

Las 1,336 filas todavía no son ventas confirmadas ni equivalen necesariamente a las 1,099 transacciones del consolidado. Se debe explicar el filtro de cancelaciones, duplicados, fechas y tipo antes de sustituir BI_Ventas.

### Cambios implementados en rama QA

- `ventas_engine.php` compara por claves compuestas normalizadas SHA-256, y nunca incluye claves personales en resultados de auditoría.
- Lee importes monetarios de columna Z con manejo de formatos `$ 12,345.67`, `-`, nulos y números.
- Extrae fecha desde ambos conjuntos de ternas.
- Emite recuentos de candidatos, posibles cancelaciones, duplicados, calidad de fechas y correlación con hoja auxiliar.
- Nunca activa automáticamente la sustitución de `BI_Ventas`.

**Pendiente para fase producción:** desarrollar clasificación certificada de ventas vigentes vs canceladas y determinar cuál es el indicador oficial para cada mes/asesor. Validar token **de aplicación** y ejecución del servidor con cron de 15 minutos.

*No se modificó ningún documento de Comercial ni de Cobranza. El análisis solo leyó los libros.*
