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
$out=['build'=>'20261109-ventas-preflight-1','comprobacionUTC'=>gmdate('c'),'fuente'=>'archivos_excel_originales',
      'modo'=>'SOLO_METADATA','lecturaHabilitada'=>false,'archivos'=>[]];
try{
    // Token de la aplicación de producción, no token delegado del usuario.
    $token=hsToken();
    foreach($items as $code=>$entry){
        try{
            $a=hsRemoteJson($entry['drive'],'/items/'.rawurlencode($entry['id']).'?%24select=id,name,size,eTag,lastModifiedDateTime,parentReference',$token);
            $valid=($a['id']??'')===$entry['id']&&($a['name']??'')===$entry['name']
              &&!empty($a['eTag'])&&is_numeric($a['size']??null);
            $out['archivos'][$code]=[
                'localizado'=>$valid,'nombreEsperado'=>$entry['name'],
                'eTagPresente'=>!empty($a['eTag']),'tamanoBytes'=>$valid?(int)$a['size']:null,
                'modificacionUTC'=>$a['lastModifiedDateTime']??null,
                'mensaje'=>$valid?'Identidad validada con token de aplicación.':'La identidad o metadatos no coincidieron.',
            ];
        }catch(Throwable $e){
            // No mostrar URLs de Graph con credenciales o respuestas completas.
            $out['archivos'][$code]=[
                'localizado'=>false,'nombreEsperado'=>$entry['name'],
                'mensaje'=>'No fue posible leer los metadatos con el token de aplicación. Verificar permisos seleccionados de Microsoft Graph.'
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
<p><strong>La migración de Ventas no está activada.</strong> Debe conciliarse el detalle de contratos y los importes por asesor antes de reemplazar BI_Ventas.</p>
<a href="./">Regresar al Dashboard</a>
</html>
