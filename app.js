window.state = {
  anioSeleccionado: "2026",
  mesSeleccionado: "2026-07",
  mesInicioSeleccionado: "2026-07",
  mesFinSeleccionado: "2026-07",
  datos: {
    ingresos: [],
    egresos: [],
    ventas: [],
    servicios: [],
    metasCobranza: [],
    metasVentas: [],
    alertas: [],
    parquePropiedades: []
  }
};

const state = window.state;
const dashboardCharts = {};

const DASHBOARD_CACHE_KEY = "dashboardDireccionUltimosDatos";
const DASHBOARD_REFRESH_MS = 60 * 60 * 1000;

const DASHBOARD_ALERTAS_VISTAS_KEY = "dashboardAlertasVistas";
const DASHBOARD_ALERTAS_CONOCIDAS_KEY = "dashboardAlertasConocidas";

const ALERTA_COBRANZA_AREA_MIN = 0.90;
const ALERTA_COBRANZA_AREA_CRITICA = 0.75;

const ALERTA_EGRESO_POR_PAGAR_MIN = 20000;

const ALERTA_FLUJO_NETO_BAJO_PCT = 0.05;

const ALERTA_BI_DESACTUALIZADA_HORAS = 24;

const ALERTA_RUBRO_FUERA_RANGO_FACTOR = 1.30;
const ALERTA_RUBRO_FUERA_RANGO_DIFERENCIA_MIN = 20000;
const ALERTA_RUBRO_FUERA_RANGO_MONTO_MIN = 20000;

const ALERTA_NUEVOS_SERVICIOS_HORAS = 24;

let notificacionesConectadas = false;
let alertasInicializadas = false;
let dashboardUltimaActualizacionExitosa = "";

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
  conectarModalVentasAsesor();
  conectarModalEgresosTipoGasto();
  conectarNotificaciones();
  renderDashboard();
  mostrarPagina("resumen");

  if (!actualizacionEnCurso) {
    ocultarPanelEstado();
  }

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
  agregarAniosDesdeLista(anios, state.datos.servicios, [
    "mes",
    "fechaServicio",
    "fechaCreacionOrigen",
    "fechaCreacionOriginal",
    "fechaFin",
    "fuente"
  ]);

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
  const meses = obtenerMesesDelAnioSeleccionado();

  cargarOpcionesSelectorMes(
    document.getElementById("monthSelector"),
    meses,
    state.mesSeleccionado
  );

  cargarOpcionesSelectorMes(
    document.getElementById("monthStartSelector"),
    meses,
    state.mesInicioSeleccionado
  );

  cargarOpcionesSelectorMes(
    document.getElementById("monthEndSelector"),
    meses,
    state.mesFinSeleccionado
  );
}

function cargarOpcionesSelectorMes(selector, meses, valorSeleccionado) {
  if (!selector) {
    return;
  }

  selector.innerHTML = "";

  meses.forEach((mes) => {
    const option = document.createElement("option");
    option.value = mes.clave;
    option.textContent = mes.nombre;

    if (mes.clave === valorSeleccionado) {
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
  const mesBase = state.mesFinSeleccionado || state.mesSeleccionado || "2026-07";
  const anioDesdeMes = obtenerAnioDesdeClaveMes(mesBase);

  if (!state.anioSeleccionado && anioDesdeMes) {
    state.anioSeleccionado = anioDesdeMes;
  }

  if (!state.anioSeleccionado) {
    state.anioSeleccionado = "2026";
  }

  const numeroMesSeleccionado = obtenerNumeroMesDesdeClave(state.mesSeleccionado) || "01";
  const numeroMesInicio = obtenerNumeroMesDesdeClave(state.mesInicioSeleccionado) || numeroMesSeleccionado;
  const numeroMesFin = obtenerNumeroMesDesdeClave(state.mesFinSeleccionado) || numeroMesSeleccionado;

  state.mesSeleccionado = crearClaveMes(state.anioSeleccionado, numeroMesFin);
  state.mesInicioSeleccionado = crearClaveMes(state.anioSeleccionado, numeroMesInicio);
  state.mesFinSeleccionado = crearClaveMes(state.anioSeleccionado, numeroMesFin);

  normalizarRangoMesesSeleccionado();
}

function normalizarRangoMesesSeleccionado() {
  const numeroInicio = Number(obtenerNumeroMesDesdeClave(state.mesInicioSeleccionado) || 1);
  const numeroFin = Number(obtenerNumeroMesDesdeClave(state.mesFinSeleccionado) || numeroInicio);

  if (numeroInicio > numeroFin) {
    state.mesFinSeleccionado = state.mesInicioSeleccionado;
    state.mesSeleccionado = state.mesFinSeleccionado;
  }
}

function obtenerMesesRangoSeleccionado() {
  const meses = obtenerMesesDelAnioSeleccionado();
  const numeroInicio = Number(obtenerNumeroMesDesdeClave(state.mesInicioSeleccionado) || 1);
  const numeroFin = Number(obtenerNumeroMesDesdeClave(state.mesFinSeleccionado) || numeroInicio);

  return meses
    .filter((mes) => {
      const numeroMes = Number(obtenerNumeroMesDesdeClave(mes.clave) || 0);
      return numeroMes >= numeroInicio && numeroMes <= numeroFin;
    })
    .map((mes) => mes.clave);
}

function normalizarPeriodoDashboard(periodo) {
  if (Array.isArray(periodo)) {
    return periodo
      .map((mes) => normalizarTexto(mes))
      .filter(Boolean);
  }

  const mes = normalizarTexto(periodo);

  return mes ? [mes] : [];
}

function obtenerMesBasePeriodo(periodo) {
  const meses = normalizarPeriodoDashboard(periodo);

  return meses[0] || state.mesSeleccionado;
}

function coincideMesValor(mesRegistro, periodo) {
  const mesRegistroNormalizado = normalizarTexto(mesRegistro).toUpperCase();

  if (!mesRegistroNormalizado) {
    return false;
  }

  return normalizarPeriodoDashboard(periodo).some((mes) => {
    const mesSeleccionadoNormalizado = normalizarTexto(mes).toUpperCase();

    if (mesRegistroNormalizado === mesSeleccionadoNormalizado) {
      return true;
    }

    const nombreMes = obtenerNombreMesDesdeClave(mesSeleccionadoNormalizado);

    return mesRegistroNormalizado === normalizarTexto(nombreMes).toUpperCase();
  });
}

function obtenerEtiquetaPeriodoSeleccionado() {
  const meses = normalizarPeriodoDashboard(obtenerMesesRangoSeleccionado());

  if (meses.length <= 1) {
    return obtenerNombreMesDesdeClave(meses[0] || state.mesSeleccionado);
  }

  const mesInicio = obtenerNombreMesDesdeClave(meses[0]);
  const mesFin = obtenerNombreMesDesdeClave(meses[meses.length - 1]);

  return `${mesInicio} - ${mesFin}`;
}


function conectarEventos() {
  const yearSelector = document.getElementById("yearSelector");
  const monthStartSelector = document.getElementById("monthStartSelector");
  const monthEndSelector = document.getElementById("monthEndSelector");
  const selector = document.getElementById("monthSelector");
  const refreshButton = document.getElementById("refreshButton");
  const testSharePointButton = document.getElementById("testSharePointButton");
  const getListsButton = document.getElementById("getListsButton");
  const getIngresosButton = document.getElementById("getIngresosButton");

  if (yearSelector) {
    yearSelector.addEventListener("change", (event) => {
      const numeroMesInicio = obtenerNumeroMesDesdeClave(state.mesInicioSeleccionado) || "01";
      const numeroMesFin = obtenerNumeroMesDesdeClave(state.mesFinSeleccionado) || "01";

      state.anioSeleccionado = event.target.value;
      state.mesInicioSeleccionado = crearClaveMes(state.anioSeleccionado, numeroMesInicio);
      state.mesFinSeleccionado = crearClaveMes(state.anioSeleccionado, numeroMesFin);
      state.mesSeleccionado = state.mesFinSeleccionado;

      normalizarRangoMesesSeleccionado();
      cargarSelectorMeses();
      renderDashboard();
    });
  }

  if (monthStartSelector) {
    monthStartSelector.addEventListener("change", (event) => {
      state.mesInicioSeleccionado = event.target.value;
      state.anioSeleccionado = obtenerAnioDesdeClaveMes(state.mesInicioSeleccionado) || state.anioSeleccionado;

      const numeroInicio = Number(obtenerNumeroMesDesdeClave(state.mesInicioSeleccionado) || 1);
      const numeroFin = Number(obtenerNumeroMesDesdeClave(state.mesFinSeleccionado) || numeroInicio);

      if (numeroInicio > numeroFin) {
        state.mesFinSeleccionado = state.mesInicioSeleccionado;
      }

      state.mesSeleccionado = state.mesFinSeleccionado;

      cargarSelectorAnios();
      cargarSelectorMeses();
      renderDashboard();
    });
  }

  if (monthEndSelector) {
    monthEndSelector.addEventListener("change", (event) => {
      state.mesFinSeleccionado = event.target.value;
      state.anioSeleccionado = obtenerAnioDesdeClaveMes(state.mesFinSeleccionado) || state.anioSeleccionado;

      const numeroInicio = Number(obtenerNumeroMesDesdeClave(state.mesInicioSeleccionado) || 1);
      const numeroFin = Number(obtenerNumeroMesDesdeClave(state.mesFinSeleccionado) || numeroInicio);

      if (numeroFin < numeroInicio) {
        state.mesInicioSeleccionado = state.mesFinSeleccionado;
      }

      state.mesSeleccionado = state.mesFinSeleccionado;

      cargarSelectorAnios();
      cargarSelectorMeses();
      renderDashboard();
    });
  }

  if (selector) {
    selector.addEventListener("change", (event) => {
      state.mesSeleccionado = event.target.value;
      state.mesInicioSeleccionado = event.target.value;
      state.mesFinSeleccionado = event.target.value;
      state.anioSeleccionado = obtenerAnioDesdeClaveMes(state.mesSeleccionado) || state.anioSeleccionado;

      cargarSelectorAnios();
      cargarSelectorMeses();
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

    state.datos.metasVentas = reemplazarRegistrosPorMes(
      state.datos.metasVentas,
      datosSharePoint.metasVentas || [],
      mesesRecargados
    );

    state.datos.alertas = reemplazarRegistrosPorMes(
      state.datos.alertas || [],
      datosSharePoint.alertas || [],
      mesesRecargados
    );

    state.datos.parquePropiedades = datosSharePoint.parquePropiedades || [];

    cargarSelectorAnios();
    cargarSelectorMeses();

    dashboardUltimaActualizacionExitosa = new Date().toISOString();

    guardarDatosEnCache();
    cacheCargadoDashboard = true;

    renderDashboard();
    renderServiciosDelDiaSeguro();

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

    ocultarPanelEstadoConRetraso(10000);
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
      mesInicioSeleccionado: state.mesInicioSeleccionado,
      mesFinSeleccionado: state.mesFinSeleccionado,
      datos: {
        ingresos: state.datos.ingresos || [],
        egresos: state.datos.egresos || [],
        ventas: state.datos.ventas || [],
        servicios: state.datos.servicios || [],
        metasCobranza: state.datos.metasCobranza || [],
        metasVentas: state.datos.metasVentas || [],
        parquePropiedades: state.datos.parquePropiedades || []
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

    dashboardUltimaActualizacionExitosa = cache.fechaGuardado || "";

    state.datos.ingresos = cache.datos.ingresos || [];
    state.datos.egresos = cache.datos.egresos || [];
    state.datos.ventas = cache.datos.ventas || [];
    state.datos.servicios = cache.datos.servicios || [];
    state.datos.metasCobranza = cache.datos.metasCobranza || [];
    state.datos.metasVentas = cache.datos.metasVentas || [];
    state.datos.alertas = cache.datos.alertas || [];
    state.datos.parquePropiedades = cache.datos.parquePropiedades || [];

    if (cache.anioSeleccionado) {
      state.anioSeleccionado = cache.anioSeleccionado;
    }
    
    if (cache.mesSeleccionado) {
      state.mesSeleccionado = cache.mesSeleccionado;
    }
    

    if (cache.mesInicioSeleccionado) {
      state.mesInicioSeleccionado = cache.mesInicioSeleccionado;
    }

    if (cache.mesFinSeleccionado) {
      state.mesFinSeleccionado = cache.mesFinSeleccionado;
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
    serviciosCapillas: "pageServiciosCapillas",
    serviciosParque: "pageServiciosParque"
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
  const mesesPeriodo = obtenerMesesRangoSeleccionado();
  const mes = mesesPeriodo.length ? mesesPeriodo : [state.mesSeleccionado];

  const totalIngresos = sumarIngresos(mes);
  const totalEgresos = sumarEgresos(mes);
  const ventasPrevision = sumarVentasPrevision(mes);
  const ventasUi = sumarVentasUiPeriodo(mes);
  const totalVentas = ventasPrevision + ventasUi;

  const totalContratos = contarContratos(mes);

  const metaPrevision = sumarMetaPrevisionMensual(mes);
  const metaUi = sumarMetaUiMensual(mes);
  const metaVentas = metaPrevision + metaUi;

  const porcentajeCumplimientoPrevision = metaPrevision > 0
    ? ventasPrevision / metaPrevision
    : 0;

  const porcentajeCumplimientoUi = metaUi > 0
    ? ventasUi / metaUi
    : 0;

  const totalCapillas = contarServiciosPorOrigen(mes, "CAPILLA");
  const totalCapillasUsoInmediato = contarServiciosCapillasPorTipoContrato(mes, "USO INMEDIATO");
  const totalCapillasPrevision = contarServiciosCapillasPorTipoContrato(mes, "PREVISION");
  const totalParque = contarServiciosPorOrigen(mes, "PARQUE");
  const totalServicios = totalCapillas + totalParque;

  
  const registrosIngresos = contarRegistrosIngresos(mes);
  const ingresoReal = sumarIngresoRealCobranza(mes);
  const metaIngresos = sumarMetaCobranzaMensual(mes);
  
  const porcentajeCumplimientoIngresos = metaIngresos > 0
    ? ingresoReal / metaIngresos
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
  setText("kpiServiciosCapillas", formatoNumero(totalCapillas));
  setText("kpiServiciosParque", formatoNumero(totalParque));

  setText("pageIngresosTotal", formatoMoneda(totalIngresos));
  setText("pageIngresosReal", formatoMoneda(ingresoReal));
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
  
  setText("pageVentasTotal", formatoMoneda(ventasPrevision));
  setText("pageVentasMetaPrevision", formatoMoneda(metaPrevision));

  setText(
    "pageVentasCumplimientoPrevision",
    metaPrevision > 0 ? formatoPorcentaje(porcentajeCumplimientoPrevision) : "—"
  );

  setText("pageVentasUiTotal", formatoMoneda(ventasUi));
  setText("pageVentasMetaUi", formatoMoneda(metaUi));

  setText(
    "pageVentasCumplimientoUi",
    metaUi > 0 ? formatoPorcentaje(porcentajeCumplimientoUi) : "—"
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
  setText("pageServiciosCapillasTotal", formatoNumero(totalCapillas));
  setText("pageServiciosCapillasUsoInmediato", formatoNumero(totalCapillasUsoInmediato));
  setText("pageServiciosCapillasPrevision", formatoNumero(totalCapillasPrevision));
  setText("pageServiciosParqueTotal", formatoNumero(totalParque));

  
  aplicarClaseFlujo("kpiFlujo", flujoNeto);

  setText("capillasTotal", formatoNumero(totalCapillas));
  setText("parqueTotal", formatoNumero(totalParque));
  setText("serviciosTotal", formatoNumero(totalServicios));

  setText("lastUpdate", obtenerFechaHoraActual());

  renderTablaFlujoEfectivo(mes);
  renderAvanceMetasCobranza(mes);
  renderServiciosDelDiaSeguro();
  
  renderDetalleIngresos(mes, totalIngresos);
  renderDetalleEgresos(mes, totalEgresos);
  renderDetalleVentas(mes, totalVentas);
  renderDetalleServiciosCapillas(mes, totalCapillas);
  renderDetalleServiciosParque(mes, totalParque);
  renderNotificacionesDashboard();
  aplicarFiltrosTodasLasTablas();
}

function sumarPorMes(lista, mes, campo) {
  return lista
    .filter((item) => coincideMesValor(item.mes, mes))
    .reduce((total, item) => total + Number(item[campo] || 0), 0);
}

function sumarServicios(mes, origen) {
  return state.datos.servicios
    .filter((item) => coincidePeriodoServicio(item, mes) && item.origen === origen)
    .reduce((total, item) => total + Number(item.total || 0), 0);
}

function sumarIngresos(mes) {
  return state.datos.ingresos
    .filter((item) => coincideMesValor(item.mes, mes))
    .reduce((total, item) => total + Number(item.importe || 0), 0);
}

function sumarIngresoRealCobranza(mes) {
  return state.datos.ingresos
    .filter((item) => coincideMesValor(item.mes, mes))
    .filter((item) => esIngresoConsideradoMetaCobranza(item))
    .reduce((total, item) => total + Number(item.importe || 0), 0);
}

function esIngresoConsideradoMetaCobranza(item) {
  const area = clasificarAreaIngresoCobranza(item);

  return [
    "Panteon",
    "Servicios CH",
    "Servicios AF",
    "Total Service"
  ].includes(area);
}

function sumarMetaCobranzaMensual(mes) {
  return obtenerMetasCobranzaMes(mes)
    .reduce((total, meta) => total + Number(meta.metaMensual || 0), 0);
}

function sumarEgresos(mes) {
  return state.datos.egresos
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      return coincideMesValor(mesEgreso, mes);
    })
    .reduce((total, item) => total + Number(item.pagado || 0), 0);
}

function sumarVentasPrevision(mes) {
  return sumarVentas(mes);
}

function sumarVentasUiPeriodo(mes) {
  return calcularVentasUiPorResponsable(mes)
    .reduce((total, fila) => {
      return total
        + Number(fila.montoUiCapillas || 0)
        + Number(fila.montoUiParque || 0);
    }, 0);
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
  return sumarMetaPrevisionMensual(mes) + sumarMetaUiMensual(mes);
}

function sumarMetaPrevisionMensual(mes) {
  const metasVentas = obtenerMetasVentasMes(mes);

  if (metasVentas.length > 0) {
    const metaPrevision = metasVentas
      .reduce((total, meta) => {
        return total + obtenerNumeroMetaVenta(meta, [
          "metaPrevision",
          "meta_prevision",
          "Meta_Prevision",
          "Meta Prevision",
          "Meta_Previsión",
          "Meta Previsión",
          "META_PREVISION"
        ]);
      }, 0);

    if (metaPrevision > 0) {
      return metaPrevision;
    }

    return metasVentas
      .reduce((total, meta) => {
        return total + obtenerNumeroMetaVenta(meta, [
          "metaVentaTotal",
          "meta_venta_total",
          "Meta_Venta_Total",
          "Meta Venta Total",
          "META_VENTA_TOTAL"
        ]);
      }, 0);
  }

  return agruparVentasPorAsesor(mes)
    .reduce((total, fila) => total + Number(fila.metaMensual || 0), 0);
}

function sumarMetaUiMensual(mes) {
  const metasVentas = obtenerMetasVentasMes(mes);

  if (!metasVentas.length) {
    return 0;
  }

  return metasVentas
    .reduce((total, meta) => {
      return total + obtenerNumeroMetaVenta(meta, [
        "metaUsoInmediato",
        "meta_uso_inmediato",
        "Meta_Uso_Inmediato",
        "Meta Uso Inmediato",
        "META_USO_INMEDIATO",

        "metaUsoInmediatoCapillas",
        "meta_uso_inmediato_capillas",
        "Meta_Uso_Inmediato_Capillas",
        "Meta Uso Inmediato Capillas",
        "Meta_UI_Capillas",
        "metaUiCapillas",
        "META_USO_INMEDIATO_CAPILLAS"
      ]);
    }, 0);
}

function obtenerNumeroMetaVenta(meta, campos) {
  return obtenerNumeroCampoFlexible(meta, campos);
}

function obtenerMetasVentasMes(mes) {
  return (state.datos.metasVentas || [])
    .filter((meta) => coincideMesValor(meta.mes, mes))
    .filter((meta) => meta.activo !== false);
}

function contarRegistrosIngresos(mes) {
  return state.datos.ingresos
    .filter((item) => coincideMesValor(item.mes, mes))
    .length;
}

function contarRegistrosEgresos(mes) {
  return state.datos.egresos
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      return coincideMesValor(mesEgreso, mes);
    })
    .length;
}

function calcularTotalPorPagar(mes) {
  return state.datos.egresos
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      return coincideMesValor(mesEgreso, mes);
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
      obtenerFechaEfectivaServicio(item)
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

  const serviciosCapillasActivos = capillasActivos
    .map((item) => crearServicioAgendaDia(item, "activo", "Capillas"))
    .sort((a, b) => a.timestampInicio - b.timestampInicio);

  const serviciosCapillasProgramados = capillasProgramados
    .map((item) => crearServicioAgendaDia(item, "programado", "Capillas"))
    .sort((a, b) => a.timestampInicio - b.timestampInicio);

  const serviciosParqueActivos = parqueActivos
    .map((item) => crearServicioAgendaDia(item, "activo", "Parque"))
    .sort((a, b) => a.timestampInicio - b.timestampInicio);

  const serviciosParqueProgramados = parqueProgramados
    .map((item) => crearServicioAgendaDia(item, "programado", "Parque"))
    .sort((a, b) => a.timestampInicio - b.timestampInicio);

  setText("serviciosDiaCapillasActivosTotal", formatoNumero(serviciosCapillasActivos.length));
  setText("serviciosDiaCapillasProgramadosTotal", formatoNumero(serviciosCapillasProgramados.length));
  setText("serviciosDiaParqueActivosTotal", formatoNumero(serviciosParqueActivos.length));
  setText("serviciosDiaParqueProgramadosTotal", formatoNumero(serviciosParqueProgramados.length));

  renderListaServiciosAgenda(
    "serviciosDiaCapillasActivosBody",
    serviciosCapillasActivos,
    "Sin servicios activos de Capillas actualmente."
  );

  renderListaServiciosAgenda(
    "serviciosDiaCapillasProgramadosBody",
    serviciosCapillasProgramados,
    "Sin servicios programados de Capillas para hoy."
  );

  renderListaServiciosAgenda(
    "serviciosDiaParqueActivosBody",
    serviciosParqueActivos,
    "Sin servicios activos de Parque actualmente."
  );

  renderListaServiciosAgenda(
    "serviciosDiaParqueProgramadosBody",
    serviciosParqueProgramados,
    "Sin servicios programados de Parque para hoy."
  );

  setText(
    "serviciosDiaActualizado",
    `Hora local: ${formatearFechaHoraCorta(ahora)}`
  );

  console.log("Servicios del día:", {
    ahora: ahora.toString(),
    capillasActivos: serviciosCapillasActivos.length,
    capillasProgramados: serviciosCapillasProgramados.length,
    parqueActivos: serviciosParqueActivos.length,
    parqueProgramados: serviciosParqueProgramados.length
  });
}

function crearServicioAgendaDia(item, estado, origen) {
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

  const tipoServicio = obtenerCampoServicio(item, [
    "tipoServicio",
    "Tipo_Servicio",
    "TipoServicio",
    "servicio",
    "Servicio"
  ]);

  const finado = obtenerCampoServicio(item, [
    "finado",
    "Finado",
    "nombreFallecido",
    "Nombre_Fallecido"
  ]);

  if (origen === "Capillas") {
    const ubicacion = obtenerCampoServicio(item, [
      "ubicacionServicio",
      "Ubicacion_Servicio",
      "UbicacionServicio",
      "sucursal",
      "Sucursal"
    ]);

    const sala = obtenerCampoServicio(item, [
      "sala",
      "Sala"
    ]);

    return {
      estado,
      origen,
      titulo: finado || "Sin finado",
      subtitulo: [ubicacion, sala].filter(Boolean).join(" · "),
      detalle: tipoServicio || "Sin tipo de servicio",
      ubicacion: ubicacion || "Sin ubicación",
      sala: sala || "",
      inicio: fechaInicio,
      fin: fechaFin,
      timestampInicio: fechaInicio ? fechaInicio.getTime() : 0
    };
  }

  const loteNicho = obtenerCampoServicio(item, [
    "loteNicho",
    "Lote_Nicho",
    "LoteNicho",
    "NumLote_Nicho",
    "NumLoteNicho"
  ]);

  const servicioParque = obtenerCampoServicio(item, [
    "serviciosParque",
    "Servicios_Parque",
    "ServiciosParque"
  ]);

  return {
    estado,
    origen,
    titulo: finado || servicioParque || tipoServicio || "Servicio Parque",
    subtitulo: loteNicho || "Sin lote/nicho",
    detalle: [tipoServicio, servicioParque].filter(Boolean).join(" · "),
    ubicacion: loteNicho || "Sin ubicación",
    sala: "",
    inicio: fechaInicio,
    fin: fechaFin,
    timestampInicio: fechaInicio ? fechaInicio.getTime() : 0
  };
}

function renderListaServiciosAgenda(contenedorId, servicios, mensajeVacio) {
  const contenedor = document.getElementById(contenedorId);

  if (!contenedor) {
    return;
  }

  if (!servicios.length) {
    contenedor.innerHTML = `
      <div class="servicios-agenda-empty">
        ${escaparHtml(mensajeVacio)}
      </div>
    `;
    return;
  }

  contenedor.innerHTML = servicios
    .map((servicio) => renderTarjetaServicioAgenda(servicio))
    .join("");
}

function renderTarjetaServicioAgenda(servicio) {
  const claseEstado = servicio.estado === "activo" ? "is-activo" : "is-programado";
  const textoEstado = servicio.estado === "activo" ? "Activo ahora" : "Programado";
  const textoHorario = servicio.fin
    ? `${formatearHoraCorta(servicio.inicio)} - ${formatearHoraCorta(servicio.fin)}`
    : `${formatearHoraCorta(servicio.inicio)}`;

  const claseOrigen = servicio.origen === "Capillas"
    ? "origen-capillas"
    : "origen-parque";

  return `
    <article class="servicio-agenda-card ${claseEstado}">
      <div class="servicio-agenda-top">
        <span class="servicio-agenda-badge ${claseEstado}">
          ${escaparHtml(textoEstado)}
        </span>

        <span class="servicio-agenda-origin ${claseOrigen}">
          ${escaparHtml(servicio.origen)}
        </span>
      </div>

      <div class="servicio-agenda-body">
        <h4>${escaparHtml(servicio.titulo)}</h4>

        <div class="servicio-agenda-meta">
          ${escaparHtml(servicio.subtitulo || "Sin ubicación")}
        </div>

        <div class="servicio-agenda-detail">
          ${escaparHtml(servicio.detalle || "Sin tipo de servicio")}
        </div>
      </div>

      <div class="servicio-agenda-footer">
        <span>Horario</span>
        <strong>${escaparHtml(textoHorario)}</strong>
      </div>
    </article>
  `;
}

function renderServiciosDelDiaSeguro() {
  if (typeof renderServiciosDelDia !== "function") {
    return;
  }

  renderServiciosDelDia();

  setTimeout(() => {
    renderServiciosDelDia();
  }, 500);
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

function obtenerFechaEfectivaServicio(item) {
  return obtenerCampoServicio(item, [
    "fechaServicio",
    "Fecha_Servicio",
    "FechaServicio",

    "fechaCreacionOrigen",
    "Fecha_Creacion_Origen",
    "FechaCreacionOrigen",

    "fechaCreacionOriginal",
    "Fecha_Creacion_Original",
    "FechaCreacionOriginal"
  ]);
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
      const tipoRegistro = obtenerTipoContratoServicioCapillas(item);

      return esMes
        && esCapillas
        && tipoRegistro.includes(tipoNormalizado);
    })
    .length;
}

function obtenerTipoContratoServicioCapillas(item) {
  return normalizarClaveComparacion(
    item.previsionUsoInmediato ||
    item.prevision_uso_inmediato ||
    item.Prevision_Uso_Inmediato ||
    ""
  );
}

function esServicioCapillasUsoInmediato(item) {
  const tipo = obtenerTipoContratoServicioCapillas(item);

  return tipo.includes("USO INMEDIATO") ||
    tipo === "UI";
}

function esServicioCapillasPrevision(item) {
  const tipo = obtenerTipoContratoServicioCapillas(item);

  return tipo.includes("PREVISION") ||
    tipo.includes("PREVISIÓN");
}

function normalizarTexto(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  return String(valor).trim();
}

function renderDetalleServiciosParque(mes, totalParque) {
  const resumenPropiedades = calcularResumenParquePropiedades();

  setText("pageParqueServiciosTotal", formatoNumero(totalParque));

  setText(
    "pageParquePropiedadesConstruidas",
    formatoNumero(resumenPropiedades.construidas)
  );

  setText(
    "pageParqueConstruidasProyectadoPct",
    resumenPropiedades.proyectadas > 0
      ? formatoPorcentaje(resumenPropiedades.porcentajeConstruidasProyectado)
      : "—"
  );

  setText(
    "pageParquePropiedadesVendidas",
    formatoNumero(resumenPropiedades.vendidas)
  );

  setText(
    "pageParqueVendidasConstruidoPct",
    resumenPropiedades.proyectadas > 0
      ? formatoPorcentaje(resumenPropiedades.porcentajeVendidasConstruido)
      : "—"
  );

  setText(
    "pageParquePropiedadesUtilizadas",
    formatoNumero(resumenPropiedades.usadas)
  );

  setText(
    "pageParqueUtilizadasProyectadoPct",
    resumenPropiedades.proyectadas > 0
      ? formatoPorcentaje(resumenPropiedades.porcentajeUtilizadasProyectado)
      : "—"
  );

  renderGraficaServiciosParqueMensuales();
  renderTablaParquePropiedadesBase();

  if (typeof renderTablaParqueConstruccion === "function") {
    renderTablaParqueConstruccion();
  }
}

function calcularResumenParquePropiedades() {
  const filas = state.datos.parquePropiedades || [];

  const resumen = filas.reduce((acc, fila) => {
    const proyectado = Number(fila.numeroProyectado || 0);
    const construido = Number(fila.numeroConstruido || 0);
    const noConstruido = Number(fila.numeroNoConstruido || 0);
    const vendido = Number(fila.numeroVendido || 0);
    const usado = Number(fila.numeroUsado || 0);
    const disponible = Number(fila.numeroDisponible || 0);

    acc.proyectadas += proyectado;
    acc.construidas += construido;
    acc.noConstruidas += noConstruido;
    acc.vendidas += vendido;
    acc.usadas += usado;
    acc.disponibles += disponible;

    return acc;
  }, {
    proyectadas: 0,
    construidas: 0,
    noConstruidas: 0,
    vendidas: 0,
    usadas: 0,
    disponibles: 0
  });

  const totalProyectado = resumen.proyectadas > 0
    ? resumen.proyectadas
    : resumen.construidas + resumen.noConstruidas;

  return {
    ...resumen,
    proyectadas: totalProyectado,

    porcentajeConstruidasProyectado: totalProyectado > 0
      ? resumen.construidas / totalProyectado
      : 0,

    porcentajeVendidasConstruido: totalProyectado > 0 ? resumen.vendidas / totalProyectado : 0,

    porcentajeUtilizadasProyectado: totalProyectado > 0
      ? resumen.usadas / totalProyectado
      : 0
  };
}

function renderGraficaServiciosParqueMensuales() {
  const canvas = document.getElementById("chartServiciosParqueMensuales");

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  const meses = obtenerMesesDelAnioSeleccionado();
  const labels = meses.map((mes) => mes.nombre);

  const valoresParque = meses.map((mes) =>
    contarServiciosPorOrigen(mes.clave, "PARQUE")
  );

  destruirGrafica("serviciosParqueMensuales");

  dashboardCharts.serviciosParqueMensuales = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
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
              return `Servicios Parque: ${formatoNumero(context.parsed.y || 0)}`;
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

function renderTablaParquePropiedadesBase() {
  const contenedor = document.getElementById("tablaParquePropiedadesBase");

  if (!contenedor) {
    return;
  }

  const filas = obtenerFilasParquePropiedadesOrdenadas();

  if (!filas.length) {
    contenedor.innerHTML = `
      <div class="empty-state">
        No hay información de propiedades de Parque para mostrar.
      </div>
    `;
    return;
  }

  const totalProyectado = filas.reduce((acc, fila) => acc + Number(fila.numeroProyectado || 0), 0);
  const totalConstruido = filas.reduce((acc, fila) => acc + Number(fila.numeroConstruido || 0), 0);
  const totalNoConstruido = filas.reduce((acc, fila) => acc + Number(fila.numeroNoConstruido || 0), 0);
  const totalVendido = filas.reduce((acc, fila) => acc + Number(fila.numeroVendido || 0), 0);
  const totalUsado = filas.reduce((acc, fila) => acc + Number(fila.numeroUsado || 0), 0);
  const totalDisponible = filas.reduce((acc, fila) => acc + Number(fila.numeroDisponible || 0), 0);
  const totalSeparado = filas.reduce((acc, fila) => acc + Number(fila.numeroSeparado || 0), 0);
  const totalSuspendido = filas.reduce((acc, fila) => acc + Number(fila.numeroSuspendido || 0), 0);

  const htmlFilas = filas.map((fila) => {
    const proyectado = Number(fila.numeroProyectado || 0);
    const construido = Number(fila.numeroConstruido || 0);
    const noConstruido = Number(fila.numeroNoConstruido || 0);
    const vendido = Number(fila.numeroVendido || 0);
    const usado = Number(fila.numeroUsado || 0);
    const disponible = Number(fila.numeroDisponible || 0);
    const separado = Number(fila.numeroSeparado || 0);
    const suspendido = Number(fila.numeroSuspendido || 0);

    const porcentajeVendido = proyectado > 0 ? vendido / proyectado : 0;
    const porcentajeUsado = proyectado > 0 ? usado / proyectado : 0;

    return `
      <tr>
        <td>${escaparHtml(fila.categoria || "Sin categoría")}</td>
        <td>${escaparHtml(fila.tipoPropiedad || "")}</td>
        <td class="numeric">${formatoNumero(proyectado)}</td>
        <td class="numeric">${formatoNumero(construido)}</td>
        <td class="numeric">${formatoNumero(noConstruido)}</td>
        <td class="numeric">${formatoNumero(vendido)}</td>
        <td class="numeric">${formatoNumero(usado)}</td>
        <td class="numeric">${formatoNumero(disponible)}</td>
        <td class="numeric">${formatoNumero(separado)}</td>
        <td class="numeric">${formatoNumero(suspendido)}</td>
        <td class="numeric">${formatoPorcentaje(porcentajeVendido)}</td>
        <td class="numeric">${formatoPorcentaje(porcentajeUsado)}</td>
      </tr>
    `;
  }).join("");

  const porcentajeTotalVendido = totalProyectado > 0 ? totalVendido / totalProyectado : 0;
  const porcentajeTotalUsado = totalProyectado > 0 ? totalUsado / totalProyectado : 0;

  contenedor.innerHTML = `
    <div class="table-scroll parque-propiedades-scroll">
      <table class="table detail-table tabla-parque-propiedades">
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Tipo</th>
            <th>Proyectado</th>
            <th>Construido</th>
            <th>No construido</th>
            <th>Vendido</th>
            <th>Ocupado</th>
            <th>Disponible</th>
            <th>Separado</th>
            <th>Suspendido</th>
            <th>% vendido</th>
            <th>% ocupado</th>
          </tr>
        </thead>
        <tbody>
          ${htmlFilas}
        </tbody>
        <tfoot>
          <tr>
            <th>Total</th>
            <th></th>
            <th class="numeric">${formatoNumero(totalProyectado)}</th>
            <th class="numeric">${formatoNumero(totalConstruido)}</th>
            <th class="numeric">${formatoNumero(totalNoConstruido)}</th>
            <th class="numeric">${formatoNumero(totalVendido)}</th>
            <th class="numeric">${formatoNumero(totalUsado)}</th>
            <th class="numeric">${formatoNumero(totalDisponible)}</th>
            <th class="numeric">${formatoNumero(totalSeparado)}</th>
            <th class="numeric">${formatoNumero(totalSuspendido)}</th>
            <th class="numeric">${formatoPorcentaje(porcentajeTotalVendido)}</th>
            <th class="numeric">${formatoPorcentaje(porcentajeTotalUsado)}</th>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  conectarFiltrosTablas();
}

function obtenerFilasParquePropiedadesOrdenadas() {
  const filas = state.datos.parquePropiedades || [];

  return [...filas].sort((a, b) => {
    const ordenA = obtenerOrdenCategoriaParque(a.categoria);
    const ordenB = obtenerOrdenCategoriaParque(b.categoria);

    return ordenA - ordenB;
  });
}

function obtenerOrdenCategoriaParque(categoria) {
  const clave = normalizarClaveComparacion(categoria);

  const orden = {
    BRONCE: 1,
    PLATA: 2,
    ORO: 3,
    PLATINO: 4,
    VIP: 5,
    NICHOS: 6,
    NICHO: 6
  };

  return orden[clave] || 99;
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
    .filter((item) => coincideMesValor(item.mes, mes))
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
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      return coincideMesValor(mesEgreso, mes);
    })
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
      const esMes = coincideMesValor(meta.mes, mes);
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
    .filter((item) => coincideMesValor(item.mes, mes))
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

  /*
    Reglas de metas de cobranza:

    Panteón:
    - COB PROP.
    - PAGOS EX PROP.

    Servicios CH:
    - COBRANZA SERVICIO CH
    - COBANZA SERVICIO CH  // variante con typo en origen
    - PAGOS EX CH

    Servicios AF:
    - COBRANZA AGUA FRIA
    - PAGOS EX AF

    Total Service:
    - mensualidad TS
    - TS + MENSUALIDAD
    - PAGOS EX TS
    - PAGOS EXT TS
    - TSC
    - PAGOS EX TSC
    - PAGOS EXT TSC
  */

  if (
    categoria === "COB PROP" ||
    categoria === "COB PROP." ||
    categoria === "PAGOS EX PROP" ||
    categoria === "PAGOS EX PROP."
  ) {
    return "Panteon";
  }

  if (
    categoria === "COBRANZA SERVICIO CH" ||
    categoria === "COBANZA SERVICIO CH" ||
    categoria === "PAGOS EX CH"
  ) {
    return "Servicios CH";
  }

  if (
    categoria === "COBRANZA AGUA FRIA" ||
    categoria === "PAGOS EX AF"
  ) {
    return "Servicios AF";
  }

  if (
    categoria === "MENSUALIDAD TS" ||
    categoria === "TS" ||
    categoria === "PAGOS EX TS" ||
    categoria === "PAGOS EXT TS" ||
    categoria === "TSC" ||
    categoria === "PAGOS EX TSC" ||
    categoria === "PAGOS EXT TSC"
  ) {
    if (categoria === "TS" && subcategoria !== "MENSUALIDAD" && subcategoria !== "MEN") {
      return "Sin área";
    }

    return "Total Service";
  }

  return "Sin área";
}

function esBancoValidoMetaCobranza(banco) {
  const bancoNormalizado = normalizarClaveComparacion(banco);

  return [
    "BANAMEX",
    "BANREGIO",
    "CAJA",
    "JDJP",
    "JDP"
  ].includes(bancoNormalizado);
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
  const valoresIngresos = meses.map((mes) => sumarIngresoRealCobranza(mes.clave));
  const valoresMetas = meses.map((mes) => sumarMetaCobranzaMensual(mes.clave));

  const datasets = [
    {
      label: "Ingreso real",
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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 10,
          right: 10,
          bottom: 10,
          left: 10
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
        <td colspan="4">Sin información para el periodo seleccionado.</td>
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
    .filter((item) => coincideMesValor(item.mes, mes))
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
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 10,
          right: 10,
          bottom: 10,
          left: 10
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

  conectarClickEgresosTipoGasto(mes);

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

      return coincideMesValor(mesEgreso, mes) && porPagar > 0;
    })
    .sort((a, b) => Number(b.porPagar || 0) - Number(a.porPagar || 0));

  if (pendientes.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">Sin pagos pendientes para el periodo seleccionado.</td>
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
        <td colspan="${columnas}">Sin información para el periodo seleccionado.</td>
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

      return coincideMesValor(mesEgreso, mes) && pagado > 0;
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

  const valoresVentasPrevision = meses.map((mes) =>
    sumarVentasPrevision(mes.clave)
  );

  const valoresMetaPrevision = meses.map((mes) =>
    sumarMetaPrevisionMensual(mes.clave)
  );

  const valoresVentasUi = meses.map((mes) =>
    sumarVentasUiPeriodo(mes.clave)
  );

  const valoresMetaUi = meses.map((mes) =>
    sumarMetaUiMensual(mes.clave)
  );

  destruirGrafica("ventasMensuales");

  dashboardCharts.ventasMensuales = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Ventas Previsión",
          data: valoresVentasPrevision,
          tension: 0.3,
          fill: false,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: "Meta Previsión",
          data: valoresMetaPrevision,
          tension: 0.3,
          fill: false,
          borderWidth: 3,
          borderDash: [6, 6],
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: "Ventas UI",
          data: valoresVentasUi,
          tension: 0.3,
          fill: false,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: "Meta UI",
          data: valoresMetaUi,
          tension: 0.3,
          fill: false,
          borderWidth: 3,
          borderDash: [6, 6],
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
      onClick: (event, elementos) => {
        if (!elementos || elementos.length === 0) {
          return;
        }

        const elemento = elementos[0];
        const index = elemento.index;
        const asesor = labels[index];

        if (!asesor) {
          return;
        }

        abrirModalVentasAsesor(asesor);
      },
      onHover: (event, elementos) => {
        const canvas = event?.native?.target;

        if (canvas) {
          canvas.style.cursor = elementos && elementos.length > 0
            ? "pointer"
            : "default";
        }
      },
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

function obtenerHistoricoVentasAsesor(nombreAsesor) {
  const asesorBuscado = normalizarTexto(nombreAsesor).toUpperCase();
  const meses = obtenerMesesDelAnioSeleccionado();

  return meses.map((mes) => {
    const filasAsesorMes = agruparVentasPorAsesor(mes.clave);
    const filaAsesor = filasAsesorMes.find((fila) => {
      return normalizarTexto(fila.nombre).toUpperCase() === asesorBuscado;
    });

    return {
      mes: mes.clave,
      nombreMes: mes.nombre,
      venta: filaAsesor ? Number(filaAsesor.total || 0) : 0,
      meta: filaAsesor ? Number(filaAsesor.metaMensual || 0) : 0,
      unidades: filaAsesor ? Number(filaAsesor.unidades || 0) : 0,
      registros: filaAsesor ? Number(filaAsesor.registros || 0) : 0
    };
  });
}

function calcularResumenHistoricoVentasAsesor(nombreAsesor) {
  const historico = obtenerHistoricoVentasAsesor(nombreAsesor);

  const totalVenta = historico.reduce((suma, fila) => {
    return suma + Number(fila.venta || 0);
  }, 0);

  const totalMeta = historico.reduce((suma, fila) => {
    return suma + Number(fila.meta || 0);
  }, 0);

  const totalUnidades = historico.reduce((suma, fila) => {
    return suma + Number(fila.unidades || 0);
  }, 0);

  const mejorMes = historico.reduce((mejor, fila) => {
    if (!mejor || Number(fila.venta || 0) > Number(mejor.venta || 0)) {
      return fila;
    }

    return mejor;
  }, null);

  return {
    totalVenta,
    totalMeta,
    totalUnidades,
    porcentajeCumplimiento: totalMeta > 0 ? totalVenta / totalMeta : 0,
    mejorMesNombre: mejorMes && Number(mejorMes.venta || 0) > 0
      ? mejorMes.nombreMes
      : "Sin venta"
  };
}

function renderResumenHistoricoVentasAsesor(nombreAsesor) {
  const resumen = calcularResumenHistoricoVentasAsesor(nombreAsesor);

  setText("ventasAsesorHistoricoTotal", formatoMoneda(resumen.totalVenta));
  setText("ventasAsesorHistoricoMeta", resumen.totalMeta > 0 ? formatoMoneda(resumen.totalMeta) : "Sin meta");
  setText(
    "ventasAsesorHistoricoCumplimiento",
    resumen.totalMeta > 0 ? formatoPorcentaje(resumen.porcentajeCumplimiento) : "—"
  );
  setText("ventasAsesorHistoricoMejorMes", resumen.mejorMesNombre);
  setText("ventasAsesorHistoricoUnidades", formatoNumero(resumen.totalUnidades));
}

function abrirModalVentasAsesor(nombreAsesor) {
  abrirModalVentasAsesorBase(nombreAsesor);
  renderResumenHistoricoVentasAsesor(nombreAsesor);
  renderGraficaHistoricoVentasAsesor(nombreAsesor);
}

function renderGraficaHistoricoVentasAsesor(nombreAsesor) {
  const canvas = document.getElementById("chartVentasAsesorHistorico");

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  const historico = obtenerHistoricoVentasAsesor(nombreAsesor);

  const labels = historico.map((fila) => fila.nombreMes);
  const ventas = historico.map((fila) => fila.venta);
  const metas = historico.map((fila) => fila.meta);

  const hayMetas = metas.some((valor) => Number(valor || 0) > 0);

  const datasets = [
    {
      label: "Venta mensual",
      data: ventas,
      tension: 0.3,
      fill: false,
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 6
    }
  ];

  if (hayMetas) {
    datasets.push({
      label: "Meta mensual",
      data: metas,
      tension: 0.3,
      fill: false,
      borderWidth: 3,
      borderDash: [6, 6],
      pointRadius: 4,
      pointHoverRadius: 6
    });
  }

  destruirGrafica("ventasAsesorHistorico");

  dashboardCharts.ventasAsesorHistorico = new Chart(canvas, {
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
              const valor = Number(context.parsed.y || 0);
              const etiqueta = context.dataset.label || "Monto";

              return `${etiqueta}: ${formatoMoneda(valor)}`;
            },
            afterBody: (items) => {
              if (!items || !items.length) {
                return "";
              }

              const index = items[0].dataIndex;
              const fila = historico[index];

              if (!fila) {
                return "";
              }

              const cumplimiento = fila.meta > 0
                ? fila.venta / fila.meta
                : 0;

              return [
                `Unidades: ${formatoNumero(fila.unidades)}`,
                `Registros: ${formatoNumero(fila.registros)}`,
                `Cumplimiento: ${fila.meta > 0 ? formatoPorcentaje(cumplimiento) : "—"}`
              ];
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


function abrirModalVentasAsesorBase(nombreAsesor) {
  const modal = document.getElementById("ventasAsesorModal");
  const title = document.getElementById("ventasAsesorModalTitle");
  const subtitle = document.getElementById("ventasAsesorModalSubtitle");

  if (!modal) {
    return;
  }

  conectarModalVentasAsesor();

  if (title) {
    title.textContent = `Histórico de ventas - ${nombreAsesor || "Asesor"}`;
  }

  if (subtitle) {
    subtitle.textContent = `Venta mensual vs meta mensual durante ${state.anioSeleccionado || "el año seleccionado"}.`;
  }

  modal.classList.remove("hidden");
}

function cerrarModalVentasAsesor() {
  const modal = document.getElementById("ventasAsesorModal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");

  destruirGrafica("ventasAsesorHistorico");
}

let modalVentasAsesorConectado = false;

function conectarModalVentasAsesor() {
  if (modalVentasAsesorConectado) {
    return;
  }

  const modal = document.getElementById("ventasAsesorModal");
  const closeButton = document.getElementById("ventasAsesorModalClose");

  if (closeButton) {
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cerrarModalVentasAsesor();
    });
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        cerrarModalVentasAsesor();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cerrarModalVentasAsesor();
    }
  });

  modalVentasAsesorConectado = true;
}

let modalEgresosTipoGastoConectado = false;

function abrirModalEgresosTipoGastoBase(tipoGasto) {
  const modal = document.getElementById("egresosTipoGastoModal");
  const title = document.getElementById("egresosTipoGastoModalTitle");
  const subtitle = document.getElementById("egresosTipoGastoModalSubtitle");

  if (!modal) {
    return;
  }

  conectarModalEgresosTipoGasto();

  if (title) {
    title.textContent = `Detalle de egresos - ${tipoGasto || "Tipo de gasto"}`;
  }

  if (subtitle) {
    subtitle.textContent = "Movimientos del tipo de gasto seleccionado dentro del periodo.";
  }

  modal.classList.remove("hidden");
}

function abrirModalEgresosTipoGasto(tipoGasto, mes) {
  abrirModalEgresosTipoGastoBase(tipoGasto);
  renderDetalleModalEgresosTipoGasto(tipoGasto, mes);
}

function conectarClickEgresosTipoGasto(mes) {
  const filas = document.querySelectorAll("#tablaEgresosTipoGastoBody tr");

  filas.forEach((fila) => {
    const primeraCelda = fila.querySelector("td");

    if (!primeraCelda) {
      return;
    }

    const tipoGasto = normalizarTexto(primeraCelda.textContent);

    if (!tipoGasto || tipoGasto.includes("Sin información")) {
      return;
    }

    fila.classList.add("is-clickable", "egresos-tipo-gasto-row");
    fila.dataset.tipoGasto = tipoGasto;

    fila.addEventListener("click", () => {
      abrirModalEgresosTipoGasto(tipoGasto, mes);
    });
  });
}

function renderDetalleModalEgresosTipoGasto(tipoGasto, mes) {
  const tbody = document.getElementById("egresosTipoGastoModalBody");
  const subtitle = document.getElementById("egresosTipoGastoModalSubtitle");

  if (!tbody) {
    return;
  }

  const movimientos = obtenerMovimientosEgresosPorTipoGasto(mes, tipoGasto);
  const totalPagado = movimientos.reduce((suma, item) => suma + Number(item.pagado || 0), 0);
  const totalPorPagar = movimientos.reduce((suma, item) => suma + Number(item.porPagar || 0), 0);

  if (subtitle) {
    subtitle.textContent = `${formatoNumero(movimientos.length)} movimientos · Pagado: ${formatoMoneda(totalPagado)} · Por pagar: ${formatoMoneda(totalPorPagar)}`;
  }

  if (movimientos.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">Sin movimientos para este tipo de gasto en el periodo seleccionado.</td>
      </tr>
    `;
    return;
  }

  const filasHtml = movimientos
    .map((item) => {
      return `
        <tr>
          <td>${escaparHtml(obtenerFechaEgresoTexto(item))}</td>
          <td>${escaparHtml(normalizarTexto(item.beneficiario) || "Sin beneficiario")}</td>
          <td>${escaparHtml(normalizarTexto(item.rubro) || "Sin rubro")}</td>
          <td>${escaparHtml(normalizarTexto(item.contexto || item.concepto) || "Sin contexto")}</td>
          <td>${formatoMoneda(item.pagado)}</td>
          <td>${formatoMoneda(item.porPagar)}</td>
        </tr>
      `;
    })
    .join("");

  const filaTotal = `
    <tr class="modal-total-row">
      <td colspan="4"><strong>Total</strong></td>
      <td><strong>${formatoMoneda(totalPagado)}</strong></td>
      <td><strong>${formatoMoneda(totalPorPagar)}</strong></td>
    </tr>
  `;

  tbody.innerHTML = filasHtml + filaTotal;
}

function obtenerMovimientosEgresosPorTipoGasto(mes, tipoGastoBuscado) {
  const tipoNormalizado = normalizarClaveComparacion(tipoGastoBuscado);

  return (state.datos.egresos || [])
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      const tipoGasto = normalizarClaveComparacion(item.tipoGasto);
      const pagado = Number(item.pagado || 0);
      const porPagar = Number(item.porPagar || 0);

      return coincideMesValor(mesEgreso, mes)
        && tipoGasto === tipoNormalizado
        && (pagado > 0 || porPagar > 0);
    })
    .sort((a, b) => {
      const fechaA = obtenerTimestampEgreso(a);
      const fechaB = obtenerTimestampEgreso(b);

      if (fechaB !== fechaA) {
        return fechaB - fechaA;
      }

      return Number(b.pagado || 0) - Number(a.pagado || 0);
    });
}

function obtenerFechaEgresoTexto(item) {
  const fecha = obtenerFechaEgreso(item);

  if (!fecha) {
    return "—";
  }

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(fecha);
}

function obtenerTimestampEgreso(item) {
  const fecha = obtenerFechaEgreso(item);

  return fecha ? fecha.getTime() : 0;
}

function obtenerFechaEgreso(item) {
  const valor = obtenerValorFechaEgreso(item);

  if (!valor) {
    return null;
  }

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor;
  }

  if (typeof valor === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const fechaExcel = new Date(excelEpoch.getTime() + valor * 86400000);

    return Number.isNaN(fechaExcel.getTime()) ? null : fechaExcel;
  }

  const texto = normalizarTexto(valor);

  if (!texto) {
    return null;
  }

  const fechaIso = new Date(texto);

  if (!Number.isNaN(fechaIso.getTime())) {
    return fechaIso;
  }

  const matchDiaMesAnio = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);

  if (matchDiaMesAnio) {
    const dia = Number(matchDiaMesAnio[1]);
    const mes = Number(matchDiaMesAnio[2]) - 1;
    const anio = Number(matchDiaMesAnio[3]);
    const fecha = new Date(anio, mes, dia);

    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const matchAnioMesDia = texto.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);

  if (matchAnioMesDia) {
    const anio = Number(matchAnioMesDia[1]);
    const mes = Number(matchAnioMesDia[2]) - 1;
    const dia = Number(matchAnioMesDia[3]);
    const fecha = new Date(anio, mes, dia);

    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  return null;
}

function obtenerValorFechaEgreso(item) {
  const camposDirectos = [
    "fecha",
    "Fecha",
    "FECHA",
    "fechaPago",
    "FechaPago",
    "Fecha_Pago",
    "fecha_Pago",
    "fechaEgreso",
    "FechaEgreso",
    "Fecha_Egreso",
    "fechaFactura",
    "FechaFactura",
    "Fecha_Factura"
  ];

  for (const campo of camposDirectos) {
    if (
      item &&
      item[campo] !== undefined &&
      item[campo] !== null &&
      normalizarTexto(item[campo]) !== ""
    ) {
      return item[campo];
    }
  }

  const llaves = Object.keys(item || {});

  const llaveFechaExacta = llaves.find((llave) => {
    const clave = normalizarClaveComparacion(llave);
    return clave === "FECHA";
  });

  if (llaveFechaExacta && normalizarTexto(item[llaveFechaExacta]) !== "") {
    return item[llaveFechaExacta];
  }

  const llaveFechaFlexible = llaves.find((llave) => {
    const clave = normalizarClaveComparacion(llave);
    return clave.includes("FECHA");
  });

  if (llaveFechaFlexible && normalizarTexto(item[llaveFechaFlexible]) !== "") {
    return item[llaveFechaFlexible];
  }

  return "";
}

function cerrarModalEgresosTipoGasto() {
  const modal = document.getElementById("egresosTipoGastoModal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
}

function conectarModalEgresosTipoGasto() {
  if (modalEgresosTipoGastoConectado) {
    return;
  }

  const modal = document.getElementById("egresosTipoGastoModal");
  const closeButton = document.getElementById("egresosTipoGastoModalClose");

  if (closeButton) {
    closeButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      cerrarModalEgresosTipoGasto();
    });
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        cerrarModalEgresosTipoGasto();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cerrarModalEgresosTipoGasto();
    }
  });

  modalEgresosTipoGastoConectado = true;
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
  renderTablaVentasUiResponsable(mes);
  
  renderGraficasVentas(mes);
}

function renderTablaVentasUiResponsable(mes) {
  const tbody = document.getElementById("tablaVentasUiResponsableBody");

  if (!tbody) {
    return;
  }

  const filas = calcularVentasUiPorResponsable(mes);

  const totalServiciosUi = filas.reduce((suma, fila) => {
    return suma
      + Number(fila.ventasUiCapillas || 0)
      + Number(fila.ventasUiParque || 0);
  }, 0);

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">Sin ventas de Uso Inmediato para el periodo seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const totalServiciosResponsable =
        Number(fila.ventasUiCapillas || 0) + Number(fila.ventasUiParque || 0);

      const porcentajeServicios = totalServiciosUi > 0
        ? totalServiciosResponsable / totalServiciosUi
        : 0;

      return `
        <tr>
          <td>${escaparHtml(fila.responsable)}</td>
          <td>${formatoNumero(fila.ventasUiCapillas)}</td>
          <td>${formatoMoneda(fila.montoUiCapillas)}</td>
          <td>${formatoNumero(fila.ventasUiParque)}</td>
          <td>${formatoMoneda(fila.montoUiParque)}</td>
          <td>${formatoPorcentaje(porcentajeServicios)}</td>
        </tr>
      `;
    })
    .join("");
}

function calcularVentasUiPorResponsable(mes) {
  const grupos = new Map();

  obtenerServiciosUsoInmediatoBiServicios(mes).forEach((servicio) => {
    const responsable = obtenerAsesorServicioUi(servicio);
    const origen = obtenerOrigenServicio(servicio);
    const monto = origen === "Capillas"
      ? obtenerMontoServicioUiCapillas(servicio)
      : obtenerMontoServicioUi(servicio);

    if (!grupos.has(responsable)) {
      grupos.set(responsable, {
        responsable,
        ventasUiCapillas: 0,
        montoUiCapillas: 0,
        ventasUiParque: 0,
        montoUiParque: 0
      });
    }

    const grupo = grupos.get(responsable);

    if (origen === "Capillas") {
      grupo.ventasUiCapillas += 1;
      grupo.montoUiCapillas += monto;
      return;
    }

    if (origen === "Parque") {
      grupo.ventasUiParque += 1;
      grupo.montoUiParque += monto;
    }
  });

  return Array.from(grupos.values())
    .map((fila) => {
      return {
        ...fila,
        montoUiCapillas: redondear2(fila.montoUiCapillas),
        montoUiParque: redondear2(fila.montoUiParque)
      };
    })
    .filter((fila) => {
      return Number(fila.ventasUiCapillas || 0) > 0 ||
        Number(fila.ventasUiParque || 0) > 0 ||
        Number(fila.montoUiCapillas || 0) > 0 ||
        Number(fila.montoUiParque || 0) > 0;
    })
    .sort((a, b) => {
      const totalA = Number(a.montoUiCapillas || 0) + Number(a.montoUiParque || 0);
      const totalB = Number(b.montoUiCapillas || 0) + Number(b.montoUiParque || 0);

      return totalB - totalA;
    });
}

function obtenerServiciosUsoInmediatoBiServicios(mes) {
  return (state.datos.servicios || [])
    .filter((servicio) => coincidePeriodoServicio(servicio, mes))
    .filter((servicio) => esServicioUsoInmediatoBiServicios(servicio));
}

function esServicioUsoInmediatoBiServicios(servicio) {
  const valor = obtenerCampoFlexible(servicio, [
    "previsionUsoInmediato",
    "prevision_uso_inmediato",
    "Prevision_Uso_Inmediato",
    "Prevision Uso Inmediato",
    "PREVISION_USO_INMEDIATO"
  ]);

  return normalizarClaveComparacion(valor) === "USO INMEDIATO";
}

function obtenerAsesorServicioUi(servicio) {
  return normalizarTexto(
    obtenerCampoFlexible(servicio, [
      "asesor",
      "Asesor",
      "ASESOR",
      "responsable",
      "Responsable",
      "vendedor",
      "Vendedor"
    ])
  ) || "Sin asesor";
}

function obtenerMontoServicioUi(servicio) {
  return obtenerNumeroCampoFlexible(servicio, [
    "precioTotalServicio",
    "precio_total_servicio",
    "Precio_Total_Servicio",
    "Precio Total Servicio",
    "PRECIO_TOTAL_SERVICIO",
    "totalServicio",
    "Total_Servicio",
    "importe",
    "Importe",
    "monto",
    "Monto",
    "total",
    "Total"
  ]);
}

function obtenerMontoServicioUiCapillas(servicio) {
  return obtenerNumeroCampoFlexible(servicio, [
    "precioVenta",
    "precio_venta",
    "Precio_Venta",
    "Precio Venta",
    "PRECIO_VENTA",
    "venta",
    "Venta"
  ]);
}

function obtenerCampoFlexible(item, campos) {
  for (const campo of campos) {
    if (
      item &&
      item[campo] !== undefined &&
      item[campo] !== null &&
      String(item[campo]).trim() !== ""
    ) {
      return item[campo];
    }
  }

  return "";
}

function obtenerNumeroCampoFlexible(item, campos) {
  const valor = obtenerCampoFlexible(item, campos);

  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : 0;
  }

  const texto = normalizarTexto(valor)
    .replace(/\$/g, "")
    .replace(/,/g, "");

  const numero = Number(texto);

  return Number.isFinite(numero) ? numero : 0;
}

function calcularDistribucionUiVenta(venta) {
  const unidadesCapillas =
    obtenerNumeroVentaCampo(venta, [
      "serviciosAf",
      "serviciosAF",
      "Servicios_AF",
      "Servicios AF",
      "SERVICIOS_AF"
    ]) +
    obtenerNumeroVentaCampo(venta, [
      "serviciosCh",
      "serviciosCH",
      "Servicios_CH",
      "Servicios CH",
      "SERVICIOS_CH"
    ]) +
    obtenerNumeroVentaCampo(venta, [
      "tsTsc",
      "ts_tsc",
      "TS_TSC",
      "TS / TSC",
      "ts",
      "TS",
      "tsc",
      "TSC"
    ]);

  const unidadesParque =
    obtenerNumeroVentaCampo(venta, [
      "propiedades",
      "Propiedades",
      "PROPIEDADES"
    ]) +
    obtenerNumeroVentaCampo(venta, [
      "nichos",
      "Nichos",
      "NICHOS"
    ]);

  const unidadesUi = unidadesCapillas + unidadesParque;
  const montoVenta = obtenerMontoVenta(venta);

  if (unidadesUi <= 0 || montoVenta <= 0) {
    return {
      unidadesCapillas,
      unidadesParque,
      unidadesUi,
      montoCapillas: 0,
      montoParque: 0
    };
  }

  return {
    unidadesCapillas,
    unidadesParque,
    unidadesUi,
    montoCapillas: montoVenta * (unidadesCapillas / unidadesUi),
    montoParque: montoVenta * (unidadesParque / unidadesUi)
  };
}

function obtenerResponsableVentaUi(contrato) {
  return normalizarTexto(
    contrato.asesor ||
    contrato.responsable ||
    contrato.vendedor ||
    contrato.nombreAsesor ||
    "Sin responsable"
  );
}

function esContratoUsoInmediato(contrato) {
  const texto = normalizarClaveComparacion([
    contrato.tipoContrato,
    contrato.tipoServicio,
    contrato.tipoRegistro,
    contrato.fuente,
    contrato.hojaOrigen
  ].join(" "));

  return texto.includes("USO INMEDIATO") ||
    texto.includes("USO INM") ||
    texto.includes("INMEDIATO") ||
    texto.includes(" UI ") ||
    texto.endsWith(" UI") ||
    texto.startsWith("UI ");
}

function clasificarContratoUiCapillasParque(contrato) {
  const unidadesCapillas =
    obtenerNumeroVentaCampo(contrato, [
      "serviciosAf",
      "serviciosAF",
      "Servicios_AF",
      "Servicios AF",
      "SERVICIOS_AF"
    ]) +
    obtenerNumeroVentaCampo(contrato, [
      "serviciosCh",
      "serviciosCH",
      "Servicios_CH",
      "Servicios CH",
      "SERVICIOS_CH"
    ]);

  const unidadesParque =
    obtenerNumeroVentaCampo(contrato, [
      "propiedades",
      "Propiedades",
      "PROPIEDADES"
    ]) +
    obtenerNumeroVentaCampo(contrato, [
      "nichos",
      "Nichos",
      "NICHOS"
    ]);

  const texto = normalizarClaveComparacion([
    contrato.tipoContrato,
    contrato.tipoServicio,
    contrato.tipoRegistro,
    contrato.sucursal,
    contrato.fuente,
    contrato.hojaOrigen
  ].join(" "));

  const textoCapillas = texto.includes("CAPILLA") ||
    texto.includes("CHURUBUSCO") ||
    texto.includes("APODACA") ||
    texto.includes("AGUA FRIA") ||
    texto.includes("SERVICIO CH") ||
    texto.includes("SERVICIOS CH") ||
    texto.includes("SERVICIO AF") ||
    texto.includes("SERVICIOS AF") ||
    texto.includes("CREMACION") ||
    texto.includes("VELACION");

  const textoParque = texto.includes("PARQUE") ||
    texto.includes("PANTEON") ||
    texto.includes("PANTEON") ||
    texto.includes("PROPIEDAD") ||
    texto.includes("PROPIEDADES") ||
    texto.includes("NICHO") ||
    texto.includes("NICHOS") ||
    texto.includes("LOTE") ||
    texto.includes("LOTES") ||
    texto.includes("INHUMACION") ||
    texto.includes("DEPOSITO");

  const esUiCapillas = unidadesCapillas > 0 || textoCapillas;
  const esUiParque = unidadesParque > 0 || textoParque;

  return {
    esUiCapillas,
    esUiParque,
    unidadesCapillas,
    unidadesParque
  };
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

    const unidadesPropiedades = obtenerNumeroVentaCampo(item, [
      "propiedades",
      "Propiedades",
      "PROPIEDADES"
    ]);

    const unidadesNichos = obtenerNumeroVentaCampo(item, [
      "nichos",
      "Nichos",
      "NICHOS"
    ]);

    const unidadesServicios =
      obtenerNumeroVentaCampo(item, ["serviciosAf", "serviciosAF", "Servicios_AF", "Servicios AF", "SERVICIOS_AF"]) +
      obtenerNumeroVentaCampo(item, ["serviciosCh", "serviciosCH", "Servicios_CH", "Servicios CH", "SERVICIOS_CH"]);

    const esComplemento = esContratoComplementoVenta(item);

    if (unidadesPropiedades > 0 && unidadesNichos <= 0 && !esComplemento) {
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

function esContratoComplementoVenta(item) {
  const texto = normalizarClaveComparacion([
    item.tipoServicio,
    item.tipoContrato,
    item.tipoRegistro,
    item.fuente,
    item.hojaOrigen,
    item.numeroContrato,
    item.referencia
  ].join(" "));

  return texto.includes("COMPLEMENTO") ||
    texto.includes("COMPLEMENTARIO") ||
    texto.includes("TOTAL SERVICE COMPLEMENTO") ||
    texto === "TSC" ||
    texto.includes(" TSC ");
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
    const mesMeta = normalizarTexto(item.mes) || obtenerMesBasePeriodo(mes);

    if (montoVenta <= 0 && unidades <= 0 && metaMensual <= 0) {
      return;
    }

    if (!grupos.has(asesor)) {
      grupos.set(asesor, {
        nombre: asesor,
        registros: 0,
        unidades: 0,
        total: 0,
        metaMensual: 0,
        mesesMetaRegistrados: new Set()
      });
    }

    const grupo = grupos.get(asesor);

    grupo.registros += 1;
    grupo.unidades += unidades;
    grupo.total += montoVenta;

    if (metaMensual > 0 && !grupo.mesesMetaRegistrados.has(mesMeta)) {
      grupo.metaMensual += metaMensual;
      grupo.mesesMetaRegistrados.add(mesMeta);
    }
  });

  return Array.from(grupos.values())
    .map((grupo) => {
      return {
        nombre: grupo.nombre,
        registros: grupo.registros,
        unidades: grupo.unidades,
        total: grupo.total,
        metaMensual: grupo.metaMensual
      };
    })
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
        <td colspan="4">Sin contratos para el periodo seleccionado.</td>
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
  const mesBase = obtenerMesBasePeriodo(mesSeleccionado);

  return coincideMesVenta(item.mes, mesSeleccionado)
    && coincideAnioRegistro(item, mesBase, [
      "fecha",
      "fechaContrato",
      "hojaOrigen",
      "fuente"
    ]);
}
  
function coincideMesVenta(mesRegistro, mesSeleccionado) {
  return coincideMesValor(mesRegistro, mesSeleccionado);
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

function renderDetalleServiciosCapillas(mes, totalCapillas) {
  renderGraficasServiciosCapillas();
  renderTablaServiciosUbicacionCapillas(mes, totalCapillas);
  renderTablaServiciosTipoServicioCapillas(mes, totalCapillas);
  renderTablaServiciosResponsableCapillas(mes, totalCapillas);
  renderTablaServiciosRecientesCapillas(mes);
}

function obtenerServiciosCapillasMes(mes) {
  return (state.datos.servicios || [])
    .filter((item) => coincidePeriodoServicio(item, mes))
    .filter((item) => obtenerOrigenServicio(item) === "Capillas");
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

function renderGraficasServiciosCapillas() {
  if (typeof Chart === "undefined") {
    return;
  }

  renderGraficaServiciosCapillasMensuales();
}

function renderGraficaServiciosCapillasMensuales() {
  const canvas = document.getElementById("chartServiciosMensuales");

  if (!canvas) {
    return;
  }

  const meses = obtenerMesesDelAnioSeleccionado();

  const labels = meses.map((mes) => mes.nombre);

  const valoresUsoInmediato = meses.map((mes) =>
    contarServiciosCapillasPorTipoContrato(mes.clave, "USO INMEDIATO")
  );

  const valoresPrevision = meses.map((mes) =>
    contarServiciosCapillasPorTipoContrato(mes.clave, "PREVISION")
  );

  destruirGrafica("serviciosMensuales");

  dashboardCharts.serviciosMensuales = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Uso Inmediato",
          data: valoresUsoInmediato,
          tension: 0.3,
          fill: false,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        {
          label: "Previsión",
          data: valoresPrevision,
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

function renderTablaServiciosUbicacionCapillas(mes, totalCapillas) {
  const tbody = document.getElementById("tablaServiciosUbicacionBody");

  if (!tbody) {
    return;
  }

  const grupos = new Map();

  obtenerServiciosCapillasMes(mes).forEach((item) => {
    const ubicacion = normalizarTexto(
      item.ubicacionServicio ||
      item.sucursal ||
      "Sin ubicación"
    );

    if (!grupos.has(ubicacion)) {
      grupos.set(ubicacion, {
        nombre: ubicacion,
        total: 0,
        usoInmediato: 0,
        prevision: 0
      });
    }

    const grupo = grupos.get(ubicacion);
    grupo.total += 1;

    if (esServicioCapillasUsoInmediato(item)) {
      grupo.usoInmediato += 1;
    }

    if (esServicioCapillasPrevision(item)) {
      grupo.prevision += 1;
    }
  });

  const filas = Array.from(grupos.values())
    .sort((a, b) => {
      const ordenA = obtenerOrdenUbicacionServicio(a.nombre);
      const ordenB = obtenerOrdenUbicacionServicio(b.nombre);

      if (ordenA !== ordenB) {
        return ordenA - ordenB;
      }

      return b.total - a.total;
    });

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Sin información de Capillas para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const porcentaje = totalCapillas > 0 ? fila.total / totalCapillas : 0;

      return `
        <tr>
          <td>${escaparHtml(fila.nombre)}</td>
          <td>${formatoNumero(fila.total)}</td>
          <td>${formatoNumero(fila.usoInmediato)}</td>
          <td>${formatoNumero(fila.prevision)}</td>
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

function renderTablaServiciosTipoServicioCapillas(mes, totalCapillas) {
  const tbody = document.getElementById("tablaServiciosTipoBody");

  if (!tbody) {
    return;
  }

  const tiposPermitidos = [
    "Inhumación",
    "Cremación",
    "Cremación Directa (con velación)",
    "Cremación Directa (sin velación)",
    "Renta de Capillas",
    "Traslado"
  ];

  const grupos = new Map();

  tiposPermitidos.forEach((tipo) => {
    grupos.set(tipo, {
      origen: "Capillas",
      tipoServicio: tipo,
      registros: 0
    });
  });

  obtenerServiciosCapillasMes(mes).forEach((item) => {
    const tipoServicio = normalizarTipoServicioCapillasDashboard(
      item.tipoServicio
    );

    if (!grupos.has(tipoServicio)) {
      grupos.set(tipoServicio, {
        origen: "Capillas",
        tipoServicio,
        registros: 0
      });
    }

    grupos.get(tipoServicio).registros += 1;
  });

  const filas = Array.from(grupos.values())
    .sort((a, b) => {
      const ordenA = tiposPermitidos.indexOf(a.tipoServicio);
      const ordenB = tiposPermitidos.indexOf(b.tipoServicio);

      return (ordenA === -1 ? 99 : ordenA) - (ordenB === -1 ? 99 : ordenB);
    });

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">Sin información de Capillas para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const porcentaje = totalCapillas > 0 ? fila.registros / totalCapillas : 0;

      return `
        <tr>
          <td>${escaparHtml(fila.origen)}</td>
          <td>${escaparHtml(fila.tipoServicio)}</td>
          <td>${formatoNumero(fila.registros)}</td>
          <td>${formatoPorcentaje(porcentaje)}</td>
        </tr>
      `;
    })
    .join("");
}

function normalizarTipoServicioCapillasDashboard(valor) {
  const texto = normalizarClaveComparacion(valor);

  if (texto === "CREMACION DIRECTA") {
    return "Cremación Directa (con velación)";
  }

  if (texto.includes("CREMACION DIRECTA") && texto.includes("SIN")) {
    return "Cremación Directa (sin velación)";
  }

  if (texto.includes("CREMACION DIRECTA")) {
    return "Cremación Directa (con velación)";
  }

  if (texto.includes("INHUMACION")) {
    return "Inhumación";
  }

  if (texto.includes("CREMACION")) {
    return "Cremación";
  }

  if (texto.includes("RENTA")) {
    return "Renta de Capillas";
  }

  if (texto.includes("TRASLADO")) {
    return "Traslado";
  }

  return normalizarTexto(valor) || "Sin tipo de servicio";
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

function renderTablaServiciosResponsableCapillas(mes, totalCapillas) {
  const tbody = document.getElementById("tablaServiciosResponsableBody");

  if (!tbody) {
    return;
  }

  const grupos = new Map();

  obtenerServiciosCapillasMes(mes).forEach((item) => {
    const responsable = normalizarTexto(
      item.responsable ||
      item.asesor ||
      "Sin responsable"
    );

    if (!grupos.has(responsable)) {
      grupos.set(responsable, {
        nombre: responsable,
        total: 0,
        usoInmediato: 0,
        prevision: 0
      });
    }

    const grupo = grupos.get(responsable);
    grupo.total += 1;

    if (esServicioCapillasUsoInmediato(item)) {
      grupo.usoInmediato += 1;
    }

    if (esServicioCapillasPrevision(item)) {
      grupo.prevision += 1;
    }
  });

  const filas = Array.from(grupos.values())
    .sort((a, b) => b.total - a.total);

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Sin información de Capillas para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((fila) => {
      const porcentaje = totalCapillas > 0 ? fila.total / totalCapillas : 0;

      return `
        <tr>
          <td>${escaparHtml(fila.nombre)}</td>
          <td>${formatoNumero(fila.total)}</td>
          <td>${formatoNumero(fila.usoInmediato)}</td>
          <td>${formatoNumero(fila.prevision)}</td>
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
        <td colspan="5">Sin servicios para el periodo seleccionado.</td>
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

function renderTablaServiciosRecientesCapillas(mes) {
  const tbody = document.getElementById("tablaServiciosRecientesBody");

  if (!tbody) {
    return;
  }

  const filas = obtenerServiciosCapillasMes(mes)
    .slice()
    .sort((a, b) => {
      const numeroA = obtenerNumeroServicioOrden(a);
      const numeroB = obtenerNumeroServicioOrden(b);

      if (numeroA !== numeroB) {
        return numeroA - numeroB;
      }

      const fechaA = convertirFechaServicio(obtenerFechaEfectivaServicio(a));
      const fechaB = convertirFechaServicio(obtenerFechaEfectivaServicio(b));

      return (fechaA?.getTime() || 0) - (fechaB?.getTime() || 0);
    });

  if (filas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Sin servicios de Capillas para el mes seleccionado.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filas
    .map((item) => {
      const numeroServicio = normalizarTexto(
        item.numeroReferencia ||
        item.numeroServicio ||
        item.referenciaContrato ||
        "—"
      );

      const fecha = convertirFechaServicio(obtenerFechaEfectivaServicio(item));
      const fechaTexto = fecha ? formatearFechaCorta(fecha) : "—";

      const finado = normalizarTexto(item.finado || "Sin finado");

      const ubicacion = normalizarTexto(
        item.ubicacionServicio ||
        item.sucursal ||
        "Sin ubicación"
      );

      const tipoServicio = normalizarTipoServicioCapillasDashboard(item.tipoServicio);

      return `
        <tr>
          <td>${escaparHtml(numeroServicio)}</td>
          <td>${escaparHtml(fechaTexto)}</td>
          <td>${escaparHtml(finado)}</td>
          <td>${escaparHtml(ubicacion)}</td>
          <td>${escaparHtml(tipoServicio || "Sin tipo")}</td>
        </tr>
      `;
    })
    .join("");
}

function obtenerNumeroServicioOrden(item) {
  const valor = normalizarTexto(
    item.numeroReferencia ||
    item.numeroServicio ||
    item.referenciaContrato ||
    ""
  );

  const soloNumeros = valor.match(/\d+/);

  if (!soloNumeros) {
    return Number.MAX_SAFE_INTEGER;
  }

  const numero = Number(soloNumeros[0]);

  return Number.isFinite(numero) ? numero : Number.MAX_SAFE_INTEGER;
}

function obtenerServiciosMes(mes) {
  return state.datos.servicios
    .filter((item) => coincidePeriodoServicio(item, mes));
}

function coincidePeriodoServicio(item, mesSeleccionado) {
  const mesBase = obtenerMesBasePeriodo(mesSeleccionado);
  const mesServicio = obtenerMesEfectivoServicio(item);

  return coincideMesServicio(mesServicio, mesSeleccionado)
    && coincideAnioRegistro(
      {
        ...item,
        mes: mesServicio
      },
      mesBase,
      [
        "fechaServicio",
        "fechaCreacionOriginal",
        "fechaFin",
        "fuente"
      ]
    );
}

function obtenerMesEfectivoServicio(item) {
  const mesDirecto = normalizarTexto(item?.mes);

  if (mesDirecto) {
    return mesDirecto;
  }

  const fechaEfectiva = obtenerFechaEfectivaServicio(item);
  const textoFecha = normalizarTexto(fechaEfectiva);

  if (!textoFecha) {
    return "";
  }

  const matchIso = textoFecha.match(/^(\d{4})-(\d{2})/);

  if (matchIso) {
    return `${matchIso[1]}-${matchIso[2]}`;
  }

  const fecha = convertirFechaServicio(textoFecha);

  if (!fecha) {
    return "";
  }

  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");

  return `${anio}-${mes}`;
}

function coincideMesServicio(mesRegistro, mesSeleccionado) {
  return coincideMesValor(mesRegistro, mesSeleccionado);
}

function coincideAnioRegistro(item, mesSeleccionado, campos) {
  const anioSeleccionado = obtenerAnioDesdeClaveMes(obtenerMesBasePeriodo(mesSeleccionado));

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

  
function obtenerCampoServicio(item, campoONombres) {
  if (!item) {
    return "";
  }

  if (Array.isArray(campoONombres)) {
    for (const nombre of campoONombres) {
      if (
        item[nombre] !== undefined &&
        item[nombre] !== null &&
        String(item[nombre]).trim() !== ""
      ) {
        return String(item[nombre]).trim();
      }
    }

    return "";
  }

  if (campoONombres === "ubicacionPrincipal") {
    return obtenerUbicacionServicio(item);
  }

  return normalizarTexto(item[campoONombres]);
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

function conectarNotificaciones() {
  if (notificacionesConectadas) {
    return;
  }

  const wrapper = document.getElementById("notificationsWrapper");
  const boton = document.getElementById("notificationsButton");
  const panel = document.getElementById("notificationsPanel");

  if (!boton || !panel) {
    return;
  }

  boton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const seVaAbrir = panel.classList.contains("hidden");

    panel.classList.toggle("hidden", !seVaAbrir);

    if (seVaAbrir) {
      renderListaNotificaciones();
      marcarAlertasActualesComoVistas();
    }
  });

  document.addEventListener("click", (event) => {
    if (!wrapper || wrapper.contains(event.target)) {
      return;
    }

    panel.classList.add("hidden");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      panel.classList.add("hidden");
    }
  });

  notificacionesConectadas = true;
}

function renderNotificacionesDashboard() {
  const alertas = obtenerAlertasActivasDashboard();
  const idsVistas = leerSetLocalStorage(DASHBOARD_ALERTAS_VISTAS_KEY);
  const alertasNoVistas = alertas.filter((alerta) => {
    return !idsVistas.has(obtenerIdAlerta(alerta));
  });

  actualizarBadgeNotificaciones(alertasNoVistas.length);
  renderListaNotificaciones();
  detectarAlertasNuevasParaPopup(alertas);
}

function generarAlertasAutomaticasDashboard() {
  const mesesPeriodo = obtenerMesesRangoSeleccionado();
  const periodo = mesesPeriodo.length ? mesesPeriodo : [state.mesSeleccionado];
  const etiquetaPeriodo = obtenerEtiquetaPeriodoSeleccionado();

  return [
    ...generarAlertaAsesoresDebajoMeta(periodo, etiquetaPeriodo),
    ...generarAlertaCobranzaAreasDebajoMeta(periodo, etiquetaPeriodo),
    ...generarAlertaEgresosPorPagarElevados(periodo, etiquetaPeriodo),
    ...generarAlertaFlujoNetoBajoONegativo(periodo, etiquetaPeriodo),
    ...generarAlertaCargaBiIncompletaODesactualizada(periodo, etiquetaPeriodo),
    ...generarAlertaRubrosEgresosFueraRango(periodo, etiquetaPeriodo),
    ...generarAlertaNuevosServicios(periodo, etiquetaPeriodo)
  ];
}

function generarAlertaAsesoresDebajoMeta(periodo, etiquetaPeriodo) {
  const asesores = agruparVentasPorAsesor(periodo)
    .filter((fila) => obtenerNombreAsesorAgrupado(fila) !== "Sin asesor")
    .map((fila) => {
      const nombre = obtenerNombreAsesorAgrupado(fila);
      const ventaActual = Number(fila.total || 0);
      const metaMensual = Number(fila.metaMensual || 0);
      const cumplimiento = metaMensual > 0 ? ventaActual / metaMensual : 0;
      const faltante = Math.max(metaMensual - ventaActual, 0);

      return {
        nombre,
        ventaActual,
        metaMensual,
        metaEsperada: metaMensual,
        cumplimiento,
        faltante
      };
    })
    .filter((fila) => {
      return fila.metaMensual > 0 && fila.cumplimiento < 0.9;
    })
    .sort((a, b) => {
      if (a.cumplimiento !== b.cumplimiento) {
        return a.cumplimiento - b.cumplimiento;
      }

      return b.faltante - a.faltante;
    });

  if (!asesores.length) {
    return [];
  }

  const asesoresCriticos = asesores.filter((fila) => fila.cumplimiento < 0.75).length;

  const faltanteTotal = asesores.reduce((total, fila) => {
    return total + Number(fila.faltante || 0);
  }, 0);

  return [
    crearAlertaAutomatica({
      id: `AUTO-ASESORES-DEBAJO-META-${obtenerKeyPeriodoAlerta(periodo)}`,
      titulo: "Asesores debajo de meta mensual",
      modulo: "Ventas",
      prioridad: asesoresCriticos > 0 ? "Crítica" : "Alta",
      tipoAlerta: "Cumplimiento comercial por asesor",
      mensaje: `${formatoNumero(asesores.length)} asesores están debajo del 90% de su meta mensual para ${etiquetaPeriodo}. Faltante acumulado estimado: ${formatoMoneda(faltanteTotal)}.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Dirección Comercial",
      valorActual: asesores.length,
      valorReferencia: faltanteTotal,
      porcentaje: 0,
      detalles: asesores.map((fila) => ({
        asesor: fila.nombre,
        ventaActual: fila.ventaActual,
        metaMensual: fila.metaMensual,
        metaEsperada: fila.metaMensual,
        cumplimiento: fila.cumplimiento,
        faltante: fila.faltante
      }))
    })
  ];
}

function generarAlertaCobranzaAreasDebajoMeta(periodo, etiquetaPeriodo) {
  const filas = calcularAvanceMetasCobranza(periodo)
    .filter((fila) => {
      return Number(fila.meta || 0) > 0
        && Number(fila.porcentajeCumplido || 0) < ALERTA_COBRANZA_AREA_MIN;
    })
    .sort((a, b) => {
      return Number(a.porcentajeCumplido || 0) - Number(b.porcentajeCumplido || 0);
    });

  if (!filas.length) {
    return [];
  }

  const hayCriticas = filas.some((fila) => {
    return Number(fila.porcentajeCumplido || 0) < ALERTA_COBRANZA_AREA_CRITICA;
  });

  const porCumplirTotal = filas.reduce((total, fila) => {
    return total + Number(fila.porCumplir || 0);
  }, 0);

  const detalleTexto = filas
    .map((fila) => {
      return `${fila.area}: ${formatoPorcentaje(fila.porcentajeCumplido)}`;
    })
    .join(", ");

  return [
    crearAlertaAutomatica({
      id: `AUTO-COBRANZA-AREAS-DEBAJO-META-${obtenerKeyPeriodoAlerta(periodo)}`,
      titulo: "Área de cobranza debajo de meta",
      modulo: "Ingresos",
      prioridad: hayCriticas ? "Crítica" : "Alta",
      tipoAlerta: "Cumplimiento de cobranza por área",
      tipoDetalle: "cobranzaArea",
      mensaje: `${formatoNumero(filas.length)} área(s) de cobranza están debajo del 90% de cumplimiento para ${etiquetaPeriodo}. Por cumplir acumulado: ${formatoMoneda(porCumplirTotal)}. Áreas: ${detalleTexto}.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Cobranza / Tesorería",
      valorActual: filas.length,
      valorReferencia: porCumplirTotal,
      porcentaje: 0,
      detalles: filas.map((fila) => ({
        area: fila.area,
        real: fila.real,
        meta: fila.meta,
        porcentajeCumplido: fila.porcentajeCumplido,
        porCumplir: fila.porCumplir
      }))
    })
  ];
}

function generarAlertaEgresosPorPagarElevados(periodo, etiquetaPeriodo) {
  const pagos = obtenerEgresosPeriodo(periodo)
    .filter((item) => Number(item.porPagar || 0) >= ALERTA_EGRESO_POR_PAGAR_MIN)
    .sort((a, b) => Number(b.porPagar || 0) - Number(a.porPagar || 0));

  if (!pagos.length) {
    return [];
  }

  const totalPorPagar = pagos.reduce((total, item) => {
    return total + Number(item.porPagar || 0);
  }, 0);

  const mayorPago = pagos[0];

  return [
    crearAlertaAutomatica({
      id: `AUTO-EGRESOS-POR-PAGAR-ELEVADOS-${obtenerKeyPeriodoAlerta(periodo)}-${pagos.length}-${Math.round(totalPorPagar)}`,
      titulo: "Egresos por pagar elevados",
      modulo: "Egresos",
      prioridad: totalPorPagar >= 500000 ? "Crítica" : "Alta",
      tipoAlerta: "Pagos pendientes",
      tipoDetalle: "egresosPorPagar",
      mensaje: `Hay ${formatoNumero(pagos.length)} pago(s) pendiente(s) de ${formatoMoneda(ALERTA_EGRESO_POR_PAGAR_MIN)} o más para ${etiquetaPeriodo}. Total por pagar: ${formatoMoneda(totalPorPagar)}. Mayor pendiente: ${formatoMoneda(mayorPago.porPagar)}.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Tesorería",
      valorActual: totalPorPagar,
      valorReferencia: ALERTA_EGRESO_POR_PAGAR_MIN,
      porcentaje: 0,
      detalles: pagos.map((item) => ({
        fecha: obtenerFechaEgresoTexto(item),
        beneficiario: normalizarTexto(item.beneficiario) || "Sin beneficiario",
        rubro: normalizarTexto(item.rubro) || "Sin rubro",
        tipoGasto: normalizarTexto(item.tipoGasto) || "Sin tipo de gasto",
        contexto: normalizarTexto(item.contexto || item.concepto) || "",
        pagado: Number(item.pagado || 0),
        porPagar: Number(item.porPagar || 0)
      }))
    })
  ];
}

function generarAlertaFlujoNetoBajoONegativo(periodo, etiquetaPeriodo) {
  const ingresos = sumarIngresos(periodo);
  const egresos = sumarEgresos(periodo);
  const flujoNeto = ingresos - egresos;
  const porcentajeFlujo = ingresos > 0 ? flujoNeto / ingresos : 0;

  if (flujoNeto >= 0 && porcentajeFlujo >= ALERTA_FLUJO_NETO_BAJO_PCT) {
    return [];
  }

  const esNegativo = flujoNeto < 0;

  return [
    crearAlertaAutomatica({
      id: `AUTO-FLUJO-NETO-${esNegativo ? "NEGATIVO" : "BAJO"}-${obtenerKeyPeriodoAlerta(periodo)}-${Math.round(flujoNeto)}`,
      titulo: esNegativo ? "Flujo neto negativo" : "Flujo neto bajo",
      modulo: "Egresos",
      prioridad: esNegativo ? "Crítica" : "Alta",
      tipoAlerta: "Flujo de efectivo",
      tipoDetalle: "flujoNeto",
      mensaje: esNegativo
        ? `Para ${etiquetaPeriodo}, los egresos superan los ingresos por ${formatoMoneda(Math.abs(flujoNeto))}.`
        : `Para ${etiquetaPeriodo}, el flujo neto representa solo ${formatoPorcentaje(porcentajeFlujo)} de los ingresos.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Tesorería / Dirección",
      valorActual: flujoNeto,
      valorReferencia: ingresos,
      porcentaje: porcentajeFlujo,
      detalles: [
        {
          concepto: "Ingresos",
          monto: ingresos,
          porcentajeIngreso: 1
        },
        {
          concepto: "Egresos",
          monto: egresos,
          porcentajeIngreso: ingresos > 0 ? egresos / ingresos : 0
        },
        {
          concepto: "Flujo neto",
          monto: flujoNeto,
          porcentajeIngreso: porcentajeFlujo
        }
      ]
    })
  ];
}

function generarAlertaCargaBiIncompletaODesactualizada(periodo, etiquetaPeriodo) {
  const alertas = [];

  const fuentesPeriodo = [
    {
      nombre: "BI_Ingresos",
      modulo: "Ingresos",
      registros: contarRegistrosIngresos(periodo)
    },
    {
      nombre: "BI_Egresos",
      modulo: "Egresos",
      registros: contarRegistrosEgresos(periodo)
    },
    {
      nombre: "BI_Ventas",
      modulo: "Ventas",
      registros: contarContratos(periodo)
    },
    {
      nombre: "BI_Servicios",
      modulo: "Servicios",
      registros: contarServiciosPorOrigen(periodo, "CAPILLA") + contarServiciosPorOrigen(periodo, "PARQUE")
    }
  ];

  const fuentesSinDatos = fuentesPeriodo.filter((fuente) => {
    return Number(fuente.registros || 0) === 0;
  });

  if (fuentesSinDatos.length > 0) {
    alertas.push(
      crearAlertaAutomatica({
        id: `AUTO-BI-INCOMPLETA-${obtenerKeyPeriodoAlerta(periodo)}-${fuentesSinDatos.map((fuente) => fuente.nombre).join("-")}`,
        titulo: "Carga BI incompleta",
        modulo: "Sistemas",
        prioridad: "Crítica",
        tipoAlerta: "Carga BI incompleta",
        tipoDetalle: "cargaBi",
        mensaje: `Hay fuentes BI sin registros para ${etiquetaPeriodo}: ${fuentesSinDatos.map((fuente) => fuente.nombre).join(", ")}.`,
        mes: obtenerMesTextoAlerta(periodo),
        responsable: "Sistemas",
        valorActual: fuentesSinDatos.length,
        valorReferencia: 0,
        porcentaje: 0,
        detalles: fuentesPeriodo.map((fuente) => ({
          fuente: fuente.nombre,
          modulo: fuente.modulo,
          registros: fuente.registros,
          estatus: fuente.registros > 0 ? "Con datos" : "Sin datos"
        }))
      })
    );
  }

  const horasDesdeActualizacion = obtenerHorasDesdeUltimaActualizacionDashboard();

  if (horasDesdeActualizacion !== null && horasDesdeActualizacion > ALERTA_BI_DESACTUALIZADA_HORAS) {
    alertas.push(
      crearAlertaAutomatica({
        id: `AUTO-BI-DESACTUALIZADA-${Math.floor(horasDesdeActualizacion)}`,
        titulo: "Carga BI desactualizada",
        modulo: "Sistemas",
        prioridad: horasDesdeActualizacion >= 48 ? "Crítica" : "Alta",
        tipoAlerta: "Actualización de datos",
        tipoDetalle: "cargaBi",
        mensaje: `La última actualización exitosa del dashboard fue hace ${formatoNumero(horasDesdeActualizacion)} horas. Revisar actualización automática o conexión con SharePoint.`,
        mes: obtenerMesTextoAlerta(periodo),
        responsable: "Sistemas",
        valorActual: horasDesdeActualizacion,
        valorReferencia: ALERTA_BI_DESACTUALIZADA_HORAS,
        porcentaje: horasDesdeActualizacion / ALERTA_BI_DESACTUALIZADA_HORAS,
        detalles: [
          {
            fuente: "Dashboard",
            modulo: "Sistemas",
            registros: "",
            estatus: `Última actualización: ${dashboardUltimaActualizacionExitosa || "Sin registro"}`
          }
        ]
      })
    );
  }

  return alertas;
}

function generarAlertaRubrosEgresosFueraRango(periodo, etiquetaPeriodo) {
  const mesesPeriodo = normalizarPeriodoDashboard(periodo);

  if (mesesPeriodo.length !== 1) {
    return [];
  }

  const mesActual = mesesPeriodo[0];
  const mesesHistoricos = obtenerMesesAnterioresClave(mesActual, 3);

  if (!mesesHistoricos.length) {
    return [];
  }

  const rubrosActuales = agruparEgresosPorRubroPeriodo([mesActual]);
  const rubrosHistoricos = mesesHistoricos.map((mes) => {
    return agruparEgresosPorRubroPeriodo([mes]);
  });

  const filasFueraRango = Array.from(rubrosActuales.values())
    .map((rubroActual) => {
      const totalHistorico = rubrosHistoricos.reduce((total, mapaMes) => {
        const filaHistorica = mapaMes.get(rubroActual.rubro);
        return total + Number(filaHistorica?.total || 0);
      }, 0);

      const mesesConDato = rubrosHistoricos.filter((mapaMes) => {
        return Number(mapaMes.get(rubroActual.rubro)?.total || 0) > 0;
      }).length;

      const promedioHistorico = mesesConDato > 0
        ? totalHistorico / mesesConDato
        : 0;

      const diferencia = rubroActual.total - promedioHistorico;
      const variacion = promedioHistorico > 0 ? rubroActual.total / promedioHistorico : 0;

      return {
        rubro: rubroActual.rubro,
        tipoGasto: rubroActual.tipoGasto,
        registros: rubroActual.registros,
        totalActual: rubroActual.total,
        promedioHistorico,
        diferencia,
        variacion,
        mesesConDato
      };
    })
    .filter((fila) => {
      return fila.totalActual >= ALERTA_RUBRO_FUERA_RANGO_MONTO_MIN
        && fila.promedioHistorico > 0
        && fila.variacion >= ALERTA_RUBRO_FUERA_RANGO_FACTOR
        && fila.diferencia >= ALERTA_RUBRO_FUERA_RANGO_DIFERENCIA_MIN;
    })
    .sort((a, b) => Number(b.diferencia || 0) - Number(a.diferencia || 0));

  if (!filasFueraRango.length) {
    return [];
  }

  const diferenciaTotal = filasFueraRango.reduce((total, fila) => {
    return total + Number(fila.diferencia || 0);
  }, 0);

  return [
    crearAlertaAutomatica({
      id: `AUTO-EGRESOS-RUBRO-FUERA-RANGO-${mesActual}-${filasFueraRango.length}-${Math.round(diferenciaTotal)}`,
      titulo: "Egresos por rubro fuera de rango",
      modulo: "Egresos",
      prioridad: diferenciaTotal >= 100000 ? "Crítica" : "Alta",
      tipoAlerta: "Variación inusual de egresos",
      tipoDetalle: "rubrosFueraRango",
      mensaje: `${formatoNumero(filasFueraRango.length)} rubro(s) de egresos están fuera de rango para ${etiquetaPeriodo}. Diferencia acumulada contra promedio histórico: ${formatoMoneda(diferenciaTotal)}.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Tesorería",
      valorActual: diferenciaTotal,
      valorReferencia: 0,
      porcentaje: 0,
      detalles: filasFueraRango
    })
  ];
}

function generarAlertaNuevosServicios(periodo, etiquetaPeriodo) {
  const ahora = new Date();
  const limiteMs = ALERTA_NUEVOS_SERVICIOS_HORAS * 60 * 60 * 1000;

  const serviciosNuevos = (state.datos.servicios || [])
    .map((servicio) => {
      const fechaAlta = obtenerFechaAltaServicioAlerta(servicio);

      return {
        servicio,
        fechaAlta
      };
    })
    .filter((item) => {
      if (!item.fechaAlta) {
        return false;
      }

      const diferenciaMs = ahora.getTime() - item.fechaAlta.getTime();

      return diferenciaMs >= 0 && diferenciaMs <= limiteMs;
    })
    .sort((a, b) => b.fechaAlta.getTime() - a.fechaAlta.getTime());

  if (!serviciosNuevos.length) {
    return [];
  }

  const totalCapillas = serviciosNuevos.filter((item) => {
    return obtenerOrigenServicio(item.servicio) === "Capillas";
  }).length;

  const totalParque = serviciosNuevos.filter((item) => {
    return obtenerOrigenServicio(item.servicio) === "Parque";
  }).length;

  const ultimoServicio = serviciosNuevos[0]?.servicio || {};
  const ultimoId = obtenerIdServicioAlerta(ultimoServicio);

  return [
    crearAlertaAutomatica({
      id: `AUTO-NUEVOS-SERVICIOS-${formatearFechaClaveAlerta(ahora)}-${serviciosNuevos.length}-${ultimoId}`,
      titulo: "Nuevos servicios registrados",
      modulo: "Servicios",
      prioridad: "Informativa",
      tipoAlerta: "Nuevos servicios",
      tipoDetalle: "nuevosServicios",
      mensaje: `Se registraron ${formatoNumero(serviciosNuevos.length)} servicio(s) nuevo(s) en las últimas ${ALERTA_NUEVOS_SERVICIOS_HORAS} horas. Capillas: ${formatoNumero(totalCapillas)}. Parque: ${formatoNumero(totalParque)}.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Operaciones",
      valorActual: serviciosNuevos.length,
      valorReferencia: 0,
      porcentaje: 0,
      detalles: serviciosNuevos.slice(0, 30).map((item) => {
        const servicio = item.servicio;

        return {
          numeroServicio: normalizarTexto(
            servicio.numeroReferencia ||
            servicio.numeroServicio ||
            servicio.referenciaContrato ||
            "Sin referencia"
          ),
          fechaAlta: formatearFechaHoraCorta(item.fechaAlta),
          origen: obtenerOrigenServicio(servicio),
          ubicacion: obtenerUbicacionServicio(servicio),
          tipoServicio: normalizarTexto(servicio.tipoServicio) || "Sin tipo",
          finado: normalizarTexto(servicio.finado || servicio.titular) || "Sin finado"
        };
      })
    })
  ];
}

function obtenerEgresosPeriodo(periodo) {
  return (state.datos.egresos || [])
    .filter((item) => {
      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);
      return coincideMesValor(mesEgreso, periodo);
    });
}

function obtenerHorasDesdeUltimaActualizacionDashboard() {
  if (!dashboardUltimaActualizacionExitosa) {
    return null;
  }

  const fecha = new Date(dashboardUltimaActualizacionExitosa);

  if (Number.isNaN(fecha.getTime())) {
    return null;
  }

  const diferenciaMs = Date.now() - fecha.getTime();

  return diferenciaMs / (60 * 60 * 1000);
}

function obtenerMesesAnterioresClave(mesClave, totalMeses) {
  const partes = normalizarTexto(mesClave).split("-");

  if (partes.length < 2) {
    return [];
  }

  const anio = Number(partes[0]);
  const mes = Number(partes[1]);

  if (!Number.isFinite(anio) || !Number.isFinite(mes)) {
    return [];
  }

  const meses = [];

  for (let i = 1; i <= totalMeses; i++) {
    const fecha = new Date(anio, mes - 1 - i, 1);
    const anioMes = fecha.getFullYear();
    const numeroMes = String(fecha.getMonth() + 1).padStart(2, "0");

    meses.push(`${anioMes}-${numeroMes}`);
  }

  return meses;
}

function agruparEgresosPorRubroPeriodo(periodo) {
  const grupos = new Map();

  obtenerEgresosPeriodo(periodo)
    .filter((item) => Number(item.pagado || 0) > 0)
    .forEach((item) => {
      const rubro = normalizarTexto(item.rubro) || "Sin rubro";
      const tipoGasto = normalizarTexto(item.tipoGasto) || "Sin tipo de gasto";
      const llave = `${rubro}||${tipoGasto}`;

      if (!grupos.has(llave)) {
        grupos.set(llave, {
          rubro,
          tipoGasto,
          registros: 0,
          total: 0
        });
      }

      const grupo = grupos.get(llave);

      grupo.registros += 1;
      grupo.total += Number(item.pagado || 0);
    });

  return grupos;
}

function obtenerFechaAltaServicioAlerta(servicio) {
  const valor = obtenerCampoFlexible(servicio, [
    "fechaCreacionOrigen",
    "Fecha_Creacion_Origen",
    "FechaCreacionOrigen",
    "fechaCarga",
    "Fecha_Carga",
    "FechaCarga",
    "fechaActualizacion",
    "Fecha_Actualizacion",
    "FechaActualizacion",
    "fechaCreacionOriginal",
    "Fecha_Creacion_Original",
    "FechaCreacionOriginal"
  ]);

  return convertirFechaServicio(valor);
}

function obtenerIdServicioAlerta(servicio) {
  return normalizarTexto(
    servicio.id ||
    servicio.numeroReferencia ||
    servicio.numeroServicio ||
    servicio.referenciaContrato ||
    servicio.fechaCreacionOrigen ||
    servicio.fechaCarga ||
    servicio.fechaActualizacion ||
    ""
  ).replace(/\s+/g, "-");
}

function formatearFechaClaveAlerta(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  const hora = String(fecha.getHours()).padStart(2, "0");

  return `${anio}${mes}${dia}${hora}`;
}

function calcularMetaEsperadaAsesor(nombreAsesor, periodo) {
  const asesorBuscado = normalizarTexto(nombreAsesor).toUpperCase();

  return normalizarPeriodoDashboard(periodo)
    .reduce((total, mes) => {
      const filaMes = agruparVentasPorAsesor(mes)
        .find((fila) => {
          return normalizarTexto(fila.nombre).toUpperCase() === asesorBuscado;
        });

      if (!filaMes) {
        return total;
      }

      const metaMensual = Number(filaMes.metaMensual || 0);
      const factorAvance = obtenerFactorAvanceMes(mes);

      return total + (metaMensual * factorAvance);
    }, 0);
}

function generarAlertaVentasDebajoMeta(periodo, etiquetaPeriodo) {
  const ventaActual = sumarVentas(periodo);
  const metaEsperada = calcularMetaEsperadaPeriodo(periodo, sumarMetaVentasMensual);

  if (metaEsperada <= 0) {
    return [];
  }

  const cumplimiento = ventaActual / metaEsperada;

  if (cumplimiento >= 0.9) {
    return [];
  }

  const faltante = Math.max(metaEsperada - ventaActual, 0);
  const prioridad = cumplimiento < 0.75 ? "Crítica" : "Alta";

  return [
    crearAlertaAutomatica({
      id: `AUTO-VENTAS-META-${obtenerKeyPeriodoAlerta(periodo)}`,
      titulo: "Ventas debajo de meta mensual",
      modulo: "Ventas",
      prioridad,
      tipoAlerta: "Meta comercial en riesgo",
      mensaje: `Para ${etiquetaPeriodo}, la venta acumulada es ${formatoMoneda(ventaActual)} contra una meta esperada de ${formatoMoneda(metaEsperada)}. Faltante estimado: ${formatoMoneda(faltante)}.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Dirección Comercial",
      valorActual: ventaActual,
      valorReferencia: metaEsperada,
      porcentaje: cumplimiento
    })
  ];
}

function generarAlertaCobranzaDebajoMeta(periodo, etiquetaPeriodo) {
  const cobranzaActual = sumarIngresoRealCobranza(periodo);
  const metaEsperada = calcularMetaEsperadaPeriodo(periodo, sumarMetaCobranzaMensual);

  if (metaEsperada <= 0) {
    return [];
  }

  const cumplimiento = cobranzaActual / metaEsperada;

  if (cumplimiento >= 0.9) {
    return [];
  }

  const faltante = Math.max(metaEsperada - cobranzaActual, 0);
  const prioridad = cumplimiento < 0.75 ? "Crítica" : "Alta";

  return [
    crearAlertaAutomatica({
      id: `AUTO-COBRANZA-META-${obtenerKeyPeriodoAlerta(periodo)}`,
      titulo: "Cobranza debajo de meta mensual",
      modulo: "Ingresos",
      prioridad,
      tipoAlerta: "Meta de cobranza en riesgo",
      mensaje: `Para ${etiquetaPeriodo}, la cobranza considerada para meta es ${formatoMoneda(cobranzaActual)} contra una meta esperada de ${formatoMoneda(metaEsperada)}. Faltante estimado: ${formatoMoneda(faltante)}.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Cobranza / Tesorería",
      valorActual: cobranzaActual,
      valorReferencia: metaEsperada,
      porcentaje: cumplimiento
    })
  ];
}

function generarAlertaFlujoNetoNegativo(periodo, etiquetaPeriodo) {
  const ingresos = sumarIngresos(periodo);
  const egresos = sumarEgresos(periodo);
  const flujoNeto = ingresos - egresos;

  if (flujoNeto >= 0) {
    return [];
  }

  return [
    crearAlertaAutomatica({
      id: `AUTO-FLUJO-NEGATIVO-${obtenerKeyPeriodoAlerta(periodo)}`,
      titulo: "Flujo neto negativo",
      modulo: "Egresos",
      prioridad: "Crítica",
      tipoAlerta: "Flujo de efectivo",
      mensaje: `Para ${etiquetaPeriodo}, los egresos superan los ingresos por ${formatoMoneda(Math.abs(flujoNeto))}. Ingresos: ${formatoMoneda(ingresos)}. Egresos: ${formatoMoneda(egresos)}.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Tesorería / Dirección",
      valorActual: flujoNeto,
      valorReferencia: 0,
      porcentaje: 0
    })
  ];
}

function generarAlertaServiciosUiSinPrecio(periodo, etiquetaPeriodo) {
  const serviciosSinPrecio = (state.datos.servicios || [])
    .filter((servicio) => coincidePeriodoServicio(servicio, periodo))
    .filter((servicio) => obtenerOrigenServicio(servicio) === "Capillas")
    .filter((servicio) => esServicioUsoInmediatoBiServicios(servicio))
    .filter((servicio) => obtenerMontoServicioUiCapillas(servicio) <= 0);

  if (!serviciosSinPrecio.length) {
    return [];
  }

  const referencias = serviciosSinPrecio
    .slice(0, 8)
    .map((servicio) => {
      return normalizarTexto(
        servicio.numeroReferencia ||
        servicio.numeroServicio ||
        servicio.referenciaContrato ||
        "Sin referencia"
      );
    })
    .join(", ");

  const extra = serviciosSinPrecio.length > 8
    ? ` y ${serviciosSinPrecio.length - 8} más`
    : "";

  return [
    crearAlertaAutomatica({
      id: `AUTO-SERVICIOS-UI-SIN-PRECIO-${obtenerKeyPeriodoAlerta(periodo)}`,
      titulo: "Servicios UI sin Precio_Venta",
      modulo: "Servicios",
      prioridad: "Alta",
      tipoAlerta: "Datos incompletos",
      mensaje: `Hay ${formatoNumero(serviciosSinPrecio.length)} servicios de Uso Inmediato en Capillas sin Precio_Venta para ${etiquetaPeriodo}. Referencias: ${referencias}${extra}.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Sistemas / Operaciones",
      valorActual: serviciosSinPrecio.length,
      valorReferencia: 0,
      porcentaje: 0
    })
  ];
}

function generarAlertaDatosVaciosDashboard(periodo, etiquetaPeriodo) {
  const fuentesVacias = [
    {
      nombre: "BI_Ingresos",
      total: (state.datos.ingresos || []).length
    },
    {
      nombre: "BI_Egresos",
      total: (state.datos.egresos || []).length
    },
    {
      nombre: "BI_Ventas",
      total: (state.datos.ventas || []).length
    },
    {
      nombre: "BI_Servicios",
      total: (state.datos.servicios || []).length
    }
  ].filter((fuente) => fuente.total === 0);

  if (!fuentesVacias.length) {
    return [];
  }

  return [
    crearAlertaAutomatica({
      id: `AUTO-DATOS-VACIOS-${fuentesVacias.map((fuente) => fuente.nombre).join("-")}`,
      titulo: "Fuente BI sin datos cargados",
      modulo: "Sistemas",
      prioridad: "Crítica",
      tipoAlerta: "Carga BI incompleta",
      mensaje: `Las siguientes fuentes no tienen registros cargados: ${fuentesVacias.map((fuente) => fuente.nombre).join(", ")}. Revisar conexión o flujo de actualización.`,
      mes: obtenerMesTextoAlerta(periodo),
      responsable: "Sistemas",
      valorActual: fuentesVacias.length,
      valorReferencia: 0,
      porcentaje: 0
    })
  ];
}

function crearAlertaAutomatica(configuracion) {
  return {
    id: configuracion.id,
    titulo: configuracion.titulo,
    modulo: configuracion.modulo,
    prioridad: configuracion.prioridad,
    tipoAlerta: configuracion.tipoAlerta,
    tipoDetalle: configuracion.tipoDetalle || "",
    mensaje: configuracion.mensaje,
    mes: configuracion.mes,
    fechaDeteccion: new Date().toISOString(),
    responsable: configuracion.responsable || "Sistemas",
    estatus: "Nueva",
    valorActual: Number(configuracion.valorActual || 0),
    valorReferencia: Number(configuracion.valorReferencia || 0),
    porcentaje: Number(configuracion.porcentaje || 0),
    fuente: "Regla automática local",
    detalles: configuracion.detalles || []
  };
}

function calcularMetaEsperadaPeriodo(periodo, obtenerMetaMensual) {
  return normalizarPeriodoDashboard(periodo)
    .reduce((total, mes) => {
      const metaMensual = Number(obtenerMetaMensual(mes) || 0);
      const factorAvance = obtenerFactorAvanceMes(mes);

      return total + (metaMensual * factorAvance);
    }, 0);
}

function obtenerFactorAvanceMes(mes) {
  const partes = normalizarTexto(mes).split("-");

  if (partes.length < 2) {
    return 1;
  }

  const anio = Number(partes[0]);
  const numeroMes = Number(partes[1]);

  if (!Number.isFinite(anio) || !Number.isFinite(numeroMes)) {
    return 1;
  }

  const hoy = new Date();
  const inicioMes = new Date(anio, numeroMes - 1, 1);
  const finMes = new Date(anio, numeroMes, 0);

  if (hoy < inicioMes) {
    return 0;
  }

  if (hoy > finMes) {
    return 1;
  }

  return hoy.getDate() / finMes.getDate();
}

function obtenerKeyPeriodoAlerta(periodo) {
  return normalizarPeriodoDashboard(periodo).join("_") || state.mesSeleccionado;
}

function obtenerMesTextoAlerta(periodo) {
  const meses = normalizarPeriodoDashboard(periodo);

  if (meses.length <= 1) {
    return meses[0] || state.mesSeleccionado;
  }

  return `${meses[0]} a ${meses[meses.length - 1]}`;
}

function obtenerAlertasActivasDashboard() {
  const alertasSharePoint = state.datos.alertas || [];
  const alertasAutomaticas = generarAlertasAutomaticasDashboard();

  return [
    ...alertasSharePoint,
    ...alertasAutomaticas
  ]
    .filter((alerta) => {
      const estatus = normalizarClaveComparacion(alerta.estatus);

      return ![
        "RESUELTA",
        "RESUELTO",
        "DESCARTADA",
        "DESCARTADO",
        "CERRADA",
        "CERRADO"
      ].includes(estatus);
    })
    .sort((a, b) => {
      const prioridadA = obtenerOrdenPrioridadAlerta(a.prioridad);
      const prioridadB = obtenerOrdenPrioridadAlerta(b.prioridad);

      if (prioridadA !== prioridadB) {
        return prioridadA - prioridadB;
      }

      return obtenerTimestampAlerta(b) - obtenerTimestampAlerta(a);
    });
}

function actualizarBadgeNotificaciones(total) {
  const badge = document.getElementById("notificationsBadge");

  if (!badge) {
    return;
  }

  const cantidad = Number(total || 0);

  badge.textContent = cantidad > 99 ? "99+" : String(cantidad);
  badge.classList.toggle("hidden", cantidad <= 0);
}

function renderListaNotificaciones() {
  const contenedor = document.getElementById("notificationsList");

  if (!contenedor) {
    return;
  }

  const alertas = obtenerAlertasActivasDashboard();
  const idsVistas = leerSetLocalStorage(DASHBOARD_ALERTAS_VISTAS_KEY);

  if (!alertas.length) {
    contenedor.innerHTML = `
      <div class="notifications-empty">
        Sin notificaciones activas.
      </div>
    `;
    return;
  }

  contenedor.innerHTML = alertas
    .map((alerta) => renderNotificacionItem(alerta, idsVistas))
    .join("");

  conectarClickDetalleNotificaciones(alertas);
}

function renderNotificacionItem(alerta, idsVistas) {
  const idAlerta = obtenerIdAlerta(alerta);
  const esNueva = !idsVistas.has(idAlerta);
  const prioridad = normalizarTexto(alerta.prioridad) || "Informativa";
  const clasePrioridad = obtenerClasePrioridadAlerta(prioridad);
  const titulo = normalizarTexto(alerta.titulo) || normalizarTexto(alerta.tipoAlerta) || "Notificación";
  const modulo = normalizarTexto(alerta.modulo) || "Dashboard";
  const mensaje = normalizarTexto(alerta.mensaje) || "Sin detalle.";
  const fecha = formatearFechaAlerta(alerta);
  const responsable = normalizarTexto(alerta.responsable);

  return `
    <article
      class="notification-item ${esNueva ? "is-unread" : ""}"
      data-alerta-id="${escaparAtributo(idAlerta)}"
    >
      <div class="notification-item-top">
        <div class="notification-title">
          ${escaparHtml(titulo)}
        </div>

        <span class="notification-priority ${clasePrioridad}">
          ${escaparHtml(prioridad)}
        </span>
      </div>

      <p class="notification-message">
        ${escaparHtml(mensaje)}
      </p>

      <div class="notification-meta">
        ${esNueva ? `<span class="notification-new-label">Nueva</span>` : ""}
        <span>${escaparHtml(modulo)}</span>
        ${fecha ? `<span>· ${escaparHtml(fecha)}</span>` : ""}
        ${responsable ? `<span>· ${escaparHtml(responsable)}</span>` : ""}
      </div>
    </article>
  `;
}

function marcarAlertasActualesComoVistas() {
  const alertas = obtenerAlertasActivasDashboard();
  const idsVistas = leerSetLocalStorage(DASHBOARD_ALERTAS_VISTAS_KEY);

  alertas.forEach((alerta) => {
    idsVistas.add(obtenerIdAlerta(alerta));
  });

  guardarSetLocalStorage(DASHBOARD_ALERTAS_VISTAS_KEY, idsVistas);
  actualizarBadgeNotificaciones(0);
}

function detectarAlertasNuevasParaPopup(alertas) {
  const idsActuales = new Set(
    (alertas || []).map((alerta) => obtenerIdAlerta(alerta))
  );

  const idsConocidas = leerSetLocalStorage(DASHBOARD_ALERTAS_CONOCIDAS_KEY);

  if (!alertasInicializadas) {
    guardarSetLocalStorage(DASHBOARD_ALERTAS_CONOCIDAS_KEY, idsActuales);
    alertasInicializadas = true;
    return;
  }

  const alertasNuevas = (alertas || []).filter((alerta) => {
    return !idsConocidas.has(obtenerIdAlerta(alerta));
  });

  if (!alertasNuevas.length) {
    return;
  }

  mostrarPopupAlertasNuevas(alertasNuevas);

  alertasNuevas.forEach((alerta) => {
    idsConocidas.add(obtenerIdAlerta(alerta));
  });

  guardarSetLocalStorage(DASHBOARD_ALERTAS_CONOCIDAS_KEY, idsConocidas);
}

function mostrarPopupAlertasNuevas(alertasNuevas) {
  const contenedor = document.getElementById("notificationToastContainer");

  if (!contenedor) {
    return;
  }

  alertasNuevas.slice(0, 3).forEach((alerta) => {
    const toast = document.createElement("article");
    toast.className = "notification-toast";

    toast.style.cursor = "pointer";
    toast.addEventListener("click", (event) => {
      if (event.target.closest(".notification-toast-close")) {
        return;
      }

      abrirDetalleNotificacion(alerta);
    });

    const titulo = normalizarTexto(alerta.titulo) || normalizarTexto(alerta.tipoAlerta) || "Nueva notificación";
    const prioridad = normalizarTexto(alerta.prioridad) || "Informativa";
    const modulo = normalizarTexto(alerta.modulo) || "Dashboard";
    const mensaje = normalizarTexto(alerta.mensaje) || "Se generó una nueva alerta en el dashboard.";

    toast.innerHTML = `
      <div class="notification-toast-header">
        <div>
          <div class="notification-toast-title">
            ${escaparHtml(titulo)}
          </div>
          <div class="notification-meta">
            <span>${escaparHtml(modulo)}</span>
            <span>· ${escaparHtml(prioridad)}</span>
          </div>
        </div>

        <button class="notification-toast-close" type="button" aria-label="Cerrar notificación">
          ×
        </button>
      </div>

      <p class="notification-toast-message">
        ${escaparHtml(mensaje)}
      </p>
    `;

    const cerrar = () => {
      toast.remove();
    };

    const botonCerrar = toast.querySelector(".notification-toast-close");

    if (botonCerrar) {
      botonCerrar.addEventListener("click", cerrar);
    }

    contenedor.appendChild(toast);

    setTimeout(cerrar, 12000);
  });
}

function obtenerIdAlerta(alerta) {
  const idDirecto = normalizarTexto(alerta.id);

  if (idDirecto) {
    return idDirecto;
  }

  return normalizarTexto([
    alerta.titulo,
    alerta.modulo,
    alerta.tipoAlerta,
    alerta.mensaje,
    alerta.fechaDeteccion,
    alerta.mes
  ].join("|"));
}

function obtenerOrdenPrioridadAlerta(prioridad) {
  const texto = normalizarClaveComparacion(prioridad);

  if (texto.includes("CRITICA") || texto.includes("CRITICAL")) {
    return 1;
  }

  if (texto.includes("ALTA")) {
    return 2;
  }

  if (texto.includes("MEDIA")) {
    return 3;
  }

  if (texto.includes("INFORMATIVA") || texto.includes("INFO")) {
    return 4;
  }

  return 5;
}

function obtenerClasePrioridadAlerta(prioridad) {
  const texto = normalizarClaveComparacion(prioridad);

  if (texto.includes("CRITICA") || texto.includes("CRITICAL")) {
    return "prioridad-critica";
  }

  if (texto.includes("ALTA")) {
    return "prioridad-alta";
  }

  if (texto.includes("MEDIA")) {
    return "prioridad-media";
  }

  return "prioridad-informativa";
}

function obtenerTimestampAlerta(alerta) {
  const fecha = convertirFechaServicio(
    alerta.fechaDeteccion ||
    alerta.fecha ||
    alerta.created ||
    ""
  );

  return fecha ? fecha.getTime() : 0;
}

function formatearFechaAlerta(alerta) {
  const fecha = convertirFechaServicio(
    alerta.fechaDeteccion ||
    alerta.fecha ||
    alerta.created ||
    ""
  );

  if (!fecha) {
    return "";
  }

  return formatearFechaHoraCorta(fecha);
}

function leerSetLocalStorage(key) {
  try {
    const texto = localStorage.getItem(key);

    if (!texto) {
      return new Set();
    }

    const valores = JSON.parse(texto);

    if (!Array.isArray(valores)) {
      return new Set();
    }

    return new Set(valores.map((valor) => String(valor)));
  } catch (error) {
    console.warn(`No se pudo leer ${key}:`, error);
    return new Set();
  }
}

function guardarSetLocalStorage(key, setValores) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(Array.from(setValores || []).map((valor) => String(valor)))
    );
  } catch (error) {
    console.warn(`No se pudo guardar ${key}:`, error);
  }
}

function conectarClickDetalleNotificaciones(alertas) {
  const mapaAlertas = new Map(
    (alertas || []).map((alerta) => [obtenerIdAlerta(alerta), alerta])
  );

  document.querySelectorAll(".notification-item[data-alerta-id]").forEach((item) => {
    item.addEventListener("click", () => {
      const idAlerta = item.dataset.alertaId;
      const alerta = mapaAlertas.get(idAlerta);

      if (!alerta) {
        return;
      }

      abrirDetalleNotificacion(alerta);
    });
  });
}

function abrirDetalleNotificacion(alerta) {
  const modal = document.getElementById("notificationDetailModal");
  const title = document.getElementById("notificationDetailTitle");
  const subtitle = document.getElementById("notificationDetailSubtitle");
  const priority = document.getElementById("notificationDetailPriority");
  const body = document.getElementById("notificationDetailBody");

  if (!modal || !body) {
    return;
  }

  conectarModalDetalleNotificacion();

  const titulo = normalizarTexto(alerta.titulo) || normalizarTexto(alerta.tipoAlerta) || "Detalle de notificación";
  const modulo = normalizarTexto(alerta.modulo) || "Dashboard";
  const prioridad = normalizarTexto(alerta.prioridad) || "Informativa";
  const fecha = formatearFechaAlerta(alerta);
  const responsable = normalizarTexto(alerta.responsable) || "Sin responsable";

  if (title) {
    title.textContent = titulo;
  }

  if (subtitle) {
    subtitle.textContent = [
      modulo,
      fecha,
      responsable
    ].filter(Boolean).join(" · ");
  }

  if (priority) {
    priority.textContent = prioridad;
    priority.className = `notification-detail-priority ${obtenerClasePrioridadAlerta(prioridad)}`;
  }

  body.innerHTML = renderDetalleNotificacionBody(alerta);

  modal.classList.remove("hidden");
}

function renderDetalleNotificacionBody(alerta) {
  const tipoAlerta = normalizarClaveComparacion(alerta.tipoAlerta);
  const titulo = normalizarClaveComparacion(alerta.titulo);

  if (
    tipoAlerta.includes("CUMPLIMIENTO COMERCIAL") ||
    titulo.includes("ASESORES DEBAJO DE META")
  ) {
    return renderDetalleAlertaAsesores(alerta);
  }

  if (Array.isArray(alerta.detalles) && alerta.detalles.length > 0) {
    return renderDetalleAlertaConTabla(alerta);
  }

  return renderDetalleAlertaGenerica(alerta);
}

function renderDetalleAlertaAsesores(alerta) {
  const detalles = Array.isArray(alerta.detalles) ? alerta.detalles : [];
  const faltanteTotal = detalles.reduce((total, fila) => {
    return total + Number(fila.faltante || 0);
  }, 0);

  const ventaTotal = detalles.reduce((total, fila) => {
    return total + Number(fila.ventaActual || 0);
  }, 0);

  const metaTotal = detalles.reduce((total, fila) => {
    return total + Number(fila.metaMensual || fila.metaEsperada || 0);
  }, 0);

  const cumplimientoPromedio = metaTotal > 0 ? ventaTotal / metaTotal : 0;

  if (!detalles.length) {
    return renderDetalleAlertaGenerica(alerta);
  }

  const filasHtml = detalles
    .slice()
    .sort((a, b) => {
      if (Number(a.cumplimiento || 0) !== Number(b.cumplimiento || 0)) {
        return Number(a.cumplimiento || 0) - Number(b.cumplimiento || 0);
      }

      return Number(b.faltante || 0) - Number(a.faltante || 0);
    })
    .map((fila) => {
      const cumplimiento = Number(fila.cumplimiento || 0);
      const porcentajeBarra = Math.min(Math.max(cumplimiento * 100, 0), 100);
      const claseBarra = cumplimiento < 0.75
        ? "is-critical"
        : cumplimiento >= 0.9
          ? "is-good"
          : "";

      return `
        <tr>
          <td>${escaparHtml(fila.asesor || "Sin asesor")}</td>
          <td class="numeric">${formatoMoneda(fila.ventaActual)}</td>
          <td class="numeric">${formatoMoneda(fila.metaMensual || fila.metaEsperada)}</td>
          <td class="numeric">${formatoMoneda(fila.faltante)}</td>
          <td>
            <div class="notification-detail-progress">
              <strong>${formatoPorcentaje(cumplimiento)}</strong>
              <span class="notification-detail-progress-track">
                <span
                  class="notification-detail-progress-bar ${claseBarra}"
                  style="width: ${porcentajeBarra}%;"
                ></span>
              </span>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="notification-detail-summary">
      <div class="notification-detail-kpi">
        <span>Asesores en alerta</span>
        <strong>${formatoNumero(detalles.length)}</strong>
      </div>

      <div class="notification-detail-kpi">
        <span>Venta actual</span>
        <strong>${formatoMoneda(ventaTotal)}</strong>
      </div>

      <div class="notification-detail-kpi">
        <span>Meta mensual</span>
        <strong>${formatoMoneda(metaTotal)}</strong>
      </div>

      <div class="notification-detail-kpi">
        <span>Cumplimiento</span>
        <strong>${formatoPorcentaje(cumplimientoPromedio)}</strong>
      </div>
    </div>

    <p class="notification-detail-message">
      ${escaparHtml(alerta.mensaje || "")}
      Faltante total estimado: ${escaparHtml(formatoMoneda(faltanteTotal))}.
    </p>

    <div class="notification-detail-table-scroll">
      <table class="notification-detail-table">
        <thead>
          <tr>
            <th>Asesor</th>
            <th class="numeric">Venta actual</th>
            <th class="numeric">Meta mensual</th>
            <th class="numeric">Faltante</th>
            <th>Cumplimiento</th>
          </tr>
        </thead>
        <tbody>
          ${filasHtml}
        </tbody>
      </table>
    </div>
  `;
}

function renderDetalleAlertaConTabla(alerta) {
  const tipoDetalle = normalizarTexto(alerta.tipoDetalle);
  const detalles = Array.isArray(alerta.detalles) ? alerta.detalles : [];

  const configuraciones = {
    cobranzaArea: {
      columnas: [
        ["area", "Área", "texto"],
        ["real", "Real cobrado", "moneda"],
        ["meta", "Meta mensual", "moneda"],
        ["porCumplir", "Por cumplir", "moneda"],
        ["porcentajeCumplido", "% cumplido", "porcentaje"]
      ]
    },
    egresosPorPagar: {
      columnas: [
        ["fecha", "Fecha", "texto"],
        ["beneficiario", "Beneficiario", "texto"],
        ["rubro", "Rubro", "texto"],
        ["tipoGasto", "Tipo gasto", "texto"],
        ["pagado", "Pagado", "moneda"],
        ["porPagar", "Por pagar", "moneda"]
      ]
    },
    flujoNeto: {
      columnas: [
        ["concepto", "Concepto", "texto"],
        ["monto", "Monto", "moneda"],
        ["porcentajeIngreso", "% ingreso", "porcentaje"]
      ]
    },
    cargaBi: {
      columnas: [
        ["fuente", "Fuente", "texto"],
        ["modulo", "Módulo", "texto"],
        ["registros", "Registros", "numero"],
        ["estatus", "Estatus", "texto"]
      ]
    },
    rubrosFueraRango: {
      columnas: [
        ["rubro", "Rubro", "texto"],
        ["tipoGasto", "Tipo gasto", "texto"],
        ["registros", "Registros", "numero"],
        ["totalActual", "Actual", "moneda"],
        ["promedioHistorico", "Promedio histórico", "moneda"],
        ["diferencia", "Diferencia", "moneda"],
        ["variacion", "Variación", "multiplo"]
      ]
    },
    nuevosServicios: {
      columnas: [
        ["numeroServicio", "No. servicio", "texto"],
        ["fechaAlta", "Fecha alta", "texto"],
        ["origen", "Origen", "texto"],
        ["ubicacion", "Ubicación", "texto"],
        ["tipoServicio", "Tipo servicio", "texto"],
        ["finado", "Finado", "texto"]
      ]
    }
  };

  const configuracion = configuraciones[tipoDetalle];

  if (!configuracion) {
    return renderDetalleAlertaGenerica(alerta);
  }

  const columnas = configuracion.columnas;

  const valorActual = Number(alerta.valorActual || 0);
  const valorReferencia = Number(alerta.valorReferencia || 0);
  const porcentaje = Number(alerta.porcentaje || 0);

  const thead = columnas
    .map(([, etiqueta, tipo]) => {
      const clase = ["moneda", "numero", "porcentaje", "multiplo"].includes(tipo)
        ? "numeric"
        : "";

      return `<th class="${clase}">${escaparHtml(etiqueta)}</th>`;
    })
    .join("");

  const filas = detalles
    .map((fila) => {
      const celdas = columnas
        .map(([campo, , tipo]) => {
          const clase = ["moneda", "numero", "porcentaje", "multiplo"].includes(tipo)
            ? "numeric"
            : "";

          return `<td class="${clase}">${formatearValorDetalleAlerta(fila[campo], tipo)}</td>`;
        })
        .join("");

      return `<tr>${celdas}</tr>`;
    })
    .join("");

  return `
    <div class="notification-detail-summary">
      <div class="notification-detail-kpi">
        <span>Registros</span>
        <strong>${formatoNumero(detalles.length)}</strong>
      </div>

      <div class="notification-detail-kpi">
        <span>Valor actual</span>
        <strong>${formatearKpiAlerta(alerta, valorActual, "actual")}</strong>
      </div>

      <div class="notification-detail-kpi">
        <span>Referencia</span>
        <strong>${formatearKpiAlerta(alerta, valorReferencia, "referencia")}</strong>
      </div>

      <div class="notification-detail-kpi">
        <span>Porcentaje</span>
        <strong>${porcentaje ? formatoPorcentaje(porcentaje) : "—"}</strong>
      </div>
    </div>

    <p class="notification-detail-message">
      ${escaparHtml(alerta.mensaje || "Sin detalle disponible.")}
    </p>

    <div class="notification-detail-table-scroll">
      <table class="notification-detail-table">
        <thead>
          <tr>${thead}</tr>
        </thead>
        <tbody>
          ${filas}
        </tbody>
      </table>
    </div>
  `;
}

function formatearValorDetalleAlerta(valor, tipo) {
  if (tipo === "moneda") {
    return formatoMoneda(valor);
  }

  if (tipo === "numero") {
    return formatoNumero(valor);
  }

  if (tipo === "porcentaje") {
    return formatoPorcentaje(valor);
  }

  if (tipo === "multiplo") {
    return `${Number(valor || 0).toFixed(2)}x`;
  }

  return escaparHtml(valor || "—");
}

function formatearKpiAlerta(alerta, valor, tipo) {
  const tipoDetalle = normalizarTexto(alerta.tipoDetalle);

  if (tipoDetalle === "cobranzaArea" && tipo === "actual") {
    return formatoNumero(valor);
  }

  if (tipoDetalle === "cargaBi") {
    return formatoNumero(valor);
  }

  if (tipoDetalle === "nuevosServicios") {
    return formatoNumero(valor);
  }

  return formatoMoneda(valor);
}

function renderDetalleAlertaGenerica(alerta) {
  const valorActual = Number(alerta.valorActual || 0);
  const valorReferencia = Number(alerta.valorReferencia || 0);
  const porcentaje = Number(alerta.porcentaje || 0);

  return `
    <div class="notification-detail-summary">
      <div class="notification-detail-kpi">
        <span>Módulo</span>
        <strong>${escaparHtml(alerta.modulo || "Dashboard")}</strong>
      </div>

      <div class="notification-detail-kpi">
        <span>Valor actual</span>
        <strong>${formatoMoneda(valorActual)}</strong>
      </div>

      <div class="notification-detail-kpi">
        <span>Referencia</span>
        <strong>${formatoMoneda(valorReferencia)}</strong>
      </div>

      <div class="notification-detail-kpi">
        <span>Porcentaje</span>
        <strong>${porcentaje ? formatoPorcentaje(porcentaje) : "—"}</strong>
      </div>
    </div>

    <p class="notification-detail-message">
      ${escaparHtml(alerta.mensaje || "Sin detalle disponible.")}
    </p>
  `;
}

let modalDetalleNotificacionConectado = false;

function conectarModalDetalleNotificacion() {
  if (modalDetalleNotificacionConectado) {
    return;
  }

  const modal = document.getElementById("notificationDetailModal");
  const closeButton = document.getElementById("notificationDetailClose");

  if (closeButton) {
    closeButton.addEventListener("click", cerrarDetalleNotificacion);
  }

  if (modal) {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) {
        cerrarDetalleNotificacion();
      }
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      cerrarDetalleNotificacion();
    }
  });

  modalDetalleNotificacionConectado = true;
}

function cerrarDetalleNotificacion() {
  const modal = document.getElementById("notificationDetailModal");

  if (!modal) {
    return;
  }

  modal.classList.add("hidden");
}

window.renderDashboard = renderDashboard;
window.actualizarDatosDashboard = actualizarDatosDashboard;
