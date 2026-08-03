async function graphGet(endpoint) {
  const token = await obtenerAccessToken();

  const url = endpoint.startsWith("http")
    ? endpoint
    : `https://graph.microsoft.com/v1.0${endpoint}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly"
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph error ${response.status}: ${errorText}`);
  }

  return response.json();
}

async function probarConexionSharePoint() {
  try {
    setAuthStatus("Probando conexión con SharePoint...");

    const hostname = CONFIG.sharepoint.siteHostname;
    const sitePath = CONFIG.sharepoint.sitePath;

    const site = await graphGet(`/sites/${hostname}:${sitePath}`);

    console.log("Sitio SharePoint encontrado:", site);

    setText("sharePointStatus", `Conectado a SharePoint: ${site.displayName || site.name}`);
    setAuthStatus("Conexión con SharePoint correcta.");

    return site;
  } catch (error) {
    console.error("Error conectando con SharePoint:", error);

    setText("sharePointStatus", "Error al conectar con SharePoint. Revisa permisos o configuración.");
    setAuthStatus("Error al conectar con SharePoint.");
  }
}

async function obtenerListasSharePoint() {
  try {
    setAuthStatus("Obteniendo listas de SharePoint...");

    const hostname = CONFIG.sharepoint.siteHostname;
    const sitePath = CONFIG.sharepoint.sitePath;

    const site = await graphGet(`/sites/${hostname}:${sitePath}`);
    const siteId = site.id;

    const resultado = await graphGet(`/sites/${siteId}/lists`);

    console.log("Listas de SharePoint:", resultado.value);

    const listasBI = resultado.value
      .filter((lista) => lista.name && lista.name.startsWith("BI_"))
      .map((lista) => ({
        nombre: lista.name,
        id: lista.id,
        displayName: lista.displayName
      }));

    console.table(listasBI);

    setText(
      "sharePointStatus",
      `Listas BI encontradas: ${listasBI.map((l) => l.nombre).join(", ")}`
    );

    setAuthStatus("Listas de SharePoint obtenidas correctamente.");

    return listasBI;
  } catch (error) {
    console.error("Error obteniendo listas:", error);

    setText(
      "sharePointStatus",
      "Error al obtener listas de SharePoint. Revisa la consola del navegador."
    );

    setAuthStatus("Error al obtener listas de SharePoint.");
  }
}

let graphSiteIdCache = null;

async function obtenerSiteIdSharePoint() {
  if (graphSiteIdCache) {
    return graphSiteIdCache;
  }

  const hostname = CONFIG.sharepoint.siteHostname;
  const sitePath = CONFIG.sharepoint.sitePath;
  const site = await graphGet(`/sites/${hostname}:${sitePath}`);

  graphSiteIdCache = site.id;
  return graphSiteIdCache;
}

async function obtenerItemsLista(listId, top = 5000, opciones = {}) {
  const siteId = await obtenerSiteIdSharePoint();

  let endpoint =
    `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=${top}`;

  if (opciones.filtro) {
    endpoint += `&$filter=${encodeURIComponent(opciones.filtro)}`;
  }

  const items = [];
  let pagina = 1;

  while (endpoint) {
    const resultado = await graphGet(endpoint);
    const paginaItems = resultado.value || [];

    items.push(...paginaItems);

    console.log(
      `Lista ${listId} - página ${pagina}: ${paginaItems.length} registros`
    );

    endpoint = resultado["@odata.nextLink"] || null;
    pagina += 1;
  }

  console.log(`Lista ${listId} - total leído: ${items.length} registros`);

  return items;
}

function obtenerMesesRecargaReciente() {
  const hoy = new Date();
  const mesActual = crearClaveMesDesdeFecha(hoy);
  const fechaMesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const mesAnterior = crearClaveMesDesdeFecha(fechaMesAnterior);

  return Array.from(new Set([mesActual, mesAnterior]));
}

function crearClaveMesDesdeFecha(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");

  return `${anio}-${mes}`;
}

function crearFiltroMesesSharePoint(meses, opciones = {}) {
  const incluirNombreMes = Boolean(opciones.incluirNombreMes);
  const valoresFiltro = [];

  (meses || []).forEach((mes) => {
    const claveMes = limpiarTexto(mes);

    if (!claveMes) {
      return;
    }

    valoresFiltro.push(claveMes);

    if (incluirNombreMes) {
      const nombreMes = obtenerNombreMesDesdeClaveGraph(claveMes);

      if (nombreMes) {
        valoresFiltro.push(nombreMes);
      }
    }
  });

  const valoresUnicos = Array.from(new Set(valoresFiltro));

  if (!valoresUnicos.length) {
    return "";
  }

  return valoresUnicos
    .map((valor) => `fields/Mes eq '${valor.replace(/'/g, "''")}'`)
    .join(" or ");
}

function obtenerNombreMesDesdeClaveGraph(claveMes) {
  const mapaMeses = {
    "01": "ENERO",
    "02": "FEBRERO",
    "03": "MARZO",
    "04": "ABRIL",
    "05": "MAYO",
    "06": "JUNIO",
    "07": "JULIO",
    "08": "AGOSTO",
    "09": "SEPTIEMBRE",
    "10": "OCTUBRE",
    "11": "NOVIEMBRE",
    "12": "DICIEMBRE"
  };

  const partes = limpiarTexto(claveMes).split("-");
  const numeroMes = partes.length >= 2 ? partes[1] : "";

  return mapaMeses[numeroMes] || "";
}

async function obtenerIngresosSharePoint(mesesFiltro = []) {
  try {
    setAuthStatus("Leyendo BI_Ingresos desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.ingresos.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Ingresos.");
    }

    const filtroMeses = crearFiltroMesesSharePoint(mesesFiltro);
    const items = await obtenerItemsLista(listId, 5000, {
      filtro: filtroMeses
    });

    const ingresos = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,
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

    console.log("BI_Ingresos leídos:", ingresos);
    console.table(ingresos.slice(0, 20));

    setText(
      "sharePointStatus",
      `BI_Ingresos leído correctamente: ${ingresos.length} registros`
    );

    setAuthStatus("BI_Ingresos leído correctamente.");

    return ingresos;
  } catch (error) {
    console.error("Error leyendo BI_Ingresos:", error);

    setText(
      "sharePointStatus",
      "Error al leer BI_Ingresos. Revisa la consola del navegador."
    );

    setAuthStatus("Error al leer BI_Ingresos.");
    return [];
  }
}

function limpiarTexto(valor) {
  if (valor === null || valor === undefined) {
    return "";
  }

  return String(valor).trim();
}

function convertirNumero(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return 0;
  }

  if (typeof valor === "number") {
    return valor;
  }

  const texto = String(valor)
    .replace(/[$,]/g, "")
    .trim();

  const numero = Number(texto);

  return Number.isFinite(numero) ? numero : 0;
}

function convertirBooleano(valor) {
  if (valor === true) {
    return true;
  }

  if (valor === false) {
    return false;
  }

  const texto = limpiarTexto(valor).toUpperCase();

  if (!texto) {
    return true;
  }

  return texto === "SI" ||
    texto === "SÍ" ||
    texto === "TRUE" ||
    texto === "YES" ||
    texto === "1";
}

function obtenerCampoSharePoint(fields, nombres) {
  for (const nombre of nombres) {
    if (
      fields &&
      fields[nombre] !== undefined &&
      fields[nombre] !== null &&
      String(fields[nombre]).trim() !== ""
    ) {
      return fields[nombre];
    }
  }

  return "";
}

function obtenerUrlCampoSharePoint(valor) {
  if (!valor) {
    return "";
  }

  if (typeof valor === "string") {
    return valor;
  }

  if (typeof valor === "object") {
    return valor.Url || valor.url || valor.href || "";
  }

  return "";
}

async function cargarDatosSharePoint(opciones = {}) {
  try {
    setAuthStatus("Actualizando datos desde SharePoint...");

    await probarConexionSharePoint();

    const listas = await obtenerListasSharePoint();

    const modoCarga = opciones.modoCarga || "incremental";
    const mesesRecargados = modoCarga === "completa"
      ? []
      : obtenerMesesRecargaReciente();

    const usarFiltroMeses = mesesRecargados.length > 0;

    console.log("Modo carga dashboard:", modoCarga);
    console.log("Meses a recargar:", mesesRecargados);

    const ingresos = await obtenerIngresosSharePoint(usarFiltroMeses ? mesesRecargados : []);
    const egresos = await obtenerEgresosSharePoint(usarFiltroMeses ? mesesRecargados : []);
    const ventas = await obtenerVentasSharePoint(usarFiltroMeses ? mesesRecargados : []);
    const marketing = await obtenerMarketingSharePoint(usarFiltroMeses ? mesesRecargados : []);
    const marketingMedios = await obtenerMarketingMediosSharePoint();
    const marketingRedes = await obtenerMarketingRedesSharePoint();
    const servicios = await obtenerServiciosSharePoint(usarFiltroMeses ? mesesRecargados : []);
    const metasCobranza = await obtenerMetasCobranzaSharePoint(usarFiltroMeses ? mesesRecargados : []);
    const metasVentas = await obtenerMetasVentasSharePoint(usarFiltroMeses ? mesesRecargados : []);
    const alertas = await obtenerAlertasSharePoint(usarFiltroMeses ? mesesRecargados : []);
    const parquePropiedades = await obtenerParquePropiedadesSharePoint();

    const datos = {
      listas,
      ingresos,
      egresos,
      ventas,
      servicios,
      marketing,
      marketingMedios,
      marketingRedes,
      metasCobranza,
      metasVentas,
      alertas,
      parquePropiedades,
      mesesRecargados,
      modoCarga
    };

    console.log("Datos cargados desde SharePoint:", datos);

    setText(
      "sharePointStatus",
      `Datos actualizados. Ingresos: ${ingresos.length}, Egresos: ${egresos.length}, Ventas: ${ventas.length}, Marketing: ${marketing.length}, Servicios: ${servicios.length}, Metas cobranza: ${metasCobranza.length}, Metas ventas: ${metasVentas.length}, Alertas: ${alertas.length}, Propiedades parque: ${parquePropiedades.length}.`
    );

    setAuthStatus("Datos actualizados correctamente.");

    return datos;
  } catch (error) {
    console.error("Error cargando datos desde SharePoint:", error);

    setText(
      "sharePointStatus",
      "Error al actualizar datos desde SharePoint. Revisa la consola."
    );

    setAuthStatus("Error al actualizar datos.");
    return null;
  }
}

async function obtenerEgresosSharePoint(mesesFiltro = []) {
  try {
    setAuthStatus("Leyendo BI_Egresos desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.egresos.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Egresos.");
    }

    const filtroMeses = crearFiltroMesesSharePoint(mesesFiltro);
    const items = await obtenerItemsLista(listId, 5000, {
      filtro: filtroMeses
    });

    const egresos = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,
        fecha: limpiarTexto(f.Fecha),
        fechaPago: limpiarTexto(f.Fecha_Pago),
        mes: limpiarTexto(f.Mes),
        mesHoja: limpiarTexto(f.Mes_Hoja),
        hojaOrigen: limpiarTexto(f.Hoja_Origen),
        banco: limpiarTexto(f.Banco),
        empresa: limpiarTexto(f.Empresa),
        rubro: limpiarTexto(f.Rubro),
        tipoGasto: limpiarTexto(f.Tipo_Gasto),
        beneficiario: limpiarTexto(f.Beneficiario),
        concepto: limpiarTexto(f.Concepto),
        contexto: limpiarTexto(f.Contexto),
        importe: convertirNumero(f.Importe),
        pagado: convertirNumero(f.Pagado),
        porPagar: convertirNumero(f.Por_Pagar),
        fuente: limpiarTexto(f.Fuente)
      };
    });

    console.log("BI_Egresos leídos:", egresos);
    console.table(egresos.slice(0, 20));

    return egresos;
  } catch (error) {
    console.error("Error leyendo BI_Egresos:", error);
    setAuthStatus("Error al leer BI_Egresos.");
    return [];
  }
}

async function obtenerVentasSharePoint(mesesFiltro = []) {
  try {
    setAuthStatus("Leyendo BI_Ventas desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.ventas.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Ventas.");
    }

    const filtroMeses = crearFiltroMesesSharePoint(mesesFiltro, {
      incluirNombreMes: true
    });
    const items = await obtenerItemsLista(listId, 5000, {
      filtro: filtroMeses
    });

    const ventas = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,
        fecha: limpiarTexto(f.Fecha),
        mes: limpiarTexto(f.Mes),
        asesor: limpiarTexto(f.Asesor),
        semana: limpiarTexto(f.Semana),
        sucursal: limpiarTexto(f.Sucursal),
        montoVenta: convertirNumero(f.Monto_Venta),
        serviciosAf: convertirNumero(f.Servicios_AF),
        serviciosCh: convertirNumero(f.Servicios_CH),
        tsTsc: convertirNumero(f.TS_TSC),
        propiedades: convertirNumero(f.Propiedades),
        nichos: convertirNumero(f.Nichos),
        totalUnidades: convertirNumero(f.Total_Unidades),
        metaMensual: convertirNumero(f.Meta_Mensual || f.Meta_x005f_Mensual || f.MetaMensual),
        tipoRegistro: limpiarTexto(f.Tipo_Registro),
        fuente: limpiarTexto(f.Fuente),
        hojaOrigen: limpiarTexto(f.Hoja_Origen),
        numeroContrato: limpiarTexto(f.Numero_Contrato),
        referencia: limpiarTexto(f.Referencia),
        cliente: limpiarTexto(f.Cliente),
        nombre: limpiarTexto(f.Nombre),
        apellidoPaterno: limpiarTexto(f.Apellido_Paterno),
        apellidoMaterno: limpiarTexto(f.Apellido_Materno),
        tipoServicio: limpiarTexto(f.Tipo_Servicio),
        total: convertirNumero(f.Total),
        fechaContrato: limpiarTexto(f.Fecha_Contrato),
        mensualidad: convertirNumero(f.Mensualidad),
        tipoContrato: limpiarTexto(f.Tipo_Contrato)
      };
    });

    console.log("BI_Ventas leídas:", ventas);
    console.table(ventas.slice(0, 20));

    return ventas;
  } catch (error) {
    console.error("Error leyendo BI_Ventas:", error);
    setAuthStatus("Error al leer BI_Ventas.");
    return [];
  }
}

async function obtenerServiciosSharePoint(mesesFiltro = []) {
  try {
    setAuthStatus("Leyendo BI_Servicios desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.servicios.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Servicios.");
    }

    const filtroMeses = crearFiltroMesesSharePoint(mesesFiltro);
    const items = await obtenerItemsLista(listId, 5000, {
      filtro: filtroMeses
    });

    const servicios = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,
      
        numeroServicio: limpiarTexto(obtenerCampoSharePoint(f, [
          "Numero_Servicio",
          "Numero_x005f_Servicio",
          "NumeroServicio",
          "Numero_x0020_Servicio"
        ])),
      
        numeroReferencia: limpiarTexto(obtenerCampoSharePoint(f, [
          "Numero_Referencia",
          "Numero_x005f_Referencia",
          "NumeroReferencia",
          "Numero_x0020_de_x0020_Referencia",
          "Numero_x0020_Referencia"
        ])),
      
        mes: limpiarTexto(obtenerCampoSharePoint(f, [
          "Mes"
        ])),
      
        fechaServicio: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fecha_Servicio",
          "Fecha_x005f_Servicio",
          "FechaServicio",
          "Fecha_x0020_Servicio"
        ])),
      
        fechaFin: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fecha_Fin",
          "Fecha_x005f_Fin",
          "FechaFin",
          "Fecha_x0020_Fin"
        ])),
      
        fechaCreacionOrigen: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fecha_Creacion_Origen",
          "Fecha_x005f_Creacion_x005f_Origen",
          "FechaCreacionOrigen",
          "Fecha_x0020_Creacion_x0020_Origen"
        ])),

        fechaCreacionOriginal: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fecha_Creacion_Original",
          "Fecha_x005f_Creacion_x005f_Original",
          "FechaCreacionOriginal",
          "Fecha_x0020_Creacion_x0020_Original"
        ])),

        titular: limpiarTexto(obtenerCampoSharePoint(f, [
          "Titular"
        ])),
      
        finado: limpiarTexto(obtenerCampoSharePoint(f, [
          "Finado"
        ])),
      
        previsionUsoInmediato: limpiarTexto(obtenerCampoSharePoint(f, [
          "Prevision_Uso_Inmediato",
          "Prevision_x005f_Uso_x005f_Inmediato",
          "PrevisionUsoInmediato",
          "Previsi_x00f3_n_x005f_Uso_x005f_Inmediato"
        ])),
      
        sucursal: limpiarTexto(obtenerCampoSharePoint(f, [
          "Sucursal"
        ])),
      
        origen: limpiarTexto(obtenerCampoSharePoint(f, [
          "Origen"
        ])),
      
        tipoOrigen: limpiarTexto(obtenerCampoSharePoint(f, [
          "Tipo_Origen",
          "Tipo_x005f_Origen",
          "TipoOrigen",
          "Tipo_x0020_Origen"
        ])),
      
        ubicacionServicio: limpiarTexto(obtenerCampoSharePoint(f, [
          "Ubicacion_Servicio",
          "Ubicacion_x005f_Servicio",
          "UbicacionServicio",
          "Ubicaci_x00f3_n_x005f_Servicio",
          "Ubicaci_x00f3_n_Servicio"
        ])),
      
        sala: limpiarTexto(obtenerCampoSharePoint(f, [
          "Sala"
        ])),
      
        tipoServicio: limpiarTexto(obtenerCampoSharePoint(f, [
          "Tipo_Servicio",
          "Tipo_x005f_Servicio",
          "TipoServicio",
          "Tipo_x0020_Servicio"
        ])),
      
        serviciosParque: limpiarTexto(obtenerCampoSharePoint(f, [
          "Servicios_Parque",
          "Servicios_x005f_Parque",
          "ServiciosParque",
          "Servicio_Parque",
          "Servicio_x005f_Parque"
        ])),
      
        loteNicho: limpiarTexto(obtenerCampoSharePoint(f, [
          "Lote_Nicho",
          "Lote_x005f_Nicho",
          "LoteNicho",
          "NumLote_Nicho",
          "NumLote_x005f_Nicho",
          "NumLoteNicho"
        ])),
      
        seccion: limpiarTexto(obtenerCampoSharePoint(f, [
          "Seccion",
          "Sección"
        ])),
      
        manzana: limpiarTexto(obtenerCampoSharePoint(f, [
          "Manzana"
        ])),
      
        numLoteNicho: limpiarTexto(obtenerCampoSharePoint(f, [
          "NumLote_Nicho",
          "NumLote_x005f_Nicho",
          "NumLoteNicho"
        ])),
      
        estatus: limpiarTexto(obtenerCampoSharePoint(f, [
          "Estatus"
        ])),
      
        referenciaContrato: limpiarTexto(obtenerCampoSharePoint(f, [
          "Referencia_Contrato",
          "Referencia_x005f_Contrato",
          "ReferenciaContrato"
        ])),
      
        responsable: limpiarTexto(obtenerCampoSharePoint(f, [
          "Responsable"
        ])),
      
        fuente: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fuente"
        ])),
      
        asesor: limpiarTexto(obtenerCampoSharePoint(f, [
          "Asesor"
        ])),
      
        embalsamador: limpiarTexto(obtenerCampoSharePoint(f, [
          "Embalsamador"
        ])),
      
        estatusLiquidacion: limpiarTexto(obtenerCampoSharePoint(f, [
          "Estatus_Liquidacion",
          "Estatus_x005f_Liquidacion",
          "EstatusLiquidacion"
        ])),
      
        precioVenta: convertirNumero(obtenerCampoSharePoint(f, [
          "Precio_Venta",
          "Precio_x005f_Venta",
          "PrecioVenta"
        ])),
      
        precioTotalServicio: convertirNumero(obtenerCampoSharePoint(f, [
          "Precio_Total_Servicio",
          "Precio_x005f_Total_x005f_Servicio",
          "PrecioTotalServicio"
        ])),
      
        tellmebyeEstatus: limpiarTexto(obtenerCampoSharePoint(f, [
          "TellmebyeEstatus"
        ])),
      
        placaEstatus: limpiarTexto(obtenerCampoSharePoint(f, [
          "PlacaEstatus"
        ])),
      
        observaciones: limpiarTexto(obtenerCampoSharePoint(f, [
          "Observaciones"
        ]))
      };
    });

    console.log("BI_Servicios leídos:", servicios);
    console.table(servicios.slice(0, 20));

    console.table(
      servicios
        .filter((item) => item.tipoOrigen === "Capillas" || item.tipoOrigen === "Parque")
        .slice(0, 30)
        .map((item) => ({
          mes: item.mes,
          tipoOrigen: item.tipoOrigen,
          finado: item.finado,
          fechaServicio: item.fechaServicio,
          fechaFin: item.fechaFin,
          ubicacionServicio: item.ubicacionServicio,
          sala: item.sala,
          tipoServicio: item.tipoServicio,
          loteNicho: item.loteNicho
        }))
    );
    
    return servicios;
  } catch (error) {
    console.error("Error leyendo BI_Servicios:", error);
    setAuthStatus("Error al leer BI_Servicios.");
    return [];
  }
}

async function obtenerMetasCobranzaSharePoint(mesesFiltro = []) {
  try {
    setAuthStatus("Leyendo BI_Metas_Cobranza desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.metasCobranza.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Metas_Cobranza.");
    }

    const filtroMeses = crearFiltroMesesSharePoint(mesesFiltro);
    const items = await obtenerItemsLista(listId, 5000, {
      filtro: filtroMeses
    });

    const metasCobranza = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,
        mes: limpiarTexto(f.Mes),
        area: limpiarTexto(f.Area || f.Title),
        metaMensual: convertirNumero(
          f.Meta_Mensual ||
          f.Meta_x005f_Mensual ||
          f.MetaMensual ||
          f.Meta_x0020_Mensual
        ),
        activo: convertirBooleano(f.Activo)
      };
    });

    console.log("BI_Metas_Cobranza leídas:", metasCobranza);
    console.table(metasCobranza);

    return metasCobranza;
  } catch (error) {
    console.error("Error leyendo BI_Metas_Cobranza:", error);

    setText(
      "sharePointStatus",
      "Error al leer BI_Metas_Cobranza. Revisa la consola del navegador."
    );

    return [];
  }
}

async function obtenerAlertasSharePoint(mesesFiltro = []) {
  try {
    setAuthStatus("Leyendo BI_Alertas desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.alertas.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Alertas.");
    }

    const filtroMeses = crearFiltroMesesSharePoint(mesesFiltro);
    const items = await obtenerItemsLista(listId, 5000, {
      filtro: filtroMeses
    });

    const alertas = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,

        titulo: limpiarTexto(obtenerCampoSharePoint(f, [
          "Title"
        ])),

        modulo: limpiarTexto(obtenerCampoSharePoint(f, [
          "Modulo",
          "M_x00f3_dulo"
        ])),

        prioridad: limpiarTexto(obtenerCampoSharePoint(f, [
          "Prioridad"
        ])),

        tipoAlerta: limpiarTexto(obtenerCampoSharePoint(f, [
          "Tipo_Alerta",
          "Tipo_x005f_Alerta",
          "TipoAlerta",
          "Tipo_x0020_Alerta"
        ])),

        mensaje: limpiarTexto(obtenerCampoSharePoint(f, [
          "Mensaje"
        ])),

        mes: limpiarTexto(obtenerCampoSharePoint(f, [
          "Mes"
        ])),

        fechaDeteccion: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fecha_Deteccion",
          "Fecha_x005f_Deteccion",
          "FechaDeteccion",
          "Fecha_x0020_Deteccion"
        ])),

        responsable: limpiarTexto(obtenerCampoSharePoint(f, [
          "Responsable"
        ])),

        estatus: limpiarTexto(obtenerCampoSharePoint(f, [
          "Estatus",
          "Status"
        ])),

        valorActual: convertirNumero(obtenerCampoSharePoint(f, [
          "Valor_Actual",
          "Valor_x005f_Actual",
          "ValorActual",
          "Valor_x0020_Actual"
        ])),

        valorReferencia: convertirNumero(obtenerCampoSharePoint(f, [
          "Valor_Referencia",
          "Valor_x005f_Referencia",
          "ValorReferencia",
          "Valor_x0020_Referencia"
        ])),

        porcentaje: convertirNumero(obtenerCampoSharePoint(f, [
          "Porcentaje"
        ])),

        fuente: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fuente"
        ])),

        linkDashboard: obtenerUrlCampoSharePoint(obtenerCampoSharePoint(f, [
          "Link_Dashboard",
          "Link_x005f_Dashboard",
          "LinkDashboard",
          "Link_x0020_Dashboard"
        ]))
      };
    });

    console.log("BI_Alertas leídas:", alertas);
    console.table(alertas);

    return alertas;
  } catch (error) {
    console.error("Error leyendo BI_Alertas:", error);

    setText(
      "sharePointStatus",
      "Error al leer BI_Alertas. Revisa la consola del navegador."
    );

    setAuthStatus("Error al leer BI_Alertas.");
    return [];
  }
}

async function obtenerMetasVentasSharePoint(mesesFiltro = []) {
  try {
    setAuthStatus("Leyendo BI_Metas_Ventas desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.metasVentas.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Metas_Ventas.");
    }

    const filtroMeses = crearFiltroMesesSharePoint(mesesFiltro);
    const items = await obtenerItemsLista(listId, 5000, {
      filtro: filtroMeses
    });

    const metasVentas = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,

        title: limpiarTexto(obtenerCampoSharePoint(f, [
          "Title"
        ])),

        anio: limpiarTexto(obtenerCampoSharePoint(f, [
          "Anio",
          "A_x00f1_o",
          "Ano"
        ])),

        mes: limpiarTexto(obtenerCampoSharePoint(f, [
          "Mes"
        ])),

        nombreMes: limpiarTexto(obtenerCampoSharePoint(f, [
          "Nombre_Mes",
          "Nombre_x005f_Mes",
          "NombreMes",
          "Nombre_x0020_Mes"
        ])),

        metaVentaTotal: convertirNumero(obtenerCampoSharePoint(f, [
          "Meta_Venta_Total",
          "Meta_x005f_Venta_x005f_Total",
          "MetaVentaTotal",
          "Meta_x0020_Venta_x0020_Total"
        ])),

        metaPrevision: convertirNumero(obtenerCampoSharePoint(f, [
          "Meta_Prevision",
          "Meta_x005f_Prevision",
          "MetaPrevision",
          "Meta_x0020_Prevision"
        ])),

        metaUsoInmediato: convertirNumero(obtenerCampoSharePoint(f, [
          "Meta_Uso_Inmediato",
          "Meta_x005f_Uso_x005f_Inmediato",
          "MetaUsoInmediato",
          "Meta_x0020_Uso_x0020_Inmediato"
        ])),

        metaUsoInmediatoCapillas: convertirNumero(obtenerCampoSharePoint(f, [
          "Meta_Uso_Inmediato",
          "Meta_x005f_Uso_x005f_Inmediato",
          "MetaUsoInmediato",
          "Meta_x0020_Uso_x0020_Inmediato",
          "Meta_Uso_Inmediato_Capillas",
          "Meta_x005f_Uso_x005f_Inmediato_x005f_Capillas",
          "MetaUsoInmediatoCapillas",
          "Meta_x0020_Uso_x0020_Inmediato_x0020_Capillas"
        ])),

        activo: convertirBooleano(obtenerCampoSharePoint(f, [
          "Activo"
        ])),

        fuente: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fuente"
        ]))
      };
    });

    console.log("BI_Metas_Ventas leídas:", metasVentas);
    console.table(metasVentas);

    return metasVentas;
  } catch (error) {
    console.error("Error leyendo BI_Metas_Ventas:", error);

    setText(
      "sharePointStatus",
      "Error al leer BI_Metas_Ventas. Revisa la consola del navegador."
    );

    setAuthStatus("Error al leer BI_Metas_Ventas.");
    return [];
  }
}

async function obtenerParquePropiedadesSharePoint() {
  try {
    setAuthStatus("Leyendo BI_Parque_Propiedades desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.parquePropiedades.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Parque_Propiedades.");
    }

    const items = await obtenerItemsLista(listId, 5000);

    const parquePropiedades = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,

        title: limpiarTexto(obtenerCampoSharePoint(f, [
          "Title"
        ])),

        tipoPropiedad: limpiarTexto(obtenerCampoSharePoint(f, [
          "Tipo_Propiedad",
          "Tipo_x005f_Propiedad",
          "TipoPropiedad"
        ])),

        categoria: limpiarTexto(obtenerCampoSharePoint(f, [
          "Categoria",
          "Categor_x00ed_a"
        ])),
        

        numeroConstruido: convertirNumero(obtenerCampoSharePoint(f, [
          "Numero_Construido",
          "Numero_x005f_Construido",
          "NumeroConstruido"
        ])),


        numeroNoConstruido: convertirNumero(obtenerCampoSharePoint(f, [
          "Numero_No_Construido",
          "Numero_x005f_No_x005f_Construido",
          "NumeroNoConstruido"
        ])),

        
        numeroProyectado: convertirNumero(obtenerCampoSharePoint(f, [
          "Numero_Proyectado",
          "Numero_x005f_Proyectado",
          "NumeroProyectado"
        ])),


        numeroVendido: convertirNumero(obtenerCampoSharePoint(f, [
          "Numero_Vendido",
          "Numero_x005f_Vendido",
          "NumeroVendido"
        ])),

        numeroUsado: convertirNumero(obtenerCampoSharePoint(f, [
          "Numero_Usado",
          "Numero_x005f_Usado",
          "NumeroUsado"
        ])),

        numeroDisponible: convertirNumero(obtenerCampoSharePoint(f, [
          "Numero_Disponible",
          "Numero_x005f_Disponible",
          "NumeroDisponible"
        ])),


        numeroSeparado: convertirNumero(obtenerCampoSharePoint(f, [
          "Numero_Separado",
          "Numero_x005f_Separado",
          "NumeroSeparado"
        ])),

        numeroSuspendido: convertirNumero(obtenerCampoSharePoint(f, [
          "Numero_Suspendido",
          "Numero_x005f_Suspendido",
          "NumeroSuspendido"
        ])),

        
        porcentajeVendido: convertirNumero(obtenerCampoSharePoint(f, [
          "Porcentaje_Vendido",
          "Porcentaje_x005f_Vendido",
          "PorcentajeVendido"
        ])),

        porcentajeUsado: convertirNumero(obtenerCampoSharePoint(f, [
          "Porcentaje_Usado",
          "Porcentaje_x005f_Usado",
          "PorcentajeUsado"
        ])),

        fuente: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fuente"
        ])),

        fechaActualizacion: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fecha_Actualizacion",
          "Fecha_x005f_Actualizacion",
          "FechaActualizacion"
        ]))
      };
    });

    console.log("BI_Parque_Propiedades leído:", parquePropiedades);
    console.table(parquePropiedades);

    return parquePropiedades;
  } catch (error) {
    console.error("Error leyendo BI_Parque_Propiedades:", error);
    setAuthStatus("Error al leer BI_Parque_Propiedades.");
    return [];
  }
}

async function obtenerMarketingSharePoint(mesesFiltro = []) {
  try {
    setAuthStatus("Leyendo BI_Marketing desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.marketing.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Marketing.");
    }

    const filtroMeses = crearFiltroMesesSharePoint(mesesFiltro);

    const items = await obtenerItemsLista(listId, 5000, {
      filtro: filtroMeses
    });

    const marketing = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,

        title: limpiarTexto(obtenerCampoSharePoint(f, [
          "Title"
        ])),

        anio: convertirNumero(obtenerCampoSharePoint(f, [
          "Anio",
          "A_x00f1_o",
          "Ano"
        ])),

        mes: limpiarTexto(obtenerCampoSharePoint(f, [
          "Mes"
        ])),

        nombreMes: limpiarTexto(obtenerCampoSharePoint(f, [
          "Nombre_Mes",
          "Nombre_x005f_Mes",
          "NombreMes",
          "Nombre_x0020_Mes"
        ])),

        leadsGenerados: convertirNumero(obtenerCampoSharePoint(f, [
          "Leads_Generados",
          "Leads_x005f_Generados",
          "LeadsGenerados"
        ])),

        leadsEfectivos: convertirNumero(obtenerCampoSharePoint(f, [
          "Leads_Efectivos",
          "Leads_x005f_Efectivos",
          "LeadsEfectivos"
        ])),

        conversionLeads: convertirNumero(obtenerCampoSharePoint(f, [
          "Conversion_Leads",
          "Conversion_x005f_Leads",
          "ConversionLeads"
        ])),

        numeroVentas: convertirNumero(obtenerCampoSharePoint(f, [
          "Numero_Ventas",
          "Numero_x005f_Ventas",
          "NumeroVentas",
          "N_x00fa_mero_Ventas"
        ])),

        ventaTotalDigital: convertirNumero(obtenerCampoSharePoint(f, [
          "Venta_Total_Digital",
          "Venta_x005f_Total_x005f_Digital",
          "VentaTotalDigital"
        ])),

        inversionTotalDigital: convertirNumero(obtenerCampoSharePoint(f, [
          "Inversion_Total_Digital",
          "Inversion_x005f_Total_x005f_Digital",
          "InversionTotalDigital",
          "Inversi_x00f3_n_Total_Digital"
        ])),

        costoPorLead: convertirNumero(obtenerCampoSharePoint(f, [
          "Costo_Por_Lead",
          "Costo_x005f_Por_x005f_Lead",
          "CostoPorLead"
        ])),

        costoPorVenta: convertirNumero(obtenerCampoSharePoint(f, [
          "Costo_Por_Venta",
          "Costo_x005f_Por_x005f_Venta",
          "CostoPorVenta"
        ])),

        roi: convertirNumero(obtenerCampoSharePoint(f, [
          "ROI"
        ])),

        fuente: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fuente"
        ])),

        claveRegistro: limpiarTexto(obtenerCampoSharePoint(f, [
          "Clave_Registro",
          "Clave_x005f_Registro",
          "ClaveRegistro"
        ])),

        fechaCarga: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fecha_Carga",
          "Fecha_x005f_Carga",
          "FechaCarga"
        ])),

        fechaActualizacion: limpiarTexto(obtenerCampoSharePoint(f, [
          "Fecha_Actualizacion",
          "Fecha_x005f_Actualizacion",
          "FechaActualizacion"
        ]))
      };
    });

    console.log("BI_Marketing leído:", marketing);
    console.table(marketing);

    return marketing;
  } catch (error) {
    console.error("Error leyendo BI_Marketing:", error);

    setText(
      "sharePointStatus",
      "Error al leer BI_Marketing. Revisa la consola del navegador."
    );

    setAuthStatus("Error al leer BI_Marketing.");
    return [];
  }
}

async function obtenerMarketingMediosSharePoint() {
  try {
    setAuthStatus("Leyendo BI_Marketing_Medios desde SharePoint...");

    const configuracionLista = CONFIG.sharepoint.lists.marketingMedios;
    const listId = configuracionLista?.listId;

    if (!listId) {
      throw new Error(
        "No está configurado el listId de BI_Marketing_Medios."
      );
    }

    const items = await obtenerItemsLista(listId, 5000);

    const marketingMedios = items.map((item) => {
      const f = item.fields || {};

      /*
        Nombres internos reales de SharePoint:

        field_1  = Anio
        field_2  = Mes
        field_3  = Nombre_Mes
        field_4  = Medio
        field_5  = Leads_Generados
        field_6  = Leads_Efectivos
        field_7  = Conversion_Leads
        field_8  = Numero_Ventas
        field_9  = Venta_Total_Digital
        field_10 = Inversion_Total_Digital
        field_11 = Costo_Por_Lead
        field_12 = Costo_Por_Venta
        field_13 = ROI
        field_14 = Fuente
        field_15 = Clave_Registro
        field_16 = Fecha_Carga
        field_17 = Fecha_Actualizacion
      */

      const anio = convertirNumero(f.field_1);
      const mesOriginal = limpiarTexto(f.field_2);
      const nombreMes = limpiarTexto(f.field_3);

      return {
        id: item.id,

        title: limpiarTexto(f.Title),

        anio,

        mes: crearClaveMesMarketing(
          anio,
          mesOriginal,
          nombreMes
        ),

        nombreMes,

        medio: limpiarTexto(f.field_4),

        leadsGenerados: convertirNumero(f.field_5),

        leadsEfectivos: convertirNumero(f.field_6),

        conversionLeads: convertirNumero(f.field_7),

        numeroVentas: convertirNumero(f.field_8),

        ventaTotalDigital: convertirNumero(f.field_9),

        inversionTotalDigital: convertirNumero(f.field_10),

        costoPorLead: convertirNumero(f.field_11),

        costoPorVenta: convertirNumero(f.field_12),

        roi: convertirNumero(f.field_13),

        fuente: limpiarTexto(f.field_14),

        claveRegistro: limpiarTexto(f.field_15),

        fechaCarga: limpiarTexto(f.field_16),

        fechaActualizacion: limpiarTexto(f.field_17)
      };
    });

    console.log(
      "BI_Marketing_Medios leído:",
      marketingMedios
    );

    console.table(marketingMedios);

    return marketingMedios;
  } catch (error) {
    console.error(
      "Error leyendo BI_Marketing_Medios:",
      error
    );

    setAuthStatus(
      "Error al leer BI_Marketing_Medios."
    );

    return [];
  }
}

async function obtenerMarketingRedesSharePoint() {
  try {
    setAuthStatus("Leyendo BI_Marketing_Redes desde SharePoint...");

    const configuracionLista = CONFIG.sharepoint.lists.marketingRedes;
    const listId = configuracionLista?.listId;

    if (!listId) {
      throw new Error(
        "No está configurado el listId de BI_Marketing_Redes."
      );
    }

    const items = await obtenerItemsLista(listId, 5000);

    const marketingRedes = items.map((item) => {
      const f = item.fields || {};

      /*
        Nombres internos reales de SharePoint:

        field_1  = Anio
        field_2  = Mes
        field_3  = Nombre_Mes
        field_4  = Red
        field_5  = Alcance_Total
        field_6  = Interacciones
        field_7  = Seguidores_Ganados
        field_8  = Visualizaciones
        field_9  = Tasa_Engagement
        field_10 = Fuente
        field_11 = Clave_Registro
        field_12 = Fecha_Carga
        field_13 = Fecha_Actualizacion
      */

      const anio = convertirNumero(f.field_1);
      const mesOriginal = limpiarTexto(f.field_2);
      const nombreMes = limpiarTexto(f.field_3);

      return {
        id: item.id,

        title: limpiarTexto(f.Title),

        anio,

        mes: crearClaveMesMarketing(
          anio,
          mesOriginal,
          nombreMes
        ),

        nombreMes,

        red: limpiarTexto(f.field_4),

        alcanceTotal: convertirNumero(f.field_5),

        interacciones: convertirNumero(f.field_6),

        seguidoresGanados: convertirNumero(f.field_7),

        visualizaciones: convertirNumero(f.field_8),

        tasaEngagement: convertirNumero(f.field_9),

        fuente: limpiarTexto(f.field_10),

        claveRegistro: limpiarTexto(f.field_11),

        fechaCarga: limpiarTexto(f.field_12),

        fechaActualizacion: limpiarTexto(f.field_13)
      };
    });

    console.log(
      "BI_Marketing_Redes leído:",
      marketingRedes
    );

    console.table(marketingRedes);

    return marketingRedes;
  } catch (error) {
    console.error(
      "Error leyendo BI_Marketing_Redes:",
      error
    );

    setAuthStatus(
      "Error al leer BI_Marketing_Redes."
    );

    return [];
  }
}

function crearClaveMesMarketing(
  anioValor,
  mesValor,
  nombreMesValor
) {
  const mesTexto = limpiarTexto(mesValor).toUpperCase();

  /*
    Si ya viene en formato 2026-01,
    no es necesario transformarlo.
  */
  if (/^\d{4}-\d{2}$/.test(mesTexto)) {
    return mesTexto;
  }

  const anioNumero = convertirNumero(anioValor);
  const anio = anioNumero > 0
    ? String(Math.trunc(anioNumero))
    : "";

  if (!anio) {
    return "";
  }

  let numeroMes = "";

  /*
    Casos: 1, 01, 2, 02...
  */
  if (/^\d{1,2}$/.test(mesTexto)) {
    const numero = Number(mesTexto);

    if (numero >= 1 && numero <= 12) {
      numeroMes = String(numero).padStart(2, "0");
    }
  }

  /*
    Casos: ENERO, FEBRERO...
  */
  if (!numeroMes) {
    const nombreNormalizado = limpiarTexto(
      nombreMesValor || mesValor
    )
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    const mapaMeses = {
      ENERO: "01",
      FEBRERO: "02",
      MARZO: "03",
      ABRIL: "04",
      MAYO: "05",
      JUNIO: "06",
      JULIO: "07",
      AGOSTO: "08",
      SEPTIEMBRE: "09",
      OCTUBRE: "10",
      NOVIEMBRE: "11",
      DICIEMBRE: "12"
    };

    numeroMes = mapaMeses[nombreNormalizado] || "";
  }

  return numeroMes
    ? `${anio}-${numeroMes}`
    : "";
}