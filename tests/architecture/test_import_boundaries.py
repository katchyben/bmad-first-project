"""Enforce the hexagonal import boundaries with a small AST checker."""

import ast
import sys
from dataclasses import dataclass
from pathlib import Path

import pytest

ROOT_PACKAGE = "bmad_first_project"
PACKAGE_DIR = Path(__file__).resolve().parents[2] / "src" / ROOT_PACKAGE
COMPOSITION_ROOTS = {f"{ROOT_PACKAGE}.main", f"{ROOT_PACKAGE}.cli"}
ORM_PACKAGES = {"sqlmodel", "sqlalchemy", "alembic"}


@dataclass(frozen=True)
class Module:
    name: str
    source: str
    is_package: bool = False


def _within(name: str, prefix: str) -> bool:
    return name == prefix or name.startswith(prefix + ".")


def _layer(name: str) -> str | None:
    parts = name.split(".")
    return parts[1] if len(parts) > 1 and parts[0] == ROOT_PACKAGE else None


def _adapter(name: str) -> str | None:
    """Return the adapter a dotted name belongs to, e.g. `http` or `clock`."""
    parts = name.split(".")
    if len(parts) > 2 and parts[0] == ROOT_PACKAGE and parts[1] == "adapters":
        return parts[2]
    return None


def _is_stdlib(name: str) -> bool:
    return name.split(".")[0] in sys.stdlib_module_names


def _resolve_relative(module: Module, level: int, target: str | None) -> str | None:
    package = module.name if module.is_package else module.name.rpartition(".")[0]
    parts = package.split(".")
    if level - 1 >= len(parts):
        return None
    base = parts[: len(parts) - (level - 1)]
    return ".".join(base + ([target] if target else []))


def _imported_names(module: Module) -> list[tuple[int, str | None]]:
    """Every absolute name a module imports, as (line, name); None if unresolvable."""
    found: list[tuple[int, str | None]] = []
    for node in ast.walk(ast.parse(module.source)):
        if isinstance(node, ast.Import):
            found.extend((node.lineno, alias.name) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                base = _resolve_relative(module, node.level, node.module)
            else:
                base = node.module
            if base is None:
                found.append((node.lineno, None))
                continue
            for alias in node.names:
                found.append(
                    (node.lineno, base if alias.name == "*" else f"{base}.{alias.name}")
                )
    return found


def _violation(importer: str, target: str) -> str | None:
    layer = _layer(importer)
    internal = _within(target, ROOT_PACKAGE)

    if target.split(".")[0] in ORM_PACKAGES and not _within(
        importer, f"{ROOT_PACKAGE}.adapters.persistence"
    ):
        return "SQLModel/SQLAlchemy/Alembic may only be imported under adapters/persistence"

    if layer == "domain":
        if internal and not _within(target, f"{ROOT_PACKAGE}.domain"):
            return "domain may import only domain and the standard library"
        if not internal and not _is_stdlib(target):
            return "domain may import only the standard library"

    if layer == "application":
        allowed = (f"{ROOT_PACKAGE}.domain", f"{ROOT_PACKAGE}.application")
        if internal and not any(_within(target, p) for p in allowed):
            return "application may import only domain and application"
        if not internal and not _is_stdlib(target):
            return "application may import only domain, application and stdlib"

    if target == f"{ROOT_PACKAGE}.adapters" and importer not in COMPOSITION_ROOTS:
        return "only main.py and cli.py may import the adapters package"

    target_adapter = _adapter(target)
    if target_adapter is not None:
        importer_adapter = _adapter(importer)
        if importer_adapter is not None and importer_adapter != target_adapter:
            return "an adapter must not import another adapter"
        if importer_adapter is None and importer not in COMPOSITION_ROOTS:
            return "only main.py and cli.py may import adapters"

    return None


def check_imports(modules: list[Module]) -> list[str]:
    """Return a human-readable violation for every forbidden import."""
    violations: list[str] = []
    for module in modules:
        for line, target in _imported_names(module):
            if target is None:
                reason: str | None = "relative import beyond the top-level package"
            else:
                reason = _violation(module.name, target)
            if reason:
                violations.append(f"{module.name}:{line} imports {target}: {reason}")
    return violations


def collect_modules(package_dir: Path = PACKAGE_DIR) -> list[Module]:
    modules = []
    for path in sorted(package_dir.rglob("*.py")):
        rel = path.relative_to(package_dir.parent).with_suffix("")
        parts = list(rel.parts)
        is_package = parts[-1] == "__init__"
        if is_package:
            parts.pop()
        modules.append(
            Module(".".join(parts), path.read_text(encoding="utf-8"), is_package)
        )
    return modules


def test_real_tree_respects_boundaries() -> None:
    modules = collect_modules()
    assert any(m.name == f"{ROOT_PACKAGE}.main" for m in modules)
    assert check_imports(modules) == []


P = ROOT_PACKAGE

FORBIDDEN = [
    pytest.param(f"{P}.domain.task", "import fastapi", id="domain-imports-fastapi"),
    pytest.param(
        f"{P}.domain.task",
        f"from {P}.application import ports",
        id="domain-imports-app",
    ),
    pytest.param(
        f"{P}.application.use_cases",
        f"from {P}.adapters.clock import SystemClock",
        id="application-imports-adapter",
    ),
    pytest.param(
        f"{P}.application.use_cases", "import pydantic", id="application-imports-3rd"
    ),
    pytest.param(
        f"{P}.adapters.http.routes",
        f"from {P}.adapters.persistence import repo",
        id="http-imports-persistence",
    ),
    pytest.param(
        f"{P}.adapters.http.routes",
        "from .. import persistence",
        id="http-imports-persistence-relative",
    ),
    pytest.param(
        f"{P}.adapters.http.routes",
        "from sqlmodel import Session",
        id="sqlmodel-outside-persistence",
    ),
    pytest.param(f"{P}.main", "import sqlalchemy", id="sqlalchemy-in-main"),
    pytest.param(
        f"{P}.cli", "from alembic import command", id="alembic-outside-persistence"
    ),
    pytest.param(
        f"{P}.application.use_cases",
        "from ..adapters import clock",
        id="relative-application-imports-adapter",
    ),
    pytest.param(
        f"{P}.domain.task",
        "def f():\n    import fastapi\n",
        id="nested-import",
    ),
    pytest.param(f"{P}.domain.task", "from .... import x", id="relative-beyond-top"),
    pytest.param(
        f"{P}.adapters.http.routes",
        f"from {P} import adapters",
        id="adapter-imports-adapters-package",
    ),
    pytest.param(
        f"{P}.adapters.http.routes",
        f"from {P}.adapters import *",
        id="adapter-star-imports-adapters-package",
    ),
    pytest.param(
        f"{P}.services",
        f"from {P}.adapters.clock import SystemClock",
        id="non-root-module-imports-adapter",
    ),
]


@pytest.mark.parametrize(("name", "source"), FORBIDDEN)
def test_forbidden_import_is_reported(name: str, source: str) -> None:
    assert check_imports([Module(name, source)]) != []


def test_root_package_init_importing_adapter_is_reported() -> None:
    module = Module(P, "from .adapters import clock", is_package=True)
    assert check_imports([module]) != []


ALLOWED = [
    pytest.param(f"{P}.domain.task", "import datetime", id="domain-stdlib"),
    pytest.param(f"{P}.domain.task", "from . import other", id="domain-relative-self"),
    pytest.param(
        f"{P}.application.use_cases",
        f"from {P}.domain import task\nfrom .ports import Clock",
        id="application-domain-and-self",
    ),
    pytest.param(
        f"{P}.adapters.http.routes",
        f"import fastapi\nfrom {P}.application.ports import Clock\n"
        "from .dependencies import get_now",
        id="adapter-app-and-self",
    ),
    pytest.param(
        f"{P}.adapters.persistence.repo",
        "from sqlmodel import Session",
        id="sqlmodel-in-persistence",
    ),
    pytest.param(
        f"{P}.adapters.persistence.schema",
        f"from alembic.config import Config\nfrom {P}.settings import Settings",
        id="alembic-and-settings-in-persistence",
    ),
    pytest.param(
        f"{P}.cli", f"from {P}.adapters.clock import SystemClock", id="cli-adapter"
    ),
]


@pytest.mark.parametrize(("name", "source"), ALLOWED)
def test_allowed_import_passes(name: str, source: str) -> None:
    assert check_imports([Module(name, source)]) == []
