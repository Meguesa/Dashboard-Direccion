(() => {
  "use strict";

  if (window.__dashboardDailyCalendarActivo) return;
  window.__dashboardDailyCalendarActivo = true;

  const HORA_INICIO = 7;
  const HORA_FIN = 22;
  const MINUTOS_INICIO = HORA_INICIO * 60;
  const MINUTOS_FIN = HORA_FIN * 60;
  const MINUTOS_RANGO = MINUTOS_FIN - MINUTOS_INICIO;

  const FILAS_BASE = [
    { key: "churubusco-sala-1", label: "Capilla Churubusco Sala 1", grupo: "churubusco", sala: 1 },
    { key: "churubusco-sala-2", label: "Capilla Churubusco Sala 2", grupo: "churubusco", sala: 2 },
    { key: "churubusco-sala-3", label: "Capilla Churubusco Sala 3", grupo: "churubusco", sala: 3 },
    { key: "agua-fria-sala-1", label: "Capilla Agua Fría Sala 1", grupo: "agua-fria", sala: 1 },
    { key: "agua-fria-sala-2", label: "Capilla Agua Fría Sala 2", grupo: "agua-fria", sala: 2 },
    { key: "agua-fria-sala-3", label: "Capilla Agua Fría Sala 3", grupo: "agua-fria", sala: 3 },
    { key: "parque", label: "Panteón JdJP", grupo: "parque", sala: null }
  ];

  let observer = null;
  let tooltip = null;
  let renderPendiente = false;

  function iniciar() {
    insertarCalendario();
    instalarTooltip();
    observarActualizaciones();
    programarRender();
  }

  function insertarCalendario() {
    if (document.getElementById("serviciosCalendarioDiarioSection")) return;

    const detalle = document.querySelector(".servicios-dia-detail-section");
    if (!detalle || !detalle.parentNode) return;

    const section = document.createElement("section");
    section.id = "serviciosCalendarioDiarioSection";
    section.className = "servicios-calendario-section";
    section.innerHTML = `
      <article class="card servicios-calendario-card">
        <div class="servicios-calendario-header">
          <div>
            <h2>Calendario diario de servicios</h2>
            <p id="serviciosCalendarioSubtitulo">Horario operativo de 7:00 AM a 10:00 PM.</p>
          </div>
          <div class="servicios-calendario-legend" aria-label="Colores por ubicación">
            <span class="servicios-calendario-legend-item is-churubusco"><i></i>Churubusco</span>
            <span class="servicios-calendario-legend-item is-agua-fria"><i></i>Agua Fría</span>
            <span class="servicios-calendario-legend-item is-parque"><i></i>Panteón</span>
          </div>
        </div>

        <div class="servicios-calendario-scroll" tabindex="0" aria-label="Calendario diario de servicios">
          <div id="serviciosCalendarioGrid" class="servicios-calendario-grid"></div>
        </div>
      </article>
    `;

    detalle.parentNode.insertBefore(section, detalle);
  }

  function observarActualizaciones() {
    const indicador = document.getElementById("serviciosDiaActualizado");
    if (!indicador || observer) return;

    observer = new MutationObserver(() => programarRender());
    observer.observe(indicador, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  function programarRender() {
    if (renderPendiente) return;
    renderPendiente = true;

    window.requestAnimationFrame(() => {
      renderPendiente = false;
      renderCalendario();
    });
  }

  function renderCalendario() {
    insertarCalendario();

    const grid = document.getElementById("serviciosCalendarioGrid");
    if (!grid) return;

    const ahora = new Date();
    const inicioDia = new Date(
      ahora.getFullYear(),
      ahora.getMonth(),
      ahora.getDate(),
      HORA_INICIO,
      0,
      0,
      0
    );
    const finDia = new Date(
      ahora.getFullYear(),
      ahora.getMonth(),
      ahora.getDate(),
      HORA_FIN,
      0,
      0,
      0
    );

    const servicios = obtenerServiciosDia(inicioDia, finDia, ahora);
    const filas = construirFilas(servicios);

    grid.replaceChildren();
    grid.appendChild(crearCabeceraHoras());

    filas.forEach((fila) => {
      grid.appendChild(crearFilaCalendario(fila));
    });

    const subtitulo = document.getElementById("serviciosCalendarioSubtitulo");
    if (subtitulo) {
      const fecha = new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }).format(ahora);
      subtitulo.textContent = `${fecha} · ${servicios.length} servicio${servicios.length === 1 ? "" : "s"} entre 7:00 AM y 10:00 PM.`;
    }
  }

  function crearCabeceraHoras() {
    const header = document.createElement("div");
    header.className = "servicios-calendario-row servicios-calendario-hours-row";

    const esquina = document.createElement("div");
    esquina.className = "servicios-calendario-row-label servicios-calendario-hours-label";
    esquina.textContent = "Ubicación";

    const horas = document.createElement("div");
    horas.className = "servicios-calendario-hours";

    for (let hora = HORA_INICIO; hora <= HORA_FIN; hora += 1) {
      const marca = document.createElement("span");
      const porcentaje = ((hora - HORA_INICIO) / (HORA_FIN - HORA_INICIO)) * 100;
      marca.className = "servicios-calendario-hour-mark";
      marca.style.left = `${porcentaje}%`;
      marca.dataset.edge = hora === HORA_INICIO ? "start" : hora === HORA_FIN ? "end" : "middle";
      marca.textContent = formatearHoraEtiqueta(hora);
      horas.appendChild(marca);
    }

    header.append(esquina, horas);
    return header;
  }

  function construirFilas(servicios) {
    const filas = FILAS_BASE.map((fila) => ({ ...fila, eventos: [] }));
    const mapa = new Map(filas.map((fila) => [fila.key, fila]));

    servicios.forEach((servicio) => {
      let fila = mapa.get(servicio.filaKey);

      if (!fila) {
        fila = {
          key: servicio.filaKey,
          label: servicio.filaLabel,
          grupo: servicio.grupo,
          sala: servicio.sala || null,
          eventos: []
        };
        filas.push(fila);
        mapa.set(fila.key, fila);
      }

      fila.eventos.push(servicio);
    });

    filas.forEach((fila) => {
      fila.eventos.sort((a, b) => a.minutoInicio - b.minutoInicio || a.minutoFin - b.minutoFin);
      asignarCarriles(fila.eventos);
    });

    return filas;
  }

  function asignarCarriles(eventos) {
    const finCarriles = [];

    eventos.forEach((evento) => {
      let carril = finCarriles.findIndex((fin) => fin <= evento.minutoInicio);
      if (carril < 0) carril = finCarriles.length;
      finCarriles[carril] = evento.minutoFin;
      evento.carril = carril;
    });
  }

  function crearFilaCalendario(fila) {
    const row = document.createElement("div");
    row.className = "servicios-calendario-row";

    const label = document.createElement("div");
    label.className = `servicios-calendario-row-label is-${fila.grupo}`;
    label.innerHTML = `<span class="servicios-calendario-location-dot" aria-hidden="true"></span><span>${escaparHtml(fila.label)}</span>`;

    const track = document.createElement("div");
    track.className = "servicios-calendario-track";

    const carriles = Math.max(
      1,
      fila.eventos.reduce((maximo, evento) => Math.max(maximo, (evento.carril || 0) + 1), 1)
    );
    track.style.setProperty("--calendar-lanes", String(carriles));

    fila.eventos.forEach((evento) => {
      const bar = crearBarraServicio(evento);
      track.appendChild(bar);
    });

    row.append(label, track);
    return row;
  }

  function crearBarraServicio(evento) {
    const bar = document.createElement("button");
    bar.type = "button";
    bar.className = `servicios-calendario-bar is-${evento.grupo}`;

    const izquierda = ((evento.minutoInicio - MINUTOS_INICIO) / MINUTOS_RANGO) * 100;
    const ancho = ((evento.minutoFin - evento.minutoInicio) / MINUTOS_RANGO) * 100;

    bar.style.left = `${Math.max(0, izquierda)}%`;
    bar.style.width = `${Math.max(0.45, ancho)}%`;
    bar.style.top = `${8 + ((evento.carril || 0) * 30)}px`;
    bar.dataset.servicioCalendario = "1";
    bar._servicioCalendarioDetalle = evento;

    const texto = evento.titulo || evento.detalle || "Servicio";
    bar.innerHTML = `<span>${escaparHtml(texto)}</span>`;
    bar.setAttribute("aria-label", `${texto}. ${evento.horarioTexto}. ${evento.filaLabel}`);

    bar.addEventListener("mouseenter", mostrarTooltip);
    bar.addEventListener("mousemove", moverTooltip);
    bar.addEventListener("mouseleave", ocultarTooltip);
    bar.addEventListener("focus", mostrarTooltipFoco);
    bar.addEventListener("blur", ocultarTooltip);

    return bar;
  }

  function obtenerServiciosDia(inicioDia, finDia, ahora) {
    const lista = window.state?.datos?.servicios || [];
    const resultado = [];

    lista.forEach((item) => {
      const evento = normalizarServicio(item, inicioDia, finDia, ahora);
      if (evento) resultado.push(evento);
    });

    return resultado;
  }

  function normalizarServicio(item, inicioDia, finDia, ahora) {
    const origen = normalizarTexto(campo(item, ["tipoOrigen", "Tipo_Origen", "TipoOrigen"]));
    if (origen !== "CAPILLAS" && origen !== "PARQUE") return null;

    const inicio = parseFecha(
      campo(item, [
        "fechaServicio",
        "Fecha_Servicio",
        "FechaServicio",
        "fechaCreacionOrigen",
        "Fecha_Creacion_Origen",
        "FechaCreacionOrigen",
        "fechaCreacionOriginal",
        "Fecha_Creacion_Original",
        "FechaCreacionOriginal"
      ])
    );
    if (!inicio) return null;

    const finRegistrado = parseFecha(campo(item, ["fechaFin", "Fecha_Fin", "FechaFin"]));
    let fin = finRegistrado;

    if (!fin || fin <= inicio) {
      const unaHora = new Date(inicio.getTime() + 60 * 60 * 1000);
      if (inicio <= ahora && mismaFecha(inicio, ahora)) {
        fin = new Date(Math.max(unaHora.getTime(), ahora.getTime()));
      } else {
        fin = unaHora;
      }
    }

    if (fin <= inicioDia || inicio >= finDia) return null;

    const inicioVisible = new Date(Math.max(inicio.getTime(), inicioDia.getTime()));
    const finVisible = new Date(Math.min(fin.getTime(), finDia.getTime()));
    if (finVisible <= inicioVisible) return null;

    const ubicacion = campo(item, [
      "ubicacionServicio",
      "Ubicacion_Servicio",
      "UbicacionServicio",
      "sucursal",
      "Sucursal"
    ]);
    const sala = campo(item, ["sala", "Sala"]);
    const ubicacionFila = resolverFila(origen, ubicacion, sala);
    if (!ubicacionFila) return null;

    const finado = campo(item, ["finado", "Finado", "nombreFallecido", "Nombre_Fallecido"]);
    const tipoServicio = campo(item, ["tipoServicio", "Tipo_Servicio", "TipoServicio", "servicio", "Servicio"]);
    const servicioParque = campo(item, ["serviciosParque", "Servicios_Parque", "ServiciosParque"]);
    const loteNicho = campo(item, ["loteNicho", "Lote_Nicho", "LoteNicho", "numLoteNicho", "NumLoteNicho"]);
    const referencia = campo(item, [
      "numeroServicio",
      "Numero_Servicio",
      "numeroReferencia",
      "Numero_Referencia",
      "referenciaContrato",
      "Referencia_Contrato"
    ]);

    const estado = ahora >= inicio && ahora <= fin
      ? "Activo ahora"
      : inicio > ahora
        ? "Programado"
        : "Finalizado";

    return {
      ...ubicacionFila,
      item,
      inicio,
      fin,
      finRegistrado,
      minutoInicio: minutosDesdeMedianoche(inicioVisible),
      minutoFin: minutosDesdeMedianoche(finVisible),
      titulo: finado || servicioParque || tipoServicio || "Servicio",
      detalle: [tipoServicio, servicioParque].filter(Boolean).join(" · ") || "Sin tipo de servicio",
      ubicacionTexto: origen === "PARQUE"
        ? (loteNicho ? `Panteón · ${loteNicho}` : "Panteón JdJP")
        : [ubicacion, sala].filter(Boolean).join(" · "),
      referencia: referencia || "",
      estado,
      horarioTexto: finRegistrado
        ? `${formatearHora(inicio)} - ${formatearHora(finRegistrado)}`
        : `${formatearHora(inicio)} · hora fin no registrada`
    };
  }

  function resolverFila(origen, ubicacion, sala) {
    if (origen === "PARQUE") {
      return {
        filaKey: "parque",
        filaLabel: "Panteón JdJP",
        grupo: "parque",
        sala: null
      };
    }

    const sitio = normalizarTexto(ubicacion);
    const salaTexto = String(sala || "").trim();
    const salaNumeroMatch = normalizarTexto(salaTexto).match(/(?:SALA\s*)?(\d+)/);
    const salaNumero = salaNumeroMatch ? Number(salaNumeroMatch[1]) : null;

    let grupo = "";
    let nombreSitio = "";

    if (sitio.includes("CHURUBUSCO")) {
      grupo = "churubusco";
      nombreSitio = "Churubusco";
    } else if (sitio.includes("AGUA FRIA") || sitio.includes("APODACA")) {
      grupo = "agua-fria";
      nombreSitio = "Agua Fría";
    } else {
      grupo = "capillas-otro";
      nombreSitio = String(ubicacion || "Capillas").trim() || "Capillas";
    }

    const salaKey = salaNumero ? `sala-${salaNumero}` : slug(salaTexto || "sin-sala");
    const salaLabel = salaNumero ? `Sala ${salaNumero}` : (salaTexto || "Sin sala");

    return {
      filaKey: `${grupo}-${salaKey}`,
      filaLabel: `Capilla ${nombreSitio} ${salaLabel}`,
      grupo,
      sala: salaNumero
    };
  }

  function instalarTooltip() {
    if (document.getElementById("serviciosCalendarioTooltip")) {
      tooltip = document.getElementById("serviciosCalendarioTooltip");
      return;
    }

    tooltip = document.createElement("div");
    tooltip.id = "serviciosCalendarioTooltip";
    tooltip.className = "servicios-calendario-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
  }

  function mostrarTooltip(event) {
    const detalle = event.currentTarget?._servicioCalendarioDetalle;
    if (!detalle || !tooltip) return;
    pintarTooltip(detalle);
    tooltip.hidden = false;
    moverTooltip(event);
  }

  function mostrarTooltipFoco(event) {
    const detalle = event.currentTarget?._servicioCalendarioDetalle;
    if (!detalle || !tooltip) return;
    pintarTooltip(detalle);
    tooltip.hidden = false;

    const rect = event.currentTarget.getBoundingClientRect();
    posicionarTooltip(rect.left + rect.width / 2, rect.bottom + 10, true);
  }

  function moverTooltip(event) {
    if (!tooltip || tooltip.hidden) return;
    posicionarTooltip(event.clientX + 14, event.clientY + 16, false);
  }

  function posicionarTooltip(x, y, centrado) {
    if (!tooltip) return;

    const margen = 12;
    const ancho = tooltip.offsetWidth || 320;
    const alto = tooltip.offsetHeight || 180;
    let left = centrado ? x - (ancho / 2) : x;
    let top = y;

    if (left + ancho + margen > window.innerWidth) left = window.innerWidth - ancho - margen;
    if (left < margen) left = margen;
    if (top + alto + margen > window.innerHeight) top = Math.max(margen, y - alto - 28);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function ocultarTooltip() {
    if (!tooltip) return;
    tooltip.hidden = true;
  }

  function pintarTooltip(detalle) {
    tooltip.innerHTML = `
      <div class="servicios-calendario-tooltip-top">
        <span class="servicios-calendario-tooltip-status">${escaparHtml(detalle.estado)}</span>
        <span class="servicios-calendario-tooltip-origin is-${detalle.grupo}">${escaparHtml(nombreGrupo(detalle.grupo))}</span>
      </div>
      <strong class="servicios-calendario-tooltip-title">${escaparHtml(detalle.titulo)}</strong>
      <div class="servicios-calendario-tooltip-row"><span>Ubicación</span><b>${escaparHtml(detalle.ubicacionTexto || detalle.filaLabel)}</b></div>
      <div class="servicios-calendario-tooltip-row"><span>Servicio</span><b>${escaparHtml(detalle.detalle)}</b></div>
      <div class="servicios-calendario-tooltip-row"><span>Horario</span><b>${escaparHtml(detalle.horarioTexto)}</b></div>
      ${detalle.referencia ? `<div class="servicios-calendario-tooltip-row"><span>Referencia</span><b>${escaparHtml(detalle.referencia)}</b></div>` : ""}
    `;
  }

  function nombreGrupo(grupo) {
    if (grupo === "churubusco") return "Churubusco";
    if (grupo === "agua-fria") return "Agua Fría";
    if (grupo === "parque") return "Panteón";
    return "Capillas";
  }

  function campo(item, nombres) {
    for (const nombre of nombres) {
      const valor = item?.[nombre];
      if (valor !== undefined && valor !== null && String(valor).trim() !== "") return valor;
    }
    return "";
  }

  function parseFecha(valor) {
    if (!valor) return null;
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return new Date(valor.getTime());

    if (typeof valor === "number") {
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const fechaExcel = new Date(epoch.getTime() + valor * 86400000);
      return Number.isNaN(fechaExcel.getTime()) ? null : fechaExcel;
    }

    const original = String(valor).trim();
    if (!original) return null;

    const iso = new Date(original);
    if (!Number.isNaN(iso.getTime())) return iso;

    const texto = original
      .replace(/\s+a\.?\s*m\.?/i, " AM")
      .replace(/\s+p\.?\s*m\.?/i, " PM")
      .replace(/\s+a\.m\.?/i, " AM")
      .replace(/\s+p\.m\.?/i, " PM");

    const match = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?)?/i);
    if (!match) return null;

    const dia = Number(match[1]);
    const mes = Number(match[2]) - 1;
    const anio = Number(match[3]);
    let hora = Number(match[4] || 0);
    const minuto = Number(match[5] || 0);
    const periodo = String(match[6] || "").toUpperCase();

    if (periodo === "PM" && hora < 12) hora += 12;
    if (periodo === "AM" && hora === 12) hora = 0;

    const fecha = new Date(anio, mes, dia, hora, minuto, 0, 0);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  function normalizarTexto(valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toUpperCase();
  }

  function slug(valor) {
    return normalizarTexto(valor)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sin-sala";
  }

  function mismaFecha(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function minutosDesdeMedianoche(fecha) {
    return (fecha.getHours() * 60) + fecha.getMinutes();
  }

  function formatearHora(fecha) {
    return new Intl.DateTimeFormat("es-MX", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }).format(fecha);
  }

  function formatearHoraEtiqueta(hora24) {
    const periodo = hora24 >= 12 ? "PM" : "AM";
    let hora = hora24 % 12;
    if (hora === 0) hora = 12;
    return `${hora}:00 ${periodo}`;
  }

  function escaparHtml(valor) {
    return String(valor ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar, { once: true });
  } else {
    iniciar();
  }
})();
