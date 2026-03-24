#!/usr/bin/env bash
# Run this script whenever you receive updated files from the team.
# It creates/uses your venv and syncs dependencies – no manual setup needed.
#
# Database:
#   - Default: SQLite (sqlite:///app.db) if DATABASE_URL is unset.
#   - PostgreSQL: set DATABASE_URL (export or put it in a .env file in this directory;
#     the app loads .env on startup via python-dotenv).
#
# Migrating data from SQLite to Postgres: see README.md and scripts/migrate_from_sqlite.py

set -e
cd "$(dirname "$0")"

# Create venv only if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
fi

# Activate and sync dependencies (fast if already up to date)
source .venv/bin/activate
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Database target notice (DATABASE_URL may come from the shell or from .env loaded by app.py)
if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL not set in this shell. App will use SQLite unless .env defines DATABASE_URL."
    echo "PostgreSQL example: export DATABASE_URL='postgresql+psycopg://user:pass@host:5432/early_cancer_db'"
else
    echo "DATABASE_URL is set in this shell (Postgres or custom URL)."
fi

# Run the app
echo "Starting app..."
python app.py
