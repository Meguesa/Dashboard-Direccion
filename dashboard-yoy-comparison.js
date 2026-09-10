(function () {
  let instalado = false;

  function instalarComparativoInteranualDashboard() {
    if (instalado) return;
    instalado = true;

    extenderIngresosConFecha();
    forzarCargaHistoricaUnaVez();
    insertarEstilos();
    insertarBloque("pageIngresos", "yoyIngresosBlock", "Comparativo mensual de ingresos", "yoyIngresos");
    insertarBloque("pageVentas", "yoyVentasBlock", "Comparativo mensual de ventas", "yoyVentas");
    insertarBloqueServicios();
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

  function forzarCargaHistoricaUnaVez() {
    if (typeof window.actualizarDatosDashboard !== "function") return;

    const base = window.actualizarDatosDashboard;
    const migrationKey = "dashboardYoyMensualServiciosV2";
    let requiereMigracion = localStorage.getItem(migrationKey) !== "1";

    window.actualizarDatosDashboard = async function (opciones = {}) {
      const finales = { ...opciones };
      const cargaForzada = requiereMigracion;

      if (cargaForzada) {
        finales.modoCarga = "completa";
        finales.mensaje = "Preparando comparativos mensuales con historial completo...";
      }

      const resultado = await base(finales);

      if (cargaForzada) {
        const tieneIngresos = (window.state?.datos?.ingresos || []).some((item) => fechaDe(item, ["fecha", "Fecha", "FECHA"]));
        const tieneServicios = (window.state?.datos?.servicios || []).some((item) => fechaDe(item, ["fechaServicio", "fechaCreacionOrigen", "fechaCreacionOriginal", "fechaFin"]));

        if (tieneIngresos && tieneServicios) {
          localStorage.setItem(migrationKey, "1");
          requiereMigracion = false;
        }
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
      .yoy-services-row+.yoy-services-row{margin-top:16px;padding-top:16px;border-top:1px solid #e2e8f0}
      .yoy-services-row-title{margin:0 0 9px;color:#334155;font-size:.85rem;font-weight:700}
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
      <div class="yoy-comparison-header"><h3>${titulo}</h3><p id="${prefix}Subtitle">Comparativo del mes seleccionado contra el mismo mes del año anterior.</p></div>
      <div class="yoy-comparison-grid">
        <article class="yoy-comparison-card"><span id="${prefix}ActualLabel" class="yoy-comparison-label">Año actual</span><strong id="${prefix}Actual" class="yoy-comparison-value">$0.00</strong><small id="${prefix}ActualDetail" class="yoy-comparison-detail"></small></article>
        <article class="yoy-comparison-card"><span id="${prefix}AnteriorLabel" class="yoy-comparison-label">Año anterior</span><strong id="${prefix}Anterior" class="yoy-comparison-value">$0.00</strong><small id="${prefix}AnteriorDetail" class="yoy-comparison-detail"></small></article>
        <article id="${prefix}VariacionCard" class="yoy-comparison-card is-neutral"><span class="yoy-comparison-label">Variación interanual</span><strong id="${prefix}Variacion" class="yoy-comparison-value">—</strong><small id="${prefix}VariacionDetail" class="yoy-comparison-detail"></small></article>
      </div>`;
    grid.insertAdjacentElement("afterend", section);
  }

  function insertarBloqueServicios() {
    if (document.getElementById("yoyServiciosBlock")) return;
    const grid = document.getElementById("pageServiciosCapillas")?.querySelector(".detail-kpi-grid");
    if (!grid) return;

    const section = document.createElement("section");
    section.id = "yoyServiciosBlock";
    section.className = "yoy-comparison";
    section.innerHTML = `
      <div class="yoy-comparison-header">
        <h3>Comparativo mensual de Servicios Capillas</h3>
        <p id="yoyServiciosSubtitle">Previsión y Uso Inmediato contra el mismo mes del año anterior.</p>
      </div>
      ${crearFilaServicios("Previsión", "yoyServiciosPrevision")}
      ${crearFilaServicios("Uso Inmediato", "yoyServiciosUi")}`;

    grid.insertAdjacentElement("afterend", section);
  }

  function crearFilaServicios(titulo, prefix) {
    return `
      <div class="yoy-services-row">
        <h4 class="yoy-services-row-title">${titulo}</h4>
        <div class="yoy-comparison-grid">
          <article class="yoy-comparison-card"><span id="${prefix}ActualLabel" class="yoy-comparison-label">Año actual</span><strong id="${prefix}Actual" class="yoy-comparison-value">0</strong><small id="${prefix}ActualDetail" class="yoy-comparison-detail"></small></article>
          <article class="yoy-comparison-card"><span id="${prefix}AnteriorLabel" class="yoy-comparison-label">Año anterior</span><strong id="${prefix}Anterior" class="yoy-comparison-value">0</strong><small id="${prefix}AnteriorDetail" class="yoy-comparison-detail"></small></article>
          <article id="${prefix}VariacionCard" class="yoy-comparison-card is-neutral"><span class="yoy-comparison-label">Variación interanual</span><strong id="${prefix}Variacion" class="yoy-comparison-value">—</strong><small id="${prefix}VariacionDetail" class="yoy-comparison-detail"></small></article>
        </div>
      </div>`;
  }

  function conectarActualizacion() {
    const observer = new MutationObserver(renderComparativosInteranuales);
    [
      "pageIngresosTotal",
      "pageVentasTotal",
      "pageVentasUiTotal",
      "pageServiciosCapillasUsoInmediato",
      "pageServiciosCapillasPrevision"
    ].forEach((id) => {
      const nodo = document.getElementById(id);
      if (nodo) observer.observe(nodo, { childList: true, subtree: true, characterData: true });
    });

    ["yearSelector", "monthStartSelector", "monthEndSelector"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => setTimeout(renderComparativosInteranuales, 0));
    });
  }

  function renderComparativosInteranuales() {
    if (!window.state?.datos) return;

    const periodo = obtenerPeriodoComparacion();
    pintarIngresos(periodo);
    pintarVentas(periodo);
    pintarServiciosCapillas(periodo);
  }

  function obtenerPeriodoComparacion() {
    const hoy = new Date();
    const clave = String(window.state.mesSeleccionado || window.state.mesFinSeleccionado || "").trim();
    const partes = clave.match(/^(20\d{2})-(\d{1,2})$/);
    const anio = partes ? Number(partes[1]) : Number(window.state.anioSeleccionado || hoy.getFullYear());
    const mes = partes ? Number(partes[2]) : hoy.getMonth() + 1;
    const anterior = anio - 1;
    const esMesActual = anio === hoy.getFullYear() && mes === hoy.getMonth() + 1;
    const ultimoDiaMes = new Date(anio, mes, 0).getDate();
    const ultimoDiaMesAnterior = new Date(anterior, mes, 0).getDate();
    const diaFinActual = esMesActual
      ? Math.max(1, Math.min(hoy.getDate() - 1, ultimoDiaMes))
      : ultimoDiaMes;
    const diaFinAnterior = esMesActual
      ? Math.min(diaFinActual, ultimoDiaMesAnterior)
      : ultimoDiaMesAnterior;
    const nombreMes = nombreMesCapitalizado(mes);
    const esRango = String(window.state.mesInicioSeleccionado || "") !== String(window.state.mesFinSeleccionado || "");

    return {
      anio,
      anterior,
      mes,
      nombreMes,
      esMesActual,
      diaFinActual,
      diaFinAnterior,
      esRango
    };
  }

  function pintarIngresos(periodo) {
    const actual = calcularIngresos(periodo.anio, periodo.mes, periodo.diaFinActual);
    const previo = calcularIngresos(periodo.anterior, periodo.mes, periodo.diaFinAnterior);

    pintarBase(
      "yoyIngresos",
      periodo,
      actual,
      previo,
      actual.tieneDatos ? `${num(actual.registros)} movimientos` : "Sin movimientos con fecha para este mes",
      previo.tieneDatos ? `${num(previo.registros)} movimientos` : `No hay movimientos con fecha para ${periodo.anterior}`,
      moneda,
      moneda,
      ""
    );
  }

  function pintarVentas(periodo) {
    const actual = calcularVentas(periodo.anio, periodo.mes, periodo.diaFinActual);
    const previo = calcularVentas(periodo.anterior, periodo.mes, periodo.diaFinAnterior);

    pintarBase(
      "yoyVentas",
      periodo,
      actual,
      previo,
      actual.tieneDatos ? `Previsión ${moneda(actual.prevision)} + UI ${moneda(actual.ui)}` : "Sin ventas con fecha para este mes",
      previo.tieneDatos ? `Previsión ${moneda(previo.prevision)} + UI ${moneda(previo.ui)}` : `No hay ventas con fecha para ${periodo.anterior}`,
      moneda,
      moneda,
      ""
    );
  }

  function pintarServiciosCapillas(periodo) {
    const actual = calcularServiciosCapillas(periodo.anio, periodo.mes, periodo.diaFinActual);
    const previo = calcularServiciosCapillas(periodo.anterior, periodo.mes, periodo.diaFinAnterior);

    texto("yoyServiciosSubtitle", descripcionPeriodo(periodo));

    pintarFilaServicios(
      "yoyServiciosPrevision",
      periodo,
      { total: actual.prevision, tieneDatos: actual.tieneDatos },
      { total: previo.prevision, tieneDatos: previo.tieneDatos },
      actual.tieneDatos ? `${num(actual.prevision)} de ${num(actual.totalCapillas)} servicios Capillas` : "Sin servicios Capillas con fecha para este mes",
      previo.tieneDatos ? `${num(previo.prevision)} de ${num(previo.totalCapillas)} servicios Capillas` : `No hay servicios Capillas con fecha para ${periodo.anterior}`
    );

    pintarFilaServicios(
      "yoyServiciosUi",
      periodo,
      { total: actual.ui, tieneDatos: actual.tieneDatos },
      { total: previo.ui, tieneDatos: previo.tieneDatos },
      actual.tieneDatos ? `${num(actual.ui)} de ${num(actual.totalCapillas)} servicios Capillas` : "Sin servicios Capillas con fecha para este mes",
      previo.tieneDatos ? `${num(previo.ui)} de ${num(previo.totalCapillas)} servicios Capillas` : `No hay servicios Capillas con fecha para ${periodo.anterior}`
    );
  }

  function pintarBase(prefix, periodo, actual, previo, detalleActual, detallePrevio, formatter, diffFormatter, unidad) {
    texto(`${prefix}Subtitle`, descripcionPeriodo(periodo));
    texto(`${prefix}ActualLabel`, etiquetaPeriodo(periodo, periodo.anio, periodo.diaFinActual));
    texto(`${prefix}AnteriorLabel`, etiquetaPeriodo(periodo, periodo.anterior, periodo.diaFinAnterior));
    texto(`${prefix}Actual`, actual.tieneDatos ? formatter(actual.total) : "Sin datos");
    texto(`${prefix}Anterior`, previo.tieneDatos ? formatter(previo.total) : "Sin datos");
    texto(`${prefix}ActualDetail`, detalleActual);
    texto(`${prefix}AnteriorDetail`, detallePrevio);
    pintarVariacion(prefix, periodo.anterior, actual, previo, diffFormatter, unidad);
  }

  function pintarFilaServicios(prefix, periodo, actual, previo, detalleActual, detallePrevio) {
    texto(`${prefix}ActualLabel`, etiquetaPeriodo(periodo, periodo.anio, periodo.diaFinActual));
    texto(`${prefix}AnteriorLabel`, etiquetaPeriodo(periodo, periodo.anterior, periodo.diaFinAnterior));
    texto(`${prefix}Actual`, actual.tieneDatos ? num(actual.total) : "Sin datos");
    texto(`${prefix}Anterior`, previo.tieneDatos ? num(previo.total) : "Sin datos");
    texto(`${prefix}ActualDetail`, detalleActual);
    texto(`${prefix}AnteriorDetail`, detallePrevio);
    pintarVariacion(prefix, periodo.anterior, actual, previo, num, " servicios");
  }

  function descripcionPeriodo(periodo) {
    const notaRango = periodo.esRango ? " Se usa el mes seleccionado en ‘Hasta’." : "";

    if (periodo.esMesActual) {
      return `Del 1 al ${periodo.diaFinActual} de ${periodo.nombreMes} de cada año (último día completo).${notaRango}`;
    }

    return `Mes completo de ${periodo.nombreMes} de cada año.${notaRango}`;
  }

  function etiquetaPeriodo(periodo, anio, diaFin) {
    return periodo.esMesActual
      ? `${periodo.nombreMes} ${anio} · 1-${diaFin}`
      : `${periodo.nombreMes} ${anio}`;
  }

  function pintarVariacion(prefix, anioAnterior, actual, previo, formatter, unidad) {
    const card = document.getElementById(`${prefix}VariacionCard`);
    card?.classList.remove("is-positive", "is-negative", "is-neutral");

    if (!actual.tieneDatos || !previo.tieneDatos) {
      texto(`${prefix}Variacion`, "—");
      texto(`${prefix}VariacionDetail`, "Se requieren datos comparables de ambos años");
      card?.classList.add("is-neutral");
      return;
    }

    const diferencia = actual.total - previo.total;
    const pct = previo.total !== 0 ? diferencia / Math.abs(previo.total) : null;
    texto(`${prefix}Variacion`, pct === null ? "—" : `${pct > 0 ? "+" : ""}${porcentaje(pct)}`);
    texto(`${prefix}VariacionDetail`, `${diferencia > 0 ? "+" : ""}${formatter(diferencia)}${unidad || ""} vs ${anioAnterior}`);
    card?.classList.add(pct === null || diferencia === 0 ? "is-neutral" : diferencia > 0 ? "is-positive" : "is-negative");
  }

  function calcularIngresos(anio, mes, diaFin) {
    let total = 0;
    let registros = 0;

    (window.state.datos.ingresos || []).forEach((item) => {
      const fecha = fechaDe(item, ["fecha", "Fecha", "FECHA"]);
      if (!enMesHasta(fecha, anio, mes, diaFin)) return;
      total += Number(item.importe || 0);
      registros += 1;
    });

    return { total, registros, tieneDatos: registros > 0 };
  }

  function calcularVentas(anio, mes, diaFin) {
    let prevision = 0;
    let registrosPrevision = 0;

    (window.state.datos.ventas || []).forEach((item) => {
      const esContrato = typeof esFuenteContratos === "function"
        ? esFuenteContratos(item.fuente)
        : String(item.fuente || "").toUpperCase().includes("CONTRATOS");
      const fecha = fechaDe(item, ["fechaContrato", "fecha", "Fecha_Contrato", "Fecha"]);

      if (!esContrato || !enMesHasta(fecha, anio, mes, diaFin)) return;

      prevision += typeof obtenerMontoVenta === "function"
        ? Number(obtenerMontoVenta(item) || 0)
        : Number(item.montoVenta || item.total || 0);
      registrosPrevision += 1;
    });

    let ui = 0;
    let registrosUi = 0;

    (window.state.datos.servicios || []).forEach((item) => {
      const esUi = typeof esServicioUsoInmediatoBiServicios === "function"
        ? esServicioUsoInmediatoBiServicios(item)
        : normalizarPlano(item.previsionUsoInmediato).includes("USO INMEDIATO");
      const fecha = fechaDe(item, ["fechaServicio", "fechaCreacionOrigen", "fechaCreacionOriginal", "fechaFin"]);

      if (!esUi || !enMesHasta(fecha, anio, mes, diaFin)) return;

      const origen = typeof obtenerOrigenServicio === "function"
        ? String(obtenerOrigenServicio(item) || "")
        : String(item.tipoOrigen || item.origen || "");
      const origenNormalizado = normalizarPlano(origen);

      if (origenNormalizado.includes("CAPILLA")) {
        ui += typeof obtenerMontoServicioUiCapillas === "function"
          ? Number(obtenerMontoServicioUiCapillas(item) || 0)
          : Number(item.precioVenta || 0);
        registrosUi += 1;
      } else if (origenNormalizado.includes("PARQUE")) {
        ui += typeof obtenerMontoServicioUi === "function"
          ? Number(obtenerMontoServicioUi(item) || 0)
          : Number(item.precioTotalServicio || 0);
        registrosUi += 1;
      }
    });

    return {
      total: prevision + ui,
      prevision,
      ui,
      registros: registrosPrevision + registrosUi,
      tieneDatos: registrosPrevision + registrosUi > 0
    };
  }

  function calcularServiciosCapillas(anio, mes, diaFin) {
    let totalCapillas = 0;
    let prevision = 0;
    let ui = 0;

    (window.state.datos.servicios || []).forEach((item) => {
      const fecha = fechaDe(item, ["fechaServicio", "fechaCreacionOrigen", "fechaCreacionOriginal", "fechaFin"]);
      if (!enMesHasta(fecha, anio, mes, diaFin)) return;

      const origen = typeof obtenerOrigenServicio === "function"
        ? String(obtenerOrigenServicio(item) || "")
        : String(item.tipoOrigen || item.origen || "");

      if (!normalizarPlano(origen).includes("CAPILLA")) return;

      totalCapillas += 1;

      if (esCapillasPrevision(item)) prevision += 1;
      if (esCapillasUsoInmediato(item)) ui += 1;
    });

    return {
      totalCapillas,
      prevision,
      ui,
      tieneDatos: totalCapillas > 0
    };
  }

  function esCapillasPrevision(item) {
    if (typeof esServicioCapillasPrevision === "function") {
      return esServicioCapillasPrevision(item);
    }

    const tipo = normalizarPlano(
      item.previsionUsoInmediato || item.prevision_uso_inmediato || item.Prevision_Uso_Inmediato || ""
    );
    return tipo.includes("PREVISION");
  }

  function esCapillasUsoInmediato(item) {
    if (typeof esServicioCapillasUsoInmediato === "function") {
      return esServicioCapillasUsoInmediato(item);
    }

    const tipo = normalizarPlano(
      item.previsionUsoInmediato || item.prevision_uso_inmediato || item.Prevision_Uso_Inmediato || ""
    );
    return tipo.includes("USO INMEDIATO") || tipo === "UI";
  }

  function enMesHasta(fecha, anio, mes, diaFin) {
    return Boolean(
      fecha &&
      fecha.getFullYear() === anio &&
      fecha.getMonth() + 1 === mes &&
      fecha.getDate() >= 1 &&
      fecha.getDate() <= diaFin
    );
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
    if (typeof valor === "number" && Number.isFinite(valor)) {
      return new Date(new Date(1899, 11, 30, 12).getTime() + valor * 86400000);
    }

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

  function nombreMesCapitalizado(numeroMes) {
    const nombre = new Intl.DateTimeFormat("es-MX", { month: "long" }).format(new Date(2020, numeroMes - 1, 1));
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }

  function normalizarPlano(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  }

  function moneda(valor) {
    return typeof formatoMoneda === "function"
      ? formatoMoneda(Number(valor || 0))
      : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor || 0));
  }

  function porcentaje(valor) {
    return new Intl.NumberFormat("es-MX", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(Number(valor || 0));
  }

  function num(valor) {
    return typeof formatoNumero === "function"
      ? formatoNumero(Number(valor || 0))
      : new Intl.NumberFormat("es-MX").format(Number(valor || 0));
  }

  function texto(id, valor) {
    const nodo = document.getElementById(id);
    if (nodo) nodo.textContent = valor;
  }

  window.instalarComparativoInteranualDashboard = instalarComparativoInteranualDashboard;
  window.renderComparativosInteranuales = renderComparativosInteranuales;
  document.addEventListener("DOMContentLoaded", instalarComparativoInteranualDashboard);
})();
