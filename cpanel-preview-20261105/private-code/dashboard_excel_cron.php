<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/ingresos_engine.php';
echo json_encode(hsRun(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
require_once __DIR__.'/egresos_engine.php';
echo json_encode(egRun(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
