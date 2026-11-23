#!/usr/bin/env python3
"""Parche quirurgico del calendario sobre archivos reales descargados del servidor.
No despliega; deja intacto el respaldo y falla ante cambios no reconocidos."""
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parents[1]
REFERENCE = ROOT / "cpanel-preview-20261105" / "dashboard-egresos-preview"
FILES = ("app.js", "graph.js", "dashboard-daily-calendar.js", "index.php")
VERSION = "20261123-agenda-capillas-directa-1"


def exact(s, old, new, label):
    n = s.count(old)
    if n != 1:
        raise ValueError(f"{label}: {n} anclajes; despliegue CANCELADO")
    return s.replace(old, new, 1)


def graph_function():
    s = (REFERENCE / "graph.js").read_text(encoding="utf-8")
    marker = "async function obtenerAgendaCapillasOperacionesSeguro() {"
    if s.count(marker) != 1: raise ValueError("No existe lector QA validado")
    return s[s.index(marker):].strip() + "\n"


def app_function():
    s = (REFERENCE / "app.js").read_text(encoding="utf-8")
    marker = "window.obtenerServiciosAgendaDia = function () {"
    if s.count(marker) != 1: raise ValueError("No existe union QA validada")
    start = s.index(marker)
    end = s.index("\n};", start) + 3
    return s[start:end] + "\n"


def patch_graph(s):
    if "async function obtenerAgendaCapillasOperacionesSeguro()" in s:
        raise ValueError("La lectura directa ya existe; no aplicar dos veces")
    old = "    const servicios = await obtenerServiciosSharePoint(usarFiltroMeses ? mesesRecargados : []);"
    s = exact(s, old, old + "\n    const agendaCapillasOperaciones = await obtenerAgendaCapillasOperacionesSeguro();", "graph load")
    s = exact(s, "      servicios,\n      marketing,",
        "      servicios,\n      agendaCapillasOperaciones: agendaCapillasOperaciones.servicios,\n"
        "      agendaCapillasError: agendaCapillasOperaciones.error,\n      marketing,", "graph data")
    return s.rstrip() + "\n\n" + graph_function()


def patch_app(s):
    if "window.obtenerServiciosAgendaDia = function" in s:
        raise ValueError("La union ya existe; no aplicar dos veces")
    s = exact(s, "const state = window.state;", "const state = window.state;\n\n" + app_function(), "app source")
    pattern = re.compile(
        r"    state\.datos\.servicios = reemplazarRegistrosPorMes\(\s*\n"
        r"\s*state\.datos\.servicios,\s*\n\s*datosSharePoint\.servicios \|\| \[\],\s*\n"
        r"\s*mesesRecargados\s*\n\s*\);\s*\n")
    matches = list(pattern.finditer(s))
    if len(matches) != 1:
        raise ValueError(f"app service assignment: {len(matches)} anclajes; cancelar")
    m = matches[0]
    s = s[:m.end()] + (
        "    state.datos.agendaCapillasOperaciones = datosSharePoint.agendaCapillasOperaciones || [];\n"
        '    state.datos.agendaCapillasError = datosSharePoint.agendaCapillasError || "";\n\n'
    ) + s[m.end():]
    return exact(s,
        "function renderServiciosDelDia() {\n  const servicios = state.datos.servicios || [];",
        "function renderServiciosDelDia() {\n  const servicios = window.obtenerServiciosAgendaDia();",
        "app cards")


def patch_calendar(s):
    return exact(s, "    const lista = window.state?.datos?.servicios || [];",
        '    const lista = typeof window.obtenerServiciosAgendaDia === "function"\n'
        '      ? window.obtenerServiciosAgendaDia()\n'
        '      : (window.state?.datos?.servicios || []);',
        "calendar feed")


def patch_index(s):
    for name in ("app.js", "graph.js", "dashboard-daily-calendar.js"):
        pattern = re.compile(r'(\bsrc\s*=\s*["\']' + re.escape(name) + r'\?v=)([^"\']+)(["\'])', re.I)
        s, n = pattern.subn(lambda m: m.group(1) + VERSION + m.group(3), s)
        if n != 1: raise ValueError(f"index referencia {name}: {n} anclajes; cancelar")
    return s


def main(inp, out):
    if inp.resolve() == out.resolve(): raise ValueError("El respaldo no puede sobrescribirse")
    if out.exists() and list(out.iterdir()): raise ValueError("Salida debe estar vacia")
    out.mkdir(parents=True, exist_ok=True)
    patchers = {"app.js": patch_app, "graph.js": patch_graph,
                "dashboard-daily-calendar.js": patch_calendar, "index.php": patch_index}
    for name in FILES:
        current = (inp/name).read_text(encoding="utf-8")
        minimum = 100000 if name == "app.js" else 10000 if name.endswith(".js") else 2000
        if len(current) < minimum: raise ValueError(f"{name}: contenido remoto inesperado")
        updated = patchers[name](current)
        if current == updated: raise ValueError(f"{name}: sin cambios, cancelar")
        (out/name).write_text(updated, encoding="utf-8")
        print(f"{name}: {len(current)} -> {len(updated)} caracteres, parche validado")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("original", type=Path)
    p.add_argument("modified", type=Path)
    args = p.parse_args()
    main(args.original, args.modified)
