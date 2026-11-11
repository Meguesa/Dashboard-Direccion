#!/usr/bin/env python3
"""Checks de parche minino contra ambas variantes auditadas de app.js."""
from pathlib import Path
import importlib.util

spec=importlib.util.spec_from_file_location("patch","tools/patch_egresos_detail_live.py")
patch=importlib.util.module_from_spec(spec)
spec.loader.exec_module(patch)
for path in ["app.js","cpanel-preview-20261105/dashboard-egresos-preview/app.js"]:
    src=Path(path).read_text(encoding="utf-8")
    # Reconstruir la version original previa al arreglo, pero solo dentro de las funciones seleccionadas.
    a=src.index(patch.MODAL_BEGIN)
    b=src.index(patch.DETAIL_END,a)
    section=src[a:b]
    section=section.replace(patch.NEW_SUBTITLE,patch.OLD_SUBTITLE,1)
    section=section.replace(patch.NEW_HEADER,patch.ORIGINAL_HEADER,1)
    import re
    original = ("      const mesEgreso = normalizarTexto(item.mesHoja || item.mes);\n"
                "      " + patch.ORIGINAL_CATEGORY + "\n"
                + patch.ORIGINAL_PAYMENT + "\n")
    pattern = (r"      const mesEgreso = normalizarTexto\(item\.mesHoja \|\| item\.mes\);\n"
               r"[\s\S]*?&& pagado > 0;\n")
    section, count = re.subn(pattern, lambda _: original, section, count=1)
    assert count == 1, "No se pudo reconstruir el filtro previo"
    before=src[:a]+section+src[b:]
    result=patch.fix(before)
    assert result!=before
    assert result[:a]==before[:a], "Se modifico codigo anterior al detalle"
    assert result[b+len(result)-len(before):]==before[b:], "Se modifico codigo posterior al detalle"
    assert patch.NEW_HEADER in result and patch.NEW_PAYMENT in result
    try: patch.fix(result)
    except ValueError: pass
    else: raise AssertionError("Se debe bloquear una segunda publicacion")
    alt=before.replace(patch.ORIGINAL_PAYMENT,patch.ORIGINAL_PAYMENT_ALT,1)
    assert patch.NEW_PAYMENT in patch.fix(alt), "La variante pagado != 0 no se puede corregir"
    try: patch.fix(before.replace(patch.ORIGINAL_HEADER,"var tipoNormalizado = foo;"))
    except ValueError: pass
    else: raise AssertionError("Un codigo desconocido debe ser rechazado")
    print("PASS parche puntual:",path)
