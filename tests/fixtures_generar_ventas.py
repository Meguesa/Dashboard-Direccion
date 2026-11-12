#!/usr/bin/env python3
"""Generate synthetic workbooks for offline QA. No client data."""
from pathlib import Path
from openpyxl import Workbook
import sys
base=Path(sys.argv[1]) if len(sys.argv)>1 else Path("ventas-qa-fixtures")
base.mkdir(parents=True,exist_ok=True)
headers=["Fecha","Mes","Asesor","Semana","Sucursal","Monto_Venta","Servicios_AF","Servicios_CH","TS_TSC","Propiedades","Nichos","Total_Unidades","Meta_Mensual","Comentarios","Tipo_Registro","Fuente","Clave_Registro","Hoja_Origen","Fila_Origen","Fecha_Carga","Fecha_Act"]
def workbook(rows,path,contracts=False):
 w=Workbook(); sheet=w.active;sheet.title="DASHBOARD";sheet.append(headers)
 for row in rows:
  sheet.append([row.get(x) for x in headers])
 if contracts:
  for name in ["LOTES","CHURUBUSCO","AGUA FRÍA"]:
   s=w.create_sheet(name)
   s.append(["REFERENCIA","CONTRATO","FECHA","ASESOR","TOTAL"])
   s.append([f"QA-{name[:2]}",f"TEST-{name[:2]}","01/11/2026","ASESOR FICTICIO",100])
 else:
  for name in ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"]:
   w.create_sheet(name)
 w.save(path)
sales=[
 {"Fecha":"2026-11-04","Mes":"NOVIEMBRE","Asesor":"ASESOR 1","Semana":"SEMANA 1","Monto_Venta":120.10,"Meta_Mensual":0,"Tipo_Registro":"Semanal","Fuente":"Ventas 2026","Clave_Registro":"A-S1","Hoja_Origen":"NOVIEMBRE","Fila_Origen":4},
 {"Fecha":"2026-11-11","Mes":"NOVIEMBRE","Asesor":"ASESOR 1","Semana":"SEMANA 2","Monto_Venta":80.20,"Meta_Mensual":0,"Tipo_Registro":"Semanal","Fuente":"Ventas 2026","Clave_Registro":"A-S2","Hoja_Origen":"NOVIEMBRE","Fila_Origen":5},
 {"Fecha":"2026-11-11","Mes":"NOVIEMBRE","Asesor":"ASESOR 1","Semana":"TOTAL","Monto_Venta":200.30,"Meta_Mensual":700,"Tipo_Registro":"Mensual","Fuente":"Ventas 2026","Clave_Registro":"A-M","Hoja_Origen":"NOVIEMBRE","Fila_Origen":6}
]
contracts=[
 {"Fecha":"2026-11-02","Mes":"NOVIEMBRE","Asesor":"ASESOR 1","Monto_Venta":90.00,"Tipo_Registro":"Transaccion","Fuente":"CONTRATOS","Clave_Registro":"L-100","Hoja_Origen":"LOTES","Fila_Origen":5},
 {"Fecha":"2026-11-03","Mes":"NOVIEMBRE","Asesor":"ASESOR 2","Monto_Venta":200.00,"Tipo_Registro":"Transaccion","Fuente":"CONTRATOS","Clave_Registro":"CH-101","Hoja_Origen":"CHURUBUSCO","Fila_Origen":8}
]
workbook(sales,base/"ventas-ok.xlsx")
workbook(sales+[{**sales[0],"Clave_Registro":"A-S1"}],base/"ventas-duplicado.xlsx")
workbook(sales+[{**sales[0],"Clave_Registro":"A-S3","Monto_Venta":1.0}],base/"ventas-diferencia.xlsx")
workbook(contracts,base/"contratos-ok.xlsx",True)
workbook(contracts+[{**contracts[0],"Clave_Registro":"L-100"}],base/"contratos-duplicado.xlsx",True)
print("Created 5 synthetic spreadsheets")
