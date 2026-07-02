"""Textual TUI — real-time scan interface for agent-redteam.

Features:
- Dark SOC-style theme
- Live attack telemetry stream (pass/fail per sample)
- Real-time progress bar
- Running score per suite
- Final report screen

Usage:
    agent-redteam scan --tui --model ... --key ...
"""
from __future__ import annotations
import asyncio, sys, threading, time
from datetime import datetime
from typing import Optional

try:
    from textual.app import App, ComposeResult
    from textual.containers import Container, Horizontal, VerticalScroll
    from textual.widgets import Header, Footer, Label, ProgressBar, RichLog, Static
    from textual.reactive import reactive
    from textual.binding import Binding
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    # Stubs so module imports don't crash when textual is absent
    App = object
    ComposeResult = object
    Static = object
    RichLog = object
    Label = object
    def reactive(default):
        return property()
    class Binding:
        def __init__(self, *a, **kw): pass

from .core.engine import Engine
from .core.result import ScanReport, SampleResult, Verdict
from .report.terminal import render_report


# Color scheme (SOC dark)
THEME = {
    "bg": "#0A0E1A",
    "surface": "#141B2D",
    "primary": "#00E5FF",
    "success": "#00E676",
    "warning": "#FFB300",
    "danger": "#FF1744",
    "text": "#E0E6ED",
    "dim": "#5A6A85",
}


# ── Widgets ──────────────────────────────────────────────

class SuiteScoreCard(Static):
    """A single suite's running score card."""

    def __init__(self, suite_name: str):
        super().__init__()
        self.suite_name = suite_name
        self.passed = 0
        self.failed = 0
        self.total = 0
        self.errors = 0

    def update_result(self, verdict: str) -> None:
        self.total += 1
        if verdict == "pass":
            self.passed += 1
        elif verdict == "fail":
            self.failed += 1
        else:
            self.errors += 1
        self._render()

    @property
    def score(self) -> float:
        judged = self.passed + self.failed
        return 100.0 * self.passed / judged if judged else 0.0

    def _render(self) -> None:
        score = self.score
        if score >= 80:
            color = THEME["success"]
            icon = "✅"
        elif score >= 50:
            color = THEME["warning"]
            icon = "⚠️"
        else:
            color = THEME["danger"]
            icon = "❌"

        bar_width = 12
        filled = int(score / 100 * bar_width)
        bar = f"[{color}]{'█' * filled}{'░' * (bar_width - filled)}[/{color}]"

        self.update(
            f"  {self.suite_name:<14} {bar} {score:>5.1f} {icon}\n"
            f"  [dim]  pass={self.passed} fail={self.failed} err={self.errors}[/dim]"
        )


class TelemetryStream(RichLog):
    """Scrolling log of attack results."""
    pass


class ScoreGauge(Static):
    """Overall running score."""

    def __init__(self):
        super().__init__()
        self.total_pass = 0
        self.total_fail = 0

    def update_counts(self, p: int, f: int) -> None:
        self.total_pass = p
        self.total_fail = f
        judged = p + f
        score = 100.0 * p / judged if judged else 0.0
        color = THEME["success"] if score >= 80 else THEME["warning"] if score >= 50 else THEME["danger"]
        self.update(
            f"\n  [bold {color}]╔════════════════════╗[/bold {color}]\n"
            f"  [bold {color}]║  OVERALL: {score:>5.1f}/100  ║[/bold {color}]\n"
            f"  [bold {color}]╚════════════════════╝[/bold {color}]\n"
            f"  [dim]passed: {p}  failed: {f}[/dim]"
        )


# ── App ──────────────────────────────────────────────────

class RedteamTUI(App):
    """Agent Redteam real-time scan interface."""

    CSS = f"""
    Screen {{
        background: {THEME['bg']};
        color: {THEME['text']};
    }}
    #header-bar {{
        background: {THEME['surface']};
        border-bottom: solid {THEME['primary']};
        height: 3;
        padding: 0 1;
    }}
    #main-area {{
        layout: horizontal;
    }}
    #left-panel {{
        width: 40%;
        background: {THEME['surface']};
        border-right: solid {THEME['dim']};
        padding: 1;
    }}
    #right-panel {{
        width: 2fr;
    }}
    #score-cards {{
        height: auto;
        margin-bottom: 1;
    }}
    #gauge {{
        height: auto;
        margin-bottom: 1;
    }}
    #telemetry {{
        border: solid {THEME['dim']};
        height: 1fr;
    }}
    #status-bar {{
        background: {THEME['surface']};
        height: 3;
        padding: 0 1;
        border-top: solid {THEME['primary']};
    }}
    .pass {{ color: {THEME['success']}; }}
    .fail {{ color: {THEME['danger']}; }}
    .error {{ color: {THEME['warning']}; }}
    """

    BINDINGS = [
        Binding("q", "quit", "Quit"),
        Binding("d", "toggle_dark", "Dark/Light"),
    ]

    def __init__(self, target, suites=None, max_workers=4):
        super().__init__()
        self.title = "Agent Redteam"
        self.sub_title = "AI Agent Security Scanner"
        self.target = target
        self.suite_names = suites
        self.max_workers = max_workers
        self.engine = Engine(target, max_workers=max_workers)
        self.report = None
        self._suite_cards = {}
        self._total_pass = 0
        self._total_fail = 0
        self._scan_done = False

    def compose(self) -> ComposeResult:
        yield Header(show_clock=False)
        with Container(id="main-area"):
            with VerticalScroll(id="left-panel"):
                yield Static(f"[bold {THEME['primary']}]═══ Scan Target ═══[/]\n"
                             f"  [dim]Model:[/dim] {self.target.model}\n"
                             f"  [dim]Suites:[/dim] {', '.join(self.suite_names or self.engine.list_suites())}\n",
                             id="target-info")
                yield Static(f"\n[bold {THEME['primary']}]═══ Suite Scores ═══[/]",
                             id="score-header")
                with Container(id="score-cards"):
                    for name in (self.suite_names or self.engine.list_suites()):
                        card = SuiteScoreCard(name)
                        self._suite_cards[name] = card
                        yield card
                yield ScoreGauge()
            with Container(id="right-panel"):
                yield Static(f"[bold {THEME['primary']}]═══ Attack Telemetry ═══[/]",
                             id="tel-header")
                yield TelemetryStream(id="telemetry", markup=True)
        yield Static(f"[dim]Ready. Press any key or wait for scan...[/]", id="status-bar")
        yield Footer()

    def on_mount(self) -> None:
        self.run_worker(self._run_scan(), exclusive=True)

    async def _run_scan(self) -> None:
        """Run the scan in a background worker, updating UI via callbacks."""
        self.query_one("#status-bar", Static).update(
            f"[{THEME['primary']}]● SCANNING...[/]"
        )

        def on_result(r: SampleResult):
            # Update suite card
            card = self._suite_cards.get(r.suite)
            if card:
                self.call_from_thread(card.update_result, r.verdict.value)

            # Update gauge
            if r.verdict == Verdict.PASS:
                self._total_pass += 1
            elif r.verdict == Verdict.FAIL:
                self._total_fail += 1
            gauge = self.query_one(ScoreGauge)
            self.call_from_thread(gauge.update_counts, self._total_pass, self._total_fail)

            # Telemetry stream
            color = "pass" if r.verdict.value == "pass" else "fail" if r.verdict.value == "fail" else "error"
            icon = "✅" if r.verdict.value == "pass" else "❌" if r.verdict.value == "fail" else "⚠️"
            tel = self.query_one("#telemetry", TelemetryStream)
            line = (
                f"[{color}]{icon}[/{color}] "
                f"[dim]{r.suite:<12}[/dim] "
                f"{r.sample_id:<16} "
                f"[dim]{r.category}[/dim]"
            )
            self.call_from_thread(tel.write, line)

        # Run scan (sync, in thread)
        loop = asyncio.get_event_loop()
        report = await loop.run_in_executor(
            None,
            lambda: self.engine.scan(suites=self.suite_names, on_result=on_result)
        )
        self.report = report
        self._scan_done = True

        # Update status
        score = report.overall_score
        status = "PASS ✅" if score >= 80 else "WARN ⚠️" if score >= 50 else "FAIL ❌"
        self.query_one("#status-bar", Static).update(
            f"[bold {THEME['success'] if score >= 80 else THEME['danger']}]"
            f"● DONE — Score: {score}/100  {status}  "
            f"({report.total_passed} passed, {report.total_failed} failed)"
            f"[/]  [dim]Press Q to quit[/]"
        )


def run_tui(target, suites=None, max_workers=4) -> None:
    """Launch the TUI app."""
    if not TEXTUAL_AVAILABLE:
        print("TUI requires textual. Install with: pip install agent-redteam[tui]")
        sys.exit(1)

    app = RedteamTUI(target=target, suites=suites, max_workers=max_workers)
    app.run()
