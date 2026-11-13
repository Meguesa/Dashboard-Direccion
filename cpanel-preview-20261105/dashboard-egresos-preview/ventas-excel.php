<?php
declare(strict_types=1);
/**
 * Lector autenticado de Ventas desde Excel original, fase QA.
 * NO escribe Excel, NO consulta BI_Ventas, NO modifica la fuente activa.
 * Produccion se habilitara SOLO desde el constructor con rol dashboard.
 */
require_once dirname(__DIR__).'/includes/bootstrap.php';
require_once dirname(__DIR__).'/includes/portal-access.php';
portal_require_authentication();
$user=portal_user();
$admin=strtolower(trim((string)($user['email']??'')))==='gabriel.guerra@juanpablo.com.mx';
if(!$admin||!portal_user_can_tool('dashboard')){
    http_response_code(403);exit('Acceso restringido a auditoria QA.');
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');
$httpMethod=(string)($_SERVER['REQUEST_METHOD']??'GET');
$mode=(string)($_GET['modo']??'');
if(!in_array($httpMethod,['GET','POST'],true)){
    http_response_code(405);echo '{"error":"METODO_NO_PERMITIDO"}';exit;
}
if(($httpMethod==='GET'&&!in_array($mode,['manifest','detalle'],true)) ||
   ($httpMethod==='POST'&&$mode!=='revalidar')){
    http_response_code(400);echo '{"error":"MODO_INVALIDO"}';exit;
}
$month=(string)($_GET['mes']??'');
if($httpMethod==='GET'&&$mode==='detalle'&&
   !preg_match('/^2026-(0[1-9]|1[0-2])$/D',$month)){
    http_response_code(400);echo '{"error":"MES_INVALIDO"}';exit;
}
$engine='/home/juanpab1/bi-ingresos-privado/ventas_engine.php';
if(!is_file($engine)){
    http_response_code(503);echo '{"error":"MOTOR_VENTAS_NO_INSTALADO"}';exit;
}
require_once $engine;
if($httpMethod==='POST'){
    // Revalidación voluntaria, solo administrador y solo desde sesión QA.
    $expected=(string)($_SESSION['ventas_excel_qa_csrf']??'');
    $received=(string)($_POST['csrf']??'');
    if($expected===''||!hash_equals($expected,$received)){
        http_response_code(403);echo '{"error":"CSRF_INVALIDO"}';exit;
    }
    if((int)($_SESSION['ventas_excel_qa_ultima']??0)>time()-60){
        http_response_code(429);echo '{"error":"REINTENTO_DEMASIADO_RAPIDO"}';exit;
    }
    $_SESSION['ventas_excel_qa_ultima']=time();
    session_write_close();
    try{
        if(function_exists('set_time_limit'))@set_time_limit(160);
        // False reusa eTag/SHA si no cambió el origen y fuerza lectura
        // únicamente al detectar otra versión del motor u otro Excel.
        $result=veRun(false);
        $status=(string)($result['estado']??'incidencia');
        if(!in_array($status,['auditado','sin_cambios'],true)){
            http_response_code($status==='ocupado'?423:409);
        }
        echo json_encode([
            'estado'=>$status,'build'=>VE_BUILD,
            'fuenteProductivaSinCambios'=>true
        ],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    }catch(Throwable $error){
        error_log('Revalidacion Ventas QA: '.get_class($error));
        http_response_code(503);
        echo '{"error":"REVALIDACION_VENTAS_NO_COMPLETADA"}';
    }
    exit;
}
$state=hsRead('ventas_estado.json');
$data=hsRead('ventas_datos_2026.json');
$stamp=strtotime((string)($state['verificadoUTC']??''));
$valid=($stamp!==false&&$stamp<=time()&&time()-$stamp<=1800)
    &&empty($state['antigua'])
    &&($state['build']??null)===VE_BUILD
    &&($data['build']??null)===VE_BUILD
    &&preg_match('/^[a-f0-9]{64}$/D',(string)($data['version']??''))===1
    &&hash_equals((string)($data['version']??''),(string)($state['versionDatos']??''));
foreach(['comercial','contratos'] as $label){
    if(empty($state['archivos'][$label]['identidadValidada']) ||
       !is_array($state['archivos'][$label]['auditoria']??null) ||
       !isset($state['archivos'][$label]['sha256']) ||
       ($state['archivos'][$label]['etag']??null)!==($data['fuentes'][$label]['etag']??null) ||
       ($state['archivos'][$label]['sha256']??null)!==($data['fuentes'][$label]['sha256']??null))
       $valid=false;
}
if(!$valid){
    // Categorías diagnósticas sin datos personales, tokens ni rutas privadas.
    $reason='SNAPSHOT_VENTAS_NO_VALIDADO';
    if(($data['build']??null)!==VE_BUILD||($state['build']??null)!==VE_BUILD)
        $reason='SNAPSHOT_DE_OTRA_VERSION_DEL_MOTOR';
    elseif($stamp===false||$stamp>time()||time()-$stamp>1800)
        $reason='VERIFICACION_VENTAS_CADUCADA';
    elseif(!empty($state['antigua']))
        $reason='SNAPSHOT_VENTAS_CON_INCIDENCIA';
    http_response_code(409);
    echo json_encode([
        'error'=>'SNAPSHOT_VENTAS_NO_VALIDADO_O_DESACTUALIZADO',
        'motivo'=>$reason,'accion'=>'REVALIDAR_GRAPH',
        'fuente'=>'EXCEL_ORIGINAL_VENTAS'
    ],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}
$monthStats=$data['resumenVentas']??[];
$contractsStats=$data['resumenContratos']??[];
$summaries=[];
foreach($monthStats as $key=>$stats){
    if(!preg_match('/^2026-(0[1-9]|1[0-2])$/D',(string)$key))continue;
    $count=(int)($stats['registros']??-1);
    $sales=$stats['ventasCentavos']??null;
    $weeks=$stats['semanasCentavos']??null;
    $diff=$stats['diferenciaCentavos']??null;
    $good=$count>0&&is_int($sales)&&is_int($weeks)&&$diff===0&&
        ($sales===$weeks)&&$sales>=0;
    $summaries[$key]=[
        'cacheDisponible'=>$good,
        'auditoria'=>['validado'=>$good,'registros'=>$count,'ventasCentavos'=>$sales,
            'semanasCentavos'=>$weeks,'diferenciaCentavos'=>$diff,
            'asesoresConDiferenciaSemanal'=>$stats['asesoresConDiferenciaSemanal']??null],
        'metaDisponible'=>$stats['metaDisponible']??false,
        'metaCentavos'=>$stats['metaCentavos']??null,
        'asesoresSinMeta'=>$stats['asesoresSinMeta']??null,
        'contratosCandidatos'=>$contractsStats[$key]['candidatos']??0,
        'contratosUnicosNoRepetidos'=>$contractsStats[$key]['contratosUnicosNoRepetidos']??0,
        'verificadoUTC'=>$state['verificadoUTC']
    ];
}
if($mode==='manifest'){
    echo json_encode([
        'validado'=>true,'fuente'=>'EXCEL_ORIGINAL_VENTAS','biVentas'=>false,
        'fuenteMetas'=>'METAS','fuenteContratos'=>'LOTES_CHURUBUSCO_AGUA_FRIA',
        'version'=>$data['version'],'build'=>VE_BUILD,'verificadoUTC'=>$state['verificadoUTC'],
        'meses'=>$summaries,'soloLectura'=>true
    ],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}
$stats=$summaries[$month]??null;
if(!$stats||!$stats['cacheDisponible']){
    http_response_code(409);
    echo json_encode([
        'error'=>'MES_VENTAS_NO_CONCILIADO',
        'mes'=>$month,
        'diferenciaSemanalCentavos'=>$stats['auditoria']['diferenciaCentavos']??null,
        'accion'=>'REVISAR_ORIGEN_COMERCIAL'
    ],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
    exit;
}
$sales=array_values(array_filter($data['ventas']??[],static fn($r):bool=>
    is_array($r)&&($r['mes']??null)===$month));
$contracts=array_values(array_filter($data['contratos']??[],static fn($r):bool=>
    is_array($r)&&($r['mes']??null)===$month));
$amount=0;$keys=[];
foreach($sales as $r){
    $key=(string)($r['id']??'');
    $value=$r['montoVenta']??null;
    if($key===''||isset($keys[$key])||!is_numeric($value)||($r['tipoRegistro']??'')!=='Mensual'
       ||($r['fuente']??'')!=='Ventas 2026'||(float)$value<0){
        http_response_code(409);echo '{"error":"FILA_COMERCIAL_NO_VALIDADA"}';exit;
    }
    $keys[$key]=true;$amount+=(int)round(((float)$value)*100);
}
if(count($sales)!==$stats['auditoria']['registros']||
   $amount!==$stats['auditoria']['ventasCentavos']){
    http_response_code(409);echo '{"error":"TOTAL_COMERCIAL_NO_CONCILIADO"}';exit;
}
$contractKeys=[];
foreach($contracts as $r){
    $key=(string)($r['id']??'');
    if($key===''||isset($contractKeys[$key])||
      !array_key_exists('aportaTotalComercial',$r)||
      $r['aportaTotalComercial']!==false||
      !array_key_exists('montoVenta',$r)||
      $r['montoVenta']!==null||
      !array_key_exists('total',$r)||
      $r['total']!==null){
        http_response_code(409);echo '{"error":"CONTRATO_NO_VALIDADO"}';exit;
    }
    $contractKeys[$key]=true;
}
$ventasPublicas=array_map(static function(array $r):array{
    return [
        'id'=>$r['id'],'mes'=>$r['mes'],'fecha'=>$r['fecha']??null,
        'fechaExactaDisponible'=>false,'asesor'=>$r['asesor'],
        'fuente'=>'Ventas 2026','fuenteOrigen'=>'excel_original_ventas',
        'tipoRegistro'=>'Mensual','montoVenta'=>$r['montoVenta'],
        'metaMensual'=>$r['metaMensual']??null,
        'serviciosAf'=>$r['serviciosAf']??0,'serviciosCh'=>$r['serviciosCh']??0,
        'tsTsc'=>$r['tsTsc']??0,'propiedades'=>$r['propiedades']??0,
        'nichos'=>$r['nichos']??0,'totalUnidades'=>$r['totalUnidades']??0
    ];
},$sales);
// Los expedientes se muestran solo a usuarios autenticados con rol de Dashboard.
// El importe contractual JAMAS debe entrar al campo montoVenta ni Total.
$contratosPublicos=array_map(static function(array $r):array{
    return [
        'id'=>$r['id'],'mes'=>$r['mes'],'fecha'=>$r['fecha']??null,
        'fechaContrato'=>$r['fechaContrato']??null,
        'fuente'=>'CONTRATOS','fuenteOrigen'=>'excel_original_contratos',
        'tipoRegistro'=>'Transaccion','hojaOrigen'=>$r['hojaOrigen']??null,
        'numeroContrato'=>$r['numeroContrato']??null,
        'referencia'=>$r['referencia']??null,'cliente'=>$r['cliente']??null,
        'tipoServicio'=>$r['tipoServicio']??null,
        'importeContrato'=>$r['importeContrato']??null,
        'estadoFuente'=>$r['estadoFuente']??null,
        'integridad'=>$r['integridad']??null,
        'ventaVigenteConfirmada'=>false,
        'aportaTotalComercial'=>false,
        'montoVenta'=>null,'total'=>null
    ];
},$contracts);
echo json_encode([
    'validado'=>true,'fuente'=>'EXCEL_ORIGINAL_VENTAS','mes'=>$month,
    'version'=>$data['version'],'auditoria'=>$stats['auditoria'],
    'metaCentavos'=>$stats['metaCentavos'],
    'metaDisponible'=>$stats['metaDisponible'],
    'asesoresSinMeta'=>$stats['asesoresSinMeta'],
    'ventas'=>$ventasPublicas,'contratos'=>$contratosPublicos,
    'contratosUnicosNoRepetidos'=>$stats['contratosUnicosNoRepetidos'],
    'contratosCandidatos'=>$stats['contratosCandidatos'],
    'noSumarContratos'=>true
],JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);
