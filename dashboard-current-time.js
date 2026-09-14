(() => {
  "use strict";

  if (window.__dashboardCurrentTimeActivo) return;
  window.__dashboardCurrentTimeActivo = true;

  const HORA_INICIO = 7;
  const HORA_FIN = 22;
  const MINUTOS_INICIO = HORA_INICIO * 60;
  const MINUTOS_FIN = HORA_FIN * 60;
  const MINUTOS_RANGO = MINUTOS_FIN - MINUTOS_INICIO;
  const CLASE_LINEA = "servicios-calendario-ahora-linea";
  const CLASE_ETIQUETA = "servicios-calendario-ahora-etiqueta";

  let observerGrid = null;
  let observerEspera = null;
  let intervalo = null;

  function instalarEstilos() {
    if (document.getElementById("dashboardCurrentTimeStyles")) return;

    const style = document.createElement("style");
    style.id = "dashboardCurrentTimeStyles";
    style.textContent = `
      .${CLASE_LINEA} {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2px;
        background: #dc2626;
        box-shadow: 0 0 0 1px rgba(220, 38, 38, 0.08), 0 0 8px rgba(220, 38, 38, 0.25);
        transform: translateX(-1px);
        pointer-events: none;
        z-index: 8;
      }

      .servicios-calendario-hours .${CLASE_LINEA} {
        z-index: 9;
      }

      .${CLASE_ETIQUETA} {
        position: absolute;
        top: 3px;
        min-height: 20px;
        padding: 3px 7px;
        border-radius: 999px;
        background: #dc2626;
        color: #ffffff;
        font-size: 0.62rem;
        font-weight: 800;
        line-height: 1.1;
        white-space: nowrap;
        transform: translateX(-50%);
        box-shadow: 0 3px 8px rgba(220, 38, 38, 0.22);
        pointer-events: none;
        z-index: 10;
      }

      .${CLASE_ETIQUETA}.is-edge-start {
        transform: none;
      }

      .${CLASE_ETIQUETA}.is-edge-end {
        transform: translateX(-100%);
      }

      /* KPIs adicionales de Servicios Capillas por sucursal. */
      #pageServiciosCapillas .detail-kpi-grid.kpi-capillas-sucursales {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }

      @media (max-width: 1200px) {
        #pageServiciosCapillas .detail-kpi-grid.kpi-capillas-sucursales {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 800px) {
        #pageServiciosCapillas .detail-kpi-grid.kpi-capillas-sucursales {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function formatearHora(fecha) {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(fecha);
  }

  function obtenerPosicionActual() {
    const ahora = new Date();
    const minutos = (ahora.getHours() * 60) + ahora.getMinutes() + (ahora.getSeconds() / 60);

    if (minutos < MINUTOS_INICIO || minutos > MINUTOS_FIN) {
      return null;
    }

    return {
      ahora,
      porcentaje: ((minutos - MINUTOS_INICIO) / MINUTOS_RANGO) * 100
    };
  }

  function asegurarLinea(contenedor, porcentaje) {
    let linea = contenedor.querySelector(`:scope > .${CLASE_LINEA}`);
    if (!linea) {
      linea = document.createElement("span");
      linea.className = CLASE_LINEA;
      linea.setAttribute("aria-hidden", "true");
      contenedor.appendChild(linea);
    }
    linea.style.left = `${porcentaje}%`;
  }

  function asegurarEtiqueta(contenedor, porcentaje, ahora) {
    let etiqueta = contenedor.querySelector(`:scope > .${CLASE_ETIQUETA}`);
    if (!etiqueta) {
      etiqueta = document.createElement("span");
      etiqueta.className = CLASE_ETIQUETA;
      etiqueta.setAttribute("aria-hidden", "true");
      contenedor.appendChild(etiqueta);
    }

    etiqueta.classList.toggle("is-edge-start", porcentaje < 5);
    etiqueta.classList.toggle("is-edge-end", porcentaje > 95);
    etiqueta.style.left = `${porcentaje}%`;
    etiqueta.textContent = `Ahora · ${formatearHora(ahora)}`;
  }

  function quitarIndicadores() {
    document.querySelectorAll(`.${CLASE_LINEA}, .${CLASE_ETIQUETA}`).forEach((nodo) => nodo.remove());
  }

  function actualizar() {
    const grid = document.getElementById("serviciosCalendarioGrid");
    if (!grid) return;

    const posicion = obtenerPosicionActual();
    if (!posicion) {
      quitarIndicadores();
      return;
    }

    const horas = grid.querySelector(".servicios-calendario-hours");
    if (horas) {
      asegurarLinea(horas, posicion.porcentaje);
      asegurarEtiqueta(horas, posicion.porcentaje, posicion.ahora);
    }

    grid.querySelectorAll(".servicios-calendario-track").forEach((track) => {
      asegurarLinea(track, posicion.porcentaje);
    });
  }

  function observarGrid(grid) {
    if (observerGrid) observerGrid.disconnect();

    observerGrid = new MutationObserver(() => {
      window.requestAnimationFrame(actualizar);
    });

    observerGrid.observe(grid, {
      childList: true,
      subtree: true
    });
  }

  function normalizarClave(valor) {
    return String(valor ?? "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }

  function obtenerPeriodoServiciosCapillas() {
    if (typeof window.obtenerMesesRangoSeleccionado === "function") {
      const meses = window.obtenerMesesRangoSeleccionado();
      if (Array.isArray(meses) && meses.length > 0) return meses;
    }

    const state = window.state || {};
    return [state.mesSeleccionado].filter(Boolean);
  }

  function coincidePeriodo(item, periodo) {
    if (typeof window.coincidePeriodoServicio === "function") {
      try {
        return window.coincidePeriodoServicio(item, periodo);
      } catch (_) {}
    }

    const mesItem = normalizarClave(item?.mes);
    const meses = Array.isArray(periodo) ? periodo : [periodo];
    return meses.some((mes) => mesItem === normalizarClave(mes));
  }

  function esServicioCapillas(item) {
    if (typeof window.obtenerOrigenServicio === "function") {
      try {
        return window.obtenerOrigenServicio(item) === "Capillas";
      } catch (_) {}
    }

    const texto = normalizarClave([
      item?.origen,
      item?.tipoOrigen,
      item?.sucursal,
      item?.ubicacionServicio
    ].filter(Boolean).join(" "));

    return texto.includes("CAPILLA")
      || texto.includes("CHURUBUSCO")
      || texto.includes("APODACA")
      || texto.includes("AGUA FRIA");
  }

  function obtenerSucursalCapillas(item) {
    const texto = normalizarClave([
      item?.sucursal,
      item?.ubicacionServicio
    ].filter(Boolean).join(" "));

    if (texto.includes("CHURUBUSCO")) {
      return "CHURUBUSCO";
    }

    if (
      texto.includes("AGUA FRIA")
      || texto.includes("APODACA")
      || texto === "AF"
    ) {
      return "AGUA FRIA";
    }

    return "";
  }

  function contarServiciosSucursal(sucursal) {
    const periodo = obtenerPeriodoServiciosCapillas();
    const servicios = window.state?.datos?.servicios || [];

    return servicios.filter((item) =>
      coincidePeriodo(item, periodo)
      && esServicioCapillas(item)
      && obtenerSucursalCapillas(item) === sucursal
    ).length;
  }

  function crearKpiSucursal(id, etiqueta) {
    const card = document.createElement("div");
    card.className = "detail-kpi-card";
    card.dataset.kpiSucursalCapillas = id;
    card.innerHTML = `
      <span class="detail-kpi-label">${etiqueta}</span>
      <strong id="${id}">0</strong>
    `;
    return card;
  }

  function asegurarKpisSucursalesCapillas() {
    const pagina = document.getElementById("pageServiciosCapillas");
    if (!pagina) return false;

    const grid = pagina.querySelector(".detail-kpi-grid");
    if (!grid) return false;

    grid.classList.add("kpi-capillas-sucursales");

    if (!document.getElementById("pageServiciosCapillasChurubusco")) {
      grid.appendChild(
        crearKpiSucursal("pageServiciosCapillasChurubusco", "Servicios Churubusco")
      );
    }

    if (!document.getElementById("pageServiciosCapillasAguaFria")) {
      grid.appendChild(
        crearKpiSucursal("pageServiciosCapillasAguaFria", "Servicios Agua Fría")
      );
    }

    return true;
  }

  function actualizarKpisSucursalesCapillas() {
    if (!asegurarKpisSucursalesCapillas()) return;

    const churubusco = contarServiciosSucursal("CHURUBUSCO");
    const aguaFria = contarServiciosSucursal("AGUA FRIA");

    const churubuscoEl = document.getElementById("pageServiciosCapillasChurubusco");
    const aguaFriaEl = document.getElementById("pageServiciosCapillasAguaFria");

    if (churubuscoEl) churubuscoEl.textContent = churubusco.toLocaleString("es-MX");
    if (aguaFriaEl) aguaFriaEl.textContent = aguaFria.toLocaleString("es-MX");
  }

  function envolverRenderDashboard() {
    const original = window.renderDashboard;
    if (typeof original !== "function" || original.__kpisSucursalesCapillas) return;

    const wrapper = function (...args) {
      const resultado = original.apply(this, args);
      window.requestAnimationFrame(actualizarKpisSucursalesCapillas);
      return resultado;
    };

    wrapper.__kpisSucursalesCapillas = true;
    window.renderDashboard = wrapper;
  }

  function conectar() {
    instalarEstilos();
    envolverRenderDashboard();
    actualizarKpisSucursalesCapillas();

    const grid = document.getElementById("serviciosCalendarioGrid");
    if (!grid) return false;

    if (observerEspera) {
      observerEspera.disconnect();
      observerEspera = null;
    }

    observarGrid(grid);
    actualizar();

    if (!intervalo) {
      intervalo = window.setInterval(() => {
        actualizar();
        actualizarKpisSucursalesCapillas();
      }, 30000);
    }

    return true;
  }

  function iniciar() {
    instalarEstilos();
    envolverRenderDashboard();
    actualizarKpisSucursalesCapillas();

    if (conectar()) return;

    observerEspera = new MutationObserver(() => {
      conectar();
      actualizarKpisSucursalesCapillas();
    });

    observerEspera.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  } else {
    iniciar();
  }
})();
