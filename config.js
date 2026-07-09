const CONFIG = {
  app: {
    nombre: "Centro de Control Dirección",
    empresa: "Jardines de Juan Pablo",
    version: "1.0.0",
    autoRefreshMinutos: 10
  },

  microsoft: {
    tenantId: "888d54c0-f785-49d1-b967-54da8b0aed94",
    clientId: "48963b90-d7b4-4447-af2f-ff186f1014f3",
    redirectUri: "https://meguesa.github.io/Dashboard-Direccion/"
  },

  sharepoint: {
    siteHostname: "meguesajdjp.sharepoint.com",
    sitePath: "/sites/CentroControlDireccion",

    lists: {
      ingresos: {
        nombre: "BI_Ingresos",
        listId: ""
      },
      egresos: {
        nombre: "BI_Egresos",
        listId: ""
      },
      ventas: {
        nombre: "BI_Ventas",
        listId: ""
      },
      servicios: {
        nombre: "BI_Servicios",
        listId: ""
      },
      fuentes: {
        nombre: "BI_Fuentes",
        listId: ""
      },
      logActualizaciones: {
        nombre: "BI_Log_Actualizaciones",
        listId: ""
      }
    }
  },

  meses: [
    { nombre: "ENERO", orden: 1, clave: "2026-01" },
    { nombre: "FEBRERO", orden: 2, clave: "2026-02" },
    { nombre: "MARZO", orden: 3, clave: "2026-03" },
    { nombre: "ABRIL", orden: 4, clave: "2026-04" },
    { nombre: "MAYO", orden: 5, clave: "2026-05" },
    { nombre: "JUNIO", orden: 6, clave: "2026-06" },
    { nombre: "JULIO", orden: 7, clave: "2026-07" },
    { nombre: "AGOSTO", orden: 8, clave: "2026-08" },
    { nombre: "SEPTIEMBRE", orden: 9, clave: "2026-09" },
    { nombre: "OCTUBRE", orden: 10, clave: "2026-10" },
    { nombre: "NOVIEMBRE", orden: 11, clave: "2026-11" },
    { nombre: "DICIEMBRE", orden: 12, clave: "2026-12" }
  ]
};
