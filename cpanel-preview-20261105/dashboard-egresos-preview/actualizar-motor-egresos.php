<?php
declare(strict_types=1);
/**
 * Promocion controlada del motor de Egresos versionado en GitHub.
 * Solo un administrador autenticado puede solicitar el cambio mediante CSRF.
 * El motor nunca se ejecuta por HTTP ni se publican datos financieros.
 */
require_once dirname(__DIR__).'/includes/bootstrap.php';
require_once dirname(__DIR__).'/includes/portal-access.php';
portal_require_authentication();
$user=portal_user();
$admin=strtolower(trim((string)($user['email']??'')))==='gabriel.guerra@juanpablo.com.mx';
if(!$admin||!portal_user_can_tool('dashboard')){
    http_response_code(403);exit('Acceso restringido.');
}
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

$source=__DIR__.'/egresos_engine.php';
$privateDir='/home/juanpab1/bi-ingresos-privado';
$destination=$privateDir.'/egresos_engine.php';
$lockfile=$privateDir.'/egresos_engine_deploy.lock';
$expectedBuild='20261106-egresos-historico-2';
function buildFromSource(string $code):?string {
    if(preg_match("/const EG_BUILD='([^']+)';/",$code,$m))return $m[1];
    return null;
}
function motorStatus(string $source,string $destination,string $expected):array {
    $new=is_file($source)?file_get_contents($source):false;
    $old=is_file($destination)?file_get_contents($destination):false;
    return [
        'versionGitHub'=>is_string($new)?buildFromSource($new):null,
        'versionPrivada'=>is_string($old)?buildFromSource($old):null,
        'origenDisponible'=>is_string($new),
        'motorPrivadoDisponible'=>is_string($old),
        'instalado'=>is_string($old)&&is_string($new)&&hash_equals(hash('sha256',$new),hash('sha256',$old)),
        'actualizacionPermitida'=>is_dir(dirname($destination))&&is_writable(dirname($destination))&&is_file($destination)&&is_writable($destination),
    ];
}
if(empty($_SESSION['motor_egresos_csrf']))$_SESSION['motor_egresos_csrf']=bin2hex(random_bytes(24));
$csrf=$_SESSION['motor_egresos_csrf'];
$status=motorStatus($source,$destination,$expectedBuild);
if($_SERVER['REQUEST_METHOD']==='POST'){
    header('Content-Type: application/json; charset=utf-8');
    if(!hash_equals($csrf,(string)($_POST['csrf']??''))){http_response_code(403);echo json_encode(['error'=>'CSRF inválido']);exit;}
    if(($_POST['accion']??'')!=='promover'){http_response_code(400);echo json_encode(['error'=>'Acción inválida']);exit;}
    session_write_close();
    $lock=null;$temp=null;
    try{
        if(!$status['actualizacionPermitida'])throw new RuntimeException('La carpeta privada no permite escritura desde PHP; no se realizó ningún cambio.');
        $lock=fopen($lockfile,'c');
        if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))throw new RuntimeException('Hay otra instalación en curso.');
        $new=file_get_contents($source);
        if(!is_string($new)||buildFromSource($new)!==$expectedBuild)throw new RuntimeException('La versión de GitHub no es la esperada.');
        $old=file_get_contents($destination);
        if(!is_string($old)||!str_contains($old,'function egRun('))throw new RuntimeException('El motor privado no tiene el formato esperado.');
        if(hash_equals(hash('sha256',$old),hash('sha256',$new))){
            echo json_encode(['estado'=>'sin_cambios','mensaje'=>'Motor privado ya actualizado','version'=>$expectedBuild]);exit;
        }
        $backup=$privateDir.'/egresos_engine_backup_'.gmdate('Ymd_His').'_'.substr(hash('sha256',$old),0,12).'.php.bak';
        if(file_put_contents($backup,$old,LOCK_EX)!==strlen($old))throw new RuntimeException('No fue posible realizar la copia de seguridad.');
        chmod($backup,0600);
        $temp=tempnam($privateDir,'.egresos_deploy_');
        if($temp===false||file_put_contents($temp,$new,LOCK_EX)!==strlen($new))throw new RuntimeException('Falló la preparación del motor.');
        chmod($temp,0600);
        $lint='php -l '.escapeshellarg($temp).' 2>&1';
        // Validación sintáctica si exec está disponible; no omite la verificación de huella.
        if(function_exists('exec')){
            $out=[];$code=0;exec($lint,$out,$code);
            if($code!==0)throw new RuntimeException('El motor de reemplazo no superó la validación PHP.');
        }
        if(!hash_equals(hash('sha256',$new),hash_file('sha256',$temp)))throw new RuntimeException('Error de integridad del motor.');
        if(!rename($temp,$destination))throw new RuntimeException('No se pudo sustituir el motor privado.');
        $temp=null;
        clearstatcache(true,$destination);
        if(!hash_equals(hash('sha256',$new),hash_file('sha256',$destination)))throw new RuntimeException('Integridad posterior a la instalación incorrecta. Restaurar respaldo.');
        if(function_exists('opcache_invalidate'))@opcache_invalidate($destination,true);
        echo json_encode(['estado'=>'actualizado','version'=>$expectedBuild,'respaldo'=>basename($backup),'mensaje'=>'Motor actualizado. El cron existente podrá usar esta versión.'],JSON_UNESCAPED_UNICODE);
    }catch(Throwable $e){http_response_code(409);echo json_encode(['estado'=>'sin_cambios_o_error','error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);}
    finally{if($temp!==null&&is_file($temp))@unlink($temp);if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}}
    exit;
}
?>
<!doctype html><html lang="es"><meta charset="utf-8"><title>Motor privado de Egresos · Control</title>
<style>body{font:16px system-ui;max-width:850px;margin:40px auto;padding:0 22px;color:#253c39}button{padding:12px 16px;background:#19544b;color:white;border:0;border-radius:8px;cursor:pointer}pre{white-space:pre-wrap;background:#f3f6f5;padding:18px;overflow-wrap:anywhere}a{color:#185a50}</style>
<h1>Actualizar motor privado de Egresos</h1>
<p>Se instalará exclusivamente la versión verificada que GitHub publicó en este dashboard. Se conservará una copia privada del motor anterior y no se modificarán los Excel ni las cachés financieras.</p>
<pre id="estado"><?=htmlspecialchars(json_encode($status,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE),ENT_QUOTES,'UTF-8')?></pre>
<button id="promover" <?=$status['instalado']||!$status['actualizacionPermitida']?'disabled':''?>>Instalar motor versionado en carpeta privada</button>
<a href="egresos-excel.php?modo=admin">Volver a auditoría de Egresos</a><pre id="resultado"></pre>
<script>
const csrf=<?=json_encode($csrf)?>;
document.getElementById('promover').onclick=async function(){
  this.disabled=true;
  try{const r=await fetch(location.pathname,{method:'POST',credentials:'same-origin',body:new URLSearchParams({csrf,accion:'promover'})});
    document.getElementById('resultado').textContent=await r.text();
  }catch(e){document.getElementById('resultado').textContent=e.message;}
};
</script></html>
