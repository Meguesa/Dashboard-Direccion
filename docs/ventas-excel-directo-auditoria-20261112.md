# Auditoría de Ventas 2026 y Contratos — 12 noviembre 2026

## Origen verificado

- Comercial: `VENTAS/Ventas 2026.xlsx`, drive `b!tzGM-V4TiUKbUyHUBBu214AiW7yUyvxPnueBG9lB85Wh0Tv-5FAnQqSNjE7rlEJv`, item `01ZBUZ3OT6NWPAZOQW5BDZ77XXJW7IQXPD`.
- Cobranza: `1. Conciliacion Bancos/ENTRADAS/CONTRATOS/CONTRATOS.xlsx`, drive `b!EAWNGReAT02APufy0uQPFnDnY1ILcuZGv2EfFdV9rplPAV4rL4C_QoZl8LbKac5c`, item `01E77UG3RSCUNOWXES7JGJHWKPBVXHOAE2`.

Revisión realizada con extracción textual de Microsoft SharePoint sobre `Ventas 2026.xlsx` (modificación registrada a las 14:00:59 UTC). Esta lectura no acredita todavía acceso del **token de aplicación** de Portal Interno JJP; verificar mediante diagnóstico privado.

## Tabla DASHBOARD de Comercial

641 filas: **459 Semanal**, **182 Mensual**, **0 claves repetidas**. Son representaciones alternativas de ventas, no dos transacciones para sumar juntas.

| Mes | Total Semanal | Total Mensual | Diferencia Mensual - Semanal | Metas en filas Mensual | Metas en tabla específica |
| --- | ---: | ---: | ---: | ---: | ---: |
| Enero | 6,275,702.00 | 6,275,702.00 | 0.00 | 0.00 | sin registros |
| Febrero | 5,385,960.75 | 5,385,960.75 | 0.00 | 6,900,000.00 | 6,900,000.00 |
| Marzo | 7,124,058.00 | 7,128,360.00 | **4,302.00** | 6,900,000.00 | 6,900,000.00 |
| Abril | 6,742,668.00 | 6,742,668.00 | 0.00 | 6,900,000.00 | 6,900,000.00 |
| Mayo | 7,423,115.44 | 7,423,115.44 | 0.00 | 7,100,000.00 | 7,100,000.00 |
| Junio | 8,090,699.60 | 8,090,699.60 | 0.00 | 7,350,000.00 | **7,800,000.00** |
| Julio | 7,363,638.00 | 7,363,638.00 | 0.00 | 7,350,000.00 | **7,800,000.00** |
| Agosto | 7,320,112.00 | 7,320,112.00 | 0.00 | 7,350,000.00 | **7,800,000.00** |
| Septiembre | 9,869,734.00 | 9,869,734.00 | 0.00 | 7,350,000.00 | **7,800,000.00** |
| Octubre | 4,743,971.00 | 4,743,971.00 | 0.00 | 7,350,000.00 | **7,800,000.00** |
| Noviembre | 4,223,572.00 | 4,223,572.00 | 0.00 | 7,000,000.00 | **7,800,000.00** |

Las dos metas provienen de secciones diferentes del MISMO libro. No corregir arbitrariamente una usando la otra: Comercial debe confirmar cuál es la meta oficial de cada mes y vendedor. Mientras existan estas diferencias, no certificar la nueva fuente para la vista de cumplimiento.

## CONTRATOS.xlsx

El conector confirmó que el archivo está en Cobranza y tiene aproximadamente 9.2 MB. No extrajo el texto estructurado; por ello **la estructura actual detallada no está verificada en esta corrida**. La revisión previa del 9 de noviembre encontró 1,096 registros `Transaccion` en la tabla auxiliar `DASHBOARD`, incluidos 9 claves duplicadas en `LOTES`. Estos números históricos no se presentan como cifras actuales.

El motor QA revisará las hojas originales `LOTES`, `CHURUBUSCO` y `AGUA FRÍA`, encabezados y duplicados sin publicar información identificable. Después se desarrollará el lector completo basado en columnas verificadas de esas hojas.

## Puerta de aceptación

1. Permisos de aplicación Microsoft Graph confirmados para ambos libros.
2. Conciliar `Semanal` vs `Mensual` de Comercial, explicar el diferencial de marzo.
3. Definir metas oficiales por vendedor cuando `DASHBOARD` y la tabla de metas discrepan.
4. Deducir contratos desde hojas originales y validar llaves, fechas, tipo, montos y posibles bajas.
5. Comparar por mes/asesor/tipo contra Dashboard actual; demostrar ausencia de doble conteo.
6. Cron cada 15 minutos, snapshots privados con eTag/SHA-256 y bandera visible de desactualización.
7. Mantener `BI_Ventas` hasta certificación y despliegue controlado. No detener Power Automate ahora.

La rama `feature/ventas-excel-directo-20261112` es **QA solamente**. No debe fusionarse o desplegarse en producción sin validación.
