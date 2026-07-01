"""Checkpoint/resume support for large scans.

Stores per-sample results to a JSONL file as they complete.
On resume, skips already-completed sample IDs.

Uses stdlib json only. Checkpoint files are stored in ~/.agent-redteam/
"""
from __future__ import annotations
import json, os, time
from typing import Optional
from .result import SampleResult, Verdict


def _checkpoint_dir() -> str:
    d = os.path.expanduser("~/.agent-redteam/checkpoints")
    os.makedirs(d, exist_ok=True)
    return d


def checkpoint_path(scan_id: str) -> str:
    """Return the checkpoint file path for a given scan ID."""
    safe_id = "".join(c for c in scan_id if c.isalnum() or c in "-_")
    return os.path.join(_checkpoint_dir(), f"{safe_id}.jsonl")


def make_scan_id(model: str, suites: list[str] | None = None) -> str:
    """Generate a stable scan ID for checkpointing."""
    s = "_".join(sorted(suites)) if suites else "all"
    return f"{model}_{s}"


class Checkpoint:
    """Manages checkpoint save/load for a scan.

    Usage:
        cp = Checkpoint("glm-4-plus_injection_info_leak")
        done = cp.done_ids()  # set of completed sample IDs
        # ... run scan, skipping done ids ...
        cp.save(result)  # save each result as it completes
        cp.complete()  # mark scan as finished, archive checkpoint
    """

    def __init__(self, scan_id: str):
        self.scan_id = scan_id
        self.path = checkpoint_path(scan_id)
        self._cache: dict[str, dict] = {}
        self._load()

    def _load(self):
        """Load existing checkpoint into cache."""
        if os.path.exists(self.path):
            with open(self.path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            obj = json.loads(line)
                            self._cache[obj["sample_id"]] = obj
                        except (json.JSONDecodeError, KeyError):
                            pass

    def done_ids(self) -> set[str]:
        """Return the set of completed sample IDs."""
        return set(self._cache.keys())

    def save(self, result: SampleResult):
        """Save a single result to the checkpoint."""
        obj = result.to_dict()
        self._cache[result.sample_id] = obj
        with open(self.path, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")

    def complete(self):
        """Mark the scan as complete — archive the checkpoint."""
        if os.path.exists(self.path):
            archive_path = self.path + ".done"
            os.rename(self.path, archive_path)

    def clear(self):
        """Delete the checkpoint file."""
        if os.path.exists(self.path):
            os.remove(self.path)
        self._cache.clear()
