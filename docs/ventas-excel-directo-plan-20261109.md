# Ventas originales desde Excel — diseño de migración y auditoría (2026-11-09)

## Estado: preparación, SIN reemplazo de BI_Ventas en producción

El dashboard de producción mantiene **BI_Ventas** mientras se verifica el motor de lectura directa.
No suspender Power Automate ni eliminar las listas hasta concluir la conciliación.

## Archivos de origen confirmados

| Fuente | Sitio / ruta | Drive / Item |
| --- | --- | --- |
| Resumen comercial | `Comercial / Documentos compartidos / VENTAS / Ventas 2026.xlsx` | `b!tzGM-V4TiUKbUyHUBBu214AiW7yUyvxPnueBG9lB85Wh0Tv-5FAnQqSNjE7rlEJv / 01ZBUZ3OT6NWPAZOQW5BDZ77XXJW7IQXPD` |
| Contratos | `Cobranza / Documentos compartidos / 1. Conciliacion Bancos / ENTRADAS / CONTRATOS / CONTRATOS.xlsx` | `b!EAWNGReAT02APufy0uQPFnDnY1ILcuZGv2EfFdV9rplPAV4rL4C_QoZl8LbKac5c / 01E77UG3RSCUNOWXES7JGJHWKPBVXHOAE2` |

**Permisos:** la aplicación Portal Interno JJP debe tener lectura restringida en el recurso de Comercial. No asumir que los permisos del sitio Cobranza/Finanzas se extienden a Comercial. Verificar mediante token de aplicación, NO mediante la sesión delegada del administrador.

## Estructura y universo revisado

- `Ventas 2026.xlsx` contiene hojas por mes (enero a noviembre), cuadros de proyección, totales por asesor, y una tabla tabular de **633 filas** en el momento del análisis. Dicha tabla tiene columnas `Fecha`, `Mes`, `Asesor`, `Semana`, `Monto_Venta`, `Servicios_AF`, `Servicios_CH`, `TS_TSC`, `Propiedades`, `Nichos`, `Total_Unidades`, `Meta_Mensual`, `Tipo_Registro`, `Fuente`, `Clave_Registro`, `Hoja_Origen`, `Fila_Origen`.
- En `BI_Ventas` había 1,778 filas: **1,141** `Transaccion` de `CONTRATOS` y **637** del archivo de Ventas (**454** `Semanal`, **183** `Mensual`).
- Desfase provisional en esa foto: **4 filas** entre la tabla de 633 y las 637 sincronizadas desde el libro. Puede ser desfase temporal o transformación; es obligatorio comparar por `Clave_Registro` y huella/eTag de la misma versión antes de concluir que hay errores.
- Importes semanales y mensuales **representan dos granularidades del mismo origen**. No sumar `Mensual` y `Semanal` en un único total; el módulo actual puede usarlos en vistas diferentes.
- Los registros `Transaccion` contienen referencia/contrato, fecha, total y tipo; no existen en el resumen tabular de `Ventas 2026.xlsx`. Deben leerse desde `CONTRATOS.xlsx`.
- El rango de datos existente de 2026 no acredita cobertura histórica 2024/2025. No fabricar registros antiguos; localizar libros originales para cada año antes de habilitar esas series.

## Reglas del lector definitivo

1. Acceso Microsoft Graph de **aplicación**, mínimo privilegio por cada archivo/carpeta autorizada. No agregar secretos a PHP público.
2. Descarga privada a temporal con permisos 0600; descargar eTag antes y después, SHA-256 y tamaño. Rechazar archivos cambiados durante lectura, versiones de respaldo o lectura parcial.
3. Leer filas de tablas completas, incluidas ocultas y filtradas. Validar encabezados, claves únicas y tipos; números con enteros de centavos, no flotantes.
4. **Resumen asesor:** detectar de forma inequívoca las filas `Semanal` y `Mensual`; reconciliar cada asesor, mes y total publicado por la hoja mensual. Informar discrepancias sin reemplazar caché validada.
5. **Contratos:** leer hojas origen `LOTES`, `CHURUBUSCO`, `AGUA FRÍA` y demás existentes. Confirmar columnas reales, filas de encabezado, referencia única, fechas y estado del contrato. Deduplicar con clave compuesta `hoja|referencia|número contrato`; definir altas/bajas/cancelaciones antes de publicar métricas.
6. Normalizar nombres y sucursales sin alterar el original: guardar `asesorOriginal`, `sucursalOriginal`, `filaOrigen`, `hojaOrigen` y `fechaExtraccionUTC`.
7. Publicar datos por fuente como conjuntos separados para no duplicar totales: `ventas_asesores`, `ventas_contratos` y `metas_ventas`.
8. Usar cachés privadas validadas y manifiesto ligero. Cron de **15 minutos** (sin un segundo sondeo desde JS). Descargar solo cuando eTag cambie; conservar último snapshot validado ante error.
9. Una vista administrativa protegida mostrará por archivo: verificado, modificado, auditado, discrepancias, datos disponibles, error y versión de motor.
10. Fase de paralelo: reproducir KPI de ventas Previsión, ventas UI, meta mensual, cumplimiento, ventas por asesor, contratos sin asesor, ventas por tipo de servicio y unidades por ubicación; comparar al menos tres meses cerrados y el vigente. Publicar únicamente después de conciliación aprobada.
11. Tras publicación exitosa y seguimiento, detener el Power Automate específico de BI_Ventas; **conservar la lista y su historial como respaldo** hasta aprobación posterior.

## Aceptación para pasar a producción

- Metadatos del Excel accesibles desde el token **de aplicación** (no solo el usuario conectado).
- Todas las claves de ambas fuentes conciliadas en una misma fecha de corte; explicar las 4 filas observadas.
- 100% de meses y contratos esperados cubiertos; discrepancia monetaria de **$0.00** en meses cerrados (o incidencia documentada para corregir origen).
- Indicadores del dashboard coinciden por mes, tipo, origen y asesor; no duplicación Semanal/Mensual.
- Tests unitarios y de integración, respaldo del motor privado y reversión rápida.
- No se modifica producción hasta acreditar estas condiciones.

## Integración segura con gestor GitHub

El nuevo `actualizar-motores.php` permite promover solo motores **ya incluidos en el paquete versionado**, con autorización de administrador, comprobación PHP, respaldo y verificación SHA-256. **No existe todavía `ventas_engine.php` publicado**: la opción de Ventas permanece inactiva hasta que el lector real y su auditoría estén listos.
