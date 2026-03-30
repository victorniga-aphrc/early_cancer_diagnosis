#!/usr/bin/env python3
"""Backward-compatible entry point; runs the full SQLite → target DB migration."""
import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("migrate_from_sqlite.py")), run_name="__main__")
