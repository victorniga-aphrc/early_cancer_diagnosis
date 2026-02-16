#!/usr/bin/env bash
# Run this script whenever you receive updated files from the team.
# It creates/uses your venv and syncs dependencies – no manual setup needed.

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

# Run the app
echo "Starting app..."
python app.py
