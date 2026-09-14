(() => {
  "use strict";

  const BASELINE_VERSION = "20260914-1";
  const DATASETS_ANUALES = ["ingresos", "egresos", "ventas", "servicios"];

  function normalizar(valor) {
    return String(valor ?? "").trim().toUpperCase();
  }

  function obtenerAnioActivo() {
    const state = window.state || {};
    const anio = String(state.anioSeleccionado || "").trim();

    if (/^20\d{2}$/.test(anio)) {
      return anio;
    }

    const mes = String(state.mesFinSeleccionado || state.mesSeleccionado || "");
    const match = mes.match(/^(20\d{2})-/);
    return match ? match[1] : String(new Date().getFullYear());
  }

  function obtenerMesLimiteHistorico(anio) {
    const hoy = new Date();
    const anioActual = hoy.getFullYear();
    const anioNumero = Number(anio);

    if (!Number.isFinite(anioNumero)) {
      return 0;
    }

    if (anioNumero < anioActual) {
      return 12;
    }

    if (anioNumero > anioActual) {
      return 0;
    }

    // Una carga incremental normal contiene el mes actual y el anterior.
    // Para distinguir una fotografia anual completa de una fotografia parcial,
    // buscamos al menos informacion anterior a esos dos meses.
    return Math.max(0, hoy.getMonth() - 1);
  }

  function coincideRegistroMes(tipo, item, claveMes) {
    try {
      if (tipo === "ventas" && typeof window.coincidePeriodoVenta === "function") {
        return window.coincidePeriodoVenta(item, claveMes);
      }

      if (tipo === "servicios" && typeof window.coincidePeriodoServicio === "function") {
        return window.coincidePeriodoServicio(item, claveMes);
      }

      if (typeof window.coincideMesValor === "function") {
        return window.coincideMesValor(item?.mes, claveMes);
      }
    } catch (error) {
      console.warn("No se pudo validar cobertura mensual del Dashboard:", error);
    }

    const mesItem = normalizar(item?.mes);
    return mesItem === normalizar(claveMes);
  }

  function datasetTieneHistoria(tipo, anio, mesLimite) {
    const lista = window.state?.datos?.[tipo] || [];

    if (!Array.isArray(lista) || lista.length === 0 || mesLimite <= 0) {
      return false;
    }

    for (let mes = 1; mes <= mesLimite; mes += 1) {
      const clave = `${anio}-${String(mes).padStart(2, "0")}`;

      if (lista.some((item) => coincideRegistroMes(tipo, item, clave))) {
        return true;
      }
    }

    return false;
  }

  function obtenerCoberturaHistorica(anio) {
    const mesLimite = obtenerMesLimiteHistorico(anio);

    if (mesLimite <= 0) {
      return {
        suficiente: true,
        cubiertos: DATASETS_ANUALES.length,
        total: DATASETS_ANUALES.length,
        detalle: {}
      };
    }

    const detalle = {};
    let cubiertos = 0;

    DATASETS_ANUALES.forEach((tipo) => {
      const tieneHistoria = datasetTieneHistoria(tipo, anio, mesLimite);
      detalle[tipo] = tieneHistoria;
      if (tieneHistoria) cubiertos += 1;
    });

    return {
      // Tres de las cuatro fuentes principales deben demostrar historia previa.
      // Esto tolera que una lista sea legitimamente vacia, pero detecta la cache
      // parcial creada solamente con el mes actual y el anterior.
      suficiente: cubiertos >= 3,
      cubiertos,
      total: DATASETS_ANUALES.length,
      detalle
    };
  }

  function obtenerMarkerKey(anio) {
    const usuario = String(window.PORTAL_USER_EMAIL || "anonimo")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9@._-]+/g, "_");

    return `dashboardAnnualHistory:${BASELINE_VERSION}:${usuario}:${anio}`;
  }

  function baselineValidado(anio) {
    try {
      return localStorage.getItem(obtenerMarkerKey(anio)) === "1";
    } catch (_) {
      return false;
    }
  }

  function guardarBaselineValidado(anio) {
    try {
      localStorage.setItem(obtenerMarkerKey(anio), "1");
    } catch (_) {}
  }

  function instalarProteccionHistoricoAnual() {
    const original = window.actualizarDatosDashboard;

    if (typeof original !== "function" || original.__annualHistoryGuard) {
      return false;
    }

    const wrapper = async function actualizarDatosDashboardConHistorico(opciones = {}) {
      const anio = obtenerAnioActivo();
      const coberturaAntes = obtenerCoberturaHistorica(anio);
      const tieneBaseline = baselineValidado(anio);
      const modoSolicitado = opciones?.modoCarga || "";

      const forzarCompleta =
        modoSolicitado !== "completa" &&
        !tieneBaseline &&
        !coberturaAntes.suficiente;

      const opcionesEfectivas = forzarCompleta
        ? {
            ...opciones,
            modoCarga: "completa",
            mensaje: "Reconstruyendo información anual completa desde SharePoint..."
          }
        : opciones;

      if (forzarCompleta) {
        console.warn(
          "Cache anual incompleta detectada. Se forzara una carga completa del Dashboard.",
          coberturaAntes
        );
      }

      const resultado = await original(opcionesEfectivas);

      const coberturaDespues = obtenerCoberturaHistorica(anio);
      const huboCargaCompleta = opcionesEfectivas?.modoCarga === "completa";

      if (huboCargaCompleta && coberturaDespues.suficiente) {
        guardarBaselineValidado(anio);
        console.log("Historico anual del Dashboard validado:", coberturaDespues);
      } else if (huboCargaCompleta && !coberturaDespues.suficiente) {
        console.warn(
          "La carga completa termino, pero no se pudo confirmar cobertura anual suficiente.",
          coberturaDespues
        );
      }

      return resultado;
    };

    wrapper.__annualHistoryGuard = true;
    window.actualizarDatosDashboard = wrapper;
    return true;
  }

  if (!instalarProteccionHistoricoAnual()) {
    document.addEventListener("DOMContentLoaded", instalarProteccionHistoricoAnual, { once: true });
  }
})();
