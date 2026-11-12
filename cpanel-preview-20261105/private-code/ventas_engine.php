<?php
declare(strict_types=1);
/**
 * Ventas: preflight de EXCEL ORIGINAL de Comercial y Cobranza.
 * NO reemplaza BI_Ventas, NO publica datos del cliente, NO modifica Excel.
 * Dependencias privadas existentes: ingresos_engine.php (Graph/XLSX).
 */
require_once __DIR__ . '/ingresos_engine.php';
const VE_BUILD = '20261112-ventas-preflight-1';
const VE_DRIVE_COMERCIAL = 'b!tzGM-V4TiUKbUyHUBBu214AiW7yUyvxPnueBG9lB85Wh0Tv-5FAnQqSNjE7rlEJv';
const VE_ITEM_COMERCIAL = '01ZBUZ3OT6NWPAZOQW5BDZ77XXJW7IQXPD';
const VE_DRIVE_COBRANZA = 'b!EAWNGReAT02APufy0uQPFnDnY1ILcuZGv2EfFdV9rplPAV4rL4C_QoZl8LbKac5c';
const VE_ITEM_CONTRATOS = '01E77UG3RSCUNOWXES7JGJHWKPBVXHOAE2';
const VE_YEAR = 2026;
const VE_MESES = [
    'ENERO'=>1,'FEBRERO'=>2,'MARZO'=>3,'ABRIL'=>4,
    'MAYO'=>5,'JUNIO'=>6,'JULIO'=>7,'AGOSTO'=>8,
    'SEPTIEMBRE'=>9,'OCTUBRE'=>10,'NOVIEMBRE'=>11,'DICIEMBRE'=>12
];
function veFuentes():array {
    return [
        'comercial'=>['drive'=>VE_DRIVE_COMERCIAL,'id'=>VE_ITEM_COMERCIAL,'name'=>'Ventas 2026.xlsx'],
        'contratos'=>['drive'=>VE_DRIVE_COBRANZA,'id'=>VE_ITEM_CONTRATOS,'name'=>'CONTRATOS.xlsx']
    ];
}
function veMes($v,int $year=VE_YEAR):?string {
    $s=hsText($v);
    if(preg_match('/^(20\d\d)-(0[1-9]|1[0-2])$/D',$s))return $s;
    if(preg_match('/^(\d\d?)$/D',$s)&& (int)$s>=1&&(int)$s<=12)
        return $year.'-'.str_pad($s,2,'0',STR_PAD_LEFT);
    foreach(VE_MESES as $key=>$month)
        if($s===$key||preg_match('/^'.preg_quote($key,'/').'\s+20\d\d$/D',$s))
            return $year.'-'.str_pad((string)$month,2,'0',STR_PAD_LEFT);
    return null;
}
function veSheetNames(ZipArchive $zip):array {
    $xml=readXml($zip,'xl/workbook.xml');
    $out=[];
    foreach($xml->getElementsByTagName('sheet') as $element) {
        $name=(string)$element->getAttribute('name');
        if($name!=='')$out[]=$name;
    }
    if(!$out||count($out)>128)throw new RuntimeException('Catálogo de hojas inexistente o excesivo.');
    return $out;
}
function veNorm($s):string {
    return trim(preg_replace('/\s+/u',' ',hsText($s))??'');
}
function veHeaders(array $row):array {
    $cols=[];$dupes=[];
    foreach($row as $column=>$raw) {
        $name=trim((string)$raw);
        if($name==='')continue;
        if(isset($cols[$name]))$dupes[]=$name;
        $cols[$name]=(int)$column;
    }
    if($dupes)throw new RuntimeException('Encabezados duplicados: '.implode(', ',array_unique($dupes)));
    return $cols;
}
function vePick(array $row,array $header,string $name) {
    return isset($header[$name])?$row[$header[$name]]??null:null;
}
function veAuditVentas(string $filename):array {
    $zip=new ZipArchive();
    if($zip->open($filename,ZipArchive::CHECKCONS)!==true)throw new RuntimeException('Excel Ventas no es ZIP íntegro.');
    try {
        $sheets=veSheetNames($zip);
        if(!in_array('DASHBOARD',$sheets,true))throw new RuntimeException('No existe tabla normalizada DASHBOARD de Comercial.');
        $strings=readStrings($zip);
        $header=null;$totals=[];$seen=[];$duplicates=[];$exceptions=[];$rowCount=0;
        $kinds=['SEMANAL'=>0,'MENSUAL'=>0];
        $required=['Fecha','Mes','Asesor','Semana','Monto_Venta','Servicios_AF','Servicios_CH','TS_TSC','Propiedades','Nichos','Total_Unidades','Meta_Mensual','Tipo_Registro','Fuente','Clave_Registro','Hoja_Origen','Fila_Origen'];
        foreach(hsRows($zip,'DASHBOARD',$strings) as [$rn,$values,$formulas]) {
            if($header===null) {
                if($rn>10)throw new RuntimeException('Falta encabezado de DASHBOARD en las primeras 10 filas.');
                if(veNorm($values[0]??'')==='FECHA') {
                    $header=veHeaders($values);$missing=array_values(array_diff($required,array_keys($header)));
                    if($missing)throw new RuntimeException('Columnas ausentes de Comercial: '.implode(', ',$missing));
                }continue;
            }
            $kind=veNorm(vePick($values,$header,'Tipo_Registro'));
            if($kind==='')continue;
            if(!isset($kinds[$kind])){$exceptions[]=['codigo'=>'TIPO_REGISTRO_DESCONOCIDO','hoja'=>'DASHBOARD','fila'=>$rn];continue;}
            $source=trim((string)vePick($values,$header,'Fuente'));
            if($source!=='Ventas 2026')$exceptions[]=['codigo'=>'FUENTE_INESPERADA','hoja'=>'DASHBOARD','fila'=>$rn];
            $key=trim((string)vePick($values,$header,'Clave_Registro'));
            if($key===''){$exceptions[]=['codigo'=>'CLAVE_VACIA','hoja'=>'DASHBOARD','fila'=>$rn];continue;}
            if(isset($seen[$key])){$duplicates[]=['tipo'=>$kind,'mes'=>veMes(vePick($values,$header,'Mes')),'hoja'=>'DASHBOARD','fila'=>$rn];continue;}
            $seen[$key]=true;
            $month=veMes(vePick($values,$header,'Mes'));
            if($month===null){$exceptions[]=['codigo'=>'MES_INVALIDO','hoja'=>'DASHBOARD','fila'=>$rn];continue;}
            try{$amount=hsCents(vePick($values,$header,'Monto_Venta')??'0');$goal=hsCents(vePick($values,$header,'Meta_Mensual')??'0');}
            catch(Throwable $e){$exceptions[]=['codigo'=>'IMPORTE_INVALIDO','hoja'=>'DASHBOARD','fila'=>$rn];continue;}
            $rowCount++;$kinds[$kind]++;
            if(!isset($totals[$month]))$totals[$month]=['semanalCentavos'=>0,'mensualCentavos'=>0,'registrosSemanal'=>0,'registrosMensual'=>0,'metasMensualesCentavos'=>0];
            $bucket=strtolower($kind).'Centavos';$counter='registros'.ucfirst(strtolower($kind));
            $totals[$month][$bucket]+=$amount;$totals[$month][$counter]++;
            // Cada fila mensual contiene la meta por asesor. Nunca sumar metas semanales.
            if($kind==='MENSUAL')$totals[$month]['metasMensualesCentavos']+=$goal;
        }
        if($header===null)throw new RuntimeException('Encabezado Comercial no encontrado.');
        ksort($totals);
        $mismatches=[];
        foreach($totals as $month=>$v) {
            if($v['registrosMensual']===0||$v['registrosSemanal']===0)continue;
            $diff=$v['mensualCentavos']-$v['semanalCentavos'];
            if($diff!==0)$mismatches[]=['mes'=>$month,'diferenciaCentavos'=>$diff,'mensualCentavos'=>$v['mensualCentavos'],'semanalCentavos'=>$v['semanalCentavos']];
        }
        return [
            'tabla'=>'DASHBOARD','hojas'=>$sheets,'registrosValidos'=>$rowCount,
            'tipos'=>$kinds,'meses'=>$totals,'clavesDuplicadas'=>count($duplicates),
            'duplicados'=>$duplicates,'incidencias'=>$exceptions,
            'descuadresSemanalMensual'=>$mismatches,
            'listoParaActivar'=>!$exceptions&&!$duplicates&&!$mismatches
        ];
    }finally{$zip->close();}
}
function veAuditContratos(string $filename):array {
    $zip=new ZipArchive();
    if($zip->open($filename,ZipArchive::CHECKCONS)!==true)throw new RuntimeException('Excel CONTRATOS no es ZIP íntegro.');
    try {
        $sheets=veSheetNames($zip);$ss=readStrings($zip);
        $named=[];
        foreach(['LOTES','CHURUBUSCO','AGUA FRÍA'] as $required) {
            if(in_array($required,$sheets,true))$named[]=$required;
        }
        // Informar posibles diferencias de acentos en nombre; no inventar hoja ausente.
        $missing=array_values(array_diff(['LOTES','CHURUBUSCO','AGUA FRÍA'],$named));
        $headers=[];
        foreach($named as $name){
            $candidate=[];
            foreach(hsRows($zip,$name,$ss) as [$rn,$v,$formula]){
                if($rn>20)break;
                $markers=[];
                foreach($v as $idx=>$value){
                    $word=veNorm($value);
                    if(preg_match('/^(REFERENCIA|N[ÚU]MERO DE CONTRATO|CONTRATO|FECHA(?: DE VENTA)?|ASESOR|TITULAR|CLIENTE|MONTO|TOTAL|PRECIO|ESTATUS|ESTADO|TIPO DE SERVICIO)$/u',$word))
                        $markers[]=['columna'=>indexToLetter((int)$idx),'etiqueta'=>$word];
                }
                if(count($markers)>count($candidate['campos']??[]))
                    $candidate=['fila'=>$rn,'campos'=>$markers];
            }
            $headers[$name]=$candidate;
        }
        if(!in_array('DASHBOARD',$sheets,true))return [
            'hojas'=>$sheets,'origenesPresentes'=>$named,'hojasFaltantes'=>$missing,
            'encabezadosOrigen'=>$headers,'tablaAuxiliar'=>'DASHBOARD AUSENTE',
            'listoParaActivar'=>false
        ];
        $header=null;$count=0;$duplicate=0;$bySheet=[];$seen=[];$errors=[];
        foreach(hsRows($zip,'DASHBOARD',$ss) as [$rn,$values,$formulas]){
            if($header===null){
                if($rn>15)break;
                if(veNorm($values[0]??'')==='FECHA'){
                    $header=veHeaders($values);
                }continue;
            }
            $type=veNorm(vePick($values,$header,'Tipo_Registro'));
            if($type==='')continue;
            if($type!=='TRANSACCION'){$errors[]=['codigo'=>'TIPO_CONTRATO_INESPERADO','fila'=>$rn];continue;}
            $origin=trim((string)vePick($values,$header,'Hoja_Origen'));
            $key=trim((string)vePick($values,$header,'Clave_Registro'));
            if($key===''){$errors[]=['codigo'=>'CLAVE_CONTRATO_VACIA','fila'=>$rn];continue;}
            $count++;$bySheet[$origin]=($bySheet[$origin]??0)+1;
            if(isset($seen[$key])){$duplicate++;continue;}
            $seen[$key]=true;
        }
        return [
            'hojas'=>$sheets,'origenesPresentes'=>$named,'hojasFaltantes'=>$missing,
            'encabezadosOrigen'=>$headers,'tablaAuxiliar'=>'DASHBOARD',
            'encabezadoAuxiliar'=>$header?array_keys($header):[],
            'registrosAuxiliares'=>$count,'clavesDuplicadas'=>$duplicate,
            'clavesUnicas'=>count($seen),'registrosPorOrigen'=>$bySheet,'incidencias'=>$errors,
            // La tabla auxiliar no reemplaza el desglose original, aun sin duplicados.
            'listoParaActivar'=>false
        ];
    }finally{$zip->close();}
}
/** Descarga solo los dos IDs permitidos. No muestra datos personales ni contenido del libro. */
function veInspeccion():array {
    $result=['build'=>VE_BUILD,'horaUTC'=>hsNow(),'modo'=>'SOLO_AUDITORIA',
       'produccionModificada'=>false,'biVentasReemplazada'=>false,'archivos'=>[]];
    $token=hsToken();
    foreach(veFuentes() as $name=>$source){
        $info=['archivo'=>$source['name'],'identidadValidada'=>false,'auditoria'=>null,'error'=>null];
        try {
            $meta=hsRemoteJson($source['drive'],'/items/'.rawurlencode($source['id']),$token);
            if(($meta['id']??'')!==$source['id']||($meta['name']??'')!==$source['name']||
                empty($meta['eTag'])||(int)($meta['size']??0)<1)
                throw new RuntimeException('Identidad del archivo no coincide.');
            $info['identidadValidada']=true;$etag=(string)$meta['eTag'];
            $info['etag']=$etag;$info['modificadoUTC']=$meta['lastModifiedDateTime']??null;
            $download=hsSnapshotDownload($source['drive'],$meta,$token);
            try {
                if($download['metodo']!=='contenido_actual_guardado'||!empty($download['nuevaVersionPendiente']))
                    throw new RuntimeException('Version actual no estable. No se valida una copia historica.');
                $audit=$name==='comercial'?veAuditVentas($download['temporal']):veAuditContratos($download['temporal']);
                $check=hsRemoteJson($source['drive'],'/items/'.rawurlencode($source['id']).'?%24select=id,eTag',$token);
                if(($check['eTag']??'')!==$etag)
                    throw new RuntimeException('Excel modificado durante lectura. Reintentar mas tarde.');
                $info['sha256']=$download['sha256'];
                $info['bytes']=$download['tamanoBytes'];
                $info['auditoria']=$audit;
                $info['listoParaActivar']=$audit['listoParaActivar']??false;
            }finally{@unlink($download['temporal']);}
        }catch(Throwable $e){
            // Nunca devolver las URLs de descarga, token ni filas con clientes.
            $message=$e->getMessage();
            if(preg_match('/\bHTTP\s*(\d{3})\b/i',$message,$m))$message='Microsoft Graph HTTP '.$m[1];
            elseif(!str_contains($message,'Excel')&&!str_contains($message,'hoja')&&!str_contains($message,'Archivo')&&!str_contains($message,'columna'))$message='No se pudo completar la auditoria de esta fuente.';
            $info['error']=$message;$info['listoParaActivar']=false;
        }
        $result['archivos'][$name]=$info;
    }
    $result['listoParaPublicar']=false;
    $result['siguientePaso']='Corregir discrepancias y verificar hoja original de Contratos antes de publicar.';
    return $result;
}
