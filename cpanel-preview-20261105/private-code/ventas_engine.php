<?php
declare(strict_types=1);
// Defensa adicional: el archivo publico de staging no debe servir peticiones HTTP.
if(PHP_SAPI!=='cli'&&
   realpath((string)($_SERVER['SCRIPT_FILENAME']??''))===__FILE__){
    http_response_code(404);
    exit;
}
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
/**
 * Tabla independiente de metas por asesor, detectada por encabezado y no por
 * nombre de hoja. Se publica solo el agregado por mes, nunca nombres/PII.
 */
function veMetasSeparadas(ZipArchive $zip,array $sheets,array $strings):array {
    $found=null;$totals=[];$counts=[];
    $needed=['Fecha_Mes','Mes','Asesor','Nivel','Meta_Mensual'];
    foreach($sheets as $sheet){
        $header=null;$headerRow=0;
        foreach(hsRows($zip,$sheet,$strings) as [$rn,$v,$f]){
            if($header===null){
                if($rn>12)break;
                if(veNorm($v[0]??'')==='FECHA_MES'){
                    $try=veHeaders($v);
                    if(!array_diff($needed,array_keys($try))){
                        $header=$try;$headerRow=$rn;
                        if($found!==null)throw new RuntimeException('Varias tablas de metas detectadas: no se puede elegir arbitrariamente.');
                        $found=$sheet;
                    }
                }
                continue;
            }
            $month=veMes(vePick($v,$header,'Mes'));
            if($month===null)continue;
            try{$amount=hsCents(vePick($v,$header,'Meta_Mensual')??'0');}
            catch(Throwable $e){throw new RuntimeException('Meta inválida en tabla mensual: '.$sheet.'!'.$rn);}
            $totals[$month]=($totals[$month]??0)+$amount;
            $counts[$month]=($counts[$month]??0)+1;
        }
    }
    ksort($totals);
    return ['hoja'=>$found,'metasCentavos'=>$totals,'registros'=>$counts];
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
        $metasSeparadas=veMetasSeparadas($zip,$sheets,$strings);
        $diferenciasMetas=[];
        foreach($metasSeparadas['metasCentavos'] as $month=>$goal){
            $mensual=$totals[$month]['metasMensualesCentavos']??null;
            if($mensual!==null&&$goal!==$mensual)
                $diferenciasMetas[]=['mes'=>$month,'metasTablaCentavos'=>$goal,
                    'metasRegistrosMensualesCentavos'=>$mensual,'diferenciaCentavos'=>$goal-$mensual];
        }
        return [
            'tabla'=>'DASHBOARD','hojas'=>$sheets,'registrosValidos'=>$rowCount,
            'metasTablaIndependiente'=>$metasSeparadas,'diferenciasMetas'=>$diferenciasMetas,
            'tipos'=>$kinds,'meses'=>$totals,'clavesDuplicadas'=>count($duplicates),
            'duplicados'=>$duplicates,'incidencias'=>$exceptions,
            'descuadresSemanalMensual'=>$mismatches,
            'listoParaActivar'=>!$exceptions&&!$duplicates&&!$mismatches&&!$diferenciasMetas&&$metasSeparadas['hoja']!==null
        ];
    }finally{$zip->close();}
}
/**
 * Extractor privado de registros comerciales para FUTURA caché QA. Ninguna
 * invocación de este extractor expone datos al navegador o modifica BI_Ventas.
 * Contratos no se fusionan aquí y Semanal/Mensual mantienen sus granularidades.
 */
function veLeerRegistrosComercial(string $filename):array {
    $zip=new ZipArchive();
    if($zip->open($filename,ZipArchive::CHECKCONS)!==true)
        throw new RuntimeException('Libro Comercial inválido.');
    try{
        $ss=readStrings($zip);$header=null;$out=[];
        $need=['Fecha','Mes','Asesor','Monto_Venta','Tipo_Registro','Fuente','Clave_Registro',
               'Servicios_AF','Servicios_CH','TS_TSC','Propiedades','Nichos',
               'Total_Unidades','Meta_Mensual','Hoja_Origen','Fila_Origen'];
        $seen=[];
        foreach(hsRows($zip,'DASHBOARD',$ss) as [$rn,$v,$f]){
            if($header===null){
                if($rn>10)throw new RuntimeException('Encabezado comercial no reconocido.');
                if(veNorm($v[0]??'')==='FECHA'){
                    $header=veHeaders($v);
                    if(array_diff($need,array_keys($header)))
                        throw new RuntimeException('El libro Comercial cambió de columnas.');
                }continue;
            }
            $type=veNorm(vePick($v,$header,'Tipo_Registro'));
            if($type==='')continue;
            if(!in_array($type,['SEMANAL','MENSUAL'],true))
                throw new RuntimeException('Tipo de registro Comercial inesperado.');
            $key=trim((string)vePick($v,$header,'Clave_Registro'));
            if($key===''||isset($seen[$key]))throw new RuntimeException('Clave Comercial ausente o duplicada.');
            $seen[$key]=true;
            $month=veMes(vePick($v,$header,'Mes'));
            if($month===null)throw new RuntimeException('Mes inválido en Comercial.');
            $measure=[];
            foreach(['Monto_Venta'=>'montoVenta','Meta_Mensual'=>'metaMensual'] as $source=>$name)
                $measure[$name]=hsCents(vePick($v,$header,$source)??'0')/100;
            foreach(['Servicios_AF'=>'serviciosAf','Servicios_CH'=>'serviciosCh',
                     'TS_TSC'=>'tsTsc','Propiedades'=>'propiedades','Nichos'=>'nichos',
                     'Total_Unidades'=>'totalUnidades'] as $source=>$name){
                $n=vePick($v,$header,$source);
                if($n===null||trim((string)$n)==='')$n=0;
                if(!is_numeric($n)||(float)$n<0)throw new RuntimeException('Cantidad de unidades inválida.');
                $measure[$name]=(float)$n;
            }
            $out[]=[
                'id'=>'VENTAS_EXCEL|'.hash('sha256',$key),
                'mes'=>$month,
                'fecha'=>trim((string)vePick($v,$header,'Fecha')),
                'asesor'=>trim((string)vePick($v,$header,'Asesor')),
                'semana'=>trim((string)vePick($v,$header,'Semana')),
                'sucursal'=>trim((string)vePick($v,$header,'Sucursal')),
                'tipoRegistro'=>$type==='MENSUAL'?'Mensual':'Semanal',
                'fuente'=>'Ventas 2026',
                'fuenteOrigen'=>'excel_original_ventas',
                'claveRegistro'=>$key,
                'hojaOrigen'=>trim((string)vePick($v,$header,'Hoja_Origen')),
                'filaOrigen'=>(int)vePick($v,$header,'Fila_Origen'),
                ...$measure
            ];
        }
        if($header===null)throw new RuntimeException('Encabezado Comercial ausente.');
        return $out;
    }finally{$zip->close();}
}
/**
 * Fecha original: no hay una columna fija en las tres sucursales. La hoja
 * CHURUBUSCO usa principalmente AC:AE, LOTES y AGUA FRIA usan AA:AC;
 * algunas filas intercambian esos grupos. Nunca usar año de una cabecera
 * de mes ni inferir fecha del índice de fila.
 */
function veFechaContratoOriginal(array $v):array {
    $dates=[];
    foreach([26,28] as $dayColumn){
        $d=$v[$dayColumn]??null;
        $monthName=veNorm($v[$dayColumn+1]??'');
        $year=$v[$dayColumn+2]??null;
        if(!is_numeric($d)||!is_numeric($year)||!isset(VE_MESES[$monthName]))continue;
        $day=(int)$d;$y=(int)$year;$m=VE_MESES[$monthName];
        if((float)$d!==$day||(float)$year!==$y||$y<2000||$y>2100||!checkdate($m,$day,$y))continue;
        $dt=sprintf('%04d-%02d-%02d',$y,$m,$day);
        $dates[$dt]=indexToLetter($dayColumn);
    }
    if(count($dates)===1)return ['fecha'=>array_key_first($dates),'columna'=>reset($dates),'ambigua'=>false];
    return ['fecha'=>null,'columna'=>null,'ambigua'=>count($dates)>1];
}
function veImporteContrato($value):?int {
    if($value===null||is_bool($value))return null;
    $text=trim((string)$value);
    $text=str_replace(["\xc2\xa0","\u{00A0}",'$',' ',",","\t","\r","\n"],'',$text);
    if($text===''||$text==='-'||$text==='–'||$text==='—')return null;
    if(preg_match('/^\((.*)\)$/D',$text,$m))$text='-'.$m[1];
    try{return hsCents($text);}
    catch(Throwable $e){return null;}
}
function veClaveContrato(string $sheet,$num,$ref):string {
    return hash('sha256',$sheet.'|'.veNorm($num).'|'.veNorm($ref));
}
function veAuditContratos(string $filename):array {
    $zip=new ZipArchive();
    if($zip->open($filename,ZipArchive::CHECKCONS)!==true)
        throw new RuntimeException('Excel CONTRATOS no es ZIP íntegro.');
    try {
        $sheets=veSheetNames($zip);$ss=readStrings($zip);
        $required=['LOTES','CHURUBUSCO','AGUA FRIA'];
        $missing=array_values(array_diff($required,$sheets));
        if($missing)throw new RuntimeException('Faltan hojas originales: '.implode(', ',$missing));
        $records=[];$sources=[];$months2026=[];$sum=0;
        foreach($required as $sheet){
            $info=['registrosCandidatos'=>0,'fechaNoReconocida'=>0,'fechaAmbigua'=>0,
                   'montoNoNumerico'=>0,'posiblesCancelaciones'=>0,'clavesRepetidas'=>0,
                   'coincidenciasRepetidas'=>0,'anios'=>[],'fechasEnColumnas'=>[]];
            foreach(hsRows($zip,$sheet,$ss) as [$rn,$row,$formula]){
                $b=trim((string)($row[1]??''));
                if(!preg_match('/[A-Z]{1,4}-[A-Z0-9\/-]*\d/i',$b)||str_contains($b,'****'))
                    continue;
                $c=trim((string)($row[2]??''));
                $info['registrosCandidatos']++;
                $date=veFechaContratoOriginal($row);
                $amount=veImporteContrato($row[25]??null);
                $cancelled=(bool)preg_match('/CANCELAD|ANULAD|CANCELACI[OÓ]N/ui',$b);
                if($date['fecha']===null)$info['fechaNoReconocida']++;
                if($date['ambigua'])$info['fechaAmbigua']++;
                if($amount===null)$info['montoNoNumerico']++;
                if($cancelled)$info['posiblesCancelaciones']++;
                if($date['fecha']!==null){
                    $yr=substr($date['fecha'],0,4);
                    $info['anios'][$yr]=($info['anios'][$yr]??0)+1;
                    $col=(string)$date['columna'];
                    $info['fechasEnColumnas'][$col]=($info['fechasEnColumnas'][$col]??0)+1;
                    if($yr==='2026'){
                        $month=substr($date['fecha'],0,7);
                        if(!isset($months2026[$month]))$months2026[$month]=[];
                        $months2026[$month][$sheet]=($months2026[$month][$sheet]??0)+1;
                    }
                }
                $identity=veClaveContrato($sheet,$b,$c);
                if(!isset($records[$identity]))$records[$identity]=[];
                $records[$identity][]=[
                    'fila'=>$rn,'fecha'=>$date['fecha'],'montoCentavos'=>$amount,
                    'cancelacionDetectada'=>$cancelled
                ];
                if(count($records[$identity])===2){$info['clavesRepetidas']++;}
                if(count($records[$identity])>1)$info['coincidenciasRepetidas']++;
            }
            ksort($info['anios']);ksort($info['fechasEnColumnas']);$sources[$sheet]=$info;
            $sum+=$info['registrosCandidatos'];
        }
        ksort($months2026);
        $report=['registrosAuxiliares'=>0,'clavesDuplicadas'=>0,'clavesUnicas'=>0,
            'registrosPorOrigen'=>[],'coincidenciasUnicas'=>0,'sinCorrespondencia'=>0,
            'correspondenciaAmbigua'=>0,'filaOrigenDesplazada'=>0,
            'fechasConciliadas'=>0,'importesConciliados'=>0,
            'diferenciasFecha'=>0,'diferenciasImporte'=>0,
            'importeNoNumericoEnConsolidado'=>0];
        $errors=[];$seen=[];$header=null;
        if(in_array('DASHBOARD',$sheets,true)){
            foreach(hsRows($zip,'DASHBOARD',$ss) as [$rn,$row,$formula]){
                if($header===null){
                    if($rn>15)throw new RuntimeException('Falta encabezado de tabla auxiliar.');
                    if(veNorm($row[0]??'')==='FECHA'){
                        $header=veHeaders($row);
                        $needed=['Tipo_Registro','Hoja_Origen','Clave_Registro',
                                 'Numero_Contrato','Referencia','Fecha_Contrato',
                                 'Fila_Origen','Monto_Venta'];
                        if($absent=array_diff($needed,array_keys($header)))
                            throw new RuntimeException('Columnas auxiliares ausentes: '.implode(', ',$absent));
                    }
                    continue;
                }
                $kind=veNorm(vePick($row,$header,'Tipo_Registro'));
                if($kind==='')continue;
                if($kind!=='TRANSACCION'){$errors[]=['codigo'=>'TIPO_AUXILIAR_INVALIDO','fila'=>$rn];continue;}
                $report['registrosAuxiliares']++;
                $sheet=trim((string)vePick($row,$header,'Hoja_Origen'));
                $report['registrosPorOrigen'][$sheet]=($report['registrosPorOrigen'][$sheet]??0)+1;
                $key=trim((string)vePick($row,$header,'Clave_Registro'));
                if($key===''){$errors[]=['codigo'=>'CLAVE_AUXILIAR_VACIA','fila'=>$rn];continue;}
                if(isset($seen[$key]))$report['clavesDuplicadas']++;
                $seen[$key]=true;
                $identity=veClaveContrato($sheet,
                    vePick($row,$header,'Numero_Contrato'),
                    vePick($row,$header,'Referencia'));
                $matches=$records[$identity]??[];
                if(count($matches)===0){$report['sinCorrespondencia']++;continue;}
                if(count($matches)>1){$report['correspondenciaAmbigua']++;continue;}
                $report['coincidenciasUnicas']++;
                $found=$matches[0];
                if((int)vePick($row,$header,'Fila_Origen')!==$found['fila'])
                    $report['filaOrigenDesplazada']++;
                $date=substr((string)(vePick($row,$header,'Fecha_Contrato')??''),0,10);
                if($date===$found['fecha'])$report['fechasConciliadas']++;
                else { $report['diferenciasFecha']++; $report['fechaMuestraQA'][]=['fuente'=>$found['fecha'],'consolidado'=>$date]; }
                $amount=veImporteContrato(vePick($row,$header,'Monto_Venta'));
                if($amount===null)$report['importeNoNumericoEnConsolidado']++;
                elseif($amount===$found['montoCentavos'])$report['importesConciliados']++;
                else $report['diferenciasImporte']++;
            }
            if($header===null)throw new RuntimeException('Falta encabezado de DASHBOARD auxiliar.');
        }
        $report['clavesUnicas']=count($seen);
        $quality=!$errors&&$report['sinCorrespondencia']===0&&
            $report['correspondenciaAmbigua']===0&&$report['diferenciasImporte']===0&&
            $report['diferenciasFecha']===0&&$report['clavesDuplicadas']===0;
        return [
            'hojas'=>$sheets,'origenesPresentes'=>$required,'hojasFaltantes'=>[],
            'contratosOriginalesCandidatos'=>$sum,'auditoriaPorOrigen'=>$sources,
            'distribucionMeses2026'=>$months2026,
            'tablaAuxiliar'=>in_array('DASHBOARD',$sheets,true)?'DASHBOARD':'NO EXISTE',
            'registrosAuxiliares'=>$report['registrosAuxiliares'],
            'clavesDuplicadas'=>$report['clavesDuplicadas'],
            'clavesUnicas'=>$report['clavesUnicas'],
            'registrosPorOrigen'=>$report['registrosPorOrigen'],
            'conciliacionOriginalVsAuxiliar'=>$report,
            'incidencias'=>$errors,
            // Existen fechas ausentes, cancelaciones y duplicados de originales;
            // no transformar automaticamente 'candidato' en 'venta confirmada'.
            'conciliacionAuxiliarSinDiferencias'=>$quality,
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

/**
 * Revisar eTags en cada ciclo de 15 minutos; sólo recalcular si cambiaron.
 * En esta etapa el motor NO cambia BI_Ventas ni almacena contratos personales.
 * Esta función es compatible con el gestor de motores privados existente.
 */
function veRun(bool $force=false):array {
    $lock=fopen(HS_DIR.'/ventas_auditoria.lock','c');
    if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))return ['estado'=>'ocupado','build'=>VE_BUILD];
    $start=microtime(true);
    $old=hsRead('ventas_estado.json');
    $run=['build'=>VE_BUILD,'inicioUTC'=>hsNow(),'estado'=>'pendiente','modificoProduccion'=>false];
    try{
        $token=hsToken();$changed=$force||!isset($old['archivos'])||
            (($old['build']??null)!==VE_BUILD);
        $observed=[];
        foreach(veFuentes() as $label=>$src){
            try{
                $meta=hsRemoteJson($src['drive'],'/items/'.rawurlencode($src['id']).
                    '?%24select=id,name,eTag,size,lastModifiedDateTime',$token);
                if(($meta['id']??'')!==$src['id']||($meta['name']??'')!==$src['name']||
                   empty($meta['eTag']))throw new RuntimeException('Archivo origen inesperado.');
                $etag=(string)$meta['eTag'];
                $observed[$label]=['etag'=>$etag,'modificadoUTC'=>$meta['lastModifiedDateTime']??null];
                if(($old['archivos'][$label]['etag']??null)!==$etag)$changed=true;
            }catch(Throwable $e){
                $run['errores'][$label]='No se pudo verificar origen actual.';
                $changed=true;
            }
        }
        if(!$changed&&!isset($run['errores'])){
            $run['estado']='sin_cambios';
            $run['versionValidadaUTC']=$old['versionValidadaUTC']??null;
            $old['verificadoUTC']=hsNow();$old['ultimaEjecucion']=$run;
            hsWrite('ventas_estado.json',$old);
            return $run;
        }
        if(isset($run['errores']))throw new RuntimeException('Metadatos actuales no disponibles.');
        $fresh=veInspeccion();
        if(count($fresh['archivos']??[])!==2)throw new RuntimeException('Auditoria incompleta.');
        $valid=true;
        foreach($observed as $name=>$metadata){
            $entry=$fresh['archivos'][$name]??[];
            if(empty($entry['identidadValidada'])||!is_array($entry['auditoria']??null)
               ||($entry['etag']??null)!==$metadata['etag']){
                $valid=false;$run['errores'][$name]='Auditoria no validada para la version observada.';
            }
        }
        if(!$valid)throw new RuntimeException('Una o mas fuentes no superaron verificacion.');
        $fresh['verificadoUTC']=hsNow();
        $fresh['ultimaEjecucion']=$run;
        $fresh['versionValidadaUTC']=hsNow();
        // Informe privado, no reemplaza los datos de los cuadros del Dashboard.
        hsWrite('ventas_estado.json',$fresh);
        $run['estado']='auditado';
        $run['listoParaPublicar']=false;
        $run['archivos']=array_map(static fn(array $v)=>[
            'identidadValidada'=>$v['identidadValidada']??false,
            'auditoriaRealizada'=>isset($v['auditoria']),
            'listoParaActivar'=>$v['listoParaActivar']??false
        ],$fresh['archivos']);
        return $run;
    }catch(Throwable $e){
        $run['estado']='incidencia';
        $run['error']='No se pudo acreditar la version actual de ambas fuentes.';
        $old['antigua']=true;
        $old['ultimoIntentoUTC']=hsNow();
        $old['error']=$run['error'];
        $old['ultimaEjecucion']=$run;
        hsWrite('ventas_estado.json',$old);
        error_log('Motor Ventas QA: '.$e->getMessage());
        return $run;
    }finally{
        $run['finUTC']=hsNow();
        $run['segundos']=round(microtime(true)-$start,2);
        $log=HS_DIR.'/ventas_ciclos.jsonl';
        file_put_contents($log,json_encode($run,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n",FILE_APPEND|LOCK_EX);
        chmod($log,0600);
        flock($lock,LOCK_UN);fclose($lock);
    }
}
