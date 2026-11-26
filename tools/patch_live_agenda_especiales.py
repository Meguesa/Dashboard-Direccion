#!/usr/bin/env python3
"""Safe application of the feature delta to live, independently modified files.

Builds a strict unified patch from the pinned repository base (before this feature)
and the selected candidate files. Applies hunks with fuzz=0 to FTP-downloaded
files; aborts if any hunk cannot be matched exactly.
"""
from pathlib import Path
import difflib
import os
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = "39e248ef863adf3d79c1e5bd7e8bb2ec3e6f3e6c"
SOURCE = "cpanel-preview-20261105/dashboard-egresos-preview"
FILES = ("graph.js", "app.js", "dashboard-daily-calendar.js", "dashboard-daily-calendar.css")
VERSION = "20261126-servicios-especiales-1"
OLD_VERSION = "20261123-agenda-capillas-directa-1"


def text_at_base(name):
    return subprocess.check_output(
        ["git", "show", BASE + ":" + SOURCE + "/" + name],
        cwd=ROOT, text=True
    )


def modify(backup: Path, target: Path):
    if target.exists() and any(target.iterdir()):
        raise RuntimeError("Output folder is not empty")
    target.mkdir(parents=True, exist_ok=True)

    for name in FILES:
        source = (ROOT / SOURCE / name).read_text(encoding="utf-8")
        before = text_at_base(name)
        live = (backup / name).read_text(encoding="utf-8")
        if len(live) < len(before) * 0.65:
            raise RuntimeError(name + " suspiciously short live copy")
        if name == "graph.js" and "obtenerAgendaCapillasOperacionesSeguro" not in live:
            raise RuntimeError("Live graph missing previous direct Agenda version")
        if name == "app.js" and "obtenerServiciosAgendaDia" not in live:
            raise RuntimeError("Live app missing previous Agenda version")

        special_function = ""
        if name == "app.js":
            start = source.index("function renderServiciosEspecialesDia(")
            end = source.index("function crearServicioAgendaDia(", start)
            special_function = source[start:end]
            source = source[:start] + source[end:]
            insertion = "  renderServiciosEspecialesDia(cremacionesDirectas, velacionesDomicilio, ahora);" + chr(10) * 2
            if source.count(insertion) != 1:
                raise RuntimeError("Unexpected special agenda insertion in source app")
            source = source.replace(insertion, "", 1)

        patch = "".join(difflib.unified_diff(
            before.splitlines(keepends=True), source.splitlines(keepends=True),
            fromfile=name, tofile=name, n=3
        ))
        if not patch: raise RuntimeError("No change to apply to " + name)
        (target / name).write_text(live, encoding="utf-8")
        patchfile = target / ("patch_" + name + ".diff")
        patchfile.write_text(patch, encoding="utf-8")
        result = subprocess.run(
            ["patch", "--batch", "--fuzz=0", "--forward", "-p0", "-i", str(patchfile.resolve())],
            cwd=target, capture_output=True, text=True,
        )
        print(name + " patch: " + result.stdout + result.stderr)
        if result.returncode != 0:
            raise RuntimeError("Cannot safely apply patch to live " + name)
        patchfile.unlink()
        updated = (target / name).read_text(encoding="utf-8")
        if name == "app.js":
            # Ancla semantica en produccion: la seccion de actualizacion del
            # reloj puede diferir del archivo historico de QA.
            call = "  renderServiciosEspecialesDia(cremacionesDirectas, velacionesDomicilio, ahora);" + chr(10) * 2
            match = re.findall(r'(?m)^  setText\\(\\s*\\n\\s*"serviciosDiaActualizado",', updated)
            if len(match) != 1:
                raise RuntimeError("Live app: no unique agenda status anchor")
            updated = re.sub(
                r'(?m)^  setText\\(\\s*\\n\\s*"serviciosDiaActualizado",',
                lambda m: call + m.group(0), updated, count=1
            )
            anchor = "function crearServicioAgendaDia("
            if updated.count(anchor) != 1:
                raise RuntimeError("Live app: no unique details anchor")
            updated = updated.replace(anchor, special_function + anchor, 1)
            (target / name).write_text(updated, encoding="utf-8")
        if updated == live:
            raise RuntimeError("No live change occurred: " + name)
        if name == "graph.js" and "agendaSinVelacion: true" not in updated:
            raise RuntimeError("Missing direct cremation support")
        if name == "app.js" and "renderServiciosEspecialesDia" not in updated:
            raise RuntimeError("Missing special service cards")

    index = (backup / "index.php").read_text(encoding="utf-8")
    if OLD_VERSION not in index:
        raise RuntimeError("Unexpected live index version; no publication")
    for name in ("graph.js", "app.js", "dashboard-daily-calendar.js", "dashboard-daily-calendar.css"):
        pattern = re.compile(
            r'((?:src|href)\s*=\s*["\']' + re.escape(name) + r'\?v=)([^"\']+)(["\'])',
            re.I
        )
        index, count = pattern.subn(lambda m: m.group(1) + VERSION + m.group(3), index)
        if count != 1:
            raise RuntimeError(f"Unexpected script/style include for {name}: {count}")
    (target / "index.php").write_text(index, encoding="utf-8")
    print("index.php: cache-busting of four resources")


if __name__ == "__main__":
    if len(sys.argv) != 3: raise SystemExit("usage: patch_live_agenda_especiales.py original target")
    modify(Path(sys.argv[1]), Path(sys.argv[2]))
