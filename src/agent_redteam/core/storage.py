"""SQLite storage for scan reports — history, comparison, and persistence.

Uses stdlib sqlite3 only. Stores scan reports in ~/.agent-redteam/scans.db
"""
from __future__ import annotations
import json, os, sqlite3, datetime
from typing import Optional
from .result import ScanReport


def _db_path() -> str:
    """Return the path to the scans database."""
    d = os.path.expanduser("~/.agent-redteam")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, "scans.db")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT UNIQUE,
            target_model TEXT NOT NULL,
            overall_score REAL NOT NULL,
            total_samples INTEGER NOT NULL,
            total_passed INTEGER NOT NULL,
            total_failed INTEGER NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            report_json TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS suite_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id INTEGER NOT NULL,
            suite_name TEXT NOT NULL,
            score REAL NOT NULL,
            passed INTEGER NOT NULL,
            failed INTEGER NOT NULL,
            total INTEGER NOT NULL,
            owasp TEXT,
            FOREIGN KEY (scan_id) REFERENCES scans(id)
        )
    """)
    conn.commit()
    return conn


def save_report(report: ScanReport) -> str:
    """Save a scan report to the database. Returns the run_id."""
    conn = _connect()
    run_id = datetime.datetime.now().strftime("%Y%m%d_%H%M%S_") + report.target_model

    # Build full JSON
    data = report.to_dict()
    data["samples"] = []
    for suite in report.suites:
        for s in suite.samples:
            data["samples"].append(s.to_dict())

    try:
        cursor = conn.execute(
            """INSERT INTO scans (run_id, target_model, overall_score, total_samples,
               total_passed, total_failed, started_at, finished_at, report_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (run_id, report.target_model, report.overall_score,
             report.total_samples, report.total_passed, report.total_failed,
             report.started_at, report.finished_at, json.dumps(data, ensure_ascii=False))
        )
        scan_id = cursor.lastrowid

        # Save per-suite results
        for suite in report.suites:
            owasp = ""
            if suite.samples:
                owasp = suite.samples[0].owasp
            conn.execute(
                """INSERT INTO suite_results (scan_id, suite_name, score, passed, failed, total, owasp)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (scan_id, suite.name, suite.score, suite.passed, suite.failed, suite.total, owasp)
            )
        conn.commit()
    except sqlite3.IntegrityError:
        # run_id already exists, append suffix
        run_id += "_2"
        # retry once
        conn.execute(
            """INSERT INTO scans (run_id, target_model, overall_score, total_samples,
               total_passed, total_failed, started_at, finished_at, report_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (run_id, report.target_model, report.overall_score,
             report.total_samples, report.total_passed, report.total_failed,
             report.started_at, report.finished_at, json.dumps(data, ensure_ascii=False))
        )
        conn.commit()
    finally:
        conn.close()

    return run_id


def list_scans(limit: int = 20) -> list[dict]:
    """List recent scans."""
    conn = _connect()
    rows = conn.execute(
        """SELECT run_id, target_model, overall_score, total_samples,
           total_passed, total_failed, created_at
           FROM scans ORDER BY created_at DESC LIMIT ?""",
        (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_report(run_id: str) -> Optional[dict]:
    """Get a full scan report by run_id."""
    conn = _connect()
    row = conn.execute(
        "SELECT report_json FROM scans WHERE run_id = ?", (run_id,)
    ).fetchone()
    conn.close()
    if row:
        return json.loads(row["report_json"])
    return None


def compare_reports(run_id_a: str, run_id_b: str) -> Optional[dict]:
    """Compare two scan reports."""
    report_a = get_report(run_id_a)
    report_b = get_report(run_id_b)
    if not report_a or not report_b:
        return None

    # Build comparison
    suites_a = {s["name"]: s for s in report_a["suites"]}
    suites_b = {s["name"]: s for s in report_b["suites"]}
    all_suites = sorted(set(suites_a.keys()) | set(suites_b.keys()))

    suite_comparison = []
    for name in all_suites:
        a = suites_a.get(name, {"score": 0, "passed": 0, "failed": 0})
        b = suites_b.get(name, {"score": 0, "passed": 0, "failed": 0})
        delta = b["score"] - a["score"]
        suite_comparison.append({
            "suite": name,
            "score_a": a["score"],
            "score_b": b["score"],
            "delta": round(delta, 1),
            "trend": "↑" if delta > 0 else "↓" if delta < 0 else "→",
        })

    return {
        "model_a": report_a["target_model"],
        "model_b": report_b["target_model"],
        "score_a": report_a["overall_score"],
        "score_b": report_b["overall_score"],
        "score_delta": round(report_b["overall_score"] - report_a["overall_score"], 1),
        "suites": suite_comparison,
    }
