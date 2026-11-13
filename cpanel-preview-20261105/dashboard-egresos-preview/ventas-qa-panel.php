<?php
declare(strict_types=1);
require_once dirname(__DIR__).'/includes/bootstrap.php';
require_once dirname(__DIR__).'/includes/portal-access.php';
portal_require_authentication();
$user=portal_user();
if(strtolower(trim((string)($user['email']??'')))!=='gabriel.guerra@juanpablo.com.mx'||
   !portal_user_can_tool('dashboard')){http_response_code(403);exit('Acceso restringido QA.');}
header('Cache-Control: private, no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
?><!doctype html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>QA Ventas Excel — Jardines de Juan Pablo</title>
<style>
:root{font:15px/1.45 system-ui;color:#17443b;background:#f4f7f6}
body{margin:0 auto;max-width:1250px;padding:30px 24px}
h1{margin:0 0 6px;font-size:27px}p{margin:8px 0 16px}
nav{margin-bottom:22px}a{color:#126356}
.notice{padding:12px 15px;border:1px solid #d6b567;background:#fff7df;border-radius:8px}
.controls{display:flex;align-items:center;gap:15px;flex-wrap:wrap;margin:15px 0}
select,button{font:inherit;padding:8px 14px;border-radius:7px;border:1px solid #9db7b0;background:white}
button{background:#145e52;color:white;cursor:pointer}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0}
.card{padding:13px 16px;border:1px solid #c3d8d2;background:white;border-radius:10px}
.card small{display:block;color:#486860}.card strong{font-size:21px}
section{background:white;border:1px solid #d0dfdc;border-radius:10px;padding:14px;margin:16px 0}
.scroll{overflow:auto;max-height:520px}table{width:100%;border-collapse:collapse;white-space:nowrap}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e2eae7}
th{position:sticky;top:0;background:#e8f2ef}
.amount{text-align:right;font-variant-numeric:tabular-nums}
.bad{color:#a52719;font-weight:bold}.good{color:#167342}
#warning{white-space:pre-wrap}
</style></head><body>
<nav><a href="./">Regresar al Dashboard</a> · <a href="ventas-excel-preview.php">Auditar Graph</a></nav>
<h1>Ventas directamente desde Excel — QA</h1>
<p class="notice"><strong>Vista de pruebas restringida.</strong> No cambia BI_Ventas ni Power Automate.
Las ventas se toman de Comercial, columna G. El importe nominal de contratos es informativo y no se suma a ventas.</p>
<div class="controls">
<label for="mes">Periodo</label>
<select id="mes"></select>
<button id="reload" type="button">Revisar versión validada</button>
<span id="status" role="status" aria-live="polite">Comprobando origen…</span>
</div>
<div class="cards">
<div class="card"><small>Ventas Comercial</small><strong id="total">—</strong></div>
<div class="card"><small>Meta Comercial (METAS)</small><strong id="meta">—</strong></div>
<div class="card"><small>Cumplimiento</small><strong id="pct">—</strong></div>
<div class="card"><small>Contratos únicos</small><strong id="contracts">—</strong></div>
<div class="card"><small>Asesores sin meta</small><strong id="missing">—</strong></div>
</div>
<section><h2>Ventas y metas por asesor</h2><div class="scroll"><table>
<thead><tr><th>Asesor</th><th class="amount">Venta</th><th class="amount">Meta</th>
<th class="amount">Cumplimiento</th></tr></thead><tbody id="advisors"></tbody>
</table></div></section>
<section><h2>Contratos originales, sin sumarse a ventas</h2><div class="scroll"><table>
<thead><tr><th>Contrato</th><th>Cliente</th><th>Origen</th><th>Estado de vigencia</th>
<th class="amount">Importe nominal</th></tr></thead><tbody id="rows"></tbody>
</table></div></section>
<p id="warning"></p>
<script src="ventas-excel.js?v=20261113-qa-1"></script>
<script>
"use strict";
const peso=n=>Number(n).toLocaleString("es-MX",{style:"currency",currency:"MXN"});
const el=id=>document.getElementById(id);
const mese=Array.from({length:12},(_,i)=>"2026-"+String(i+1).padStart(2,"0"));
for(const m of mese){const o=document.createElement("option");o.value=m;
o.textContent=new Date(Number(m.slice(0,4)),Number(m.slice(5,7))-1,1)
 .toLocaleDateString("es-MX",{month:"long",year:"numeric"});el("mes").append(o);}
el("mes").value="2026-11";
let rows=[];
function cell(tr,value,cls=""){const td=document.createElement("td");td.textContent=value;
if(cls)td.className=cls;tr.append(td);}
function draw(){
 const month=el("mes").value;
 const mes=rows.filter(r=>r.mes===month);
 const sales=mes.filter(r=>r.fuenteOrigen==="excel_original_ventas");
 const contracts=mes.filter(r=>r.fuenteOrigen==="excel_original_contratos");
 const metaStatus=window.ventasExcelEstado.meses?.[month]||{};
 const total=sales.reduce((n,r)=>n+Math.round(r.montoVenta*100),0)/100;
 const meta=metaStatus.metaDisponible?metaStatus.metaCentavos/100:null;
 el("total").textContent=peso(total);el("meta").textContent=meta===null?"Sin meta":peso(meta);
 el("pct").textContent=meta>0?(total/meta*100).toFixed(2)+"%":"—";
 el("contracts").textContent=String(contracts.length);
 el("missing").textContent=String(metaStatus.asesoresSinMeta??"—");
 el("advisors").replaceChildren();
 for(const row of sales.sort((a,b)=>b.montoVenta-a.montoVenta)){
  const tr=document.createElement("tr");
  cell(tr,row.asesor);cell(tr,peso(row.montoVenta),"amount");
  cell(tr,row.metaMensual===null?"Sin meta":peso(row.metaMensual),"amount");
  cell(tr,row.metaMensual>0?(row.montoVenta/row.metaMensual*100).toFixed(2)+"%":"—","amount");
  el("advisors").append(tr);
 }
 el("rows").replaceChildren();
 for(const row of contracts){
  const tr=document.createElement("tr");
  cell(tr,row.numeroContrato||"Sin contrato");cell(tr,row.cliente||"Sin cliente");
  cell(tr,row.hojaOrigen||"Sin origen");cell(tr,row.estadoFuente||"No confirmada");
  cell(tr,row.importeContrato===null?"Sin importe":peso(row.importeContrato),"amount");
  el("rows").append(tr);
 }
 el("warning").textContent="El total mensual proviene del Excel original, no de contratos.\n"+
 "Las metas de vendedores sin venta pueden incluirse en la meta total. "+
 "Última verificación: "+window.ventasExcelEstado.verificadoUTC;
}
async function load(){
 el("status").textContent="Validando 12 meses y dos fuentes…";el("status").className="";
 try{rows=await cargarVentasExcelOriginal();
 el("status").textContent="Datos validados del Excel · sin cambios de producción";
 el("status").className="good";draw();
 }catch(e){rows=[];el("status").textContent="No disponible: "+(e?.message||e);
 el("status").className="bad";["total","meta","pct","contracts","missing"].forEach(k=>el(k).textContent="No disponible");
 el("advisors").replaceChildren();el("rows").replaceChildren();}
}
el("mes").onchange=draw;el("reload").onclick=load;load();
</script></body></html>
