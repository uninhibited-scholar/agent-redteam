"""Generate a local software bill of materials for Agent Redteam."""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
from pathlib import Path
import re
from typing import Any

from . import __version__
from .attest import _redact
from .project_audit import default_project_root


def build_sbom(root: str | Path | None = None, *, include_dev: bool = True) -> dict[str, Any]:
    project_root = Path(root).resolve() if root else default_project_root()
    pyproject = _read(project_root / "pyproject.toml")
    package = _package_metadata(pyproject)
    components = [_root_component(package)]
    components.extend(_python_dependencies(pyproject, include_dev=include_dev))
    components.extend(_npm_components(project_root / "web" / "package-lock.json", include_dev=include_dev))

    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": f"urn:uuid:agent-redteam-{__version__}",
        "version": 1,
        "metadata": {
            "timestamp": _dt.datetime.now(_dt.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "tool": {"name": "agent-redteam", "version": __version__},
            "component": _root_component(package),
        },
        "summary": {
            "components": len(components),
            "python_dependencies": sum(1 for item in components if item.get("ecosystem") == "python"),
            "npm_dependencies": sum(1 for item in components if item.get("ecosystem") == "npm"),
            "runtime_dependencies": sum(1 for item in components if item.get("scope") == "runtime"),
            "dev_dependencies": sum(1 for item in components if item.get("scope") == "dev"),
            "release_artifacts": len(_release_artifacts(project_root)),
        },
        "components": components,
        "release_artifacts": _release_artifacts(project_root),
    }


def render_sbom_json(sbom: dict[str, Any]) -> str:
    return json.dumps(sbom, ensure_ascii=False, indent=2)


def render_sbom_markdown(sbom: dict[str, Any]) -> str:
    summary = sbom["summary"]
    lines = [
        "# Agent Redteam SBOM",
        "",
        f"- **Format:** {sbom['bomFormat']} {sbom['specVersion']}",
        f"- **Generated at:** {sbom['metadata']['timestamp']}",
        f"- **Components:** {summary['components']}",
        f"- **Python dependencies:** {summary['python_dependencies']}",
        f"- **NPM dependencies:** {summary['npm_dependencies']}",
        f"- **Runtime dependencies:** {summary['runtime_dependencies']}",
        f"- **Dev dependencies:** {summary['dev_dependencies']}",
        f"- **Release artifacts:** {summary['release_artifacts']}",
        "",
        "## Components",
        "",
        "| Name | Version | Ecosystem | Scope | License |",
        "|------|---------|-----------|-------|---------|",
    ]
    for item in sbom["components"]:
        lines.append(
            f"| {_cell(item['name'])} | {_cell(item.get('version', ''))} | "
            f"{_cell(item.get('ecosystem', ''))} | {_cell(item.get('scope', ''))} | {_cell(item.get('license', ''))} |"
        )

    if sbom.get("release_artifacts"):
        lines.extend(["", "## Release Artifacts", "", "| Path | Bytes | SHA-256 |", "|------|------:|---------|"])
        for artifact in sbom["release_artifacts"]:
            lines.append(f"| `{_cell(artifact['path'])}` | {artifact['bytes']} | `{artifact['sha256'][:12]}` |")

    lines.extend([
        "",
        "## Notes",
        "",
        "- This SBOM is generated locally from pyproject.toml, web/package-lock.json, and dist artifacts.",
        "- It does not query vulnerability databases or prove registry availability.",
        "- Runtime Python core dependencies are intentionally zero unless pyproject.toml declares otherwise.",
        "",
    ])
    return "\n".join(lines)


def write_sbom(sbom: dict[str, Any], output: str | Path, fmt: str) -> None:
    content = render_sbom_json(sbom) if fmt == "json" else render_sbom_markdown(sbom)
    Path(output).write_text(content, encoding="utf-8")


def _package_metadata(pyproject: str) -> dict[str, str]:
    return {
        "name": _toml_string(pyproject, "name") or "agent-redteam",
        "version": _toml_string(pyproject, "version") or __version__,
        "description": _toml_string(pyproject, "description"),
        "license": _toml_inline_text(pyproject, "license"),
    }


def _root_component(package: dict[str, str]) -> dict[str, Any]:
    return {
        "type": "application",
        "name": _redact(package.get("name", "agent-redteam")),
        "version": _redact(package.get("version", __version__)),
        "ecosystem": "python",
        "scope": "runtime",
        "license": _redact(package.get("license", "")),
        "purl": f"pkg:pypi/{_redact(package.get('name', 'agent-redteam'))}@{_redact(package.get('version', __version__))}",
    }


def _python_dependencies(pyproject: str, *, include_dev: bool) -> list[dict[str, Any]]:
    components: list[dict[str, Any]] = []
    for dep in _toml_array(pyproject, "dependencies"):
        components.append(_python_component(dep, "runtime"))
    if include_dev:
        optional = _optional_dependency_groups(pyproject)
        for group, deps in optional.items():
            scope = "dev" if group in {"dev", "test", "docs"} else "optional"
            for dep in deps:
                components.append(_python_component(dep, scope, group=group))
    return components


def _python_component(spec: str, scope: str, group: str = "") -> dict[str, Any]:
    name, version = _split_dependency_spec(spec)
    item: dict[str, Any] = {
        "type": "library",
        "name": _redact(name),
        "version": _redact(version),
        "ecosystem": "python",
        "scope": scope,
        "license": "",
        "purl": f"pkg:pypi/{_redact(name)}",
    }
    if group:
        item["group"] = _redact(group)
    return item


def _npm_components(lock_path: Path, *, include_dev: bool) -> list[dict[str, Any]]:
    try:
        lock = json.loads(lock_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []
    packages = lock.get("packages", {})
    if not isinstance(packages, dict):
        return []
    components = []
    for path, meta in sorted(packages.items()):
        if not path.startswith("node_modules/") or not isinstance(meta, dict):
            continue
        is_dev = bool(meta.get("dev"))
        if is_dev and not include_dev:
            continue
        name = path.removeprefix("node_modules/")
        components.append({
            "type": "library",
            "name": _redact(name),
            "version": _redact(str(meta.get("version", ""))),
            "ecosystem": "npm",
            "scope": "dev" if is_dev else "runtime",
            "license": _redact(str(meta.get("license", ""))),
            "purl": f"pkg:npm/{_redact(name)}@{_redact(str(meta.get('version', '')))}",
            "integrity": _redact(str(meta.get("integrity", ""))),
        })
    return components


def _release_artifacts(root: Path) -> list[dict[str, Any]]:
    dist = root / "dist"
    artifacts = []
    for path in sorted(dist.glob("agent_redteam-*")) if dist.exists() else []:
        if not path.is_file():
            continue
        raw = path.read_bytes()
        artifacts.append({
            "path": _safe_rel(path, root),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        })
    return artifacts


def _toml_array(text: str, key: str) -> list[str]:
    match = re.search(rf"(?ms)^{re.escape(key)}\s*=\s*\[(.*?)\]", text)
    if not match:
        return []
    return re.findall(r"['\"]([^'\"]+)['\"]", match.group(1))


def _optional_dependency_groups(text: str) -> dict[str, list[str]]:
    match = re.search(r"(?ms)^\[project\.optional-dependencies\]\s*(.*?)(?:^\[|\Z)", text)
    if not match:
        return {}
    groups: dict[str, list[str]] = {}
    for key, body in re.findall(r"(?m)^([A-Za-z0-9_.-]+)\s*=\s*\[(.*?)\]", match.group(1)):
        groups[key] = re.findall(r"['\"]([^'\"]+)['\"]", body)
    return groups


def _split_dependency_spec(spec: str) -> tuple[str, str]:
    match = re.match(r"^\s*([A-Za-z0-9_.-]+)\s*(.*)$", spec)
    if not match:
        return spec, ""
    return match.group(1), match.group(2).strip()


def _toml_string(text: str, key: str) -> str:
    match = re.search(rf"(?m)^{re.escape(key)}\s*=\s*[\"']([^\"']+)[\"']", text)
    return _redact(match.group(1)) if match else ""


def _toml_inline_text(text: str, key: str) -> str:
    match = re.search(rf"(?m)^{re.escape(key)}\s*=\s*\{{\s*text\s*=\s*[\"']([^\"']+)[\"']\s*\}}", text)
    return _redact(match.group(1)) if match else ""


def _safe_rel(path: Path, root: Path) -> str:
    try:
        value = path.resolve().relative_to(root).as_posix()
    except ValueError:
        value = path.name
    return _redact(value)


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def _cell(value: Any) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")
