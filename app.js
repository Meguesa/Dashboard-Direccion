const state = {
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

document.addEventListener("DOMContentLoaded", () => {
  inicializarDashboard();
});

function inicializarDashboard() {
  cargarSelectorMeses();
  conectarEventos();
  renderDashboard();
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

  if (selector) {
    selector.addEventListener("change", (event) => {
      state.mesSeleccionado = event.target.value;
      renderDashboard();
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      renderDashboard();
    });
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
}
function renderDashboard() {
  const mes = state.mesSeleccionado;

  const totalIngresos = sumarPorMes(state.datos.ingresos, mes, "importe");
  const totalEgresos = sumarPorMes(state.datos.egresos, mes, "pagado");
  const totalVentas = sumarPorMes(state.datos.ventas, mes, "monto");
  const totalContratos = sumarPorMes(state.datos.contratos, mes, "total");

  const totalCapillas = sumarServicios(mes, "Capillas");
  const totalParque = sumarServicios(mes, "Parque");
  const totalServicios = totalCapillas + totalParque;

  const flujoNeto = totalIngresos - totalEgresos;

  setText("kpiIngresos", formatoMoneda(totalIngresos));
  setText("kpiEgresos", formatoMoneda(totalEgresos));
  setText("kpiFlujo", formatoMoneda(flujoNeto));
  setText("kpiVentas", formatoMoneda(totalVentas));
  setText("kpiContratos", formatoNumero(totalContratos));

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
