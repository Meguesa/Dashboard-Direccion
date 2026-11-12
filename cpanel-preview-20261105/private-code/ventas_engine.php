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
const VE_BUILD = '20261112-originales-1';
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
    foreach(VE_MESES as $key=>$month){
        if($s===$key)return $year.'-'.str_pad((string)$month,2,'0',STR_PAD_LEFT);
        if(preg_match('/^'.preg_quote($key,'/').'\s+(20\d\d)$/D',$s,$match))
            return $match[1].'-'.str_pad((string)$month,2,'0',STR_PAD_LEFT);
    }
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
/** Normaliza diferencias de acentos/puntuación, sin inventar alias de vendedores. */
function veClaveAsesor($name):string {
    $s=veNorm($name);
    $s=strtr($s,['Á'=>'A','É'=>'E','Í'=>'I','Ó'=>'O','Ú'=>'U','Ü'=>'U','Ñ'=>'N']);
    return trim((string)preg_replace('/[^\p{L}\p{N}]+/u',' ',$s));
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
/**
 * META OFICIAL: hoja METAS de Comercial (columna C). Los bloques anteriores
 * a la primera fecha con año 2026 explícito no se atribuyen a 2026.
 * Jamás consulta hojas auxiliares creadas por flujos automáticos.
 */
function veMetasOriginales(ZipArchive $zip,array $ss):array {
    $month=null;$year=null;$totals=[];$advisorGoals=[];$counts=[];$issues=[];
    $months=VE_MESES;
    $groups=['MASTER','ELITE','SENIOR','JUNIOR','PRINCIPIANTE','ASESOR','TOTAL'];
    foreach(hsRows($zip,'METAS',$ss) as [$rn,$row,$formula]){
        $a=veNorm($row[0]??'');
        $date=hsDate($row[0]??null);
        if($date!==null && substr($date,8,2)==='01'){
            $year=(int)substr($date,0,4);
            $month=substr($date,0,7);
            continue;
        }
        if(isset($months[$a])){
            if($year===null){$month=null;continue;}
            $month=sprintf('%04d-%02d',$year,$months[$a]);continue;
        }
        if($year!==VE_YEAR||$month===null||$a===''||in_array($a,$groups,true))
            continue;
        $val=$row[2]??null;
        if($val===null||trim((string)$val)==='')continue;
        try{$cents=hsCents($val);}
        catch(Throwable $e){$issues[]=['codigo'=>'META_INVALIDA','fila'=>$rn];continue;}
        $advisor=veClaveAsesor($a);
        if($cents<0||$advisor===''){$issues[]=['codigo'=>'META_INVALIDA','fila'=>$rn];continue;}
        if(isset($advisorGoals[$month][$advisor])){
            $issues[]=['codigo'=>'ASESOR_META_DUPLICADA','mes'=>$month,'fila'=>$rn];continue;
        }
        $advisorGoals[$month][$advisor]=$cents;
        $totals[$month]=($totals[$month]??0)+$cents;
        $counts[$month]=($counts[$month]??0)+1;
    }
    ksort($totals);
    return ['fuente'=>'METAS','totalesCentavos'=>$totals,
        'registrosPorMes'=>$counts,'incidencias'=>$issues,'_asesores'=>$advisorGoals];
}
function veNumeroUnidades($raw):float {
    if($raw===null||trim((string)$raw)==='')return 0.0;
    if(!is_numeric($raw)||(float)$raw<0)throw new RuntimeException('Unidades no numéricas.');
    return (float)$raw;
}
/**
 * Origen de ventas: ENERO ... DICIEMBRE, columna G por asesor.
 * Semanas B:F son controles de conciliación, nunca movimientos adicionales.
 */
function veParseComercialOriginal(string $filename):array {
    $zip=new ZipArchive();
    if($zip->open($filename,ZipArchive::CHECKCONS)!==true)
        throw new RuntimeException('Ventas 2026.xlsx incompleto.');
    try{
        $sheets=veSheetNames($zip);$ss=readStrings($zip);
        if(!in_array('METAS',$sheets,true))throw new RuntimeException('Hoja METAS ausente.');
        $metas=veMetasOriginales($zip,$ss);$rows=[];$stats=[];$issues=[];
        foreach(VE_MESES as $sheet=>$number){
            if(!in_array($sheet,$sheets,true))continue;
            $month=sprintf('%04d-%02d',VE_YEAR,$number);
            $header=false;$summary=false;$total=0;$weekly=0;$count=0;$duplicates=[];
            $diffAdvisors=0;
            foreach(hsRows($zip,$sheet,$ss) as [$rn,$v,$formula]){
                if($rn===2){
                    if(veNorm($v[0]??'')!=='ASESOR'||
                       !str_contains(veNorm($v[6]??''),'MONTO TOTAL'))
                        throw new RuntimeException('Cabecera mensual inesperada: '.$sheet);
                    $header=true;
                    continue;
                }
                if($rn<4)continue;
                $label=trim((string)($v[0]??''));$upper=veNorm($label);
                $g=veImporteContrato($v[6]??null);
                if($upper==='TOTAL'||($upper===''&&$g!==null&&$count>0&&abs($g-$total)<=1)){
                    $summary=true;
                    if($g===null||abs($g-$total)>1)$issues[]=['codigo'=>'TOTAL_INCONSISTENTE','mes'=>$month,'fila'=>$rn];
                    break;
                }
                if($upper===''){continue;}
                if(in_array($upper,['YA CON DEPOSITO','SOLICITUDES FIRMADAS'],true))break;
                if($g===null){
                    $issues[]=['codigo'=>'IMPORTE_MENSUAL_INVALIDO','mes'=>$month,'fila'=>$rn];
                    continue;
                }
                $advisor=veClaveAsesor($label);
                if(isset($duplicates[$advisor])){
                    $issues[]=['codigo'=>'ASESOR_REPETIDO','mes'=>$month,'fila'=>$rn];continue;
                }
                $duplicates[$advisor]=true;$week=0;
                foreach([1,2,3,4,5] as $col){
                    if(!isset($v[$col])||trim((string)$v[$col])==='')continue;
                    $part=veImporteContrato($v[$col]);
                    if($part===null)throw new RuntimeException('Importe semanal inválido en '.$sheet.'!'.$rn);
                    $week+=$part;
                }
                if($g!==$week)$diffAdvisors++;
                $weekly+=$week;$total+=$g;$count++;
                $meta=$metas['_asesores'][$month][$advisor]??null;
                $rows[]=[
                    'id'=>'VENTAS_XLSX|'.hash('sha256',$month.'|'.$advisor),
                    'mes'=>$month,'fecha'=>$month.'-01','fechaExactaDisponible'=>false,
                    'asesor'=>$label,'tipoRegistro'=>'Mensual','fuente'=>'Ventas 2026',
                    'montoVenta'=>$g/100,'metaMensual'=>$meta===null?null:$meta/100,
                    'serviciosAf'=>veNumeroUnidades($v[7]??null),
                    'serviciosCh'=>veNumeroUnidades($v[8]??null),
                    'propiedades'=>veNumeroUnidades($v[9]??null),
                    'nichos'=>veNumeroUnidades($v[15]??null),
                    'tsTsc'=>veNumeroUnidades($v[21]??null),
                    'totalUnidades'=>veNumeroUnidades($v[22]??null),
                    'hojaOrigen'=>$sheet,'filaOrigen'=>$rn
                ];
            }
            if(!$header||!$summary)$issues[]=['codigo'=>'MES_SIN_TOTAL_VALIDO','mes'=>$month];
            $stats[$month]=[
                'registros'=>$count,'ventasCentavos'=>$total,'semanasCentavos'=>$weekly,
                'diferenciaCentavos'=>$total-$weekly,
                'asesoresConDiferenciaSemanal'=>$diffAdvisors,
                'metaDisponible'=>isset($metas['totalesCentavos'][$month]),
                'metaCentavos'=>$metas['totalesCentavos'][$month]??null,
                'asesoresSinMeta'=>count(array_filter(array_keys($duplicates),
                    static fn($a)=>!isset($metas['_asesores'][$month][$a])))
            ];
        }
        if(!$rows)throw new RuntimeException('Sin registros originales de ventas.');
        $publicGoals=$metas;unset($publicGoals['_asesores']);
        return ['registros'=>$rows,'auditoria'=>[
            'fuentes'=>['meses_originales','METAS'],'registros'=>count($rows),
            'meses'=>$stats,'metas'=>$publicGoals,'incidencias'=>$issues,
            'listoParaActivar'=>false // Falta conciliación contractual y metas incompletas.
        ]];
    }finally{$zip->close();}
}
function veAuditVentas(string $filename):array {
    return veParseComercialOriginal($filename)['auditoria'];
}
function veLeerRegistrosComercial(string $filename):array {
    return veParseComercialOriginal($filename)['registros'];
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
        if((float)$d!==(float)$day||(float)$year!==(float)$y||$y<2000||$y>2100||!checkdate($m,$day,$y))continue;
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
/**
 * Histórico contractual: lee exclusivamente LOTES, CHURUBUSCO y AGUA FRIA.
 * El identificador es sucursal+número+referencia (no el número de fila).
 * No adjudica cancelaciones ni infiere qué contratos son ventas comerciales.
 */
function veAuditContratos(string $filename):array {
    $zip=new ZipArchive();
    if($zip->open($filename,ZipArchive::CHECKCONS)!==true)
        throw new RuntimeException('Excel de contratos no es ZIP íntegro.');
    try{
        $sheets=veSheetNames($zip);$ss=readStrings($zip);
        $needed=['LOTES','CHURUBUSCO','AGUA FRIA'];
        $missing=array_values(array_diff($needed,$sheets));
        if($missing)throw new RuntimeException('Faltan hojas de contratos: '.implode(', ',$missing));
        $sources=[];$months=[];$total=0;$keys=[];$firstRows=[];
        $ambiguousDates=0;$missingDate=0;$unknownAmount=0;$duplicates=0;
        foreach($needed as $sheet){
            $counts=['candidatos'=>0,'clavesDuplicadas'=>0,'fechaAmbigua'=>0,
                     'sinFecha'=>0,'importeNoNumerico'=>0,'posibleCancelacion'=>0,
                     'fechasPorAnio'=>[]];
            foreach(hsRows($zip,$sheet,$ss) as [$rn,$v,$formulas]){
                $number=veNorm($v[1]??'');
                if(!preg_match('/[A-Z]{1,4}-[A-Z0-9\/-]*\d/i',$number) ||
                    str_contains($number,'****'))continue;
                $reference=veNorm($v[2]??'');
                $counts['candidatos']++;$total++;
                $identity=veClaveContrato($sheet,$number,$reference);
                if(isset($keys[$identity])){
                    $counts['clavesDuplicadas']++;$duplicates++;
                }else{$keys[$identity]=true;}
                $date=veFechaContratoOriginal($v);
                if($date['fecha']===null){$counts['sinFecha']++;$missingDate++;}
                if($date['ambigua']){$counts['fechaAmbigua']++;$ambiguousDates++;}
                $amount=veImporteContrato($v[25]??null);
                if($amount===null){$counts['importeNoNumerico']++;$unknownAmount++;}
                if(preg_match('/CANCELAD|ANULAD|CANCELACI[OÓ]N/ui',
                    (string)($v[18]??'').' '.(string)($v[19]??'')))
                    $counts['posibleCancelacion']++;
                if($date['fecha']!==null){
                    $year=substr($date['fecha'],0,4);
                    $counts['fechasPorAnio'][$year]=($counts['fechasPorAnio'][$year]??0)+1;
                    $month=substr($date['fecha'],0,7);
                    $months[$month][$sheet]=($months[$month][$sheet]??0)+1;
                }
            }
            ksort($counts['fechasPorAnio']);
            $sources[$sheet]=$counts;
        }
        ksort($months);
        return [
            'origen'=>'HOJAS_ORIGINALES_CONTRATOS',
            'origenes'=>$needed,'registrosCandidatos'=>$total,
            'clavesUnicas'=>count($keys),'clavesDuplicadas'=>$duplicates,
            'sinFecha'=>$missingDate,'fechasAmbiguas'=>$ambiguousDates,
            'importesNoNumericos'=>$unknownAmount,
            'porHoja'=>$sources,'porMes'=>$months,
            'advertencia'=>'Candidatos contractuales; no son ventas certificadas ni se suman a Comercial.',
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
