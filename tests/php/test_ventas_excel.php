<?php
declare(strict_types=1);
require_once __DIR__.'/../../cpanel-preview-20261105/private-code/ventas_engine.php';
$base=$argv[1]??'ventas-qa-fixtures';
function qaAssert(bool $passed,string $label):void{
    if(!$passed){fwrite(STDERR,"FAIL: $label\n");exit(1);}
    echo "PASS: $label\n";
}
qaAssert(veMes('NOVIEMBRE')==='2026-11','Month normalization');
qaAssert(veMes('2026-11')==='2026-11','ISO month parsing');
qaAssert(veMes('Noviembre 2025')==='2025-11','Explicit year must not use current year');
qaAssert(veClaveAsesor(' MARÍA-LUISA ')===veClaveAsesor('Maria Luisa'),'Advisor accents normalize');
$a=veAuditVentas($base.'/ventas-ok.xlsx');
qaAssert($a['registrosValidos']===3,'All commercial test rows');
qaAssert($a['tipos']['SEMANAL']===2&&$a['tipos']['MENSUAL']===1,'Separate monthly and weekly');
qaAssert($a['meses']['2026-11']['semanalCentavos']===20030,'Cents weekly');
qaAssert($a['meses']['2026-11']['mensualCentavos']===20030,'Cents monthly');
qaAssert($a['meses']['2026-11']['metasMensualesCentavos']===70000,'Goals monthly only');
$normalized=veLeerRegistrosComercial($base.'/ventas-ok.xlsx');
qaAssert(count($normalized)===3,'All three normalized rows');
qaAssert(count(array_filter($normalized,fn($row)=>$row['tipoRegistro']==='Mensual'))===1,'No duplication of monthly granularity');
qaAssert(abs($normalized[0]['montoVenta']-120.10)<0.001,'Decimal preserved in records');
qaAssert($normalized[0]['fuenteOrigen']==='excel_original_ventas','Source provenance present');
qaAssert($a['listoParaActivar']===true,'Balanced fixture passes');
$a=veAuditVentas($base.'/ventas-cruce-asesores.xlsx');
qaAssert(count($a['descuadresSemanalMensual'])===0,'The global sales amount matches');
qaAssert($a['descuadresPorAsesor'][0]['asesoresConDiferencia']===2,'Both advisors detected despite net zero');
qaAssert(!$a['listoParaActivar'],'Offsetting advisor errors block activation');
qaAssert($a['metasTablaIndependiente']['metasCentavos']['2026-11']===70000,'Separate goals table reconciles');
$a=veAuditVentas($base.'/ventas-meta-diferencia.xlsx');
qaAssert(count($a['diferenciasMetas'])===1&&!$a['listoParaActivar'],'Goal inconsistency blocks cutover');
qaAssert($a['diferenciasMetaPorAsesor'][0]['asesoresConDiferencia']===1,'Advisor target discrepancy detected');
$a=veAuditVentas($base.'/ventas-duplicado.xlsx');
qaAssert($a['clavesDuplicadas']===1&&!$a['listoParaActivar'],'Duplicate sale blocks cutover');
$a=veAuditVentas($base.'/ventas-diferencia.xlsx');
qaAssert(count($a['descuadresSemanalMensual'])===1&&!$a['listoParaActivar'],'Difference blocks cutover');
$b=veAuditContratos($base.'/contratos-ok.xlsx');
qaAssert($b['registrosAuxiliares']===2&&$b['clavesDuplicadas']===0,'Contract summary scanned');
$c=veAuditContratos($base.'/contratos-cambio-clave.xlsx');
qaAssert(($c['conciliacionOriginalVsAuxiliar']['sinCorrespondenciaPorCausa']['NUMERO_DISTINTO']??0)===1,
  'An altered contract number is classified without guessing a replacement');
qaAssert(count($b['origenesPresentes'])===3,'Three source sheets checked');
qaAssert(!$b['listoParaActivar'],'Cannot cut over from auxiliary contract table');
$b=veAuditContratos($base.'/contratos-duplicado.xlsx');
qaAssert($b['clavesDuplicadas']===1,'Contract duplicate detected');
qaAssert($b['conciliacionOriginalVsAuxiliar']['correspondenciaAmbigua']===2,'Duplicated source keys cause ambiguity, not double counting');
qaAssert($b['conciliacionOriginalVsAuxiliar']['coincidenciasUnicas']===1,'Unique contracts reconcile even if another source record is repeated');
qaAssert($b['conciliacionOriginalVsAuxiliar']['importesConciliados']===1,'Amount is verified only for unique keys');
qaAssert($b['conciliacionOriginalVsAuxiliar']['fechasConciliadas']===1,'Date is verified only for unique keys');
qaAssert(veFechaContratoOriginal([26=>2,27=>'Noviembre',28=>2026])['fecha']==='2026-11-02','Date from AA:AC');
qaAssert(veFechaContratoOriginal([28=>2,29=>'Noviembre',30=>2026])['fecha']==='2026-11-02','Date from AC:AE');
qaAssert(veFuentes()['comercial']['drive']!==veFuentes()['contratos']['drive'],'Different authorized drives');
echo "SYNTHETIC_TESTS_PASSED\n";
