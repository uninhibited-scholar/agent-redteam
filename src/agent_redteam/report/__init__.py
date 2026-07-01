"""Report generators."""
from .terminal import render_report
from .json_report import render_json

__all__ = ["render_report", "render_json"]
