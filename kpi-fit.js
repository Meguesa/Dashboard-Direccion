(() => {
  "use strict";

  const SELECTOR = ".grid-kpis .kpi-value";
  const MIN_FONT_SIZE = 14;
  const MAX_FONT_SIZE = 26;
  let scheduled = false;

  function fitElement(element) {
    if (!(element instanceof HTMLElement)) return;

    const card = element.closest(".card");
    if (!card || card.offsetParent === null) return;

    // Reinicia el valor al maximo permitido para que pueda volver a crecer
    // si aumenta el ancho disponible.
    element.style.fontSize = `${MAX_FONT_SIZE}px`;

    const styles = window.getComputedStyle(card);
    const horizontalPadding =
      parseFloat(styles.paddingLeft || "0") + parseFloat(styles.paddingRight || "0");
    const availableWidth = Math.max(0, card.clientWidth - horizontalPadding);

    if (!availableWidth) return;

    // Se deja un pequeno margen de seguridad para evitar que el ultimo digito
    // toque el borde o sea recortado por redondeos del navegador.
    const targetWidth = Math.max(0, availableWidth - 4);

    if (element.scrollWidth <= targetWidth) return;

    let low = MIN_FONT_SIZE;
    let high = MAX_FONT_SIZE;
    let best = MIN_FONT_SIZE;

    for (let i = 0; i < 10; i += 1) {
      const mid = (low + high) / 2;
      element.style.fontSize = `${mid}px`;

      if (element.scrollWidth <= targetWidth) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    element.style.fontSize = `${Math.max(MIN_FONT_SIZE, best - 0.4).toFixed(2)}px`;
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
    [0, 50, 150, 350, 800, 1500].forEach((delay) => {
      window.setTimeout(scheduleFit, delay);
    });
  }

  function start() {
    const grid = document.querySelector(".grid-kpis");
    if (!grid) return;

    runDelayedFits();

    const mutationObserver = new MutationObserver(runDelayedFits);
    mutationObserver.observe(grid, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    const dashboardPage = document.getElementById("dashboardPage");
    if (dashboardPage) {
      const visibilityObserver = new MutationObserver(runDelayedFits);
      visibilityObserver.observe(dashboardPage, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
    }

    if ("ResizeObserver" in window) {
      const resizeObserver = new ResizeObserver(runDelayedFits);
      resizeObserver.observe(grid);
      grid.querySelectorAll(".card").forEach((card) => resizeObserver.observe(card));
    }

    window.addEventListener("resize", runDelayedFits, { passive: true });
    window.addEventListener("load", runDelayedFits, { once: true });
    window.addEventListener("focus", runDelayedFits, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
