#!/usr/bin/env python3
"""Read-only audit of the source Excel tblIngresos data.

This utility never writes customer rows or credentials. It emits aggregate
checks only and is intended as the first test fixture for the BI migration.
"""

import argparse
import json
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path

from openpyxl import load_workbook

SHEET = "DASHBOARD"
EXPECTED_COLUMNS = [
    "Fecha", "Mes", "Banco", "Cuenta", "Referencia",
    "Referencia_Contrato", "Cliente", "Categoria", "Subcategoria",
    "Importe", "Clave_Registro", "Hoja_Origen", "Fila_Origen",
    "Columna_Origen", "Fecha_Carga",
]
CENT = Decimal("0.01")


def money(value):
    if value is None or value == "":
        raise ValueError("blank amount")
    try:
        amount = Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError("non-numeric amount") from exc
    if not amount.is_finite():
        raise ValueError("non-finite amount")
    # Normalize floating-point artifacts without changing the workbook.
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def audit_workbook(path, expected_month=None):
    path = Path(path)
    result = {
        "archivo": path.name,
        "hoja": SHEET,
        "registros": 0,
        "total": "0.00",
        "meses": {},
        "porBanco": {},
        "registrosPorBanco": {},
        "categorias": {},
        "clavesDuplicadas": 0,
        "errores": [],
        "advertencias": [],
        "validado": False,
    }
    wb = load_workbook(str(path), read_only=True, data_only=True)
    try:
        if SHEET not in wb.sheetnames:
            raise ValueError(f"Missing worksheet: {SHEET}")
        ws = wb[SHEET]
        # Read-only workbooks may report incorrect sheet dimensions.
        ws.reset_dimensions()
        rows = ws.iter_rows(values_only=True)
        header = next(rows, None)
        if header is None or list(header[:15]) != EXPECTED_COLUMNS:
            raise ValueError("Unexpected tblIngresos columns in DASHBOARD")

        total = Decimal("0")
        per_bank = defaultdict(lambda: Decimal("0"))
        bank_counts = Counter()
        months = Counter()
        categories = Counter()
        seen_keys = set()
        duplicate_keys = 0
        errors = []

        for excel_row, cells in enumerate(rows, start=2):
            cells = cells[:len(EXPECTED_COLUMNS)]
            if not any(v is not None and str(v).strip() != "" for v in cells):
                continue
            record = dict(zip(EXPECTED_COLUMNS, cells))
            month = str(record.get("Mes") or "").strip()
            bank = str(record.get("Banco") or "").strip()
            category = str(record.get("Categoria") or "").strip()
            key = str(record.get("Clave_Registro") or "").strip()
            date = record.get("Fecha")

            if not month or not bank or not category or not key or date is None:
                errors.append(f"Row {excel_row}: missing required fields")
                continue
            if expected_month and month != expected_month:
                errors.append(f"Row {excel_row}: expected month {expected_month}, got {month}")
            if key in seen_keys:
                duplicate_keys += 1
                errors.append(f"Row {excel_row}: duplicate Clave_Registro")
            seen_keys.add(key)
            try:
                amount = money(record.get("Importe"))
            except ValueError as exc:
                errors.append(f"Row {excel_row}: {exc}")
                continue

            result["registros"] += 1
            total += amount
            per_bank[bank] += amount
            bank_counts[bank] += 1
            months[month] += 1
            categories[category] += 1

        result["total"] = str(total)
        result["porBanco"] = {key: str(value) for key, value in sorted(per_bank.items())}
        result["registrosPorBanco"] = dict(sorted(bank_counts.items()))
        result["meses"] = dict(sorted(months.items()))
        result["categorias"] = dict(sorted(categories.items()))
        result["clavesDuplicadas"] = duplicate_keys
        result["errores"] = errors[:25]
        if len(errors) > 25:
            result["advertencias"].append(f"{len(errors) - 25} additional errors omitted")
        if "COBANZA SERVICIO CH" in categories and "COBRANZA SERVICIO CH" in categories:
            result["advertencias"].append(
                "The source workbook uses two spellings for COBRANZA SERVICIO CH"
            )
        result["validado"] = result["registros"] > 0 and not errors
        return result
    finally:
        wb.close()


def main():
    parser = argparse.ArgumentParser(description="Audit source Excel income totals")
    parser.add_argument("archivo", help="Original monthly .xlsx file")
    parser.add_argument("--mes", help="Expected YYYY-MM for all source rows")
    args = parser.parse_args()
    try:
        result = audit_workbook(args.archivo, args.mes)
    except Exception as exc:
        print(json.dumps({"validado": False, "error": str(exc)}, ensure_ascii=False))
        raise SystemExit(1)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["validado"] else 1)


if __name__ == "__main__":
    main()
