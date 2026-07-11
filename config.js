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
        listId: "77a15915-2984-41db-adb4-748100c36b0e"
      },
      egresos: {
        nombre: "BI_Egresos",
        listId: "7f134828-312b-400f-a9f9-4604b2fcda68"
      },
      ventas: {
        nombre: "BI_Ventas",
        listId: "fc0f8fbf-110a-418d-a7fb-542e633fab98"
      },
      servicios: {
        nombre: "BI_Servicios",
        listId: "fb475b08-ff65-4320-b006-379bb2832c27"
      },
      metasCobranza: {
        nombre: "BI_Metas_Cobranza",
        listId: "b114407b-1632-48b5-ad3f-baee26b1a24e"
      },
      fuentes: {
        nombre: "BI_Fuentes",
        listId: "c76a60b1-4755-42a4-ad4a-03cc58643153"
      },
      logActualizaciones: {
        nombre: "BI_Log_Actualizaciones",
        listId: "b5823c31-4f7c-4439-a222-1a7a0d0d84a1"
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
