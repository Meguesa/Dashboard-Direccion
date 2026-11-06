<?php
declare(strict_types=1);
/* Ingresos originales: solo lectura en SharePoint; publicación atómica privada. */
const HS_DIR='/home/juanpab1/bi-ingresos-privado';
const HS_BUILD='20261105-historico-1';
const HS_RULES=2;
require_once HS_DIR.'/ingresos_lector_prueba.php';
umask(0077);ini_set('serialize_precision','-1');
function hsRead(string $name,array $fallback=[]):array {
    $v=json_decode((string)@file_get_contents(HS_DIR.'/'.$name),true);return is_array($v)?$v:$fallback;
}
function hsWrite(string $name,array $data):void {
    $p=HS_DIR.'/'.$name;$tmp=tempnam(HS_DIR,'hs_');
    if($tmp===false)throw new RuntimeException('No se pudo crear temporal privado.');
    try{chmod($tmp,0600);$s=json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
        if(file_put_contents($tmp,$s,LOCK_EX)!==strlen($s)||!rename($tmp,$p))throw new RuntimeException('No se pudo publicar caché.');chmod($p,0600);
    }finally{if(is_file($tmp))unlink($tmp);}
}
function hsNow():string{return gmdate('c');}
function hsCents($v):int {
    $s=trim((string)$v);
    if(!preg_match('/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/D',$s,$m))throw new RuntimeException('Importe no numérico en Excel.');
    $frac=$m[3]??'';$digits=ltrim($m[2].$frac,'0')?:'0';$scale=2+(int)($m[4]??0)-strlen($frac);
    if(abs($scale)>50||strlen($digits)>100)throw new RuntimeException('Importe fuera de rango.');
    if($scale>=0)$c=(int)($digits.str_repeat('0',$scale));
    else{$cut=-$scale;$digits=str_pad($digits,$cut+1,'0',STR_PAD_LEFT);$c=(int)substr($digits,0,-$cut);if((int)$digits[strlen($digits)-$cut]>=5)$c++;}
    return ($m[1]??'')==='-'?-$c:$c;
}
function hsText($v):string{return mb_strtoupper(trim((string)$v),'UTF-8');}
function hsDate($v):?string {
    if(is_numeric($v)&&(float)$v>=30000&&(float)$v<100000)return (new DateTimeImmutable('1899-12-30',new DateTimeZone('UTC')))->modify('+'.(int)$v.' days')->format('Y-m-d');
    foreach(['!d/m/Y','!d/m/y','!Y-m-d'] as $format){$d=DateTimeImmutable::createFromFormat($format,trim((string)$v));$e=DateTimeImmutable::getLastErrors();if($d&&(!$e||!$e['warning_count']&&!$e['error_count']))return $d->format('Y-m-d');}return null;
}
function hsRows(ZipArchive $zip,string $sheet,array $strings):Generator {
    $path=getWorksheetPath($zip,$sheet);$stat=$zip->statName($path);
    if(!$stat||$stat['size']>1200000000)throw new RuntimeException('Hoja demasiado grande.');
    $in=$zip->getStream($path);$tmp=tempnam(HS_DIR,'xml_hs_');$out=fopen($tmp,'wb');chmod($tmp,0600);
    try{if(!$in||!$out||stream_copy_to_stream($in,$out)!==$stat['size'])throw new RuntimeException('XML incompleto.');fclose($out);$out=null;fclose($in);$in=null;
        $x=new XMLReader();if(!$x->open($tmp,null,LIBXML_NONET|LIBXML_COMPACT))throw new RuntimeException('XML inválido.');
        try{while($x->read()&&$x->localName!=='row'){}while($x->nodeType===XMLReader::ELEMENT&&$x->localName==='row'){
            $ri=(int)$x->getAttribute('r');$doc=new DOMDocument();if(!$doc->loadXML($x->readOuterXML(),LIBXML_NONET|LIBXML_COMPACT))throw new RuntimeException('Fila inválida.');$values=[];$formulas=[];
            for($c=$doc->documentElement->firstChild;$c;$c=$c->nextSibling){if(!$c instanceof DOMElement||$c->localName!=='c')continue;
                preg_match('/^([A-Z]+)/',$c->getAttribute('r'),$m);$ci=columnIndex($m[1]??'A');if($ci>127)break;$raw=null;$f=null;$inline='';
                for($n=$c->firstChild;$n;$n=$n->nextSibling){if($n->localName==='v')$raw=$n->textContent;elseif($n->localName==='f')$f=$n->textContent;elseif($n->localName==='is')$inline=$n->textContent;}
                $type=$c->getAttribute('t');if($type==='s')$raw=$strings[(int)$raw]??'';elseif($type==='inlineStr')$raw=$inline;elseif($type==='e')$raw='#ERROR:'.$raw;
                $values[$ci]=$raw;if($f!==null)$formulas[$ci]=$f;
            }yield [$ri,$values,$formulas];unset($doc);if(!$x->next('row'))break;
        }}finally{$x->close();}
    }finally{if(is_resource($out))fclose($out);if(is_resource($in))fclose($in);@unlink($tmp);}
}
function hsAudit(string $file,string $month):array {
    $zip=new ZipArchive();if($zip->open($file)!==true)throw new RuntimeException('Excel no es un ZIP válido.');
    try{$ss=readStrings($zip);$work=readXml($zip,'xl/workbook.xml');$sheetNames=[];foreach($work->getElementsByTagName('sheet') as $s)$sheetNames[]=$s->getAttribute('name');
        $rows=[];$banks=[];$cats=[];$bc=[];$bad=[];$errors=[];$summaries=[];$total=0;
        foreach(['BANAMEX','BANREGIO','CAJA','JDJP','CUENTA 18'] as $bank){
            $sheet=$bank;if(!in_array($sheet,$sheetNames,true)){
                if($bank==='CUENTA 18'&&in_array('TRANSF FLORES',$sheetNames,true))$sheet='TRANSF FLORES';
                elseif($bank==='CUENTA 18'){$banks[$bank]=['registros'=>0,'centavos'=>0];continue;}
                else{$errors[]='Falta hoja '.$bank;continue;}
            }
            $headers=[];$cols=[];$bt=0;$bn=0;$commentCol=null;
            foreach(hsRows($zip,$sheet,$ss) as [$rn,$v,$f]){
                if(!$cols&&$rn<=5){$start=null;$end=null;foreach($v as $ci=>$label){if(hsText($label)==='ENG TS')$start=$ci;if(hsText($label)==='DESTAPES')$end=$ci;}
                    if($start!==null&&$end!==null&&$end>=$start){$headers=$v;$cols=range($start,$end);foreach($v as $ci=>$label)if(hsText($label)==='COMENTARIO')$commentCol=$ci;}continue;}
                if(!$cols)continue;
                $hasSum=false;$allForm=true;$hasForm=false;foreach($cols as $ci){if(preg_match('/SUM\(\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+\)/i',$f[$ci]??''))$hasSum=true;
                    if(isset($v[$ci])&&$v[$ci]!==''&&$v[$ci]!=='0'){if(!array_key_exists($ci,$f))$allForm=false;else $hasForm=true;}}
                if(empty($v[0])&&empty($v[5])&&($hasSum||$allForm&&$hasForm)){$summaries[]=$sheet.'!'.$rn;continue;}
                foreach($cols as $ci){$raw=$v[$ci]??null;if($raw===null||trim((string)$raw)==='')continue;
                    try{$amt=hsCents($raw);}catch(Throwable $e){$errors[]=$sheet.'!'.indexToLetter($ci).$rn.': importe inválido';continue;}if($amt===0)continue;
                    $date=hsDate($v[0]??null);if(!$date||substr($date,0,7)!==$month)$bad[]=['hoja'=>$sheet,'fila'=>$rn,'fecha'=>$v[0]??null,'formulaFecha'=>$f[0]??null,'centavos'=>$amt];
                    $cat=trim((string)($headers[$ci]??''));if($cat==='')$errors[]='Categoría ausente '.$sheet.'!'.$rn;
                    $ref=trim((string)($v[5]??''));$key=hash('sha256',$month.'|'.$sheet.'|'.$rn.'|'.$ci.'|'.$ref.'|'.$cat);
                    $rows[]=['fecha'=>$date,'mes'=>$month,'banco'=>$bank,'categoria'=>$cat,'subcategoria'=>$commentCol===null?'':trim((string)($v[$commentCol]??'')),'referenciaContrato'=>$ref,'importe'=>$amt/100,'centavos'=>$amt,'fuente'=>'EXCEL_ORIGINAL','fuenteOrigen'=>'excel_original','hojaOrigen'=>$sheet,'filaOrigen'=>$rn,'columnaOrigen'=>indexToLetter($ci),'claveRegistro'=>$key];
                    $bt+=$amt;$bn++;$cats[$cat]=($cats[$cat]??0)+$amt;$bc[$bank][$cat]=($bc[$bank][$cat]??0)+$amt;
                }
            }if(!$cols)$errors[]='Encabezados no reconocidos: '.$sheet;$banks[$bank]=['registros'=>$bn,'centavos'=>$bt];$total+=$bt;
        }
        $cover=coverSheetName($zip);$control=null;$controlCell=null;$coverBanks=[];$formulaControl=null;$controlEngProp=null;
        if(!$cover)$errors[]='Carátula ausente';else foreach(hsRows($zip,$cover,$ss) as [$rn,$v,$f]){
            if($rn>45)break;
            if(hsText($v[1]??'')==='INGRESO TOTAL'&&empty($v[2])&&isset($v[3])&&is_numeric($v[3])&&$control===null){$control=hsCents($v[3]);$controlCell=$cover.'!D'.$rn;$formulaControl=$f[3]??null;}
            if($rn===8)$controlEngProp=['valor'=>$v[9]??null,'formula'=>$f[9]??null];
            if($rn>=2&&$rn<=6){$label=hsText($v[1]??'');if($label==='FLORES')$label='CUENTA 18';if(in_array($label,['BANAMEX','BANREGIO','CAJA','JDJP','CUENTA 18'],true))$coverBanks[$label]=hsCents($v[16]??'0');}
        }
        if($control===null)$errors[]='No se encontró control INGRESO TOTAL de carátula';
        $diff=$control===null?null:$total-$control;if($diff!==0)$errors[]='Diferencia contra carátula: '.($diff===null?'sin control':number_format($diff/100,2,'.',''));
        if(count($bad))$errors[]=count($bad).' movimientos con fecha inválida o fuera del mes';
        foreach($coverBanks as $bank=>$coverAmount){if(isset($banks[$bank])&&$coverAmount!==$banks[$bank]['centavos'])$errors[]='Diferencia por banco en carátula: '.$bank;}
        return ['validado'=>!$errors,'mes'=>$month,'registros'=>count($rows),'totalCentavos'=>$total,'total'=>$total/100,'totalCaratula'=>$control===null?null:$control/100,'diferenciaCentavos'=>$diff,'celdaControl'=>$controlCell,'formulaControl'=>$formulaControl,'controlEnganchesPropiedades'=>$controlEngProp,'porBanco'=>$banks,'porCategoriaCentavos'=>$cats,'porBancoCategoriaCentavos'=>$bc,'errores'=>array_values(array_unique($errors)),'fechasInvalidas'=>$bad,'filasResumenExcluidas'=>$summaries,'hojas'=>$sheetNames,'movimientos'=>$rows];
    }finally{$zip->close();}
}
function hsToken():string {
    $cfg=require '/home/juanpab1/portal-config/config.php';
    if(!is_array($cfg)||strtolower((string)($cfg['client_id']??''))!==JJP_PORTAL_CLIENT_ID)throw new RuntimeException('Configuración de Portal no válida.');
    $t=httpJson('https://login.microsoftonline.com/'.rawurlencode($cfg['tenant_id']).'/oauth2/v2.0/token',['Content-Type: application/x-www-form-urlencoded'],http_build_query(['client_id'=>$cfg['client_id'],'client_secret'=>$cfg['client_secret'],'grant_type'=>'client_credentials','scope'=>'https://graph.microsoft.com/.default']));
    if(empty($t['access_token']))throw new RuntimeException('Microsoft 365 no devolvió token.');return $t['access_token'];
}
function hsGraph(string $path,string $token):array {
    return hsRemoteJson(JJP_COBRANZA_DRIVE_ID,$path,$token);
}
/* Copias de versiones guardadas; nunca adquiere ni libera bloqueos de Office. */
function hsRequest(string $url,array $headers=[],?string $destination=null):array {
    if(!str_starts_with($url,'https://'))throw new RuntimeException('Se requiere HTTPS.');
    for($attempt=0;$attempt<3;$attempt++){
        $received=[];$fh=$destination===null?null:fopen($destination,'wb');$curl=curl_init($url);
        $options=[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>$destination===null?30:90,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_HTTPHEADER=>$headers,
          CURLOPT_HEADERFUNCTION=>static function($c,string $line)use(&$received):int{$parts=explode(':',$line,2);if(count($parts)===2)$received[strtolower(trim($parts[0]))]=trim($parts[1]);return strlen($line);}];
        if($fh)$options[CURLOPT_FILE]=$fh;else $options[CURLOPT_RETURNTRANSFER]=true;
        curl_setopt_array($curl,$options);$body=curl_exec($curl);$status=(int)curl_getinfo($curl,CURLINFO_HTTP_CODE);$error=curl_errno($curl);curl_close($curl);if($fh){fflush($fh);fclose($fh);}
        if(!$error&&($status>=200&&$status<300||$status===302))return ['status'=>$status,'headers'=>$received,'body'=>$destination===null?$body:null,'intentos'=>$attempt+1];
        if($attempt<2&&($error||in_array($status,[423,429,500,502,503,504],true))){$delay=isset($received['retry-after'])&&ctype_digit($received['retry-after'])?(int)$received['retry-after']:2**($attempt+1);if($delay>8)throw new RuntimeException('HTTP '.$status.': Microsoft solicita esperar; se conserva la última versión validada.');usleep(max(1,$delay)*1000000);continue;}
        throw new RuntimeException('HTTP '.$status.' al leer una versión guardada en Microsoft 365.');
    }throw new RuntimeException('Microsoft 365 no respondió.');
}
function hsRemoteJson(string $drive,string $path,string $token):array {
    $r=hsRequest('https://graph.microsoft.com/v1.0/drives/'.rawurlencode($drive).$path,['Authorization: Bearer '.$token,'Accept: application/json']);
    if($r['status']!==200)throw new RuntimeException('Respuesta inesperada de Microsoft Graph.');$d=json_decode((string)$r['body'],true,512,JSON_THROW_ON_ERROR);if(!is_array($d))throw new RuntimeException('Metadata inválida.');return $d;
}
function hsSnapshotDownload(string $drive,array $meta,string $token):array {
    $tmp=tempnam(HS_DIR,'original_guardado_');if($tmp===false)throw new RuntimeException('No se pudo crear copia temporal privada.');chmod($tmp,0600);
    try{
        $url=(string)($meta['@microsoft.graph.downloadUrl']??'');$version=null;$versionError=null;$date=$meta['lastModifiedDateTime']??null;$method='contenido_actual_guardado';$changed=false;
        try{if(!str_starts_with($url,'https://'))throw new RuntimeException('URL guardada no disponible.');$r=hsRequest($url,[],$tmp);if($r['status']!==200)throw new RuntimeException('Descarga actual incompleta.');}
        catch(Throwable $error){
            $versionError=$error->getMessage();$versions=hsRemoteJson($drive,'/items/'.rawurlencode((string)$meta['id']).'/versions',$token);$version=$versions['value'][0]??null;
            if(!is_array($version)||!preg_match('/^[0-9]+(?:\.[0-9]+)?$/D',(string)($version['id']??'')))throw $error;
            $r=hsRequest('https://graph.microsoft.com/v1.0/drives/'.rawurlencode($drive).'/items/'.rawurlencode((string)$meta['id']).'/versions/'.rawurlencode((string)$version['id']).'/content',['Authorization: Bearer '.$token],$tmp);
            if($r['status']===302){$location=(string)($r['headers']['location']??'');if(!str_starts_with($location,'https://'))throw new RuntimeException('Descarga de versión sin HTTPS.');$r=hsRequest($location,[],$tmp);}
            if($r['status']!==200)throw new RuntimeException('Descarga de versión incompleta.');$date=$version['lastModifiedDateTime']??$date;$method='version_guardada_tras_reintentos';$changed=true;
        }
        clearstatcache(true,$tmp);$bytes=filesize($tmp);$length=$r['headers']['content-length']??null;
        if(!$bytes||$bytes>JJP_MAX_XLSX_BYTES||($length!==null&&ctype_digit($length)&&(int)$length!==$bytes))throw new RuntimeException('Copia incompleta o fuera de límite.');
        if($version!==null&&isset($version['size'])&&(int)$version['size']!==$bytes)throw new RuntimeException('Tamaño de versión incompleto.');
        $changed=$changed||$bytes!==(int)($meta['size']??0);$test=new ZipArchive();if($test->open($tmp,ZipArchive::CHECKCONS)!==true)throw new RuntimeException('La copia recibida no es un Excel íntegro.');$test->close();
        return ['temporal'=>$tmp,'metodo'=>$method,'version'=>$version['id']??null,'fechaDatosUTC'=>$date,'tamanoBytes'=>$bytes,'sha256'=>hash_file('sha256',$tmp),'reintentos'=>$r['intentos']-1,'avisoVersion'=>$versionError,'nuevaVersionPendiente'=>$changed];
    }catch(Throwable $e){@unlink($tmp);throw $e;}
}

function hsSources(string $token):array {
    $saved=hsRead('historico_catalogo.json');if(isset($saved['meses'])&&time()-strtotime($saved['verificadoUTC']??'1970-01-01')<86400)return $saved['meses'];
    $names=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];$months=[];
    $root=hsGraph('/root:/'.rawurlencode('2. Reportes').':/children?$top=200',$token);
    foreach($root['value']??[] as $folder){if(empty($folder['folder'])||!preg_match('/^20\d\d$/D',$folder['name']??''))continue;$year=$folder['name'];
        $url='/items/'.rawurlencode($folder['id']).'/children?$top=200';$list=hsGraph($url,$token);
        if(!empty($list['@odata.nextLink']))throw new RuntimeException('Catálogo anual requiere paginación; no se publica incompleto.');
        foreach($list['value']??[] as $item){if(empty($item['file']))continue;foreach($names as $i=>$n){if(($item['name']??'')===$n.' '.$year.'.xlsx'){$m=$year.'-'.str_pad((string)($i+1),2,'0',STR_PAD_LEFT);$months[$m]=['id'=>$item['id'],'nombre'=>$item['name'],'ruta'=>'2. Reportes/'.$year.'/'.$item['name']];}}}
    }if(!$months)throw new RuntimeException('No se localizaron originales mensuales.');ksort($months);hsWrite('historico_catalogo.json',['verificadoUTC'=>hsNow(),'meses'=>$months]);return $months;
}
function hsCacheName(string $month):string {if(!preg_match('/^20\d\d-(0[1-9]|1[0-2])$/D',$month))throw new RuntimeException('Mes inválido.');return 'cache_excel_ingresos_'.$month.'.json';}
function hsProcess(string $month,array $source,string $token,bool $force=false):array {
    $cache=hsRead(hsCacheName($month));$old=hsRead('historico_estado.json')['meses'][$month]??[];
    if($month==='2025-12'&&!empty($cache)&&($cache['reglasVersion']??0)<HS_RULES){rename(HS_DIR.'/'.hsCacheName($month),HS_DIR.'/cuarentena_redondeo_2025-12_'.gmdate('YmdHis').'.json');$cache=[];}
    $meta=hsGraph('/items/'.rawurlencode($source['id']),$token);$etag=(string)($meta['eTag']??'');if(!$etag)throw new RuntimeException('eTag ausente.');
    $state=['excelDescargado'=>false,'lectorVersion'=>HS_BUILD,'reglasVersion'=>HS_RULES,'mes'=>$month,'excel'=>['nombre'=>$source['nombre'],'id'=>$source['id'],'etag'=>$etag,'tamanoBytes'=>(int)($meta['size']??0),'fechaModificacion'=>$meta['lastModifiedDateTime']??null],'verificadoUTC'=>hsNow()];
    if(!$force&&empty($old['nuevaVersionPendiente'])&&($old['reglasVersion']??0)===HS_RULES&&($old['excel']['etag']??'')===$etag&&isset($old['auditoria']))return array_merge($old,$state);
    if(!$force&&($cache['reglasVersion']??0)===HS_RULES&&($cache['excel']['etag']??'')===$etag&&($cache['auditoria']['validado']??false))return array_merge($state,['estado'=>'validado','cacheDisponible'=>true,'generadoUTC'=>$cache['generadoUTC'],'auditoria'=>$cache['auditoria']]);
    $download=hsSnapshotDownload(JJP_COBRANZA_DRIVE_ID,$meta,$token);$tmp=$download['temporal'];
    try{$state['excelDescargado']=true;$state['excel']['versionLeida']=$download['version'];$state['excel']['metodoLectura']=$download['metodo'];$state['excel']['fechaDatosUTC']=$download['fechaDatosUTC'];$state['excel']['sha256']=$download['sha256'];$state['excel']['tamanoBytes']=$download['tamanoBytes'];
        // Una versión de respaldo nunca sustituye una caché vigente ya validada.
        if($download['metodo']==='version_guardada_tras_reintentos'&&!empty($cache['auditoria']['validado'])){
            return array_merge($old,$state,['excel'=>$cache['excel'],'excelObservado'=>$state['excel'],'auditoria'=>$cache['auditoria'],'cacheDisponible'=>true,'estado'=>'ultima_validada_con_error','generadoUTC'=>$cache['generadoUTC'],'nuevaVersionPendiente'=>true,'error'=>'La lectura actual no estuvo disponible; se conserva la última caché validada.']);
        }
        $a=hsAudit($tmp,$month);$after=hsGraph('/items/'.rawurlencode($source['id']).'?$select=id,eTag,cTag',$token);
        $state['nuevaVersionPendiente']=!empty($download['nuevaVersionPendiente'])||($after['eTag']??null)!==$etag;$state['excel']['etagObservadoFinal']=$after['eTag']??null;
        $mov=$a['movimientos'];unset($a['movimientos']);$state['auditoria']=$a;$state['cacheDisponible']=($a['validado']||!empty($cache['auditoria']['validado']));
        if($a['validado']){$state['estado']='validado';$state['generadoUTC']=hsNow();$snapshot=['version'=>2,'build'=>HS_BUILD,'reglasVersion'=>HS_RULES,'mes'=>$month,'generadoUTC'=>$state['generadoUTC'],'verificadoUTC'=>hsNow(),'excel'=>$state['excel'],'auditoria'=>$a,'movimientos'=>$mov];hsWrite(hsCacheName($month),$snapshot);}
        else{$state['estado']=$state['cacheDisponible']?'ultima_validada_con_incidencia':'no_disponible';$state['generadoUTC']=$cache['generadoUTC']??null;}
        return $state;
    }finally{@unlink($tmp);}
}

function hsLog(array $r):void {
    $path=HS_DIR.'/historico_ciclos.jsonl';if(is_file($path)&&filesize($path)>2000000){$lines=file($path,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES);file_put_contents($path,implode("\n",array_slice($lines,-500))."\n",LOCK_EX);}
    file_put_contents($path,json_encode($r,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n",FILE_APPEND|LOCK_EX);chmod($path,0600);
}
function hsProductionCheck():array {
    $root='/home/juanpab1/public_html/portal.juanpablo.com.mx/dashboard';$baseline=hsRead('dashboard-produccion-sha256.json');$changed=[];
    foreach($baseline as $file=>$hash){if(!is_string($file)||str_contains($file,'..')||!is_string($hash)||!hash_equals($hash,(string)@hash_file('sha256',$root.'/'.$file)))$changed[]=$file;}
    $backups=[];foreach(['respaldo-ingresos-20261104-1828','respaldo-ingresos-historico-20261104-1927','respaldo-dashboard-excel-20261105-migracion'] as $name){$p='/home/juanpab1/'.$name;$backups[$name]=['existe'=>is_dir($p),'privado'=>is_dir($p.'/bi-ingresos-privado'),'produccion'=>is_dir($p.'/dashboard'),'pruebas'=>is_dir($p.'/dashboard-excel-preview')];}
    return ['verificadoUTC'=>hsNow(),'archivosComprobados'=>count($baseline),'intacta'=>count($baseline)>0&&!$changed,'modificados'=>$changed,'respaldos'=>$backups];
}
function hsPreviewCheck():array {
    $dir='/home/juanpab1/public_html/portal.juanpablo.com.mx/dashboard-excel-preview';$index=(string)file_get_contents($dir.'/index.php');preg_match_all('~<script[^>]+src="([^"?]+)(?:\?[^"<]*)?"~',$index,$matches);$bad=[];$active=['dashboard-yoy-comparison.js'];
    foreach(array_unique(array_merge($matches[1],['dashboard-yoy-comparison.js'])) as $file){if(str_contains($file,'://')||str_contains($file,'..'))continue;$active[]=$file;$source=(string)@file_get_contents($dir.'/'.$file);if(preg_match('/BI_Ingresos|obtenerIngresosSharePoint|lists\.ingresos/',$source))$bad[]=$file;}
    $config=(string)file_get_contents($dir.'/config.js');
    return ['scriptsLocales'=>$active,'lectoresBIIngresos'=>$bad,'configIngreso'=>preg_match('/ingresos\s*:\s*\{[^}]*\}/',$config,$m)?$m[0]:null,'cacheNavegadorSeparada'=>str_contains((string)file_get_contents($dir.'/app.js'),'dashboardExcelHistoricoCacheDB')];
}
function hsRun(bool $manual=false,bool $force=false,?array $selected=null,bool $forceRead=false):array {
    @set_time_limit(180);$lock=fopen(HS_DIR.'/historico.lock','c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))return ['estado'=>'ocupado'];
    $start=microtime(true);$run=['inicioUTC'=>hsNow(),'origen'=>$manual?'manual':'cron','build'=>HS_BUILD,'meses'=>[],'errores'=>[]];$state=hsRead('historico_estado.json',['meses'=>[]]);
    try{$token=hsToken();$sources=hsSources($token);$now=new DateTimeImmutable('now',new DateTimeZone('America/Monterrey'));$current=$now->format('Y-m');$previous=$now->modify('first day of this month')->modify('-1 month')->format('Y-m');
        $missing=[];$closed=[];foreach($sources as $m=>$s){if(!isset($state['meses'][$m]['auditoria'])||($state['meses'][$m]['reglasVersion']??0)!==HS_RULES)$missing[]=$m;elseif(!in_array($m,[$current,$previous],true))$closed[]=$m;}
        usort($missing,fn($a,$b)=>((array_search($a,['2026-09','2026-10','2026-11'],true)===false?99:array_search($a,['2026-09','2026-10','2026-11'],true))<=>(array_search($b,['2026-09','2026-10','2026-11'],true)===false?99:array_search($b,['2026-09','2026-10','2026-11'],true)))?:strcmp($a,$b));
        usort($closed,fn($a,$b)=>strcmp($state['meses'][$a]['verificadoUTC']??'', $state['meses'][$b]['verificadoUTC']??''));
        // Initial load: two originals per batch. Normal cron: two active + two closed eTags.
        $queue=hsRead('historico_revision_manual.json')['meses']??[];
        if($force){$queue=array_values(array_diff(array_keys($sources),[$current,$previous]));hsWrite('historico_revision_manual.json',['solicitadoUTC'=>hsNow(),'meses'=>$queue]);}
        $order=$manual?array_slice($missing?:($queue?:$closed),0,2):array_values(array_unique(array_merge(array_filter([$current,$previous],fn($m)=>isset($sources[$m])),array_slice($missing?:($queue?:$closed),0,2))));
        if($selected!==null){foreach($selected as $m)if(!isset($sources[$m]))throw new RuntimeException('Mes fuera del catálogo.');$order=array_slice(array_values(array_unique($selected)),0,2);}
        $downloads=0;foreach($order as $m){if(microtime(true)-$start>145)break;try{
            $existing=hsRead(hsCacheName($m));$needs=empty($state['meses'][$m]['auditoria'])&&empty($existing);if($needs&&$downloads>=2)continue;
            $new=hsProcess($m,$sources[$m],$token,$forceRead);$state['meses'][$m]=$new;$queue=array_values(array_diff($queue,[$m]));$run['meses'][$m]=['excelDescargado'=>$new['excelDescargado']??null,'estado'=>$new['estado'],'verificadoUTC'=>$new['verificadoUTC'],'etag'=>$new['excel']['etag'],'registros'=>$new['auditoria']['registros']??null,'total'=>$new['auditoria']['total']??null];if($needs)$downloads++;
        }catch(Throwable $e){$old=$state['meses'][$m]??['mes'=>$m];$cache=hsRead(hsCacheName($m));$state['meses'][$m]=array_merge($old,['estado'=>!empty($cache['auditoria']['validado'])?'ultima_validada_con_error':'no_disponible','cacheDisponible'=>!empty($cache['auditoria']['validado']),'ultimoIntentoUTC'=>hsNow(),'error'=>$e->getMessage()]);$run['errores'][$m]=$e->getMessage();}hsWrite('historico_estado.json',$state);}
        hsWrite('historico_revision_manual.json',['meses'=>$queue]);$run['revisionesManualesPendientes']=count($queue);
        $run['pendientes']=count(array_filter(array_keys($sources),fn($m)=>!isset($state['meses'][$m]['auditoria'])||($state['meses'][$m]['reglasVersion']??0)!==HS_RULES));
    }catch(Throwable $e){$run['errores']['general']=$e->getMessage();}
    finally{$run['finUTC']=hsNow();$run['segundos']=round(microtime(true)-$start,2);$run['memoriaMaxBytes']=memory_get_peak_usage(true);hsLog($run);flock($lock,LOCK_UN);fclose($lock);}return $run;
}
function hsManifest(bool $admin):array {
    $sources=hsRead('historico_catalogo.json')['meses']??[];$state=hsRead('historico_estado.json')['meses']??[];$months=[];$now=new DateTimeImmutable('now',new DateTimeZone('America/Monterrey'));$active=[$now->format('Y-m'),$now->modify('first day of this month')->modify('-1 month')->format('Y-m')];
    foreach($sources as $m=>$src){$s=$state[$m]??['mes'=>$m,'estado'=>'pendiente','cacheDisponible'=>false];$age=isset($s['verificadoUTC'])?time()-strtotime($s['verificadoUTC']):null;if(($s['reglasVersion']??0)!==HS_RULES){$s['cacheDisponible']=false;$s['estado']='pendiente_validacion_version';}$s['antigua']=!empty($s['error'])||str_starts_with((string)($s['estado']??''),'ultima_validada')||!empty($s['nuevaVersionPendiente'])||$age===null||$age>(in_array($m,$active,true)?1200:86400);$months[$m]=$s;}
    $log=is_file(HS_DIR.'/historico_ciclos.jsonl')?file(HS_DIR.'/historico_ciclos.jsonl',FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES):[];
    return ['build'=>HS_BUILD,'fuente'=>'EXCEL_ORIGINAL','biIngresos'=>false,'servidorUTC'=>hsNow(),'puedeActualizar'=>$admin,'meses'=>$months,'controlProduccion'=>$admin?hsProductionCheck():null,'controlPruebas'=>$admin?hsPreviewCheck():null,'ciclos'=>$admin?array_map(fn($x)=>json_decode($x,true),array_slice($log,-12)):[]];
}
if(PHP_SAPI==='cli'){echo json_encode(hsRun(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT).PHP_EOL;exit;}
require_once dirname(__DIR__).'/includes/bootstrap.php';require_once dirname(__DIR__).'/includes/portal-access.php';portal_require_authentication();
$user=portal_user();$admin=strtolower(trim((string)($user['email']??'')))==='gabriel.guerra@juanpablo.com.mx';
if(!$admin||!portal_user_can_tool('dashboard')){http_response_code(403);exit('Acceso restringido a la auditoría de pruebas.');}
header('Cache-Control: private, no-store, max-age=0');header('X-Content-Type-Options: nosniff');
if(empty($_SESSION['ingresos_historico_csrf']))$_SESSION['ingresos_historico_csrf']=bin2hex(random_bytes(24));$csrf=$_SESSION['ingresos_historico_csrf'];
if($_SERVER['REQUEST_METHOD']==='POST'){
    if(!hash_equals($csrf,(string)($_POST['csrf']??''))){http_response_code(403);exit('Solicitud no válida.');}
    session_write_close();$action=(string)($_POST['accion']??'lote');
    if($action==='instalar'){hsInstallPreview();header('Content-Type: application/json; charset=utf-8');echo json_encode(['instalado'=>true,'build'=>HS_BUILD]);exit;}
    if($action==='finalizar-pruebas'){header('Content-Type: application/json; charset=utf-8');try{echo json_encode(hsFinishContinuation(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);}catch(Throwable $e){http_response_code(500);echo json_encode(['error'=>$e->getMessage()]);}exit;}
    if($action==='preparar-egresos'){header('Content-Type: application/json; charset=utf-8');try{echo json_encode(hsInstallContinuation(),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);}catch(Throwable $e){http_response_code(500);echo json_encode(['error'=>$e->getMessage()]);}exit;}
    if($action==='corregidos'){$months=['2024-08','2024-12','2025-02','2025-07','2025-12','2026-04'];$batch=(int)($_POST['lote']??0);if($batch<0||$batch>2){http_response_code(400);exit('Lote inválido.');}$r=hsRun(true,false,array_slice($months,$batch*2,2),true);header('Content-Type: application/json; charset=utf-8');echo json_encode($r,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);exit;}
    if($action!=='lote'&&$action!=='revisar'){http_response_code(400);exit('Acción no válida.');}
    $r=hsRun(true,$action==='revisar');header('Content-Type: application/json; charset=utf-8');echo json_encode($r,JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);exit;
}
$mode=$_GET['modo']??'manifest';
if($mode==='codigo'){session_write_close();hsCodeSnapshot();}
if($mode==='admin'){session_write_close();$c=htmlspecialchars($csrf,ENT_QUOTES,'UTF-8');echo '<!doctype html><meta charset="utf-8"><title>Auditoría histórica de Ingresos</title><style>body{font:16px system-ui;max-width:1200px;margin:30px auto}button{padding:12px;margin:8px}pre{white-space:pre-wrap;background:#f4f6f8;padding:18px}table{border-collapse:collapse}td,th{padding:8px;border:1px solid #ccc}</style><h1>Auditoría histórica de Ingresos · Pruebas</h1><p>Originales de Cobranza. Lotes de dos archivos. Producción intacta.</p><button id="finalizar-pruebas">Finalizar mantenimiento de pruebas</button><button id="preparar-egresos">Preparar Egresos en pruebas separadas</button><button id="corregidos">Revalidar los seis corregidos</button><button id="inicial">Completar carga inicial</button><button id="lote">Procesar siguiente lote</button><button id="revisar">Actualizar histórico</button><button id="instalar">Instalar integración en pruebas</button><a href="./">Abrir Dashboard de pruebas</a><pre id="resultado"></pre><div id="tabla"></div><script>const csrf='.json_encode($csrf).';async function estado(){const m=await fetch("?modo=manifest",{cache:"no-store"}).then(r=>r.json());document.getElementById("tabla").textContent=JSON.stringify(m,null,2)}for(const b of document.querySelectorAll("button"))b.onclick=async()=>{b.disabled=true;try{for(let i=0;i<(b.id==="inicial"?20:b.id==="corregidos"?3:1);i++){const r=await fetch(location.pathname,{method:"POST",body:new URLSearchParams({csrf,accion:b.id==="inicial"?"lote":b.id,lote:String(i)})});const t=await r.text();document.getElementById("resultado").textContent=t;await estado();if(b.id==="corregidos")continue;if(b.id!=="inicial")break;const v=JSON.parse(t);if(v.pendientes===0||Object.keys(v.errores||{}).length||v.estado==="ocupado")break}}finally{b.disabled=false}};estado()</script>';exit;}
session_write_close();header('Content-Type: application/json; charset=utf-8');
if($mode==='detalle'){$m=(string)($_GET['mes']??'');try{$cache=hsRead(hsCacheName($m));if(empty($cache['auditoria']['validado'])||($cache['reglasVersion']??0)!==HS_RULES){http_response_code(409);echo json_encode(['mes'=>$m,'estado'=>'no_disponible','mensaje'=>'Información no disponible']);exit;}echo json_encode($cache,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);}catch(Throwable $e){http_response_code(400);echo json_encode(['mensaje'=>'Mes no válido']);}exit;}
echo json_encode(hsManifest($admin),JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);


function hsInstallPreview():void {
    // Destino fijo de pruebas; nunca escribe en /dashboard/.
    $dir='/home/juanpab1/public_html/portal.juanpablo.com.mx/dashboard-excel-preview';
    if(realpath(__DIR__)!==$dir)throw new RuntimeException('Instalación permitida únicamente en pruebas.');
    $files=['app.js','graph.js','index.php'];$data=[];
    foreach($files as $f){$data[$f]=file_get_contents($dir.'/'.$f);if($data[$f]===false)throw new RuntimeException('No se pudo leer '.$f);}
    if(!str_contains($data['app.js'],'dashboardExcelHistoricoDatos')) {
        $patches=json_decode('[["const DASHBOARD_CACHE_KEY_BASE = \\"dashboardDireccionUltimosDatos\\";", "const DASHBOARD_CACHE_KEY_BASE = \\"dashboardExcelHistoricoDatos\\";"], ["const DASHBOARD_CACHE_DB_NAME = \\"dashboardDireccionCacheDB\\";", "const DASHBOARD_CACHE_DB_NAME = \\"dashboardExcelHistoricoCacheDB\\";"], ["    state.datos.ingresos = reemplazarRegistrosPorMes(\\n      state.datos.ingresos,\\n      datosSharePoint.ingresos || [],\\n      mesesRecargados\\n    );", "    // Snapshot completo: jamás mezclar ingresos incrementales de otra fuente.\\n    state.datos.ingresos = datosSharePoint.ingresos || [];"], ["    state.datos.ingresos = cache.datos.ingresos || [];", "    state.datos.ingresos = await cargarIngresosExcelHistorico();"], ["function sumarIngresos(mes) {", "function sumarIngresos(mes) {\\n  if (!ingresosExcelDisponibles(mes)) return NaN;"], ["function sumarIngresoRealCobranza(mes) {", "function sumarIngresoRealCobranza(mes) {\\n  if (!ingresosExcelDisponibles(mes)) return NaN;"], ["function contarRegistrosIngresos(mes) {", "function contarRegistrosIngresos(mes) {\\n  if (!ingresosExcelDisponibles(mes)) return NaN;"], ["function formatoMoneda(valor) {", "function formatoMoneda(valor) {\\n  if (typeof valor === \\"number\\" && !Number.isFinite(valor)) return \\"Información no disponible\\";"], ["function formatoNumero(valor) {", "function formatoNumero(valor) {\\n  if (typeof valor === \\"number\\" && !Number.isFinite(valor)) return \\"Información no disponible\\";"], ["function formatoPorcentaje(valor) {", "function formatoPorcentaje(valor) {\\n  if (typeof valor === \\"number\\" && !Number.isFinite(valor)) return \\"Información no disponible\\";"], ["  renderDetalleIngresos(mes, totalIngresos);", "  renderEstadoIngresosExcel();\\n  renderDetalleIngresos(mes, totalIngresos);"], ["function renderDetalleIngresos(mes, totalIngresos) {", "function renderDetalleIngresos(mes, totalIngresos) {\\n  if (!ingresosExcelDisponibles(mes)) {\\n    for (const id of [\\"tablaIngresosBancoBody\\",\\"tablaIngresosCategoriaBody\\",\\"tablaIngresosSubcategoriaBody\\"]) {\\n      const el = document.getElementById(id);\\n      if (el) el.innerHTML = \'<tr><td colspan=\\"5\\">Información no disponible: periodo sin Excel validado.</td></tr>\';\\n    }\\n    destruirGrafica(\\"ingresosBanco\\"); destruirGrafica(\\"ingresosCategoria\\");\\n    renderGraficaIngresosMensuales(); return;\\n  }"], ["  const totalIngresos = sumarTotalFlujo(ingresos);", "  const totalIngresos = ingresosExcelDisponibles(mes) ? sumarTotalFlujo(ingresos) : NaN;"], ["function renderTablaFlujoEfectivo(mes) {", "function renderTablaFlujoEfectivo(mes) {\\n  if (!ingresosExcelDisponibles(mes)) {\\n    const el = document.getElementById(\\"tablaFlujoEfectivoBody\\");\\n    if (el) el.innerHTML = \'<tr><td colspan=\\"5\\">Información no disponible: no se puede calcular el flujo sin todos los ingresos validados.</td></tr>\';\\n    return;\\n  }"], ["function renderAvanceMetasCobranza(mes) {", "function renderAvanceMetasCobranza(mes) {\\n  if (!ingresosExcelDisponibles(mes)) {\\n    setText(\\"metasCobranzaCumplimiento\\", \\"Información no disponible\\");\\n    const el = document.getElementById(\\"tablaMetasCobranzaBody\\");\\n    if (el) el.innerHTML = \'<tr><td colspan=\\"5\\">Información no disponible: falta validar Ingresos del periodo.</td></tr>\';\\n    return;\\n  }"]]',true,512,JSON_THROW_ON_ERROR);
        foreach($patches as [$old,$new]){if(substr_count($data['app.js'],$old)!==1)throw new RuntimeException('La versión de app.js cambió; no se modifica.');$data['app.js']=str_replace($old,$new,$data['app.js']);}
        $data['app.js']=str_replace('"BI_Ingresos"','"Excel originales de Cobranza"',$data['app.js']);
    }
    if(!str_contains($data['graph.js'],'async function obtenerIngresosExcel()')){
        $old='async function obtenerIngresosSharePoint(mesesFiltro = []) {
  try {
    setAuthStatus("Leyendo BI_Ingresos desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.ingresos.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Ingresos.");
    }

    const filtroMeses = crearFiltroMesesSharePoint(mesesFiltro);
    const items = await obtenerItemsLista(listId, 5000, {
      filtro: filtroMeses
    });

    const ingresosMapeados = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,
        mes: limpiarTexto(f.Mes),
        banco: limpiarTexto(f.Banco),
        categoria: limpiarTexto(f.Categor_x00ed_a || f.Categoria),
        subcategoria: limpiarTexto(f.Subcategor_x00ed_a || f.Subcategoria),
        referenciaContrato: limpiarTexto(f.Referencia_Contrato),
        importe: convertirNumero(f.Importe),
        fuente: limpiarTexto(f.Fuente),
        hojaOrigen: limpiarTexto(f.Hoja_Origen),
        claveRegistro: limpiarTexto(f.Clave_Registro),
        fechaCarga: limpiarTexto(f.Fecha_Carga),
        fechaActualizacion: limpiarTexto(f.Fecha_Actualizacion || f.Modified)
      };
    });

    const ingresos = deduplicarIngresosPorClaveRegistro(ingresosMapeados);

    console.log("BI_Ingresos leídos:", ingresos);
    console.table(ingresos.slice(0, 20));

    setText(
      "sharePointStatus",
      `BI_Ingresos leído correctamente: ${ingresos.length} registros`
    );

    setAuthStatus("BI_Ingresos leído correctamente.");

    return ingresos;
  } catch (error) {
    console.error("Error leyendo BI_Ingresos:", error);

    setText(
      "sharePointStatus",
      "Error al leer BI_Ingresos. Revisa la consola del navegador."
    );

    setAuthStatus("Error al leer BI_Ingresos.");
    return [];
  }
}

function deduplicarIngresosPorClaveRegistro(ingresos) {
  const porClave = new Map();
  const sinClave = [];
  let duplicadosIgnorados = 0;
  let importeDuplicadoIgnorado = 0;

  (ingresos || []).forEach((item) => {
    const clave = limpiarTexto(item?.claveRegistro);

    if (!clave) {
      sinClave.push(item);
      return;
    }

    const existente = porClave.get(clave);

    if (!existente) {
      porClave.set(clave, item);
      return;
    }

    duplicadosIgnorados += 1;

    const fechaExistente =
      Date.parse(existente?.fechaActualizacion || existente?.fechaCarga || "") || 0;
    const fechaNueva =
      Date.parse(item?.fechaActualizacion || item?.fechaCarga || "") || 0;

    const idExistente = Number(existente?.id || 0);
    const idNuevo = Number(item?.id || 0);

    const conservarNuevo =
      fechaNueva > fechaExistente ||
      (fechaNueva === fechaExistente && idNuevo > idExistente);

    if (conservarNuevo) {
      importeDuplicadoIgnorado += Number(existente?.importe || 0);
      porClave.set(clave, item);
    } else {
      importeDuplicadoIgnorado += Number(item?.importe || 0);
    }
  });

  if (duplicadosIgnorados > 0) {
    console.warn(
      `BI_Ingresos: se ignoraron ${duplicadosIgnorados} registros duplicados por Clave_Registro. Importe duplicado ignorado: ${importeDuplicadoIgnorado.toFixed(2)}.`
    );
  }

  return [...porClave.values(), ...sinClave];
}

';$new='async function obtenerIngresosExcel() {
  setAuthStatus("Leyendo cachés validadas de Excel...");
  const rows = await cargarIngresosExcelHistorico();
  setText("sharePointStatus", `Ingresos desde Excel: ${rows.length} movimientos validados`);
  return rows;
}

';if(substr_count($data['graph.js'],$old)!==1)throw new RuntimeException('La versión de graph.js cambió; no se modifica.');
        $data['graph.js']=str_replace($old,$new,$data['graph.js']);$data['graph.js']=str_replace('await obtenerIngresosSharePoint(','await obtenerIngresosExcel(',$data['graph.js']);
    }
    $data['app.js']=str_replace('await obtenerIngresosSharePoint();','await obtenerIngresosExcel();',$data['app.js']);
    $data['app.js']=str_replace('state.datos.ingresos = datosSharePoint.ingresos || [];','state.datos.ingresos = (datosSharePoint.ingresos || []).filter(item => item.fuenteOrigen === "excel_original");',$data['app.js']);
    $data['dashboard-role-access.js']=str_replace('await obtenerIngresosSharePoint(mesesFiltro)','await obtenerIngresosExcel()',file_get_contents($dir.'/dashboard-role-access.js'));
    $data['config.js']=preg_replace('/\s*ingresos\s*:\s*\{[^}]*\},?/', '', file_get_contents($dir.'/config.js'),1);

    if(str_contains($data['graph.js'],'BI_Ingresos'))throw new RuntimeException('Persisten lectores BI de Ingresos.');
    $data['index.php']=preg_replace('~<script[^>]+src="ingresos-excel-preview[^"<]*"[^>]*></script>~','',$data['index.php']);
    if(!str_contains($data['index.php'],'ingresos-historico.js'))$data['index.php']=preg_replace('~(<script[^>]+src="graph\.js[^"<]*"[^>]*></script>)~','<script src="ingresos-historico.js?v=20261105-5"></script>\n$1',$data['index.php'],1,$count);
    $data['index.php']=preg_replace('~ingresos-historico\\.js(?:\\?[^"<]*)?~','ingresos-historico.js?v=20261105-5',$data['index.php']);
    $data['index.php']=preg_replace('~(src="(?:app|graph|config|dashboard-role-access|dashboard-yoy-comparison|dashboard-annual-history)\.js)(?:\?[^"<]*)?(")~','$1?v=20261105-historico-4$2',$data['index.php']);
    if(!str_contains($data['index.php'],'ingresos-historico.js'))throw new RuntimeException('No se pudo integrar el componente en index.php.');
    if(!str_contains($data['index.php'],'HS_PREVIEW_RESPONSE'))$data['index.php']=str_replace('declare(strict_types=1);','declare(strict_types=1);'.'
// HS_PREVIEW_RESPONSE: evita reutilizar scripts antiguos inyectados por el Portal.
ob_start(static function (string $html): string {
    return preg_replace(\'~dashboard-yoy-comparison\\.js(?:\\?[^"\\x27<> ]*)?~\', \'dashboard-yoy-comparison.js?v=20261105-historico-3\', $html);
});
',$data['index.php']);
    $data['index.php']=preg_replace('~(<(?:div|span|strong|p)[^>]*\bid="(?:kpiIngresos|kpiFlujo|pageIngresosTotal|pageIngresosReal|pageIngresosRegistros|pageIngresosPromedio|pageIngresosCumplimiento)"[^>]*>)[^<]*~','$1Información no disponible',$data['index.php']);
    if(!str_contains($data['index.php'],'id="ingresosExcelEstado"'))$data['index.php']=preg_replace('~</nav>~','</nav><div id="ingresosExcelEstado" style="margin:16px 32px;padding:12px 16px;border:1px solid #cbded7;border-radius:10px;background:#f4f9f7;color:#183c37;font:14px system-ui;display:block">Ingresos desde Excel: comprobando disponibilidad...</div>',$data['index.php'],1);
    $data['ingresos-historico.js']='/* Ingresos: exclusivamente cachés privadas conciliadas desde Excel. */
window.ingresosExcelEstado = {meses:{},cargando:true};
const ingresosExcelMemoria = new Map();
async function cargarIngresosExcelHistorico() {
  let manifest;
  try {
    const r=await fetch(\'ingresos-historico.php?modo=manifest\',{credentials:\'same-origin\',cache:\'no-store\'});
    if(!r.ok)throw new Error(\'Servicio de Ingresos: HTTP \'+r.status);
    manifest=await r.json();
    if(manifest.fuente!==\'EXCEL_ORIGINAL\'||manifest.biIngresos!==false||!manifest.meses)throw new Error(\'Manifiesto de Ingresos inválido\');
  } catch(e) {
    const old=window.ingresosExcelEstado;
    window.ingresosExcelEstado={...old,cargando:false,error:e.message,meses:Object.fromEntries(Object.entries(old.meses||{}).map(([m,s])=>[m,{...s,antigua:true,error:e.message}]))};
    return [...ingresosExcelMemoria.values()].flatMap(s=>s.movimientos);
  }
  const entries=Object.entries(manifest.meses);let next=0;const result=[];
  await Promise.all(Array.from({length:2},async()=>{
    while(next<entries.length){const [m,s]=entries[next++];if(!s.cacheDisponible){ingresosExcelMemoria.delete(m);continue;}
      try{let snapshot=ingresosExcelMemoria.get(m);
        if(!snapshot||snapshot.generadoUTC!==s.generadoUTC){
          const r=await fetch(\'ingresos-historico.php?modo=detalle&mes=\'+encodeURIComponent(m),{credentials:\'same-origin\',cache:\'no-store\'});
          if(!r.ok)throw new Error(\'Caché no disponible: HTTP \'+r.status);snapshot=await r.json();
          const a=snapshot.auditoria;const rows=snapshot.movimientos;
          if(snapshot.mes!==m||!a?.validado||a.diferenciaCentavos!==0||!Array.isArray(rows)||rows.length!==a.registros)throw new Error(\'Caché sin conciliación válida\');
          let cents=0;const keys=new Set();const banks={};
          for(const row of rows){if(row.mes!==m||!row.fecha?.startsWith(m)||row.fuenteOrigen!==\'excel_original\'||!Number.isSafeInteger(row.centavos)||keys.has(row.claveRegistro))throw new Error(\'Movimiento inválido o duplicado\');keys.add(row.claveRegistro);cents+=row.centavos;banks[row.banco]=(banks[row.banco]||0)+row.centavos;}
          if(cents!==a.totalCentavos||Object.entries(a.porBanco).some(([bank,v])=>(banks[bank]||0)!==v.centavos))throw new Error(\'Importes no conciliados\');
          ingresosExcelMemoria.set(m,snapshot);
        }result.push(...snapshot.movimientos);
      }catch(e){s.error=e.message;const old=ingresosExcelMemoria.get(m);if(old){s.antigua=true;s.estado=\'ultima_validada_con_error\';result.push(...old.movimientos);}else{s.cacheDisponible=false;s.estado=\'no_disponible\';}}
    }
  }));
  window.ingresosExcelEstado={...manifest,cargando:false};return result;
}
function ingresosExcelDisponibles(periodo) {
  const meses=Array.isArray(periodo)?periodo:[periodo];
  return meses.length>0&&meses.every(m=>window.ingresosExcelEstado?.meses?.[String(m)]?.cacheDisponible===true);
}
function renderEstadoIngresosExcel() {
  const meses=obtenerMesesRangoSeleccionado();const estado=window.ingresosExcelEstado;
  let el=document.getElementById(\'ingresosExcelEstado\');if(!el){el=document.createElement(\'div\');el.id=\'ingresosExcelEstado\';el.style.cssText=\'margin:16px;padding:14px;border:1px solid #8ba3a0;border-radius:10px;background:#f4f9f7;color:#183c37;display:block\';document.querySelector(\'main\')?.prepend(el);if(!el.isConnected)document.body.prepend(el);}
  const missing=meses.filter(m=>!estado.meses?.[m]?.cacheDisponible);
  const stale=meses.filter(m=>estado.meses?.[m]?.antigua||String(estado.meses?.[m]?.estado||\'\').startsWith(\'ultima_validada\'));
  const details=meses.map(m=>{const s=estado.meses?.[m];return m+\': \'+(s?.cacheDisponible?\'verificado \'+(s.verificadoUTC?new Date(s.verificadoUTC).toLocaleString(\'es-MX\',{timeZone:\'America/Monterrey\'}):\'sin fecha\'):(s?.auditoria?.errores?.join(\'; \')||\'Sin Excel validado\'));});
  el.replaceChildren();const text=document.createElement(\'div\');text.textContent=missing.length?\'Información no disponible para \'+missing.join(\', \')+\'. Ingresos y cálculos derivados requieren todos los meses validados.\':stale.length?\'Última versión validada; actualización pendiente o con incidencia: \'+stale.join(\', \'):\'Ingresos conciliados desde los Excel originales de Cobranza. Todos los meses del periodo están validados.\';el.append(text);
  const detail=document.createElement(\'small\');detail.textContent=details.join(\' · \');el.append(detail);
  if(estado.puedeActualizar){const link=document.createElement(\'a\');link.href=\'ingresos-historico.php?modo=admin\';link.textContent=\' Auditar / actualizar histórico\';link.target=\'_blank\';link.rel=\'noopener\';el.append(link);}
  if(!ingresosExcelDisponibles(meses))for(const id of [\'kpiIngresos\',\'kpiFlujo\',\'pageIngresosTotal\',\'pageIngresosReal\',\'pageIngresosRegistros\',\'pageIngresosPromedio\',\'pageIngresosCumplimiento\',\'metasCobranzaCumplimiento\']){const n=document.getElementById(id);if(n){n.textContent=\'Información no disponible\';n.style.whiteSpace=\'normal\';n.style.overflowWrap=\'anywhere\';n.style.fontSize=\'1rem\';}}
}
// El sondeo de cachés no recarga las listas de los demás módulos.
let ingresosExcelActualizando=false;
setInterval(async()=>{if(ingresosExcelActualizando)return;ingresosExcelActualizando=true;try{const rows=await cargarIngresosExcelHistorico();state.datos.ingresos=rows;renderDashboard();}catch(e){console.warn(\'Ingresos Excel\',e.message);}finally{ingresosExcelActualizando=false;}},60000);
';
    $data['dashboard-yoy-comparison.js']='(function () {
  let instalado = false;

  function instalarComparativoInteranualDashboard() {
    if (instalado) return;
    instalado = true;

    forzarCargaHistoricaUnaVez();
    insertarEstilos();
    insertarBloque("pageIngresos", "yoyIngresosBlock", "Comparativo mensual de ingresos", "yoyIngresos");
    insertarBloque("pageVentas", "yoyVentasBlock", "Comparativo mensual de ventas", "yoyVentas");
    insertarBloqueServicios();
    conectarActualizacion();
    renderComparativosInteranuales();
  }

  function forzarCargaHistoricaUnaVez() {
    if (typeof window.actualizarDatosDashboard !== "function") return;

    const base = window.actualizarDatosDashboard;
    const migrationKey = "dashboardExcelYoyMensualServiciosV3";
    let requiereMigracion = localStorage.getItem(migrationKey) !== "1";

    window.actualizarDatosDashboard = async function (opciones = {}) {
      const finales = { ...opciones };
      const cargaForzada = requiereMigracion;

      if (cargaForzada) {
        finales.modoCarga = "completa";
        finales.mensaje = "Preparando comparativos mensuales con historial completo...";
      }

      const resultado = await base(finales);

      if (cargaForzada) {
        const tieneIngresos = (window.state?.datos?.ingresos || []).some((item) => fechaDe(item, ["fecha", "Fecha", "FECHA"]));
        const tieneServicios = (window.state?.datos?.servicios || []).some((item) => fechaDe(item, ["fechaServicio", "fechaCreacionOrigen", "fechaCreacionOriginal", "fechaFin"]));

        if (tieneIngresos && tieneServicios) {
          localStorage.setItem(migrationKey, "1");
          requiereMigracion = false;
        }
      }

      return resultado;
    };
  }

  function insertarEstilos() {
    if (document.getElementById("dashboardYoyStyles")) return;

    const style = document.createElement("style");
    style.id = "dashboardYoyStyles";
    style.textContent = `
      .yoy-comparison{margin:18px 0 26px;padding:18px;border:1px solid #dbe4ee;border-radius:14px;background:#f8fafc}
      .yoy-comparison-header{margin-bottom:14px}.yoy-comparison-header h3{margin:0;font-size:1rem;color:#0f172a}
      .yoy-comparison-header p{margin:4px 0 0;color:#64748b;font-size:.86rem}
      .yoy-comparison-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .yoy-comparison-card{min-width:0;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
      .yoy-comparison-label{display:block;margin-bottom:7px;color:#64748b;font-size:.78rem;font-weight:600;line-height:1.25}
      .yoy-comparison-value{display:block;color:#0f172a;font-size:clamp(1.15rem,2vw,1.55rem);line-height:1.15;overflow-wrap:anywhere}
      .yoy-comparison-detail{display:block;margin-top:6px;color:#64748b;font-size:.75rem;line-height:1.35}
      .yoy-comparison-card.is-positive .yoy-comparison-value,.yoy-comparison-card.is-positive .yoy-comparison-detail{color:#15803d}
      .yoy-comparison-card.is-negative .yoy-comparison-value,.yoy-comparison-card.is-negative .yoy-comparison-detail{color:#b91c1c}
      .yoy-comparison-card.is-neutral .yoy-comparison-value{color:#475569}
      .yoy-services-row+.yoy-services-row{margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0}
      .yoy-services-row-title{margin:0 0 9px;color:#334155;font-size:.85rem;font-weight:700}
      @media(max-width:800px){.yoy-comparison-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function insertarBloque(pageId, blockId, titulo, prefix) {
    if (document.getElementById(blockId)) return;
    const grid = document.getElementById(pageId)?.querySelector(".detail-kpi-grid");
    if (!grid) return;

    const section = document.createElement("section");
    section.id = blockId;
    section.className = "yoy-comparison";
    section.innerHTML = `
      <div class="yoy-comparison-header"><h3>${titulo}</h3><p id="${prefix}Subtitle">Comparativo del mes seleccionado contra el mismo mes del año anterior.</p></div>
      <div class="yoy-comparison-grid">
        <article class="yoy-comparison-card"><span id="${prefix}ActualLabel" class="yoy-comparison-label">Año actual</span><strong id="${prefix}Actual" class="yoy-comparison-value">$0.00</strong><small id="${prefix}ActualDetail" class="yoy-comparison-detail"></small></article>
        <article class="yoy-comparison-card"><span id="${prefix}AnteriorLabel" class="yoy-comparison-label">Año anterior</span><strong id="${prefix}Anterior" class="yoy-comparison-value">$0.00</strong><small id="${prefix}AnteriorDetail" class="yoy-comparison-detail"></small></article>
        <article id="${prefix}VariacionCard" class="yoy-comparison-card is-neutral"><span class="yoy-comparison-label">Variación interanual</span><strong id="${prefix}Variacion" class="yoy-comparison-value">—</strong><small id="${prefix}VariacionDetail" class="yoy-comparison-detail"></small></article>
      </div>`;
    grid.insertAdjacentElement("afterend", section);
  }

  function insertarBloqueServicios() {
    if (document.getElementById("yoyServiciosBlock")) return;
    const grid = document.getElementById("pageServiciosCapillas")?.querySelector(".detail-kpi-grid");
    if (!grid) return;

    const section = document.createElement("section");
    section.id = "yoyServiciosBlock";
    section.className = "yoy-comparison";
    section.innerHTML = `
      <div class="yoy-comparison-header">
        <h3>Comparativo mensual de Servicios Capillas</h3>
        <p id="yoyServiciosSubtitle">Previsión y Uso Inmediato contra el mismo mes del año anterior.</p>
      </div>
      ${crearFilaServicios("Previsión", "yoyServiciosPrevision")}
      ${crearFilaServicios("Uso Inmediato", "yoyServiciosUi")}`;

    grid.insertAdjacentElement("afterend", section);
  }

  function crearFilaServicios(titulo, prefix) {
    return `
      <div class="yoy-services-row">
        <h4 class="yoy-services-row-title">${titulo}</h4>
        <div class="yoy-comparison-grid">
          <article class="yoy-comparison-card"><span id="${prefix}ActualLabel" class="yoy-comparison-label">Año actual</span><strong id="${prefix}Actual" class="yoy-comparison-value">0</strong><small id="${prefix}ActualDetail" class="yoy-comparison-detail"></small></article>
          <article class="yoy-comparison-card"><span id="${prefix}AnteriorLabel" class="yoy-comparison-label">Año anterior</span><strong id="${prefix}Anterior" class="yoy-comparison-value">0</strong><small id="${prefix}AnteriorDetail" class="yoy-comparison-detail"></small></article>
          <article id="${prefix}VariacionCard" class="yoy-comparison-card is-neutral"><span class="yoy-comparison-label">Variación interanual</span><strong id="${prefix}Variacion" class="yoy-comparison-value">—</strong><small id="${prefix}VariacionDetail" class="yoy-comparison-detail"></small></article>
        </div>
      </div>`;
  }

  function conectarActualizacion() {
    const observer = new MutationObserver(renderComparativosInteranuales);
    [
      "pageIngresosTotal",
      "pageVentasTotal",
      "pageVentasUiTotal",
      "pageServiciosCapillasUsoInmediato",
      "pageServiciosCapillasPrevision"
    ].forEach((id) => {
      const nodo = document.getElementById(id);
      if (nodo) observer.observe(nodo, { childList: true, subtree: true, characterData: true });
    });

    ["yearSelector", "monthStartSelector", "monthEndSelector"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => setTimeout(renderComparativosInteranuales, 0));
    });
  }

  function renderComparativosInteranuales() {
    if (!window.state?.datos) return;

    const periodo = obtenerPeriodoComparacion();
    pintarIngresos(periodo);
    pintarVentas(periodo);
    pintarServiciosCapillas(periodo);
  }

  function obtenerPeriodoComparacion() {
    const hoy = new Date();
    const clave = String(window.state.mesSeleccionado || window.state.mesFinSeleccionado || "").trim();
    const partes = clave.match(/^(20\\d{2})-(\\d{1,2})$/);
    const anio = partes ? Number(partes[1]) : Number(window.state.anioSeleccionado || hoy.getFullYear());
    const mes = partes ? Number(partes[2]) : hoy.getMonth() + 1;
    const anterior = anio - 1;
    const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1;
    const ultimoDiaMes = new Date(anio, mes, 0).getDate();
    const ultimoDiaMesAnterior = new Date(anterior, mes, 0).getDate();
    const diaFinActual = esMesActual
      ? Math.max(1, Math.min(hoy.getDate() - 1, ultimoDiaMes))
      : ultimoDiaMes;
    const diaFinAnterior = esMesActual
      ? Math.min(diaFinActual, ultimoDiaMesAnterior)
      : ultimoDiaMesAnterior;
    const nombreMes = nombreMesCapitalizado(mes);
    const esRango = String(window.state.mesInicioSeleccionado || "") !== String(window.state.mesFinSeleccionado || "");

    return {
      anio,
      anterior,
      mes,
      nombreMes,
      esMesActual,
      diaFinActual,
      diaFinAnterior,
      esRango
    };
  }

  function pintarIngresos(periodo) {
    const actual = calcularIngresos(periodo.anio, periodo.mes, periodo.diaFinActual);
    const previo = calcularIngresos(periodo.anterior, periodo.mes, periodo.diaFinAnterior);

    pintarBase(
      "yoyIngresos",
      periodo,
      actual,
      previo,
      actual.tieneDatos ? `${num(actual.registros)} movimientos` : "Sin movimientos con fecha para este mes",
      previo.tieneDatos ? `${num(previo.registros)} movimientos` : `No hay movimientos con fecha para ${periodo.anterior}`,
      moneda,
      moneda,
      ""
    );
    for (const [suffix, data] of [["Actual",actual],["Anterior",previo]]) {
      if (data.noDisponible) {
        texto(`yoyIngresos${suffix}`, "Información no disponible");
        texto(`yoyIngresos${suffix}Detail`, "Sin Excel validado para este periodo");
      }
    }
  }

  function pintarVentas(periodo) {
    const actual = calcularVentas(periodo.anio, periodo.mes, periodo.diaFinActual);
    const previo = calcularVentas(periodo.anterior, periodo.mes, periodo.diaFinAnterior);

    pintarBase(
      "yoyVentas",
      periodo,
      actual,
      previo,
      actual.tieneDatos ? `Previsión ${moneda(actual.prevision)} + UI ${moneda(actual.ui)}` : "Sin ventas con fecha para este mes",
      previo.tieneDatos ? `Previsión ${moneda(previo.prevision)} + UI ${moneda(previo.ui)}` : `No hay ventas con fecha para ${periodo.anterior}`,
      moneda,
      moneda,
      ""
    );
  }

  function pintarServiciosCapillas(periodo) {
    const actual = calcularServiciosCapillas(periodo.anio, periodo.mes, periodo.diaFinActual);
    const previo = calcularServiciosCapillas(periodo.anterior, periodo.mes, periodo.diaFinAnterior);

    texto("yoyServiciosSubtitle", descripcionPeriodo(periodo));

    pintarFilaServicios(
      "yoyServiciosPrevision",
      periodo,
      { total: actual.prevision, tieneDatos: actual.tieneDatos },
      { total: previo.prevision, tieneDatos: previo.tieneDatos },
      actual.tieneDatos ? `${num(actual.prevision)} de ${num(actual.totalCapillas)} servicios Capillas` : "Sin servicios Capillas con fecha para este mes",
      previo.tieneDatos ? `${num(previo.prevision)} de ${num(previo.totalCapillas)} servicios Capillas` : `No hay servicios Capillas con fecha para ${periodo.anterior}`
    );

    pintarFilaServicios(
      "yoyServiciosUi",
      periodo,
      { total: actual.ui, tieneDatos: actual.tieneDatos },
      { total: previo.ui, tieneDatos: previo.tieneDatos },
      actual.tieneDatos ? `${num(actual.ui)} de ${num(actual.totalCapillas)} servicios Capillas` : "Sin servicios Capillas con fecha para este mes",
      previo.tieneDatos ? `${num(previo.ui)} de ${num(previo.totalCapillas)} servicios Capillas` : `No hay servicios Capillas con fecha para ${periodo.anterior}`
    );
  }

  function pintarBase(prefix, periodo, actual, previo, detalleActual, detallePrevio, formatter, diffFormatter, unidad) {
    texto(`${prefix}Subtitle`, descripcionPeriodo(periodo));
    texto(`${prefix}ActualLabel`, etiquetaPeriodo(periodo, periodo.anio, periodo.diaFinActual));
    texto(`${prefix}AnteriorLabel`, etiquetaPeriodo(periodo, periodo.anterior, periodo.diaFinAnterior));
    texto(`${prefix}Actual`, actual.tieneDatos ? formatter(actual.total) : "Sin datos");
    texto(`${prefix}Anterior`, previo.tieneDatos ? formatter(previo.total) : "Sin datos");
    texto(`${prefix}ActualDetail`, detalleActual);
    texto(`${prefix}AnteriorDetail`, detallePrevio);
    pintarVariacion(prefix, periodo.anterior, actual, previo, diffFormatter, unidad);
  }

  function pintarFilaServicios(prefix, periodo, actual, previo, detalleActual, detallePrevio) {
    texto(`${prefix}ActualLabel`, etiquetaPeriodo(periodo, periodo.anio, periodo.diaFinActual));
    texto(`${prefix}AnteriorLabel`, etiquetaPeriodo(periodo, periodo.anterior, periodo.diaFinAnterior));
    texto(`${prefix}Actual`, actual.tieneDatos ? num(actual.total) : "Sin datos");
    texto(`${prefix}Anterior`, previo.tieneDatos ? num(previo.total) : "Sin datos");
    texto(`${prefix}ActualDetail`, detalleActual);
    texto(`${prefix}AnteriorDetail`, detallePrevio);
    pintarVariacion(prefix, periodo.anterior, actual, previo, num, " servicios");
  }

  function descripcionPeriodo(periodo) {
    const notaRango = periodo.esRango ? " Se usa el mes seleccionado en ‘Hasta’." : "";

    if (periodo.esMesActual) {
      return `Del 1 al ${periodo.diaFinActual} de ${periodo.nombreMes} de cada año (último día completo).${notaRango}`;
    }

    return `Mes completo de ${periodo.nombreMes} de cada año.${notaRango}`;
  }

  function etiquetaPeriodo(periodo, anio, diaFin) {
    return periodo.esMesActual
      ? `${periodo.nombreMes} ${anio} · 1-${diaFin}`
      : `${periodo.nombreMes} ${anio}`;
  }

  function pintarVariacion(prefix, anioAnterior, actual, previo, formatter, unidad) {
    const card = document.getElementById(`${prefix}VariacionCard`);
    card?.classList.remove("is-positive", "is-negative", "is-neutral");

    if (!actual.tieneDatos || !previo.tieneDatos) {
      texto(`${prefix}Variacion`, "—");
      texto(`${prefix}VariacionDetail`, "Se requieren datos comparables de ambos años");
      card?.classList.add("is-neutral");
      return;
    }

    const diferencia = actual.total - previo.total;
    const pct = previo.total !== 0 ? diferencia / Math.abs(previo.total) : null;
    texto(`${prefix}Variacion`, pct === null ? "—" : `${pct > 0 ? "+" : ""}${porcentaje(pct)}`);
    texto(`${prefix}VariacionDetail`, `${diferencia > 0 ? "+" : ""}${formatter(diferencia)}${unidad || ""} vs ${anioAnterior}`);
    card?.classList.add(pct === null || diferencia === 0 ? "is-neutral" : diferencia > 0 ? "is-positive" : "is-negative");
  }

  function calcularIngresos(anio, mes, diaFin) {
    const clave = `${anio}-${String(mes).padStart(2, "0")}`;
    if (!ingresosExcelDisponibles(clave)) return {total: NaN, registros: NaN, tieneDatos: false, noDisponible: true};
    let total = 0;
    let registros = 0;

    (window.state.datos.ingresos || []).forEach((item) => {
      const fecha = fechaDe(item, ["fecha", "Fecha", "FECHA"]);
      if (!enMesHasta(fecha, anio, mes, diaFin)) return;
      total += Number(item.importe || 0);
      registros += 1;
    });

    return { total, registros, tieneDatos: true };
  }

  function calcularVentas(anio, mes, diaFin) {
    let prevision = 0;
    let registrosPrevision = 0;

    (window.state.datos.ventas || []).forEach((item) => {
      const esContrato = typeof esFuenteContratos === "function"
        ? esFuenteContratos(item.fuente)
        : String(item.fuente || "").toUpperCase().includes("CONTRATOS");
      const fecha = fechaDe(item, ["fechaContrato", "fecha", "Fecha_Contrato", "Fecha"]);

      if (!esContrato || !enMesHasta(fecha, anio, mes, diaFin)) return;

      prevision += typeof obtenerMontoVenta === "function"
        ? Number(obtenerMontoVenta(item) || 0)
        : Number(item.montoVenta || item.total || 0);
      registrosPrevision += 1;
    });

    let ui = 0;
    let registrosUi = 0;

    (window.state.datos.servicios || []).forEach((item) => {
      const esUi = typeof esServicioUsoInmediatoBiServicios === "function"
        ? esServicioUsoInmediatoBiServicios(item)
        : normalizarPlano(item.previsionUsoInmediato).includes("USO INMEDIATO");
      const fecha = fechaDe(item, ["fechaServicio", "fechaCreacionOrigen", "fechaCreacionOriginal", "fechaFin"]);

      if (!esUi || !enMesHasta(fecha, anio, mes, diaFin)) return;

      const origen = typeof obtenerOrigenServicio === "function"
        ? String(obtenerOrigenServicio(item) || "")
        : String(item.tipoOrigen || item.origen || "");
      const origenNormalizado = normalizarPlano(origen);

      if (origenNormalizado.includes("CAPILLA")) {
        ui += typeof obtenerMontoServicioUiCapillas === "function"
          ? Number(obtenerMontoServicioUiCapillas(item) || 0)
          : Number(item.precioVenta || 0);
        registrosUi += 1;
      } else if (origenNormalizado.includes("PARQUE")) {
        ui += typeof obtenerMontoServicioUi === "function"
          ? Number(obtenerMontoServicioUi(item) || 0)
          : Number(item.precioTotalServicio || 0);
        registrosUi += 1;
      }
    });

    return {
      total: prevision + ui,
      prevision,
      ui,
      registros: registrosPrevision + registrosUi,
      tieneDatos: registrosPrevision + registrosUi > 0
    };
  }

  function calcularServiciosCapillas(anio, mes, diaFin) {
    let totalCapillas = 0;
    let prevision = 0;
    let ui = 0;

    (window.state.datos.servicios || []).forEach((item) => {
      const fecha = fechaDe(item, ["fechaServicio", "fechaCreacionOrigen", "fechaCreacionOriginal", "fechaFin"]);
      if (!enMesHasta(fecha, anio, mes, diaFin)) return;

      const origen = typeof obtenerOrigenServicio === "function"
        ? String(obtenerOrigenServicio(item) || "")
        : String(item.tipoOrigen || item.origen || "");

      if (!normalizarPlano(origen).includes("CAPILLA")) return;

      totalCapillas += 1;

      if (esCapillasPrevision(item)) prevision += 1;
      if (esCapillasUsoInmediato(item)) ui += 1;
    });

    return {
      totalCapillas,
      prevision,
      ui,
      tieneDatos: totalCapillas > 0
    };
  }

  function esCapillasPrevision(item) {
    if (typeof esServicioCapillasPrevision === "function") {
      return esServicioCapillasPrevision(item);
    }

    const tipo = normalizarPlano(
      item.previsionUsoInmediato || item.prevision_uso_inmediato || item.Prevision_Uso_Inmediato || ""
    );
    return tipo.includes("PREVISION");
  }

  function esCapillasUsoInmediato(item) {
    if (typeof esServicioCapillasUsoInmediato === "function") {
      return esServicioCapillasUsoInmediato(item);
    }

    const tipo = normalizarPlano(
      item.previsionUsoInmediato || item.prevision_uso_inmediato || item.Prevision_Uso_Inmediato || ""
    );
    return tipo.includes("USO INMEDIATO") || tipo === "UI";
  }

  function enMesHasta(fecha, anio, mes, diaFin) {
    return Boolean(
      fecha &&
      fecha.getFullYear() === anio &&
      fecha.getMonth() + 1 === mes &&
      fecha.getDate() >= 1 &&
      fecha.getDate() <= diaFin
    );
  }

  function fechaDe(item, campos) {
    for (const campo of campos) {
      const fecha = parseFecha(item?.[campo]);
      if (fecha) return fecha;
    }
    return null;
  }

  function parseFecha(valor) {
    if (valor === null || valor === undefined || valor === "") return null;
    if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
    if (typeof valor === "number" && Number.isFinite(valor)) {
      return new Date(new Date(1899, 11, 30, 12).getTime() + valor * 86400000);
    }

    const s = String(valor).trim();
    let m = s.match(/^(\\d{4})[/-](\\d{1,2})[/-](\\d{1,2})/);
    if (m) return fechaLocal(+m[1], +m[2], +m[3]);

    m = s.match(/^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})/);
    if (m) return fechaLocal(+m[3], +m[2], +m[1]);

    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fechaLocal(anio, mes, dia) {
    const d = new Date(anio, mes - 1, dia, 12);
    return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia ? d : null;
  }

  function nombreMesCapitalizado(numeroMes) {
    const nombre = new Intl.DateTimeFormat("es-MX", { month: "long" }).format(new Date(2020, numeroMes - 1, 1));
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }

  function normalizarPlano(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .trim()
      .toUpperCase();
  }

  function moneda(valor) {
    return typeof formatoMoneda === "function"
      ? formatoMoneda(Number(valor || 0))
      : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor || 0));
  }

  function porcentaje(valor) {
    return new Intl.NumberFormat("es-MX", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(Number(valor || 0));
  }

  function num(valor) {
    return typeof formatoNumero === "function"
      ? formatoNumero(Number(valor || 0))
      : new Intl.NumberFormat("es-MX").format(Number(valor || 0));
  }

  function texto(id, valor) {
    const nodo = document.getElementById(id);
    if (nodo) nodo.textContent = valor;
  }

  window.instalarComparativoInteranualDashboard = instalarComparativoInteranualDashboard;
  window.renderComparativosInteranuales = renderComparativosInteranuales;
  document.addEventListener("DOMContentLoaded", instalarComparativoInteranualDashboard);
})();

';
    $data['dashboard-annual-history.js']='(() => {
  "use strict";

  const BASELINE_VERSION = "20260914-1";
  const DATASETS_ANUALES = ["ingresos", "egresos", "ventas", "servicios"];

  function normalizar(valor) {
    return String(valor ?? "").trim().toUpperCase();
  }

  function obtenerAnioActivo() {
    const state = window.state || {};
    const anio = String(state.anioSeleccionado || "").trim();

    if (/^20\\d{2}$/.test(anio)) {
      return anio;
    }

    const mes = String(state.mesFinSeleccionado || state.mesSeleccionado || "");
    const match = mes.match(/^(20\\d{2})-/);
    return match ? match[1] : String(new Date().getFullYear());
  }

  function obtenerMesLimiteHistorico(anio) {
    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const anioNumero = Number(anio);

    if (!Number.isFinite(anioNumero)) {
      return 0;
    }

    if (anioNumero < anioActual) {
      return 12;
    }

    if (anioNumero > anioActual) {
      return 0;
    }

    // Una carga incremental normal contiene el mes actual y el anterior.
    // Para distinguir una fotografia anual completa de una fotografia parcial,
    // buscamos al menos informacion anterior a esos dos meses.
    return Math.max(0, hoy.getMonth() - 1);
  }

  function coincideRegistroMes(tipo, item, claveMes) {
    try {
      if (tipo === "ventas" && typeof window.coincidePeriodoVenta === "function") {
        return window.coincidePeriodoVenta(item, claveMes);
      }

      if (tipo === "servicios" && typeof window.coincidePeriodoServicio === "function") {
        return window.coincidePeriodoServicio(item, claveMes);
      }

      if (typeof window.coincideMesValor === "function") {
        return window.coincideMesValor(item?.mes, claveMes);
      }
    } catch (error) {
      console.warn("No se pudo validar cobertura mensual del Dashboard:", error);
    }

    const mesItem = normalizar(item?.mes);
    return mesItem === normalizar(claveMes);
  }

  function datasetTieneHistoria(tipo, anio, mesLimite) {
    const lista = window.state?.datos?.[tipo] || [];

    if (!Array.isArray(lista) || lista.length === 0 || mesLimite <= 0) {
      return false;
    }

    for (let mes = 1; mes <= mesLimite; mes += 1) {
      const clave = `${anio}-${String(mes).padStart(2, "0")}`;

      if (lista.some((item) => coincideRegistroMes(tipo, item, clave))) {
        return true;
      }
    }

    return false;
  }

  function obtenerCoberturaHistorica(anio) {
    const mesLimite = obtenerMesLimiteHistorico(anio);

    if (mesLimite <= 0) {
      return {
        suficiente: true,
        cubiertos: DATASETS_ANUALES.length,
        total: DATASETS_ANUALES.length,
        detalle: {}
      };
    }

    const detalle = {};
    let cubiertos = 0;

    DATASETS_ANUALES.forEach((tipo) => {
      const tieneHistoria = datasetTieneHistoria(tipo, anio, mesLimite);
      detalle[tipo] = tieneHistoria;
      if (tieneHistoria) cubiertos += 1;
    });

    return {
      // Tres de las cuatro fuentes principales deben demostrar historia previa.
      // Esto tolera que una lista sea legitimamente vacia, pero detecta la cache
      // parcial creada solamente con el mes actual y el anterior.
      suficiente: cubiertos >= 3,
      cubiertos,
      total: DATASETS_ANUALES.length,
      detalle
    };
  }

  function obtenerMarkerKey(anio) {
    const usuario = String(window.PORTAL_USER_EMAIL || "anonimo")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9@._-]+/g, "_");

    return `dashboardExcelAnnualHistory:${BASELINE_VERSION}:${usuario}:${anio}`;
  }

  function baselineValidado(anio) {
    try {
      return localStorage.getItem(obtenerMarkerKey(anio)) === "1";
    } catch (_) {
      return false;
    }
  }

  function guardarBaselineValidado(anio) {
    try {
      localStorage.setItem(obtenerMarkerKey(anio), "1");
    } catch (_) {}
  }

  function instalarProteccionHistoricoAnual() {
    const original = window.actualizarDatosDashboard;

    if (typeof original !== "function" || original.__annualHistoryGuard) {
      return false;
    }

    const wrapper = async function actualizarDatosDashboardConHistorico(opciones = {}) {
      const anio = obtenerAnioActivo();
      const coberturaAntes = obtenerCoberturaHistorica(anio);
      const tieneBaseline = baselineValidado(anio);
      const modoSolicitado = opciones?.modoCarga || "";

      const forzarCompleta =
        modoSolicitado !== "completa" &&
        !tieneBaseline &&
        !coberturaAntes.suficiente;

      const opcionesEfectivas = forzarCompleta
        ? {
            ...opciones,
            modoCarga: "completa",
            mensaje: "Reconstruyendo informaci贸n anual completa desde SharePoint..."
          }
        : opciones;

      if (forzarCompleta) {
        console.warn(
          "Cache anual incompleta detectada. Se forzara una carga completa del Dashboard.",
          coberturaAntes
        );
      }

      const resultado = await original(opcionesEfectivas);

      const coberturaDespues = obtenerCoberturaHistorica(anio);
      const huboCargaCompleta = opcionesEfectivas?.modoCarga === "completa";

      if (huboCargaCompleta && coberturaDespues.suficiente) {
        guardarBaselineValidado(anio);
        console.log("Historico anual del Dashboard validado:", coberturaDespues);
      } else if (huboCargaCompleta && !coberturaDespues.suficiente) {
        console.warn(
          "La carga completa termino, pero no se pudo confirmar cobertura anual suficiente.",
          coberturaDespues
        );
      }

      return resultado;
    };

    wrapper.__annualHistoryGuard = true;
    window.actualizarDatosDashboard = wrapper;
    return true;
  }

  if (!instalarProteccionHistoricoAnual()) {
    document.addEventListener("DOMContentLoaded", instalarProteccionHistoricoAnual, { once: true });
  }
})();

';
    foreach($data as $f=>$source){if(str_ends_with($f,'.php'))token_get_all($source,TOKEN_PARSE);}
    $backup=HS_DIR.'/respaldo-preview-'.gmdate('Ymd-His');if(!mkdir($backup,0700))throw new RuntimeException('No se pudo crear respaldo.');
    foreach($data as $f=>$s){if(is_file($dir.'/'.$f)){if(!copy($dir.'/'.$f,$backup.'/'.$f))throw new RuntimeException('Respaldo incompleto.');chmod($backup.'/'.$f,0600);}}
    foreach($data as $f=>$s){$tmp=tempnam($dir,'hsdeploy_');if(file_put_contents($tmp,$s)!==strlen($s)){@unlink($tmp);throw new RuntimeException('Escritura incompleta.');}chmod($tmp,0644);if(!rename($tmp,$dir.'/'.$f))throw new RuntimeException('No se pudo instalar '.$f);}
    hsWrite('historico_instalacion.json',['build'=>HS_BUILD,'fechaUTC'=>hsNow(),'destino'=>$dir,'respaldo'=>$backup,'sha256'=>array_map(fn($s)=>hash('sha256',$s),$data)]);
}




function hsInstallContinuation():array {
 $source='/home/juanpab1/public_html/portal.juanpablo.com.mx/dashboard-excel-preview';
 $stage='/home/juanpab1/public_html/portal.juanpablo.com.mx/dashboard-egresos-preview';
 if(realpath(__DIR__)!==$source)throw new RuntimeException('Destino de instalación inválido.');
 $production=hsProductionCheck();if(!$production['intacta'])throw new RuntimeException('La producción difiere del control inicial.');
 $baseline=hsRead('dashboard-produccion-sha256.json');$restore='/home/juanpab1/respaldo-dashboard-excel-20261105-migracion/dashboard';
 foreach($baseline as $name=>$hash)if(!hash_equals($hash,(string)@hash_file('sha256',$restore.'/'.$name)))throw new RuntimeException('Respaldo de producción no restaurable: '.$name);
 if(is_dir($stage)){chmod($stage,0755);return ['estado'=>'ya_instalado','destino'=>$stage];}
 $data=[];foreach(glob($source.'/*') as $file){$name=basename($file);if(is_file($file)&&preg_match('/\.(?:js|css|php)$/D',$name)&&!in_array($name,['ingresos-historico.php','ingresos-cache.php','ingresos-excel-preview.js','ingresos-excel-preview-v2.js'],true))$data[$name]=(string)file_get_contents($file);}
 $patch=static function(string &$value,string $old,string $new):void{if(substr_count($value,$old)!==1)throw new RuntimeException('La versión de pruebas cambió; falta el bloque esperado: '.substr($old,0,70));$value=str_replace($old,$new,$value);};
 $graph=&$data['graph.js'];$begin=strpos($graph,'async function obtenerEgresosSharePoint(');$end=strpos($graph,'async function obtenerVentasSharePoint(',$begin?:0);
 if($begin===false||$end===false)throw new RuntimeException('No se reconoció el lector anterior de Egresos.');
 $graph=substr($graph,0,$begin)."async function obtenerEgresosExcel() { return await cargarEgresosExcel(); }\n\n".substr($graph,$end);
 foreach(['graph.js','dashboard-role-access.js','app.js'] as $name)$data[$name]=str_replace('obtenerEgresosSharePoint','obtenerEgresosExcel',$data[$name]);
 $app=&$data['app.js'];
 $old="    state.datos.egresos = reemplazarRegistrosPorMes(\n      state.datos.egresos,\n      datosSharePoint.egresos || [],\n      mesesRecargados\n    );";
 $patch($app,$old,"    state.datos.egresos = (datosSharePoint.egresos || []).filter(row => row.fuenteOrigen === 'excel_original_egresos');");
 $patch($app,'    state.datos.egresos = cache.datos.egresos || [];','    state.datos.egresos = await cargarEgresosExcel();');
 $app=str_replace(['dashboardExcelHistoricoDatos','dashboardExcelHistoricoCacheDB'],['dashboardExcelEgresosPruebasDatos','dashboardExcelEgresosPruebasCacheDB'],$app);
 foreach(['sumarEgresos','calcularTotalPorPagar','contarRegistrosEgresos'] as $name)$patch($app,'function '.$name.'(mes) {','function '.$name."(mes) {\n  if (!egresosExcelDisponibles(mes)) return NaN;");
 $patch($app,'  renderEstadoIngresosExcel();',"  renderEstadoIngresosExcel();\n  renderEstadoEgresosExcel();");
 $patch($app,'function renderDetalleEgresos(mes, totalEgresos) {',<<<'EG'
function renderDetalleEgresos(mes, totalEgresos) {
  if (!egresosExcelDisponibles(mes)) {
    for (const id of ['tablaEgresosRubroBody','tablaEgresosTipoGastoBody','tablaEgresosBeneficiarioBody','tablaEgresosPendientesBody']) {
      const el=document.getElementById(id); if(el)el.innerHTML='<tr><td colspan="5">Información no disponible: falta Excel validado para el periodo.</td></tr>';
    }
    destruirGrafica('egresosRubro'); renderGraficaEgresosMensuales(); return;
  }
EG);
 $patch($app,"function renderTablaFlujoEfectivo(mes) {\n  if (!ingresosExcelDisponibles(mes))", "function renderTablaFlujoEfectivo(mes) {\n  if (!ingresosExcelDisponibles(mes) || !egresosExcelDisponibles(mes))");
 $app=str_replace('no se puede calcular el flujo sin todos los ingresos validados.','no se puede calcular el flujo sin todos los ingresos y egresos validados.',$app);
 $begin=strpos($app,'function calcularFlujoEfectivo(mes) {');$end=strpos($app,"\nfunction ",$begin+10);if($end===false)$end=strlen($app);
 $flow=substr($app,$begin,$end-$begin);$flow=preg_replace('/(const total\w+ = )(sumarTotalFlujo\([^;]+\));/','$1egresosExcelDisponibles(mes) ? $2 : NaN;',$flow);$app=substr($app,0,$begin).$flow.substr($app,$end);
 $app=str_replace('"BI_Egresos"','"Excel original de Finanzas"',$app);
 $data['config.js']=preg_replace('/\s*egresos:\s*\{\s*nombre:\s*"BI_Egresos",\s*listId:\s*"[^"]+"\s*\},/','',$data['config.js'],1,$removed);if($removed!==1)throw new RuntimeException('No se encontró configuración BI_Egresos.');
 $index=&$data['index.php'];$patch($index,'</nav>',"</nav>\n<div id=\"egresosExcelEstado\" style=\"margin:16px;padding:14px;border:1px solid #8ba3a0;border-radius:10px;background:#f4f9f7\">Egresos Excel: verificando información.</div>");
 $index=preg_replace('/(<script[^>]*src=")graph\.js[^\"]*(")/','$1graph.js?v=20261105-egresos-1$2',$index);
 $patch($index,'<script src="ingresos-historico.js', '<script src="egresos-excel.js?v=20261105-egresos-1"></script>' . "\n<script src=\"ingresos-historico.js");
 $index=preg_replace('/(src=")(app\.js|config\.js|dashboard-role-access\.js)[^\"]*(")/','$1$2?v=20261105-egresos-1$3',$index);
 $bundle=json_decode(gzdecode(base64_decode('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',true)),true,512,JSON_THROW_ON_ERROR);
 $private=[];foreach($bundle as $key=>$value){if(str_starts_with($key,'privado/'))$private[substr($key,8)]=$value;elseif(str_starts_with($key,'publico/'))$data[substr($key,8)]=$value;}
 foreach(['graph.js','config.js','app.js','dashboard-role-access.js'] as $name)if(preg_match('/BI_Egresos|obtenerEgresosSharePoint|lists\.egresos/',$data[$name]))throw new RuntimeException('Quedó un lector BI_Egresos en '.$name);
 $backup=HS_DIR.'/respaldo-continuacion-'.gmdate('Ymd-His');if(!mkdir($backup,0700))throw new RuntimeException('No se pudo crear respaldo.');$hashes=[];
 foreach(glob($source.'/*') as $file)if(is_file($file)){if(!copy($file,$backup.'/'.basename($file)))throw new RuntimeException('Falló respaldo.');chmod($backup.'/'.basename($file),0600);if(!hash_equals(hash_file('sha256',$file),hash_file('sha256',$backup.'/'.basename($file))))throw new RuntimeException('Respaldo incompleto.');}
 foreach($private as $name=>$value){$path=HS_DIR.'/'.$name;if(is_file($path))copy($path,$backup.'/privado-'.$name);$tmp=tempnam(HS_DIR,'codigo_');file_put_contents($tmp,$value,LOCK_EX);chmod($tmp,0600);if(!rename($tmp,$path))throw new RuntimeException('No se pudo instalar código privado.');$hashes['privado/'.$name]=hash('sha256',$value);}
 $temporary=$stage.'-preparando';if(is_dir($temporary))throw new RuntimeException('Existe preparación previa; debe revisarse.');if(!mkdir($temporary,0755))throw new RuntimeException('No se pudo crear ambiente.');chmod($temporary,0755);
 foreach($data as $name=>$value){if(file_put_contents($temporary.'/'.$name,$value)!==strlen($value))throw new RuntimeException('Archivo incompleto: '.$name);chmod($temporary.'/'.$name,0644);$hashes['publico/'.$name]=hash('sha256',$value);}
 if(!rename($temporary,$stage))throw new RuntimeException('No se pudo publicar ambiente de pruebas.');
 $result=['estado'=>'instalado','fechaUTC'=>hsNow(),'destino'=>$stage,'respaldo'=>$backup,'produccionRestaurable'=>count($baseline),'sha256'=>$hashes];hsWrite('egresos_instalacion.json',$result);return $result;
}
function hsCodeSnapshot():void {
 $paths=['dashboard-excel-preview'=>__DIR__,'dashboard-egresos-preview'=>dirname(__DIR__).'/dashboard-egresos-preview'];$files=[];
 foreach($paths as $prefix=>$path)foreach(glob($path.'/*') as $file)if(is_file($file)&&preg_match('/\.(?:js|css|php)$/D',$file))$files[$prefix.'/'.basename($file)]=file_get_contents($file);
 foreach(['ingresos_lector_prueba.php','ingresos_engine.php','egresos_engine.php','dashboard_excel_cron.php'] as $name)if(is_file(HS_DIR.'/'.$name))$files['private-code/'.$name]=file_get_contents(HS_DIR.'/'.$name);
 if(($_GET['archivo']??'')==='hashes'){$value=json_encode(array_map(fn($s)=>hash('sha256',$s),$files),JSON_UNESCAPED_UNICODE|JSON_PRETTY_PRINT);echo '<!doctype html><meta charset="utf-8"><textarea id="codigo">'.htmlspecialchars($value,ENT_QUOTES,'UTF-8').'</textarea>';exit;}
 $pack=base64_encode(gzencode(json_encode($files,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),9));echo '<!doctype html><meta charset="utf-8"><title>Respaldo de código · Sin datos ni credenciales</title><textarea id="codigo">'.htmlspecialchars($pack,ENT_QUOTES,'UTF-8').'</textarea>';exit;
}

function hsFinishContinuation():array {
    $source='/home/juanpab1/public_html/portal.juanpablo.com.mx/dashboard-excel-preview';
    if(realpath(__DIR__)!==$source)throw new RuntimeException('Destino no permitido.');
    $dir=dirname(__DIR__).'/dashboard-egresos-preview';chmod($dir,0755);
    $backup=HS_DIR.'/respaldo-final-continuacion-'.gmdate('Ymd-His');mkdir($backup,0700);
    $old=HS_DIR.'/egresos_engine.php';if(!copy($old,$backup.'/egresos_engine.php'))throw new RuntimeException('No se pudo respaldar Egresos.');
    if(!hash_equals(hash_file('sha256',$old),hash_file('sha256',$backup.'/egresos_engine.php')))throw new RuntimeException('Respaldo incompleto.');
    $code=gzdecode(base64_decode('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',true));$temp=tempnam(HS_DIR,'codigo_');file_put_contents($temp,$code,LOCK_EX);chmod($temp,0600);rename($temp,$old);
    $archive=$backup.'/legado';mkdir($archive,0700);$removed=[];
    $active=(string)file_get_contents($source.'/index.php');foreach(['app.js','graph.js','ingresos-historico.js','dashboard-role-access.js','dashboard-yoy-comparison.js'] as $file)$active.=(string)file_get_contents($source.'/'.$file);
    foreach(['ingresos-cache.php','ingresos-excel-preview.js','ingresos-excel-preview-v2.js'] as $file){if(str_contains($active,$file))throw new RuntimeException('Archivo todavía referenciado: '.$file);if(is_file($source.'/'.$file)){if(!rename($source.'/'.$file,$archive.'/'.$file))throw new RuntimeException('No se pudo archivar '.$file);$removed[]=$file;}}
    $patched=[];
    foreach([$source,$dir] as $appDir){$app=(string)file_get_contents($appDir.'/app.js');
      if(!str_contains($app,'EXCEL_ALERT_GUARD')){
        $isEgresos=$appDir===$dir;
        $guards=['generarAlertaCobranzaAreasDebajoMeta'=>'!ingresosExcelDisponibles(periodo)','generarAlertaCobranzaDebajoMeta'=>'!ingresosExcelDisponibles(periodo)','generarAlertaFlujoNetoBajoONegativo'=>'!ingresosExcelDisponibles(periodo)','generarAlertaFlujoNetoNegativo'=>'!ingresosExcelDisponibles(periodo)'];
        if($isEgresos){foreach(['generarAlertaFlujoNetoBajoONegativo','generarAlertaFlujoNetoNegativo'] as $f)$guards[$f].=' || !egresosExcelDisponibles(periodo)';foreach(['generarAlertaEgresosPorPagarElevados','generarAlertaRubrosEgresosFueraRango'] as $f)$guards[$f]='!egresosExcelDisponibles(periodo)';}
        foreach($guards as $name=>$condition){$guardNeedle='function '.$name.'(periodo, etiquetaPeriodo) {';if(substr_count($app,$guardNeedle)!==1)throw new RuntimeException('Cambió la función de alertas '.$name);$app=str_replace($guardNeedle,$guardNeedle."\n  if (".$condition.") return []; // EXCEL_ALERT_GUARD",$app);}
        foreach(['app.js','index.php'] as $file)if(!copy($appDir.'/'.$file,$backup.'/'.basename($appDir).'-'.$file))throw new RuntimeException('No se pudo respaldar interfaz.');
        $tmp=tempnam($appDir,'codigo_');file_put_contents($tmp,$app,LOCK_EX);chmod($tmp,0644);rename($tmp,$appDir.'/app.js');
        $index=(string)file_get_contents($appDir.'/index.php');$index=preg_replace('/src="app\.js\?v=[^"]+"/','src="app.js?v=20261105-alertas-1"',$index);$tmp=tempnam($appDir,'codigo_');file_put_contents($tmp,$index,LOCK_EX);chmod($tmp,0644);rename($tmp,$appDir.'/index.php');$patched[basename($appDir)]=hash('sha256',$app);
      }
    }
    $signed=(string)file_get_contents($dir.'/app.js');
    if(!str_contains($signed,'EXCEL_SIGNED_EGRESOS')){
      if(substr_count($signed,'if (pagado <= 0) {')!==1)throw new RuntimeException('Cambió el filtro de flujo.');
      $signed=str_replace('if (pagado <= 0) {','if (pagado === 0) { // EXCEL_SIGNED_EGRESOS',$signed);
      $signed=str_replace('coincideMesValor(mesEgreso, mes) && pagado > 0;','coincideMesValor(mesEgreso, mes) && pagado !== 0;',$signed);
      $signed=str_replace('&& (pagado > 0 || porPagar > 0);','&& (pagado !== 0 || porPagar > 0);',$signed);
      $a=strpos($signed,'function renderGraficaPieEgresosRubro(mes) {');$b=strpos($signed,"\nfunction ",$a+10);$part=substr($signed,$a,$b-$a);
      $part=str_replace('Number(fila.total || 0) > 0','Number(fila.total || 0) !== 0',$part);
      $part=str_replace('type: "pie",','type: filas.some(fila => fila.total < 0) ? "bar" : "pie",',$part);
      $part=str_replace('Number(context.parsed || 0)','Number(typeof context.parsed === "object" ? context.parsed.y : context.parsed || 0)',$part);$signed=substr($signed,0,$a).$part.substr($signed,$b);
      copy($dir.'/app.js',$backup.'/egresos-antes-signos-app.js');copy($dir.'/index.php',$backup.'/egresos-antes-signos-index.php');
      $tmp=tempnam($dir,'codigo_');file_put_contents($tmp,$signed,LOCK_EX);chmod($tmp,0644);rename($tmp,$dir.'/app.js');
      $index=(string)file_get_contents($dir.'/index.php');$index=preg_replace('/src="app\.js\?v=[^"]+"/','src="app.js?v=20261105-egresos-signos-1"',$index);$tmp=tempnam($dir,'codigo_');file_put_contents($tmp,$index,LOCK_EX);chmod($tmp,0644);rename($tmp,$dir.'/index.php');$patched[basename($dir)]=hash('sha256',$signed);
    }
    $temps=array_merge(glob(HS_DIR.'/original_guardado_*')?:[],glob(HS_DIR.'/xml_hs_*')?:[]);
    $result=['fechaUTC'=>hsNow(),'respaldo'=>$backup,'archivados'=>$removed,'egresosMotorSHA256'=>hash_file('sha256',$old),'interfacesSHA256'=>$patched,'temporalesEncontrados'=>count($temps),'produccion'=>hsProductionCheck()];hsWrite('continuacion_estado.json',$result);return $result;
}
