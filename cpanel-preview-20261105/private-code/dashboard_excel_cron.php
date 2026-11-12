<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/ingresos_engine.php';
echo json_encode(hsRun(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
require_once __DIR__.'/egresos_engine.php';
echo json_encode(egRun(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;

// Ventas se audita cada 15 minutos SOLO si el motor privado esta instalado.
// No sustituye BI_Ventas, no modifica los libros y no publica resultados al portal.
if(is_file(__DIR__.'/ventas_engine.php')){
    try{
        require_once __DIR__.'/ventas_engine.php';
        echo json_encode(veRun(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;
    }catch(Throwable $e){
        error_log('Auditoria periodica de Ventas: '.$e->getMessage());
        echo json_encode(['motor'=>'ventas','estado'=>'incidencia','publicado'=>false]).PHP_EOL;
    }
}
