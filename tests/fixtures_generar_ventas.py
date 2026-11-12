#!/usr/bin/env python3
"""Generate synthetic workbooks for offline QA. No client data."""
from pathlib import Path
from openpyxl import Workbook
import sys
base=Path(sys.argv[1]) if len(sys.argv)>1 else Path("ventas-qa-fixtures")
base.mkdir(parents=True,exist_ok=True)
headers=["Fecha","Mes","Asesor","Semana","Sucursal","Monto_Venta","Servicios_AF","Servicios_CH","TS_TSC","Propiedades","Nichos","Total_Unidades","Meta_Mensual","Comentarios","Tipo_Registro","Fuente","Clave_Registro","Hoja_Origen","Fila_Origen","Fecha_Carga","Fecha_Act","Numero_Contrato","Referencia","Fecha_Contrato"]
def workbook(rows,path,contracts=False):
 w=Workbook(); sheet=w.active;sheet.title="DASHBOARD";sheet.append(headers)
 for row in rows:
  sheet.append([row.get(x) for x in headers])
 if contracts:
  for name in ["LOTES","CHURUBUSCO","AGUA FRIA"]:
   s=w.create_sheet(name)
   s.append([None]*35)
   for row in rows:
    if row.get("Hoja_Origen")!=name: continue
    vals=[None]*35
    vals[1]={"LOTES":"TEST-LOT-100","CHURUBUSCO":"TEST-CH-101","AGUA FRIA":"TEST-AF-102"}[name]
    vals[2]={"LOTES":"100","CHURUBUSCO":"101","AGUA FRIA":"102"}[name]
    vals[25]=row.get("Monto_Venta") or 100
    offset=28 if name=="CHURUBUSCO" else 26
    vals[offset:offset+3]=[2,"Noviembre",2026]
    s.append(vals)
 else:
  for name in ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"]:
   w.create_sheet(name)
  m=w.create_sheet("META_ASESORES")
  m.append(["Fecha_Mes","Mes","Asesor","Nivel","Meta_Mensual"])
  m.append(["2026-11-01","2026-11","ASESOR FICTICIO","MASTER",701 if "meta-diferencia" in str(path) else 700])
 w.save(path)
sales=[
 {"Fecha":"2026-11-04","Mes":"NOVIEMBRE","Asesor":"ASESOR 1","Semana":"SEMANA 1","Monto_Venta":120.10,"Meta_Mensual":0,"Tipo_Registro":"Semanal","Fuente":"Ventas 2026","Clave_Registro":"A-S1","Hoja_Origen":"NOVIEMBRE","Fila_Origen":4},
 {"Fecha":"2026-11-11","Mes":"NOVIEMBRE","Asesor":"ASESOR 1","Semana":"SEMANA 2","Monto_Venta":80.20,"Meta_Mensual":0,"Tipo_Registro":"Semanal","Fuente":"Ventas 2026","Clave_Registro":"A-S2","Hoja_Origen":"NOVIEMBRE","Fila_Origen":5},
 {"Fecha":"2026-11-11","Mes":"NOVIEMBRE","Asesor":"ASESOR 1","Semana":"TOTAL","Monto_Venta":200.30,"Meta_Mensual":700,"Tipo_Registro":"Mensual","Fuente":"Ventas 2026","Clave_Registro":"A-M","Hoja_Origen":"NOVIEMBRE","Fila_Origen":6}
]
contracts=[
 {"Fecha":"2026-11-02","Mes":"NOVIEMBRE","Asesor":"ASESOR 1","Monto_Venta":90.00,"Tipo_Registro":"Transaccion","Fuente":"CONTRATOS","Clave_Registro":"L-100","Hoja_Origen":"LOTES","Fila_Origen":2,"Numero_Contrato":"TEST-LOT-100","Referencia":"100","Fecha_Contrato":"2026-11-02"},
 {"Fecha":"2026-11-03","Mes":"NOVIEMBRE","Asesor":"ASESOR 2","Monto_Venta":200.00,"Tipo_Registro":"Transaccion","Fuente":"CONTRATOS","Clave_Registro":"CH-101","Hoja_Origen":"CHURUBUSCO","Fila_Origen":2,"Numero_Contrato":"TEST-CH-101","Referencia":"101","Fecha_Contrato":"2026-11-02"}
]
workbook(sales,base/"ventas-ok.xlsx")
workbook(sales,base/"ventas-meta-diferencia.xlsx")
workbook(sales+[{**sales[0],"Clave_Registro":"A-S1"}],base/"ventas-duplicado.xlsx")
workbook(sales+[{**sales[0],"Clave_Registro":"A-S3","Monto_Venta":1.0}],base/"ventas-diferencia.xlsx")
workbook(contracts,base/"contratos-ok.xlsx",True)
workbook(contracts+[{**contracts[0],"Clave_Registro":"L-100"}],base/"contratos-duplicado.xlsx",True)
print("Created 6 synthetic spreadsheets")
