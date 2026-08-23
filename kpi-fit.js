(() => {
  "use strict";

  const SELECTOR = ".grid-kpis .kpi-value";
  const MIN_FONT_SIZE = 12;
  const MAX_FONT_SIZE = 30;
  const SAFETY_PX = 4;
  let scheduled = false;

  function measureWidth(element, fontSize) {
    const styles = window.getComputedStyle(element);
    const canvas = measureWidth.canvas || (measureWidth.canvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");

    context.font = [
      styles.fontStyle,
      styles.fontVariant,
      styles.fontWeight,
      `${fontSize}px`,
      styles.fontFamily,
    ].join(" ");

    const textWidth = context.measureText(element.textContent || "").width;
    const letterSpacing = parseFloat(styles.letterSpacing || "0");
    const chars = Math.max(0, (element.textContent || "").length - 1);

    return textWidth + Math.max(0, letterSpacing) * chars;
  }

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

    let low = MIN_FONT_SIZE;
    let high = MAX_FONT_SIZE;
    let best = MIN_FONT_SIZE;

    for (let i = 0; i < 14; i += 1) {
      const mid = (low + high) / 2;
      const width = measureWidth(element, mid);

      if (width <= availableWidth) {
        best = mid;
        low = mid;
      } else {
        high = mid;
      }
    }

    element.style.fontSize = `${Math.max(MIN_FONT_SIZE, best - 0.35).toFixed(2)}px`;
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
    window.addEventListener("focus", runDelayedFits, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
