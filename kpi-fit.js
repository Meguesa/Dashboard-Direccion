(() => {
  "use strict";

  const SELECTOR = ".grid-kpis .kpi-value";
  const MIN_FONT_SIZE = 12;
  const MAX_FONT_SIZE = 30;
  const SAFETY_PX = 6;
  let scheduled = false;

  function fitElement(element) {
    if (!(element instanceof HTMLElement)) return;

    const card = element.closest(".card");
    if (!card || card.offsetParent === null) return;

    const cardStyles = window.getComputedStyle(card);
    const availableWidth = Math.max(
      0,
      card.clientWidth
        - parseFloat(cardStyles.paddingLeft || "0")
        - parseFloat(cardStyles.paddingRight || "0")
        - SAFETY_PX
    );

    if (!availableWidth) return;

    // Solo ajustamos font-size. No tocamos margenes, altura, alineacion ni posicion.
    element.style.fontSize = `${MAX_FONT_SIZE}px`;

    // clientWidth puede reflejar el ancho disponible del bloque; scrollWidth nos
    // indica el ancho real que necesita el contenido sin envolver.
    if (element.scrollWidth <= availableWidth) return;

    let low = MIN_FONT_SIZE;
    let high = MAX_FONT_SIZE;
    let best = MIN_FONT_SIZE;

    for (let i = 0; i < 12; i += 1) {
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

  function runDelayedFits() {
    [0, 60, 180, 400, 900].forEach((delay) => window.setTimeout(scheduleFit, delay));
  }

  function start() {
    runDelayedFits();

    const grid = document.querySelector(".grid-kpis");
    if (!grid) return;

    const mutationObserver = new MutationObserver(runDelayedFits);
    mutationObserver.observe(grid, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(runDelayedFits);
      resizeObserver.observe(grid);
      grid.querySelectorAll(".card").forEach((card) => resizeObserver.observe(card));
    }

    window.addEventListener("resize", runDelayedFits, { passive: true });
    window.addEventListener("load", runDelayedFits, { once: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
