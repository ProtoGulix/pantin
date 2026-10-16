"""ADR 0048 point 1: the bridge speaks Modbus itself, so no run-time module imports a library."""

from __future__ import annotations

import ast
import subprocess
import sys
from pathlib import Path

import pantin_bridge

SOURCE_DIRECTORY = Path(pantin_bridge.__file__).parent
MODBUS_LIBRARIES = {
    "pymodbus",
    "pyModbusTCP",
    "umodbus",
    "modbus_tk",
    "async_modbus",
    "tmodbus",
    "easymodbus",
    "modbuslink",
    "aiomodbus",
    "minimalmodbus",
}


def _imported_roots(path: Path) -> set[str]:
    roots: set[str] = set()
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            roots.add(node.module.split(".")[0])
    return roots


def test_no_module_under_src_imports_a_modbus_library() -> None:
    sources = sorted(SOURCE_DIRECTORY.rglob("*.py"))
    assert sources, "the source directory was not found"

    offenders = {
        str(path.relative_to(SOURCE_DIRECTORY)): sorted(_imported_roots(path) & MODBUS_LIBRARIES)
        for path in sources
        if _imported_roots(path) & MODBUS_LIBRARIES
    }

    assert offenders == {}


def test_importing_the_command_line_loads_no_modbus_library() -> None:
    # A fresh interpreter: this process already imported pymodbus for the test client.
    probe = (
        "import sys, pantin_bridge.cli; "
        f"loaded = sorted(set(sys.modules) & set({sorted(MODBUS_LIBRARIES)!r})); "
        "sys.exit('loaded: ' + ', '.join(loaded) if loaded else 0)"
    )

    result = subprocess.run(  # noqa: S603 - fixed arguments, our own interpreter
        [sys.executable, "-I", "-c", probe],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
