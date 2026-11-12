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
$a=veAuditVentas($base.'/ventas-ok.xlsx');
qaAssert($a['registrosValidos']===3,'All commercial test rows');
qaAssert($a['tipos']['SEMANAL']===2&&$a['tipos']['MENSUAL']===1,'Separate monthly and weekly');
qaAssert($a['meses']['2026-11']['semanalCentavos']===20030,'Cents weekly');
qaAssert($a['meses']['2026-11']['mensualCentavos']===20030,'Cents monthly');
qaAssert($a['meses']['2026-11']['metasMensualesCentavos']===70000,'Goals monthly only');
qaAssert($a['listoParaActivar']===true,'Balanced fixture passes');
qaAssert($a['metasTablaIndependiente']['metasCentavos']['2026-11']===70000,'Separate goals table reconciles');
$a=veAuditVentas($base.'/ventas-meta-diferencia.xlsx');
qaAssert(count($a['diferenciasMetas'])===1&&!$a['listoParaActivar'],'Goal inconsistency blocks cutover');
$a=veAuditVentas($base.'/ventas-duplicado.xlsx');
qaAssert($a['clavesDuplicadas']===1&&!$a['listoParaActivar'],'Duplicate sale blocks cutover');
$a=veAuditVentas($base.'/ventas-diferencia.xlsx');
qaAssert(count($a['descuadresSemanalMensual'])===1&&!$a['listoParaActivar'],'Difference blocks cutover');
$b=veAuditContratos($base.'/contratos-ok.xlsx');
qaAssert($b['registrosAuxiliares']===2&&$b['clavesDuplicadas']===0,'Contract summary scanned');
qaAssert(count($b['origenesPresentes'])===3,'Three source sheets checked');
qaAssert(!$b['listoParaActivar'],'Cannot cut over from auxiliary contract table');
$b=veAuditContratos($base.'/contratos-duplicado.xlsx');
qaAssert($b['clavesDuplicadas']===1,'Contract duplicate detected');
qaAssert(veFuentes()['comercial']['drive']!==veFuentes()['contratos']['drive'],'Different authorized drives');
echo "SYNTHETIC_TESTS_PASSED\n";
