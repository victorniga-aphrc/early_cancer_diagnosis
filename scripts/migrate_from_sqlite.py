#!/usr/bin/env python3
"""
Copy application data from SQLite (e.g. app.db) into the DB configured by DATABASE_URL
(typically PostgreSQL).

Tables migrated (when present in SQLite):
  users, user_roles, patients, conversations, messages,
  conversation_owners, conversation_disease_likelihoods

Roles are not copied; the target must already have roles (run the app once for init_db).

Run from project root:

  python scripts/migrate_from_sqlite.py

Environment:
  DATABASE_URL   — target (required; same as app, e.g. from .env)
  SQLITE_SOURCE  — source file (default: ./app.db)

See README.md ("Migrating from SQLite to PostgreSQL") and .env.example.

Idempotent-ish: skips users with existing email; skips rows whose primary key already exists
on the target for patients, conversations, messages, etc.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from sqlalchemy import create_engine, inspect, text


def _norm_sqlalchemy_url(raw: str) -> str:
    raw = (raw or "").strip()
    if raw.startswith("postgres://"):
        return "postgresql+psycopg://" + raw[len("postgres://") :]
    if raw.startswith("postgresql://"):
        return raw
    return raw


def _colset(insp, table: str) -> set[str]:
    try:
        return {c["name"] for c in insp.get_columns(table)}
    except Exception:
        return set()


def main() -> int:
    target = os.getenv("DATABASE_URL", "").strip()
    if not target:
        print("DATABASE_URL is not set.", file=sys.stderr)
        return 1
    sqlite_path = os.getenv("SQLITE_SOURCE", str(ROOT / "app.db"))
    if not Path(sqlite_path).is_file():
        print(f"SQLite file not found: {sqlite_path}", file=sys.stderr)
        return 1

    sqlite_abs = Path(sqlite_path).resolve().as_posix()
    src = create_engine(f"sqlite:///{sqlite_abs}")
    dst = create_engine(_norm_sqlalchemy_url(target))

    sinsp = inspect(src)
    stables = set(sinsp.get_table_names())
    if "users" not in stables:
        print("No users table in SQLite file.", file=sys.stderr)
        return 1

    is_pg = dst.dialect.name == "postgresql"

    with src.connect() as sc:
        users = sc.execute(text("SELECT * FROM users")).mappings().all()
        role_link_rows: list[tuple[int, str]] = []
        if "user_roles" in stables and "roles" in stables:
            role_link_rows = list(
                sc.execute(
                    text(
                        "SELECT ur.user_id, r.name FROM user_roles ur "
                        "JOIN roles r ON r.id = ur.role_id"
                    )
                ).all()
            )
        patients = []
        if "patients" in stables:
            patients = sc.execute(text("SELECT * FROM patients")).mappings().all()
        conversations = []
        if "conversations" in stables:
            conversations = sc.execute(text("SELECT * FROM conversations")).mappings().all()
        messages = []
        if "messages" in stables:
            messages = sc.execute(text("SELECT * FROM messages")).mappings().all()
        conv_owners = []
        if "conversation_owners" in stables:
            conv_owners = sc.execute(text("SELECT * FROM conversation_owners")).mappings().all()
        disease_rows = []
        if "conversation_disease_likelihoods" in stables:
            disease_rows = sc.execute(
                text("SELECT * FROM conversation_disease_likelihoods")
            ).mappings().all()

    conv_cols = _colset(sinsp, "conversations")
    patient_cols = _colset(sinsp, "patients")

    sqlite_id_to_email: dict[int, str] = {}
    for row in users:
        d = dict(row)
        em = (d.get("email") or "").strip().lower()
        if em:
            sqlite_id_to_email[int(d["id"])] = em

    stats: dict[str, int] = {}

    with dst.begin() as conn:
        role_by_name = {
            row[1]: row[0] for row in conn.execute(text("SELECT id, name FROM roles"))
        }
        if not role_by_name:
            print("Target has no roles row; run the app once to init_db.", file=sys.stderr)
            return 1

        def pg_user_id_for_sqlite_id(sid: int) -> int | None:
            email = sqlite_id_to_email.get(sid)
            if not email:
                return None
            row = conn.execute(
                text("SELECT id FROM users WHERE email = :e LIMIT 1"), {"e": email}
            ).first()
            return int(row[0]) if row else None

        # --- users (build uid_map: sqlite user id -> target user id) ---
        u_ins = u_skip = 0
        uid_map: dict[int, int] = {}
        for row in users:
            rowd = dict(row)
            sid = int(rowd["id"])
            email = (rowd.get("email") or "").strip().lower()
            if not email:
                u_skip += 1
                continue
            ex = conn.execute(
                text("SELECT id FROM users WHERE email = :e LIMIT 1"), {"e": email}
            ).first()
            if ex:
                uid_map[sid] = int(ex[0])
                u_skip += 1
                continue
            params = {
                "email": email,
                "username": rowd.get("username"),
                "password_hash": rowd["password_hash"],
                "is_active": bool(rowd.get("is_active", True)),
                "email_verified": bool(rowd.get("email_verified", False)),
                "created_at": rowd.get("created_at"),
            }
            id_taken = conn.execute(
                text("SELECT 1 FROM users WHERE id = :i LIMIT 1"), {"i": sid}
            ).scalar()
            if not id_taken:
                conn.execute(
                    text(
                        "INSERT INTO users (id, email, username, password_hash, is_active, "
                        "email_verified, created_at) VALUES "
                        "(:id, :email, :username, :password_hash, :is_active, :email_verified, :created_at)"
                    ),
                    {**params, "id": sid},
                )
                uid_map[sid] = sid
            else:
                res = conn.execute(
                    text(
                        "INSERT INTO users (email, username, password_hash, is_active, "
                        "email_verified, created_at) VALUES "
                        "(:email, :username, :password_hash, :is_active, :email_verified, :created_at) "
                        "RETURNING id"
                    ),
                    params,
                )
                uid_map[sid] = int(res.scalar_one())
            u_ins += 1
        stats["users_inserted"] = u_ins
        stats["users_skipped"] = u_skip

        # --- user_roles ---
        links = 0
        for sqlite_uid, role_name in role_link_rows:
            rid = role_by_name.get(role_name)
            if rid is None:
                continue
            pg_uid = pg_user_id_for_sqlite_id(int(sqlite_uid))
            if pg_uid is None:
                continue
            res = conn.execute(
                text(
                    "INSERT INTO user_roles (user_id, role_id) VALUES (:u, :r) "
                    "ON CONFLICT DO NOTHING"
                ),
                {"u": pg_uid, "r": rid},
            )
            if res.rowcount and res.rowcount > 0:
                links += 1
        stats["user_roles_inserted"] = links

        def map_user_fk(val) -> int | None:
            if val is None:
                return None
            try:
                i = int(val)
            except (TypeError, ValueError):
                return None
            m = uid_map.get(i)
            if m is not None:
                return m
            if conn.execute(
                text("SELECT 1 FROM users WHERE id = :i LIMIT 1"), {"i": i}
            ).scalar():
                return i
            return None

        # --- patients ---
        pid_map: dict[int, int] = {}
        p_ins = p_skip = 0
        for row in patients:
            d = dict(row)
            sid = int(d["id"])
            if conn.execute(
                text("SELECT 1 FROM patients WHERE id = :i LIMIT 1"), {"i": sid}
            ).scalar():
                pid_map[sid] = sid
                p_skip += 1
                continue
            raw_clin = d.get("clinician_id")
            pg_clin = map_user_fk(raw_clin)
            conn.execute(
                text(
                    "INSERT INTO patients (id, identifier, display_name, clinician_id, created_at) "
                    "VALUES (:id, :identifier, :display_name, :clinician_id, :created_at)"
                ),
                {
                    "id": sid,
                    "identifier": d["identifier"],
                    "display_name": d.get("display_name") if "display_name" in patient_cols else None,
                    "clinician_id": pg_clin,
                    "created_at": d.get("created_at"),
                },
            )
            pid_map[sid] = sid
            p_ins += 1
        stats["patients_inserted"] = p_ins
        stats["patients_skipped"] = p_skip

        def map_patient_fk(val) -> int | None:
            if val is None:
                return None
            try:
                i = int(val)
            except (TypeError, ValueError):
                return None
            m = pid_map.get(i)
            if m is not None:
                return m
            if conn.execute(
                text("SELECT 1 FROM patients WHERE id = :i LIMIT 1"), {"i": i}
            ).scalar():
                return i
            return None

        # --- conversations ---
        c_ins = c_skip = 0
        for row in conversations:
            d = dict(row)
            cid = d["id"]
            if conn.execute(
                text("SELECT 1 FROM conversations WHERE id = :c LIMIT 1"), {"c": cid}
            ).scalar():
                c_skip += 1
                continue
            pg_owner = map_user_fk(d.get("owner_user_id"))
            pg_patient = map_patient_fk(d.get("patient_id"))
            status = (d.get("status") or "active") if "status" in conv_cols else "active"
            paused_at = d.get("paused_at") if "paused_at" in conv_cols else None
            resumed_at = d.get("resumed_at") if "resumed_at" in conv_cols else None
            conn.execute(
                text(
                    "INSERT INTO conversations (id, created_at, owner_user_id, patient_id, "
                    "status, paused_at, resumed_at) VALUES "
                    "(:id, :created_at, :owner_user_id, :patient_id, :status, :paused_at, :resumed_at)"
                ),
                {
                    "id": cid,
                    "created_at": d.get("created_at"),
                    "owner_user_id": pg_owner,
                    "patient_id": pg_patient,
                    "status": status,
                    "paused_at": paused_at,
                    "resumed_at": resumed_at,
                },
            )
            c_ins += 1
        stats["conversations_inserted"] = c_ins
        stats["conversations_skipped"] = c_skip

        # --- messages ---
        m_ins = m_skip = 0
        for row in messages:
            d = dict(row)
            mid = d["id"]
            if conn.execute(
                text("SELECT 1 FROM messages WHERE id = :i LIMIT 1"), {"i": mid}
            ).scalar():
                m_skip += 1
                continue
            conv_ref = d.get("conversation_id")
            if not conv_ref or not conn.execute(
                text("SELECT 1 FROM conversations WHERE id = :c LIMIT 1"), {"c": conv_ref}
            ).scalar():
                m_skip += 1
                continue
            conn.execute(
                text(
                    "INSERT INTO messages (id, conversation_id, role, type, message, timestamp, created_at) "
                    "VALUES (:id, :conversation_id, :role, :type, :message, :timestamp, :created_at)"
                ),
                {
                    "id": mid,
                    "conversation_id": d["conversation_id"],
                    "role": d.get("role"),
                    "type": d.get("type") or "message",
                    "message": d.get("message"),
                    "timestamp": d.get("timestamp"),
                    "created_at": d.get("created_at"),
                },
            )
            m_ins += 1
        stats["messages_inserted"] = m_ins
        stats["messages_skipped"] = m_skip

        # --- conversation_owners (legacy/aux) ---
        co_ins = co_skip = 0
        for row in conv_owners:
            d = dict(row)
            oid = d["id"]
            if conn.execute(
                text("SELECT 1 FROM conversation_owners WHERE id = :i LIMIT 1"), {"i": oid}
            ).scalar():
                co_skip += 1
                continue
            cref = d.get("conversation_id")
            if not cref or not conn.execute(
                text("SELECT 1 FROM conversations WHERE id = :c LIMIT 1"), {"c": cref}
            ).scalar():
                co_skip += 1
                continue
            ou = map_user_fk(d.get("owner_user_id"))
            if ou is None and d.get("owner_user_id") is not None:
                co_skip += 1
                continue
            conn.execute(
                text(
                    "INSERT INTO conversation_owners (id, conversation_id, owner_user_id) "
                    "VALUES (:id, :conversation_id, :owner_user_id)"
                ),
                {
                    "id": oid,
                    "conversation_id": d["conversation_id"],
                    "owner_user_id": ou,
                },
            )
            co_ins += 1
        stats["conversation_owners_inserted"] = co_ins
        stats["conversation_owners_skipped"] = co_skip

        # --- conversation_disease_likelihoods ---
        dl_ins = dl_skip = 0
        for row in disease_rows:
            d = dict(row)
            conv_id = d["conversation_id"]
            if conn.execute(
                text(
                    "SELECT 1 FROM conversation_disease_likelihoods WHERE conversation_id = :c LIMIT 1"
                ),
                {"c": conv_id},
            ).scalar():
                dl_skip += 1
                continue
            if not conn.execute(
                text("SELECT 1 FROM conversations WHERE id = :c LIMIT 1"), {"c": conv_id}
            ).scalar():
                dl_skip += 1
                continue
            conn.execute(
                text(
                    "INSERT INTO conversation_disease_likelihoods ("
                    "conversation_id, analyzed_at, cancer_likelihood_pct, symptoms_json, "
                    "top_diseases_json, faiss_matches_json, patient_label, clinician_label) "
                    "VALUES ("
                    ":conversation_id, :analyzed_at, :cancer_likelihood_pct, :symptoms_json, "
                    ":top_diseases_json, :faiss_matches_json, :patient_label, :clinician_label)"
                ),
                {
                    "conversation_id": conv_id,
                    "analyzed_at": d.get("analyzed_at"),
                    "cancer_likelihood_pct": d.get("cancer_likelihood_pct"),
                    "symptoms_json": d.get("symptoms_json"),
                    "top_diseases_json": d.get("top_diseases_json"),
                    "faiss_matches_json": d.get("faiss_matches_json"),
                    "patient_label": d.get("patient_label"),
                    "clinician_label": d.get("clinician_label"),
                },
            )
            dl_ins += 1
        stats["disease_likelihoods_inserted"] = dl_ins
        stats["disease_likelihoods_skipped"] = dl_skip

        if is_pg:
            for tbl in ("users", "patients", "conversation_owners"):
                try:
                    conn.execute(
                        text(
                            f"SELECT setval(pg_get_serial_sequence('{tbl}', 'id'), "
                            f"COALESCE((SELECT MAX(id) FROM {tbl}), 1))"
                        )
                    )
                except Exception:
                    pass

    for k, v in stats.items():
        print(f"{k}: {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
