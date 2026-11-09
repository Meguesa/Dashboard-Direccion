#!/usr/bin/env python3
"""Audit original JJP sales XLSX sources without changing them or importing PII.

Run: python3 tools/auditar_ventas_excel.py "Ventas 2026.xlsx" "CONTRATOS.xlsx"
Requires openpyxl. Outputs aggregate statistics and anomaly counts as JSON.
This is a PREVIEW utility. It does not alter the dashboard or replace BI_Ventas.
"""
import argparse
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import json
from pathlib import Path
import sys

import openpyxl


def cents(value):
    if value is None or str(value).strip() == "":
        return 0
    try:
        return int((Decimal(str(value)) * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    except InvalidOperation as exc:
        raise ValueError("Importe no numérico en el libro de origen") from exc


def rows_from_xlsx(filename):
    book = openpyxl.load_workbook(filename, read_only=True, data_only=True)
    try:
        if "DASHBOARD" not in book:
            raise ValueError("Falta hoja tabular de referencia DASHBOARD")
        sheet = book["DASHBOARD"]
        sheet.reset_dimensions()
        it = sheet.iter_rows(values_only=True)
        head = next(it)
        cols = {str(x).strip(): i for i, x in enumerate(head) if x is not None}
        need = {"Mes", "Tipo_Registro", "Monto_Venta", "Clave_Registro", "Fuente", "Hoja_Origen"}
        if missing := need - cols.keys():
            raise ValueError("Faltan columnas: " + ", ".join(sorted(missing)))
        for row in it:
            kind = row[cols["Tipo_Registro"]]
            if not kind:
                continue
            key = str(row[cols["Clave_Registro"]] or "").strip()
            if not key:
                raise ValueError("Registro sin clave de origen")
            yield (str(kind).strip(), str(row[cols["Mes"]] or "").strip().upper(),
                   cents(row[cols["Monto_Venta"]]), key,
                   str(row[cols["Fuente"]] or ""), str(row[cols["Hoja_Origen"]] or ""))
    finally:
        book.close()


def audit(filename, source, kinds):
    entries = rows_from_xlsx(filename)
    totals = defaultdict(int)
    counts = Counter()
    duplicates = Counter()
    seen = set()
    bad_source = 0
    bad_kind = Counter()
    for kind, month, amount, key, origin, sheet in entries:
        if origin != source:
            bad_source += 1
        if kind not in kinds:
            bad_kind[kind] += 1
        counts[(kind, month)] += 1
        totals[(kind, month)] += amount
        if key in seen:
            duplicates[(kind, month, sheet)] += 1
        seen.add(key)
    return {
        "archivo": Path(filename).name,
        "registros": sum(counts.values()),
        "por_tipo": dict(Counter({k: sum(v for (t, _), v in counts.items() if t == k)
                                 for k, _ in counts})),
        "fuente_incorrecta": bad_source,
        "tipos_incorrectos": dict(bad_kind),
        "claves_duplicadas": sum(duplicates.values()),
        "duplicados_agrupados_sin_datos_personales": [
            {"tipo": t, "mes": m, "hoja": s, "repeticiones": n}
            for (t, m, s), n in sorted(duplicates.items())
        ],
        "periodos": [
            {"tipo": t, "mes": m, "registros": counts[(t, m)], "centavos": amount}
            for (t, m), amount in sorted(totals.items())
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ventas")
    parser.add_argument("contratos")
    parser.add_argument("--output", help="Ruta para escribir resumen JSON sin datos personales")
    opts = parser.parse_args()
    sales = audit(opts.ventas, "Ventas 2026", {"Semanal", "Mensual"})
    contracts = audit(opts.contratos, "CONTRATOS", {"Transaccion"})
    by_month = defaultdict(dict)
    for r in sales["periodos"]:
        by_month[r["mes"]][r["tipo"]] = r["centavos"]
    mismatches = [
        {"mes": month, "semanal_centavos": amounts["Semanal"],
         "mensual_centavos": amounts["Mensual"],
         "diferencia_centavos": amounts["Semanal"] - amounts["Mensual"]}
        for month, amounts in sorted(by_month.items())
        if "Semanal" in amounts and "Mensual" in amounts
        and amounts["Semanal"] != amounts["Mensual"]
    ]
    report = {
        "archivo_ventas": sales, "archivo_contratos": contracts,
        "descuadres_semanal_mensual": mismatches,
        "listo_para_produccion": False,
        "nota": "Auditoría informativa: no compara todavía las hojas originales de contratos con BI_Ventas.",
    }
    result = json.dumps(report, ensure_ascii=False, indent=2)
    if opts.output:
        Path(opts.output).write_text(result + "\n", encoding="utf-8")
    else:
        print(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
