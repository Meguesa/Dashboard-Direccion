(() => {
  "use strict";

  const BUTTON_ID = "fullRefreshButton";

  function crearIconoHistorico() {
    return `
      <svg class="toolbar-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="10" cy="5" rx="6" ry="2.5" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M4 5v5c0 1.4 2.7 2.5 6 2.5 1.2 0 2.3-.1 3.2-.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <path d="M4 10v5c0 1.4 2.7 2.5 6 2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <path d="M17 11v8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        <path d="M14 16l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    `;
  }

  async function cargarHistoricoCompleto(button) {
    if (typeof window.actualizarDatosDashboard !== "function") {
      window.alert("No se encontró la función de actualización del Dashboard.");
      return;
    }

    const confirmado = window.confirm(
      "Se volverá a descargar toda la información histórica desde SharePoint. Esta operación puede tardar más que una actualización normal. ¿Deseas continuar?"
    );

    if (!confirmado) {
      return;
    }

    const tituloOriginal = button.title;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.title = "Cargando histórico completo...";

    try {
      await window.actualizarDatosDashboard({
        mensaje: "Cargando información histórica completa desde SharePoint...",
        modoCarga: "completa"
      });
    } catch (error) {
      console.error("Error cargando histórico completo del Dashboard:", error);
      window.alert("No fue posible completar la carga histórica. Revisa el estado de actualización del Dashboard.");
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.title = tituloOriginal;
    }
  }

  function instalarBotonHistorico() {
    if (document.getElementById(BUTTON_ID)) {
      return;
    }

    const refreshButton = document.getElementById("refreshButton");

    if (!refreshButton || !refreshButton.parentElement) {
      return;
    }

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.className = "toolbar-icon-button toolbar-full-refresh-button";
    button.type = "button";
    button.title = "Cargar histórico completo";
    button.setAttribute("aria-label", "Cargar toda la información histórica del Dashboard");
    button.innerHTML = crearIconoHistorico();

    refreshButton.insertAdjacentElement("afterend", button);

    button.addEventListener("click", async () => {
      await cargarHistoricoCompleto(button);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", instalarBotonHistorico, { once: true });
  } else {
    instalarBotonHistorico();
  }
})();
