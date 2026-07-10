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
  conectarFiltrosTablas();
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

function conectarFiltrosTablas() {
  const tablas = document.querySelectorAll(".detail-table");

  tablas.forEach((tabla) => {
    const thead = tabla.querySelector("thead");
    const filaEncabezados = thead ? thead.querySelector("tr") : null;

    if (!thead || !filaEncabezados) {
      return;
    }

    if (thead.querySelector(".table-filter-row")) {
      return;
    }

    const filtrosRow = document.createElement("tr");
    filtrosRow.className = "table-filter-row";

    Array.from(filaEncabezados.children).forEach((th, index) => {
      const filtroCelda = document.createElement("th");
      const input = document.createElement("input");

      input.type = "text";
      input.className = "table-filter-input";
      input.placeholder = `Filtrar ${th.textContent.trim()}`;
      input.dataset.columnIndex = String(index);

      input.addEventListener("input", () => {
        aplicarFiltrosTabla(tabla);
      });

      filtroCelda.appendChild(input);
      filtrosRow.appendChild(filtroCelda);
    });

    thead.appendChild(filtrosRow);
  });
}

function aplicarFiltrosTodasLasTablas() {
  const tablas = document.querySelectorAll(".detail-table");

  tablas.forEach((tabla) => {
    aplicarFiltrosTabla(tabla);
  });
}

function aplicarFiltrosTabla(tabla) {
  const filtros = Array.from(tabla.querySelectorAll(".table-filter-input"));
  const filas = Array.from(tabla.querySelectorAll("tbody tr"));

  if (filtros.length === 0 || filas.length === 0) {
    return;
  }

  filas.forEach((fila) => {
    const celdas = Array.from(fila.children);

    const cumpleFiltros = filtros.every((filtro) => {
      const valorFiltro = normalizarTexto(filtro.value);

      if (!valorFiltro) {
        return true;
      }

      const indiceColumna = Number(filtro.dataset.columnIndex);
      const celda = celdas[indiceColumna];

      if (!celda) {
        return false;
      }

      const valorCelda = normalizarTexto(celda.textContent);

      return valorCelda.includes(valorFiltro);
    });

    fila.classList.toggle("hidden", !cumpleFiltros);
  });
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
  const totalPorPagar = calcularTotalPorPagar(mes);
  
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
  setText("pageEgresosPorPagar", formatoMoneda(totalPorPagar));
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

  renderDetalleIngresos(mes, totalIngresos);
  renderDetalleEgresos(mes, totalEgresos);
  renderDetalleVentas(mes, totalVentas);
  aplicarFiltrosTodasLasTablas();
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
  const ventasMensuales = obtenerVentasMensuales(mes);

  if (ventasMensuales.length > 0) {
    return ventasMensuales
      .reduce((total, item) => total + obtenerMontoVenta(item), 0);
  }

  const ventasPorAsesor = obtenerVentasPorAsesorBase(mes);

  if (ventasPorAsesor.length > 0) {
    return ventasPorAsesor
      .reduce((total, item) => total + obtenerMontoVenta(item), 0);
  }

  return obtenerVentasOperativas(mes)
    .reduce((total, item) => total + obtenerMontoVenta(item), 0);
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

function calcularTotalPorPagar(mes) {
  return state.datos.egresos
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      return mesEgreso === mes;
    })
    .reduce((total, item) => total + Number(item.porPagar || 0), 0);
}

function contarContratos(mes) {
  return obtenerContratosVentas(mes).length;
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

function renderDetalleIngresos(mes, totalIngresos) {
  renderTablaIngresosAgrupada({
    tbodyId: "tablaIngresosBancoBody",
    mes,
    totalIngresos,
    campo: "banco",
    etiquetaVacia: "Sin banco"
  });

  renderTablaIngresosAgrupada({
    tbodyId: "tablaIngresosCategoriaBody",
    mes,
    totalIngresos,
    campo: "categoria",
    etiquetaVacia: "Sin categoría"
  });

  renderTablaIngresosAgrupada({
    tbodyId: "tablaIngresosSubcategoriaBody",
    mes,
    totalIngresos,
    campo: "subcategoria",
    etiquetaVacia: "Sin subcategoría"
  });
}

function renderTablaIngresosAgrupada(configuracion) {
  const tbody = document.getElementById(configuracion.tbodyId);

  if (!tbody) {
    return;
  }

  const filas = agruparIngresosPorCampo(
    configuracion.mes,
    configuracion.campo,
    configuracion.etiquetaVacia
  );

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">Sin información para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const porcentaje = configuracion.totalIngresos > 0
        ? fila.total / configuracion.totalIngresos
        : 0;

      return `
        <tr>
          <td>${escaparHtml(fila.nombre)}</td>
          <td>${formatoNumero(fila.registros)}</td>
          <td>${formatoMoneda(fila.total)}</td>
          <td>${formatoPorcentaje(porcentaje)}</td>
        </tr>
      `;
    })
    .join("");
}

function agruparIngresosPorCampo(mes, campo, etiquetaVacia) {
  const grupos = new Map();

  state.datos.ingresos
    .filter((item) => normalizarTexto(item.mes) === mes)
    .forEach((item) => {
      const nombreGrupo = normalizarTexto(item[campo]) || etiquetaVacia;
      const importe = Number(item.importe || 0);

      if (!grupos.has(nombreGrupo)) {
        grupos.set(nombreGrupo, {
          nombre: nombreGrupo,
          registros: 0,
          total: 0
        });
      }

      const grupo = grupos.get(nombreGrupo);

      grupo.registros += 1;
      grupo.total += importe;
    });

  return Array.from(grupos.values())
    .sort((a, b) => b.total - a.total);
}

function renderDetalleEgresos(mes, totalEgresos) {
  renderTablaEgresosAgrupada({
    tbodyId: "tablaEgresosRubroBody",
    mes,
    totalEgresos,
    campo: "rubro",
    etiquetaVacia: "Sin rubro",
    campoSecundario: "tipoGasto",
    etiquetaVaciaSecundaria: "Sin tipo de gasto"
  });

  renderTablaEgresosAgrupada({
    tbodyId: "tablaEgresosTipoGastoBody",
    mes,
    totalEgresos,
    campo: "tipoGasto",
    etiquetaVacia: "Sin tipo de gasto"
  });

  renderTablaEgresosAgrupada({
    tbodyId: "tablaEgresosBeneficiarioBody",
    mes,
    totalEgresos,
    campo: "beneficiario",
    etiquetaVacia: "Sin beneficiario"
  });

  renderTablaEgresosPendientes(mes);
}

function renderTablaEgresosPendientes(mes) {
  const tbody = document.getElementById("tablaEgresosPendientesBody");

  if (!tbody) {
    return;
  }

  const pendientes = state.datos.egresos
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      const porPagar = Number(item.porPagar || 0);

      return mesEgreso === mes && porPagar > 0;
    })
    .sort((a, b) => Number(b.porPagar || 0) - Number(a.porPagar || 0));

  if (pendientes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">Sin pagos pendientes para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = pendientes
    .map((item) => {
      const beneficiario = normalizarTexto(item.beneficiario) || "Sin beneficiario";
      const rubro = normalizarTexto(item.rubro) || "Sin rubro";
      const tipoGasto = normalizarTexto(item.tipoGasto) || "Sin tipo de gasto";
      const porPagar = Number(item.porPagar || 0);

      return `
        <tr>
          <td>${escaparHtml(beneficiario)}</td>
          <td>${escaparHtml(rubro)}</td>
          <td>${escaparHtml(tipoGasto)}</td>
          <td>${formatoMoneda(porPagar)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderTablaEgresosAgrupada(configuracion) {
  const tbody = document.getElementById(configuracion.tbodyId);

  if (!tbody) {
    return;
  }

  const filas = agruparEgresosPorCampo(
    configuracion.mes,
    configuracion.campo,
    configuracion.etiquetaVacia,
    configuracion.campoSecundario,
    configuracion.etiquetaVaciaSecundaria
  );

  const tieneCampoSecundario = Boolean(configuracion.campoSecundario);
  const columnas = tieneCampoSecundario ? 5 : 4;

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${columnas}">Sin información para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  const filasVisibles = configuracion.limite
    ? filas.slice(0, configuracion.limite)
    : filas;

  tbody.innerHTML = filasVisibles
    .map((fila) => {
      const porcentaje = configuracion.totalEgresos > 0
        ? fila.total / configuracion.totalEgresos
        : 0;

      const celdasGrupo = tieneCampoSecundario
        ? `
          <td>${escaparHtml(fila.nombre)}</td>
          <td>${escaparHtml(fila.nombreSecundario)}</td>
        `
        : `
          <td>${escaparHtml(fila.nombre)}</td>
        `;

      return `
        <tr>
          ${celdasGrupo}
          <td>${formatoNumero(fila.registros)}</td>
          <td>${formatoMoneda(fila.total)}</td>
          <td>${formatoPorcentaje(porcentaje)}</td>
        </tr>
      `;
    })
    .join("");
}

function agruparEgresosPorCampo(
  mes,
  campo,
  etiquetaVacia,
  campoSecundario,
  etiquetaVaciaSecundaria
) {
  const grupos = new Map();

  state.datos.egresos
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      const pagado = Number(item.pagado || 0);

      return mesEgreso === mes && pagado > 0;
    })
    .forEach((item) => {
      const nombreGrupo = normalizarTexto(item[campo]) || etiquetaVacia;
      const nombreSecundario = campoSecundario
        ? normalizarTexto(item[campoSecundario]) || etiquetaVaciaSecundaria
        : "";

      const llaveGrupo = campoSecundario
        ? `${nombreGrupo}||${nombreSecundario}`
        : nombreGrupo;

      if (!grupos.has(llaveGrupo)) {
        grupos.set(llaveGrupo, {
          nombre: nombreGrupo,
          nombreSecundario,
          registros: 0,
          total: 0
        });
      }

      const grupo = grupos.get(llaveGrupo);
      const pagado = Number(item.pagado || 0);

      grupo.registros += 1;
      grupo.total += pagado;
    });

  return Array.from(grupos.values())
    .sort((a, b) => b.total - a.total);
}

function renderDetalleVentas(mes, totalVentas) {
  renderTablaVentasAsesor(mes);
  renderTablaVentasTipoServicio(mes);
  renderTablaVentasContratos(mes);
}

function renderTablaVentasAsesor(mes) {
  const tbody = document.getElementById("tablaVentasAsesorBody");

  if (!tbody) {
    return;
  }

  const filas = agruparVentasPorAsesor(mes);

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">Sin información para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const metaMensual = Number(fila.metaMensual || 0);
      const porcentajeCumplimiento = metaMensual > 0
        ? fila.total / metaMensual
        : 0;

      return `
        <tr>
          <td>${escaparHtml(fila.nombre)}</td>
          <td>${formatoNumero(fila.registros)}</td>
          <td>${formatoNumero(fila.unidades)}</td>
          <td>${formatoMoneda(fila.total)}</td>
          <td>${metaMensual > 0 ? formatoMoneda(metaMensual) : "Sin meta"}</td>
          <td>${metaMensual > 0 ? formatoPorcentaje(porcentajeCumplimiento) : "—"}</td>
        </tr>
      `;
    })
    .join("");
}

function agruparVentasPorAsesor(mes) {
  const grupos = new Map();
  const datosBase = obtenerVentasPorAsesorBase(mes);

  datosBase.forEach((item) => {
    const asesor = normalizarTexto(item.asesor) || "Sin asesor";
    const montoVenta = obtenerMontoVenta(item);
    const unidades = obtenerUnidadesVenta(item);
    const metaMensual = Number(item.metaMensual || 0);

    if (montoVenta <= 0 && unidades <= 0 && metaMensual <= 0) {
      return;
    }

    if (!grupos.has(asesor)) {
      grupos.set(asesor, {
        nombre: asesor,
        registros: 0,
        unidades: 0,
        total: 0,
        metaMensual: 0
      });
    }

    const grupo = grupos.get(asesor);

    grupo.registros += 1;
    grupo.unidades += unidades;
    grupo.total += montoVenta;

    if (metaMensual > grupo.metaMensual) {
      grupo.metaMensual = metaMensual;
    }
  });

  return Array.from(grupos.values())
    .sort((a, b) => b.total - a.total);
}

function renderTablaVentasTipoServicio(mes) {
  const tbody = document.getElementById("tablaVentasTipoServicioBody");

  if (!tbody) {
    return;
  }

  const filas = calcularVentasPorTipoServicio(mes);
  const totalUnidades = filas.reduce((total, fila) => total + fila.unidades, 0);

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">Sin información para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const porcentaje = totalUnidades > 0
        ? fila.unidades / totalUnidades
        : 0;

      return `
        <tr>
          <td>${escaparHtml(fila.nombre)}</td>
          <td>${formatoNumero(fila.registros)}</td>
          <td>${formatoNumero(fila.unidades)}</td>
          <td>${formatoPorcentaje(porcentaje)}</td>
        </tr>
      `;
    })
    .join("");
}

function calcularVentasPorTipoServicio(mes) {
  const ventasBase = obtenerVentasPorAsesorBase(mes);

  const tiposServicio = [
    {
      nombre: "Servicios AF",
      campo: "serviciosAf"
    },
    {
      nombre: "Servicios CH",
      campo: "serviciosCh"
    },
    {
      nombre: "TS / TSC",
      campo: "tsTsc"
    },
    {
      nombre: "Propiedades",
      campo: "propiedades"
    },
    {
      nombre: "Nichos",
      campo: "nichos"
    }
  ];

  return tiposServicio
    .map((tipo) => {
      const unidades = ventasBase
        .reduce((total, item) => total + Number(item[tipo.campo] || 0), 0);

      const registros = ventasBase
        .filter((item) => Number(item[tipo.campo] || 0) > 0)
        .length;

      return {
        nombre: tipo.nombre,
        registros,
        unidades
      };
    })
    .filter((fila) => fila.unidades > 0)
    .sort((a, b) => b.unidades - a.unidades);
}

function renderTablaVentasContratos(mes) {
  const tbody = document.getElementById("tablaVentasContratosBody");

  if (!tbody) {
    return;
  }

  const contratos = obtenerContratosVentas(mes)
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));

  if (contratos.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Sin contratos para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = contratos
    .map((item) => {
      const contrato = normalizarTexto(item.numeroContrato || item.referencia) || "Sin contrato";
      const cliente = obtenerNombreClienteVenta(item);
      const asesor = normalizarTexto(item.asesor) || "Sin asesor";
      const tipo = normalizarTexto(item.tipoServicio || item.tipoContrato || item.tipoRegistro) || "Sin tipo";
      const total = obtenerMontoVenta(item);

      return `
        <tr>
          <td>${escaparHtml(contrato)}</td>
          <td>${escaparHtml(cliente)}</td>
          <td>${escaparHtml(asesor)}</td>
          <td>${escaparHtml(tipo)}</td>
          <td>${formatoMoneda(total)}</td>
        </tr>
      `;
    })
    .join("");
}


function obtenerVentas2026(mes) {
  return obtenerVentasOperativas(mes);
}

function obtenerVentasOperativas(mes) {
  return state.datos.ventas
    .filter((item) => {
      return coincideMesVenta(item.mes, mes) && esFuenteVentas(item.fuente);
    });
}

function obtenerContratosVentas(mes) {
  return state.datos.ventas
    .filter((item) => {
      return coincideMesVenta(item.mes, mes) && esFuenteContratos(item.fuente);
    });
}

function coincideMesVenta(mesRegistro, mesSeleccionado) {
  const mesRegistroNormalizado = normalizarTexto(mesRegistro).toUpperCase();
  const mesSeleccionadoNormalizado = normalizarTexto(mesSeleccionado).toUpperCase();

  if (mesRegistroNormalizado === mesSeleccionadoNormalizado) {
    return true;
  }

  const nombreMesSeleccionado = obtenerNombreMesDesdeClave(mesSeleccionadoNormalizado);

  return mesRegistroNormalizado === nombreMesSeleccionado;
}

function obtenerNombreMesDesdeClave(mesSeleccionado) {
  const mapaMeses = {
    "01": "ENERO",
    "02": "FEBRERO",
    "03": "MARZO",
    "04": "ABRIL",
    "05": "MAYO",
    "06": "JUNIO",
    "07": "JULIO",
    "08": "AGOSTO",
    "09": "SEPTIEMBRE",
    "10": "OCTUBRE",
    "11": "NOVIEMBRE",
    "12": "DICIEMBRE"
  };

  const partes = mesSeleccionado.split("-");
  const numeroMes = partes.length >= 2 ? partes[1] : "";

  return mapaMeses[numeroMes] || mesSeleccionado;
}

function esFuenteVentas(valor) {
  const fuente = normalizarTexto(valor).toUpperCase();

  return fuente.includes("VENTAS")
    && !fuente.includes("CONTRATOS");
}

function esFuenteContratos(valor) {
  const fuente = normalizarTexto(valor).toUpperCase();

  return fuente.includes("CONTRATOS");
}

function obtenerVentasMensuales(mes) {
  return obtenerVentasOperativas(mes)
    .filter((item) => {
      const tipoRegistro = normalizarTexto(item.tipoRegistro).toUpperCase();
      const montoVenta = obtenerMontoVenta(item);

      return montoVenta > 0
        && (
          tipoRegistro.includes("MENSUAL")
          || tipoRegistro.includes("MES")
          || tipoRegistro.includes("TOTAL MES")
        );
    });
}

function obtenerVentasPorAsesorBase(mes) {
  const ventasOperativas = obtenerVentasOperativas(mes);

  const ventasMensuales = ventasOperativas
    .filter((item) => {
      const asesor = normalizarTexto(item.asesor);
      const tipoRegistro = normalizarTexto(item.tipoRegistro).toUpperCase();
      const montoVenta = obtenerMontoVenta(item);
      const unidades = obtenerUnidadesVenta(item);
      const metaMensual = Number(item.metaMensual || 0);

      return asesor !== ""
        && tipoRegistro.includes("MENSUAL")
        && (montoVenta > 0 || unidades > 0 || metaMensual > 0);
    });

  if (ventasMensuales.length > 0) {
    return ventasMensuales;
  }

  return ventasOperativas
    .filter((item) => {
      const asesor = normalizarTexto(item.asesor);
      const montoVenta = obtenerMontoVenta(item);
      const unidades = obtenerUnidadesVenta(item);
      const metaMensual = Number(item.metaMensual || 0);

      return asesor !== ""
        && (montoVenta > 0 || unidades > 0 || metaMensual > 0);
    });
}

function obtenerVentasPorSucursalBase(mes) {
  const ventasConAsesor = obtenerVentasOperativas(mes)
    .filter((item) => {
      const asesor = normalizarTexto(item.asesor);
      const sucursal = normalizarTexto(item.sucursal);
      const montoVenta = obtenerMontoVenta(item);
      const unidades = obtenerUnidadesVenta(item);

      return asesor !== ""
        && sucursal !== ""
        && (montoVenta > 0 || unidades > 0);
    });

  if (ventasConAsesor.length > 0) {
    return ventasConAsesor;
  }

  return obtenerVentasOperativas(mes)
    .filter((item) => {
      const sucursal = normalizarTexto(item.sucursal);
      const montoVenta = obtenerMontoVenta(item);
      const unidades = obtenerUnidadesVenta(item);

      return sucursal !== "" && (montoVenta > 0 || unidades > 0);
    });
}

function obtenerVentasPorTipoRegistroBase(mes) {
  return obtenerVentasOperativas(mes)
    .filter((item) => {
      const tipoRegistro = normalizarTexto(item.tipoRegistro);
      const montoVenta = obtenerMontoVenta(item);
      const unidades = obtenerUnidadesVenta(item);

      return tipoRegistro !== "" && (montoVenta > 0 || unidades > 0);
    });
}

function obtenerBaseVentasPorTipo(mes, base) {
  if (base === "VENTAS_ASESOR") {
    return obtenerVentasPorAsesorBase(mes);
  }

  if (base === "VENTAS_SUCURSAL") {
    return obtenerVentasPorSucursalBase(mes);
  }

  if (base === "VENTAS_TIPO_REGISTRO") {
    return obtenerVentasPorTipoRegistroBase(mes);
  }

  if (base === "CONTRATOS") {
    return obtenerContratosVentas(mes);
  }

  return obtenerVentasOperativas(mes);
}

function obtenerMontoVenta(item) {
  const posiblesMontos = [
    item.montoVenta,
    item.monto,
    item.totalVenta,
    item.total
  ];

  for (const valor of posiblesMontos) {
    const numero = Number(valor || 0);

    if (numero > 0) {
      return numero;
    }
  }

  return 0;
}

function obtenerUnidadesVenta(item) {
  const totalUnidades = Number(item.totalUnidades || 0);

  if (totalUnidades > 0) {
    return totalUnidades;
  }

  const sumaUnidades =
    Number(item.serviciosAf || 0)
    + Number(item.serviciosCh || 0)
    + Number(item.tsTsc || 0)
    + Number(item.propiedades || 0)
    + Number(item.nichos || 0);

  if (sumaUnidades > 0) {
    return sumaUnidades;
  }

  return obtenerMontoVenta(item) > 0 ? 1 : 0;
}

function obtenerNombreClienteVenta(item) {
  const cliente = normalizarTexto(item.cliente);

  if (cliente) {
    return cliente;
  }

  const partes = [
    item.nombre,
    item.apellidoPaterno,
    item.apellidoMaterno
  ]
    .map((parte) => normalizarTexto(parte))
    .filter(Boolean);

  return partes.length > 0
    ? partes.join(" ")
    : "Sin cliente";
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

function formatoPorcentaje(valor) {
  return new Intl.NumberFormat("es-MX", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(Number(valor || 0));
}

function escaparHtml(valor) {
  return String(valor || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function obtenerFechaHoraActual() {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());
}

window.renderDashboard = renderDashboard;
window.actualizarDatosDashboard = actualizarDatosDashboard;
