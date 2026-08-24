(() => {
  "use strict";

  const CACHE_KEY = "dashboardDireccionUltimosDatos";

  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn("No fue posible limpiar la cache anterior del Dashboard.", error);
  }

  /*
    auth.js registra su listener DOMContentLoaded antes que app.js. Sin esta
    barrera, auth.js puede decidir "completa" antes de que app.js termine de
    recuperar IndexedDB, aunque la cache exista. Envolvemos la inicializacion
    para que dashboardCacheReady permanezca pendiente hasta que la lectura real
    de cache haya terminado.
  */
  if (typeof window.inicializarDashboard === "function") {
    const inicializarDashboardBase = window.inicializarDashboard;
    let resolverDashboardCacheReady = null;

    const dashboardCacheReadyReal = new Promise((resolve) => {
      resolverDashboardCacheReady = resolve;
    });

    window.dashboardCacheReady = dashboardCacheReadyReal;

    window.inicializarDashboard = async function (...args) {
      try {
        const result = await inicializarDashboardBase(...args);
        resolverDashboardCacheReady(Boolean(window.cacheCargadoDashboard));
        return result;
      } catch (error) {
        resolverDashboardCacheReady(false);
        throw error;
      }
    };
  }

  const ROLE_ACCESS = Object.freeze({
    Direccion: {
      label: "Dirección",
      ingresos: true,
      egresos: true,
      ventas: true,
      servicios: true,
      marketing: true,
      marketingMedios: true,
      marketingRedes: true,
      metasCobranza: true,
      metasVentas: true,
      alertas: true,
      parquePropiedades: true
    },
    FinanzasCobranza: {
      label: "Finanzas y Cobranza",
      ingresos: true,
      egresos: true,
      ventas: false,
      servicios: false,
      marketing: false,
      marketingMedios: false,
      marketingRedes: false,
      metasCobranza: true,
      metasVentas: false,
      alertas: false,
      parquePropiedades: false
    },
    Comercial: {
      label: "Comercial",
      ingresos: false,
      egresos: false,
      ventas: true,
      servicios: true,
      marketing: true,
      marketingMedios: true,
      marketingRedes: true,
      metasCobranza: false,
      metasVentas: true,
      alertas: false,
      parquePropiedades: false
    },
    Marketing: {
      label: "Marketing",
      ingresos: false,
      egresos: false,
      ventas: true,
      servicios: false,
      marketing: true,
      marketingMedios: true,
      marketingRedes: true,
      metasCobranza: false,
      metasVentas: true,
      alertas: false,
      parquePropiedades: false
    },
    Operaciones: {
      label: "Operaciones",
      ingresos: false,
      egresos: false,
      ventas: true,
      servicios: true,
      marketing: false,
      marketingMedios: false,
      marketingRedes: false,
      metasCobranza: false,
      metasVentas: false,
      alertas: false,
      parquePropiedades: false
    }
  });

  const ROLE_PRIORITY = ["Direccion", "FinanzasCobranza", "Comercial", "Marketing", "Operaciones"];

  window.dashboardAccess = {
    role: null,
    label: "Sin rol",
    permissions: {},
    account: null,
    claims: null,
    configured: false,
    graphError: null
  };

  function normalizarRoles(claims) {
    const rawRoles = claims && claims.roles;
    if (Array.isArray(rawRoles)) return rawRoles.map(String);
    if (rawRoles) return [String(rawRoles)];
    return [];
  }

  function obtenerRolAutorizado(claims) {
    const roles = normalizarRoles(claims);
    return ROLE_PRIORITY.find((role) => roles.includes(role)) || null;
  }

  function ocultarElemento(element, shouldHide) {
    if (!element) return;
    element.classList.toggle("dashboard-role-hidden", Boolean(shouldHide));
  }

  function ocultarSelector(selector, shouldHide) {
    document.querySelectorAll(selector).forEach((element) => ocultarElemento(element, shouldHide));
  }

  function ocultarContenedorDeId(id, shouldHide, closestSelector = "article") {
    const element = document.getElementById(id);
    ocultarElemento(element ? element.closest(closestSelector) : null, shouldHide);
  }

  function asegurarPanelAcceso() {
    let panel = document.getElementById("dashboardRoleAccessPanel");
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "dashboardRoleAccessPanel";
    panel.className = "dashboard-role-access-panel dashboard-role-hidden";
    panel.setAttribute("role", "status");

    const dashboardPage = document.getElementById("dashboardPage");
    const header = dashboardPage ? dashboardPage.querySelector(".header") : null;
    if (dashboardPage && header) header.insertAdjacentElement("afterend", panel);
    else if (dashboardPage) dashboardPage.prepend(panel);
    return panel;
  }

  function mostrarPanelAcceso(tipo, titulo, mensaje) {
    const panel = asegurarPanelAcceso();
    panel.className = `dashboard-role-access-panel dashboard-role-access-${tipo}`;
    panel.innerHTML = `<strong>${titulo}</strong><span>${mensaje}</span>`;
  }

  function ocultarPanelAcceso() {
    const panel = asegurarPanelAcceso();
    panel.className = "dashboard-role-access-panel dashboard-role-hidden";
    panel.textContent = "";
  }

  function aplicarRestriccionesVisuales() {
    const access = window.dashboardAccess.permissions;
    const hasRole = Boolean(window.dashboardAccess.role);
    const canFinance = Boolean(access.ingresos || access.egresos);
    const canServices = Boolean(access.servicios);

    document.body.classList.toggle("dashboard-role-limited", hasRole && window.dashboardAccess.role !== "Direccion");
    document.body.classList.toggle("dashboard-role-services-layout", hasRole && canServices && !canFinance);

    ocultarSelector('[data-page="ingresos"]', !access.ingresos);
    ocultarSelector('[data-page="egresos"]', !access.egresos);
    ocultarSelector('[data-page="ventas"]', !access.ventas);
    ocultarSelector('[data-page="marketing"]', !access.marketing);
    ocultarSelector('[data-page="serviciosCapillas"]', !access.servicios);
    ocultarSelector('[data-page="serviciosParque"]', !access.servicios);

    ocultarContenedorDeId("kpiFlujo", !canFinance);
    ocultarSelector(".flujo-card", !canFinance);
    ocultarSelector(".metas-cobranza-card", !access.metasCobranza);
    ocultarSelector(".servicios-resumen-card", !access.servicios);
    ocultarSelector(".servicios-dia-section", !access.servicios);

    ocultarSelector("#pageIngresos", !access.ingresos);
    ocultarSelector("#pageEgresos", !access.egresos);
    ocultarSelector("#pageVentas", !access.ventas);
    ocultarSelector("#pageMarketing", !access.marketing);
    ocultarSelector("#pageServiciosCapillas", !access.servicios);
    ocultarSelector("#pageServiciosParque", !access.servicios);
    ocultarSelector("#notificationsWrapper", !access.alertas);

    const gridMain = document.querySelector("#pageResumen .grid-main");
    ocultarElemento(gridMain, !canFinance && !canServices);

    if (access.servicios && !access.parquePropiedades) {
      document.querySelectorAll("#pageServiciosParque .parque-kpi-grid .detail-kpi-card").forEach((card, index) => {
        ocultarElemento(card, index > 0);
      });
      const parqueTable = document.getElementById("tablaParquePropiedadesBase");
      ocultarElemento(parqueTable ? parqueTable.closest(".detail-section-card") : null, true);
    }

    if (access.ventas && !access.metasVentas) {
      ["pageVentasMetaPrevision", "pageVentasCumplimientoPrevision", "pageVentasMetaUi", "pageVentasCumplimientoUi"]
        .forEach((id) => ocultarContenedorDeId(id, true, ".detail-kpi-card"));
      const chartVentasMetas = document.getElementById("chartVentasMensuales");
      ocultarElemento(chartVentasMetas ? chartVentasMetas.closest(".detail-section-card") : null, true);
    }

    if (!hasRole) {
      ocultarSelector("#pageResumen", true);
      ocultarSelector(".header-actions", true);
      mostrarPanelAcceso(
        "denied",
        "Acceso al Dashboard no autorizado",
        "La cuenta no tiene un rol asignado en la aplicación Dashboard Dirección. Solicita acceso al administrador."
      );
      return;
    }

    ocultarSelector("#pageResumen", false);
    ocultarSelector(".header-actions", false);
    if (!window.dashboardAccess.graphError) ocultarPanelAcceso();
  }

  function limpiarDatosNoAutorizados() {
    if (!window.state || !window.state.datos) return;
    const access = window.dashboardAccess.permissions;
    const dataPermissions = {
      ingresos: "ingresos",
      egresos: "egresos",
      ventas: "ventas",
      servicios: "servicios",
      marketing: "marketing",
      marketingMedios: "marketingMedios",
      marketingRedes: "marketingRedes",
      metasCobranza: "metasCobranza",
      metasVentas: "metasVentas",
      alertas: "alertas",
      parquePropiedades: "parquePropiedades"
    };
    Object.entries(dataPermissions).forEach(([dataKey, permission]) => {
      if (!access[permission]) window.state.datos[dataKey] = [];
    });
  }

  function paginaPermitida(page) {
    const access = window.dashboardAccess.permissions;
    const pagePermissions = {
      resumen: Boolean(window.dashboardAccess.role),
      ingresos: access.ingresos,
      egresos: access.egresos,
      ventas: access.ventas,
      marketing: access.marketing,
      serviciosCapillas: access.servicios,
      serviciosParque: access.servicios
    };
    return Boolean(pagePermissions[page]);
  }

  window.configurarAccesoDashboardDesdeCuenta = function (account, claimsOverride) {
    const claims = claimsOverride || (account && account.idTokenClaims) || {};
    const role = obtenerRolAutorizado(claims);

    window.dashboardAccess.account = account || null;
    window.dashboardAccess.claims = claims;
    window.dashboardAccess.role = role;
    window.dashboardAccess.label = role ? ROLE_ACCESS[role].label : "Sin rol";
    window.dashboardAccess.permissions = role ? { ...ROLE_ACCESS[role] } : {};
    window.dashboardAccess.configured = true;
    window.dashboardAccess.graphError = null;

    limpiarDatosNoAutorizados();
    aplicarRestriccionesVisuales();

    if (role) {
      console.info(`Dashboard autorizado con perfil: ${ROLE_ACCESS[role].label}`);
      return true;
    }

    console.error("La cuenta no contiene un rol reconocido para el Dashboard.", claims);
    return false;
  };

  const originalGraphGet = typeof window.graphGet === "function" ? window.graphGet : null;
  if (originalGraphGet) {
    window.graphGet = async function (endpoint) {
      try {
        return await originalGraphGet(endpoint);
      } catch (error) {
        const message = String(error && error.message ? error.message : error);
        if (/Graph error (401|403)/i.test(message)) {
          window.dashboardAccess.graphError = error;
          mostrarPanelAcceso(
            "error",
            "No fue posible leer la información autorizada",
            "Microsoft 365 rechazó el acceso a una o más listas de SharePoint. Revisa los permisos asignados a este perfil."
          );
        }
        throw error;
      }
    };
  }

  const originalCargarDatosSharePoint = typeof window.cargarDatosSharePoint === "function" ? window.cargarDatosSharePoint : null;

  window.cargarDatosSharePoint = async function (opciones = {}) {
    const access = window.dashboardAccess.permissions;
    const role = window.dashboardAccess.role;

    if (!role) {
      mostrarPanelAcceso("denied", "Acceso al Dashboard no autorizado", "No se encontró un rol válido para esta cuenta.");
      return null;
    }

    if (role === "Direccion" && originalCargarDatosSharePoint) return originalCargarDatosSharePoint(opciones);

    window.dashboardAccess.graphError = null;
    setAuthStatus(`Actualizando información del perfil ${window.dashboardAccess.label}...`);

    const modoCarga = opciones.modoCarga || "incremental";
    const mesesRecargados = modoCarga === "completa" ? [] : obtenerMesesRecargaReciente();
    const mesesFiltro = mesesRecargados.length ? mesesRecargados : [];

    try {
      const ingresos = access.ingresos ? await obtenerIngresosSharePoint(mesesFiltro) : [];
      const egresos = access.egresos ? await obtenerEgresosSharePoint(mesesFiltro) : [];
      const ventas = access.ventas ? await obtenerVentasSharePoint(mesesFiltro) : [];
      const marketing = access.marketing ? await obtenerMarketingSharePoint() : [];
      const marketingMedios = access.marketingMedios ? await obtenerMarketingMediosSharePoint() : [];
      const marketingRedes = access.marketingRedes ? await obtenerMarketingRedesSharePoint() : [];
      const servicios = access.servicios ? await obtenerServiciosSharePoint(mesesFiltro) : [];
      const metasCobranza = access.metasCobranza ? await obtenerMetasCobranzaSharePoint(mesesFiltro) : [];
      const metasVentas = access.metasVentas ? await obtenerMetasVentasSharePoint(mesesFiltro) : [];
      const alertas = access.alertas ? await obtenerAlertasSharePoint(mesesFiltro) : [];
      const parquePropiedades = access.parquePropiedades ? await obtenerParquePropiedadesSharePoint() : [];

      if (window.dashboardAccess.graphError) {
        setAuthStatus("No fue posible leer una o más listas autorizadas.");
        return null;
      }

      const datos = {
        listas: [], ingresos, egresos, ventas, servicios, marketing, marketingMedios, marketingRedes,
        metasCobranza, metasVentas, alertas, parquePropiedades, mesesRecargados, modoCarga
      };

      const resumen = [];
      if (access.ingresos) resumen.push(`Ingresos: ${ingresos.length}`);
      if (access.egresos) resumen.push(`Egresos: ${egresos.length}`);
      if (access.ventas) resumen.push(`Ventas: ${ventas.length}`);
      if (access.servicios) resumen.push(`Servicios: ${servicios.length}`);
      if (access.marketing) resumen.push(`Marketing: ${marketing.length}`);
      if (access.metasCobranza) resumen.push(`Metas cobranza: ${metasCobranza.length}`);

      setText("sharePointStatus", `Datos autorizados actualizados. ${resumen.join(", ")}.`);
      setAuthStatus(`Información del perfil ${window.dashboardAccess.label} actualizada correctamente.`);
      ocultarPanelAcceso();
      return datos;
    } catch (error) {
      console.error("Error cargando los datos autorizados del Dashboard:", error);
      mostrarPanelAcceso(
        "error",
        "Error al actualizar el Dashboard",
        "No fue posible consultar las listas asignadas a este perfil. Revisa los permisos de SharePoint y vuelve a intentar."
      );
      setAuthStatus("Error al actualizar los datos autorizados.");
      return null;
    }
  };

  const originalMostrarPagina = typeof window.mostrarPagina === "function" ? window.mostrarPagina : null;
  if (originalMostrarPagina) {
    window.mostrarPagina = function (page) {
      const safePage = paginaPermitida(page) ? page : "resumen";
      const result = originalMostrarPagina(safePage);
      aplicarRestriccionesVisuales();
      return result;
    };
  }

  const originalRenderDashboard = typeof window.renderDashboard === "function" ? window.renderDashboard : null;
  if (originalRenderDashboard) {
    window.renderDashboard = function (...args) {
      limpiarDatosNoAutorizados();
      const result = originalRenderDashboard(...args);
      aplicarRestriccionesVisuales();
      return result;
    };
  }

  document.addEventListener("DOMContentLoaded", () => {
    asegurarPanelAcceso();
    aplicarRestriccionesVisuales();
  });
})();