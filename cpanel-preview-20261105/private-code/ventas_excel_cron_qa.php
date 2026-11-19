<?php
declare(strict_types=1);
/**
 * Tarea independiente y opt-in de Ventas Excel. No invoca Ingresos/Egresos,
 * no escribe SharePoint ni publica ventas. Instalar solo en carpeta PRIVADA.
 * Ejecucion de ejemplo: JJP_VENTAS_CRON_QA=1 /usr/local/bin/php -q /home/juanpab1/bi-ingresos-privado/ventas_excel_cron_qa.php
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (getenv('JJP_VENTAS_CRON_QA') !== '1') {
    fwrite(STDERR, "Ventas QA cron inactivo: bandera privada ausente.\n");
    exit(78);
}
require_once __DIR__.'/ventas_engine.php';
// veRun tiene flock(LOCK_EX|LOCK_NB) propio, eTag/SHA y escrituras atomicas.
// El programador no debe instalar varias copias del cron.
try {
    $result = veRun(false);
    $state = (string)($result['estado'] ?? 'incidencia');
    echo json_encode([
        'estado'=>$state,
        'build'=>$result['build'] ?? VE_BUILD,
        'inicioUTC'=>$result['inicioUTC'] ?? null,
        'versionValidadaUTC'=>$result['versionValidadaUTC'] ?? null,
        'modificoProduccion'=>false
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), PHP_EOL;
    if ($state === 'auditado' || $state === 'sin_cambios') exit(0);
    if ($state === 'ocupado') exit(75); // sobreposicion: alerta operativa
    exit(1); // nunca tratar una incidencia como exito
} catch (Throwable $e) {
    error_log('Cron Ventas QA: '.get_class($e));
    fwrite(STDERR, "No se pudo verificar el snapshot de Ventas.\n");
    exit(1);
}
