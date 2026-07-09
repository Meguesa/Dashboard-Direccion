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
