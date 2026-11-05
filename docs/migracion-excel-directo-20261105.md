# Promoción controlada: Ingresos y Egresos desde Excel

**Estado:** candidato de despliegue; **NO PUBLICADO** y **NO APROBADO**.

## Situación comprobada (05-11-2026)

- `/dashboard/`: **producción anterior**. Octubre 2026: Ingresos $8,411,069.83 y Egresos pagados $7,762,880.14.
- `/dashboard-egresos-preview/`: piloto directo. Octubre 2026: Ingresos $6,297,452.44; Egresos pagados $7,737,650.87; flujo neto -$1,440,198.43.
- Ingresos: 31 meses de 2024-05 a 2026-11; 25 validados y seis no disponibles por incidencias en libros originales.
- Egresos: libro `RELACION DE PAGOS 2026.xlsx`, 11 hojas mensuales procesadas. Octubre tiene 642 registros y 40 advertencias.
- Cron PHP privado reportado cada 15 minutos; **no confundir cron del servidor con actualización en navegador**.
- La rama `main` sigue construyendo y desplegando lectores antiguos `BI_Ingresos` / `BI_Egresos`. Un merge directo a `main` **puede reemplazar el piloto**.

## Preparación de paquete sin despliegue

`python3 tools/build_excel_directo_dashboard.py` crea `deploy-excel-directo/` desde el snapshot archivado (local, en el repositorio) y cambia:
- Restricción del index PHP del auditor individual a `portal_user_can_tool('dashboard')`.
- Lectura de las cachés para usuarios autorizados; actualización manual y panel admin permanecen restringidos al auditor.
- Espacio de nombres propio para la caché del navegador.
- Fechas `YYYY-MM-DD` de Egresos interpretadas como fechas de calendario local, evitando el desfase de un día por UTC.
- Se conserva la lectura de las otras listas SharePoint, por ejemplo Ventas, Servicios, Marketing y Metas.

**La generación del paquete no se ha ejecutado ni probado en un runner en esta sesión.** No copiar a producción hasta pasar los controles siguientes.

## Comprobaciones de seguridad y funcionalidad requeridas

1. Validar sintaxis de todos los PHP con `php -l` y JS con `node --check`; comprobar estructura HTML y referencias a todos los archivos.
2. Revisar encabezados, sesión, permisos de Dashboard para un usuario permitido distinto del auditor, denegación a usuario no autorizado; denegar `POST` y `modo=admin` a un usuario ordinario.
3. Corregir el origen de `fecha` (registro) frente a `fechaPago` (desembolso) y probar el caso `OCTUBRE 2026!258`: FECHA 17/oct y FECHA PAGO 20/oct. La corrección de formato local no sustituye una decisión sobre qué fecha usar en cada gráfico.
4. Validar por mes todos los totales del libro, con su signo, centavos y dimensiones (empresa, banco, rubro, tipo de gasto, beneficiario), sin sumar tablas/resúmenes auxiliares.
5. Investigar las 40 advertencias de octubre y el diferencial `IMPORTE - PAGADO - POR PAGAR = $293,007.79`, preservando las reglas de negocio; las devoluciones `RESUMEN` $14,696.76 son salidas reales, pero requieren un tratamiento contable explícito.
6. Completar los seis meses históricos de Ingresos o mantenerlos señalizados como `Información no disponible`. No recuperar automáticamente importes desde BI.
7. Validar que los otros módulos (Ventas, Servicios, Marketing, Metas, calendario, notificaciones y PDF) no presentan regresiones; las listas ajenas a Ingresos/Egresos siguen operativas.
8. Probar lectura de Excel editado/abierto, eTag antes/después, reintentos, caché válida tras errores, saturación y permisos de carpeta.
9. **Antes de desplegar**, revisar respaldo restaurable de los 21 archivos en producción y configuración privada, hashes, rutas de los dos motores, cron y logs.
10. Actualizar `.github/workflows/deploy-cpanel.yml` y cualquier otro deploy para que el paquete aprobado sea el único origen de publicación; poner guardas de integridad y un rollback probado. **No activar publicación automática involuntariamente**.
11. Ensayar en una ruta adicional de staging con un usuario normal. Luego programar ventana controlada de cambio, pruebas de humo y reversión a último respaldo.
12. Solo después de la confirmación operativa, apagar flujos `BI_Ingresos` y `BI_Egresos` que alimentaban producción; conservar sus respaldos hasta retención aprobada.


## Estado de las pruebas automatizadas (05-11-2026)

- CI aprobado sobre el candidato: [GitHub Actions #42117726329](https://github.com/Meguesa/Dashboard-Direccion/actions/runs/42117726329).
- El generador, sintaxis PHP/JavaScript, referencias locales, controles de autorización estáticos y prueba de fechas de Monterrey pasaron en el runner.
- Tres flujos heredados se deshabilitaron **solo en esta rama**; mientras no se fusione, `main` todavía puede disparar los publicadores antiguos. No hacer merge sin verificar esa diferencia.
- PR de revisión sin fusión: [#2](https://github.com/Meguesa/Dashboard-Direccion/pull/2). No se ha publicado a cPanel.

## Limitaciones funcionales que impiden anunciar una migración completa

- **Egresos históricos:** el lector implementado (`egresos_engine.php`) únicamente contempla `RELACION DE PAGOS 2026.xlsx` y las hojas de enero-noviembre 2026. La autorización de lectura a la carpeta entera no significa que se hayan importado los libros 2024/2025. Debe resolverse si la Dirección necesita esos periodos o mostrarse explícitamente el límite antes de producción.
- **Ingresos históricos:** los seis meses bloqueados no se han conciliado en las fuentes originales; el programa no debe inventar importes ni usar `BI_Ingresos` como sustituto.
- **Control financiero:** las advertencias de Egresos no equivalen a validación contable completa. Distinguir total IMPORTE, total PAGADO y POR PAGAR, incluyendo pagos negativos y devoluciones.
- **Seguridad:** los permisos de lectura y administración se verificaron por código, pero aún no se hizo una prueba end-to-end con otro usuario real de Dirección o Finanzas.
- **Automatización:** el servidor debe continuar haciendo lecturas privadas cada 15 minutos y la última caché validada debe persistir ante lecturas parciales o errores.

## Restricciones

- Los archivos Excel continúan en SharePoint. Se elimina la dependencia de las **listas BI duplicadas y de Power Automate** en esos dos módulos, no de Microsoft Graph ni de SharePoint como almacenamiento.
- No escribir a los libros originales.
- Mantener permisos seleccionados de lectura al sitio Cobranza y la carpeta RELACION DE PAGOS.
- No comprometer producción sin pruebas, permiso de despliegue y plan de reversión.
- No incluir secretos, tokens, credenciales, Excel o movimientos financieros en GitHub.
