# Cancer Diagnostic Assistant (Agentic AI for Early Cancer Detection)

### Overview

The **Cancer Diagnostic Assistant** is a digital tool powered by **agentic AI** that supports **general practitioners (GPs)** in conducting effective clinical interviews for suspected cancer cases. The system guides clinicians to ask all **relevant, evidence-based questions**, ensuring that **early warning signs** of common cancers are not missed before referral to specialists.

This project aims to **reduce diagnostic delays**, improve **primary-care decision support**, and ultimately **enhance early cancer detection outcomes** in low-resource settings.

---

### Core Features

* 🧠 **Multi-Agent Intelligence:**
  A coordinated set of AI agents (Clinician, Patient, Listener, Question Recommender) simulate or support real diagnostic conversations.

* 💬 **Natural-Language Dialogue:**
  Enables bilingual (English–Swahili) conversational screening between clinician and patient through voice and text.

* 🔎 **Question Recommendation Engine:**
  Dynamically suggests the next best clinical question based on the ongoing conversation and FAISS-retrieved data from a question knowledge base.

* 🔊 **Real-Time Speech-to-Text (STT):**
  Integrates local **faster-whisper** and **Jacaranda ASR** models for offline and low-bandwidth transcription, with automatic switching by language context.

* 🧩 **Adaptive Diagnostic Reasoning:**
  Continuously interprets dialogue to estimate likelihoods of key symptom clusters linked to **early cancer indicators**.

* 🧍 **Real / Simulated Patient Modes:**
  Can be used for live clinician-patient interviews or simulated training sessions for clinical education.

---

### System Architecture

The system combines:

* **Flask backend** with WebSocket streaming for live transcription and real-time agent orchestration.
* **CrewAI orchestration layer** managing agent roles (`clinician_agent`, `patient_agent`, `listener_agent`, `question_recommender_agent`).
* **FAISS retrieval engine** for question and knowledge indexing.
* **Frontend (HTML/JS/CSS)** with modern chat interface and live audio capture.

---

### Installation & run (short)

1. Clone the repository and `cd` into the project root.
2. **Linux / macOS / WSL:** `bash run.sh` — creates `.venv`, installs `requirements.txt`, starts `python app.py`.
3. **Windows:** create a venv, `pip install -r requirements.txt`, then `python app.py` (or use Git Bash to run `run.sh`).
4. Optional: copy `.env.example` to `.env` and set variables (see below). The app loads `.env` at startup.

Open the URL shown in the terminal (typically `http://127.0.0.1:5000`).

---

### Environment variables (`.env`)

The app uses [python-dotenv](https://pypi.org/project/python-dotenv/): variables in a `.env` file in the project root are loaded when `app.py` starts (before the ORM reads `DATABASE_URL`). **Do not commit `.env`**; use `.env.example` as a template.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | No | If unset, default is SQLite `sqlite:///app.db`. For PostgreSQL use e.g. `postgresql+psycopg://USER:PASSWORD@HOST:5432/DB_NAME`. The shorthand `postgres://...` is normalized automatically. |
| `BOOTSTRAP_ADMIN_EMAIL` | No | With `BOOTSTRAP_ADMIN_PASSWORD`, creates a first **admin** (+ clinician) user on startup if that email is not already registered. **Remove both from `.env` after first login** in production. |
| `BOOTSTRAP_ADMIN_PASSWORD` | No | See above. Use a strong password. |
| `SQLITE_SOURCE` | No | Only for the migration script: path to the SQLite file (default `./app.db`). |

Other keys (LLM, STT, etc.) follow your existing `config.py` / deployment conventions.

---

### Database configuration (SQLite or PostgreSQL)

**SQLite (default)**  
No configuration needed; data is stored in `app.db` in the project root.

**PostgreSQL**  
Create an empty database and a user with DDL/DML access, then set `DATABASE_URL` (shell or `.env`):

```bash
export DATABASE_URL="postgresql+psycopg://USER:PASSWORD@HOST:5432/DB_NAME"
bash run.sh
```

Notes:

- The database must already exist; the app does not create the cluster or database name for you.
- Connection pooling uses `pool_pre_ping` for resilience.
- **CI / tests:** GitHub Actions does not set `DATABASE_URL`; tests use the default SQLite file in the workspace unless you configure otherwise.

**Roles and users**  
On first start, `init_db()` creates tables and seeds **roles** only (`clinician`, `admin`). It does **not** copy legacy SQLite data. End users can register via **Create one** on the login page (clinician role), or you migrate existing data (below).

---

### Migrating from SQLite to PostgreSQL

A new PostgreSQL instance has empty **users**, **patients**, **conversations**, etc. To copy them from `app.db`:

1. Point `DATABASE_URL` at Postgres and **start the app once** so schema and roles exist.
2. From the project root (with the same `DATABASE_URL` in the environment or `.env`):

```bash
python scripts/migrate_from_sqlite.py
```

Optional: `SQLITE_SOURCE=/absolute/or/relative/path/to/app.db` if not using `./app.db`.

The script copies, when present in SQLite: `users`, `user_roles`, `patients`, `conversations`, `messages`, `conversation_owners`, `conversation_disease_likelihoods`. It skips rows that already exist (by primary key or, for users, by email). Prefer a **clean** target database for a one-shot migration; re-runs are supported but overlapping manual signups can cause skips.

`scripts/migrate_users_from_sqlite.py` is a **backward-compatible alias** for `migrate_from_sqlite.py`.

**FAISS / local indexes** (`medical_cases.index`, `medical_cases_metadata.pkl`) are files on disk, not in the database; keep or rebuild them separately.

### Technical Stack

* **Backend:** Python (Flask), SQLAlchemy 2.x, SQLite or PostgreSQL (psycopg 3), FAISS, CrewAI
* **Frontend:** JavaScript (WebSocket + SSE), HTML5, CSS3
* **Speech-to-Text:** faster-whisper, Jacaranda ASR
* **Embedding Model:** all-MiniLM-L6-v2
* **LLM Interface:** GPT-4 / Llama-3 (configurable)

---

### Current Status

* ✅ MVP **fully developed and operational**
* 🧪 **Awaiting trial testing** in real-world primary-care settings
* 🔄 Continuous optimization for speed, accuracy, and context adaptation

---

### Future Work

* Integration with electronic medical records (EMR)
* Support for additional African languages
* Deployment on local hospital networks for offline functionality
* Evaluation and fine-tuning using real clinician–patient data

---

### Contributors

Developed by **Dr. Tatenda Duncan Kavu** and collaborators at the **African Population and Health Research Center (APHRC)**, within the **Data Science Program**.
Special thanks to research partners and medical practitioners contributing to the pilot testing phase.

---

### License

This project is released under the **MIT License**. See `LICENSE` for details.
