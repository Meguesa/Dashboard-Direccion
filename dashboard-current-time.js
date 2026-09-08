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

  function conectar() {
    instalarEstilos();

    const grid = document.getElementById("serviciosCalendarioGrid");
    if (!grid) return false;

    if (observerEspera) {
      observerEspera.disconnect();
      observerEspera = null;
    }

    observarGrid(grid);
    actualizar();

    if (!intervalo) {
      intervalo = window.setInterval(actualizar, 30000);
    }

    return true;
  }

  function iniciar() {
    if (conectar()) return;

    observerEspera = new MutationObserver(() => {
      conectar();
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
