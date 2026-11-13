"use strict";
const fs=require("node:fs");
const vm=require("node:vm");
const assert=require("node:assert/strict");
const script=fs.readFileSync("cpanel-preview-20261105/dashboard-egresos-preview/ventas-excel.js","utf8");
const months=Array.from({length:12},(_,i)=>"2026-"+String(i+1).padStart(2,"0"));
const manifest={
 validado:true,fuente:"EXCEL_ORIGINAL_VENTAS",biVentas:false,
 fuenteMetas:"METAS",soloLectura:true,version:"f".repeat(64),
 verificadoUTC:"2026-11-13T18:00:00Z",
 meses:Object.fromEntries(months.map(m=>[m,{cacheDisponible:true,
  auditoria:{validado:true,diferenciaCentavos:0},metaDisponible:true,metaCentavos:75000000,asesoresSinMeta:0}]))
};
const detail=m=>({
 validado:true,fuente:"EXCEL_ORIGINAL_VENTAS",noSumarContratos:true,mes:m,
 version:manifest.version,metaCentavos:75000000,
 auditoria:{validado:true,registros:1,ventasCentavos:4200,semanasCentavos:4200,diferenciaCentavos:0},
 contratosUnicosNoRepetidos:1,
 ventas:[{id:"VENTAS_XLSX|"+m,mes:m,asesor:"ASESOR TEST",
  montoVenta:42,metaMensual:750000,fuente:"Ventas 2026",
  tipoRegistro:"Mensual",fuenteOrigen:"excel_original_ventas"}],
 contratos:[{id:"CONTRATO_XLSX|"+m,mes:m,fuente:"CONTRATOS",
  fuenteOrigen:"excel_original_contratos",montoVenta:null,total:null,
  aportaTotalComercial:false,importeContrato:1000}]
});
const ctx=vm.createContext({window:{},Map,Set,Number,Array,Date,URLSearchParams,
 fetch:async url=>({
  ok:true,json:async()=>{
   if(url.includes("modo=manifest"))return manifest;
   return detail(decodeURIComponent(url.split("mes=")[1]));
  }
 })
});
vm.runInContext(script,ctx,{timeout:1200});
(async()=>{
 const rows=await ctx.cargarVentasExcelOriginal();
 assert.equal(rows.length,24,"Sales and contracts remain separate");
 assert.equal(rows.filter(r=>r.fuente==="Ventas 2026").length,12);
 assert.equal(rows.filter(r=>r.fuente==="CONTRATOS").length,12);
 assert.equal(ctx.metasVentasExcelPeriodo("2026-11"),750000);
 assert.equal(ctx.metasVentasExcelPeriodo(["2026-10","2026-11"]),1500000);
 assert.equal(ctx.window.ventasExcelEstado.error,null);
 // January can contain a genuine reconciliation gap; November must remain
 // readable independently, without hiding January's exception.
 manifest.meses["2026-01"].cacheDisponible=false;
 const selected=await ctx.cargarVentasExcelOriginal(["2026-11"]);
 assert.equal(selected.length,2);
 assert.equal(selected[0].mes,"2026-11");
 await assert.rejects(ctx.cargarVentasExcelOriginal(),/enero|2026-01|conciliado/i);
 manifest.meses["2026-01"].cacheDisponible=true;
 const historical=detail("2026-03");
 historical.auditoria.semanasCentavos=419800;
 historical.auditoria.diferenciaCentavos=2200;
 assert.equal(ctx.validacionVentasExcelDetalle(historical,manifest,"2026-03").length,2,
   "Preserve column-G totals when historic weekly variance is fully disclosed");
 const dishonest=detail("2026-03");
 dishonest.auditoria.semanasCentavos=419800;
 dishonest.auditoria.diferenciaCentavos=0;
 assert.throws(()=>ctx.validacionVentasExcelDetalle(dishonest,manifest,"2026-03"),
   /columna G/,"Reject mismatched arithmetic not disclosed");
 const bad=detail("2026-11");
 bad.ventas[0].montoVenta=43;
 assert.throws(()=>ctx.validacionVentasExcelDetalle(bad,manifest,"2026-11"),/conciliado/);
 const additive=detail("2026-11");
 additive.contratos[0].montoVenta=1000;
 assert.throws(()=>ctx.validacionVentasExcelDetalle(additive,manifest,"2026-11"),/Contrato/);
 const missing=detail("2026-11");
 missing.contratos=[];
 assert.throws(()=>ctx.validacionVentasExcelDetalle(missing,manifest,"2026-11"),/Conteo/);
 ctx.window.ventasExcelEstado.meses["2026-11"].metaDisponible=false;
 assert.ok(Number.isNaN(ctx.metasVentasExcelPeriodo("2026-11")));
 console.log("PASS sales Excel QA: isolated monthly totals, contract safety and metas");
})().catch(err=>{console.error(err);process.exitCode=1});
