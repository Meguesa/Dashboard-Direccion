// Regression: no room occupancy for direct cremation, separate domicile row.
// Run with TZ=America/Monterrey node tests/test_agenda_especiales.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const bases = ["dashboard-egresos-preview", "dashboard-excel-preview"];
const HOY = new Date("2026-11-26T16:00:00Z");

class MockDate extends Date {
  constructor(...args) { super(...(args.length ? args : [HOY])); }
}
const fields = (id, tipo, loc, ini, fin, crematorio, prueba = false) => ({
  id, fields:{
    field_1:id, field_2:"SERVICIO "+id, field_32:tipo, field_39:loc, field_40:"SALA 1",
    field_36:ini, field_37:fin,
    FechayHoraInicioCrematorio:crematorio,
    Created:"2026-11-26T14:00:00Z",
    Referencia:"REFERENCIA "+id,
    ModoPrueba:prueba
  }
});

async function run(base){
  const dir=path.join(root,"cpanel-preview-20261105",base);
  const graph=fs.readFileSync(path.join(dir,"graph.js"),"utf8");
  const calendar=fs.readFileSync(path.join(dir,"dashboard-daily-calendar.js"),"utf8");
  const app=fs.readFileSync(path.join(dir,"app.js"),"utf8");
  const records=[
    fields("cd0","CREMACIÓN DIRECTA (SIN VELACIÓN)","CREMATORIO",null,null,"2026-11-26T21:00:00Z"),
    fields("cd1","CREMACION DIRECTA (CON VELACION)","CHURUBUSCO","2026-11-26T14:00:00Z","2026-11-26T20:00:00Z","2026-11-26T22:00:00Z"),
    fields("home","INHUMACIÓN","DOMICILIO","2026-11-26T12:00:00Z","2026-11-26T23:00:00Z",null),
    fields("ch","INHUMACION","APODACA","2026-11-26T12:00:00Z","2026-11-26T23:00:00Z",null),
    fields("test","CREMACION DIRECTA (SIN VELACION)","CREMATORIO",null,null,"2026-11-26T21:00:00Z",true)
  ];
  const start=graph.indexOf("async function obtenerAgendaCapillasOperacionesSeguro()");
  assert.ok(start>0);
  const ctx={
    Date:MockDate, console,
    graphGet:async()=>({value:records}), window:{}
  };
  vm.createContext(ctx);
  vm.runInContext(graph.slice(start),ctx);
  const result=await vm.runInContext("obtenerAgendaCapillasOperacionesSeguro()",ctx);
  assert.equal(result.error,"");
  assert.equal(result.servicios.length,4);
  const cd=result.servicios.find(x=>x.idOrigen==="cd0");
  assert.equal(cd.agendaSinVelacion,true);
  assert.equal(cd.sala,"");
  assert.equal(cd.ubicacionServicio,"Crematorio");
  assert.ok(cd.fechaCrematorio);
  assert.equal(result.servicios.find(x=>x.idOrigen==="cd1").sala,"SALA 1");
  assert.equal(result.servicios.find(x=>x.idOrigen==="home").agendaDomicilio,true);
  assert.equal(result.servicios.find(x=>x.idOrigen==="home").sala,"");
  const fakeWindow={};
  const fakeDocument={readyState:"loading",addEventListener:()=>{}};
  const calendarCtx={window:fakeWindow,document:fakeDocument,Date:MockDate,Intl,console};
  vm.createContext(calendarCtx);
  const injected=calendar.replace(/\}\)\(\);\s*$/, "  window.__probarNormalizarServicio = normalizarServicio;\n})();");
  assert.ok(injected.includes("window.__probarNormalizarServicio"));
  vm.runInContext(injected,calendarCtx);
  const normalize=fakeWindow.__probarNormalizarServicio;
  const begin=new MockDate("2026-11-26T13:00:00Z");
  const end=new MockDate("2026-11-27T04:00:00Z");
  const eventos=result.servicios.map(s=>normalize(s,begin,end,HOY));
  assert.deepEqual(eventos.map(e=>e?.filaKey),["cremacion-directa","churubusco-sala-1","domicilio","agua-fria-sala-1"]);
  assert.equal(eventos[0].sala,null);
  assert.equal(eventos[0].fin,null);
  assert.equal(eventos[0].estado,"Programada hoy");
  assert.ok(!eventos[0].horarioTexto.includes(" - "));
  assert.ok(!app.includes("renderServiciosEspecialesDia")===false);
  assert.ok(app.includes("cremacionesDirectas.push(item)") && app.includes("velacionesDomicilio.push(item)"));
  console.log("PASS agenda especial",base);
}
(async()=>{for(const base of bases)await run(base);})().catch(e=>{console.error(e);process.exitCode=1;});
