(() => {
  "use strict";

  const SELECTOR = ".grid-kpis .kpi-value";
  const MIN_FONT_SIZE = 16;
  const MAX_FONT_SIZE = 30;
  let scheduled = false;

  function fitElement(element) {
    if (!(element instanceof HTMLElement)) return;

    // Comenzamos siempre desde el tamano maximo para que el KPI pueda crecer
    // nuevamente si aumenta el ancho disponible.
    element.style.fontSize = `${MAX_FONT_SIZE}px`;

    const availableWidth = element.clientWidth;
    if (!availableWidth || element.scrollWidth <= availableWidth) return;

    let low = MIN_FONT_SIZE;
    let high = MAX_FONT_SIZE;
    let best = MIN_FONT_SIZE;

    // Busqueda binaria para encontrar el mayor tamano que cabe completo.
    for (let i = 0; i < 8; i += 1) {
      const mid = (low + high) / 2;
      element.style.fontSize = `${mid}px`;

      if (element.scrollWidth <= availableWidth) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    element.style.fontSize = `${Math.max(MIN_FONT_SIZE, best - 0.25).toFixed(2)}px`;
  }

  function fitAll() {
    scheduled = false;
    document.querySelectorAll(SELECTOR).forEach(fitElement);
  }

  function scheduleFit() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(fitAll);
  }

  function start() {
    fitAll();

    const grid = document.querySelector(".grid-kpis");
    if (!grid) return;

    const mutationObserver = new MutationObserver(scheduleFit);
    mutationObserver.observe(grid, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(scheduleFit);
      resizeObserver.observe(grid);
      grid.querySelectorAll(".card").forEach((card) => resizeObserver.observe(card));
    } else {
      window.addEventListener("resize", scheduleFit, { passive: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
