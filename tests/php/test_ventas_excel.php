<?php
declare(strict_types=1);
require_once __DIR__.'/../../cpanel-preview-20261105/private-code/ventas_engine.php';
$base=$argv[1]??'ventas-qa-fixtures';
function qaAssert(bool $yes,string $label):void{
    if(!$yes){fwrite(STDERR,"FAIL: $label\n");exit(1);}
    echo "PASS: $label\n";
}
qaAssert(veMes('Noviembre')==='2026-11','Monthly period');
qaAssert(veMes('Noviembre 2025')==='2025-11','Explicit year remains accurate');
qaAssert(veClaveAsesor('MARÍA-LUISA')===veClaveAsesor('Maria Luisa'),'Advisor normalization');
$good=veAuditVentas($base.'/ventas-ok.xlsx');
qaAssert($good['fuentes']===['meses_originales','METAS'],'Only manual worksheets are official');
qaAssert($good['registros']===1,'One monthly row; no weekly double count');
qaAssert($good['meses']['2026-11']['ventasCentavos']===20030,'Monthly totals from G');
qaAssert($good['meses']['2026-11']['semanasCentavos']===20030,'Weeks B-F reconcile');
qaAssert($good['metas']['fuente']==='METAS','Targets exclusively from METAS');
qaAssert($good['metas']['totalesCentavos']['2026-11']===70000,'Goal comes from C of METAS');
qaAssert($good['meses']['2026-11']['metaDisponible']===true,'Goal availability true');
qaAssert(!array_key_exists('2026-10',$good['metas']['totalesCentavos']),'No invented goal for other month');
$rows=veLeerRegistrosComercial($base.'/ventas-ok.xlsx');
qaAssert(count($rows)===1,'One seller in normalized records');
qaAssert($rows[0]['metaMensual']===700.0,'Personal goal from METAS');
qaAssert($rows[0]['montoVenta']===200.30,'Sales amount from source monthly row');
qaAssert($rows[0]['tipoRegistro']==='Mensual','Single granularity');
$diff=veAuditVentas($base.'/ventas-diferencia.xlsx');
qaAssert($diff['meses']['2026-11']['diferenciaCentavos']===100,'Weekly difference detected');
qaAssert($diff['meses']['2026-11']['asesoresConDiferenciaSemanal']===1,'Seller difference detected');
$duplicates=veAuditVentas($base.'/ventas-duplicado.xlsx');
qaAssert(count($duplicates['incidencias'])>=1,'Duplicate advisor blocked');
$missing=veAuditVentas($base.'/ventas-meta-no-disponible.xlsx');
qaAssert($missing['meses']['2026-11']['metaDisponible']===false,'Absent goal is absent, not zero');
qaAssert($missing['meses']['2026-11']['asesoresSinMeta']===1,'Missing advisor target indicated');
$contracts=veAuditContratos($base.'/contratos-ok.xlsx');
qaAssert($contracts['origen']==='HOJAS_ORIGINALES_CONTRATOS','Contract source is original sheets');
qaAssert($contracts['registrosCandidatos']===3,'Reads original contract rows only');
qaAssert($contracts['clavesDuplicadas']===0,'No duplicates in normal fixture');
qaAssert($contracts['porMes']['2026-11']['LOTES']===1,'Lotes date correctly parsed');
qaAssert($contracts['porMes']['2026-11']['CHURUBUSCO']===1,'Churubusco date correctly parsed');
qaAssert($contracts['porMes']['2026-11']['AGUA FRIA']===1,'Agua Fria date correctly parsed');
$duplicateContracts=veAuditContratos($base.'/contratos-duplicado.xlsx');
qaAssert($duplicateContracts['clavesDuplicadas']===1,'Original contract duplicate detected');
$poison=veAuditContratos($base.'/contratos-dashboard-contaminado.xlsx');
qaAssert($poison['registrosCandidatos']===3,'Generated contract worksheet cannot change real totals');
qaAssert($poison['clavesUnicas']===3,'Generated sheet cannot create an original contract');
qaAssert(veFechaContratoOriginal([26=>2,27=>'Noviembre',28=>2026])['fecha']==='2026-11-02','Date AA:AC');
qaAssert(veFechaContratoOriginal([28=>2,29=>'Noviembre',30=>2026])['fecha']==='2026-11-02','Date AC:AE');
echo "SOURCE_ONLY_TESTS_PASSED\n";
