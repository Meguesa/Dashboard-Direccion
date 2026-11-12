<?php
declare(strict_types=1);
/*
 * Inspeccion exclusiva de fuentes de Ventas. No escribe ni publica.
 * Sesion Microsoft 365 del Portal obligatoria, solo administrador definido
 * en el control del Portal. El cliente nunca recibe datos personales.
 */
require_once dirname(__DIR__).'/includes/bootstrap.php';
require_once dirname(__DIR__).'/includes/portal-access.php';
portal_require_authentication();
$user=portal_user();
if(strtolower(trim((string)($user['email']??'')))!=='gabriel.guerra@juanpablo.com.mx'
   || !portal_user_can_tool('dashboard')){
    http_response_code(403);
    exit('Acceso restringido a administrador de Dashboard.');
}
header('Cache-Control: private, no-store, max-age=0');
header('X-Robots-Tag: noindex, nofollow');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
if(session_status()!==PHP_SESSION_ACTIVE){http_response_code(401);exit('Sesion requerida');}
if(empty($_SESSION['ventas_excel_auditoria_csrf']))
    $_SESSION['ventas_excel_auditoria_csrf']=bin2hex(random_bytes(24));
$csrf=(string)$_SESSION['ventas_excel_auditoria_csrf'];
$result=null;
if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
    $origin=rtrim(strtolower((string)($_SERVER['HTTP_ORIGIN']??'')),'/');
    $value=(string)($_POST['csrf']??'');
    if($origin!=='https://portal.juanpablo.com.mx'||!hash_equals($csrf,$value)){
        http_response_code(403);exit('Origen o token no valido.');
    }
    $last=(int)($_SESSION['ventas_excel_ultima_prueba']??0);
    if($last>0&&time()-$last<45){http_response_code(429);exit('No repetir prueba antes de 45 segundos.');}
    $_SESSION['ventas_excel_ultima_prueba']=time();
    session_write_close();
    try{
        require_once '/home/juanpab1/bi-ingresos-privado/ventas_engine.php';
        $result=veInspeccion();
    }catch(Throwable $e){
        error_log('Auditoria Ventas Excel: '.$e->getMessage());
        $result=['ok'=>false,'error'=>'El servidor no pudo iniciar el motor de Ventas. Revisar log privado.'];
        http_response_code(503);
    }
}elseif(($_SERVER['REQUEST_METHOD']??'GET')!=='GET'){
    header('Allow: GET, POST');http_response_code(405);exit('Metodo no permitido.');
}
function veEscape(string $s):string{return htmlspecialchars($s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
if(($_GET['modo']??'')==='json'){
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($result??['ok'=>false,'estado'=>'NO_EJECUTADO','modo'=>'SOLO_LECTURA'],JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}
?><!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Auditoria Ventas Excel | JJP</title>
<style>
body{font:15px system-ui,-apple-system,sans-serif;background:#f4f4f2;color:#23322c;margin:0}
main{max-width:1150px;margin:28px auto;padding:22px}
section{background:white;border:1px solid #e1e6e0;border-radius:14px;padding:24px}
button{background:#ffc52c;border:0;border-radius:8px;padding:12px 18px;font-weight:700;cursor:pointer}
pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px ui-monospace,Consolas,monospace;background:#f4f6f4;padding:18px;border-radius:10px}
small{color:#626f65}a{color:#11604f}
</style></head><body><main><section>
<small>PRUEBAS · SIN CAMBIOS EN PRODUCCION</small>
<h1>Auditoria de archivos originales de Ventas</h1>
<p>Comercial: Ventas 2026.xlsx · Cobranza: CONTRATOS.xlsx</p>
<p>Verifica permisos Microsoft Graph de la aplicacion, identidad y huellas de los dos archivos, importes por mes, duplicados y encabezados. No modifica los Excel ni las listas BI. No muestra contratos individuales, clientes ni asesores.</p>
<form method="post"><input type="hidden" name="csrf" value="<?=veEscape($csrf)?>">
<button type="submit">Ejecutar auditoria controlada</button></form>
<?php if($result!==null):?><h2>Resultado</h2><pre><?=veEscape(json_encode($result,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)?:'Error de formato')?></pre><?php endif;?>
<p><a href="/dashboard/">Regresar al Dashboard</a></p>
</section></main></body></html>