"""Only the SQL unit of work may call `.commit(`."""

import ast
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parents[2] / "src" / "bmad_first_project"
ALLOWED = Path("adapters/persistence/unit_of_work.py")


def _commit_calls(source: str) -> list[int]:
    """Line numbers of every call whose function is an attribute named `commit`."""
    return [
        node.lineno
        for node in ast.walk(ast.parse(source))
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "commit"
    ]


def _violations(files: dict[Path, str]) -> list[str]:
    """`path:line` for each `.commit(` call outside the allowed module."""
    return [
        f"{path}:{line}"
        for path, source in sorted(files.items())
        if path != ALLOWED
        for line in _commit_calls(source)
    ]


def test_real_tree_has_no_stray_commits() -> None:
    files = {
        path.relative_to(PACKAGE_DIR): path.read_text()
        for path in PACKAGE_DIR.rglob("*.py")
    }

    assert ALLOWED in files
    assert _violations(files) == []


def test_flags_commit_in_a_repository() -> None:
    source = (
        "class TaskRepository:\n"
        "    def add(self, task):\n"
        "        self.session.add(task)\n"
        "        self.session.commit()\n"
    )
    path = Path("adapters/persistence/tasks.py")

    assert _violations({path: source}) == [f"{path}:4"]


def test_allows_commit_in_the_unit_of_work() -> None:
    source = "def done(session):\n    session.commit()\n"

    assert _violations({ALLOWED: source}) == []
