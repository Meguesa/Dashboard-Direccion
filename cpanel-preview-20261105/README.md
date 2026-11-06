# Código recuperado de cPanel: migración Excel

Estado: pruebas. No aprobado para producción. Rama sin despliegue automático.

## Contenido

- dashboard-excel-preview/: histórico de Ingresos instalado, restringido al auditor.
- dashboard-egresos-preview/: ambiente separado para los dos lectores. Egresos está bloqueado por autorización de Microsoft 365; no hay cachés de Egresos publicadas en el servidor.
- private-code/: código que debe permanecer fuera de public_html, archivos 0600 y carpeta 0700. Usa la configuración privada preexistente del Portal. No se incluye configuración, credenciales, Excel ni movimientos.
- server_code_hashes.json: hashes de los 46 archivos comparados contra cPanel.

No copiar este snapshot sobre /dashboard/ sin terminar la revisión financiera, adaptar y probar los permisos de Dirección/Finanzas y obtener aprobación expresa. El main actual y sus workflows aún construyen el lector anterior; la promoción debe actualizar el paquete de despliegue y sus verificaciones para que un despliegue posterior no sobrescriba la migración.

## Automatización

Cron existente: */15 * * * *, PHP 8.2, entrada privada dashboard_excel_cron.php. Primero ejecuta Ingresos y después Egresos; el error de lectura de Egresos queda registrado sin interrumpir Ingresos. Cada motor utiliza su propio bloqueo y registro privado.

Lectura de contenido guardado de Graph, eTag antes/después, temporales privados, integridad y reintentos de 423, 429 y errores transitorios. Una versión anterior de respaldo no sustituye una caché vigente validada. Los cambios sin guardar en Excel aún no son accesibles.

## Reversión

1. Respaldar archivos y cron vigentes antes de revertir.
2. Para retirar Egresos manteniendo Ingresos, volver el único cron al PHP público dashboard-excel-preview/ingresos-historico.php con el mismo horario y PHP 8.2; archivar dashboard-egresos-preview fuera de la raíz pública. Conservar las cachés y la configuración privadas.
3. bi-ingresos-privado/respaldo-continuacion-20261105-192217 guarda el código activo anterior a la instalación separada. Los respaldo-final-continuacion-* guardan los cambios posteriores de motor e interfaces.
4. /home/juanpab1/respaldo-dashboard-excel-20261105-migracion/ conserva producción, pruebas y cachés. Los 21 archivos de producción se compararon por SHA-256 con el control inicial: producción permanece intacta. No ejecutar una restauración de producción innecesaria.
5. Los tres componentes públicos antiguos de Ingresos se archivaron en bi-ingresos-privado/respaldo-final-continuacion-20261105-193320/legado/. No se borraron permanentemente.

## Validación y límites

Sintaxis PHP/JavaScript; comparación del lector PHP con el análisis independiente de las once tablas de Egresos disponible antes de reanudar; meses y rangos; metas; PAGADO/POR PAGAR; clasificación, gráficos y flujo; reintentos, descarga parcial, conservación de caché y temporales. Se incluyen filas ocultas/filtradas, sin sumar resúmenes auxiliares.

Egresos conserva el signo de los pagos negativos: la lógica anterior los omitía del flujo y agrupaciones. No se alteran los importes originales. Las fuentes ausentes muestran Información no disponible y no recurren a BI. BI_Egresos y sus flujos se conservan en producción. La validación del servidor y de las cifras vigentes de Egresos requiere resolver el 403 de Microsoft 365.
