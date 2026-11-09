<?php
declare(strict_types=1);
require_once '/home/juanpab1/bi-ingresos-privado/ingresos_engine.php';
require_once HS_DIR.'/egresos_engine.php';
require_once dirname(__DIR__).'/includes/bootstrap.php';
require_once dirname(__DIR__).'/includes/portal-access.php';
portal_require_authentication();
$u=portal_user();
if(strtolower(trim((string)($u['email']??'')))!=='gabriel.guerra@juanpablo.com.mx'||!portal_user_can_tool('dashboard')){http_response_code(403);exit('Acceso restringido a pruebas.');}
header('Cache-Control: private, no-store, max-age=0');header('X-Content-Type-Options: nosniff');
if(empty($_SESSION['egresos_excel_csrf']))$_SESSION['egresos_excel_csrf']=bin2hex(random_bytes(24));$csrf=$_SESSION['egresos_excel_csrf'];
if($_SERVER['REQUEST_METHOD']==='POST'){
 if(!hash_equals($csrf,(string)($_POST['csrf']??''))){http_response_code(403);exit('Solicitud no válida.');}
 $accion=(string)($_POST['accion']??'normal');if(!in_array($accion,['normal','historicos'],true)){http_response_code(400);exit('Acción inválida.');}
 session_write_close();$r=$accion==='historicos'?egRun(true,[2024,2025]):egRun(true);header('Content-Type: application/json; charset=utf-8');echo json_encode($r,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);exit;
}
$mode=$_GET['modo']??'manifest';session_write_close();
if($mode==='admin'){
 $c=htmlspecialchars($csrf,ENT_QUOTES,'UTF-8');echo '<!doctype html><html lang="es"><meta charset="utf-8"><title>Egresos históricos · Auditoría</title><style>body{font:16px system-ui;margin:30px auto;max-width:1250px;padding:0 20px;color:#173d35}table{width:100%;border-collapse:collapse}th,td{border:1px solid #b7cbc4;padding:9px;text-align:right}th:first-child,td:first-child{text-align:left}button{padding:12px;margin:15px 0}pre{white-space:pre-wrap}small{display:block}</style><h1>Egresos originales · Histórico</h1><p>RELACION DE PAGOS 2024 en adelante · Finanzas / RELACION DE PAGOS. Lectura de tablas completas, incluidas filas ocultas y filtradas. Las advertencias pertenecen al archivo original; sus importes no se modifican.</p><button id="actualizar">Leer Excel guardado y validar</button> <button id="revalidarHistoricos">Revalidar 2024 y 2025</button> <a href="actualizar-motor-egresos.php">Actualizar motor privado (GitHub)</a> <a href="./">Abrir Dashboard</a><pre id="resultado"></pre><div id="estado"></div><h2>Diagnóstico por archivo anual</h2><div id="archivos"></div><table><thead><tr><th>Periodo</th><th>Movimientos</th><th>Importe</th><th>Pagado</th><th>Por pagar</th><th>Advertencias</th><th>Estado</th></tr></thead><tbody id="meses"></tbody></table><script>const csrf='.json_encode($csrf).';const money=v=>new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN"}).format(v);async function cargar(){const m=await fetch("?modo=manifest",{cache:"no-store"}).then(r=>r.json());document.getElementById("estado").textContent=(m.error||"Lectura desde Excel original, sin BI_Egresos")+" · Versión: "+(m.build||"sin versión")+" · Verificación: "+(m.verificadoUTC||"Pendiente");document.getElementById("archivos").textContent=Object.entries(m.archivos||{}).map(([y,a])=>y+": "+(a.nombre||"Sin archivo")+" · "+(a.error||((a.meses||[]).length+" meses procesados"))+" · última verificación: "+(a.verificadoUTC||"pendiente")).join(" | ")||"Sin archivos descubiertos; revisar permisos de Microsoft Graph y cron del servidor.";const body=document.getElementById("meses");body.replaceChildren();for(const [mes,s] of Object.entries(m.meses||{})){const a=s.auditoria||{};const tr=document.createElement("tr");for(const v of [mes,a.registros??"—",money(a.totales?.importe),money(a.totales?.pagado),money(a.totales?.porPagar),a.advertencias?.length??0,s.estado+(s.antigua?" · actualización pendiente":"")]){const td=document.createElement("td");td.textContent=v;tr.append(td)}body.append(tr)}}async function ejecutar(accion,boton){boton.disabled=true;try{const r=await fetch(location.pathname,{method:"POST",body:new URLSearchParams({csrf,accion})});const texto=await r.text();document.getElementById("resultado").textContent=texto;await cargar()}finally{boton.disabled=false}}document.getElementById("actualizar").onclick=function(){return ejecutar("normal",this)};document.getElementById("revalidarHistoricos").onclick=function(){return ejecutar("historicos",this)};cargar();</script></html>';exit;
}
header('Content-Type: application/json; charset=utf-8');
if($mode==='detalle'){
 try{$month=(string)($_GET['mes']??'');$s=hsRead(egCacheName($month));if(empty($s['auditoria']['validado'])){http_response_code(409);echo json_encode(['estado'=>'no_disponible','mensaje'=>'Información no disponible']);exit;}echo json_encode($s,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);}
 catch(Throwable $e){http_response_code(400);echo json_encode(['mensaje'=>'Mes no válido']);}exit;
}
echo json_encode(egManifest(),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
