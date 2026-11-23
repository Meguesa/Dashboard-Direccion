// Regresion de agenda: Eventos Capillas debe prevalecer sobre una BI incompleta.
// Ejecucion: node tests/test_agenda_capillas.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const bases = ["dashboard-egresos-preview", "dashboard-excel-preview"];

async function probar(base) {
  const carpeta = path.join(root, "cpanel-preview-20261105", base);
  const app = fs.readFileSync(path.join(carpeta, "app.js"), "utf8");
  const graph = fs.readFileSync(path.join(carpeta, "graph.js"), "utf8");
  const calendario = fs.readFileSync(path.join(carpeta, "dashboard-daily-calendar.js"), "utf8");

  const inicioMerge = app.indexOf("window.obtenerServiciosAgendaDia = function () {");
  const finMerge = app.indexOf("\n};", inicioMerge);
  assert.ok(inicioMerge >= 0 && finMerge > inicioMerge, base + ": merge ausente");
  const merge = app.slice(inicioMerge, finMerge + 3);
  assert.match(app, /const servicios = window\.obtenerServiciosAgendaDia\(\)/);
  assert.match(calendario, /window\.obtenerServiciosAgendaDia\(\)/);

  const fechaAhora = new Date("2026-11-23T15:05:00Z");
  class FechaPrueba extends Date {
    constructor(...args) { super(...(args.length ? args : [fechaAhora])); }
  }

  const registros = [
    { id: "731", fields: { field_1:"2518", field_2:"ELIA CHAPA GARZA",
      field_36:"2026-11-22T22:00:00Z", field_37:"2026-11-23T21:00:00Z",
      field_39:"CHURUBUSCO", field_40:"SALA 2", field_32:"INHUMACIÓN",
      Referencia:"VI - ATMETBA - 2859", ModoPrueba:false } },
    { id: "732", fields: { field_1:"0698", field_2:"MA. GUADALUPE ROCHA VIUDA",
      field_36:"2026-11-23T05:00:00Z", field_37:"2026-11-23T16:00:00Z",
      field_39:"APODACA", field_40:"SALA 2", field_32:"INHUMACIÓN",
      Referencia:"VI - ATMETBA - 4381-AF", ModoPrueba:false } },
    { id: "733", fields: { field_2:"PRUEBA",
      field_36:"2026-11-23T10:00:00Z", field_37:"2026-11-23T12:00:00Z",
      field_39:"APODACA", ModoPrueba:true } }
  ];

  const sourceStart = graph.indexOf("async function obtenerAgendaCapillasOperacionesSeguro()");
  assert.ok(sourceStart >= 0, base + ": lector no existe");
  const agendaSource = graph.slice(sourceStart);
  const context = {
    Date: FechaPrueba, console, window: {},
    graphGet: async (endpoint) => {
      assert.match(endpoint, /a46107c3-96b4-49c4-bba5-d8b26a845c65/);
      return { value: registros };
    }
  };
  vm.createContext(context);
  vm.runInContext(agendaSource, context);
  const directo = await vm.runInContext("obtenerAgendaCapillasOperacionesSeguro()", context);
  assert.equal(directo.error, "");
  assert.equal(directo.servicios.length, 2, base + ": dos servicios operativos");
  assert.equal(directo.servicios.find(x=>x.idOrigen==="732").ubicacionServicio, "APODACA");

  const state = { datos: {
    servicios: [
      { tipoOrigen:"Capillas", numeroServicio:"2518", referenciaContrato:"VI-ATMETBA-2859",
        finado:"ELIA CHAPA GARZA", fuente:"Eventos Capillas", idOrigen:"731",
        fechaServicio:"2026-11-22T22:00:00Z", fechaFin:"2026-11-23T21:00:00Z" },
      { tipoOrigen:"Parque", numeroServicio:"otro", finado:"SERVICIO PARQUE" }
    ],
    agendaCapillasOperaciones: directo.servicios
  } };
  const mergedContext = {state, window: {}};
  vm.createContext(mergedContext);
  vm.runInContext(merge, mergedContext);
  const lista = mergedContext.window.obtenerServiciosAgendaDia();
  assert.equal(lista.length, 3, base + ": dos Capillas y un Parque, sin duplicados");
  assert.equal(lista.filter(x=>x.finado==="ELIA CHAPA GARZA").length, 1);
  assert.equal(lista.filter(x=>/GUADALUPE ROCHA/.test(x.finado)).length, 1);
  assert.ok(!lista.some(x=>x.finado==="PRUEBA"));
}

(async()=>{
  for (const base of bases) {
    await probar(base);
    console.log("PASS agenda directa y deduplicacion:",base);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
