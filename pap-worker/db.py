"""Conexão PostgreSQL para o worker PAP."""
from __future__ import annotations

import os
from contextlib import contextmanager

import psycopg2
import psycopg2.extras

from config import settings


def _needs_ssl(url: str) -> bool:
    if os.environ.get("DATABASE_SSL", "").lower() == "false":
        return False
    if os.environ.get("DATABASE_SSL", "").lower() == "true":
        return True
    if "localhost" in url or "127.0.0.1" in url:
        return False
    return ".rlwy.net" in url or "railway.app" in url


def get_connection():
    url = settings.DATABASE_URL
    if not url:
        raise RuntimeError("DATABASE_URL não configurada.")
    kwargs = {"dsn": url}
    if _needs_ssl(url):
        kwargs["sslmode"] = "require"
    conn = psycopg2.connect(**kwargs)
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute(f"SET search_path TO {settings.DB_SCHEMA}")
    return conn


@contextmanager
def db_cursor():
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield conn, cur
            conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
