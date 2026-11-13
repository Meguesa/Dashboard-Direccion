# Migración Ventas Excel — plan de corte controlado (13 noviembre 2026)

## Validación completada
- QA administrativo: noviembre de 2026, $4,223,572 vendidos, $7,950,000 en metas, 53.13% de cumplimiento y 8 contratos separados. Dos asesores sin meta: Ivette y Otros (Ismael, Daniel, Vicky).
- Motor instalado y validado en QA: `20261113-metas-manuales-3`.
- `BI_Ventas` sigue siendo fuente del Dashboard principal y el flujo Power Automate de carga de Ventas permanece activo.
- Los archivos de QA leen mediante Graph, sin modificar el origen.
- Constructor reversible `tools/build_ventas_excel_candidato.py`, pruebas automatizadas en `tests/test_ventas_candidato.py`.
- **No desplegar ni hacer merge automático de todo PR #30**, porque incluye artefactos privados/QA. Revisar y publicar exclusivamente el overlay del candidato.

## Control de calidad por mes
- Comercial: el KPI mensual viene exclusivamente de la suma de columna G por asesor. Semanas B:F son control de conciliación, no ventas adicionales. Reportar diferencia G − B:F y asesores afectados, nunca sustituir G sin investigación.
- Enero: la fuente tiene discrepancias semanales y el bloque de metas del año no está inequívocamente identificado por el motor. **No publicar meta/cumplimiento de enero como confirmado.**
- Marzo: diferencia histórica G menos semanas de **$4,302** que debe permanecer visible como incidencia y conciliarse.
- Mayo a noviembre: coincidencia mensual/semanal verificada desde el Excel consultado. Diciembre tiene ventas $0 a la fecha y requiere tratamiento de mes futuro (no interpretarlo como incumplimiento).
- Febrero y abril tienen diferencias menores de redondeo/registro de semanas que se conservan como alertas. No ocultarlas.
- Contratos desde LOTES/CHURUBUSCO/AGUA FRIA: detalles separados, importes nominales nunca sumados al KPI mensual y vigencia sin confirmar no implica contrato vigente.
- Uso Inmediato: BI_Servicios aún puede reportar operaciones, pero sus importes no tienen equivalencia comercial acreditada; el Dashboard candidato marca su importe y meta como **No conciliado** y no los agrega a la columna G.

## Barreras técnicas de publicación
1. Evaluar visualmente el candidato de Dashboard completo, incluyendo selector de periodos, KPIs, gráficas, asesores, contratos, módulos Ingresos/Egresos y permisos de usuarios no administradores.
2. Verificar el estado de meses con diferencias históricas, meses sin meta, meses vacíos y mes activo.
3. Confirmar ausencia de referencias productivas a `BI_Ventas` o `BI_Metas_Ventas` en la ruta de Ventas. Conservar otras listas BI que alimentan módulos independientes.
4. Instalar `dashboard_excel_cron.php` versionado con la bandera privada `JJP_VENTAS_EXCEL_2026=1`; ejecutar a los minutos 0,15,30,45 y verificar **tres ciclos** consecutivos; no iniciar múltiples crons solapados.
5. Configurar monitoreo de errores de Graph, cambios de eTag, pérdida de snapshot, diferencias por mes y antigüedad mayor a 30 minutos; una falla deja fuente no disponible, no recurre silenciosamente a `BI_Ventas`.
6. Respaldar `index.php`, `app.js`, `graph.js`, `ventas-excel.php`, `ventas-excel.js`; publicar atómicamente o con ventana de mantenimiento, verificar hash y conservar rollback.
7. Confirmar en el servidor los importes, meta, número de contratos, filtros por asesor y los indicadores sin doble conteo de UI.
8. **Solo después de que el Dashboard productivo esté estable**, identificar con su ID exacto el flujo Power Automate que escribe `BI_Ventas`, desactivarlo (no borrar), y comprobar que ningún otro proceso depende de su ejecución. Mantener la lista antigua como referencia de auditoría temporal.
9. Documentar la hora y responsables del corte y el procedimiento de reversión: restaurar archivos respaldados, desactivar bandera del cron de Ventas y reactivar el flujo de carga si se requiere.
10. No modificar Ingresos/Egresos ni los crons/Power Automate de sus procesos.

## Estado
Se ha construido el paquete de candidato y aprobado CI. **No se ha probado el Dashboard completo en el navegador, no se ha activado el cron privado y no se ha apagado Power Automate.** El corte no está autorizado.

## Preparación del cron independiente de Ventas (13 noviembre 2026)
- Fuente: `cpanel-preview-20261105/private-code/ventas_excel_cron_qa.php` (CLI, sin acceso HTTP). **Solo está versionado en GitHub: NO instalado ni programado en cPanel.**
- Instalar manualmente en la carpeta privada `/home/juanpab1/bi-ingresos-privado/` junto al `ventas_engine.php` ya verificado; comprobar hash y permisos 0600. No colocar el ejecutable en el directorio web.
- Opt-in con variable de entorno `JJP_VENTAS_CRON_QA=1` únicamente en la tarea de cPanel. Si no se establece, retorna 78 sin ejecutar.
- Horario `*/15 * * * *` en hora del servidor, con ruta PHP CLI absoluta validada por el administrador. Ejemplo de comando **para adaptar tras verificar cPanel**: `JJP_VENTAS_CRON_QA=1 /usr/local/bin/php -q /home/juanpab1/bi-ingresos-privado/ventas_excel_cron_qa.php`.
- La tarea solo ejecuta `veRun(false)`, que compara eTags y SHA, protege contra simultaneidad con `flock` y mantiene `fuenteVentasProductiva=false`. No invoca `hsRun` ni `egRun` y no cambia BI_Ventas.
- Verificar tres ejecuciones consecutivas con resultados `auditado` / `sin_cambios`, duración real menor que 15 minutos, timestamps `verificadoUTC`, `ventas_ciclos.jsonl`, disponibilidad del manifiesto autenticado e incidencias de Graph. El lector de Ventas invalida el snapshot a los 30 minutos: evitar interpretar `sin_cambios` como éxito si el estado deja de refrescarse; la función actual actualiza `verificadoUTC` de forma distinta según el caso y necesita validación de frescura extremo a extremo.
- Mantener el cron nuevo **desactivado** hasta instalación y prueba de permisos en cPanel. No activar el cron combinado `dashboard_excel_cron.php` sin revisar la bandera privada y el horario existente, para no duplicar cargas de Ingresos/Egresos.
- Un error `ocupado` (código 75), `incidencia` (código 1) o ausencia de configuración (78) no debe tratarse como ejecución exitosa.
- El cambio de producción y apagado de Power Automate aún requieren aprobación del corte, pruebas E2E y rollback.
