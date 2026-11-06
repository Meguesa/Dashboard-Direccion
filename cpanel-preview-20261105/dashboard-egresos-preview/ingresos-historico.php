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

// Metas de Cobranza. La fuente es exclusivamente la CARATULA del Excel
// mensual que el motor de Ingresos ya concilio. No lee BI_Metas_Cobranza.
function hsMetaDesdeFilas(iterable $filas, string $mes):array {
    $areas=['Panteon','Servicios CH','Servicios AF','Total Service'];
    $enTabla=false;$reales=null;$metas=null;$filaMeta=null;
    $normal=static function($valor):string {
        $valor=hsText($valor);
        return trim((string)preg_replace('/\s+/u',' ',strtr($valor,['Á'=>'A','É'=>'E','Í'=>'I','Ó'=>'O','Ú'=>'U'])));
    };
    foreach($filas as [$fila,$valores,$formulas]){
        if($fila>100)break;
        $etiqueta=$normal($valores[1]??'');
        if($etiqueta==='BANCOS'){
            $titulos=[];
            for($col=2;$col<=6;$col++)$titulos[]=$normal($valores[$col]??'');
            if($titulos===['PANTEON','SERVICIOS CH','SERVICIOS AF','TOTAL SERVICE','TOTAL']){
                $enTabla=true;$reales=null;$metas=null;
            }
            continue;
        }
        if(!$enTabla||!in_array($etiqueta,['INGRESO TOTAL','META'],true))continue;
        $cantidades=[];
        for($col=2;$col<=6;$col++){
            $valor=$valores[$col]??null;
            if(!is_numeric($valor)||trim((string)$valor)===''){
                throw new RuntimeException('La caratula tiene un valor de cobranza o meta invalido.');
            }
            $centavos=hsCents($valor);
            if($centavos<0)throw new RuntimeException('La caratula tiene un importe negativo en sus metas.');
            $cantidades[]=$centavos;
        }
        if(array_sum(array_slice($cantidades,0,4))!==$cantidades[4]){
            throw new RuntimeException('El total de la caratula difiere de la suma por area.');
        }
        if($etiqueta==='INGRESO TOTAL')$reales=$cantidades;
        else{$metas=$cantidades;$filaMeta=$fila;}
        if($reales!==null&&$metas!==null)break;
    }
    if(!$enTabla||$reales===null||$metas===null||$metas[4]<=0){
        throw new RuntimeException('Faltan las cuatro metas o el total en la caratula.');
    }
    $registros=[];
    foreach($areas as $i=>$area){
        $registros[]=[
            'mes'=>$mes,'area'=>$area,'metaMensual'=>$metas[$i]/100,
            'realCaratula'=>$reales[$i]/100,'activo'=>true,
            'fuenteOrigen'=>'excel_original_caratula'
        ];
    }
    return ['mes'=>$mes,'metas'=>$registros,'metaTotal'=>$metas[4]/100,
        'realTotal'=>$reales[4]/100,'filaMeta'=>$filaMeta];
}
function hsMetaDesdeExcel(string $archivo,string $mes):array {
    $zip=new ZipArchive();
    if($zip->open($archivo,ZipArchive::RDONLY)!==true)throw new RuntimeException('Excel invalido.');
    try{
        $caratula=coverSheetName($zip);
        if(!$caratula)throw new RuntimeException('Caratula no encontrada.');
        $resultado=hsMetaDesdeFilas(hsRows($zip,$caratula,readStrings($zip)),$mes);
        $resultado['hoja']=$caratula;
        return $resultado;
    }finally{$zip->close();}
}
function hsMetaMesValidado(string $mes,?string &$token):array {
    $noDisponible=['mes'=>$mes,'validado'=>false,'metas'=>[],'estado'=>'no_disponible','motivo'=>'SIN_CACHE_INGRESOS_VALIDADA'];
    $ingresos=hsRead(hsCacheName($mes));
    if(!($ingresos['auditoria']['validado']??false)||
       ($ingresos['reglasVersion']??null)!==HS_RULES)return $noDisponible;
    $sha=(string)($ingresos['excel']['sha256']??'');
    $etag=(string)($ingresos['excel']['etag']??'');
    if(!preg_match('/^[a-f0-9]{64}$/D',$sha)||$etag==='')return array_merge($noDisponible,['motivo'=>'HUELLA_EXCEL_INCOMPLETA']);
    $nombre='cache_metas_cobranza_excel_'.$mes.'.json';
    $cache=hsRead($nombre);
    // El SHA256 identifica el contenido exacto. Un eTag distinto no invalida
    // una caratula ya validada contra los mismos bytes del Excel.
    if(($cache['validado']??false)&&($cache['excelSha256']??'')===$sha)return $cache;
    $lock=fopen(HS_DIR.'/metas_cobranza_'.$mes.'.lock','c');
    if(!$lock||!flock($lock,LOCK_EX|LOCK_NB)){
        if($lock)fclose($lock);
        return array_merge($noDisponible,['motivo'=>'LECTURA_EN_CURSO']);
    }
    try{
        $cache=hsRead($nombre);
        if(($cache['validado']??false)&&($cache['excelSha256']??'')===$sha)return $cache;
        if($token===null)$token=hsToken();
        $catalogo=hsRead('historico_catalogo.json')['meses']??[];
        if(!isset($catalogo[$mes]))$catalogo=hsSources($token);
        if(!isset($catalogo[$mes]['id']))return array_merge($noDisponible,['motivo'=>'MES_FUERA_DE_CATALOGO']);
        $metaArchivo=hsGraph('/items/'.rawurlencode((string)$catalogo[$mes]['id']),$token);
        if(($metaArchivo['eTag']??'')!==$etag)return array_merge($noDisponible,['motivo'=>'EXCEL_MODIFICADO_PENDIENTE_SINCRONIZAR']);
        $descarga=hsSnapshotDownload(JJP_COBRANZA_DRIVE_ID,$metaArchivo,$token);
        try{
            // Previene mezclar metas de una version distinta a Ingresos.
            if(!hash_equals($sha,(string)$descarga['sha256']))return array_merge($noDisponible,['motivo'=>'EXCEL_MODIFICADO_DURANTE_LECTURA']);
            $resultado=hsMetaDesdeExcel($descarga['temporal'],$mes);
            $resultado['validado']=true;
            $resultado['estado']='validado';
            $resultado['fuente']='EXCEL_ORIGINAL_CARATULA';
            $resultado['biMetasCobranza']=false;
            $resultado['excelSha256']=$sha;
            $resultado['excelEtag']=$etag;
            $resultado['verificadoUTC']=gmdate('c');
            hsWrite($nombre,$resultado);
            return $resultado;
        }finally{@unlink($descarga['temporal']);}
    }catch(Throwable $error){
        error_log('Lectura de metas de Excel '.$mes.': '.get_class($error));
        return array_merge($noDisponible,['motivo'=>'ERROR_DE_LECTURA_CARATULA']);
    }finally{flock($lock,LOCK_UN);fclose($lock);}
}

$mode=$_GET['modo']??'manifest';
if($mode==='metas'){
    session_write_close();
    header('Content-Type: application/json; charset=utf-8');
    $peticion=(string)($_GET['meses']??'');
    $meses=array_values(array_unique(explode(',',$peticion)));
    if(count($meses)>3||count($meses)<1){
        http_response_code(400);
        echo json_encode(['ok'=>false,'error'=>'Cantidad de meses invalida']);exit;
    }
    foreach($meses as $mes){
        if(!preg_match('/^20\d\d-(0[1-9]|1[0-2])$/D',$mes)){
            http_response_code(400);
            echo json_encode(['ok'=>false,'error'=>'Mes invalido']);exit;
        }
    }
    $token=null;$resultados=[];
    foreach($meses as $mes)$resultados[$mes]=hsMetaMesValidado($mes,$token);
    echo json_encode(['ok'=>true,'fuente'=>'EXCEL_ORIGINAL_CARATULA',
        'biMetasCobranza'=>false,'meses'=>$resultados],
        JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;
}

if($mode==='admin'){session_write_close();$c=htmlspecialchars($csrf,ENT_QUOTES,'UTF-8');echo '<!doctype html><meta charset="utf-8"><title>Auditoría histórica de Ingresos</title><style>body{font:16px system-ui;max-width:1200px;margin:30px auto}button{padding:12px;margin:8px}pre{white-space:pre-wrap;background:#f4f6f8;padding:18px}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #ccc}</style><h1>Auditoría histórica de Ingresos · Pruebas</h1><p>Originales de Cobranza. Lotes de dos archivos. Producción intacta.</p><button id="corregidos">Revalidar los seis corregidos</button><button id="inicial">Completar carga inicial</button><button id="lote">Procesar siguiente lote</button><button id="revisar">Actualizar histórico</button><a href="./">Abrir Dashboard de pruebas</a><pre id="resultado"></pre><div id="tabla"></div><script>const csrf='.json_encode($csrf).';async function estado(){const m=await fetch("?modo=manifest",{cache:"no-store"}).then(r=>r.json());document.getElementById("tabla").textContent=JSON.stringify(m,null,2)}for(const b of document.querySelectorAll("button"))b.onclick=async()=>{b.disabled=true;try{for(let i=0;i<(b.id==="inicial"?20:b.id==="corregidos"?3:1);i++){const r=await fetch(location.pathname,{method:"POST",body:new URLSearchParams({csrf,accion:b.id==="inicial"?"lote":b.id,lote:String(i)})});const t=await r.text();document.getElementById("resultado").textContent=t;await estado();if(b.id==="corregidos")continue;if(b.id!=="inicial")break;const v=JSON.parse(t);if(v.pendientes===0||Object.keys(v.errores||{}).length||v.estado==="ocupado")break}}finally{b.disabled=false}};estado()</script>';exit;}
session_write_close();header('Content-Type: application/json; charset=utf-8');
if($mode==='detalle'){$m=(string)($_GET['mes']??'');try{$cache=hsRead(hsCacheName($m));if(empty($cache['auditoria']['validado'])||($cache['reglasVersion']??0)!==HS_RULES){http_response_code(409);echo json_encode(['mes'=>$m,'estado'=>'no_disponible','mensaje'=>'Información no disponible']);exit;}echo json_encode($cache,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);}catch(Throwable $e){http_response_code(400);echo json_encode(['mensaje'=>'Mes no válido']);}exit;}
echo json_encode(hsManifest($admin),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);
