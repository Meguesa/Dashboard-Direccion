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
