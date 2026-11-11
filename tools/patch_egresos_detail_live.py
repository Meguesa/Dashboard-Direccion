#!/usr/bin/env python3
"""Aplica exclusivamente el fix del modal de egresos al app.js REAL de cPanel.

No reconstruye el Dashboard ni modifica datos. Falla si la version remota
no contiene exactamente el codigo previo auditado (fail closed).
"""
from __future__ import annotations

import argparse
from pathlib import Path

MODAL_BEGIN = "function renderDetalleModalEgresosTipoGasto(tipoGasto, mes) {"
DETAIL_BEGIN = "function obtenerMovimientosEgresosPorTipoGasto(mes, tipoGastoBuscado) {"
DETAIL_END = "function obtenerFechaEgresoTexto(item) {"

ORIGINAL_HEADER = "const tipoNormalizado = normalizarClaveComparacion(tipoGastoBuscado);"
NEW_HEADER = 'const tipoNormalizado = normalizarClaveComparacion(normalizarTexto(tipoGastoBuscado) || "Sin tipo de gasto");'
ORIGINAL_CATEGORY = "const tipoGasto = normalizarClaveComparacion(item.tipoGasto);"
NEW_CATEGORY = 'const tipoGasto = normalizarClaveComparacion(normalizarTexto(item.tipoGasto) || "Sin tipo de gasto");'
ORIGINAL_PAYMENT = """      const pagado = Number(item.pagado || 0);
      const porPagar = Number(item.porPagar || 0);

      return coincideMesValor(mesEgreso, mes)
        && tipoGasto === tipoNormalizado
        && (pagado > 0 || porPagar > 0);"""
ORIGINAL_PAYMENT_ALT = ORIGINAL_PAYMENT.replace(
    "(pagado > 0 || porPagar > 0)", "(pagado !== 0 || porPagar > 0)"
)
NEW_PAYMENT = """      const pagado = Number(item.pagado || 0);

      // Igual que el resumen: registrar solo movimientos con pago realizado.
      return coincideMesValor(mesEgreso, mes)
        && tipoGasto === tipoNormalizado
        && pagado > 0;"""
OLD_SUBTITLE = "$" + "{formatoNumero(movimientos.length)} movimientos · Pagado:"
NEW_SUBTITLE = "$" + "{formatoNumero(movimientos.length)} movimientos pagados · Pagado:"


def replace_exact(source: str, old: str, new: str, field: str) -> str:
    if source.count(old) != 1:
        raise ValueError(f"Version no reconocida: {field}, coincidencias={source.count(old)}")
    return source.replace(old, new, 1)


def fix(source: str) -> str:
    if source.count(MODAL_BEGIN) != 1 or source.count(DETAIL_BEGIN) != 1 or source.count(DETAIL_END) != 1:
        raise ValueError("No se encontraron exactamente una vez las funciones del detalle")
    start_modal = source.index(MODAL_BEGIN)
    start_detail = source.index(DETAIL_BEGIN)
    end_detail = source.index(DETAIL_END)
    if not start_modal < start_detail < end_detail:
        raise ValueError("Se altero el orden de funciones; se cancela por seguridad")

    modal = source[start_modal:start_detail]
    detail = source[start_detail:end_detail]
    if NEW_HEADER in detail and NEW_CATEGORY in detail and NEW_PAYMENT in detail and NEW_SUBTITLE in modal:
        raise ValueError("La correccion ya esta publicada; no se vuelve a sobrescribir app.js")

    modal_fixed = replace_exact(modal, OLD_SUBTITLE, NEW_SUBTITLE, "subtitulo")
    detail_fixed = replace_exact(detail, ORIGINAL_HEADER, NEW_HEADER, "encabezado")
    detail_fixed = replace_exact(detail_fixed, ORIGINAL_CATEGORY, NEW_CATEGORY, "tipo vacio")
    variants = [x for x in (ORIGINAL_PAYMENT, ORIGINAL_PAYMENT_ALT) if x in detail_fixed]
    if len(variants) != 1:
        raise ValueError("Filtro de pago remoto desconocido; no se sobrescribe app.js")
    detail_fixed = replace_exact(detail_fixed, variants[0], NEW_PAYMENT, "filtro pagado")

    fixed = source[:start_modal] + modal_fixed + detail_fixed + source[end_detail:]
    if fixed == source:
        raise ValueError("La correccion no produjo cambios")
    if "&& pagado > 0;" not in detail_fixed:
        raise ValueError("Fallo la validacion final del criterio de pago")
    return fixed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("original")
    parser.add_argument("salida")
    args = parser.parse_args()
    original = Path(args.original).read_text(encoding="utf-8")
    corrected = fix(original)
    Path(args.salida).write_text(corrected, encoding="utf-8")
    print("OK: app.js original conservado; solo modal de Egresos modificado.")


if __name__ == "__main__":
    main()
