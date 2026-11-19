# Regla de Uso Inmediato: producción versus Excel (19/11/2026)

## Fuente productiva actual (confirmada en main)

- `cpanel-preview-20261105/dashboard-egresos-preview/app.js`:
  `sumarVentasUiPeriodo` → `calcularVentasUiPorResponsable` →
  `obtenerServiciosUsoInmediatoBiServicios`.
- Filtra `state.datos.servicios` por MES del servicio y
  `Prevision_Uso_Inmediato == Uso Inmediato`.
- Si origen `Capillas`, suma `Precio_Venta`.
- Si origen `Parque`, suma `Precio_Total_Servicio`.
- Agrupa por Asesor/Responsable. Es una regla por SERVICIO, no por contrato.
- La lista `BI_Servicios` es el origen productivo actual. La hoja
  `CONTRATOS.xlsx!DASHBOARD` y `Ventas 2026.xlsx!DASHBOARD`
  son salidas de procesos previos; NO son fuente original independiente.

## Comparación observada

| Fuente | Noviembre | Servicios | Resultado |
|---|---:|---:|---:|
| Captura anterior de dashboard productivo (~08:05) | 2026-11 | 15 | MXN 565,952 |
| Consulta BI_Servicios actual, mismo filtro | 2026-11 | 14 | MXN 543,472 |
| Comercial Excel, hoja UI, G14/F14 | 2026-11 | 18 | MXN 622,206 |

**Estos son cortes distintos.** No ajustar a mano $56,254 ni $78,734.
Las diferencias son entre fuente, fecha y precios, no redondeos.

## Registros que prueban la ausencia de equivalencia

- `VI-ATMADEX-4345-AF`: Precio_Venta $47,750 frente a CONTRATOS!Z $49,850.
- `VI-ATMADLX-5572`: Precio_Venta $61,600 frente a CONTRATOS!Z $65,000.
- `CD-URNABAS-5573` y `VC-ATMADLX-4366-AF`: referencias BI sin
  coincidencia exacta en la columna B del Excel de CONTRATOS.
- `VI-ATMADBA-5562`: servicio noviembre, contrato octubre.
- CONTRATOS contiene 70 filas con fecha contractual noviembre 2026
  en LOTES, CHURUBUSCO y AGUA FRIA; NO son 70 servicios UI.

## Diseño sin Power Automate, Office Scripts ni listas BI para Ventas

El libro **Ventas 2026.xlsx** debe incorporar una hoja de registros
operativos `UI_DETALLE` con estas columnas:

`FECHA_SERVICIO,NUMERO_SERVICIO,REFERENCIA_CONTRATO,ORIGEN,
PREVISION_USO_INMEDIATO,ASESOR,PRECIO_VENTA,PRECIO_TOTAL_SERVICIO`

La hoja debe contener una fila por servicio, incluyendo previsión para
poder aplicar el filtro. El motor PHP lee directamente el XLSX original
por Graph usando permisos de solo lectura y eTags, sin flujos ni
ejecución de scripts dentro de Excel. Puede ejecutarse como cron 15 min,
pero **ese cron aún requiere habilitación/validación real**.

La rama QA contiene parser opcional `veUiDetalleOriginal`: si falta
`UI_DETALLE`, declara detalle no disponible; NUNCA sustituye sus
registros con el total mensual de `UI` ni con el precio contractual Z.
La API QA informa disponibilidad, totales/filas y registros revisables.

**Condición de corte productivo:** registrar servicios en Excel con
origen y precio, conciliar por número/fecha/monto al mismo corte,
verificar al menos tres ciclos de actualización de 15 min y realizar
copia de seguridad antes de activar el lector. No fusionar PR #30
ni apagar los flujos de producción hasta satisfacerlo.

Fuente comercial:
https://meguesajdjp.sharepoint.com/sites/Comercial/Documentos%20compartidos/VENTAS/Ventas%202026.xlsx?web=1

Fuente contractual:
https://meguesajdjp.sharepoint.com/sites/Cobranza/Documentos%20compartidos/1.%20Conciliacion%20Bancos/ENTRADAS/CONTRATOS/CONTRATOS.xlsx?web=1
