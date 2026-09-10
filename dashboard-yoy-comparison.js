(function () {
  let instalado = false;

  function instalarComparativoInteranualDashboard() {
    if (instalado) return;
    instalado = true;

    extenderIngresosConFecha();
    forzarPrimeraCargaCompleta();
    insertarEstilos();
    insertarBloque("pageIngresos", "yoyIngresosBlock", "Ingresos acumulados a la fecha", "yoyIngresos");
    insertarBloque("pageVentas", "yoyVentasBlock", "Ventas acumuladas a la fecha", "yoyVentas");
    conectarActualizacion();
    renderComparativosInteranuales();
  }

  function extenderIngresosConFecha() {
    if (typeof window.obtenerItemsLista !== "function") return;

    window.obtenerIngresosSharePoint = async function (mesesFiltro = []) {
      try {
        setAuthStatus("Leyendo BI_Ingresos desde SharePoint...");
        const listId = CONFIG.sharepoint.lists.ingresos.listId;
        if (!listId) throw new Error("No esta configurado el listId de BI_Ingresos.");

        const filtroMeses = crearFiltroMesesSharePoint(mesesFiltro);
        const items = await obtenerItemsLista(listId, 5000, { filtro: filtroMeses });
        const ingresos = items.map((item) => {
          const f = item.fields || {};
          const fecha = obtenerCampoSharePoint(f, ["Fecha", "FECHA", "Fecha_Ingreso", "Fecha_x005f_Ingreso"]);

          return {
            id: item.id,
            fecha: limpiarTexto(fecha),
            mes: limpiarTexto(f.Mes),
            banco: limpiarTexto(f.Banco),
            categoria: limpiarTexto(f.Categor_x00ed_a || f.Categoria),
            subcategoria: limpiarTexto(f.Subcategor_x00ed_a || f.Subcategoria),
            referenciaContrato: limpiarTexto(f.Referencia_Contrato),
            importe: convertirNumero(f.Importe),
            fuente: limpiarTexto(f.Fuente),
            hojaOrigen: limpiarTexto(f.Hoja_Origen)
          };
        });

        setText("sharePointStatus", `BI_Ingresos leido correctamente: ${ingresos.length} registros`);
        setAuthStatus("BI_Ingresos leido correctamente.");
        return ingresos;
      } catch (error) {
        console.error("Error leyendo BI_Ingresos con Fecha:", error);
        setText("sharePointStatus", "Error al leer BI_Ingresos. Revisa la consola del navegador.");
        setAuthStatus("Error al leer BI_Ingresos.");
        return [];
      }
    };
  }

  function forzarPrimeraCargaCompleta() {
    if (typeof window.actualizarDatosDashboard !== "function") return;
    const base = window.actualizarDatosDashboard;
    const migrationKey = "dashboardYoyFechaIngresosV1";
    let requiereMigracion = localStorage.getItem(migrationKey) !== "1";

    window.actualizarDatosDashboard = async function (opciones = {}) {
      const finales = { ...opciones };
      const cargaForzada = requiereMigracion && !finales.modoCarga;

      if (cargaForzada) finales.modoCarga = "completa";

      const resultado = await base(finales);

      if (cargaForzada && (window.state?.datos?.ingresos || []).some((item) => item.fecha)) {
        localStorage.setItem(migrationKey, "1");
        requiereMigracion = false;
      }

      return resultado;
    };
  }

  function insertarEstilos() {
    if (document.getElementById("dashboardYoyStyles")) return;
    const style = document.createElement("style");
    style.id = "dashboardYoyStyles";
    style.textContent = `
      .yoy-comparison{margin:18px 0 26px;padding:18px;border:1px solid #dbe4ee;border-radius:14px;background:#f8fafc}
      .yoy-comparison-header{margin-bottom:14px}.yoy-comparison-header h3{margin:0;font-size:1rem;color:#0f172a}
      .yoy-comparison-header p{margin:4px 0 0;color:#64748b;font-size:.86rem}
      .yoy-comparison-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .yoy-comparison-card{min-width:0;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
      .yoy-comparison-label{display:block;margin-bottom:7px;color:#64748b;font-size:.78rem;font-weight:600;line-height:1.25}
      .yoy-comparison-value{display:block;color:#0f172a;font-size:clamp(1.15rem,2vw,1.55rem);line-height:1.15;overflow-wrap:anywhere}
      .yoy-comparison-detail{display:block;margin-top:6px;color:#64748b;font-size:.75rem;line-height:1.35}
      .yoy-comparison-card.is-positive .yoy-comparison-value,.yoy-comparison-card.is-positive .yoy-comparison-detail{color:#15803d}
      .yoy-comparison-card.is-negative .yoy-comparison-value,.yoy-comparison-card.is-negative .yoy-comparison-detail{color:#b91c1c}
      .yoy-comparison-card.is-neutral .yoy-comparison-value{color:#475569}
      @media(max-width:800px){.yoy-comparison-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function insertarBloque(pageId, blockId, titulo, prefix) {
    if (document.getElementById(blockId)) return;
    const grid = document.getElementById(pageId)?.querySelector(".detail-kpi-grid");
    if (!grid) return;

    const section = document.createElement("section");
    section.id = blockId;
    section.className = "yoy-comparison";
    section.innerHTML = `
      <div class="yoy-comparison-header"><h3>${titulo}</h3><p id="${prefix}Subtitle">Comparativo interanual a la misma fecha.</p></div>
      <div class="yoy-comparison-grid">
        <article class="yoy-comparison-card"><span id="${prefix}ActualLabel" class="yoy-comparison-label">A\u00f1o actual</span><strong id="${prefix}Actual" class="yoy-comparison-value">$0.00</strong><small id="${prefix}ActualDetail" class="yoy-comparison-detail"></small></article>
        <article class="yoy-comparison-card"><span id="${prefix}AnteriorLabel" class="yoy-comparison-label">A\u00f1o anterior</span><strong id="${prefix}Anterior" class="yoy-comparison-value">$0.00</strong><small id="${prefix}AnteriorDetail" class="yoy-comparison-detail"></small></article>
        <article id="${prefix}VariacionCard" class="yoy-comparison-card is-neutral"><span class="yoy-comparison-label">Variaci\u00f3n interanual</span><strong id="${prefix}Variacion" class="yoy-comparison-value">\u2014</strong><small id="${prefix}VariacionDetail" class="yoy-comparison-detail"></small></article>
      </div>`;
    grid.insertAdjacentElement("afterend", section);
  }

  function conectarActualizacion() {
    const observer = new MutationObserver(renderComparativosInteranuales);
    ["pageIngresosTotal", "pageVentasTotal", "pageVentasUiTotal"].forEach((id) => {
      const nodo = document.getElementById(id);
      if (nodo) observer.observe(nodo, { childList: true, subtree: true, characterData: true });
    });

    document.getElementById("yearSelector")?.addEventListener("change", () => setTimeout(renderComparativosInteranuales, 0));
  }

  function renderComparativosInteranuales() {
    if (!window.state?.datos) return;
    const anio = Number(window.state.anioSeleccionado || new Date().getFullYear());
    const anterior = anio - 1;
    const corte = crearCorte(anio);
    const corteAnterior = crearCorte(anterior);

    pintarIngresos(anio, anterior, corte, corteAnterior);
    pintarVentas(anio, anterior, corte, corteAnterior);
  }

  function pintarIngresos(anio, anterior, corte, corteAnterior) {
    const actual = calcularIngresos(anio, corte);
    const previo = calcularIngresos(anterior, corteAnterior);
    pintarBase("yoyIngresos", anio, anterior, corte, actual, previo,
      actual.tieneDatos ? `${num(actual.registros)} movimientos con fecha` : "Sin movimientos con fecha para este corte",
      previo.tieneDatos ? `${num(previo.registros)} movimientos con fecha` : `No hay movimientos con fecha para ${anterior}`);
  }

  function pintarVentas(anio, anterior, corte, corteAnterior) {
    const actual = calcularVentas(anio, corte);
    const previo = calcularVentas(anterior, corteAnterior);
    pintarBase("yoyVentas", anio, anterior, corte, actual, previo,
      actual.tieneDatos ? `Previsi\u00f3n ${moneda(actual.prevision)} + UI ${moneda(actual.ui)}` : "Sin ventas con fecha para este corte",
      previo.tieneDatos ? `Previsi\u00f3n ${moneda(previo.prevision)} + UI ${moneda(previo.ui)}` : `No hay ventas con fecha para ${anterior}`);
  }

  function pintarBase(prefix, anio, anterior, corte, actual, previo, detalleActual, detallePrevio) {
    texto(`${prefix}Subtitle`, `Acumulado al ${new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long" }).format(corte)} de cada a\u00f1o.`);
    texto(`${prefix}ActualLabel`, `${anio} a la fecha`);
    texto(`${prefix}AnteriorLabel`, `${anterior} a la misma fecha`);
    texto(`${prefix}Actual`, actual.tieneDatos ? moneda(actual.total) : "Sin datos");
    texto(`${prefix}Anterior`, previo.tieneDatos ? moneda(previo.total) : "Sin datos");
    texto(`${prefix}ActualDetail`, detalleActual);
    texto(`${prefix}AnteriorDetail`, detallePrevio);
    pintarVariacion(prefix, anterior, actual, previo);
  }

  function pintarVariacion(prefix, anioAnterior, actual, previo) {
    const card = document.getElementById(`${prefix}VariacionCard`);
    card?.classList.remove("is-positive", "is-negative", "is-neutral");

    if (!actual.tieneDatos || !previo.tieneDatos) {
      texto(`${prefix}Variacion`, "\u2014");
      texto(`${prefix}VariacionDetail`, "Se requieren datos comparables de ambos a\u00f1os");
      card?.classList.add("is-neutral");
      return;
    }

    const diferencia = actual.total - previo.total;
    const pct = previo.total !== 0 ? diferencia / Math.abs(previo.total) : null;
    texto(`${prefix}Variacion`, pct === null ? "\u2014" : `${pct > 0 ? "+" : ""}${porcentaje(pct)}`);
    texto(`${prefix}VariacionDetail`, `${diferencia > 0 ? "+" : ""}${moneda(diferencia)} vs ${anioAnterior}`);
    card?.classList.add(pct === null || diferencia === 0 ? "is-neutral" : diferencia > 0 ? "is-positive" : "is-negative");
  }

  function calcularIngresos(anio, corte) {
    let total = 0, registros = 0;
    (window.state.datos.ingresos || []).forEach((item) => {
      const fecha = fechaDe(item, ["fecha", "Fecha", "FECHA"]);
      if (!enCorte(fecha, anio, corte)) return;
      total += Number(item.importe || 0); registros += 1;
    });
    return { total, registros, tieneDatos: registros > 0 };
  }

  function calcularVentas(anio, corte) {
    let prevision = 0, registrosPrevision = 0;
    (window.state.datos.ventas || []).forEach((item) => {
      const esContrato = typeof esFuenteContratos === "function" ? esFuenteContratos(item.fuente) : String(item.fuente || "").toUpperCase().includes("CONTRATOS");
      const fecha = fechaDe(item, ["fechaContrato", "fecha", "Fecha_Contrato", "Fecha"]);
      if (!esContrato || !enCorte(fecha, anio, corte)) return;
      prevision += typeof obtenerMontoVenta === "function" ? Number(obtenerMontoVenta(item) || 0) : Number(item.montoVenta || item.total || 0);
      registrosPrevision += 1;
    });

    let ui = 0, registrosUi = 0;
    (window.state.datos.servicios || []).forEach((item) => {
      const esUi = typeof esServicioUsoInmediatoBiServicios === "function" ? esServicioUsoInmediatoBiServicios(item) : String(item.previsionUsoInmediato || "").toUpperCase() === "USO INMEDIATO";
      const fecha = fechaDe(item, ["fechaServicio", "fechaCreacionOrigen", "fechaCreacionOriginal", "fechaFin"]);
      if (!esUi || !enCorte(fecha, anio, corte)) return;

      const origen = typeof obtenerOrigenServicio === "function" ? String(obtenerOrigenServicio(item) || "") : String(item.tipoOrigen || item.origen || "");
      const origenNormalizado = origen.toUpperCase();

      if (origenNormalizado.includes("CAPILLA")) {
        ui += typeof obtenerMontoServicioUiCapillas === "function" ? Number(obtenerMontoServicioUiCapillas(item) || 0) : Number(item.precioVenta || 0);
        registrosUi += 1;
      } else if (origenNormalizado.includes("PARQUE")) {
        ui += typeof obtenerMontoServicioUi === "function" ? Number(obtenerMontoServicioUi(item) || 0) : Number(item.precioTotalServicio || 0);
        registrosUi += 1;
      }
    });

    return { total: prevision + ui, prevision, ui, registros: registrosPrevision + registrosUi, tieneDatos: registrosPrevision + registrosUi > 0 };
  }

  function crearCorte(anio) {
    const hoy = new Date();
    const mes = hoy.getMonth();
    const dia = Math.min(hoy.getDate(), new Date(anio, mes + 1, 0).getDate());
    return new Date(anio, mes, dia, 23, 59, 59, 999);
  }

  function enCorte(fecha, anio, corte) {
    return !!fecha && fecha.getFullYear() === anio && fecha.getTime() <= corte.getTime();
  }

  function fechaDe(item, campos) {
    for (const campo of campos) {
      const fecha = parseFecha(item?.[campo]);
      if (fecha) return fecha;
    }
    return null;
  }

  function parseFecha(valor) {
    if (valor === null || valor === undefined || valor === "") return null;
    if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
    if (typeof valor === "number" && Number.isFinite(valor)) return new Date(new Date(1899, 11, 30, 12).getTime() + valor * 86400000);

    const s = String(valor).trim();
    let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (m) return fechaLocal(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m) return fechaLocal(+m[3], +m[2], +m[1]);
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function fechaLocal(anio, mes, dia) {
    const d = new Date(anio, mes - 1, dia, 12);
    return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia ? d : null;
  }

  function moneda(valor) {
    return typeof formatoMoneda === "function" ? formatoMoneda(Number(valor || 0)) : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor || 0));
  }

  function porcentaje(valor) {
    return new Intl.NumberFormat("es-MX", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Number(valor || 0));
  }

  function num(valor) {
    return typeof formatoNumero === "function" ? formatoNumero(Number(valor || 0)) : new Intl.NumberFormat("es-MX").format(Number(valor || 0));
  }

  function texto(id, valor) {
    const nodo = document.getElementById(id);
    if (nodo) nodo.textContent = valor;
  }

  window.instalarComparativoInteranualDashboard = instalarComparativoInteranualDashboard;
  window.renderComparativosInteranuales = renderComparativosInteranuales;
  document.addEventListener("DOMContentLoaded", instalarComparativoInteranualDashboard);
})();
