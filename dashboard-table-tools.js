(() => {
  "use strict";

  const SORTABLE_ATTR = "data-dashboard-sortable";
  const SORT_DIRECTION_ATTR = "data-sort-direction";
  const sortState = new WeakMap();
  const pendingSort = new WeakSet();
  let selectedExpenseType = "";

  function normalizeText(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseNumericValue(text) {
    const raw = normalizeText(text);
    if (!raw) return null;

    const looksNumeric = /^\(?\s*[-+]?\s*\$?\s*[\d,.]+\s*%?\s*\)?$/.test(raw);
    if (!looksNumeric) return null;

    const negativeByParentheses = /^\(.*\)$/.test(raw);
    const clean = raw
      .replace(/[\s$%()]/g, "")
      .replace(/,/g, "");

    const number = Number(clean);
    if (!Number.isFinite(number)) return null;

    return negativeByParentheses ? -Math.abs(number) : number;
  }

  function parseDateValue(text) {
    const raw = normalizeText(text);
    if (!raw) return null;

    let match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+.*)?$/);
    if (match) {
      const day = Number(match[1]);
      const month = Number(match[2]);
      const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      const timestamp = Date.UTC(year, month - 1, day);
      return Number.isFinite(timestamp) ? timestamp : null;
    }

    match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+.*)?$/);
    if (match) {
      const timestamp = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      return Number.isFinite(timestamp) ? timestamp : null;
    }

    return null;
  }

  function getComparableValue(cell) {
    const text = normalizeText(cell?.textContent);
    const numeric = parseNumericValue(text);
    if (numeric !== null) return { type: "number", value: numeric };

    const date = parseDateValue(text);
    if (date !== null) return { type: "number", value: date };

    return { type: "text", value: text.toLocaleLowerCase("es-MX") };
  }

  function compareValues(a, b) {
    if (a.type === "number" && b.type === "number") {
      return a.value - b.value;
    }

    return String(a.value).localeCompare(String(b.value), "es-MX", {
      numeric: true,
      sensitivity: "base"
    });
  }

  function isPinnedSummaryRow(row) {
    if (!row || row.cells.length === 0) return true;
    if (row.cells.length === 1 && Number(row.cells[0].colSpan || 1) > 1) return true;

    const firstText = normalizeText(row.cells[0]?.textContent).toLocaleUpperCase("es-MX");
    return /^(TOTAL|TOTALES|SUBTOTAL|SIN INFORMACI[ÓO]N|CARGANDO)/.test(firstText);
  }

  function buildRowGroups(tbody) {
    const rows = Array.from(tbody.rows || []);
    const groups = [];
    const groupByFlowId = new Map();

    rows.forEach((row, originalIndex) => {
      const flowParent = row.dataset?.flujoParent;
      if (flowParent && groupByFlowId.has(flowParent)) {
        groupByFlowId.get(flowParent).rows.push(row);
        return;
      }

      const group = {
        primary: row,
        rows: [row],
        originalIndex,
        pinned: isPinnedSummaryRow(row)
      };

      groups.push(group);

      const flowGroup = row.dataset?.flujoGrupo;
      if (flowGroup) groupByFlowId.set(flowGroup, group);
    });

    return groups;
  }

  function sortTable(table, columnIndex, direction) {
    if (!table || !table.tBodies?.length) return;

    Array.from(table.tBodies).forEach((tbody) => {
      const groups = buildRowGroups(tbody);
      const sortable = groups.filter((group) => !group.pinned);
      const pinned = groups.filter((group) => group.pinned);

      sortable.sort((groupA, groupB) => {
        const a = getComparableValue(groupA.primary.cells[columnIndex]);
        const b = getComparableValue(groupB.primary.cells[columnIndex]);
        const result = compareValues(a, b);
        if (result === 0) return groupA.originalIndex - groupB.originalIndex;
        return direction === "asc" ? result : -result;
      });

      const desiredRows = [...sortable, ...pinned].flatMap((group) => group.rows);
      const currentRows = Array.from(tbody.rows || []);
      const alreadySorted = desiredRows.length === currentRows.length
        && desiredRows.every((row, index) => row === currentRows[index]);

      if (alreadySorted) return;

      const fragment = document.createDocumentFragment();
      desiredRows.forEach((row) => fragment.appendChild(row));
      tbody.appendChild(fragment);
    });
  }

  function applySortState(table) {
    const state = sortState.get(table);
    if (!state) return;
    sortTable(table, state.columnIndex, state.direction);
  }

  function scheduleActiveSort(table) {
    if (!table || !sortState.has(table) || pendingSort.has(table)) return;
    pendingSort.add(table);

    window.requestAnimationFrame(() => {
      pendingSort.delete(table);
      applySortState(table);
    });
  }

  function clearHeaderState(table) {
    table.querySelectorAll(`thead th[${SORTABLE_ATTR}="1"]`).forEach((header) => {
      header.removeAttribute(SORT_DIRECTION_ATTR);
      header.setAttribute("aria-sort", "none");
    });
  }

  function activateSort(header) {
    const table = header.closest("table");
    const row = header.parentElement;
    if (!table || !row) return;

    const headers = Array.from(row.children).filter((cell) => cell.tagName === "TH");
    const columnIndex = headers.indexOf(header);
    if (columnIndex < 0) return;

    const previous = sortState.get(table);
    const direction = previous?.columnIndex === columnIndex && previous.direction === "asc"
      ? "desc"
      : "asc";

    sortState.set(table, { columnIndex, direction });
    clearHeaderState(table);
    header.setAttribute(SORT_DIRECTION_ATTR, direction);
    header.setAttribute("aria-sort", direction === "asc" ? "ascending" : "descending");
    sortTable(table, columnIndex, direction);
  }

  function enhanceTable(table) {
    if (!table || table.dataset.dashboardTableSortReady === "1") return;

    const headers = table.querySelectorAll("thead th");
    if (!headers.length) return;

    table.dataset.dashboardTableSortReady = "1";

    headers.forEach((header) => {
      if (Number(header.colSpan || 1) > 1) return;

      header.setAttribute(SORTABLE_ATTR, "1");
      header.setAttribute("tabindex", "0");
      header.setAttribute("role", "button");
      header.setAttribute("aria-sort", "none");
      header.title = `${normalizeText(header.textContent)}: ordenar de menor a mayor / mayor a menor`;

      header.addEventListener("click", () => activateSort(header));
      header.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        activateSort(header);
      });
    });
  }

  function enhanceAllTables(root = document) {
    const tables = root.matches?.("table") ? [root] : Array.from(root.querySelectorAll?.("table") || []);
    tables.forEach(enhanceTable);
  }

  function reorderExpenseCards() {
    const headers = Array.from(document.querySelectorAll(".detail-section-card .detail-section-header h3"));
    const typeHeader = headers.find((header) => normalizeText(header.textContent).toLocaleLowerCase("es-MX") === "egresos por tipo de gasto");
    const rubroHeader = headers.find((header) => normalizeText(header.textContent).toLocaleLowerCase("es-MX") === "egresos por rubro");

    const typeCard = typeHeader?.closest(".detail-section-card");
    const rubroCard = rubroHeader?.closest(".detail-section-card");

    if (!typeCard || !rubroCard || typeCard.parentElement !== rubroCard.parentElement) return;

    const parent = rubroCard.parentElement;
    if (typeCard.nextElementSibling === rubroCard) return;
    parent.insertBefore(typeCard, rubroCard);
  }

  function getExpensePdfButton() {
    const modal = document.getElementById("egresosTipoGastoModal");
    const header = modal?.querySelector(".modal-header");
    const closeButton = document.getElementById("egresosTipoGastoModalClose");
    if (!header || !closeButton) return null;

    let button = document.getElementById("egresosTipoGastoPdfButton");
    if (button) return button;

    button = document.createElement("button");
    button.id = "egresosTipoGastoPdfButton";
    button.className = "dashboard-pdf-button";
    button.type = "button";
    button.textContent = "Generar PDF";
    button.title = "Abrir reporte para imprimir o guardar como PDF";
    button.hidden = true;
    button.addEventListener("click", printSelectedExpenseTypeReport);
    header.insertBefore(button, closeButton);

    return button;
  }

  function formatPeriodLabel() {
    const state = window.state || {};
    const start = normalizeText(state.mesInicioSeleccionado || state.mesSeleccionado);
    const end = normalizeText(state.mesFinSeleccionado || state.mesSeleccionado);
    const names = [
      "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
      "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
    ];

    function formatMonth(key) {
      const match = key.match(/^(\d{4})-(\d{2})$/);
      if (!match) return key || "Periodo seleccionado";
      const month = names[Number(match[2]) - 1] || match[2];
      return `${month} ${match[1]}`;
    }

    if (!start && !end) return "Periodo seleccionado";
    if (!end || start === end) return formatMonth(start || end);
    return `${formatMonth(start)} - ${formatMonth(end)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function printSelectedExpenseTypeReport() {
    const modal = document.getElementById("egresosTipoGastoModal");
    const table = modal?.querySelector("table");
    const title = normalizeText(document.getElementById("egresosTipoGastoModalTitle")?.textContent)
      || `Detalle de egresos - ${selectedExpenseType || "Tipo de gasto"}`;
    const subtitle = normalizeText(document.getElementById("egresosTipoGastoModalSubtitle")?.textContent);

    if (!table || !selectedExpenseType) return;

    const reportWindow = window.open("", "_blank", "width=1100,height=850");
    if (!reportWindow) {
      window.alert("El navegador bloqueó la ventana del reporte. Permite ventanas emergentes para generar el PDF.");
      return;
    }

    const tableClone = table.cloneNode(true);
    tableClone.querySelectorAll("th").forEach((header) => {
      header.removeAttribute("tabindex");
      header.removeAttribute("role");
      header.removeAttribute("aria-sort");
      header.removeAttribute(SORTABLE_ATTR);
      header.removeAttribute(SORT_DIRECTION_ATTR);
      header.removeAttribute("title");
    });

    const generatedAt = new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(new Date());

    const html = `<!doctype html>
<html lang="es-MX">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #241d19; font-family: Arial, sans-serif; font-size: 11px; }
    .report-header { border-bottom: 3px solid #fdbb2d; padding-bottom: 12px; margin-bottom: 18px; }
    .brand { color: #3a1109; font-size: 14px; font-weight: 700; }
    h1 { margin: 5px 0 4px; color: #3a1109; font-size: 22px; }
    .period { color: #0b4e7d; font-weight: 700; margin-bottom: 4px; }
    .summary { color: #5f554f; margin: 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #d9d2ca; padding: 7px 8px; text-align: left; vertical-align: top; }
    th { background: #f4efe8; color: #3a1109; font-weight: 700; }
    tbody tr:nth-child(even) { background: #faf8f5; }
    tbody tr:last-child { font-weight: 700; }
    .report-footer { margin-top: 14px; color: #716861; font-size: 9px; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <header class="report-header">
    <div class="brand">Jardines de Juan Pablo · Dashboard de Dirección</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="period">${escapeHtml(formatPeriodLabel())}</div>
    <p class="summary">${escapeHtml(subtitle)}</p>
  </header>
  ${tableClone.outerHTML}
  <div class="report-footer">Generado el ${escapeHtml(generatedAt)} desde el Dashboard de Dirección.</div>
  <script>
    window.addEventListener('load', function () {
      window.setTimeout(function () { window.print(); }, 200);
    });
  <\/script>
</body>
</html>`;

    reportWindow.document.open();
    reportWindow.document.write(html);
    reportWindow.document.close();
  }

  function handleExpenseTypeSelection(event) {
    const row = event.target.closest?.("#tablaEgresosTipoGastoBody tr");
    if (!row) return;

    const firstCell = row.querySelector("td");
    const type = normalizeText(row.dataset.tipoGasto || firstCell?.textContent);
    if (!type || /sin informaci[oó]n|cargando/i.test(type)) return;

    selectedExpenseType = type;

    document.querySelectorAll("#tablaEgresosTipoGastoBody tr.dashboard-row-selected")
      .forEach((item) => item.classList.remove("dashboard-row-selected"));
    row.classList.add("dashboard-row-selected");

    const button = getExpensePdfButton();
    if (button) button.hidden = false;
  }

  function observeDashboardChanges() {
    const observer = new MutationObserver((mutations) => {
      const affectedTables = new Set();

      mutations.forEach((mutation) => {
        const targetTable = mutation.target?.closest?.("table");
        if (targetTable) affectedTables.add(targetTable);

        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          enhanceAllTables(node);
          const table = node.matches("table") ? node : node.closest("table");
          if (table) affectedTables.add(table);
        });
      });

      affectedTables.forEach(scheduleActiveSort);
      reorderExpenseCards();
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true
    });
  }

  function initialize() {
    enhanceAllTables();
    reorderExpenseCards();
    getExpensePdfButton();
    document.addEventListener("click", handleExpenseTypeSelection, true);
    observeDashboardChanges();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
