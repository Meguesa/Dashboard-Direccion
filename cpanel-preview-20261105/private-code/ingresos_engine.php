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
