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
const VE_BUILD = '20261113-metas-manuales-2';
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
/** Solo retira anotaciones parentéticas inequívocas de alta reciente para metas.
 * No modifica el nombre original ni crea equivalencias libres entre personas.
 */
function veClaveMetaAsesor($name):string {
    $s=veNorm($name);
    $s=preg_replace('/\s*\(\s*NUEV[AO]\s*\)\s*$/u','',$s)??$s;
    $key=veClaveAsesor($s);
    // Variación comprobada en el libro: hoja de ventas GRISCELDA, metas GRISELDA.
    return $key==='GRISCELDA'?'GRISELDA':$key;
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
 * METAS es la única fuente oficial por asesor (columna C); jamás consultar
 * METAS_BI o DASHBOARD. Las filas antiguas no deben sobrescribir las nuevas.
 *
 * El libro actual contiene dos series manuales: ENERO-MAYO (sin año) y
 * FEBRERO-DICIEMBRE (también sin año tras editarse el 13/nov/2026).
 * Sin fechas explícitas, solo se toma la única serie cronológica larga
 * FEBRERO-DICIEMBRE, anclada al libro 2026. ENERO queda sin atribución
 * histórica: no se inventa su año ni se mezclan metas de series distintas.
 *
 * Si vuelven a existir marcas de fecha explícitas (01/mm/2026), tienen
 * preferencia sobre la inferencia estructural y se respeta el año mostrado.
 */
function veMetasOriginales(ZipArchive $zip,array $ss):array {
    $blocks=[];$current=null;
    $groups=['MASTER','ELITE','SENIOR','JUNIOR','PRINCIPIANTE','ASESOR','TOTAL'];
    foreach(hsRows($zip,'METAS',$ss) as [$rn,$row,$formula]){
        $a=veNorm($row[0]??'');
        $date=hsDate($row[0]??null);
        $explicit=$date!==null&&substr($date,8,2)==='01';
        if($explicit||isset(VE_MESES[$a])){
            $monthNumber=$explicit?(int)substr($date,5,2):VE_MESES[$a];
            $blocks[]=['month'=>$monthNumber,'year'=>$explicit?(int)substr($date,0,4):null,
                'fila'=>$rn,'rows'=>[]];
            $current=count($blocks)-1;
            continue;
        }
        if($current===null||$a===''||in_array($a,$groups,true))continue;
        $value=$row[2]??null;
        if($value===null||trim((string)$value)==='')continue;
        $blocks[$current]['rows'][]=['asesor'=>$a,'valor'=>$value,'fila'=>$rn];
    }

    $chosen=[];$issues=[];$hasExplicit=false;$activeYear=null;
    foreach($blocks as $i=>$block){
        if($block['year']!==null){$hasExplicit=true;$activeYear=$block['year'];}
        if($activeYear===VE_YEAR)$chosen[]=$i;
    }
    if(!$hasExplicit){
        // Separa las series cuando el mes retrocede o se repite. Nunca
        // concatena metas de secuencias antiguas aunque tengan los mismos
        // encabezados. Solo la única serie larga que termina en diciembre
        // puede identificarse como la serie del libro 2026.
        $runs=[];$run=[];$previous=0;
        foreach($blocks as $i=>$block){
            if($run&&$block['month']<=$previous){$runs[]=$run;$run=[];}
            $run[]=$i;$previous=$block['month'];
        }
        if($run)$runs[]=$run;
        $candidates=array_values(array_filter($runs,static function(array $run)use($blocks):bool{
            $first=$blocks[$run[0]]['month'];
            $last=$blocks[$run[count($run)-1]]['month'];
            return count($run)>=8&&$first<=4&&$last===12;
        }));
        if(count($candidates)===1)$chosen=$candidates[0];
        else $issues[]=['codigo'=>'SERIE_METAS_2026_SIN_ANCLA_UNICA',
            'seriesCandidatas'=>count($candidates)];
    }
    $totals=[];$advisorGoals=[];$counts=[];
    if($chosen){
        $minMonth=min(array_map(static fn($i)=>$blocks[$i]['month'],$chosen));
        if($minMonth>1)$issues[]=['codigo'=>'ENERO_2026_SIN_ANCLA_CONFIRMADA'];
    }
    foreach($chosen as $i){
        $block=$blocks[$i];
        $month=sprintf('%04d-%02d',VE_YEAR,$block['month']);
        foreach($block['rows'] as $entry){
            try{$cents=hsCents($entry['valor']);}
            catch(Throwable $e){
                $issues[]=['codigo'=>'META_INVALIDA','mes'=>$month,'fila'=>$entry['fila']];
                continue;
            }
            $advisor=veClaveMetaAsesor($entry['asesor']);
            if($cents<0||$advisor===''){
                $issues[]=['codigo'=>'META_INVALIDA','mes'=>$month,'fila'=>$entry['fila']];
                continue;
            }
            if(isset($advisorGoals[$month][$advisor])){
                $issues[]=['codigo'=>'ASESOR_META_DUPLICADA','mes'=>$month,'fila'=>$entry['fila']];
                continue;
            }
            $advisorGoals[$month][$advisor]=$cents;
            $totals[$month]=($totals[$month]??0)+$cents;
            $counts[$month]=($counts[$month]??0)+1;
        }
    }
    ksort($totals);
    return ['fuente'=>'METAS','totalesCentavos'=>$totals,
        'registrosPorMes'=>$counts,'incidencias'=>$issues,'_asesores'=>$advisorGoals];
}
function veNumeroUnidades($raw):float {
    if($raw===null)return 0.0;
    // Excel guarda un NBSP U+00A0 en AGOSTO!H22: trim() no lo elimina.
    $s=preg_replace('/[\x{00A0}\x{202F}\x{2007}\x{FEFF}]/u',' ',(string)$raw);
    if($s===null)throw new RuntimeException('Unidad con UTF-8 inválido.');
    $s=trim($s);
    if($s==='')return 0.0;
    if(!is_numeric($s)||(float)$s<0)throw new RuntimeException('Unidades no numéricas.');
    return (float)$s;
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
            $diffAdvisors=0;$missingGoals=0;
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
                $meta=$metas['_asesores'][$month][veClaveMetaAsesor($label)]??null;
                if($meta===null)$missingGoals++;
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
                'asesoresSinMeta'=>$missingGoals
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
/** Código estable. Conserva la clave, pero aparta anotaciones como CANCELADO. */
function veNumeroContratoCanonico($number):string {
    $s=veNorm($number);
    $s=preg_replace('/^PENDIENTE[\s-]+/u','',$s)??$s;
    $s=preg_replace('/\s*\/{2}.*$/u','',$s)??$s;
    if(preg_match('/^([A-Z]{1,4}-[A-Z0-9\/-]*\d[A-Z0-9\/-]*)/u',$s,$m))
        return rtrim($m[1],'-/');
    return $s;
}
function veClaveContrato(string $sheet,$num,$ref):string {
    return hash('sha256',veNorm($sheet).'|'.veNumeroContratoCanonico($num).'|'.veNorm($ref));
}
/**
 * Clasificación conservadora: SIN MARCA NO SIGNIFICA VIGENTE.
 * Los comentarios de B pueden señalar cancelación o corrección de un contrato.
 */
function veEstadoTextoContrato($number):string {
    $s=veNorm($number);
    if(preg_match('/CANCELAD|SE\s+CANCELA|ANULAD|RESCISI|DEVOLUC/u',$s))
        return 'CANCELACION_EXPLICITA';
    if(preg_match('/PENDIENTE|POR\s+ASIGNAR|POR\s+DEFINIR/u',$s))
        return 'PENDIENTE_DE_VALIDACION';
    if(preg_match('/ANTES|AHORA|CORREGID|CAMBIO|REASIGNAD/u',$s))
        return 'NOTA_DE_MODIFICACION';
    return 'SIN_ESTADO_DE_VIGENCIA';
}
/**
 * Una lectura sobre las tres hojas ORIGINALES. No consulta hojas generadas.
 * - audit=true, details=false: estadísticas sin información personal.
 * - details=true, $month: contratos del mes con anotaciones de incertidumbre.
 * Filas idénticas se colapsan por clave, pero divergencias de fecha, precio o
 * servicio no se resuelven arbitrariamente.
 */
function veProcesarContratosOriginales(string $filename,?string $month=null,bool $details=false):array {
    if($month!==null&&!preg_match('/^20\d\d(?:-(0[1-9]|1[0-2]))?$/D',$month))
        throw new InvalidArgumentException('Mes de contratos inválido.');
    $zip=new ZipArchive();
    if($zip->open($filename,ZipArchive::CHECKCONS)!==true)
        throw new RuntimeException('Libro de contratos no íntegro.');
    try{
        $sheets=veSheetNames($zip);$ss=readStrings($zip);
        $names=['LOTES','CHURUBUSCO','AGUA FRIA'];
        $missing=array_values(array_diff($names,$sheets));
        if($missing)throw new RuntimeException('Hojas originales ausentes: '.implode(', ',$missing));
        $groups=[];$counts=[];$perMonth=[];$candidates=0;
        $noDate=0;$noReference=0;$noPrice=0;$rawCancelled=0;
        foreach($names as $sheet){
            $metrics=['candidatos'=>0,'sinFecha'=>0,'sinReferencia'=>0,
                'importeNoNumerico'=>0,'cancelacionesExplicitadas'=>0,
                'años'=>[]];
            foreach(hsRows($zip,$sheet,$ss) as [$rn,$row,$formulas]){
                $raw=trim((string)($row[1]??''));
                if(!preg_match('/[A-Z]{1,4}-[A-Z0-9\/-]*\d/i',$raw)||
                    str_contains($raw,'****'))continue;
                $reference=veNorm($row[2]??'');
                $status=veEstadoTextoContrato($raw);
                $date=veFechaContratoOriginal($row);
                $amount=veImporteContrato($row[25]??null);
                $service=veNorm($row[19]??'');
                $product=veNorm($row[20]??'');
                $candidates++;$metrics['candidatos']++;
                if($reference===''){$noReference++;$metrics['sinReferencia']++;}
                if($date['fecha']===null){$noDate++;$metrics['sinFecha']++;}
                if($amount===null){$noPrice++;$metrics['importeNoNumerico']++;}
                if($status==='CANCELACION_EXPLICITA'){
                    $rawCancelled++;$metrics['cancelacionesExplicitadas']++;
                }
                $part=$date['fecha']===null?null:substr($date['fecha'],0,7);
                if($part!==null){
                    $year=substr($part,0,4);
                    $metrics['años'][$year]=($metrics['años'][$year]??0)+1;
                    if(!isset($perMonth[$part]))$perMonth[$part]=[
                        'candidatos'=>0,'porHoja'=>[],'importeNominalCandidatosCentavos'=>0,
                        'importesSinValor'=>0,'marcasCancelacion'=>0
                    ];
                    $m=&$perMonth[$part];
                    $m['candidatos']++;
                    $m['porHoja'][$sheet]=($m['porHoja'][$sheet]??0)+1;
                    if($amount===null)$m['importesSinValor']++;
                    else $m['importeNominalCandidatosCentavos']+=$amount;
                    if($status==='CANCELACION_EXPLICITA')$m['marcasCancelacion']++;
                    unset($m);
                }
                $key=veClaveContrato($sheet,$raw,$reference);
                $fingerprint=hash('sha256',($date['fecha']??'SIN_FECHA').'|'.
                    ($amount===null?'SIN_IMPORTE':(string)$amount).'|'.$service.'|'.$product);
                $want=$details&&($month===null||$part===$month||
                    (strlen($month)===4&&str_starts_with((string)$part,$month.'-')));
                $record=null;
                if($want){
                    $customer=trim(implode(' ',array_filter(array_map(
                        static fn($v)=>trim((string)($v??'')),
                        [$row[3]??null,$row[4]??null,$row[5]??null]
                    ),static fn($v)=>$v!=='')));
                    $record=[
                        'id'=>'CONTRATO_XLSX|'.$key,
                        'fuente'=>'CONTRATOS','hojaOrigen'=>$sheet,
                        'origen'=>'CONTRATOS_ORIGINALES',
                        'numeroContrato'=>$raw,'referencia'=>$reference,
                        'fecha'=>$date['fecha'],'fechaContrato'=>$date['fecha'],'mes'=>$part,
                        'cliente'=>$customer,'tipoServicio'=>trim((string)($row[19]??'')),
                        'claveProducto'=>trim((string)($row[20]??'')),
                        'descripcionProducto'=>trim((string)($row[21]??'')),
                        'importeContrato'=>$amount===null?null:$amount/100,
                        // Evitar por construcción que se sume a los KPI de Comercial.
                        'montoVenta'=>null,'total'=>null,
                        'aportaTotalComercial'=>false,
                        'filaOrigen'=>$rn,
                        'estadoFuente'=>$status
                    ];
                }
                if(!isset($groups[$key])){
                    $groups[$key]=['huella'=>$fingerprint,'cantidad'=>1,
                        'conflicto'=>false,'cancelacion'=>$status==='CANCELACION_EXPLICITA',
                        'pendiente'=>$status==='PENDIENTE_DE_VALIDACION',
                        'nota'=>$status==='NOTA_DE_MODIFICACION',
                        'sinFecha'=>$date['fecha']===null,'sinReferencia'=>$reference==='',
                        'sinImporte'=>$amount===null,'ambiguaFecha'=>$date['ambigua'],
                        'registros'=>$record,'mesOriginal'=>$part,
                        'importeOriginal'=>$amount];
                }else{
                    $g=&$groups[$key];
                    $g['cantidad']++;
                    if($g['huella']!==$fingerprint)$g['conflicto']=true;
                    $g['cancelacion']=$g['cancelacion']||$status==='CANCELACION_EXPLICITA';
                    $g['pendiente']=$g['pendiente']||$status==='PENDIENTE_DE_VALIDACION';
                    $g['nota']=$g['nota']||$status==='NOTA_DE_MODIFICACION';
                    $g['sinFecha']=$g['sinFecha']||$date['fecha']===null;
                    $g['sinReferencia']=$g['sinReferencia']||$reference==='';
                    $g['sinImporte']=$g['sinImporte']||$amount===null;
                    $g['ambiguaFecha']=$g['ambiguaFecha']||$date['ambigua'];
                    if($g['registros']===null&&$record!==null)$g['registros']=$record;
                    unset($g);
                }
            }
            ksort($metrics['años']);$counts[$sheet]=$metrics;
        }
        $duplicates=0;$exactDuplicates=0;$conflictGroups=0;$uncertain=0;
        $rows=[];$ignoredKeys=0;$ignoredRows=0;
        foreach($groups as $entry){
            $repeated=$entry['cantidad']>1;
            if($repeated){
                $ignoredKeys++;$ignoredRows+=$entry['cantidad'];
                $duplicates+=$entry['cantidad']-1;
                if($entry['conflicto'])$conflictGroups++;
                else $exactDuplicates+=$entry['cantidad']-1;
            }
            if($entry['cancelacion']||$entry['pendiente']||$entry['nota']||
               $entry['conflicto']||$entry['sinFecha']||$entry['sinReferencia']||
               $entry['sinImporte']||$entry['ambiguaFecha'])$uncertain++;
            if($entry['mesOriginal']!==null){
                $m=&$perMonth[$entry['mesOriginal']];
                if($repeated){
                    $m['filasRepetidasIgnoradas']=($m['filasRepetidasIgnoradas']??0)+$entry['cantidad'];
                }else{
                    $m['contratosUnicosNoRepetidos']=($m['contratosUnicosNoRepetidos']??0)+1;
                    if($entry['importeOriginal']!==null)
                        $m['importeNominalSinRepetidosCentavos']=
                            ($m['importeNominalSinRepetidosCentavos']??0)+$entry['importeOriginal'];
                }
                unset($m);
            }
            // Todos los registros con clave repetida se ignoran temporalmente.
            // No elegir arbitrariamente el primero ni el ultimo.
            if($repeated)continue;
            if($details&&$entry['registros']!==null){
                $item=$entry['registros'];
                $item['repeticionesOrigen']=$entry['cantidad'];
                $item['duplicadoIdentico']=$repeated&&!$entry['conflicto'];
                $item['estadoFuente']=$entry['cancelacion']?'CANCELACION_EXPLICITA':
                    ($entry['conflicto']?'CLAVE_CON_DATOS_CONFLICTIVOS':
                    ($entry['pendiente']?'PENDIENTE_DE_VALIDACION':
                    ($entry['nota']?'NOTA_DE_MODIFICACION':'SIN_ESTADO_DE_VIGENCIA')));
                $item['integridad']=$entry['conflicto']||$entry['ambiguaFecha']?
                    'REQUIERE_CONCILIACION':($entry['sinFecha']||$entry['sinReferencia']||
                    $entry['sinImporte']?'INCOMPLETO':'ESTRUCTURALMENTE_VALIDO');
                // No afirmar "vigente" a partir de ausencia de texto de cancelación.
                $item['ventaVigenteConfirmada']=false;
                if($entry['conflicto'])$item['importeContrato']=null;
                $rows[]=$item;
            }
        }
        ksort($perMonth);
        $audit=[
            'origen'=>'HOJAS_ORIGINALES_CONTRATOS',
            'origenes'=>$names,'registrosCandidatos'=>$candidates,
            'clavesUnicas'=>count($groups),
            'repeticionesDetectadas'=>$duplicates,
            'repeticionesIdenticas'=>$exactDuplicates,
            'gruposRepetidosIgnorados'=>$ignoredKeys,
            'filasRepetidasIgnoradas'=>$ignoredRows,
            'clavesUnicasNoRepetidas'=>count($groups)-$ignoredKeys,
            'gruposConDatosConflictivos'=>$conflictGroups,
            'sinFecha'=>$noDate,'sinReferencia'=>$noReference,
            'importesNoNumericos'=>$noPrice,
            'cancelacionesExplicitas'=>$rawCancelled,
            'gruposConIncidencias'=>$uncertain,
            'porHoja'=>$counts,'porMes'=>$perMonth,
            'criterio'=>'Contrato/referencia identifica un expediente; ningún contrato se suma al monto vendido por asesor.',
            'listoParaActivar'=>false
        ];
        return ['auditoria'=>$audit,'registros'=>$rows];
    }finally{$zip->close();}
}
/** Cache privada para 2026, excluyendo todos los contratos de clave repetida. */
function veLeerContratosAnio(string $filename,int $year=VE_YEAR):array {
    if($year!==VE_YEAR)throw new InvalidArgumentException('Anio fuera de alcance QA.');
    return veProcesarContratosOriginales($filename,(string)$year,true)['registros'];
}
function veAuditContratos(string $filename):array {
    return veProcesarContratosOriginales($filename,null,false)['auditoria'];
}
/** Detalle de un mes para vistas de contratos; nunca sumar al KPI de ventas. */
function veLeerContratosOriginales(string $filename,string $month):array {
    return veProcesarContratosOriginales($filename,$month,true)['registros'];
}
/**
 * Comparación diagnóstica de fuentes NO aditivas. No se exige igualdad:
 * Comercial registra ventas mensuales por asesor; Cobranza expedientes.
 */
function veConciliarFuentesOriginales(?array $comercial,?array $contracts):array {
    if(!is_array($comercial)||!is_array($contracts)||
       !isset($comercial['meses'])||!isset($contracts['porMes']))
        return ['estado'=>'SIN_COMPARACION','sumarAmbasFuentes'=>false,'meses'=>[]];
    $months=array_unique(array_merge(array_keys($comercial['meses']),
                                      array_keys($contracts['porMes'])));
    sort($months,SORT_STRING);$items=[];
    foreach($months as $month){
        $sales=$comercial['meses'][$month]??null;
        $contract=$contracts['porMes'][$month]??null;
        if($sales===null&&$contract===null)continue;
        $items[$month]=[
            'mes'=>$month,
            'ventasComercialCentavos'=>$sales['ventasCentavos']??null,
            'contratosCandidatos'=>$contract['candidatos']??0,
            'contratosUnicosNoRepetidos'=>$contract['contratosUnicosNoRepetidos']??0,
            'filasRepetidasIgnoradas'=>$contract['filasRepetidasIgnoradas']??0,
            'contratosPorOrigen'=>$contract['porHoja']??[],
            'importeNominalContratosCentavos'=>$contract['importeNominalCandidatosCentavos']??null,
            'importeNominalSinRepetidosCentavos'=>$contract['importeNominalSinRepetidosCentavos']??null,
            'diferenciaSoloDiagnosticaCentavos'=>$sales!==null&&$contract!==null?
                ($sales['ventasCentavos']-$contract['importeNominalCandidatosCentavos']):null,
            'sumarAmbasFuentes'=>false
        ];
    }
    return ['estado'=>'ORIGENES_COMPLEMENTARIOS','sumarAmbasFuentes'=>false,
        'prohibidoSumaComercialMasContratos'=>true,'meses'=>$items,
        'nota'=>'No son dos listados de ventas a sumar: uno es mensual Comercial y otro detalle de expedientes, con fechas y condiciones distintas.'];
}
/** Descarga solo los dos IDs permitidos. No muestra datos personales ni contenido del libro. */
function veInspeccion(bool $includePrivateRows=false):array {
    $result=['build'=>VE_BUILD,'horaUTC'=>hsNow(),'modo'=>'SOLO_AUDITORIA',
       'produccionModificada'=>false,'biVentasReemplazada'=>false,'archivos'=>[]];
    $token=hsToken();
    foreach(veFuentes() as $name=>$source){
        $info=['archivo'=>$source['name'],'identidadValidada'=>false,'auditoria'=>null,'error'=>null,'fase'=>'METADATOS','codigoError'=>null];
        try {
            $meta=hsRemoteJson($source['drive'],'/items/'.rawurlencode($source['id']),$token);
            if(($meta['id']??'')!==$source['id']||($meta['name']??'')!==$source['name']||
                empty($meta['eTag'])||(int)($meta['size']??0)<1)
                throw new RuntimeException('Identidad del archivo no coincide.');
            $info['identidadValidada']=true;$etag=(string)$meta['eTag'];
            $info['etag']=$etag;$info['modificadoUTC']=$meta['lastModifiedDateTime']??null;
            $info['fase']='DESCARGA';
            $download=hsSnapshotDownload($source['drive'],$meta,$token);
            try {
                if($download['metodo']!=='contenido_actual_guardado'||!empty($download['nuevaVersionPendiente'])){
                    $info['fase']='VERSION_INESTABLE';
                    throw new RuntimeException('Version no estable durante descarga.');
                }
                $info['fase']='LECTURA_EXCEL';
                // Una unica lectura por archivo; evitar dos recorridos de
                // los 14 mil contratos en un solo intento.
                if($includePrivateRows){
                    $parsed=$name==='comercial'
                        ?veParseComercialOriginal($download['temporal'])
                        :veProcesarContratosOriginales($download['temporal'],(string)VE_YEAR,true);
                    $audit=$parsed['auditoria'];
                    $result['_privateRows'][$name]=$parsed['registros'];
                }else{
                    $audit=$name==='comercial'
                        ?veAuditVentas($download['temporal'])
                        :veAuditContratos($download['temporal']);
                }
                $info['fase']='VERIFICAR_ETAG';
                $check=hsRemoteJson($source['drive'],
                    '/items/'.rawurlencode($source['id']).'?%24select=id,eTag',$token);
                if(($check['eTag']??'')!==$etag){
                    $info['fase']='VERSION_CAMBIADA';
                    throw new RuntimeException('Excel modificado durante lectura.');
                }
                $info['sha256']=$download['sha256'];
                $info['bytes']=$download['tamanoBytes'];
                $info['auditoria']=$audit;
                $info['listoParaActivar']=$audit['listoParaActivar']??false;
                $info['fase']='VALIDADA';
            }finally{@unlink($download['temporal']);}
        }catch(Throwable $e){
            // Solo categorias seguras por HTTP, sin clientes, URLs ni tokens.
            $fase=(string)($info['fase']??'DESCONOCIDA');
            $codes=[
                'METADATOS'=>'GRAPH_METADATOS',
                'DESCARGA'=>'DESCARGA_XLSX',
                'VERSION_INESTABLE'=>'VERSION_INESTABLE',
                'LECTURA_EXCEL'=>'ESTRUCTURA_EXCEL',
                'VERIFICAR_ETAG'=>'GRAPH_REVALIDACION',
                'VERSION_CAMBIADA'=>'ETAG_CAMBIADO_DURANTE_LECTURA'
            ];
            $info['codigoError']=$codes[$fase]??'ERROR_INDETERMINADO';
            $info['error']=match($info['codigoError']){
                'ESTRUCTURA_EXCEL'=>'Error al interpretar una hoja del Excel original.',
                'VERSION_INESTABLE','ETAG_CAMBIADO_DURANTE_LECTURA'=>
                    'El archivo cambió de versión durante la lectura.',
                'GRAPH_METADATOS','GRAPH_REVALIDACION'=>
                    'No se pudo comprobar la identidad o version en Graph.',
                default=>'No se pudo completar la descarga del Excel.'
            };
            $info['listoParaActivar']=false;
            error_log('Ventas QA '.$name.'/'.$info['codigoError'].': '.$e->getMessage());
        }
        $result['archivos'][$name]=$info;
    }
    $result['comparacionFuentes']=veConciliarFuentesOriginales(
        $result['archivos']['comercial']['auditoria']??null,
        $result['archivos']['contratos']['auditoria']??null
    );
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
        if(!$changed&&!isset($run['errores'])&&
           is_file(HS_DIR.'/ventas_datos_2026.json')&&
           !empty($old['versionDatos'])&&empty($old['antigua'])){
            $run['estado']='sin_cambios';
            $run['versionValidadaUTC']=$old['versionValidadaUTC']??null;
            $old['verificadoUTC']=hsNow();$old['ultimaEjecucion']=$run;
            hsWrite('ventas_estado.json',$old);
            return $run;
        }
        if(isset($run['errores']))throw new RuntimeException('Metadatos actuales no disponibles.');
        $fresh=veInspeccion(true);
        if(count($fresh['archivos']??[])!==2)throw new RuntimeException('Auditoria incompleta.');
        $valid=true;
        foreach($observed as $name=>$metadata){
            $entry=$fresh['archivos'][$name]??[];
            if(empty($entry['identidadValidada'])||!is_array($entry['auditoria']??null)
               ||($entry['etag']??null)!==$metadata['etag']){
                $valid=false;
                $run['errores'][$name]=(string)($entry['codigoError']??'ETAG_NO_COINCIDE');
                $run['fases'][$name]=(string)($entry['fase']??'DESCONOCIDA');
            }
        }
        if(!$valid)throw new RuntimeException('Una o mas fuentes no superaron verificacion.');
        $private=$fresh['_privateRows']??[];
        unset($fresh['_privateRows']);
        if(!isset($private['comercial'],$private['contratos'])||
           !is_array($private['comercial'])||!is_array($private['contratos']))
            throw new RuntimeException('El contenido de una fuente no fue verificado.');
        $stamp=hsNow();
        $hashParts=[VE_BUILD];
        foreach(['comercial','contratos'] as $name) {
            $hashParts[]=(string)$fresh['archivos'][$name]['etag'];
            $hashParts[]=(string)$fresh['archivos'][$name]['sha256'];
        }
        $version=hash('sha256',implode('|',$hashParts));
        $data=[
            'build'=>VE_BUILD,'version'=>$version,'validadoUTC'=>$stamp,
            'fuentes'=>array_map(static fn(array $v)=>[
                'etag'=>$v['etag'],'sha256'=>$v['sha256'],
                'modificadoUTC'=>$v['modificadoUTC']??null
            ],$fresh['archivos']),
            'ventas'=>$private['comercial'],
            'contratos'=>$private['contratos'],
            'metas'=>$fresh['archivos']['comercial']['auditoria']['metas']['totalesCentavos']??[],
            'resumenVentas'=>$fresh['archivos']['comercial']['auditoria']['meses']??[],
            'resumenContratos'=>$fresh['archivos']['contratos']['auditoria']['porMes']??[],
            'contratosRepetidosIgnorados'=>
                $fresh['archivos']['contratos']['auditoria']['filasRepetidasIgnoradas']??0,
            'fuenteVentasProductiva'=>false
        ];
        // Commit en dos fases: el manifiesto solo apunta a datos ya publicados.
        hsWrite('ventas_datos_2026.json',$data);
        $fresh['verificadoUTC']=$stamp;
        $fresh['ultimaEjecucion']=$run;
        $fresh['versionValidadaUTC']=$stamp;
        $fresh['versionDatos']=$version;
        $fresh['antigua']=false;
        $fresh['modo']='PARALELO_NO_PRODUCTIVO';
        hsWrite('ventas_estado.json',$fresh);
        $run['estado']='auditado';
        $run['versionDatos']=$version;
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
