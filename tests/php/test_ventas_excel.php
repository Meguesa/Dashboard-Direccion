<?php
declare(strict_types=1);
require_once __DIR__.'/../../cpanel-preview-20261105/private-code/ventas_engine.php';
$base=$argv[1]??'ventas-qa-fixtures';
function qaAssert(bool $yes,string $label):void{
    if(!$yes){fwrite(STDERR,"FAIL: $label\n");exit(1);}
    echo "PASS: $label\n";
}
qaAssert(veMes('Noviembre')==='2026-11','Monthly period');
qaAssert(veNumeroUnidades("\u{00A0}")===0.0,'Original NBSP cell is an empty unit');
qaAssert(veNumeroUnidades("\u{202F}")===0.0,'Narrow NBSP is an empty unit');
qaAssert(veNumeroUnidades("\u{00A0}2\u{00A0}")===2.0,'Units surrounded by NBSP are numeric');
try{veNumeroUnidades('DESCONOCIDO');qaAssert(false,'Bad units must fail');}
catch(RuntimeException $e){qaAssert(true,'Non-empty bad units still cause error');}
qaAssert(veMes('Noviembre 2025')==='2025-11','Explicit year remains accurate');
qaAssert(veClaveAsesor('MARÍA-LUISA')===veClaveAsesor('Maria Luisa'),'Advisor normalization');
qaAssert(veClaveMetaAsesor('Griscelda')===veClaveMetaAsesor('Griselda'),
    'Verified spelling variant of November advisor resolves to same goal');
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
qaAssert(abs((float)$rows[0]['metaMensual']-700.0)<0.001,'Personal goal from METAS');
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
$manual=veAuditVentas($base.'/ventas-metas-manuales-2026.xlsx');
qaAssert($manual['metas']['totalesCentavos']['2026-11']===40000000,
    'New manual November goals read exclusively from METAS C');
qaAssert($manual['metas']['registrosPorMes']['2026-11']===2,
    'Blank individual target and subtotal do not count');
qaAssert($manual['meses']['2026-11']['asesoresSinMeta']===1,
    'Unknown Ivette goal remains missing and distinct from zero');
qaAssert(!isset($manual['metas']['totalesCentavos']['2026-01']),
    'Ambiguous old January block never silently assumed to be 2026');
qaAssert(count(array_filter($manual['metas']['incidencias'],
    fn($i)=>($i['codigo']??'')==='ENERO_2026_SIN_ANCLA_CONFIRMADA'))===1,
    'January missing year anchor is flagged');
qaAssert($manual['metas']['totalesCentavos']['2026-02']===40000000,
    'Old historic February goals never override current series');
$manualRows=veLeerRegistrosComercial($base.'/ventas-metas-manuales-2026.xlsx');
$manualMap=[];foreach($manualRows as $r)$manualMap[veClaveAsesor($r['asesor'])]=$r;
qaAssert(abs((float)$manualMap['ALEXIS NUEVO']['metaMensual']-200000.0)<0.001,
    'ALEXIS(NUEVO) corresponds to unique ALEXIS manual goal');
qaAssert(abs((float)$manualMap['MA ELENA NUEVA']['metaMensual']-200000.0)<0.001,
    'MA ELENA(NUEVA) corresponds to unique MA ELENA manual goal');
qaAssert($manualMap['IVETTE']['metaMensual']===null,
    'Missing goal is never inferred from helpers');
$contracts=veAuditContratos($base.'/contratos-ok.xlsx');
qaAssert($contracts['origen']==='HOJAS_ORIGINALES_CONTRATOS','Contract source is original sheets');
qaAssert($contracts['registrosCandidatos']===3,'Reads original contract rows only');
qaAssert($contracts['repeticionesDetectadas']===0,'No duplicates in normal fixture');
qaAssert($contracts['porMes']['2026-11']['porHoja']['LOTES']===1,'Lotes date correctly parsed');
qaAssert($contracts['porMes']['2026-11']['porHoja']['CHURUBUSCO']===1,'Churubusco date correctly parsed');
qaAssert($contracts['porMes']['2026-11']['porHoja']['AGUA FRIA']===1,'Agua Fria date correctly parsed');
$duplicateContracts=veAuditContratos($base.'/contratos-duplicado.xlsx');
qaAssert($duplicateContracts['repeticionesDetectadas']===1,'Original contract duplicate detected');
$poison=veAuditContratos($base.'/contratos-dashboard-contaminado.xlsx');
qaAssert($poison['registrosCandidatos']===3,'Generated contract worksheet cannot change real totals');
qaAssert($poison['clavesUnicas']===3,'Generated sheet cannot create an original contract');
qaAssert(veFechaContratoOriginal([26=>2,27=>'Noviembre',28=>2026])['fecha']==='2026-11-02','Date AA:AC');
qaAssert(veFechaContratoOriginal([28=>2,29=>'Noviembre',30=>2026])['fecha']==='2026-11-02','Date AC:AE');

$monthly=veLeerContratosOriginales($base.'/contratos-ok.xlsx','2026-11');
qaAssert(count($monthly)===3,'One detail record per original contract');
qaAssert(count(array_filter($monthly,fn($r)=>$r['aportaTotalComercial']!==false))===0,
    'No contract adds to commercial total');
qaAssert(count(array_filter($monthly,fn($r)=>$r['ventaVigenteConfirmada']!==false))===0,
    'Absence of cancellation is not proof of active contract');
qaAssert(abs((float)$monthly[0]['importeContrato']-100.0)<0.001,'Contract face value retained separately');
qaAssert(count(veLeerContratosAnio($base.'/contratos-ok.xlsx'))===3,
    'Annual private snapshot reads all three nonduplicate source records');
qaAssert($monthly[0]['montoVenta']===null && $monthly[0]['total']===null,
    'No contract amount leaked to sales aggregation fields');
$cross=veConciliarFuentesOriginales($good,$contracts);
qaAssert($cross['sumarAmbasFuentes']===false && $cross['prohibidoSumaComercialMasContratos'],
    'Sources are compared, never added');
qaAssert($cross['meses']['2026-11']['ventasComercialCentavos']===20030,
    'Only monthly Commercial G is the sales KPI');
qaAssert($cross['meses']['2026-11']['importeNominalContratosCentavos']===30000,
    'Contract face value is a separate diagnostic amount');
qaAssert($cross['meses']['2026-11']['contratosCandidatos']===3,
    'Contract detail counts not mixed with sales rows');
qaAssert($cross['meses']['2026-11']['contratosUnicosNoRepetidos']===3,
    'Nonduplicate count is separate from raw candidates');
qaAssert($cross['meses']['2026-11']['importeNominalSinRepetidosCentavos']===30000,
    'Unique face amount is diagnostic, not part of Commercial sales');
qaAssert($duplicateContracts['repeticionesIdenticas']===1,
    'Identical repeated contract detected without double counting');
qaAssert(count(veLeerContratosOriginales($base.'/contratos-duplicado.xlsx','2026-11'))===2,
    'Repeated contract key excluded completely, not retained once');
qaAssert($duplicateContracts['gruposRepetidosIgnorados']===1,
    'One duplicate contract group ignored');
qaAssert($duplicateContracts['filasRepetidasIgnoradas']===2,
    'Both rows of duplicate contract ignored');
$conf=veAuditContratos($base.'/contratos-conflicto.xlsx');
qaAssert($conf['gruposConDatosConflictivos']===1,
    'Same contract key with divergent face value requires review');
$confRows=veLeerContratosOriginales($base.'/contratos-conflicto.xlsx','2026-11');
qaAssert(count($confRows)===2,'Conflicting repeated contract group excluded');
qaAssert(count(array_filter($confRows,fn($r)=>$r['hojaOrigen']==='LOTES'))===0,
    'No value chosen arbitrarily for conflicting key');
$cancel=veAuditContratos($base.'/contratos-cancelado.xlsx');
qaAssert($cancel['cancelacionesExplicitas']===1,'Explicit cancellation found');
$cancelRows=veLeerContratosOriginales($base.'/contratos-cancelado.xlsx','2026-11');
qaAssert(count(array_filter($cancelRows,fn($r)=>$r['estadoFuente']==='CANCELACION_EXPLICITA'))===1,
    'Cancelled contract not presented as normal sale');

echo "SOURCE_ONLY_TESTS_PASSED\n";
