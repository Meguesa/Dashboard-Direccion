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
    ws["H4"]="\u00a0"  # Reproduce celda AGOSTO!H22 del libro original
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

def contracts_file(path,duplicate=False,poison=False,conflict=False,cancel=False):
    wb=Workbook();wb.active.title="LOTES"
    for name in ["CHURUBUSCO","AGUA FRIA"]:wb.create_sheet(name)
    for sheet,code,ref in [("LOTES","TT-001","1"),("CHURUBUSCO","TT-002","2"),
                           ("AGUA FRIA","TT-003","3")]:
        ws=wb[sheet]
        vals=[None]*35;vals[1]=code;vals[2]=ref;vals[25]=100
        offset=28 if sheet=="CHURUBUSCO" else 26
        vals[offset:offset+3]=[2,"Noviembre",2026]
        if cancel and sheet=="LOTES":vals[1]=code+" CANCELADO"
        ws.append(vals)
        if duplicate and sheet=="LOTES":ws.append(vals)
        if conflict and sheet=="LOTES":
            divergent=vals[:]
            divergent[25]=120
            ws.append(divergent)
    ws=wb.create_sheet("DASHBOARD")
    ws.append(["Tipo_Registro","Monto_Venta"])
    ws.append(["Transaccion",999999999 if poison else 0])
    wb.save(path)

def metas_manual_2026(path):
    """Exercise current workbook structure: old Jan-May and later Feb-Dec 2026."""
    wb=Workbook()
    ws=wb.active
    ws.title="NOVIEMBRE"
    ws["A2"]="ASESOR"; ws["G2"]="MONTO TOTAL"
    rows=[("ALEXIS(NUEVO)",0),("MA ELENA(NUEVA)",25000),("IVETTE",1000)]
    for idx,(name,amount) in enumerate(rows,start=4):
        ws.cell(idx,1,name);ws.cell(idx,7,amount)
        if amount:ws.cell(idx,2,amount)
    ws["A7"]="TOTAL";ws["G7"]=26000
    ms=wb.create_sheet("METAS")
    row=1
    # Legacy blocks: must not override the later, coherent series.
    for month in MONTHS[:5]:
        ms.cell(row,1,month);row+=1
        ms.cell(row,1,"ALEXIS");ms.cell(row,3,999999);row+=1
    for month in MONTHS[1:]:
        ms.cell(row,1,month);row+=1
        ms.cell(row,1,"MASTER");row+=1
        ms.cell(row,1,"ALEXIS");ms.cell(row,3,200000);row+=1
        ms.cell(row,1,"MA ELENA");ms.cell(row,3,200000);row+=1
        ms.cell(row,1,"IVETTE");row+=1  # Intentional empty individual target
        ms.cell(row,1,"");ms.cell(row,3,400000);row+=1 # Manual subtotal ignored
    # Poisoned helper sheets cannot inject conflicting targets.
    fake=wb.create_sheet("METAS_BI")
    fake["A1"]="Mes";fake["E2"]=123456789
    wb.save(path)

sales_file(root/"ventas-ok.xlsx")
sales_file(root/"ventas-duplicado.xlsx",dup=True)
sales_file(root/"ventas-diferencia.xlsx",weekdiff=True)
sales_file(root/"ventas-meta-no-disponible.xlsx",no_meta=True)
metas_manual_2026(root/"ventas-metas-manuales-2026.xlsx")
contracts_file(root/"contratos-ok.xlsx")
contracts_file(root/"contratos-duplicado.xlsx",duplicate=True)
contracts_file(root/"contratos-dashboard-contaminado.xlsx",poison=True)
contracts_file(root/"contratos-conflicto.xlsx",conflict=True)
contracts_file(root/"contratos-cancelado.xlsx",cancel=True)
print("Created ten synthetic XLSX fixtures")
