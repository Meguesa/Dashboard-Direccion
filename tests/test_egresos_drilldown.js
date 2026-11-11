'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const files=['app.js','cpanel-preview-20261105/dashboard-egresos-preview/app.js'];
const sample=[
 {mesHoja:'2026-11',tipoGasto:'PASS',rubro:'ACCIONISTAS',beneficiario:'MARIA',pagado:48000,porPagar:0},
 {mesHoja:'2026-11',tipoGasto:'PASS',rubro:'FINANCIAMIENTO',beneficiario:'GNI',pagado:0,porPagar:94871.5},
 {mesHoja:'2026-11',tipoGasto:'PASS',rubro:'FINANCIAMIENTO',beneficiario:'GNI',pagado:0,porPagar:12250},
 {mesHoja:'2026-11',tipoGasto:'PASS',rubro:'PRESTAMO',beneficiario:'JDJP',pagado:0,porPagar:78000},
 {mesHoja:'2026-11',tipoGasto:'PASS',rubro:'PRESTAMO',beneficiario:'JDJP',pagado:0,porPagar:50216.4},
 {mesHoja:'2026-11',tipoGasto:'PASS',rubro:'PRESTAMO',beneficiario:'JDJP',pagado:0,porPagar:53787},
 {mesHoja:'2026-11',tipoGasto:'PASS',rubro:'PRESTAMO',beneficiario:'JDJP',pagado:0,porPagar:34627.856},
 {mesHoja:'2026-11',tipoGasto:'',rubro:'',beneficiario:'SEVEN ELEVEN',pagado:371,porPagar:0},
 {mesHoja:'2026-11',tipoGasto:null,rubro:'',beneficiario:'DR FERRETERO',pagado:638,porPagar:0},
 {mesHoja:'2026-11',tipoGasto:'  ',rubro:'',beneficiario:'OXXO',pagado:240,porPagar:0},
 {mesHoja:'2026-11',tipoGasto:'',rubro:'',beneficiario:'CENTENARIO',pagado:0,porPagar:0},
 {mesHoja:'2026-11',tipoGasto:'GV',rubro:'COMISIONES VENTAS',beneficiario:'HERIBERTO',pagado:100,porPagar:80},
 {mesHoja:'2026-10',tipoGasto:'PASS',rubro:'ACCIONISTAS',beneficiario:'OCTUBRE',pagado:9999,porPagar:0},
];
function slice(code,start,end){
 let a=code.indexOf(start);let b=code.indexOf(end,a+start.length);
 assert.ok(a!==-1&&b>a,'Expected function '+start);
 return code.slice(a,b);
}
let checks=0;
for(const path of files) {
 const c=fs.readFileSync(path,'utf8');
 const ctx={
   state:{datos:{egresos:sample}},
   normalizarTexto:v=>v===null||v===undefined?'':String(v).trim(),
   normalizarClaveComparacion:v=>v===null||v===undefined?'':String(v).trim().toUpperCase(),
   coincideMesValor:(a,b)=>a===b,
   obtenerTimestampEgreso:()=>0
 };
 vm.createContext(ctx);
 vm.runInContext(slice(c,'function agruparEgresosPorCampo(', 'function renderGraficasVentas('),ctx);
 vm.runInContext(slice(c,'function obtenerMovimientosEgresosPorTipoGasto(', 'function obtenerFechaEgresoTexto('),ctx);
 const groups=ctx.agruparEgresosPorCampo('2026-11','tipoGasto','Sin tipo de gasto');
 for(const group of groups) {
  const detail=ctx.obtenerMovimientosEgresosPorTipoGasto('2026-11',group.nombre);
  const sum=detail.reduce((a,x)=>a+Number(x.pagado||0),0);
  assert.equal(detail.length,group.registros,path+': '+group.nombre+' quantity');
  assert.ok(Math.abs(sum-group.total)<0.001,path+': '+group.nombre+' amount');
  checks+=2;
 }
 const pass=ctx.obtenerMovimientosEgresosPorTipoGasto('2026-11','PASS');
 assert.equal(pass.length,1,path+': PASS must show one paid row'); checks++;
 const blank=ctx.obtenerMovimientosEgresosPorTipoGasto('2026-11','Sin tipo de gasto');
 assert.equal(blank.length,3,path+': missing expense type category');checks++;
 assert.equal(blank.reduce((a,x)=>a+x.pagado,0),1249);checks++;
 assert.equal(ctx.obtenerMovimientosEgresosPorTipoGasto('2026-10','PASS').length,1);checks++;
 const groupedRubros=ctx.agruparEgresosPorCampo('2026-11','rubro','Sin rubro','tipoGasto','Sin tipo de gasto');
 const groupedBenef=ctx.agruparEgresosPorCampo('2026-11','beneficiario','Sin beneficiario');
 const count=groups.reduce((s,x)=>s+x.registros,0);
 assert.equal(groupedRubros.reduce((s,x)=>s+x.registros,0),count,path+': rubro count');
 assert.equal(groupedBenef.reduce((s,x)=>s+x.registros,0),count,path+': beneficiario count');
 checks+=2;
 console.log('PASS',path,'grouped rows',count,'groups',groups.length,'rubro',groupedRubros.length,'beneficiarios',groupedBenef.length);
}
console.log('PASS: '+checks+' reconciliation assertions across production app and Excel snapshot.');
