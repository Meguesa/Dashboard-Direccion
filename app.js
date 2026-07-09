window.state = {
  mesSeleccionado: "2026-07",
  datos: {
    ingresos: [
      { mes: "2026-06", importe: 7312120.30 },
      { mes: "2026-07", importe: 894008.20 }
    ],
    egresos: [
      { mes: "2026-06", pagado: 2100000.00 },
      { mes: "2026-07", pagado: 733051.48 }
    ],
    ventas: [
      { mes: "2026-06", monto: 1250000.00 },
      { mes: "2026-07", monto: 780000.00 }
    ],
    contratos: [
      { mes: "2026-06", total: 18 },
      { mes: "2026-07", total: 11 }
    ],
    servicios: [
      { mes: "2026-06", origen: "Capillas", total: 69 },
      { mes: "2026-06", origen: "Parque", total: 52 },
      { mes: "2026-07", origen: "Capillas", total: 8 },
      { mes: "2026-07", origen: "Parque", total: 6 }
    ]
  }
};

const state = window.state;

document.addEventListener("DOMContentLoaded", () => {
  inicializarDashboard();
});

function inicializarDashboard() {
  cargarSelectorMeses();
  conectarEventos();
  conectarNavegacionInterna();
  renderDashboard();
  mostrarPagina("resumen");
}

function cargarSelectorMeses() {
  const selector = document.getElementById("monthSelector");

  if (!selector) {
    return;
  }

  selector.innerHTML = "";

  CONFIG.meses.forEach((mes) => {
    const option = document.createElement("option");
    option.value = mes.clave;
    option.textContent = mes.nombre;

    if (mes.clave === state.mesSeleccionado) {
      option.selected = true;
    }

    selector.appendChild(option);
  });
}

function conectarEventos() {
  const selector = document.getElementById("monthSelector");
  const refreshButton = document.getElementById("refreshButton");
  const testSharePointButton = document.getElementById("testSharePointButton");
  const getListsButton = document.getElementById("getListsButton");
  const getIngresosButton = document.getElementById("getIngresosButton");

  if (selector) {
    selector.addEventListener("change", (event) => {
      state.mesSeleccionado = event.target.value;
      renderDashboard();
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      await actualizarDatosDashboard();
    });
  }

  async function actualizarDatosDashboard() {
  const datosSharePoint = await cargarDatosSharePoint();

  if (!datosSharePoint) {
    return;
  }

  state.datos.ingresos = datosSharePoint.ingresos || [];
  state.datos.egresos = datosSharePoint.egresos || [];
  state.datos.ventas = datosSharePoint.ventas || [];
  state.datos.servicios = datosSharePoint.servicios || [];

  renderDashboard();
}

  if (testSharePointButton) {
    testSharePointButton.addEventListener("click", async () => {
      await probarConexionSharePoint();
    });
  }

  if (getListsButton) {
    getListsButton.addEventListener("click", async () => {
      await obtenerListasSharePoint();
    });
  }

  if (getIngresosButton) {
    getIngresosButton.addEventListener("click", async () => {
      await obtenerIngresosSharePoint();
    });
  }
}

function conectarNavegacionInterna() {
  const tarjetasKpi = document.querySelectorAll(".kpi-card");
  const botonesRegresar = document.querySelectorAll(".page-back-button");

  tarjetasKpi.forEach((tarjeta) => {
    tarjeta.addEventListener("click", () => {
      const paginaDestino = tarjeta.dataset.page;
      mostrarPagina(paginaDestino);
    });

    tarjeta.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();

        const paginaDestino = tarjeta.dataset.page;
        mostrarPagina(paginaDestino);
      }
    });
  });

  botonesRegresar.forEach((boton) => {
    boton.addEventListener("click", () => {
      const paginaDestino = boton.dataset.page || "resumen";
      mostrarPagina(paginaDestino);
    });
  });
}

function mostrarPagina(nombrePagina) {
  const paginas = {
    resumen: "pageResumen",
    ingresos: "pageIngresos",
    egresos: "pageEgresos",
    ventas: "pageVentas",
    servicios: "pageServicios"
  };

  const paginaDestinoId = paginas[nombrePagina];

  if (!paginaDestinoId) {
    return;
  }

  Object.values(paginas).forEach((pageId) => {
    const pagina = document.getElementById(pageId);

    if (pagina) {
      pagina.classList.add("hidden");
    }
  });

  const paginaDestino = document.getElementById(paginaDestinoId);

  if (paginaDestino) {
    paginaDestino.classList.remove("hidden");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function renderDashboard() {
  const mes = state.mesSeleccionado;

  const totalIngresos = sumarIngresos(mes);
  const totalEgresos = sumarEgresos(mes);
  const totalVentas = sumarVentas(mes);
  const totalContratos = contarContratos(mes);

  const totalCapillas = contarServiciosPorOrigen(mes, "CAPILLA");
  const totalParque = contarServiciosPorOrigen(mes, "PARQUE");
  const totalServicios = totalCapillas + totalParque;
  
  const registrosIngresos = contarRegistrosIngresos(mes);
  const registrosEgresos = contarRegistrosEgresos(mes);
  
  const promedioIngresos = registrosIngresos > 0 ? totalIngresos / registrosIngresos : 0;
  const promedioEgresos = registrosEgresos > 0 ? totalEgresos / registrosEgresos : 0;
  const promedioVentas = totalContratos > 0 ? totalVentas / totalContratos : 0;
  
  const flujoNeto = totalIngresos - totalEgresos;

  setText("kpiIngresos", formatoMoneda(totalIngresos));
  setText("kpiEgresos", formatoMoneda(totalEgresos));
  setText("kpiFlujo", formatoMoneda(flujoNeto));
  setText("kpiVentas", formatoMoneda(totalVentas));
  setText("kpiServicios", formatoNumero(totalServicios));

  setText("pageIngresosTotal", formatoMoneda(totalIngresos));
  setText("pageIngresosRegistros", formatoNumero(registrosIngresos));
  setText("pageIngresosPromedio", formatoMoneda(promedioIngresos));
  
  setText("pageEgresosTotal", formatoMoneda(totalEgresos));
  setText("pageEgresosRegistros", formatoNumero(registrosEgresos));
  setText("pageEgresosPromedio", formatoMoneda(promedioEgresos));
  
  setText("pageVentasTotal", formatoMoneda(totalVentas));
  setText("pageVentasContratos", formatoNumero(totalContratos));
  setText("pageVentasPromedio", formatoMoneda(promedioVentas));
  
  setText("pageServiciosTotal", formatoNumero(totalServicios));
  setText("pageServiciosCapillas", formatoNumero(totalCapillas));
  setText("pageServiciosParque", formatoNumero(totalParque));
  
  aplicarClaseFlujo("kpiFlujo", flujoNeto);

  setText("capillasTotal", formatoNumero(totalCapillas));
  setText("parqueTotal", formatoNumero(totalParque));
  setText("serviciosTotal", formatoNumero(totalServicios));

  setText("lastUpdate", obtenerFechaHoraActual());

  renderTablaResumen({
    totalIngresos,
    totalEgresos,
    flujoNeto,
    totalVentas,
    totalContratos,
    totalCapillas,
    totalParque,
    totalServicios
  });
}

function sumarPorMes(lista, mes, campo) {
  return lista
    .filter((item) => item.mes === mes)
    .reduce((total, item) => total + Number(item[campo] || 0), 0);
}

function sumarServicios(mes, origen) {
  return state.datos.servicios
    .filter((item) => item.mes === mes && item.origen === origen)
    .reduce((total, item) => total + Number(item.total || 0), 0);
}

function sumarIngresos(mes) {
  return state.datos.ingresos
    .filter((item) => normalizarTexto(item.mes) === mes)
    .reduce((total, item) => total + Number(item.importe || 0), 0);
}

function sumarEgresos(mes) {
  return state.datos.egresos
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      return mesEgreso === mes;
    })
    .reduce((total, item) => total + Number(item.pagado || 0), 0);
}

function sumarVentas(mes) {
  return state.datos.ventas
    .filter((item) => {
      const itemMes = normalizarTexto(item.mes);
      const fuente = normalizarTexto(item.fuente).toUpperCase();
      const tipoRegistro = normalizarTexto(item.tipoRegistro).toUpperCase();

      return itemMes === mes
        && fuente === "VENTAS 2026"
        && tipoRegistro === "MENSUAL";
    })
    .reduce((total, item) => total + Number(item.montoVenta || 0), 0);
}

function contarRegistrosIngresos(mes) {
  return state.datos.ingresos
    .filter((item) => normalizarTexto(item.mes) === mes)
    .length;
}

function contarRegistrosEgresos(mes) {
  return state.datos.egresos
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      return mesEgreso === mes;
    })
    .length;
}

function contarContratos(mes) {
  return state.datos.ventas
    .filter((item) => {
      const itemMes = normalizarTexto(item.mes);
      const hojaOrigen = normalizarTexto(item.hojaOrigen).toUpperCase();

      return itemMes === mes
        && hojaOrigen === "LOTES";
    })
    .length;
}

function contarServiciosPorOrigen(mes, origenBuscado) {
  return state.datos.servicios
    .filter((item) => {
      const itemMes = normalizarTexto(item.mes);
      const origen = normalizarTexto(item.origen).toUpperCase();

      return itemMes === mes
        && origen.includes(origenBuscado);
    })
    .length;
}

function normalizarTexto(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  return String(valor).trim();
}


function renderTablaResumen(datos) {
  const tbody = document.getElementById("summaryTableBody");

  if (!tbody) {
    return;
  }

  const filas = [
    ["Ingresos", formatoMoneda(datos.totalIngresos)],
    ["Egresos pagados", formatoMoneda(datos.totalEgresos)],
    ["Flujo neto", formatoMoneda(datos.flujoNeto)],
    ["Ventas", formatoMoneda(datos.totalVentas)],
    ["Contratos", formatoNumero(datos.totalContratos)],
    ["Servicios Capillas", formatoNumero(datos.totalCapillas)],
    ["Servicios Parque", formatoNumero(datos.totalParque)],
    ["Servicios Totales", formatoNumero(datos.totalServicios)]
  ];

  tbody.innerHTML = filas
    .map(([concepto, valor]) => {
      return `
        <tr>
          <td>${concepto}</td>
          <td>${valor}</td>
        </tr>
      `;
    })
    .join("");
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function aplicarClaseFlujo(id, valor) {
  const element = document.getElementById(id);

  if (!element) {
    return;
  }

  element.classList.remove("positive", "negative");

  if (valor >= 0) {
    element.classList.add("positive");
  } else {
    element.classList.add("negative");
  }
}

function formatoMoneda(valor) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2
  }).format(Number(valor || 0));
}

function formatoNumero(valor) {
  return new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: 0
  }).format(Number(valor || 0));
}

function obtenerFechaHoraActual() {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());
}

window.renderDashboard = renderDashboard;
window.actualizarDatosDashboard = actualizarDatosDashboard;
