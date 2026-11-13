<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/ingresos_engine.php';
echo json_encode(hsRun(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
require_once __DIR__.'/egresos_engine.php';
echo json_encode(egRun(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;

// Activar Ventas únicamente después de validar el Dashboard desde Excel.
// Esta marca debe configurarse de forma privada en cPanel/cron, nunca por URL.
// El mismo cron de 15 minutos revisa eTag antes de descargar o recalcular.
if(getenv('JJP_VENTAS_EXCEL_2026')==='1'){
    require_once __DIR__.'/ventas_engine.php';
    echo json_encode(veRun(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
}

