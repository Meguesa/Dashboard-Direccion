<?php
declare(strict_types=1);
const EG_DRIVE='b!pHgaPmk0u0eem993tNXPdXDnY1ILcuZGv2EfFdV9rplPAV4rL4C_QoZl8LbKac5c';
const EG_ITEM='01RNEUMM5KTKQB3IT6ZRCKPSD3ZUN7ICFV';
const EG_BUILD='20261106-egresos-historico-2';
const EG_MIN_YEAR=2024;
function egUnits($value):int {
    if($value===null||trim((string)$value)==='')return 0;$s=trim((string)$value);
    if(!preg_match('/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/D',$s,$m))throw new RuntimeException('Importe no numérico.');
    $fraction=$m[3]??'';$digits=ltrim($m[2].$fraction,'0')?:'0';$scale=6+(int)($m[4]??0)-strlen($fraction);
    if(abs($scale)>50||strlen($digits)>100)throw new RuntimeException('Importe fuera de rango.');
    if($scale>=0)$n=(int)($digits.str_repeat('0',$scale));else{$cut=-$scale;$digits=str_pad($digits,$cut+1,'0',STR_PAD_LEFT);$n=(int)substr($digits,0,-$cut);if((int)$digits[strlen($digits)-$cut]>=5)$n++;}
    if(abs($n)>8000000000000000)throw new RuntimeException('Importe excede el límite exacto.');return ($m[1]??'')==='-'?-$n:$n;
}
function egPath(string $base,string $target):string {
    $path=str_starts_with($target,'/')?ltrim($target,'/'):dirname($base).'/'.$target;$out=[];
    foreach(explode('/',$path) as $part){if($part===''||$part==='.')continue;if($part==='..'){if(!$out)throw new RuntimeException('Referencia XLSX inválida.');array_pop($out);}else $out[]=$part;}
    $p=implode('/',$out);if(!str_starts_with($p,'xl/'))throw new RuntimeException('Referencia fuera del libro.');return $p;
}
function egTable(ZipArchive $zip,string $sheet):array {
    $path=getWorksheetPath($zip,$sheet);$rel=dirname($path).'/_rels/'.basename($path).'.rels';$xml=readXml($zip,$rel);$tables=[];
    foreach($xml->getElementsByTagName('Relationship') as $r){if(!str_ends_with($r->getAttribute('Type'),'/table'))continue;$p=egPath($path,$r->getAttribute('Target'));$t=readXml($zip,$p)->documentElement;$ref=$t->getAttribute('ref');
        if(!preg_match('/^A(\d+):([A-Z]+)(\d+)$/D',$ref,$m))throw new RuntimeException('Rango de tabla no reconocido en '.$sheet);
        $tables[]=['nombre'=>$t->getAttribute('name'),'rango'=>$ref,'encabezado'=>(int)$m[1],'fin'=>(int)$m[3]-(int)$t->getAttribute('totalsRowCount')];}
    if(count($tables)!==1)throw new RuntimeException('Se requiere una tabla principal por hoja mensual: '.$sheet);return $tables[0];
}
function egAudit(string $file,string $year):array {
    $zip=new ZipArchive();if($zip->open($file)!==true)throw new RuntimeException('Excel no válido.');
    try{$strings=readStrings($zip);$book=readXml($zip,'xl/workbook.xml');$names=[];foreach($book->getElementsByTagName('sheet') as $sheet)$names[]=$sheet->getAttribute('name');
        $months=[];$monthNames=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];$extra=[];
        foreach($names as $sheet){$number=null;foreach($monthNames as $i=>$label)if(strtoupper(trim($sheet))===$label.' '.$year)$number=$i+1;if($number===null){$extra[]=$sheet;continue;}
            $month=$year.'-'.str_pad((string)$number,2,'0',STR_PAD_LEFT);$table=egTable($zip,$sheet);$headers=[];$rows=[];$sum=['importe'=>0,'pagado'=>0,'porPagar'=>0];$warnings=[];$errors=[];$fields=[];$filteredSubtotal=null;
            foreach(hsRows($zip,$sheet,$strings) as [$ri,$v,$f]){
                if($ri===$table['encabezado']){foreach($v as $col=>$label)$headers[strtoupper(trim((string)preg_replace('/\s+/u',' ',hsText($label))))]=$col;
                    foreach(['fecha'=>'FECHA','banco'=>'BANCO','tipoPago'=>'TIPO DE PAGO','empresa'=>'EMPRESA','rubro'=>'RUBRO','tipoGasto'=>'TIPO DE GASTO','beneficiario'=>'BENEFICIARIO','concepto'=>'CONCEPTO','importe'=>'IMPORTE','porPagar'=>'POR PAGAR','pagado'=>'PAGADO','tipoMov'=>'TIPO MOV','fechaPago'=>'FECHA PAGO'] as $key=>$label){if(!array_key_exists($label,$headers)){if($key==='banco'){$fields[$key]=null;continue;}throw new RuntimeException('Falta columna '.$label.' en '.$sheet);}$fields[$key]=$headers[$label];}continue;}
                if($ri<=$table['encabezado'])continue;
                if($ri>$table['fin']){if($ri===$table['fin']+1)$filteredSubtotal=['fila'=>$ri,'importe'=>$v[$fields['importe']]??null,'porPagar'=>$v[$fields['porPagar']]??null,'pagado'=>$v[$fields['pagado']]??null];break;}
                $benef=trim((string)($v[$fields['beneficiario']]??''));$concept=trim((string)($v[$fields['concepto']]??''));
                if($benef===''&&$concept===''){foreach(['importe','pagado','porPagar'] as $key)if(isset($v[$fields[$key]])&&trim((string)$v[$fields[$key]])!==''&&egUnits($v[$fields[$key]])!==0)$errors[]=['fila'=>$ri,'motivo'=>'Importe sin beneficiario o concepto'];continue;}
                $row=['id'=>'EXCEL-EGRESOS|'.$sheet.'|'.$ri,'mes'=>$month,'mesHoja'=>$month,'hojaOrigen'=>$sheet,'filaOrigen'=>$ri,'claveRegistro'=>'EGRESOS|'.$sheet.'|'.$ri,'fuenteOrigen'=>'excel_original_egresos','fuente'=>'RELACION DE PAGOS '.$year.'.xlsx'];
                foreach(['banco','tipoPago','empresa','rubro','tipoGasto','tipoMov'] as $key)$row[$key]=trim((string)($fields[$key]===null?'':($v[$fields[$key]]??'')));$row['beneficiario']=$benef;$row['concepto']=$concept;$row['contexto']=$concept;
                foreach(['fecha','fechaPago'] as $key){$raw=$v[$fields[$key]]??null;$row[$key.'Original']=$raw;$row[$key]=hsDate($raw);if(!$row[$key]&&($key==='fecha'||trim((string)$raw)!==''))$warnings[]=['fila'=>$ri,'tipo'=>'fecha','campo'=>$key];}
                try{foreach(['importe','pagado','porPagar'] as $key){$raw=$v[$fields[$key]]??null;$units=egUnits($raw);$row[$key.'Micros']=$units;$row[$key]=$units/1000000;$row[$key.'Original']=$raw;$sum[$key]+=$units;}}
                catch(Throwable $e){$errors[]=['fila'=>$ri,'motivo'=>'Importe no numérico'];continue;}
                $difference=$row['importeMicros']-$row['pagadoMicros']-$row['porPagarMicros'];if(abs($difference)>11000)$warnings[]=['fila'=>$ri,'tipo'=>'descuadre_origen','diferenciaMicros'=>$difference];
                $row['estatus']=$row['porPagarMicros']>0?($row['pagadoMicros']>0?'Parcial':'Por pagar'):($row['pagadoMicros']>0?'Pagado':'Sin pago registrado');$rows[]=$row;
            }
            $check=['importe'=>0,'pagado'=>0,'porPagar'=>0];$ids=[];foreach($rows as $row){if(isset($ids[$row['claveRegistro']]))$errors[]=['motivo'=>'Clave duplicada'];$ids[$row['claveRegistro']]=true;foreach(array_keys($check) as $key)$check[$key]+=$row[$key.'Micros'];}if($check!==$sum)$errors[]=['motivo'=>'No coinciden totales del detalle'];
            $audit=['validado'=>!$errors,'registros'=>count($rows),'totalesMicros'=>$sum,'totales'=>array_map(fn($v)=>$v/1000000,$sum),'tablaOrigen'=>$table,'control'=>'TABLA_COMPLETA_SIN_FILTROS','subtotalVisibleExcel'=>$filteredSubtotal,'camposAusentes'=>$fields['banco']===null?['BANCO']:[],'advertencias'=>$warnings,'errores'=>$errors];
            $months[$month]=['mes'=>$month,'auditoria'=>$audit,'movimientos'=>$rows,'hashContenido'=>hash('sha256',json_encode($rows,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR))];
        }if(!$months)throw new RuntimeException('No hay hojas mensuales de '.$year);ksort($months);return ['meses'=>$months,'hojasAuxiliaresNoSumadas'=>$extra];
    }finally{$zip->close();}
}
function egCacheName(string $month):string {if(!preg_match('/^20\d\d-(0[1-9]|1[0-2])$/D',$month))throw new RuntimeException('Mes no válido.');return 'cache_excel_egresos_'.$month.'.json';}

/* Descubre únicamente libros anuales de la misma carpeta autorizada de
 * RELACION DE PAGOS 2026, sin un listado fijo de años ni otros archivos. */
function egSources(string $token):array {
    $anchor=hsRemoteJson(EG_DRIVE,'/items/'.rawurlencode(EG_ITEM).'?%24select=id,name,parentReference',$token);
    $parent=(string)($anchor['parentReference']['id']??'');
    if($parent===''||($anchor['parentReference']['driveId']??EG_DRIVE)!==EG_DRIVE)
        throw new RuntimeException('No se pudo verificar la carpeta autorizada de Finanzas.');
    $page=hsRemoteJson(EG_DRIVE,'/items/'.rawurlencode($parent).'/children?%24top=200',$token);
    if(!empty($page['@odata.nextLink']))
        throw new RuntimeException('Carpeta de pagos con paginación pendiente; se conserva la última versión.');
    $found=[];
    foreach($page['value']??[] as $item){
        if(!array_key_exists('file',$item)||!preg_match('/^RELACION DE PAGOS (20\d\d)\.xlsx$/iD',(string)($item['name']??''),$matches))continue;
        $year=(int)$matches[1];
        if($year<EG_MIN_YEAR)continue;
        if(empty($item['id'])||isset($found[$year]))
            throw new RuntimeException('Libro anual duplicado o sin identificador: '.$year);
        $found[$year]=['id'=>(string)$item['id'],'nombre'=>(string)$item['name'],'carpeta'=>$parent];
    }
    if(!$found||!isset($found[2026]))
        throw new RuntimeException('No se encontraron libros de pagos en la carpeta autorizada.');
    krsort($found,SORT_NUMERIC);
    return $found;
}
function egRun(bool $force=false):array {
    @set_time_limit(180);
    $lock=fopen(HS_DIR.'/egresos.lock','c');
    if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))return ['estado'=>'ocupado'];
    $run=['inicioUTC'=>hsNow(),'build'=>EG_BUILD,'meses'=>[],'archivos'=>[],'errores'=>[]];
    $state=hsRead('egresos_estado.json',['meses'=>[],'archivos'=>[]]);
    if(!isset($state['meses'])||!is_array($state['meses']))$state['meses']=[];
    if(!isset($state['archivos'])||!is_array($state['archivos']))$state['archivos']=[];
    $started=microtime(true);$downloads=0;
    try{
        $token=hsToken();
        $claims=json_decode((string)base64_decode(strtr(explode('.',$token)[1]??'','-_','+/')),true);
        $state['aplicacion']=['clientId'=>JJP_PORTAL_CLIENT_ID,'permisos'=>$claims['roles']??[]];
        $sources=egSources($token);
        $state['catalogo']=array_map(fn($src)=>$src['nombre'],$sources);
        foreach($sources as $year=>$source){
            if(microtime(true)-$started>140){$run['pendientes'][]=(string)$year;continue;}
            $phase='metadatos_'.$year;
            try{
                $meta=hsRemoteJson(EG_DRIVE,'/items/'.rawurlencode($source['id']),$token);
                $etag=(string)($meta['eTag']??'');
                if(!$etag||($meta['name']??'')!==$source['nombre']||
                   ($meta['parentReference']['id']??$source['carpeta'])!==$source['carpeta'])
                    throw new RuntimeException('Identidad del libro anual no válida.');
                $prev=$state['archivos'][$year]??[];
                $monthsOfYear=$prev['meses']??[];
                // Una auditoría fallida NO es una caché válida. Antes se usaba
                // isset(auditoria), lo que dejaba años históricos sin volver
                // a intentarse incluso cuando nunca tuvieron datos publicados.
                $cacheOK=count($monthsOfYear)>0;
                foreach($monthsOfYear as $month){
                    $mesEstado=$state['meses'][$month]??[];
                    $nombreCache=egCacheName((string)$month);
                    $cacheMes=hsRead($nombreCache);
                    if(empty($mesEstado['auditoria']['validado'])||
                       empty($mesEstado['cacheDisponible'])||
                       empty($cacheMes['auditoria']['validado'])||
                       ($cacheMes['mes']??'')!==$month||
                       !is_file(HS_DIR.'/'.$nombreCache)){
                        $cacheOK=false;break;
                    }
                }
                if(!$force&&$cacheOK&&($prev['build']??'')===EG_BUILD&&
                   ($prev['etag']??'')===$etag&&empty($prev['nuevaVersionPendiente'])){
                    $state['archivos'][$year]['verificadoUTC']=hsNow();
                    foreach($monthsOfYear as $m)$state['meses'][$m]['verificadoUTC']=hsNow();
                    $run['archivos'][$year]=['estado'=>'sin_cambios','meses'=>count($monthsOfYear)];
                    continue;
                }
                if($downloads>=2){$run['pendientes'][]=(string)$year;continue;}
                $phase='descarga_'.$year;
                $download=hsSnapshotDownload(EG_DRIVE,$meta,$token);
                try{
                    if($download['metodo']==='version_guardada_tras_reintentos')
                        throw new RuntimeException('Versión actual no disponible; se conserva la última validada.');
                    $phase='lectura_'.$year;
                    $book=egAudit($download['temporal'],(string)$year);
                    $after=hsRemoteJson(EG_DRIVE,'/items/'.rawurlencode($source['id']).'?%24select=id,eTag,cTag',$token);
                    if(($after['eTag']??null)!==$etag||!empty($download['nuevaVersionPendiente']))
                        throw new RuntimeException('El Excel cambió durante la lectura; se repetirá el próximo ciclo.');
                    $fileInfo=[
                        'nombre'=>$source['nombre'],'id'=>$source['id'],'etag'=>$etag,
                        'sha256'=>$download['sha256'],'tamanoBytes'=>$download['tamanoBytes'],
                        'fechaDatosUTC'=>$download['fechaDatosUTC'],'metodoLectura'=>$download['metodo'],
                        'build'=>EG_BUILD,'verificadoUTC'=>hsNow(),
                        'meses'=>array_keys($book['meses']),
                        'hojasAuxiliaresNoSumadas'=>$book['hojasAuxiliaresNoSumadas'],
                        'nuevaVersionPendiente'=>false,'error'=>null
                    ];
                    foreach($book['meses'] as $m=>$entry){
                        $old=hsRead(egCacheName($m));
                        $valid=$entry['auditoria']['validado'];
                        $oldValid=!empty($old['auditoria']['validado']);
                        $changed=!$oldValid||($old['hashContenido']??null)!==$entry['hashContenido'];
                        $generated=$old['generadoUTC']??null;
                        if($valid&&$changed){
                            $generated=hsNow();
                            hsWrite(egCacheName($m),[
                                'version'=>2,'build'=>EG_BUILD,'mes'=>$m,
                                'generadoUTC'=>$generated,'verificadoUTC'=>hsNow(),
                                'excel'=>$fileInfo,'hashContenido'=>$entry['hashContenido'],
                                'auditoria'=>$entry['auditoria'],'movimientos'=>$entry['movimientos']
                            ]);
                        }
                        $currentAudit=$valid?$entry['auditoria']:($oldValid?$old['auditoria']:$entry['auditoria']);
                        $s=[
                            'mes'=>$m,'archivo'=>$source['nombre'],
                            'cacheDisponible'=>$valid||$oldValid,
                            'estado'=>$valid?'validado':($oldValid?'ultima_validada_con_incidencia':'no_disponible'),
                            'hashContenido'=>$valid?$entry['hashContenido']:($old['hashContenido']??null),
                            'auditoria'=>$currentAudit,'verificadoUTC'=>hsNow(),'generadoUTC'=>$generated,
                            'error'=>$valid?null:'Los datos de este mes no superaron la auditoría.'
                        ];
                        $state['meses'][$m]=$s;
                        $run['meses'][$m]=[
                            'registros'=>$s['auditoria']['registros']??0,'estado'=>$s['estado'],
                            'totales'=>$s['auditoria']['totales']??null,
                            'advertencias'=>count($entry['auditoria']['advertencias']??[])
                        ];
                    }
                    foreach(array_diff($monthsOfYear,array_keys($book['meses'])) as $missing){
                        $state['meses'][$missing]['cacheDisponible']=false;
                        $state['meses'][$missing]['estado']='no_disponible';
                        $state['meses'][$missing]['error']='Hoja mensual retirada del libro original.';
                    }
                    $state['archivos'][$year]=$fileInfo;
                    $run['archivos'][$year]=['estado'=>'validado','meses'=>count($book['meses'])];
                    $downloads++;
                    unset($book);
                }finally{@unlink($download['temporal']);}
            }catch(Throwable $e){
                $message=$e->getMessage();
                $run['errores'][$year]=$message;
                $run['archivos'][$year]=['estado'=>'error','fase'=>$phase];
                if(!isset($state['archivos'][$year]))$state['archivos'][$year]=['nombre'=>$source['nombre'],'meses'=>[]];
                $state['archivos'][$year]['error']=$message;
                $state['archivos'][$year]['ultimoIntentoUTC']=hsNow();
            }
            hsWrite('egresos_estado.json',$state);
        }
        foreach(array_diff(array_keys($state['archivos']),array_keys($sources)) as $year){
            $state['archivos'][$year]['error']='Archivo anual retirado de RELACION DE PAGOS.';
            foreach($state['archivos'][$year]['meses']??[] as $m){
                $state['meses'][$m]['cacheDisponible']=false;
                $state['meses'][$m]['estado']='no_disponible';
            }
        }
        $state['verificadoUTC']=hsNow();
        $state['error']=null;
        hsWrite('egresos_estado.json',$state);
        $run['excelDescargado']=$downloads>0;
        $run['estado']=$run['errores']?'parcial':($downloads?'actualizado':'sin_cambios');
        return $run;
    }catch(Throwable $e){
        $state['error']=$e->getMessage();
        $state['faseError']='catalogo_o_autenticacion';
        $state['ultimoIntentoUTC']=hsNow();
        hsWrite('egresos_estado.json',$state);
        $run['estado']='error';$run['error']=$e->getMessage();
        return $run;
    }finally{
        $run['finUTC']=hsNow();
        $run['segundos']=round(microtime(true)-$started,2);
        $run['memoriaMaxBytes']=memory_get_peak_usage(true);
        $path=HS_DIR.'/egresos_ciclos.jsonl';
        if(is_file($path)&&filesize($path)>2000000){
            $lines=file($path,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES);
            file_put_contents($path,implode("\n",array_slice($lines,-500))."\n",LOCK_EX);
        }
        file_put_contents($path,json_encode($run,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n",FILE_APPEND|LOCK_EX);
        chmod($path,0600);
        flock($lock,LOCK_UN);fclose($lock);
    }
}
function egManifest():array {
    $s=hsRead('egresos_estado.json',['meses'=>[],'archivos'=>[]]);
    $old=!empty($s['error'])||time()-strtotime($s['verificadoUTC']??'1970-01-01')>1200;
    foreach($s['meses']??[] as $key=>$m){
        $year=substr((string)$key,0,4);
        $a=$s['archivos'][$year]??[];
        $aOld=!empty($a['error'])||time()-strtotime($a['verificadoUTC']??'1970-01-01')>1200;
        $s['meses'][$key]['antigua']=$old||$aOld||!empty($m['error'])||
            str_starts_with((string)($m['estado']??''),'ultima_validada');
    }
    return array_merge($s,[
        'fuente'=>'EXCEL_ORIGINAL_EGRESOS','biEgresos'=>false,
        'build'=>EG_BUILD,'servidorUTC'=>hsNow(),'puedeActualizar'=>true
    ]);
}
