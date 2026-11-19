# Conciliación de Ventas Excel vs BI_Ventas — noviembre 2026

**Corte:** 13 de noviembre de 2026. **Modo:** auditoría de solo lectura; no autoriza producción.

## Fuentes verificadas

- `Comercial/VENTAS/Ventas 2026.xlsx`: hoja **NOVIEMBRE**, columna G (mes comercial) y columnas B:F (verificación semanal). Hoja manual **METAS** para metas; no usar `METAS_BI` ni `DASHBOARD`.
- `Cobranza/CONTRATOS.xlsx`: hojas **LOTES**, **CHURUBUSCO** y **AGUA FRIA**. No usar hojas auxiliares generadas por Power Automate.
- Lista de comparación temporal `BI_Ventas` del sitio `CentroControlDireccion`, consultada en modo lectura sobre sus 1,880 registros disponibles al corte.
- Confirmación del endpoint protegido `ventas-excel-preview.php?modo=datos&mes=2026-11`: `validado=true`, `modo=PARALELO_NO_PRODUCTIVO`, `fuenteProductivaSinCambios=true`.

## Resultado de ventas comerciales

| Control | Excel original | BI_Ventas | Nota |
|---|---:|---:|---|
| Venta mensual (solo filas tipo Mensual) | $4,223,572.00 | $4,223,572.00 | **Coinciden exactamente** |
| Filas mensuales de asesores | 19 | 17 | Dos filas de importe cero no están en BI |
| Total de semanas | $4,223,572.00 | $4,338,722.00 | Diferencia **$115,150.00** en datos antiguos BI |
| Metas noviembre en hoja manual METAS | No disponibles | BI contiene valores históricos | No inferir que BI sigue vigente |

### Registros de ventas que explican las diferencias

- `NOELIA`: Excel noviembre **$0**; no tiene fila mensual en BI.
- `ALEXIS(NUEVO)`: Excel noviembre **$0**; no tiene fila mensual en BI.
- `Lupita Soto`: Excel fuente B:F registra **$234,790** (semana 3–8 de noviembre) y no registra importe en semana 1–2. BI tiene **$115,150** adicional en fila **1725**, clave `Ventas 2026|NOVIEMBRE|5|B|Semanal|Lupita Soto`; el importe de **$234,790** sí está en BI, fila **1780**, semana 3–8. El acumulado mensual de ambas fuentes coincide. No usar las filas semanales para incrementar el total mensual.

### Estado de metas

La hoja manual `METAS` del libro Comercial termina con bloques de julio de 2026; no hay un bloque de noviembre de 2026. Por tanto el motor devuelve `metaDisponible=false`, `metaCentavos=null` y `asesoresSinMeta=19`. **Meta no capturada no equivale a meta cero.** No copiar automáticamente las metas de `BI_Ventas`, de `METAS_BI` ni de julio: validar el origen y vigencia con Comercial.

## Resultado de contratos (diagnóstico NO aditivo)

| Control | Excel original | BI_Ventas | Nota |
|---|---:|---:|---|
| Candidatos de noviembre | 8 | 6 | BI omite dos registros del origen |
| Importe nominal | $381,646 | $332,330 | Diferencia $49,316 |
| LOTES | 3 / $229,880 | 3 / $229,880 | Coincide |
| CHURUBUSCO | 3 / $102,450 | 3 / $102,450 | Coincide |
| AGUA FRIA | 2 / $49,316 | 0 / $0 | Falta en BI |

Los contratos de origen del mes no se usan para aumentar el KPI Comercial. Los 106 registros repetidos excluidos que muestra el endpoint son un conteo de **filas históricas ignoradas**, no necesariamente 106 claves únicas duplicadas. Los estados de cancelación, corrección y vigencia siguen requiriendo validación empresarial.

## Barreras antes de producción

1. Aprobar con Comercial si la hoja manual `METAS` se mantendrá y completar metas desde agosto a noviembre (o definir otra fuente manual verificable con vigencia mensual).
2. Mantener el importe mensual de la columna G como única fuente de KPI de ventas; conservar las 19 filas de noviembre, incluidas las de $0.
3. Mantener la vista de contratos independiente: importes nominales solo informativos, con exclusión segura de duplicados y de vigencias no confirmadas.
4. Completar prueba E2E de comparación en vista QA separada, sin reemplazar `app.js` productivo ni `BI_Ventas`.
5. Validar cron privado cada 15 minutos, eTag/SHA y barrera de caché desactualizada; confirmar Graph real y el flujo de recuperación ante fallos.
6. Verificar filtros por asesor, periodo, origen y tipo en todos los meses; documentar criterio de contratos cancelados/corregidos.
7. Solo después de revisión y aprobación, preparar despliegue reversible para Ventas; no mezclar con Ingresos, Egresos, Power Automate ni otros módulos.

**Estado final al corte:** el total mensual de ventas coincide exactamente; no habilitar producción hasta resolver metas y certificación funcional de QA. No se modificaron los archivos originales ni la lista BI.
