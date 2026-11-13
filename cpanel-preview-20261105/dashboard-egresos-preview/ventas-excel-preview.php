<?php
declare(strict_types=1);
/*
 * Vista de diagnóstico de Microsoft Graph para fuentes de Ventas.
 * NO publica movimientos ni datos personales ni modifica BI_Ventas.
 */
require_once '/home/juanpab1/bi-ingresos-privado/ingresos_engine.php';
require_once dirname(__DIR__).'/includes/bootstrap.php';
require_once dirname(__DIR__).'/includes/portal-access.php';
portal_require_authentication();
$user=portal_user();
if(strtolower(trim((string)($user['email']??'')))!=='gabriel.guerra@juanpablo.com.mx'
   || !portal_user_can_tool('dashboard')){http_response_code(403);exit('Acceso restringido.');}
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');
if(empty($_SESSION['ventas_graph_csrf']))$_SESSION['ventas_graph_csrf']=bin2hex(random_bytes(24));
$csrfVentas=$_SESSION['ventas_graph_csrf'];
$privateVentas='/home/juanpab1/bi-ingresos-privado/ventas_engine.php';
$methodVentas=$_SERVER['REQUEST_METHOD']??'GET';
$modeVentas=(string)($_GET['modo']??'');
if($modeVentas==='datos'){
    header('Content-Type: application/json; charset=utf-8');
    if($methodVentas!=='GET'){http_response_code(405);echo '{"error":"METODO_INVALIDO"}';exit;}
    $mes=(string)($_GET['mes']??'');
    if(!preg_match('/^2026-(0[1-9]|1[0-2])$/D',$mes)){
        http_response_code(400);echo '{"error":"MES_INVALIDO"}';exit;
    }
    if(!is_file($privateVentas)){
        http_response_code(503);echo '{"error":"MOTOR_VENTAS_NO_INSTALADO"}';exit;
    }
    require_once $privateVentas;
    $state=hsRead('ventas_estado.json');
    $snapshot=hsRead('ventas_datos_2026.json');
    $stamp=strtotime((string)($state['verificadoUTC']??''));
    $good=!empty($state['versionDatos'])&&
       hash_equals((string)$state['versionDatos'],(string)($snapshot['version']??''))&&
       ($snapshot['build']??null)===VE_BUILD&&empty($state['antigua'])&&
       $stamp!==false && time()-$stamp<=1800 && time()>=$stamp;
    foreach(['comercial','contratos'] as $name){
        $etag=(string)($snapshot['fuentes'][$name]['etag']??'');
        if($etag===''||$etag!==($state['archivos'][$name]['etag']??null))$good=false;
    }
    if(!$good){
        http_response_code(409);
        echo json_encode(['error'=>'SNAPSHOT_NO_VALIDADO_O_DESACTUALIZADO',
            'motorInstalado'=>true,'datosProductivosSinCambios'=>true],
            JSON_UNESCAPED_UNICODE);exit;
    }
    $ventas=array_values(array_map(static fn(array $v):array=>[
        'mes'=>$v['mes']??null,'asesor'=>$v['asesor']??null,
        'montoVenta'=>$v['montoVenta']??null,'metaMensual'=>$v['metaMensual']??null,
        'totalUnidades'=>$v['totalUnidades']??null
    ],array_filter($snapshot['ventas']??[],static fn(array $r):bool=>
        ($r['mes']??'')===$mes)));
    // Solo información de diagnostico contractual; NO exponer PII por HTTP.
    $contratos=array_values(array_map(static fn(array $r):array=>[
        'id'=>$r['id']??null,'mes'=>$r['mes']??null,'hojaOrigen'=>$r['hojaOrigen']??null,
        'estadoFuente'=>$r['estadoFuente']??null,'importeContrato'=>$r['importeContrato']??null,
        'aportaTotalComercial'=>false
    ],array_filter($snapshot['contratos']??[],static fn(array $r):bool=>
        ($r['mes']??'')===$mes)));
    echo json_encode([
        'validado'=>true,'modo'=>'PARALELO_NO_PRODUCTIVO',
        'mes'=>$mes,'fuenteVentas'=>'HOJAS_MENSUALES_ORIGINALES',
        'fuenteMetas'=>'METAS','fuenteContratos'=>'LOTES_CHURUBUSCO_AGUA_FRIA',
        'ventas'=>$ventas,'contratos'=>$contratos,
        'metaTotalCentavos'=>$snapshot['metas'][$mes]??null,
        'resumenVentas'=>$snapshot['resumenVentas'][$mes]??null,
        'resumenContratos'=>$snapshot['resumenContratos'][$mes]??null,
        'contratosRepetidosIgnorados'=>$snapshot['contratosRepetidosIgnorados']??0,
        'version'=>$snapshot['version'],'validadoUTC'=>$snapshot['validadoUTC'],
        'fuenteProductivaSinCambios'=>true
    ],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}
if($methodVentas==='POST'){
    header('Content-Type: application/json; charset=utf-8');
    if(!hash_equals((string)$csrfVentas,(string)($_POST['csrf']??''))||
       ($_POST['accion']??'')!=='verificar'){
        http_response_code(403);echo '{"error":"CSRF_O_ACCION_INVALIDA"}';exit;
    }
    if((int)($_SESSION['ventas_graph_ultima_ejecucion']??0)>time()-60){
        http_response_code(429);echo '{"error":"REINTENTO_DEMASIADO_RAPIDO"}';exit;
    }
    $_SESSION['ventas_graph_ultima_ejecucion']=time();
    session_write_close();
    if(!is_file($privateVentas)){
        http_response_code(503);echo '{"error":"MOTOR_VENTAS_NO_INSTALADO"}';exit;
    }
    require_once $privateVentas;
    try{
        if(function_exists('set_time_limit'))@set_time_limit(150);
        $result=veRun(true);
        // No incluir datos de clientes, tokens, URL de descarga ni secretos.
        echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;
    }catch(Throwable $e){
        error_log('Ventas Graph admin: '.$e->getMessage());
        http_response_code(503);echo '{"error":"VALIDACION_GRAPH_NO_COMPLETADA"}';exit;
    }
}
if($methodVentas!=='GET'){http_response_code(405);exit('Metodo no permitido');}
$items=[
    'VENTAS_2026'=>[
        'drive'=>'b!tzGM-V4TiUKbUyHUBBu214AiW7yUyvxPnueBG9lB85Wh0Tv-5FAnQqSNjE7rlEJv',
        'id'=>'01ZBUZ3OT6NWPAZOQW5BDZ77XXJW7IQXPD',
        'name'=>'Ventas 2026.xlsx',
    ],
    'CONTRATOS'=>[
        'drive'=>'b!EAWNGReAT02APufy0uQPFnDnY1ILcuZGv2EfFdV9rplPAV4rL4C_QoZl8LbKac5c',
        'id'=>'01E77UG3RSCUNOWXES7JGJHWKPBVXHOAE2',
        'name'=>'CONTRATOS.xlsx',
    ],
];
$out=['build'=>'20261112-vista-paralela-1','comprobacionUTC'=>gmdate('c'),'fuente'=>'archivos_excel_originales',
      'modo'=>'SOLO_METADATA','lecturaHabilitada'=>false,'archivos'=>[]];
try{
    // Token de la aplicación de producción, no token delegado del usuario.
    $token=hsToken();
    // Mostrar solo nombres de roles de aplicación, nunca el token.
    $pieces=explode('.',$token);
    if(count($pieces)===3){
        $claims=json_decode((string)base64_decode(strtr($pieces[1],'-_','+/')),true);
        $out['rolesAplicacion']=array_values(array_filter(
            is_array($claims['roles']??null)?$claims['roles']:[],
            static fn($role):bool=>is_string($role)
        ));
    }
    foreach($items as $code=>$entry){
        try{
            $a=hsRemoteJson($entry['drive'],'/items/'.rawurlencode($entry['id']).'?%24select=id,name,size,eTag,lastModifiedDateTime,parentReference',$token);
            $valid=($a['id']??'')===$entry['id']&&($a['name']??'')===$entry['name']
              &&!empty($a['eTag'])&&is_numeric($a['size']??null);
            $out['archivos'][$code]=[
                'localizado'=>$valid,'nombreEsperado'=>$entry['name'],
                'httpGraph'=>200,
                'eTagPresente'=>!empty($a['eTag']),'tamanoBytes'=>$valid?(int)$a['size']:null,
                'modificacionUTC'=>$a['lastModifiedDateTime']??null,
                'mensaje'=>$valid?'Identidad validada con token de aplicación.':'La identidad o metadatos no coincidieron.',
            ];
        }catch(Throwable $e){
            // hsRequest devuelve "HTTP NNN ...". Exponer solo el codigo, NUNCA
            // el cuerpo, URL firmada, token o mensaje libre de la excepcion.
            $m=[];
            $http=preg_match('/\\bHTTP\\s+(\\d{3})\\b/i',$e->getMessage(),$m)?(int)$m[1]:null;
            $detail=match($http){
                401=>'El token de aplicación fue rechazado.',
                403=>'Acceso denegado al recurso para el token de aplicación. Revisar consentimiento y asignación Selected.',
                404=>'Archivo inaccesible para la aplicación o ruta/identificador incorrecto. La lectura delegada confirma que el archivo existe.',
                429=>'Microsoft Graph aplicó un límite temporal de solicitudes.',
                500,502,503,504=>'Microsoft Graph presenta un error transitorio.',
                default=>'Fallo de la solicitud de metadatos; consultar registros protegidos del servidor.'
            };
            $out['archivos'][$code]=[
                'localizado'=>false,'nombreEsperado'=>$entry['name'],
                'httpGraph'=>$http,
                'mensaje'=>$detail
            ];
        }
    }
}catch(Throwable $e){
    $out['error']='No se pudo obtener el token de la aplicación.';
}
$out['permisosValidos']=count($out['archivos'])===2
    && count(array_filter($out['archivos'],fn($a)=>($a['localizado']??false)===true))===2;
$out['lecturaHabilitada']=false;
if(($_GET['modo']??'')==='json'){
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($out,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}
?><!doctype html><html lang="es"><meta charset="utf-8">
<title>Ventas originales · Comprobación previa</title>
<style>body{font:16px system-ui;max-width:900px;margin:38px auto;padding:0 24px;color:#23453d}
pre{background:#f3f5f4;padding:20px;white-space:pre-wrap;overflow-wrap:anywhere}
a{color:#175f50}</style>
<h1>Ventas desde Excel · Diagnóstico previo</h1>
<p>Comprobación de lectura de metadatos con la cuenta de aplicación de Microsoft Graph. No modifica Excel, Power Automate ni el Dashboard de Dirección.</p>
<pre><?=htmlspecialchars(json_encode($out,JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES),ENT_QUOTES,'UTF-8')?></pre>
<form method="post" action="ventas-excel-preview.php"><input type="hidden" name="csrf" value="<?=htmlspecialchars((string)$csrfVentas,ENT_QUOTES,'UTF-8')?>"><input type="hidden" name="accion" value="verificar"><button type="submit">Validar con la aplicación Graph y generar vista paralela</button></form>
<p><strong>La migración de Ventas no está activada.</strong> Debe conciliarse el detalle de contratos y los importes por asesor antes de reemplazar BI_Ventas.</p>
<p>Cuando Comercial devuelva HTTP 403 o 404, revisar la concesión de lectura a la aplicación <strong>Portal Interno JJP</strong> en la carpeta VENTAS. No es necesario asignar acceso global al sitio; la autorización seleccionada debe realizarla un administrador autorizado.</p>
<a href="./">Regresar al Dashboard</a>
</html>
