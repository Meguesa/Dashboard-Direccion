async function graphGet(endpoint) {
  const token = await obtenerAccessToken();

  const response = await fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
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

async function obtenerItemsLista(listId, top = 5000) {
  const hostname = CONFIG.sharepoint.siteHostname;
  const sitePath = CONFIG.sharepoint.sitePath;

  const site = await graphGet(`/sites/${hostname}:${sitePath}`);
  const siteId = site.id;

  const endpoint =
    `/sites/${siteId}/lists/${listId}/items?$expand=fields&$top=${top}`;

  const resultado = await graphGet(endpoint);

  return resultado.value || [];
}

async function obtenerIngresosSharePoint() {
  try {
    setAuthStatus("Leyendo BI_Ingresos desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.ingresos.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Ingresos.");
    }

    const items = await obtenerItemsLista(listId);

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


async function cargarDatosSharePoint() {
  try {
    setAuthStatus("Actualizando datos desde SharePoint...");

    await probarConexionSharePoint();

    const listas = await obtenerListasSharePoint();

    const ingresos = await obtenerIngresosSharePoint();
    const egresos = await obtenerEgresosSharePoint();
    const ventas = await obtenerVentasSharePoint();
    const servicios = await obtenerServiciosSharePoint();

    const datos = {
      listas,
      ingresos,
      egresos,
      ventas,
      servicios
    };

    console.log("Datos cargados desde SharePoint:", datos);

    setText(
      "sharePointStatus",
      `Datos actualizados. Ingresos: ${ingresos.length}, Egresos: ${egresos.length}, Ventas: ${ventas.length}, Servicios: ${servicios.length}.`
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

async function obtenerEgresosSharePoint() {
  try {
    setAuthStatus("Leyendo BI_Egresos desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.egresos.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Egresos.");
    }

    const items = await obtenerItemsLista(listId);

    const egresos = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,
        mes: limpiarTexto(f.Mes),
        mesHoja: limpiarTexto(f.Mes_Hoja),
        hojaOrigen: limpiarTexto(f.Hoja_Origen),
        rubro: limpiarTexto(f.Rubro),
        tipoGasto: limpiarTexto(f.Tipo_Gasto),
        beneficiario: limpiarTexto(f.Beneficiario),
        concepto: limpiarTexto(f.Concepto),
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

async function obtenerVentasSharePoint() {
  try {
    setAuthStatus("Leyendo BI_Ventas desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.ventas.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Ventas.");
    }

    const items = await obtenerItemsLista(listId);

    const ventas = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,
        mes: limpiarTexto(f.Mes),
        hojaOrigen: limpiarTexto(f.Hoja_Origen),
        fuente: limpiarTexto(f.Fuente),
        tipoRegistro: limpiarTexto(f.Tipo_Registro),
        asesor: limpiarTexto(f.Asesor),
        numeroContrato: limpiarTexto(f.Numero_Contrato),
        montoVenta: convertirNumero(f.Monto_Venta),
        total: convertirNumero(f.Total),
        precioVenta: convertirNumero(f.Precio_Venta),
        precioTotalServicio: convertirNumero(f.Precio_Total_Servicio)
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

async function obtenerServiciosSharePoint() {
  try {
    setAuthStatus("Leyendo BI_Servicios desde SharePoint...");

    const listId = CONFIG.sharepoint.lists.servicios.listId;

    if (!listId) {
      throw new Error("No está configurado el listId de BI_Servicios.");
    }

    const items = await obtenerItemsLista(listId);

    const servicios = items.map((item) => {
      const f = item.fields || {};

      return {
        id: item.id,
        mes: limpiarTexto(f.Mes),
        origen: limpiarTexto(f.Origen),
        fuente: limpiarTexto(f.Fuente),
        fechaServicio: limpiarTexto(f.Fecha_Servicio),
        tipoServicio: limpiarTexto(f.Tipo_Servicio),
        previsionUsoInmediato: limpiarTexto(f.Prevision_Uso_Inmediato),
        ubicacionServicio: limpiarTexto(f.Ubicacion_Servicio),
        sucursal: limpiarTexto(f.Sucursal),
        sala: limpiarTexto(f.Sala),
        seccion: limpiarTexto(f.Seccion),
        manzana: limpiarTexto(f.Manzana),
        serviciosParque: limpiarTexto(f.Servicios_Parque),
        totalHoras: limpiarTexto(f.Total_Horas),
        ataudUrna: limpiarTexto(f.Ataud_Urna)
      };
    });

    console.log("BI_Servicios leídos:", servicios);
    console.table(servicios.slice(0, 20));

    return servicios;
  } catch (error) {
    console.error("Error leyendo BI_Servicios:", error);
    setAuthStatus("Error al leer BI_Servicios.");
    return [];
  }
}
