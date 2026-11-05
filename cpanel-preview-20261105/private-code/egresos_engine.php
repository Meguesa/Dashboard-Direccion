<?php
declare(strict_types=1);
const EG_DRIVE='b!pHgaPmk0u0eem993tNXPdXDnY1ILcuZGv2EfFdV9rplPAV4rL4C_QoZl8LbKac5c';
const EG_ITEM='01RNEUMM5KTKQB3IT6ZRCKPSD3ZUN7ICFV';
const EG_YEAR='2026';
const EG_BUILD='20261105-egresos-1';
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
function egAudit(string $file):array {
    $zip=new ZipArchive();if($zip->open($file)!==true)throw new RuntimeException('Excel no válido.');
    try{$strings=readStrings($zip);$book=readXml($zip,'xl/workbook.xml');$names=[];foreach($book->getElementsByTagName('sheet') as $sheet)$names[]=$sheet->getAttribute('name');
        $months=[];$monthNames=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];$extra=[];
        foreach($names as $sheet){$number=null;foreach($monthNames as $i=>$label)if($sheet===$label.' '.EG_YEAR)$number=$i+1;if($number===null){$extra[]=$sheet;continue;}
            $month=EG_YEAR.'-'.str_pad((string)$number,2,'0',STR_PAD_LEFT);$table=egTable($zip,$sheet);$headers=[];$rows=[];$sum=['importe'=>0,'pagado'=>0,'porPagar'=>0];$warnings=[];$errors=[];$fields=[];$filteredSubtotal=null;
            foreach(hsRows($zip,$sheet,$strings) as [$ri,$v,$f]){
                if($ri===$table['encabezado']){foreach($v as $col=>$label)$headers[hsText($label)]=$col;
                    foreach(['fecha'=>'FECHA','banco'=>'BANCO','tipoPago'=>'TIPO DE PAGO','empresa'=>'EMPRESA','rubro'=>'RUBRO','tipoGasto'=>'TIPO DE GASTO','beneficiario'=>'BENEFICIARIO','concepto'=>'CONCEPTO','importe'=>'IMPORTE','porPagar'=>'POR PAGAR','pagado'=>'PAGADO','tipoMov'=>'TIPO MOV','fechaPago'=>'FECHA PAGO'] as $key=>$label){if(!array_key_exists($label,$headers))throw new RuntimeException('Falta columna '.$label.' en '.$sheet);$fields[$key]=$headers[$label];}continue;}
                if($ri<=$table['encabezado'])continue;
                if($ri>$table['fin']){if($ri===$table['fin']+1)$filteredSubtotal=['fila'=>$ri,'importe'=>$v[$fields['importe']]??null,'porPagar'=>$v[$fields['porPagar']]??null,'pagado'=>$v[$fields['pagado']]??null];break;}
                $benef=trim((string)($v[$fields['beneficiario']]??''));$concept=trim((string)($v[$fields['concepto']]??''));
                if($benef===''&&$concept===''){foreach(['importe','pagado','porPagar'] as $key)if(isset($v[$fields[$key]])&&trim((string)$v[$fields[$key]])!==''&&egUnits($v[$fields[$key]])!==0)$errors[]=['fila'=>$ri,'motivo'=>'Importe sin beneficiario o concepto'];continue;}
                $row=['id'=>'EXCEL-EGRESOS|'.$sheet.'|'.$ri,'mes'=>$month,'mesHoja'=>$month,'hojaOrigen'=>$sheet,'filaOrigen'=>$ri,'claveRegistro'=>'EGRESOS|'.$sheet.'|'.$ri,'fuenteOrigen'=>'excel_original_egresos','fuente'=>'RELACION DE PAGOS '.EG_YEAR.'.xlsx'];
                foreach(['banco','tipoPago','empresa','rubro','tipoGasto','tipoMov'] as $key)$row[$key]=trim((string)($v[$fields[$key]]??''));$row['beneficiario']=$benef;$row['concepto']=$concept;$row['contexto']=$concept;
                foreach(['fecha','fechaPago'] as $key){$raw=$v[$fields[$key]]??null;$row[$key.'Original']=$raw;$row[$key]=hsDate($raw);if(!$row[$key]&&($key==='fecha'||trim((string)$raw)!==''))$warnings[]=['fila'=>$ri,'tipo'=>'fecha','campo'=>$key];}
                try{foreach(['importe','pagado','porPagar'] as $key){$raw=$v[$fields[$key]]??null;$units=egUnits($raw);$row[$key.'Micros']=$units;$row[$key]=$units/1000000;$row[$key.'Original']=$raw;$sum[$key]+=$units;}}
                catch(Throwable $e){$errors[]=['fila'=>$ri,'motivo'=>'Importe no numérico'];continue;}
                $difference=$row['importeMicros']-$row['pagadoMicros']-$row['porPagarMicros'];if(abs($difference)>11000)$warnings[]=['fila'=>$ri,'tipo'=>'descuadre_origen','diferenciaMicros'=>$difference];
                $row['estatus']=$row['porPagarMicros']>0?($row['pagadoMicros']>0?'Parcial':'Por pagar'):($row['pagadoMicros']>0?'Pagado':'Sin pago registrado');$rows[]=$row;
            }
            $check=['importe'=>0,'pagado'=>0,'porPagar'=>0];$ids=[];foreach($rows as $row){if(isset($ids[$row['claveRegistro']]))$errors[]=['motivo'=>'Clave duplicada'];$ids[$row['claveRegistro']]=true;foreach(array_keys($check) as $key)$check[$key]+=$row[$key.'Micros'];}if($check!==$sum)$errors[]=['motivo'=>'No coinciden totales del detalle'];
            $audit=['validado'=>!$errors,'registros'=>count($rows),'totalesMicros'=>$sum,'totales'=>array_map(fn($v)=>$v/1000000,$sum),'tablaOrigen'=>$table,'control'=>'TABLA_COMPLETA_SIN_FILTROS','subtotalVisibleExcel'=>$filteredSubtotal,'advertencias'=>$warnings,'errores'=>$errors];
            $months[$month]=['mes'=>$month,'auditoria'=>$audit,'movimientos'=>$rows,'hashContenido'=>hash('sha256',json_encode($rows,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR))];
        }if(!$months)throw new RuntimeException('No hay hojas mensuales de '.EG_YEAR);ksort($months);return ['meses'=>$months,'hojasAuxiliaresNoSumadas'=>$extra];
    }finally{$zip->close();}
}
function egCacheName(string $month):string {if(!preg_match('/^2026-(0[1-9]|1[0-2])$/D',$month))throw new RuntimeException('Mes no válido.');return 'cache_excel_egresos_'.$month.'.json';}
function egRun(bool $force=false):array {
    @set_time_limit(180);$lock=fopen(HS_DIR.'/egresos.lock','c');if(!$lock||!flock($lock,LOCK_EX|LOCK_NB))return ['estado'=>'ocupado'];$download=null;$phase='autenticacion';$run=['inicioUTC'=>hsNow(),'build'=>EG_BUILD,'meses'=>[]];$state=hsRead('egresos_estado.json',['meses'=>[]]);
    try{$token=hsToken();$claims=json_decode((string)base64_decode(strtr(explode('.',$token)[1]??'','-_','+/')),true);$state['aplicacion']=['clientId'=>JJP_PORTAL_CLIENT_ID,'permisos'=>$claims['roles']??[]];$phase='metadatos_finanzas';$meta=hsRemoteJson(EG_DRIVE,'/items/'.EG_ITEM,$token);$etag=(string)($meta['eTag']??'');if($etag==='')throw new RuntimeException('Falta eTag.');
        if(!$force&&($state['excel']['etag']??'')===$etag&&empty($state['nuevaVersionPendiente'])&&count($state['meses']??[])){$state['verificadoUTC']=hsNow();$state['error']=null;hsWrite('egresos_estado.json',$state);$run['excelDescargado']=false;$run['estado']='sin_cambios';return $run;}
        $phase='descarga_guardada';$download=hsSnapshotDownload(EG_DRIVE,$meta,$token);if($download['metodo']==='version_guardada_tras_reintentos'&&!empty($state['meses']))throw new RuntimeException('Se conserva la última caché validada; la lectura actual sigue pendiente.');$phase='lectura_tablas';$book=egAudit($download['temporal']);$phase='verificacion_etag_final';$after=hsRemoteJson(EG_DRIVE,'/items/'.EG_ITEM.'?$select=id,eTag,cTag',$token);
        $state['excel']=['nombre'=>$meta['name'],'id'=>EG_ITEM,'etag'=>$etag,'versionLeida'=>$download['version'],'metodoLectura'=>$download['metodo'],'fechaDatosUTC'=>$download['fechaDatosUTC'],'sha256'=>$download['sha256'],'tamanoBytes'=>$download['tamanoBytes']];$state['nuevaVersionPendiente']=!empty($download['nuevaVersionPendiente'])||($after['eTag']??null)!==$etag;$state['verificadoUTC']=hsNow();$state['error']=null;$state['hojasAuxiliaresNoSumadas']=$book['hojasAuxiliaresNoSumadas'];
        foreach(array_diff(array_keys($state['meses']??[]),array_keys($book['meses'])) as $missing){$state['meses'][$missing]['estado']='ultima_validada_con_incidencia';$state['meses'][$missing]['error']='La hoja mensual ya no existe en el archivo guardado.';}
        foreach($book['meses'] as $month=>$data){$old=hsRead(egCacheName($month));$valid=$data['auditoria']['validado'];$s=['mes'=>$month,'cacheDisponible'=>$valid||!empty($old['auditoria']['validado']),'estado'=>$valid?'validado':(!empty($old['auditoria']['validado'])?'ultima_validada_con_incidencia':'no_disponible'),'hashContenido'=>$data['hashContenido'],'auditoria'=>$data['auditoria'],'verificadoUTC'=>hsNow(),'generadoUTC'=>$old['generadoUTC']??null];
            if($valid&&($old['hashContenido']??null)!==$data['hashContenido']){$s['generadoUTC']=hsNow();hsWrite(egCacheName($month),['version'=>1,'build'=>EG_BUILD,'mes'=>$month,'generadoUTC'=>$s['generadoUTC'],'verificadoUTC'=>hsNow(),'excel'=>$state['excel'],'hashContenido'=>$data['hashContenido'],'auditoria'=>$data['auditoria'],'movimientos'=>$data['movimientos']]);}
            $state['meses'][$month]=$s;$run['meses'][$month]=['registros'=>$s['auditoria']['registros'],'totales'=>$s['auditoria']['totales'],'estado'=>$s['estado'],'advertencias'=>count($s['auditoria']['advertencias'])];
        }hsWrite('egresos_estado.json',$state);$run['excelDescargado']=true;$run['estado']='actualizado';return $run;
    }catch(Throwable $e){$state['error']=$e->getMessage();$state['faseError']=$phase;$state['ultimoIntentoUTC']=hsNow();hsWrite('egresos_estado.json',$state);$run['estado']='error';$run['error']=$e->getMessage();$run['faseError']=$phase;$run['aplicacion']=$state['aplicacion']??null;return $run;}
    finally{if($download)@unlink($download['temporal']);$run['finUTC']=hsNow();$run['memoriaMaxBytes']=memory_get_peak_usage(true);$path=HS_DIR.'/egresos_ciclos.jsonl';if(is_file($path)&&filesize($path)>2000000){$lines=file($path,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES);file_put_contents($path,implode("\n",array_slice($lines,-500))."\n",LOCK_EX);}
        file_put_contents($path,json_encode($run,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)."\n",FILE_APPEND|LOCK_EX);chmod($path,0600);flock($lock,LOCK_UN);fclose($lock);}
}
function egManifest():array {
    $s=hsRead('egresos_estado.json',['meses'=>[]]);$old=!empty($s['error'])||!empty($s['nuevaVersionPendiente'])||time()-strtotime($s['verificadoUTC']??'1970-01-01')>1200;
    foreach($s['meses'] as &$month)$month['antigua']=$old||!empty($month['error'])||str_starts_with((string)($month['estado']??''),'ultima_validada');unset($month);return array_merge($s,['fuente'=>'EXCEL_ORIGINAL_EGRESOS','biEgresos'=>false,'build'=>EG_BUILD,'servidorUTC'=>hsNow(),'puedeActualizar'=>true]);
}
