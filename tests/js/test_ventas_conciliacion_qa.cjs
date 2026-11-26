"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const source = fs.readFileSync("cpanel-preview-20261105/dashboard-egresos-preview/app.js", "utf8");
const start = source.indexOf("function normalizarAsesorVentasQA(");
const end = source.indexOf("async function cargarComparacionVentasExcelQA(", start);
assert.ok(start >= 0 && end > start, "QA functions must remain available");
const ctx = vm.createContext({});
vm.runInContext(source.slice(start, end), ctx, {timeout: 1000});
const normalizar = ctx.normalizarAsesorVentasQA;
const conciliar = ctx.conciliarVentasPorAsesorQA;
assert.equal(normalizar("María-Luisa"), normalizar("MARIA LUISA"));
const a = conciliar(
  [{asesor:"María-Luisa", montoVenta:120.50, metaMensual:150},
   {asesor:"Jorge", montoVenta:300, metaMensual:null},
   {asesor:"Ana", montoVenta:0, metaMensual:0}],
  [{asesor:"MARIA LUISA", montoVenta:100},
   {asesor:"Pedro", montoVenta:500},
   {asesor:"ANA", montoVenta:0}]
);
assert.equal(a.distintas.length, 3);
assert.equal(a.metasAusentes.length, 1);
assert.equal(a.filas.find(x=>x.asesor==="María-Luisa").diferenciaCentavos, 2050);
assert.equal(a.filas.find(x=>x.asesor==="Jorge").estado, "SOLO_EXCEL");
assert.equal(a.filas.find(x=>x.asesor==="Pedro").estado, "SOLO_BI");
assert.equal(a.filas.find(x=>x.asesor==="Ana").estado, "IGUAL");
assert.equal(a.filas.find(x=>x.asesor==="Ana").metaDisponible, true);
const b = conciliar(
  [{asesor:"LUIS",montoVenta:10,metaMensual:null}],
  [{asesor:"LUIS",montoVenta:5},{asesor:"LUIS",montoVenta:5}]
);
assert.ok(b.incidencias.some(x=>x.includes("asesor repetido")));
assert.equal(b.filas[0].diferenciaCentavos, 0);
assert.equal(b.filas[0].estado, "IGUAL");
console.log("PASS QA sales adviser reconciliation");
