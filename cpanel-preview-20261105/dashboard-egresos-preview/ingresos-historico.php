<?php
declare(strict_types=1);
require_once '/home/juanpab1/bi-ingresos-privado/ingresos_engine.php';
if(PHP_SAPI==='cli'){echo json_encode(hsRun(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;exit;}
require_once dirname(__DIR__).'/includes/bootstrap.php';require_once dirname(__DIR__).'/includes/portal-access.php';portal_require_authentication();
$user=portal_user();$admin=strtolower(trim((string)($user['email']??'')))==='gabriel.guerra@juanpablo.com.mx';
if(!$admin||!portal_user_can_tool('dashboard')){http_response_code(403);exit('Acceso restringido a la auditoría de pruebas.');}
header('Cache-Control: private, no-store, max-age=0');header('X-Content-Type-Options: nosniff');
if(empty($_SESSION['ingresos_historico_csrf']))$_SESSION['ingresos_historico_csrf']=bin2hex(random_bytes(24));$csrf=$_SESSION['ingresos_historico_csrf'];
if($_SERVER['REQUEST_METHOD']==='POST'){
    if(!hash_equals($csrf,(string)($_POST['csrf']??''))){http_response_code(403);exit('Solicitud no válida.');}
    session_write_close();$action=(string)($_POST['accion']??'lote');
    if($action==='corregidos'){$months=['2024-08','2024-12','2025-02','2025-07','2025-12','2026-04'];$batch=(int)($_POST['lote']??0);if($batch<0||$batch>2){http_response_code(400);exit('Lote inválido.');}$r=hsRun(true,false,array_slice($months,$batch*2,2),true);header('Content-Type: application/json; charset=utf-8');echo json_encode($r,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);exit;}
    if($action!=='lote'&&$action!=='revisar'){http_response_code(400);exit('Acción no válida.');}
    $r=hsRun(true,$action==='revisar');header('Content-Type: application/json; charset=utf-8');echo json_encode($r,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);exit;
}
$mode=$_GET['modo']??'manifest';
if($mode==='admin'){session_write_close();$c=htmlspecialchars($csrf,ENT_QUOTES,'UTF-8');echo '<!doctype html><meta charset="utf-8"><title>Auditoría histórica de Ingresos</title><style>body{font:16px system-ui;max-width:1200px;margin:30px auto}button{padding:12px;margin:8px}pre{white-space:pre-wrap;background:#f4f6f8;padding:18px}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #ccc}</style><h1>Auditoría histórica de Ingresos · Pruebas</h1><p>Originales de Cobranza. Lotes de dos archivos. Producción intacta.</p><button id="corregidos">Revalidar los seis corregidos</button><button id="inicial">Completar carga inicial</button><button id="lote">Procesar siguiente lote</button><button id="revisar">Actualizar histórico</button><a href="./">Abrir Dashboard de pruebas</a><pre id="resultado"></pre><div id="tabla"></div><script>const csrf='.json_encode($csrf).';async function estado(){const m=await fetch("?modo=manifest",{cache:"no-store"}).then(r=>r.json());document.getElementById("tabla").textContent=JSON.stringify(m,null,2)}for(const b of document.querySelectorAll("button"))b.onclick=async()=>{b.disabled=true;try{for(let i=0;i<(b.id==="inicial"?20:b.id==="corregidos"?3:1);i++){const r=await fetch(location.pathname,{method:"POST",body:new URLSearchParams({csrf,accion:b.id==="inicial"?"lote":b.id,lote:String(i)})});const t=await r.text();document.getElementById("resultado").textContent=t;await estado();if(b.id==="corregidos")continue;if(b.id!=="inicial")break;const v=JSON.parse(t);if(v.pendientes===0||Object.keys(v.errores||{}).length||v.estado==="ocupado")break}}finally{b.disabled=false}};estado()</script>';exit;}
session_write_close();header('Content-Type: application/json; charset=utf-8');
if($mode==='detalle'){$m=(string)($_GET['mes']??'');try{$cache=hsRead(hsCacheName($m));if(empty($cache['auditoria']['validado'])||($cache['reglasVersion']??0)!==HS_RULES){http_response_code(409);echo json_encode(['mes'=>$m,'estado'=>'no_disponible','mensaje'=>'Información no disponible']);exit;}echo json_encode($cache,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);}catch(Throwable $e){http_response_code(400);echo json_encode(['mensaje'=>'Mes no válido']);}exit;}
echo json_encode(hsManifest($admin),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
