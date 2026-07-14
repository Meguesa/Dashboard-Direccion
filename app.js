window.state = {
  anioSeleccionado: "2026",
  mesSeleccionado: "2026-07",
  datos: {
    ingresos: [],
    egresos: [],
    ventas: [],
    servicios: [],
    metasCobranza: []
  }
};

const state = window.state;
const dashboardCharts = {};

const DASHBOARD_CACHE_KEY = "dashboardDireccionUltimosDatos";
const DASHBOARD_REFRESH_MS = 60 * 60 * 1000;

let intervaloActualizacionDashboard = null;
let actualizacionEnCurso = false;
let cacheCargadoDashboard = false;
let statusPanelTimeoutId = null;

document.addEventListener("DOMContentLoaded", () => {
  inicializarDashboard();
});

function inicializarDashboard() {
  cacheCargadoDashboard = cargarDatosDesdeCache();
  sincronizarAnioConMesSeleccionado();
  cargarSelectorAnios();
  cargarSelectorMeses();
  conectarEventos();
  conectarNavegacionInterna();
  conectarFiltrosTablas();
  renderDashboard();
  mostrarPagina("resumen");
  ocultarPanelEstado();
  iniciarActualizacionAutomatica();
}

function cargarSelectorAnios() {
  const selector = document.getElementById("yearSelector");

  if (!selector) {
    return;
  }

  selector.innerHTML = "";

  const anios = obtenerAniosDashboard();

  anios.forEach((anio) => {
    const option = document.createElement("option");
    option.value = anio;
    option.textContent = anio;

    if (anio === state.anioSeleccionado) {
      option.selected = true;
    }

    selector.appendChild(option);
  });
}

function obtenerAniosDashboard() {
  const anioActual = new Date().getFullYear();
  const anios = new Set();

  const anioInicial = anioActual - 5;
  const anioFinal = anioActual + 5;

  for (let anio = anioInicial; anio <= anioFinal; anio++) {
    anios.add(String(anio));
  }

  if (state.anioSeleccionado) {
    anios.add(String(state.anioSeleccionado));
  }

  const anioDesdeMes = obtenerAnioDesdeClaveMes(state.mesSeleccionado);

  if (anioDesdeMes) {
    anios.add(anioDesdeMes);
  }

  agregarAniosDesdeLista(anios, state.datos.ingresos, ["mes", "hojaOrigen", "fuente"]);
  agregarAniosDesdeLista(anios, state.datos.egresos, ["mes", "mesHoja", "hojaOrigen", "fuente"]);
  agregarAniosDesdeLista(anios, state.datos.ventas, ["mes", "fecha", "fechaContrato", "hojaOrigen", "fuente"]);
  agregarAniosDesdeLista(anios, state.datos.servicios, ["mes", "fechaServicio", "fechaFin", "fuente"]);

  return Array.from(anios)
    .filter((anio) => Number.isFinite(Number(anio)))
    .sort((a, b) => Number(a) - Number(b));
}

function agregarAniosDesdeLista(anios, lista, campos) {
  (lista || []).forEach((item) => {
    campos.forEach((campo) => {
      extraerAniosDeTexto(item[campo]).forEach((anio) => {
        anios.add(anio);
      });
    });
  });
}

function extraerAniosDeTexto(valor) {
  const texto = normalizarTexto(valor);
  const coincidencias = texto.match(/20\d{2}/g);

  return coincidencias || [];
}

function cargarSelectorMeses() {
  const selector = document.getElementById("monthSelector");

  if (!selector) {
    return;
  }

  selector.innerHTML = "";

  obtenerMesesDelAnioSeleccionado().forEach((mes) => {
    const option = document.createElement("option");
    option.value = mes.clave;
    option.textContent = mes.nombre;

    if (mes.clave === state.mesSeleccionado) {
      option.selected = true;
    }

    selector.appendChild(option);
  });
}

function obtenerMesesDelAnioSeleccionado() {
  const anio = state.anioSeleccionado || obtenerAnioDesdeClaveMes(state.mesSeleccionado) || "2026";

  return (CONFIG.meses || []).map((mes) => {
    const numeroMes = obtenerNumeroMesDesdeClave(mes.clave)
      || String(mes.orden).padStart(2, "0");

    return {
      ...mes,
      clave: crearClaveMes(anio, numeroMes)
    };
  });
}

function crearClaveMes(anio, numeroMes) {
  return `${anio}-${String(numeroMes).padStart(2, "0")}`;
}

function obtenerAnioDesdeClaveMes(claveMes) {
  const partes = normalizarTexto(claveMes).split("-");

  return partes.length >= 2 ? partes[0] : "";
}

function obtenerNumeroMesDesdeClave(claveMes) {
  const partes = normalizarTexto(claveMes).split("-");

  return partes.length >= 2 ? partes[1] : "";
}

function sincronizarAnioConMesSeleccionado() {
  const anioDesdeMes = obtenerAnioDesdeClaveMes(state.mesSeleccionado);
  const numeroMes = obtenerNumeroMesDesdeClave(state.mesSeleccionado) || "01";

  if (!state.anioSeleccionado && anioDesdeMes) {
    state.anioSeleccionado = anioDesdeMes;
  }

  if (!state.anioSeleccionado) {
    state.anioSeleccionado = "2026";
  }

  state.mesSeleccionado = crearClaveMes(state.anioSeleccionado, numeroMes);
}

function conectarEventos() {
  const yearSelector = document.getElementById("yearSelector");
  const selector = document.getElementById("monthSelector");
  const refreshButton = document.getElementById("refreshButton");
  const testSharePointButton = document.getElementById("testSharePointButton");
  const getListsButton = document.getElementById("getListsButton");
  const getIngresosButton = document.getElementById("getIngresosButton");

  if (yearSelector) {
    yearSelector.addEventListener("change", (event) => {
      const numeroMesActual = obtenerNumeroMesDesdeClave(state.mesSeleccionado) || "01";
  
      state.anioSeleccionado = event.target.value;
      state.mesSeleccionado = crearClaveMes(state.anioSeleccionado, numeroMesActual);
  
      cargarSelectorMeses();
      renderDashboard();
    });
  }
  
  if (selector) {
    selector.addEventListener("change", (event) => {
      state.mesSeleccionado = event.target.value;
      state.anioSeleccionado = obtenerAnioDesdeClaveMes(state.mesSeleccionado) || state.anioSeleccionado;
  
      cargarSelectorAnios();
      renderDashboard();
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      await actualizarDatosDashboard({
        mensaje: "Actualizando información manualmente..."
      });
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

async function actualizarDatosDashboard(opciones = {}) {
  if (actualizacionEnCurso) {
    return;
  }

  actualizacionEnCurso = true;

  const mensaje = opciones.mensaje || "Actualizando información desde SharePoint...";
  const modoCargaSolicitado = opciones.modoCarga || (cacheCargadoDashboard ? "incremental" : "completa");

  mostrarPanelEstado(
    mensaje,
    modoCargaSolicitado === "incremental"
      ? "Leyendo solo el mes actual y el mes anterior."
      : "Leyendo información completa inicial desde SharePoint."
  );

  try {
    const datosSharePoint = await cargarDatosSharePoint({
      modoCarga: modoCargaSolicitado
    });

    if (!datosSharePoint) {
      mostrarPanelEstado(
        "No se pudo actualizar la información.",
        "SharePoint no devolvió datos para el dashboard."
      );
      return;
    }

    const mesesRecargados = datosSharePoint.mesesRecargados || [];

    state.datos.ingresos = reemplazarRegistrosPorMes(
      state.datos.ingresos,
      datosSharePoint.ingresos || [],
      mesesRecargados
    );

    state.datos.egresos = reemplazarRegistrosPorMes(
      state.datos.egresos,
      datosSharePoint.egresos || [],
      mesesRecargados
    );

    state.datos.ventas = reemplazarRegistrosPorMes(
      state.datos.ventas,
      datosSharePoint.ventas || [],
      mesesRecargados
    );

    state.datos.servicios = reemplazarRegistrosPorMes(
      state.datos.servicios,
      datosSharePoint.servicios || [],
      mesesRecargados
    );

    state.datos.metasCobranza = reemplazarRegistrosPorMes(
      state.datos.metasCobranza,
      datosSharePoint.metasCobranza || [],
      mesesRecargados
    );

    cargarSelectorAnios();
    cargarSelectorMeses();

    guardarDatosEnCache();
    cacheCargadoDashboard = true;

    renderDashboard();

    const detalleFinal = mesesRecargados.length > 0
      ? `Actualización incremental completada: ${mesesRecargados.join(", ")}.`
      : "Carga completa inicial terminada correctamente.";

    mostrarPanelEstado("Datos actualizados correctamente.", detalleFinal);
  } catch (error) {
    console.error("Error actualizando dashboard:", error);
    mostrarPanelEstado(
      "No se pudo actualizar la información.",
      error.message || "Revisa la consola del navegador."
    );
  } finally {
    actualizacionEnCurso = false;

    ocultarPanelEstadoConRetraso(12000);
  }
}

function reemplazarRegistrosPorMes(registrosActuales = [], registrosNuevos = [], mesesRecargados = []) {
  const meses = (mesesRecargados || [])
    .map((mes) => normalizarTexto(mes))
    .filter(Boolean);

  if (!meses.length) {
    return registrosNuevos || [];
  }

  const registrosConservados = (registrosActuales || [])
    .filter((item) => !registroPerteneceAMeses(item, meses));

  return [
    ...registrosConservados,
    ...(registrosNuevos || [])
  ];
}

function registroPerteneceAMeses(item, meses) {
  const mesItem = normalizarTexto(item?.mes);

  if (meses.includes(mesItem)) {
    return true;
  }

  return meses.some((mes) => {
    if (typeof coincidePeriodoVenta === "function" && coincidePeriodoVenta(item, mes)) {
      return true;
    }

    return coincideMesGenerico(item, mes);
  });
}

function coincideMesGenerico(item, mesSeleccionado) {
  const mesItem = normalizarTexto(item?.mes).toUpperCase();
  const mesSeleccionadoNormalizado = normalizarTexto(mesSeleccionado).toUpperCase();

  if (!mesItem || !mesSeleccionadoNormalizado) {
    return false;
  }

  if (mesItem === mesSeleccionadoNormalizado) {
    return true;
  }

  const nombreMes = obtenerNombreMesDesdeClave(mesSeleccionadoNormalizado);

  return mesItem === nombreMes;
}

function guardarDatosEnCache() {
    const payload = {
      fechaGuardado: new Date().toISOString(),
      anioSeleccionado: state.anioSeleccionado,
      mesSeleccionado: state.mesSeleccionado,
      datos: {
        ingresos: state.datos.ingresos || [],
        egresos: state.datos.egresos || [],
        ventas: state.datos.ventas || [],
        servicios: state.datos.servicios || [],
        metasCobranza: state.datos.metasCobranza || []
      }
  };

  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("No se pudo guardar caché del dashboard:", error);
  }
}

function cargarDatosDesdeCache() {
  try {
    const cacheTexto = localStorage.getItem(DASHBOARD_CACHE_KEY);

    if (!cacheTexto) {
      return false;
    }

    const cache = JSON.parse(cacheTexto);

    if (!cache || !cache.datos) {
      return false;
    }

    state.datos.ingresos = cache.datos.ingresos || [];
    state.datos.egresos = cache.datos.egresos || [];
    state.datos.ventas = cache.datos.ventas || [];
    state.datos.servicios = cache.datos.servicios || [];
    state.datos.metasCobranza = cache.datos.metasCobranza || [];

    if (cache.anioSeleccionado) {
      state.anioSeleccionado = cache.anioSeleccionado;
    }
    
    if (cache.mesSeleccionado) {
      state.mesSeleccionado = cache.mesSeleccionado;
    }
    
    sincronizarAnioConMesSeleccionado();

    return true;
  } catch (error) {
    console.warn("No se pudo cargar caché del dashboard:", error);
    return false;
  }
}

function iniciarActualizacionAutomatica() {
  if (intervaloActualizacionDashboard) {
    clearInterval(intervaloActualizacionDashboard);
  }

  intervaloActualizacionDashboard = setInterval(async () => {
    if (typeof window.haySesionActiva === "function" && !window.haySesionActiva()) {
      return;
    }

    await actualizarDatosDashboard({
      mensaje: "Actualizando información automáticamente..."
    });
  }, DASHBOARD_REFRESH_MS);
}

function mostrarPanelEstado(mensaje, detalle = "") {
  const panel = document.getElementById("statusPanel");

  if (statusPanelTimeoutId) {
    clearTimeout(statusPanelTimeoutId);
    statusPanelTimeoutId = null;
  }

  if (panel) {
    panel.classList.remove("hidden");
  }

  setAuthStatus(mensaje);

  if (detalle) {
    setText("sharePointStatus", detalle);
  }
}

function ocultarPanelEstado() {
  const panel = document.getElementById("statusPanel");

  if (statusPanelTimeoutId) {
    clearTimeout(statusPanelTimeoutId);
    statusPanelTimeoutId = null;
  }

  if (panel) {
    panel.classList.add("hidden");
  }
}

function ocultarPanelEstadoConRetraso(ms = 12000) {
  if (statusPanelTimeoutId) {
    clearTimeout(statusPanelTimeoutId);
  }

  statusPanelTimeoutId = setTimeout(() => {
    ocultarPanelEstado();
  }, ms);
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
  
    setTimeout(() => {
    redimensionarGraficas();
  }, 80);
  
}

function renderDashboard() {
  const mes = state.mesSeleccionado;

  const totalIngresos = sumarIngresos(mes);
  const totalEgresos = sumarEgresos(mes);
  const totalVentas = sumarVentas(mes);
  const totalContratos = contarContratos(mes);
  const metaVentas = sumarMetaVentasMensual(mes);
  const porcentajeCumplimientoVentas = metaVentas > 0
    ? totalVentas / metaVentas
    : 0;

  const totalCapillas = contarServiciosPorOrigen(mes, "CAPILLA");
  const totalCapillasUsoInmediato = contarServiciosCapillasPorTipoContrato(mes, "USO INMEDIATO");
  const totalCapillasPrevision = contarServiciosCapillasPorTipoContrato(mes, "PREVISION");
  const totalParque = contarServiciosPorOrigen(mes, "PARQUE");
  const totalServicios = totalCapillas + totalParque;

  
  const registrosIngresos = contarRegistrosIngresos(mes);
  const metaIngresos = sumarMetaCobranzaMensual(mes);
  const porcentajeCumplimientoIngresos = metaIngresos > 0
    ? totalIngresos / metaIngresos
    : 0;
  
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
  setText("pageIngresosMeta", formatoMoneda(metaIngresos));
  setText(
    "pageIngresosCumplimiento",
    metaIngresos > 0 ? formatoPorcentaje(porcentajeCumplimientoIngresos) : "—"
  );
  setText("pageIngresosRegistros", formatoNumero(registrosIngresos));
  setText("pageIngresosPromedio", formatoMoneda(promedioIngresos));
  
  setText("pageEgresosTotal", formatoMoneda(totalEgresos));
  setText("pageEgresosPorPagar", formatoMoneda(totalPorPagar));
  setText("pageEgresosRegistros", formatoNumero(registrosEgresos));
  setText("pageEgresosPromedio", formatoMoneda(promedioEgresos));

  const ticketsPromedioVentas = calcularTicketsPromedioVentasPorTipo(mes);
  
  setText("pageVentasTotal", formatoMoneda(totalVentas));
  setText("pageVentasMeta", formatoMoneda(metaVentas));
  setText(
    "pageVentasCumplimiento",
    metaVentas > 0 ? formatoPorcentaje(porcentajeCumplimientoVentas) : "—"
  );
  setText("pageVentasContratos", formatoNumero(totalContratos));
  
  setText(
    "pageVentasTicketPropiedades",
    formatoMoneda(ticketsPromedioVentas.propiedades.ticketPromedio)
  );
  
  setText(
    "pageVentasTicketServicios",
    formatoMoneda(ticketsPromedioVentas.servicios.ticketPromedio)
  );
  
  setText("pageServiciosTotal", formatoNumero(totalServicios));
  setText("pageServiciosCapillas", formatoNumero(totalCapillas));
  setText("pageServiciosCapillasUsoInmediato", formatoNumero(totalCapillasUsoInmediato));
  setText("pageServiciosCapillasPrevision", formatoNumero(totalCapillasPrevision));
  setText("pageServiciosParque", formatoNumero(totalParque));

  
  aplicarClaseFlujo("kpiFlujo", flujoNeto);

  setText("capillasTotal", formatoNumero(totalCapillas));
  setText("parqueTotal", formatoNumero(totalParque));
  setText("serviciosTotal", formatoNumero(totalServicios));

  setText("lastUpdate", obtenerFechaHoraActual());

  renderTablaFlujoEfectivo(mes);
  renderAvanceMetasCobranza(mes);
  renderServiciosDelDia();
  
  renderDetalleIngresos(mes, totalIngresos);
  renderDetalleEgresos(mes, totalEgresos);
  renderDetalleVentas(mes, totalVentas);
  renderDetalleServicios(mes, totalServicios);
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

function sumarMetaCobranzaMensual(mes) {
  return obtenerMetasCobranzaMes(mes)
    .reduce((total, meta) => total + Number(meta.metaMensual || 0), 0);
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

function sumarMetaVentasMensual(mes) {
  return agruparVentasPorAsesor(mes)
    .reduce((total, fila) => total + Number(fila.metaMensual || 0), 0);
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

function renderServiciosDelDia() {
  const servicios = state.datos.servicios || [];
  const ahora = new Date();

  const capillasActivos = [];
  const capillasProgramados = [];
  const parqueActivos = [];
  const parqueProgramados = [];

  servicios.forEach((item) => {
    const tipoOrigen = normalizarValorServicioDia(
      obtenerCampoServicio(item, [
        "tipoOrigen",
        "Tipo_Origen",
        "TipoOrigen"
      ])
    );

    const fechaInicio = convertirFechaServicio(
      obtenerCampoServicio(item, [
        "fechaServicio",
        "Fecha_Servicio",
        "FechaServicio"
      ])
    );

    const fechaFin = convertirFechaServicio(
      obtenerCampoServicio(item, [
        "fechaFin",
        "Fecha_Fin",
        "FechaFin"
      ])
    );

    if (!fechaInicio) {
      return;
    }

    const esCapillas = tipoOrigen === "CAPILLAS";
    const esParque = tipoOrigen === "PARQUE";

    const activo = estaServicioActivo(fechaInicio, fechaFin, ahora);
    const programado = estaServicioProgramadoHoy(fechaInicio, ahora);

    if (esCapillas) {
      if (activo) {
        capillasActivos.push(item);
        return;
      }

      if (programado) {
        capillasProgramados.push(item);
      }

      return;
    }

    if (esParque) {
      if (activo) {
        parqueActivos.push(item);
        return;
      }

      if (programado) {
        parqueProgramados.push(item);
      }
    }
  });

  ordenarServiciosPorInicio(capillasActivos);
  ordenarServiciosPorInicio(capillasProgramados);
  ordenarServiciosPorInicio(parqueActivos);
  ordenarServiciosPorInicio(parqueProgramados);

  renderTablaServiciosCapillasDia("tablaCapillasActivosBody", capillasActivos);
  renderTablaServiciosCapillasDia("tablaCapillasProgramadosBody", capillasProgramados);
  renderTablaServiciosParqueDia("tablaParqueActivosBody", parqueActivos);
  renderTablaServiciosParqueDia("tablaParqueProgramadosBody", parqueProgramados);

  setText(
    "serviciosDiaActualizado",
    `Hora local: ${formatearFechaHoraCorta(ahora)}`
  );

  console.log("Servicios del día:", {
    ahora: ahora.toString(),
    capillasActivos: capillasActivos.length,
    capillasProgramados: capillasProgramados.length,
    parqueActivos: parqueActivos.length,
    parqueProgramados: parqueProgramados.length
  });
}

function normalizarValorServicioDia(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function estaServicioActivo(fechaInicio, fechaFin, ahora) {
  if (!fechaInicio) {
    return false;
  }

  if (fechaFin) {
    return fechaInicio <= ahora && ahora <= fechaFin;
  }

  return esMismaFechaLocal(fechaInicio, ahora) && fechaInicio <= ahora;
}

function estaServicioProgramadoHoy(fechaInicio, ahora) {
  if (!fechaInicio) {
    return false;
  }

  return esMismaFechaLocal(fechaInicio, ahora) && fechaInicio > ahora;
}

function renderTablaServiciosCapillasDia(tbodyId, filas) {
  const tbody = document.getElementById(tbodyId);

  if (!tbody) {
    return;
  }

  if (!filas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">Sin servicios para mostrar.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas.map((item) => {
    const fechaInicio = convertirFechaServicio(
      obtenerCampoServicio(item, ["fechaServicio", "Fecha_Servicio", "FechaServicio"])
    );

    const fechaFin = convertirFechaServicio(
      obtenerCampoServicio(item, ["fechaFin", "Fecha_Fin", "FechaFin"])
    );

    const fallecido = obtenerCampoServicio(item, [
      "finado",
      "Finado",
      "nombreFallecido",
      "Nombre_Fallecido"
    ]);

    const ubicacion = obtenerCampoServicio(item, [
      "sucursal",
      "Sucursal",
      "ubicacionServicio",
      "Ubicacion_Servicio",
      "ubicacion"
    ]);

    const sala = obtenerCampoServicio(item, [
      "sala",
      "Sala"
    ]);

    const tipoServicio = obtenerCampoServicio(item, [
      "tipoServicio",
      "Tipo_Servicio",
      "servicio",
      "Servicio"
    ]);

    return `
      <tr>
        <td>${escaparHtml(fallecido || "—")}</td>
        <td>${escaparHtml(ubicacion || "—")}</td>
        <td>${escaparHtml(sala || "—")}</td>
        <td>${escaparHtml(tipoServicio || "—")}</td>
        <td>${fechaInicio ? escaparHtml(formatearHoraCorta(fechaInicio)) : "—"}</td>
        <td>${fechaFin ? escaparHtml(formatearHoraCorta(fechaFin)) : "—"}</td>
      </tr>
    `;
  }).join("");
}

function renderTablaServiciosParqueDia(tbodyId, filas) {
  const tbody = document.getElementById(tbodyId);

  if (!tbody) {
    return;
  }

  if (!filas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Sin servicios para mostrar.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas.map((item) => {
    const fechaInicio = convertirFechaServicio(
      obtenerCampoServicio(item, ["fechaServicio", "Fecha_Servicio", "FechaServicio"])
    );

    const tipoServicio = obtenerCampoServicio(item, [
      "tipoServicio",
      "Tipo_Servicio",
      "servicio",
      "Servicio"
    ]);

    const servicioParque = obtenerCampoServicio(item, [
      "serviciosParque",
      "Servicios_Parque",
      "ServiciosParque"
    ]);

    const ubicacion = obtenerUbicacionParqueServicio(item);

    return `
      <tr>
        <td>${escaparHtml(tipoServicio || "—")}</td>
        <td>${escaparHtml(servicioParque || "—")}</td>
        <td>${escaparHtml(ubicacion || "—")}</td>
        <td>${fechaInicio ? escaparHtml(formatearFechaCorta(fechaInicio)) : "—"}</td>
        <td>${fechaInicio ? escaparHtml(formatearHoraCorta(fechaInicio)) : "—"}</td>
      </tr>
    `;
  }).join("");
}

function obtenerCampoServicio(item, nombres) {
  for (const nombre of nombres) {
    if (
      item &&
      item[nombre] !== undefined &&
      item[nombre] !== null &&
      String(item[nombre]).trim() !== ""
    ) {
      return String(item[nombre]).trim();
    }
  }

  return "";
}

function obtenerUbicacionParqueServicio(item) {
  const ubicacion = obtenerCampoServicio(item, [
    "ubicacionServicio",
    "Ubicacion_Servicio",
    "ubicacion",
    "Ubicacion"
  ]);

  if (ubicacion) {
    return ubicacion;
  }

  const seccion = obtenerCampoServicio(item, ["seccion", "Seccion", "Sección"]);
  const manzana = obtenerCampoServicio(item, ["manzana", "Manzana"]);
  const lote = obtenerCampoServicio(item, [
    "loteNicho",
    "Lote_Nicho",
    "NumLote_Nicho",
    "numLoteNicho"
  ]);

  return [seccion, manzana, lote].filter(Boolean).join(" / ");
}

function convertirFechaServicio(valor) {
  if (!valor) {
    return null;
  }

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor;
  }

  if (typeof valor === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const fecha = new Date(excelEpoch.getTime() + valor * 86400000);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const textoOriginal = String(valor).trim();

  if (!textoOriginal) {
    return null;
  }

  /*
    SharePoint Graph normalmente regresa fechas ISO:
    2026-07-14T16:00:00Z

    new Date() convierte automáticamente de UTC a la hora local del navegador.
  */
  const fechaIso = new Date(textoOriginal);

  if (!Number.isNaN(fechaIso.getTime())) {
    return fechaIso;
  }

  const texto = textoOriginal
    .replace(/\s+a\.?\s*m\.?/i, " AM")
    .replace(/\s+p\.?\s*m\.?/i, " PM")
    .replace(/\s+a\.m\.?/i, " AM")
    .replace(/\s+p\.m\.?/i, " PM");

  const match = texto.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i
  );

  if (!match) {
    return null;
  }

  const dia = Number(match[1]);
  const mes = Number(match[2]) - 1;
  const anio = Number(match[3]);
  let hora = Number(match[4] || 0);
  const minuto = Number(match[5] || 0);
  const periodo = String(match[6] || "").toUpperCase();

  if (periodo === "PM" && hora < 12) {
    hora += 12;
  }

  if (periodo === "AM" && hora === 12) {
    hora = 0;
  }

  const fecha = new Date(anio, mes, dia, hora, minuto, 0);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function esMismaFechaLocal(fechaA, fechaB) {
  return (
    fechaA.getFullYear() === fechaB.getFullYear() &&
    fechaA.getMonth() === fechaB.getMonth() &&
    fechaA.getDate() === fechaB.getDate()
  );
}

function ordenarServiciosPorInicio(filas) {
  filas.sort((a, b) => {
    const fechaA = convertirFechaServicio(
      obtenerCampoServicio(a, ["fechaServicio", "Fecha_Servicio", "FechaServicio"])
    );

    const fechaB = convertirFechaServicio(
      obtenerCampoServicio(b, ["fechaServicio", "Fecha_Servicio", "FechaServicio"])
    );

    return (fechaA?.getTime() || 0) - (fechaB?.getTime() || 0);
  });
}

function formatearFechaCorta(fecha) {
  return fecha.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatearHoraCorta(fecha) {
  return fecha.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatearFechaHoraCorta(fecha) {
  return fecha.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}


function contarServiciosPorOrigen(mes, origenBuscado) {
  return state.datos.servicios
    .filter((item) => {
      const esPeriodo = coincidePeriodoServicio(item, mes);
      const origen = obtenerOrigenServicio(item).toUpperCase();

      return esPeriodo
        && origen.includes(origenBuscado);
    })
    .length;
}

function contarServiciosCapillasPorTipoContrato(mes, tipoBuscado) {
  const tipoNormalizado = normalizarClaveComparacion(tipoBuscado);

  return state.datos.servicios
    .filter((item) => {
      const esMes = coincidePeriodoServicio(item, mes);
      const esCapillas = obtenerOrigenServicio(item) === "Capillas";
      const tipoRegistro = normalizarClaveComparacion(item.previsionUsoInmediato);

      return esMes
        && esCapillas
        && tipoRegistro.includes(tipoNormalizado);
    })
    .length;
}

function normalizarTexto(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  return String(valor).trim();
}

function normalizarClaveComparacion(valor) {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function redondear2(valor) {
  const numero = Number(valor || 0);

  if (!Number.isFinite(numero)) {
    return 0;
  }

  return Math.round((numero + Number.EPSILON) * 100) / 100;
}

function renderTablaFlujoEfectivo(mes) {
  const tbody = document.getElementById("tablaFlujoEfectivoBody");

  if (!tbody) {
    return;
  }

  const flujo = calcularFlujoEfectivo(mes);
  const filas = construirFilasFlujoEfectivo(flujo);

  tbody.innerHTML = filas
    .map((fila) => renderFilaFlujoEfectivo(fila, flujo.totalIngresos))
    .join("");

  conectarFilasExpandiblesFlujo();
}

function calcularFlujoEfectivo(mes) {
  const ingresos = obtenerDetalleIngresosFlujo(mes);

  const costosVariablesDirectos = obtenerDetalleEgresosFlujo(mes, "COSTOS_VARIABLES_DIRECTOS");
  const costosVariablesOperativos = obtenerDetalleEgresosFlujo(mes, "COSTOS_VARIABLES_OPERATIVOS");
  const costosFijos = obtenerDetalleEgresosFlujo(mes, "COSTOS_FIJOS");
  const accionistas = obtenerDetalleEgresosFlujo(mes, "ACCIONISTAS");
  const reinversion = obtenerDetalleEgresosFlujo(mes, "REINVERSION");

  const totalIngresos = sumarTotalFlujo(ingresos);
  const totalCostosVariablesDirectos = sumarTotalFlujo(costosVariablesDirectos);
  const totalCostosVariablesOperativos = sumarTotalFlujo(costosVariablesOperativos);
  const totalCostosFijos = sumarTotalFlujo(costosFijos);
  const totalAccionistas = sumarTotalFlujo(accionistas);
  const totalReinversion = sumarTotalFlujo(reinversion);

  const flujoOperativo = totalIngresos
    - totalCostosVariablesDirectos
    - totalCostosVariablesOperativos
    - totalCostosFijos;

  const flujoLibre = flujoOperativo - totalAccionistas;
  const flujoNeto = flujoLibre - totalReinversion;

  return {
    totalIngresos,
    ingresos,
    costosVariablesDirectos,
    totalCostosVariablesDirectos,
    costosVariablesOperativos,
    totalCostosVariablesOperativos,
    costosFijos,
    totalCostosFijos,
    flujoOperativo,
    accionistas,
    totalAccionistas,
    flujoLibre,
    reinversion,
    totalReinversion,
    flujoNeto
  };
}

function construirFilasFlujoEfectivo(flujo) {
  return [
    {
      tipo: "grupo",
      id: "ingresos",
      concepto: "INGRESO / COBRANZA",
      total: flujo.totalIngresos,
      detalles: flujo.ingresos,
      signo: "positivo"
    },
    {
      tipo: "grupo",
      id: "costosVariablesDirectos",
      concepto: "COSTOS VARIABLES DIRECTOS",
      total: flujo.totalCostosVariablesDirectos,
      detalles: flujo.costosVariablesDirectos,
      signo: "negativo"
    },
    {
      tipo: "grupo",
      id: "costosVariablesOperativos",
      concepto: "COSTOS VARIABLES OPERATIVOS",
      total: flujo.totalCostosVariablesOperativos,
      detalles: flujo.costosVariablesOperativos,
      signo: "negativo"
    },
    {
      tipo: "grupo",
      id: "costosFijos",
      concepto: "COSTOS FIJOS",
      total: flujo.totalCostosFijos,
      detalles: flujo.costosFijos,
      signo: "negativo"
    },
    {
      tipo: "resultado",
      concepto: "FLUJO OPERATIVO",
      total: flujo.flujoOperativo,
      signo: flujo.flujoOperativo >= 0 ? "positivo" : "negativo"
    },
    {
      tipo: "grupo",
      id: "accionistas",
      concepto: "ACCIONISTAS",
      total: flujo.totalAccionistas,
      detalles: flujo.accionistas,
      signo: "negativo"
    },
    {
      tipo: "resultado",
      concepto: "FLUJO LIBRE",
      total: flujo.flujoLibre,
      signo: flujo.flujoLibre >= 0 ? "positivo" : "negativo"
    },
    {
      tipo: "grupo",
      id: "reinversion",
      concepto: "REINVERSIÓN",
      total: flujo.totalReinversion,
      detalles: flujo.reinversion,
      signo: "negativo"
    },
    {
      tipo: "resultado-final",
      concepto: "FLUJO NETO",
      total: flujo.flujoNeto,
      signo: flujo.flujoNeto >= 0 ? "positivo" : "negativo"
    }
  ];
}

function renderFilaFlujoEfectivo(fila, totalIngresos) {
  const porcentaje = totalIngresos > 0 ? fila.total / totalIngresos : 0;
  const porcentajeAbsoluto = Math.abs(porcentaje);
  const porcentajeBarra = Math.min(porcentajeAbsoluto * 100, 100);

  if (fila.tipo === "grupo") {
    const tieneDetalles = Array.isArray(fila.detalles) && fila.detalles.length > 0;

    const filaPrincipal = `
      <tr class="flujo-row flujo-row-grupo" data-flujo-grupo="${fila.id}">
        <td>
          <button class="flujo-toggle" type="button" ${tieneDetalles ? "" : "disabled"}>
            ${tieneDetalles ? "▸" : "•"}
          </button>
          <strong>${escaparHtml(fila.concepto)}</strong>
        </td>
        <td class="flujo-total ${fila.signo}">
          ${formatoMoneda(fila.total)}
        </td>
        <td class="flujo-percent-cell">
          ${renderBarraPorcentajeFlujo(porcentaje, porcentajeBarra, fila.signo)}
        </td>
      </tr>
    `;

    const filasDetalle = (fila.detalles || [])
      .map((detalle) => {
        const porcentajeDetalle = totalIngresos > 0 ? detalle.total / totalIngresos : 0;
        const porcentajeBarraDetalle = Math.min(Math.abs(porcentajeDetalle) * 100, 100);

        return `
          <tr class="flujo-row flujo-row-detalle hidden" data-flujo-parent="${fila.id}">
            <td>
              <span class="flujo-detalle-label">${escaparHtml(detalle.nombre)}</span>
            </td>
            <td class="flujo-total detalle">
              ${formatoMoneda(detalle.total)}
            </td>
            <td class="flujo-percent-cell">
              ${renderBarraPorcentajeFlujo(porcentajeDetalle, porcentajeBarraDetalle, fila.signo)}
            </td>
          </tr>
        `;
      })
      .join("");

    return filaPrincipal + filasDetalle;
  }

  return `
    <tr class="flujo-row flujo-row-${fila.tipo}">
      <td>
        <strong>${escaparHtml(fila.concepto)}</strong>
      </td>
      <td class="flujo-total ${fila.signo}">
        ${formatoMoneda(fila.total)}
      </td>
      <td class="flujo-percent-cell">
        ${renderBarraPorcentajeFlujo(porcentaje, porcentajeBarra, fila.signo)}
      </td>
    </tr>
  `;
}

function renderBarraPorcentajeFlujo(porcentaje, porcentajeBarra, signo) {
  const claseSigno = signo === "negativo" ? "negativo" : "positivo";
  const texto = formatoPorcentaje(porcentaje);

  return `
    <div class="flujo-percent-wrapper">
      <span class="flujo-percent-text">${texto}</span>
      <span class="flujo-percent-track">
        <span class="flujo-percent-bar ${claseSigno}" style="width: ${porcentajeBarra}%;"></span>
      </span>
    </div>
  `;
}

function conectarFilasExpandiblesFlujo() {
  document.querySelectorAll(".flujo-row-grupo").forEach((fila) => {
    fila.addEventListener("click", () => {
      const grupo = fila.dataset.flujoGrupo;
      const boton = fila.querySelector(".flujo-toggle");

      if (!grupo || !boton || boton.disabled) {
        return;
      }

      const estaAbierto = fila.classList.toggle("is-open");

      boton.textContent = estaAbierto ? "▾" : "▸";

      document.querySelectorAll(`[data-flujo-parent="${grupo}"]`).forEach((detalle) => {
        detalle.classList.toggle("hidden", !estaAbierto);
      });
    });
  });
}

function obtenerDetalleIngresosFlujo(mes) {
  const grupos = new Map();

  state.datos.ingresos
    .filter((item) => normalizarTexto(item.mes) === mes)
    .forEach((item) => {
      const nombre = obtenerSubgrupoIngresoFlujo(item);
      const importe = Number(item.importe || 0);

      if (!grupos.has(nombre)) {
        grupos.set(nombre, {
          nombre,
          total: 0
        });
      }

      grupos.get(nombre).total += importe;
    });

  return ordenarDetalleFlujo(Array.from(grupos.values()));
}

function obtenerDetalleEgresosFlujo(mes, grupoBuscado) {
  const grupos = new Map();

  state.datos.egresos
    .filter((item) => normalizarTexto(item.mes) === mes)
    .filter((item) => obtenerGrupoEgresoFlujo(item) === grupoBuscado)
    .forEach((item) => {
      const nombre = obtenerSubgrupoEgresoFlujo(item);
      const pagado = Number(item.pagado || 0);

      if (pagado <= 0) {
        return;
      }

      if (!grupos.has(nombre)) {
        grupos.set(nombre, {
          nombre,
          total: 0
        });
      }

      grupos.get(nombre).total += pagado;
    });

  return ordenarDetalleFlujo(Array.from(grupos.values()));
}

function sumarTotalFlujo(lista) {
  return (lista || []).reduce((suma, item) => {
    return suma + Number(item.total || 0);
  }, 0);
}

function ordenarDetalleFlujo(lista) {
  return (lista || [])
    .filter((item) => Number(item.total || 0) !== 0)
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
}

function obtenerSubgrupoIngresoFlujo(item) {
  const categoria = normalizarClaveComparacion(item.categoria);
  const subcategoria = normalizarClaveComparacion(item.subcategoria);
  const texto = `${categoria} ${subcategoria}`;

  if (texto.includes("DESTAPE")) {
    return "DESTAPES";
  }

  if (
    texto.includes("ENGANCHE") ||
    texto.includes("ENGACHES") ||
    /\bENG\b/.test(texto)
  ) {
    return "ENGANCHES";
  }

  if (
    texto.includes("ANUALIDAD") ||
    texto.includes("ANUALIDADES") ||
    /\bANUA\b/.test(texto)
  ) {
    return "ANUALIDADES";
  }

  if (texto.includes("USO INMEDIATO") || /\bUI\b/.test(texto)) {
    return "USO INMEDIATO";
  }

  if (
    texto.includes("COBRANZA") ||
    texto.includes("MENSUALIDAD") ||
    /\bMEN\b/.test(texto)
  ) {
    return "COBRANZA";
  }

  return normalizarTexto(item.subcategoria || item.categoria || "OTROS INGRESOS").toUpperCase();
}

function obtenerGrupoEgresoFlujo(item) {
  const tipoGasto = normalizarClaveComparacion(item.tipoGasto);
  const rubro = normalizarClaveComparacion(item.rubro);
  const texto = `${tipoGasto} ${rubro}`;

  if (esRubroAccionistasFlujo(texto)) {
    return "ACCIONISTAS";
  }

  if (esRubroReinversionFlujo(texto)) {
    return "REINVERSION";
  }

  if (esRubroVariableOperativoFlujo(texto)) {
    return "COSTOS_VARIABLES_OPERATIVOS";
  }

  if (esRubroVariableDirectoFlujo(texto)) {
    return "COSTOS_VARIABLES_DIRECTOS";
  }

  if (tipoGasto === "GF") {
    return "COSTOS_FIJOS";
  }

  if (tipoGasto === "GV") {
    return "COSTOS_VARIABLES_DIRECTOS";
  }

  if (tipoGasto === "RE") {
    return "REINVERSION";
  }

  if (tipoGasto === "SACC") {
    return "ACCIONISTAS";
  }

  return "COSTOS_FIJOS";
}

function obtenerSubgrupoEgresoFlujo(item) {
  const rubro = normalizarTexto(item.rubro);

  if (!rubro) {
    return "OTROS";
  }

  return rubro.toUpperCase();
}

function esRubroVariableDirectoFlujo(texto) {
  return texto.includes("CREMATORIO") ||
    texto.includes("ATAUD") ||
    texto.includes("URNA") ||
    texto.includes("INHUMACION") ||
    texto.includes("EMBALSAMAMIENTO") ||
    texto.includes("INSUMOS PARA SERVICIOS") ||
    texto.includes("GASOLINA") ||
    texto.includes("COVID");
}

function esRubroVariableOperativoFlujo(texto) {
  return texto.includes("COMISION") ||
    texto.includes("PUBLICIDAD") ||
    texto.includes("MARKETING") ||
    texto.includes("VENTAS");
}

function esRubroReinversionFlujo(texto) {
  return texto.includes("REINVERSION") ||
    texto.includes("PANTEON CONSTRUCCION") ||
    texto.includes("CAPILLAS AF") ||
    texto.includes("CAPILLAS CH") ||
    texto.includes("EVENTOS") ||
    texto.includes("ADQUISICION") ||
    texto.includes("CONSULTORIA") ||
    texto.includes("PANTEON OTROS");
}

function esRubroAccionistasFlujo(texto) {
  return texto.includes("ACCIONISTA") ||
    texto.includes("SACC") ||
    texto.includes("MAMG") ||
    texto.includes("MMMG");
}

const AREAS_META_COBRANZA = [
  "Panteon",
  "Servicios CH",
  "Servicios AF",
  "Total Service"
];

function renderAvanceMetasCobranza(mes) {
  const tbody = document.getElementById("tablaMetasCobranzaBody");

  if (!tbody) {
    return;
  }

  const filas = calcularAvanceMetasCobranza(mes);
  const total = calcularTotalAvanceMetasCobranza(filas);

  setText("metasCobranzaCumplimiento", formatoPorcentaje(total.porcentajeCumplido));

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">No hay metas de cobranza configuradas para este mes.</td>
      </tr>
    `;
    return;
  }

  const filasHtml = filas
    .map((fila) => renderFilaMetaCobranza(fila, false))
    .join("");

  const totalHtml = renderFilaMetaCobranza(total, true);

  tbody.innerHTML = filasHtml + totalHtml;
}

function calcularAvanceMetasCobranza(mes) {
  const metasMes = obtenerMetasCobranzaMes(mes);
  const areas = obtenerAreasOrdenadasMetasCobranza(metasMes);

  return areas
    .map((area) => {
      const real = calcularRealCobranzaArea(mes, area);
      const meta = obtenerMetaCobranzaArea(metasMes, area);
      const porcentajeCumplido = meta > 0 ? real / meta : 0;
      const porCumplir = Math.max(meta - real, 0);

      return {
        area,
        real,
        meta,
        porcentajeCumplido,
        porCumplir
      };
    })
    .filter((fila) => fila.meta > 0 || fila.real > 0);
}

function calcularTotalAvanceMetasCobranza(filas) {
  const real = filas.reduce((suma, fila) => suma + Number(fila.real || 0), 0);
  const meta = filas.reduce((suma, fila) => suma + Number(fila.meta || 0), 0);
  const porcentajeCumplido = meta > 0 ? real / meta : 0;
  const porCumplir = Math.max(meta - real, 0);

  return {
    area: "TOTAL",
    real,
    meta,
    porcentajeCumplido,
    porCumplir
  };
}

function renderFilaMetaCobranza(fila, esTotal) {
  const porcentajeBarra = Math.min(fila.porcentajeCumplido * 100, 100);
  const claseCumplimiento = fila.porcentajeCumplido >= 1 ? "cumplido" : "pendiente";

  return `
    <tr class="${esTotal ? "metas-total-row" : ""}">
      <td>${escaparHtml(fila.area)}</td>
      <td>${formatoMoneda(fila.real)}</td>
      <td>${formatoMoneda(fila.meta)}</td>
      <td>
        <div class="meta-progress-wrapper">
          <span class="meta-progress-text">
            ${formatoPorcentaje(fila.porcentajeCumplido)}
          </span>
          <span class="meta-progress-track">
            <span
              class="meta-progress-bar ${claseCumplimiento}"
              style="width: ${porcentajeBarra}%;"
            ></span>
          </span>
        </div>
      </td>
      <td>${formatoMoneda(fila.porCumplir)}</td>
    </tr>
  `;
}

function obtenerMetasCobranzaMes(mes) {
  return (state.datos.metasCobranza || [])
    .filter((meta) => {
      const esMes = normalizarTexto(meta.mes) === mes;
      const estaActivo = meta.activo !== false;

      return esMes && estaActivo;
    })
    .map((meta) => {
      return {
        ...meta,
        area: normalizarAreaMetaCobranza(meta.area)
      };
    });
}

function obtenerAreasOrdenadasMetasCobranza(metasMes) {
  const areas = new Set();

  AREAS_META_COBRANZA.forEach((area) => areas.add(area));

  metasMes.forEach((meta) => {
    if (meta.area) {
      areas.add(meta.area);
    }
  });

  return Array.from(areas)
    .sort((a, b) => obtenerOrdenAreaMetaCobranza(a) - obtenerOrdenAreaMetaCobranza(b));
}

function obtenerMetaCobranzaArea(metasMes, areaBuscada) {
  const areaNormalizada = normalizarAreaMetaCobranza(areaBuscada);

  return metasMes
    .filter((meta) => normalizarAreaMetaCobranza(meta.area) === areaNormalizada)
    .reduce((suma, meta) => suma + Number(meta.metaMensual || 0), 0);
}

function calcularRealCobranzaArea(mes, areaBuscada) {
  const areaNormalizada = normalizarAreaMetaCobranza(areaBuscada);

  return (state.datos.ingresos || [])
    .filter((item) => normalizarTexto(item.mes) === mes)
    .filter((item) => clasificarAreaIngresoCobranza(item) === areaNormalizada)
    .reduce((suma, item) => suma + Number(item.importe || 0), 0);
}

function clasificarAreaIngresoCobranza(item) {
  const banco = normalizarClaveComparacion(item.banco);

  if (!esBancoValidoMetaCobranza(banco)) {
    return "Sin área";
  }

  const categoria = normalizarClaveComparacion(item.categoria);
  const subcategoria = normalizarClaveComparacion(item.subcategoria);
  const texto = `${categoria} ${subcategoria}`.replace(/\s+/g, " ").trim();

  if (coincideCategoriaMetaCobranza(texto, [
    "COB PROP",
    "ENG PROP",
    "PAGOS EX PROP"
  ])) {
    return "Panteon";
  }

  if (coincideCategoriaMetaCobranza(texto, [
    "COBRANZA SERVICIO CH",
    "ENG CH",
    "PAGOS EX CH"
  ])) {
    return "Servicios CH";
  }

  if (coincideCategoriaMetaCobranza(texto, [
    "COBRANZA AGUA FRIA",
    "ENG AF",
    "PAGOS EX AF"
  ])) {
    return "Servicios AF";
  }

  if (coincideCategoriaMetaCobranza(texto, [
    "MENSUALIDAD TS",
    "PAGOS EX TS",
    "TSC",
    "PAGOS EX TSC"
  ])) {
    return "Total Service";
  }

  return "Sin área";
}

function esBancoValidoMetaCobranza(banco) {
  return banco.includes("BANAMEX") ||
    banco.includes("BANREGIO") ||
    banco.includes("JDJP") ||
    banco.includes("CAJA");
}

function coincideCategoriaMetaCobranza(texto, categoriasPermitidas) {
  return categoriasPermitidas.some((categoriaPermitida) => {
    const categoriaNormalizada = normalizarClaveComparacion(categoriaPermitida);

    return texto.includes(categoriaNormalizada);
  });
}

function normalizarAreaMetaCobranza(area) {
  const texto = normalizarClaveComparacion(area);

  if (
    texto.includes("PANTEON") ||
    texto.includes("PANTEON")
  ) {
    return "Panteon";
  }

  if (
    texto.includes("SERVICIOS CH") ||
    texto.includes("SERVICIO CH") ||
    texto.includes("CHURUBUSCO") ||
    texto === "CH"
  ) {
    return "Servicios CH";
  }

  if (
    texto.includes("SERVICIOS AF") ||
    texto.includes("SERVICIO AF") ||
    texto.includes("AGUA FRIA") ||
    texto.includes("APODACA") ||
    texto === "AF"
  ) {
    return "Servicios AF";
  }

  if (
    texto.includes("TOTAL SERVICE") ||
    texto.includes("TOTAL SERVIC") ||
    texto === "TS" ||
    texto === "TSC"
  ) {
    return "Total Service";
  }

  return normalizarTexto(area) || "Sin área";
}

function obtenerOrdenAreaMetaCobranza(area) {
  const areaNormalizada = normalizarAreaMetaCobranza(area);

  const orden = {
    "Panteon": 1,
    "Servicios CH": 2,
    "Servicios AF": 3,
    "Total Service": 4,
    "Sin área": 99
  };

  return orden[areaNormalizada] || 98;
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
  
  renderGraficasIngresos(mes);
}

function renderGraficasIngresos(mes) {
  if (typeof Chart === "undefined") {
    return;
  }

  renderGraficaIngresosMensuales();
  renderGraficaPieIngresos({
    canvasId: "chartIngresosBanco",
    chartKey: "ingresosBanco",
    mes,
    campo: "banco",
    etiquetaVacia: "Sin banco"
  });

  renderGraficaPieIngresos({
    canvasId: "chartIngresosCategoria",
    chartKey: "ingresosCategoria",
    mes,
    campo: "categoria",
    etiquetaVacia: "Sin categoría"
  });
}

function renderGraficaIngresosMensuales() {
  const canvas = document.getElementById("chartIngresosMensuales");

  if (!canvas) {
    return;
  }

  const meses = obtenerMesesDelAnioSeleccionado();

  const labels = meses.map((mes) => mes.nombre);
  const valoresIngresos = meses.map((mes) => sumarIngresos(mes.clave));
  const valoresMetas = meses.map((mes) => sumarMetaCobranzaMensual(mes.clave));

  const datasets = [
    {
      label: "Ingreso total",
      data: valoresIngresos,
      tension: 0.3,
      fill: false,
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 6
    }
  ];

  const hayMetas = valoresMetas.some((valor) => Number(valor || 0) > 0);

  if (hayMetas) {
    datasets.push({
      label: "Meta mensual total",
      data: valoresMetas,
      tension: 0.3,
      fill: false,
      borderWidth: 3,
      borderDash: [6, 6],
      pointRadius: 4,
      pointHoverRadius: 6
    });
  }

  destruirGrafica("ingresosMensuales");

  dashboardCharts.ingresosMensuales = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const etiqueta = context.dataset.label || "Monto";
              return `${etiqueta}: ${formatoMoneda(context.parsed.y || 0)}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatoMoneda(value)
          }
        }
      }
    }
  });
}

function renderGraficaPieIngresos(configuracion) {
  const canvas = document.getElementById(configuracion.canvasId);

  if (!canvas) {
    return;
  }

  const filas = agruparIngresosPorCampo(
    configuracion.mes,
    configuracion.campo,
    configuracion.etiquetaVacia
  )
    .filter((fila) => Number(fila.total || 0) > 0);

  destruirGrafica(configuracion.chartKey);

  if (filas.length === 0) {
    return;
  }

  const labels = filas.map((fila) => fila.nombre);
  const valores = filas.map((fila) => fila.total);
  const total = valores.reduce((suma, valor) => suma + Number(valor || 0), 0);

  dashboardCharts[configuracion.chartKey] = new Chart(canvas, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: valores,
          backgroundColor: generarColoresIngresosPie(configuracion.chartKey, labels),
          borderColor: "#ffffff",
          borderWidth: 2
        }
      ]
    },
    plugins: [
      crearPluginEtiquetasPie(total)
    ],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: configuracion.chartKey === "ingresosCategoria"
          ? {
              top: 30,
              right: 90,
              bottom: 30,
              left: 90
            }
          : {
              top: 20,
              right: 36,
              bottom: 20,
              left: 36
            }
      },
      plugins: {
        legend: {
          display: configuracion.chartKey !== "ingresosCategoria",
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const valor = Number(context.parsed || 0);
              const porcentaje = total > 0 ? valor / total : 0;

              return `${context.label}: ${formatoMoneda(valor)} (${formatoPorcentaje(porcentaje)})`;
            }
          }
        }
      }
    }
  });
}

function crearPluginEtiquetasPie(total) {
  return {
    id: "etiquetasPorcentajePie",
    afterDatasetsDraw(chart) {
      const dataset = chart.data.datasets[0];
      const meta = chart.getDatasetMeta(0);

      if (!dataset || !meta) {
        return;
      }

      const ctx = chart.ctx;

      ctx.save();

      meta.data.forEach((segmento, index) => {
        const valor = Number(dataset.data[index] || 0);

        if (valor <= 0 || total <= 0) {
          return;
        }

        const porcentaje = valor / total;
        const textoPorcentaje = formatoPorcentaje(porcentaje);

        const props = segmento.getProps(
          ["x", "y", "startAngle", "endAngle", "innerRadius", "outerRadius"],
          true
        );

        const angulo = (props.startAngle + props.endAngle) / 2;
        const centroX = props.x;
        const centroY = props.y;

        if (porcentaje >= 0.07) {
          dibujarEtiquetaPieInterna(ctx, {
            texto: textoPorcentaje,
            centroX,
            centroY,
            angulo,
            radio: (props.innerRadius + props.outerRadius) / 2
          });

          return;
        }

        dibujarEtiquetaPieExterna(ctx, {
          texto: `${recortarTextoGrafica(chart.data.labels[index], 18)} ${textoPorcentaje}`,
          centroX,
          centroY,
          angulo,
          radioExterior: props.outerRadius
        });
      });

      ctx.restore();
    }
  };
}

function dibujarEtiquetaPieInterna(ctx, opciones) {
  const x = opciones.centroX + Math.cos(opciones.angulo) * opciones.radio;
  const y = opciones.centroY + Math.sin(opciones.angulo) * opciones.radio;

  ctx.font = "700 12px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 4;

  ctx.fillText(opciones.texto, x, y);

  ctx.shadowBlur = 0;
}

function dibujarEtiquetaPieExterna(ctx, opciones) {
  const direccionX = Math.cos(opciones.angulo);
  const direccionY = Math.sin(opciones.angulo);

  const xInicio = opciones.centroX + direccionX * (opciones.radioExterior + 4);
  const yInicio = opciones.centroY + direccionY * (opciones.radioExterior + 4);

  const xLinea = opciones.centroX + direccionX * (opciones.radioExterior + 18);
  const yLinea = opciones.centroY + direccionY * (opciones.radioExterior + 18);

  const xTexto = opciones.centroX + direccionX * (opciones.radioExterior + 28);
  const yTexto = opciones.centroY + direccionY * (opciones.radioExterior + 28);

  ctx.strokeStyle = "#475569";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(xInicio, yInicio);
  ctx.lineTo(xLinea, yLinea);
  ctx.stroke();

  ctx.font = "600 11px Arial";
  ctx.fillStyle = "#1f2937";
  ctx.textAlign = direccionX >= 0 ? "left" : "right";
  ctx.textBaseline = "middle";

  ctx.fillText(opciones.texto, xTexto, yTexto);
}

function recortarTextoGrafica(texto, maximo) {
  const valor = normalizarTexto(texto);

  if (valor.length <= maximo) {
    return valor;
  }

  return `${valor.slice(0, maximo - 1)}…`;
}

function destruirGrafica(chartKey) {
  if (dashboardCharts[chartKey]) {
    dashboardCharts[chartKey].destroy();
    dashboardCharts[chartKey] = null;
  }
}

function generarColoresGrafica(total) {
  const coloresBase = [
    "#1f4e79",
    "#3b82f6",
    "#60a5fa",
    "#93c5fd",
    "#0f766e",
    "#14b8a6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#64748b",
    "#22c55e",
    "#eab308"
  ];

  return Array.from({ length: total }, (_, index) => {
    return coloresBase[index % coloresBase.length];
  });
}

function generarColoresIngresosPie(chartKey, labels) {
  if (chartKey === "ingresosBanco") {
    return labels.map((label, index) => obtenerColorBanco(label, index));
  }

  return labels.map((label, index) => obtenerColorGraficaVariado(index));
}

function obtenerColorBanco(nombreBanco, index) {
  const banco = normalizarClaveComparacion(nombreBanco);

  if (banco.includes("BANAMEX")) {
    return "#dc2626";
  }

  if (banco.includes("BANREGIO")) {
    return "#1d4ed8";
  }

  if (banco.includes("CAJA")) {
    return "#16a34a";
  }

  if (banco.includes("JDJP")) {
    return "#7c3aed";
  }

  if (banco.includes("CUENTA 18") || banco.includes("18")) {
    return "#f97316";
  }

  if (banco.includes("CUENTA 24") || banco.includes("24")) {
    return "#0891b2";
  }

  if (banco.includes("CUENTA 42") || banco.includes("42")) {
    return "#be123c";
  }

  return obtenerColorGraficaVariado(index);
}

function obtenerColorGraficaVariado(index) {
  const colores = [
    "#2563eb",
    "#dc2626",
    "#16a34a",
    "#f97316",
    "#7c3aed",
    "#0891b2",
    "#ca8a04",
    "#be123c",
    "#0f766e",
    "#9333ea",
    "#ea580c",
    "#475569"
  ];

  return colores[index % colores.length];
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

function redimensionarGraficas() {
  Object.values(dashboardCharts).forEach((chart) => {
    if (chart) {
      chart.resize();
    }
  });
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

function renderGraficasEgresos(mes) {
  if (typeof Chart === "undefined") {
    return;
  }

  renderGraficaEgresosMensuales();
  renderGraficaPieEgresosRubro(mes);
}

function renderGraficaEgresosMensuales() {
  const canvas = document.getElementById("chartEgresosMensuales");

  if (!canvas) {
    return;
  }

  const meses = obtenerMesesDelAnioSeleccionado();

  const labels = meses.map((mes) => mes.nombre);
  const valores = meses.map((mes) => sumarEgresos(mes.clave));

  destruirGrafica("egresosMensuales");

  dashboardCharts.egresosMensuales = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Egresos pagados",
          data: valores,
          tension: 0.3,
          fill: false,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              return `Egresos: ${formatoMoneda(context.parsed.y)}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatoMoneda(value)
          }
        }
      }
    }
  });
}

function renderGraficaPieEgresosRubro(mes) {
  const canvas = document.getElementById("chartEgresosRubro");

  if (!canvas) {
    return;
  }

  const filas = agruparEgresosPorCampo(
    mes,
    "rubro",
    "Sin rubro"
  )
    .filter((fila) => Number(fila.total || 0) > 0);

  destruirGrafica("egresosRubro");

  if (filas.length === 0) {
    return;
  }

  const labels = filas.map((fila) => fila.nombre);
  const valores = filas.map((fila) => fila.total);
  const total = valores.reduce((suma, valor) => suma + Number(valor || 0), 0);

  dashboardCharts.egresosRubro = new Chart(canvas, {
    type: "pie",
    data: {
      labels,
      datasets: [
        {
          data: valores,
          backgroundColor: labels.map((label, index) => obtenerColorGraficaVariado(index)),
          borderColor: "#ffffff",
          borderWidth: 2
        }
      ]
    },
    plugins: [
      crearPluginEtiquetasPie(total)
    ],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 30,
          right: 90,
          bottom: 30,
          left: 90
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const valor = Number(context.parsed || 0);
              const porcentaje = total > 0 ? valor / total : 0;

              return `${context.label}: ${formatoMoneda(valor)} (${formatoPorcentaje(porcentaje)})`;
            }
          }
        }
      }
    }
  });
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
  
  renderGraficasEgresos(mes);
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

function renderGraficasVentas(mes) {
  if (typeof Chart === "undefined") {
    return;
  }

  renderGraficaVentasMensuales();
  renderGraficaVentasPorAsesor(mes);
}

function renderGraficaVentasMensuales() {
  const canvas = document.getElementById("chartVentasMensuales");

  if (!canvas) {
    return;
  }

  const meses = obtenerMesesDelAnioSeleccionado();

  const labels = meses.map((mes) => mes.nombre);
  const valoresVentas = meses.map((mes) => sumarVentas(mes.clave));
  const valoresMetas = meses.map((mes) => sumarMetaVentasMensual(mes.clave));

  const datasets = [
    {
      label: "Ventas",
      data: valoresVentas,
      tension: 0.3,
      fill: false,
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 6
    }
  ];

  const hayMetas = valoresMetas.some((valor) => Number(valor || 0) > 0);

  if (hayMetas) {
    datasets.push({
      label: "Meta mensual acumulada",
      data: valoresMetas,
      tension: 0.3,
      fill: false,
      borderWidth: 3,
      borderDash: [6, 6],
      pointRadius: 4,
      pointHoverRadius: 6
    });
  }

  destruirGrafica("ventasMensuales");

  dashboardCharts.ventasMensuales = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const etiqueta = context.dataset.label || "Monto";
              return `${etiqueta}: ${formatoMoneda(context.parsed.y || 0)}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => formatoMoneda(value)
          }
        }
      }
    }
  });
}

function renderGraficaVentasPorAsesor(mes) {
  const canvas = document.getElementById("chartVentasAsesor");

  if (!canvas) {
    return;
  }

  const filas = agruparVentasPorAsesor(mes)
    .filter((fila) => obtenerNombreAsesorAgrupado(fila) !== "Sin asesor")
    .sort((a, b) => Number(b.total || 0) - Number(a.total || 0));
  
  destruirGrafica("ventasAsesor");
  
  if (filas.length === 0) {
    ajustarAlturaGraficaVentasAsesor(8);
    return;
  }
    
  const labels = filas.map((fila) => obtenerNombreAsesorAgrupado(fila));
  const valores = filas.map((fila) => Number(fila.total || 0));
  const metas = filas.map((fila) => obtenerMetaAsesorAgrupado(fila));
  const maximoEje = calcularMaximoEjeVentasAsesor([...valores, ...metas]);
  
  ajustarAlturaGraficaVentasAsesor(labels.length);
  renderGraficaVentasAsesorAxis(maximoEje);
  
  dashboardCharts.ventasAsesor = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Meta mensual",
          data: metas,
          backgroundColor: "#e5e7eb",
          borderColor: "#cbd5e1",
          borderWidth: 1,
          barThickness: 30,
          maxBarThickness: 30,
          grouped: false,
          order: 2
        },
        {
          label: "Venta mensual",
          data: valores,
          backgroundColor: labels.map((label, index) => obtenerColorGraficaVariado(index)),
          borderWidth: 1,
          barThickness: 20,
          maxBarThickness: 20,
          grouped: false,
          order: 1
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const index = context.dataIndex;
              const venta = Number(valores[index] || 0);
              const meta = Number(metas[index] || 0);
              const cumplimiento = meta > 0 ? venta / meta : 0;
        
              if (context.dataset.label === "Venta mensual") {
                return [
                  `Venta: ${formatoMoneda(venta)}`,
                  `Meta: ${meta > 0 ? formatoMoneda(meta) : "Sin meta"}`,
                  `Cumplimiento: ${meta > 0 ? formatoPorcentaje(cumplimiento) : "—"}`
                ];
              }
        
              return `Meta: ${meta > 0 ? formatoMoneda(meta) : "Sin meta"}`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: maximoEje,
          ticks: {
            display: false,
            callback: (value) => formatoMoneda(value)
          },
          grid: {
            display: true
          }
        },
        y: {
          ticks: {
            autoSkip: false
          }
        }
      }
    }
  });
}

function renderGraficaVentasAsesorAxis(maximoEje) {
  const canvas = document.getElementById("chartVentasAsesorAxis");

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  destruirGrafica("ventasAsesorAxis");

  dashboardCharts.ventasAsesorAxis = new Chart(canvas, {
    type: "bar",
    data: {
      labels: [""],
      datasets: [
        {
          data: [0],
          backgroundColor: "rgba(0, 0, 0, 0)",
          borderWidth: 0
        }
      ]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: {
        padding: {
          left: 92,
          right: 24,
          top: 0,
          bottom: 0
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: maximoEje,
          position: "bottom",
          ticks: {
            callback: (value) => formatoMoneda(value)
          },
          grid: {
            display: true
          }
        },
        y: {
          display: false
        }
      }
    }
  });
}

function calcularMaximoEjeVentasAsesor(valores) {
  const maximo = Math.max(...valores, 0);

  if (maximo <= 0) {
    return 100000;
  }

  const base = maximo <= 100000 ? 25000 : 50000;

  return Math.ceil(maximo / base) * base;
}

function ajustarAlturaGraficaVentasAsesor(totalFilas) {
  const contenedor = document.querySelector(".chart-container-bar-ventas-asesor");
  const inner = document.getElementById("chartVentasAsesorInner");

  if (!contenedor || !inner) {
    return;
  }

  const filasVisibles = 8;
  const altoPorFila = 44;
  const espacioExtra = 80;

  const altoVisible = filasVisibles * altoPorFila + espacioExtra;
  const altoTotal = Math.max(totalFilas, filasVisibles) * altoPorFila + espacioExtra;

  contenedor.style.height = `${altoVisible}px`;
  contenedor.style.minHeight = `${altoVisible}px`;
  inner.style.height = `${altoTotal}px`;
}

function obtenerNombreAsesorAgrupado(fila) {
  return normalizarTexto(
    fila.asesor ||
    fila.nombre ||
    fila.nombreAsesor ||
    fila.responsable ||
    fila.vendedor ||
    fila.label
  ) || "Sin asesor";
}

function obtenerMetaAsesorAgrupado(fila) {
  const meta = Number(
    fila.metaMensual ||
    fila.meta ||
    fila.metaMensualAsesor ||
    0
  );

  return Number.isFinite(meta) ? meta : 0;
}

function renderDetalleVentas(mes, totalVentas) {
  renderTablaVentasAsesor(mes);
  renderTablaVentasTipoServicio(mes);
  renderTablaVentasContratos(mes);
  
  renderGraficasVentas(mes);
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

      const detalleDisponible = calcularVentasPorTipoServicioPorAsesor(mes, fila.nombre).length > 0;
      const icono = detalleDisponible ? "▸" : "";

      return `
        <tr class="ventas-asesor-row ${detalleDisponible ? "is-clickable" : ""}" data-asesor="${escaparAtributo(fila.nombre)}">
          <td>
            <span class="expand-icon">${icono}</span>
            ${escaparHtml(fila.nombre)}
          </td>
          <td>${formatoNumero(fila.registros)}</td>
          <td>${formatoNumero(fila.unidades)}</td>
          <td>${formatoMoneda(fila.total)}</td>
          <td>${metaMensual > 0 ? formatoMoneda(metaMensual) : "Sin meta"}</td>
          <td>${metaMensual > 0 ? formatoPorcentaje(porcentajeCumplimiento) : "—"}</td>
        </tr>
      `;
    })
    .join("");

  conectarDespliegueVentasAsesor(mes);
}

function calcularTicketsPromedioVentasPorTipo(mes) {
  const contratos = obtenerContratosVentasMes(mes);

  const acumulado = {
    propiedades: {
      monto: 0,
      unidades: 0
    },
    servicios: {
      monto: 0,
      unidades: 0
    }
  };

  contratos.forEach((item) => {
    const montoContrato = obtenerMontoContratoVenta(item);

    if (montoContrato <= 0) {
      return;
    }

    const unidadesPropiedades =
      obtenerNumeroVentaCampo(item, ["propiedades", "Propiedades", "PROPIEDADES"]) +
      obtenerNumeroVentaCampo(item, ["nichos", "Nichos", "NICHOS"]);

    const unidadesServicios =
      obtenerNumeroVentaCampo(item, ["serviciosAf", "serviciosAF", "Servicios_AF", "Servicios AF", "SERVICIOS_AF"]) +
      obtenerNumeroVentaCampo(item, ["serviciosCh", "serviciosCH", "Servicios_CH", "Servicios CH", "SERVICIOS_CH"]);

    if (unidadesPropiedades > 0) {
      acumulado.propiedades.monto += montoContrato;
      acumulado.propiedades.unidades += unidadesPropiedades;
      return;
    }

    if (unidadesServicios > 0) {
      acumulado.servicios.monto += montoContrato;
      acumulado.servicios.unidades += unidadesServicios;
      return;
    }
  });

  return {
    propiedades: {
      monto: redondear2(acumulado.propiedades.monto),
      unidades: acumulado.propiedades.unidades,
      ticketPromedio: acumulado.propiedades.unidades > 0
        ? redondear2(acumulado.propiedades.monto / acumulado.propiedades.unidades)
        : 0
    },
    servicios: {
      monto: redondear2(acumulado.servicios.monto),
      unidades: acumulado.servicios.unidades,
      ticketPromedio: acumulado.servicios.unidades > 0
        ? redondear2(acumulado.servicios.monto / acumulado.servicios.unidades)
        : 0
    }
  };
}

function obtenerNumeroVentaCampo(item, nombresCampos) {
  for (const nombreCampo of nombresCampos) {
    if (item && item[nombreCampo] !== undefined && item[nombreCampo] !== null) {
      const valor = Number(item[nombreCampo]);

      if (Number.isFinite(valor)) {
        return valor;
      }
    }
  }

  return 0;
}

function obtenerMontoContratoVenta(item) {
  return obtenerNumeroVentaCampo(item, [
    "total",
    "Total",
    "TOTAL",
    "montoVenta",
    "Monto_Venta",
    "Monto Venta",
    "monto_venta",
    "importe",
    "Importe",
    "subtotal",
    "Subtotal"
  ]);
}

function obtenerContratosVentasMes(mes) {
  return (state.datos.ventas || [])
    .filter((item) => coincidePeriodoVenta(item, mes))
    .filter((item) => esFuenteContratos(item.fuente));
}

function conectarDespliegueVentasAsesor(mes) {
  const filasAsesor = document.querySelectorAll("#tablaVentasAsesorBody .ventas-asesor-row");

  filasAsesor.forEach((fila) => {
    fila.addEventListener("click", () => {
      if (!fila.classList.contains("is-clickable")) {
        return;
      }

      const asesor = fila.dataset.asesor || "";
      const yaEstaAbierta = fila.classList.contains("is-expanded");

      cerrarDetallesVentasAsesor();

      if (!yaEstaAbierta) {
        abrirDetalleVentasAsesor(fila, mes, asesor);
      }
    });
  });
}

function cerrarDetallesVentasAsesor() {
  document
    .querySelectorAll(".ventas-asesor-detail-row")
    .forEach((fila) => fila.remove());

  document
    .querySelectorAll(".ventas-asesor-row")
    .forEach((fila) => {
      fila.classList.remove("is-expanded");

      const icono = fila.querySelector(".expand-icon");
      if (icono && icono.textContent.trim() !== "") {
        icono.textContent = "▸";
      }
    });
}

function abrirDetalleVentasAsesor(filaAsesor, mes, asesor) {
  const detalles = calcularVentasPorTipoServicioPorAsesor(mes, asesor);

  if (detalles.length === 0) {
    return;
  }

  filaAsesor.classList.add("is-expanded");

  const icono = filaAsesor.querySelector(".expand-icon");
  if (icono) {
    icono.textContent = "▾";
  }

  const filasDetalle = detalles
    .map((detalle) => {
      return `
        <tr class="ventas-asesor-detail-row">
          <td class="ventas-detail-label">↳ ${escaparHtml(detalle.nombre)}</td>
          <td>${formatoNumero(detalle.registros)}</td>
          <td>${formatoNumero(detalle.unidades)}</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
        </tr>
      `;
    })
    .join("");

  filaAsesor.insertAdjacentHTML("afterend", filasDetalle);

  aplicarFiltrosTodasLasTablas();
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
        <td colspan="5">Sin información para el mes seleccionado.</td>
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
          <td>${formatoMoneda(fila.totalVenta)}</td>
          <td>${formatoPorcentaje(porcentaje)}</td>
        </tr>
      `;
    })
    .join("");
}

function calcularVentasPorTipoServicio(mes) {
  return calcularTiposServicioDesdeVentas(obtenerVentasPorAsesorBase(mes));
}

function calcularVentasPorTipoServicioPorAsesor(mes, asesor) {
  const asesorBuscado = normalizarTexto(asesor).toUpperCase();

  const ventasAsesor = obtenerVentasPorAsesorBase(mes)
    .filter((item) => normalizarTexto(item.asesor).toUpperCase() === asesorBuscado);

  return calcularTiposServicioDesdeVentas(ventasAsesor);
}

function calcularTiposServicioDesdeVentas(ventasBase) {
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
      let unidades = 0;
      let registros = 0;
      let totalVenta = 0;

      ventasBase.forEach((item) => {
        const unidadesTipo = Number(item[tipo.campo] || 0);

        if (unidadesTipo <= 0) {
          return;
        }

        const montoVenta = obtenerMontoVenta(item);
        const unidadesTotalesRegistro = obtenerUnidadesVenta(item);

        unidades += unidadesTipo;
        registros += 1;

        /*
          Si el registro tiene varias categorías, se distribuye el monto
          proporcionalmente por unidades. Si solo tiene una categoría, toma
          el monto completo.
        */
        if (unidadesTotalesRegistro > 0 && montoVenta > 0) {
          totalVenta += montoVenta * (unidadesTipo / unidadesTotalesRegistro);
        }
      });

      return {
        nombre: tipo.nombre,
        registros,
        unidades,
        totalVenta: redondear2(totalVenta)
      };
    })
    .filter((fila) => fila.unidades > 0)
    .sort((a, b) => b.totalVenta - a.totalVenta);
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
        <td colspan="4">Sin contratos para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = contratos
    .map((item) => {
      const contrato = normalizarTexto(item.numeroContrato || item.referencia) || "Sin contrato";
      const cliente = obtenerNombreClienteVenta(item);
      const tipo = normalizarTexto(item.tipoServicio || item.tipoContrato || item.tipoRegistro) || "Sin tipo";
      const total = obtenerMontoVenta(item);

      return `
        <tr>
          <td>${escaparHtml(contrato)}</td>
          <td>${escaparHtml(cliente)}</td>
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
      return coincidePeriodoVenta(item, mes) && esFuenteVentas(item.fuente);
    });
}

function obtenerContratosVentas(mes) {
  return state.datos.ventas
    .filter((item) => {
      return coincidePeriodoVenta(item, mes) && esFuenteContratos(item.fuente);
    });
}

function coincidePeriodoVenta(item, mesSeleccionado) {
  return coincideMesVenta(item.mes, mesSeleccionado)
    && coincideAnioRegistro(item, mesSeleccionado, [
      "fecha",
      "fechaContrato",
      "hojaOrigen",
      "fuente"
    ]);
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

function renderDetalleServicios(mes, totalServicios) {
  renderGraficasServicios();
  renderTablaServiciosUbicacion(mes, totalServicios);
  renderTablaServiciosTipoServicio(mes, totalServicios);
  renderTablaServiciosResponsable(mes, totalServicios);
  renderTablaServiciosRecientes(mes);
}

function renderGraficasServicios() {
  if (typeof Chart === "undefined") {
    return;
  }

  renderGraficaServiciosMensuales();
}

function renderGraficaServiciosMensuales() {
  const canvas = document.getElementById("chartServiciosMensuales");

  if (!canvas) {
    return;
  }

  const meses = obtenerMesesDelAnioSeleccionado();

  const labels = meses.map((mes) => mes.nombre);
  const valoresCapillas = meses.map((mes) =>
    contarServiciosPorOrigen(mes.clave, "CAPILLA")
  );
  const valoresParque = meses.map((mes) =>
    contarServiciosPorOrigen(mes.clave, "PARQUE")
  );

  destruirGrafica("serviciosMensuales");

  dashboardCharts.serviciosMensuales = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Servicios Capillas",
          data: valoresCapillas,
          tension: 0.3,
          fill: false,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: "Servicios Parque",
          data: valoresParque,
          tension: 0.3,
          fill: false,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom"
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const etiqueta = context.dataset.label || "Servicios";
              return `${etiqueta}: ${formatoNumero(context.parsed.y || 0)}`;
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            callback: (value) => formatoNumero(value)
          }
        }
      }
    }
  });
}

function renderTablaServiciosUbicacion(mes, totalServicios) {
  const tbody = document.getElementById("tablaServiciosUbicacionBody");

  if (!tbody) {
    return;
  }

  const filas = agruparServiciosPorUbicacion(mes);

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3">Sin información para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const porcentaje = totalServicios > 0
        ? fila.total / totalServicios
        : 0;

      return `
        <tr>
          <td>${escaparHtml(fila.nombre)}</td>
          <td>${formatoNumero(fila.total)}</td>
          <td>${formatoPorcentaje(porcentaje)}</td>
        </tr>
      `;
    })
    .join("");
}

function agruparServiciosPorUbicacion(mes) {
  const grupos = new Map();

  obtenerServiciosMes(mes).forEach((item) => {
    const ubicacion = obtenerUbicacionServicio(item);

    if (!grupos.has(ubicacion)) {
      grupos.set(ubicacion, {
        nombre: ubicacion,
        total: 0
      });
    }

    grupos.get(ubicacion).total += 1;
  });

  return Array.from(grupos.values())
    .sort((a, b) => {
      const ordenA = obtenerOrdenUbicacionServicio(a.nombre);
      const ordenB = obtenerOrdenUbicacionServicio(b.nombre);
  
      if (ordenA !== ordenB) {
        return ordenA - ordenB;
      }
  
      if (b.total !== a.total) {
        return b.total - a.total;
      }
  
      return a.nombre.localeCompare(b.nombre, "es");
    });
}

function obtenerOrdenUbicacionServicio(ubicacion) {
  const texto = normalizarClaveComparacion(ubicacion);

  if (texto.includes("CHURUBUSCO")) {
    return 1;
  }

  if (texto.includes("APODACA") || texto.includes("AGUA FRIA")) {
    return 2;
  }

  if (texto.includes("PARQUE") || texto.includes("LOTE") || texto.includes("NICHO")) {
    return 3;
  }

  return 99;
}


function renderTablaServiciosAgrupada(configuracion) {
  const tbody = document.getElementById(configuracion.tbodyId);

  if (!tbody) {
    return;
  }

  const filas = agruparServiciosPorCampo(
    configuracion.mes,
    configuracion.campo,
    configuracion.etiquetaVacia
  );

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3">Sin información para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const porcentaje = configuracion.totalServicios > 0
        ? fila.total / configuracion.totalServicios
        : 0;

      return `
        <tr>
          <td>${escaparHtml(fila.nombre)}</td>
          <td>${formatoNumero(fila.total)}</td>
          <td>${formatoPorcentaje(porcentaje)}</td>
        </tr>
      `;
    })
    .join("");
}

function agruparServiciosPorCampo(mes, campo, etiquetaVacia) {
  const grupos = new Map();

  obtenerServiciosMes(mes)
    .forEach((item) => {
      const nombreGrupo = obtenerCampoServicio(item, campo) || etiquetaVacia;

      if (!grupos.has(nombreGrupo)) {
        grupos.set(nombreGrupo, {
          nombre: nombreGrupo,
          total: 0
        });
      }

      const grupo = grupos.get(nombreGrupo);
      grupo.total += 1;
    });

  return Array.from(grupos.values())
    .sort((a, b) => b.total - a.total);
}

function renderTablaServiciosTipoServicio(mes, totalServicios) {
  const tbody = document.getElementById("tablaServiciosTipoBody");

  if (!tbody) {
    return;
  }

  const serviciosMes = obtenerServiciosMes(mes);
  const tiposDisponibles = obtenerCatalogoTiposServicio();
  const grupos = new Map();

  const asegurarGrupo = (origen, tipoServicio) => {
    const llave = `${origen}||${tipoServicio}`;

    if (!grupos.has(llave)) {
      grupos.set(llave, {
        origen,
        tipoServicio,
        registros: 0,
        detallesParque: new Map()
      });
    }

    return grupos.get(llave);
  };

  tiposDisponibles.forEach((tipoDisponible) => {
    if (tipoDisponible.origen === "Capillas" && esTipoServicioCapillasExcluido(tipoDisponible.tipoServicio)) {
      return;
    }

    asegurarGrupo(tipoDisponible.origen, tipoDisponible.tipoServicio);
  });

  serviciosMes.forEach((item) => {
    const origen = obtenerOrigenServicio(item);
    const tipoServicio = obtenerTipoServicioNormalizado(item);
    const servicioParque = obtenerServicioParqueNormalizado(item);

    if (origen === "Capillas" && esTipoServicioCapillasExcluido(tipoServicio)) {
      return;
    }

    const grupo = asegurarGrupo(origen, tipoServicio);
    grupo.registros += 1;

    if (origen === "Parque") {
      if (!grupo.detallesParque.has(servicioParque)) {
        grupo.detallesParque.set(servicioParque, {
          servicioParque,
          registros: 0
        });
      }

      grupo.detallesParque.get(servicioParque).registros += 1;
    }
  });

  const filas = Array.from(grupos.values())
    .map((grupo) => {
      const detallesParque = Array.from(grupo.detallesParque.values())
        .filter((detalle) => detalle.registros > 0)
        .sort((a, b) => {
          const prioridadA = obtenerOrdenServicioParque(a.servicioParque);
          const prioridadB = obtenerOrdenServicioParque(b.servicioParque);

          if (prioridadA !== prioridadB) {
            return prioridadA - prioridadB;
          }

          if (b.registros !== a.registros) {
            return b.registros - a.registros;
          }

          return a.servicioParque.localeCompare(b.servicioParque, "es");
        });

      return {
        origen: grupo.origen,
        tipoServicio: grupo.tipoServicio,
        registros: grupo.registros,
        detallesParque
      };
    })
    .sort((a, b) => {
      const prioridadOrigenA = obtenerOrdenOrigenServicio(a.origen);
      const prioridadOrigenB = obtenerOrdenOrigenServicio(b.origen);

      if (prioridadOrigenA !== prioridadOrigenB) {
        return prioridadOrigenA - prioridadOrigenB;
      }

      if (b.registros !== a.registros) {
        return b.registros - a.registros;
      }

      return a.tipoServicio.localeCompare(b.tipoServicio, "es");
    });

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">Sin tipos de servicio disponibles.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const porcentaje = totalServicios > 0
        ? fila.registros / totalServicios
        : 0;

      const detalleDisponible = fila.origen === "Parque" && fila.detallesParque.length > 0;
      const icono = detalleDisponible ? "▸" : "";

      return `
        <tr class="servicios-tipo-row ${detalleDisponible ? "is-clickable" : ""}"
            data-origen="${escaparAtributo(fila.origen)}"
            data-tipo-servicio="${escaparAtributo(fila.tipoServicio)}">
          <td>${escaparHtml(fila.origen)}</td>
          <td>
            <span class="expand-icon">${icono}</span>
            ${escaparHtml(fila.tipoServicio)}
          </td>
          <td>${formatoNumero(fila.registros)}</td>
          <td>${formatoPorcentaje(porcentaje)}</td>
        </tr>
      `;
    })
    .join("");

  conectarDespliegueServiciosTipo(mes, totalServicios);
}

function conectarDespliegueServiciosTipo(mes, totalServicios) {
  const filasTipo = document.querySelectorAll("#tablaServiciosTipoBody .servicios-tipo-row");

  filasTipo.forEach((fila) => {
    fila.addEventListener("click", () => {
      if (!fila.classList.contains("is-clickable")) {
        return;
      }

      const origen = fila.dataset.origen || "";
      const tipoServicio = fila.dataset.tipoServicio || "";
      const yaEstaAbierta = fila.classList.contains("is-expanded");

      cerrarDetallesServiciosTipo();

      if (!yaEstaAbierta) {
        abrirDetalleServiciosTipo(fila, mes, origen, tipoServicio, totalServicios);
      }
    });
  });
}

function cerrarDetallesServiciosTipo() {
  document
    .querySelectorAll(".servicios-tipo-detail-row")
    .forEach((fila) => fila.remove());

  document
    .querySelectorAll(".servicios-tipo-row")
    .forEach((fila) => {
      fila.classList.remove("is-expanded");

      const icono = fila.querySelector(".expand-icon");
      if (icono && icono.textContent.trim() !== "") {
        icono.textContent = "▸";
      }
    });
}

function abrirDetalleServiciosTipo(filaTipo, mes, origen, tipoServicio, totalServicios) {
  const detalles = calcularDetalleServicioParquePorTipo(mes, origen, tipoServicio);

  if (detalles.length === 0) {
    return;
  }

  filaTipo.classList.add("is-expanded");

  const icono = filaTipo.querySelector(".expand-icon");
  if (icono) {
    icono.textContent = "▾";
  }

  const filasDetalle = detalles
    .map((detalle) => {
      const porcentaje = totalServicios > 0
        ? detalle.registros / totalServicios
        : 0;

      return `
        <tr class="servicios-tipo-detail-row">
          <td>—</td>
          <td class="servicios-detail-label">↳ Servicio Parque: ${escaparHtml(detalle.servicioParque)}</td>
          <td>${formatoNumero(detalle.registros)}</td>
          <td>${formatoPorcentaje(porcentaje)}</td>
        </tr>
      `;
    })
    .join("");

  filaTipo.insertAdjacentHTML("afterend", filasDetalle);

  aplicarFiltrosTodasLasTablas();
}

function calcularDetalleServicioParquePorTipo(mes, origen, tipoServicio) {
  if (origen !== "Parque") {
    return [];
  }

  const grupos = new Map();

  obtenerServiciosMes(mes)
    .filter((item) => {
      return obtenerOrigenServicio(item) === origen
        && obtenerTipoServicioNormalizado(item) === tipoServicio;
    })
    .forEach((item) => {
      const servicioParque = obtenerServicioParqueNormalizado(item);

      if (!grupos.has(servicioParque)) {
        grupos.set(servicioParque, {
          servicioParque,
          registros: 0
        });
      }

      grupos.get(servicioParque).registros += 1;
    });

  return Array.from(grupos.values())
    .filter((detalle) => detalle.registros > 0)
    .sort((a, b) => {
      const prioridadA = obtenerOrdenServicioParque(a.servicioParque);
      const prioridadB = obtenerOrdenServicioParque(b.servicioParque);

      if (prioridadA !== prioridadB) {
        return prioridadA - prioridadB;
      }

      if (b.registros !== a.registros) {
        return b.registros - a.registros;
      }

      return a.servicioParque.localeCompare(b.servicioParque, "es");
    });
}

function obtenerOrdenOrigenServicio(origen) {
  const origenNormalizado = normalizarTexto(origen).toUpperCase();

  if (origenNormalizado === "CAPILLAS" || origenNormalizado === "CAPILLA") {
    return 1;
  }

  if (origenNormalizado === "PARQUE") {
    return 2;
  }

  return 99;
}

function obtenerOrdenServicioParque(servicioParque) {
  const servicioNormalizado = normalizarTexto(servicioParque).toUpperCase();

  const orden = {
    "—": 0,
    "-": 0,
    "TOTAL SERVICE": 1,
    "BASICO": 2,
    "BÁSICO": 2,
    "COFFEE BREAK": 3,
    "TOTAL SERVICE COMPLEMENTO": 4,
    "SIN SERVICIO PARQUE": 99
  };

  return orden[servicioNormalizado] ?? 98;
}


function obtenerCatalogoTiposServicio() {
  const tipos = new Map();

  const modalidadesParque = [
    "Total Service",
    "Basico",
    "Coffee Break",
    "Total Service Complemento"
  ];

  const catalogoBaseCapillas = [
    { origen: "Capillas", tipoServicio: "Cremación", servicioParque: "—" },
    { origen: "Capillas", tipoServicio: "Cremación Directa (con velación)", servicioParque: "—" },
    { origen: "Capillas", tipoServicio: "Cremación Directa (sin velación)", servicioParque: "—" },
    { origen: "Capillas", tipoServicio: "Inhumación", servicioParque: "—" },
    { origen: "Capillas", tipoServicio: "Renta de Capillas", servicioParque: "—" },
    { origen: "Capillas", tipoServicio: "Traslado", servicioParque: "—" }
  ];

  const tiposBaseParque = [
    "Inhumación",
    "Depósito de Cenizas",
    "Resguardo de Cenizas",
    "Exhumación",
    "Reubicación",
    "Retiro de Cenizas"
  ];

  catalogoBaseCapillas.forEach((item) => {
    const llave = `${item.origen}||${item.tipoServicio}||${item.servicioParque}`;
    tipos.set(llave, item);
  });

  tiposBaseParque.forEach((tipoServicio) => {
    modalidadesParque.forEach((servicioParque) => {
      const item = {
        origen: "Parque",
        tipoServicio,
        servicioParque
      };

      const llave = `${item.origen}||${item.tipoServicio}||${item.servicioParque}`;
      tipos.set(llave, item);
    });
  });

  state.datos.servicios.forEach((item) => {
    const origen = obtenerOrigenServicio(item);
    const tipoServicio = obtenerTipoServicioNormalizado(item);
    const servicioParque = obtenerServicioParqueNormalizado(item);
  
    if (origen === "Capillas" && esTipoServicioCapillasExcluido(tipoServicio)) {
      return;
    }
  
    const llave = `${origen}||${tipoServicio}||${servicioParque}`;
  
    if (!tipos.has(llave)) {
      tipos.set(llave, {
        origen,
        tipoServicio,
        servicioParque
      });
    }
  });

  return Array.from(tipos.values());
}

function obtenerTipoServicioNormalizado(item) {
  const origen = obtenerOrigenServicio(item);
  const tipoOriginal = normalizarTexto(item.tipoServicio) || "Sin tipo de servicio";
  const tipoComparacion = normalizarClaveComparacion(tipoOriginal);

  if (origen === "Capillas") {
    return obtenerTipoServicioCapillasNormalizado(tipoOriginal);
  }

  if (origen === "Parque" && tipoComparacion === "DEPOSITO DE CENIZAS") {
    return "Depósito de Cenizas";
  }

  return tipoOriginal;
}

function obtenerTipoServicioCapillasNormalizado(tipoServicio) {
  const tipo = normalizarClaveComparacion(tipoServicio)
    .replace(/[()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (tipo === "INHUMACION") {
    return "Inhumación";
  }

  if (tipo === "CREMACION") {
    return "Cremación";
  }

  if (tipo === "CREMACION DIRECTA" || tipo === "CREMACION DIRECTA CON VELACION") {
    return "Cremación Directa (con velación)";
  }

  if (tipo === "CREMACION DIRECTA SIN VELACION") {
    return "Cremación Directa (sin velación)";
  }

  if (
    tipo === "RENTA DE CAPILLAS" ||
    tipo === "RENTA CAPILLAS" ||
    tipo === "RENTA DE CAPILLA" ||
    tipo === "RENTA CAPILLA"
  ) {
    return "Renta de Capillas";
  }

  if (tipo === "TRASLADO" || tipo === "TRASLADOS") {
    return "Traslado";
  }

  return "";
}

function esTipoServicioCapillasExcluido(tipoServicio) {
  return obtenerTipoServicioCapillasNormalizado(tipoServicio) === "";
}

function obtenerServicioParqueNormalizado(item) {
  const origen = obtenerOrigenServicio(item);

  if (origen !== "Parque") {
    return "—";
  }

  return normalizarTexto(item.serviciosParque) || "Sin servicio parque";
}

function obtenerOrigenServicio(item) {
  const origen = normalizarTexto(item.origen).toUpperCase();
  const tipoOrigen = normalizarTexto(item.tipoOrigen).toUpperCase();
  const fuente = normalizarTexto(item.fuente).toUpperCase();

  if (origen.includes("CAPILLA") || tipoOrigen.includes("CAPILLA") || fuente.includes("CAPILLA")) {
    return "Capillas";
  }

  if (origen.includes("PARQUE") || tipoOrigen.includes("PARQUE") || fuente.includes("PARQUE")) {
    return "Parque";
  }

  const sucursal = normalizarTexto(item.sucursal).toUpperCase();

  if (sucursal.includes("CHURUBUSCO") || sucursal.includes("APODACA") || sucursal.includes("AGUA")) {
    return "Capillas";
  }

  const ubicacion = normalizarTexto(item.ubicacionServicio).toUpperCase();

  if (ubicacion.includes("LOTE") || ubicacion.includes("NICHO") || ubicacion.includes("SECCION")) {
    return "Parque";
  }

  return normalizarTexto(item.origen)
    || normalizarTexto(item.tipoOrigen)
    || normalizarTexto(item.fuente)
    || "Sin origen";
}


function obtenerTiposServicioDisponibles() {
  const tipos = new Map();

  state.datos.servicios.forEach((item) => {
    const origen = obtenerOrigenServicio(item);
    const tipoServicio = normalizarTexto(item.tipoServicio) || "Sin tipo de servicio";
    const llave = `${origen}||${tipoServicio}`;

    if (!tipos.has(llave)) {
      tipos.set(llave, {
        origen,
        tipoServicio
      });
    }
  });

  return Array.from(tipos.values());
}

function renderTablaServiciosResponsable(mes, totalServicios) {
  const tbody = document.getElementById("tablaServiciosResponsableBody");

  if (!tbody) {
    return;
  }

  const grupos = new Map();

  obtenerServiciosMes(mes).forEach((item) => {
    const responsable =
      normalizarTexto(item.responsable)
      || normalizarTexto(item.asesor)
      || normalizarTexto(item.embalsamador)
      || "Sin responsable";

    if (!grupos.has(responsable)) {
      grupos.set(responsable, {
        nombre: responsable,
        total: 0
      });
    }

    grupos.get(responsable).total += 1;
  });

  const filas = Array.from(grupos.values())
    .sort((a, b) => b.total - a.total);

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3">Sin información para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const porcentaje = totalServicios > 0
        ? fila.total / totalServicios
        : 0;

      return `
        <tr>
          <td>${escaparHtml(fila.nombre)}</td>
          <td>${formatoNumero(fila.total)}</td>
          <td>${formatoPorcentaje(porcentaje)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderTablaServiciosRecientes(mes) {
  const tbody = document.getElementById("tablaServiciosRecientesBody");

  if (!tbody) {
    return;
  }

  const servicios = obtenerServiciosMes(mes)
    .sort((a, b) => {
      const fechaA = obtenerTimestampServicio(a.fechaServicio);
      const fechaB = obtenerTimestampServicio(b.fechaServicio);

      return fechaB - fechaA;
    });

  if (servicios.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Sin servicios para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = servicios
    .map((item) => {
      const numeroServicio = normalizarTexto(item.numeroServicio) || "—";
      const fecha = formatearFechaServicio(item.fechaServicio);
      const finado = normalizarTexto(item.finado) || normalizarTexto(item.titular) || "Sin nombre";
      const ubicacion = obtenerUbicacionServicio(item);
      const tipo = normalizarTexto(item.tipoServicio) || "Sin tipo";

      return `
        <tr>
          <td>${escaparHtml(numeroServicio)}</td>
          <td>${escaparHtml(fecha)}</td>
          <td>${escaparHtml(finado)}</td>
          <td>${escaparHtml(ubicacion)}</td>
          <td>${escaparHtml(tipo)}</td>
        </tr>
      `;
    })
    .join("");
}

function obtenerServiciosMes(mes) {
  return state.datos.servicios
    .filter((item) => coincidePeriodoServicio(item, mes));
}

function coincidePeriodoServicio(item, mesSeleccionado) {
  return coincideMesServicio(item.mes, mesSeleccionado)
    && coincideAnioRegistro(item, mesSeleccionado, [
      "fechaServicio",
      "fechaFin",
      "fuente"
    ]);
}
  
function coincideMesServicio(mesRegistro, mesSeleccionado) {
  const mesRegistroNormalizado = normalizarTexto(mesRegistro).toUpperCase();
  const mesSeleccionadoNormalizado = normalizarTexto(mesSeleccionado).toUpperCase();

  if (mesRegistroNormalizado === mesSeleccionadoNormalizado) {
    return true;
  }

  const nombreMesSeleccionado = obtenerNombreMesDesdeClave(mesSeleccionadoNormalizado);

  return mesRegistroNormalizado === nombreMesSeleccionado;
}

function coincideAnioRegistro(item, mesSeleccionado, campos) {
  const anioSeleccionado = obtenerAnioDesdeClaveMes(mesSeleccionado);

  if (!anioSeleccionado) {
    return true;
  }

  const anioDesdeMes = obtenerAnioDesdeValor(item.mes);

  if (anioDesdeMes) {
    return anioDesdeMes === anioSeleccionado;
  }

  for (const campo of campos) {
    const anioCampo = obtenerAnioDesdeValor(item[campo]);

    if (anioCampo) {
      return anioCampo === anioSeleccionado;
    }
  }

  return true;
}

function obtenerAnioDesdeValor(valor) {
  const anios = extraerAniosDeTexto(valor);

  return anios.length > 0 ? anios[0] : "";
}

  
function obtenerCampoServicio(item, campo) {
  if (campo === "ubicacionPrincipal") {
    return obtenerUbicacionServicio(item);
  }

  return normalizarTexto(item[campo]);
}

function obtenerUbicacionServicio(item) {
  const sucursal = normalizarTexto(item.sucursal);
  const ubicacionServicio = normalizarTexto(item.ubicacionServicio);
  const sala = normalizarTexto(item.sala);
  const seccion = normalizarTexto(item.seccion);
  const loteNicho = normalizarTexto(item.loteNicho || item.numLoteNicho);
  const origen = obtenerOrigenServicio(item);

  if (sucursal) {
    return sucursal;
  }

  if (ubicacionServicio) {
    return ubicacionServicio;
  }

  if (sala) {
    return sala;
  }

  if (seccion && loteNicho) {
    return `${seccion} - ${loteNicho}`;
  }

  if (seccion) {
    return seccion;
  }

  return origen || "Sin ubicación";
}

function obtenerTimestampServicio(valor) {
  const fecha = new Date(valor);

  if (!Number.isNaN(fecha.getTime())) {
    return fecha.getTime();
  }

  return 0;
}

function formatearFechaServicio(valor) {
  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return normalizarTexto(valor) || "—";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(fecha);
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

function escaparAtributo(valor) {
  return escaparHtml(valor)
    .replaceAll("`", "&#096;");
}

function obtenerFechaHoraActual() {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date());
}

window.renderDashboard = renderDashboard;
window.actualizarDatosDashboard = actualizarDatosDashboard;
