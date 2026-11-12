#!/usr/bin/env python3
"""Synthetic XLSX matching manual source sheets. Legacy helper tabs are poison fixtures."""
from datetime import datetime
from pathlib import Path
from openpyxl import Workbook
import sys

root=Path(sys.argv[1]) if len(sys.argv)>1 else Path("ventas-qa-fixtures")
root.mkdir(parents=True,exist_ok=True)
MONTHS=["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO",
        "JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"]

def sales_file(path, dup=False, weekdiff=False, no_meta=False):
    wb=Workbook();ws=wb.active;ws.title="ENERO"
    for month in MONTHS[1:]:wb.create_sheet(month)
    ws=wb["NOVIEMBRE"]
    ws["A2"]="ASESOR";ws["G2"]="MONTO TOTAL"
    # Monthly rows A/G; weekly breakdown B:F. Cash amounts are synthetic.
    ws["A4"]="ASESOR FICTICIO";ws["B4"]=120.10;ws["C4"]=80.20
    ws["G4"]=201.30 if weekdiff else 200.30
    if dup:
        ws["A5"]="ASESOR FICTICIO";ws["G5"]=0
    ws["A6"]="TOTAL";ws["G6"]=200.30 if not weekdiff else 201.30
    ms=wb.create_sheet("METAS")
    ms["A1"]=datetime(2026,11,1)
    if not no_meta:
        ms["A2"]="ASESOR FICTICIO";ms["C2"]=700
    # These are intentionally inconsistent and must NEVER affect source data.
    ms=wb.create_sheet("METAS_BI")
    ms["A1"]="Fecha_Mes";ms["B1"]="Mes";ms["C1"]="Asesor";ms["E1"]="Meta_Mensual"
    ms["E2"]=999999999
    ws=wb.create_sheet("DASHBOARD")
    ws["A1"]="Fecha";ws["F1"]="Monto_Venta"
    ws["F2"]=999999999
    wb.save(path)

def contracts_file(path,duplicate=False,poison=False):
    wb=Workbook();wb.active.title="LOTES"
    for name in ["CHURUBUSCO","AGUA FRIA"]:wb.create_sheet(name)
    for sheet,code,ref in [("LOTES","TT-001","1"),("CHURUBUSCO","TT-002","2"),
                           ("AGUA FRIA","TT-003","3")]:
        ws=wb[sheet]
        vals=[None]*35;vals[1]=code;vals[2]=ref;vals[25]=100
        offset=28 if sheet=="CHURUBUSCO" else 26
        vals[offset:offset+3]=[2,"Noviembre",2026]
        ws.append(vals)
        if duplicate and sheet=="LOTES":ws.append(vals)
    ws=wb.create_sheet("DASHBOARD")
    ws.append(["Tipo_Registro","Monto_Venta"])
    ws.append(["Transaccion",999999999 if poison else 0])
    wb.save(path)

sales_file(root/"ventas-ok.xlsx")
sales_file(root/"ventas-duplicado.xlsx",dup=True)
sales_file(root/"ventas-diferencia.xlsx",weekdiff=True)
sales_file(root/"ventas-meta-no-disponible.xlsx",no_meta=True)
contracts_file(root/"contratos-ok.xlsx")
contracts_file(root/"contratos-duplicado.xlsx",duplicate=True)
contracts_file(root/"contratos-dashboard-contaminado.xlsx",poison=True)
print("Created seven synthetic XLSX fixtures")
