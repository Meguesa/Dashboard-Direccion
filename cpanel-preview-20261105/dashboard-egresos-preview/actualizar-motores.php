<?php
declare(strict_types=1);
/**
 * Source of truth: staged PHP engines shipped by GitHub Actions.
 * No remote code loading, no browser-accessible financial data, no untrusted paths.
 */
require_once dirname(__DIR__).'/includes/bootstrap.php';
require_once dirname(__DIR__).'/includes/portal-access.php';
portal_require_authentication();
$user=portal_user();
if(strtolower(trim((string)($user['email']??'')))!=='gabriel.guerra@juanpablo.com.mx'
    || !portal_user_can_tool('dashboard')) {
    http_response_code(403);exit('Acceso restringido.');
}
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
$dir='/home/juanpab1/bi-ingresos-privado';
$allowed=[
    'ingresos'=>['file'=>'ingresos_engine.php','const'=>'HS_BUILD','function'=>'hsRun'],
    'egresos'=>['file'=>'egresos_engine.php','const'=>'EG_BUILD','function'=>'egRun'],
    'ventas'=>['file'=>'ventas_engine.php','const'=>'VE_BUILD','function'=>'veRun'],
];
function engineVersion(string $code,string $key):?string {
    if(!preg_match('/\bconst\s+'.preg_quote($key,'/').'\s*=\s*[\'"]([^\'"]+)[\'"]\s*;/',$code,$m))return null;
    return $m[1];
}
function engineInfo(string $dir,array $p):array {
    $source=__DIR__.'/'.$p['file'];$target=$dir.'/'.$p['file'];
    $new=is_file($source)?file_get_contents($source):false;
    $old=is_file($target)?file_get_contents($target):false;
    $sourceVersion=is_string($new)?engineVersion($new,$p['const']):null;
    $privateVersion=is_string($old)?engineVersion($old,$p['const']):null;
    $same=is_string($new)&&is_string($old)&&hash_equals(hash('sha256',$new),hash('sha256',$old));
    $published=is_string($new)&&$sourceVersion!==null;
    $sameVersion=$published&&is_string($old)&&$sourceVersion===$privateVersion;
    $writable=is_dir($dir)&&is_writable($dir);
    if(!$published){
        $state='Sin versión publicada';
    }elseif($same){
        $state='Sin cambios';
    }elseif($sameVersion){
        $state='Misma versión, contenido diferente: revisión requerida';
    }elseif(!is_string($old)){
        $state='Motor no instalado';
    }else{
        $state='Nueva versión disponible';
    }
    return [
        'github'=>$sourceVersion,'instalado'=>$privateVersion,
        'igual'=>$same,
        'estado'=>$state,
        'actualizable'=>$published&&!$same&&!$sameVersion&&$writable,
        'origenDisponible'=>$published,
        'carpetaEscribible'=>$writable,
        'motorPrivadoDisponible'=>is_string($old),
    ];
}
if(empty($_SESSION['motores_git_csrf']))$_SESSION['motores_git_csrf']=bin2hex(random_bytes(24));
$csrf=$_SESSION['motores_git_csrf'];
if($_SERVER['REQUEST_METHOD']==='POST') {
    header('Content-Type: application/json; charset=utf-8');
    if(!hash_equals($csrf,(string)($_POST['csrf']??''))) {
        http_response_code(403);echo json_encode(['error'=>'Token CSRF incorrecto.']);exit;
    }
    $target=(string)($_POST['motor']??'');
    if(!isset($allowed[$target])||($_POST['accion']??'')!=='instalar'){
        http_response_code(400);echo json_encode(['error'=>'Motor o acción no autorizados.']);exit;
    }
    session_write_close();
    $f=$allowed[$target];$temp=null;$lock=null;
    try {
        if(!is_dir($dir)||!is_writable($dir))throw new RuntimeException('Directorio privado no escribible.');
        $source=__DIR__.'/'.$f['file'];$destination=$dir.'/'.$f['file'];
        if(!is_file($source))throw new RuntimeException('Motor aún no publicado por GitHub.');
        $new=file_get_contents($source);
        $version=is_string($new)?engineVersion($new,$f['const']):null;
        if(!is_string($new)||!$version||!str_contains($new,'function '.$f['function'].'('))
            throw new RuntimeException('Código de GitHub no cumple el contrato del motor.');
        $lock=fopen($dir.'/motores_deploy.lock','c');
        if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))
            throw new RuntimeException('Otra instalación en curso.');
        $old=is_file($destination)?file_get_contents($destination):null;
        if(is_file($destination)&&!is_string($old))
            throw new RuntimeException('No fue posible leer el motor privado existente.');
        if(is_string($old)&&!str_contains($old,'function '.$f['function'].'('))
            throw new RuntimeException('El motor privado existente no tiene el contrato esperado.');
        $oldVersion=is_string($old)?engineVersion($old,$f['const']):null;
        if(is_string($old)&&$oldVersion===$version&&!hash_equals(hash('sha256',$old),hash('sha256',$new)))
            throw new RuntimeException('Misma versión con contenido distinto. No se instalará una revisión silenciosa. Publica primero una nueva versión del motor en GitHub.');
        if(is_string($old)&&hash_equals(hash('sha256',$old),hash('sha256',$new))){
            echo json_encode(['estado'=>'sin_cambios','motor'=>$target,'version'=>$version]);exit;
        }
        // Fail closed when PHP cannot validate syntax; no unaudited promotion.
        if(!function_exists('exec'))throw new RuntimeException('Validación sintáctica PHP no disponible.');
        $temp=tempnam($dir,'.engine_git_');
        if($temp===false||file_put_contents($temp,$new,LOCK_EX)!==strlen($new))
            throw new RuntimeException('No fue posible preparar el nuevo motor.');
        chmod($temp,0600);
        $messages=[];$result=1;
        exec('php -l '.escapeshellarg($temp).' 2>&1',$messages,$result);
        if($result!==0)throw new RuntimeException('Validación sintáctica del motor fallida.');
        if(!hash_equals(hash('sha256',$new),hash_file('sha256',$temp)))
            throw new RuntimeException('El archivo temporal no supera verificación SHA-256.');
        $backup=null;
        if(is_string($old)){
            $backup=$dir.'/'.$target.'_backup_'.gmdate('Ymd_His').'_'.substr(hash('sha256',$old),0,12).'.php.bak';
            if(file_put_contents($backup,$old,LOCK_EX)!==strlen($old))
                throw new RuntimeException('Copia de seguridad fallida; instalación cancelada.');
            chmod($backup,0600);
        }
        if(!rename($temp,$destination))throw new RuntimeException('No se pudo instalar motor privado.');
        $temp=null;
        clearstatcache(true,$destination);
        if(!hash_equals(hash('sha256',$new),hash_file('sha256',$destination))){
            // If post-install check fails, never claim success.
            if($backup!==null&&is_file($backup))@copy($backup,$destination);
            throw new RuntimeException('Error de integridad tras instalación. Comprobar respaldo.');
        }
        if(function_exists('opcache_invalidate'))@opcache_invalidate($destination,true);
        echo json_encode([
            'estado'=>'actualizado','motor'=>$target,'version'=>$version,
            'respaldo'=>$backup?basename($backup):null,
            'mensaje'=>'Código privado instalado desde la publicación de GitHub. No se alteraron archivos Excel ni cachés.'
        ],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    }catch(Throwable $e){
        http_response_code(409);
        echo json_encode(['estado'=>'error','motor'=>$target,'error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);
    }finally{
        if(is_string($temp)&&is_file($temp))@unlink($temp);
        if(is_resource($lock)){flock($lock,LOCK_UN);fclose($lock);}
    }
    exit;
}
$statuses=[];
foreach($allowed as $k=>$v)$statuses[$k]=engineInfo($dir,$v);
?>
<!doctype html><html lang="es"><meta charset="utf-8"><title>Motores privados · GitHub</title>
<style>body{font:16px system-ui;max-width:900px;margin:30px auto;padding:0 20px;color:#203d3a}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #dae5e1;text-align:left}button{padding:8px 12px;border:0;background:#145d51;color:#fff;border-radius:6px;cursor:pointer}button:disabled{background:#777}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f4;padding:12px}a{color:#145d51}</style>
<h1>Motores financieros versionados en GitHub</h1>
<p>El código publicado se comprueba y se instala en la carpeta privada con respaldo automático. Esta operación no cambia los Excel ni reinicia el cron. El botón se habilita solamente si hay una versión publicable distinta y un directorio privado escribible. Si el identificador de versión coincide pero el contenido es diferente, se bloquea el reemplazo hasta revisar y versionar el cambio.</p>
<table><thead><tr><th>Motor</th><th>Versión GitHub</th><th>Versión privada</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
<?php foreach($statuses as $key=>$s): ?>
<tr><td><?=htmlspecialchars(ucfirst($key))?></td><td><?=htmlspecialchars((string)($s['github']??'Sin archivo'))?></td><td><?=htmlspecialchars((string)($s['instalado']??'No instalado'))?></td><td><?=htmlspecialchars($s['estado'],ENT_QUOTES,'UTF-8')?></td><td><button data-motor="<?=htmlspecialchars($key)?>" <?=$s['actualizable']?'':'disabled'?>>Instalar versión GitHub</button></td></tr>
<?php endforeach; ?></tbody></table>
<p><a href="egresos-excel.php?modo=admin">Auditoría de Egresos</a> · <a href="ingresos-historico.php?modo=admin">Auditoría de Ingresos</a></p><pre id="result"></pre>
<script>
const csrf=<?=json_encode($csrf)?>;
document.querySelectorAll('button[data-motor]').forEach(button=>{
 button.onclick=async()=>{
  if(!confirm('¿Actualizar el motor '+button.dataset.motor+' desde GitHub, conservando el respaldo privado?'))return;
  button.disabled=true;
  try{
   const res=await fetch(location.pathname,{method:'POST',credentials:'same-origin',cache:'no-store',
    body:new URLSearchParams({csrf,accion:'instalar',motor:button.dataset.motor})});
   const value=await res.json();document.getElementById('result').textContent=JSON.stringify(value,null,2);
   if(res.ok)location.reload();else button.disabled=false;
  }catch(error){document.getElementById('result').textContent=String(error);button.disabled=false;}
 };
});
</script></html>