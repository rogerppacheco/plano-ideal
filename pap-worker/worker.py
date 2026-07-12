"""Worker dedicado Plano Ideal — consulta de crédito e consulta de OS no PAP Nio."""
from __future__ import annotations

import logging
import signal
import sys
import time

from config import settings
from credit_executor import execute_credit_consultation
from db import db_cursor
from os_executor import execute_os_consultation

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger("pap_worker")

_running = True


def _shutdown(signum=None, frame=None):
    global _running
    logger.warning("Sinal %s — encerrando worker...", signum)
    _running = False


def _release_stale_bo_locks(cur) -> None:
    cur.execute(
        """
        UPDATE pap_bo_credentials
        SET in_use_by = NULL, locked_at = NULL, in_use_kind = NULL
        WHERE locked_at IS NOT NULL
          AND locked_at < NOW() - (%s * INTERVAL '1 minute')
        """,
        [settings.PAP_BO_LOCK_TIMEOUT_MINUTES],
    )
    cur.execute(
        """
        UPDATE pap_bo_credentials b
        SET in_use_by = NULL, locked_at = NULL, in_use_kind = NULL
        FROM credit_consultations c
        WHERE b.in_use_kind = 'credit'
          AND b.in_use_by = c.id
          AND c.status IN ('failed', 'success')
          AND c.finished_at IS NOT NULL
        """
    )
    cur.execute(
        """
        UPDATE pap_bo_credentials b
        SET in_use_by = NULL, locked_at = NULL, in_use_kind = NULL
        FROM os_consultations o
        WHERE b.in_use_kind = 'os'
          AND b.in_use_by = o.id
          AND o.status IN ('failed', 'success')
          AND o.finished_at IS NOT NULL
        """
    )
    cur.execute(
        """
        UPDATE credit_consultations
        SET status = 'failed',
            error_message = COALESCE(error_message, 'Consulta expirou (timeout do worker).'),
            finished_at = NOW()
        WHERE status = 'processing'
          AND started_at IS NOT NULL
          AND started_at < NOW() - INTERVAL '15 minutes'
        """
    )
    cur.execute(
        """
        UPDATE os_consultations
        SET status = 'failed',
            error_message = COALESCE(error_message, 'Consulta OS expirou (timeout do worker).'),
            finished_at = NOW()
        WHERE status = 'processing'
          AND started_at IS NOT NULL
          AND started_at < NOW() - INTERVAL '15 minutes'
        """
    )
    cur.execute(
        """
        UPDATE pap_bo_credentials b
        SET in_use_by = NULL, locked_at = NULL, in_use_kind = NULL
        FROM credit_consultations c
        WHERE b.in_use_kind = 'credit'
          AND b.in_use_by = c.id
          AND c.status = 'processing'
          AND c.started_at IS NOT NULL
          AND c.started_at < NOW() - INTERVAL '3 minutes'
          AND c.attempts < c.max_attempts
        """
    )
    cur.execute(
        """
        UPDATE pap_bo_credentials b
        SET in_use_by = NULL, locked_at = NULL, in_use_kind = NULL
        FROM os_consultations o
        WHERE b.in_use_kind = 'os'
          AND b.in_use_by = o.id
          AND o.status = 'processing'
          AND o.started_at IS NOT NULL
          AND o.started_at < NOW() - INTERVAL '3 minutes'
          AND o.attempts < o.max_attempts
        """
    )
    cur.execute(
        """
        UPDATE credit_consultations
        SET status = 'queued',
            started_at = NULL,
            pap_bo_credential_id = NULL
        WHERE status = 'processing'
          AND started_at IS NOT NULL
          AND started_at < NOW() - INTERVAL '3 minutes'
          AND attempts < max_attempts
        """
    )
    cur.execute(
        """
        UPDATE os_consultations
        SET status = 'queued',
            started_at = NULL,
            pap_bo_credential_id = NULL
        WHERE status = 'processing'
          AND started_at IS NOT NULL
          AND started_at < NOW() - INTERVAL '3 minutes'
          AND attempts < max_attempts
        """
    )


def _claim_bo_credential(cur):
    cur.execute(
        """
        SELECT id, matricula_pap, senha_pap_encrypted, label
        FROM pap_bo_credentials
        WHERE enabled = true
          AND in_use_by IS NULL
        ORDER BY id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        """
    )
    return cur.fetchone()


def _claim_next_credit(cur) -> dict | None:
    cur.execute(
        """
        SELECT id
        FROM credit_consultations
        WHERE status = 'queued'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        """
    )
    row = cur.fetchone()
    if not row:
        return None

    bo = _claim_bo_credential(cur)
    if not bo:
        return None

    cur.execute(
        """
        UPDATE credit_consultations
        SET status = 'processing',
            started_at = NOW(),
            attempts = attempts + 1,
            pap_bo_credential_id = %s
        WHERE id = %s
        RETURNING id
        """,
        [bo["id"], row["id"]],
    )
    cur.execute(
        """
        UPDATE pap_bo_credentials
        SET in_use_by = %s, in_use_kind = 'credit', locked_at = NOW()
        WHERE id = %s
        """,
        [row["id"], bo["id"]],
    )
    return {"kind": "credit", "id": row["id"], "bo_id": bo["id"]}


def _claim_next_os(cur) -> dict | None:
    cur.execute(
        """
        SELECT id
        FROM os_consultations
        WHERE status = 'queued'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        """
    )
    row = cur.fetchone()
    if not row:
        return None

    bo = _claim_bo_credential(cur)
    if not bo:
        return None

    cur.execute(
        """
        UPDATE os_consultations
        SET status = 'processing',
            started_at = NOW(),
            attempts = attempts + 1,
            pap_bo_credential_id = %s
        WHERE id = %s
        RETURNING id
        """,
        [bo["id"], row["id"]],
    )
    cur.execute(
        """
        UPDATE pap_bo_credentials
        SET in_use_by = %s, in_use_kind = 'os', locked_at = NOW()
        WHERE id = %s
        """,
        [row["id"], bo["id"]],
    )
    return {"kind": "os", "id": row["id"], "bo_id": bo["id"]}


def _claim_next_job(cur) -> dict | None:
    job = _claim_next_credit(cur)
    if job:
        return job
    return _claim_next_os(cur)


def process_once() -> bool:
    job_id = None
    job_kind = None
    try:
        with db_cursor() as (_conn, cur):
            _release_stale_bo_locks(cur)
            job = _claim_next_job(cur)
            if not job:
                return False
            job_id = job["id"]
            job_kind = job["kind"]

        if job_kind == "os":
            execute_os_consultation(job_id)
        else:
            execute_credit_consultation(job_id)
        return True
    except Exception:
        logger.exception("Erro ao processar consulta %s (%s)", job_id, job_kind)
        if job_id and job_kind == "credit":
            try:
                from credit_executor import _finish_consultation

                _finish_consultation(
                    job_id,
                    status="failed",
                    approved=None,
                    result_detail=None,
                    error_message="Erro interno no worker. Tente novamente.",
                    screenshot_b64=None,
                    duration_seconds=0,
                    bo_credential_id=None,
                )
            except Exception:
                logger.exception("Falha ao marcar consulta crédito %s como erro", job_id)
        elif job_id and job_kind == "os":
            try:
                from os_executor import _finish_consultation as finish_os

                finish_os(
                    job_id,
                    status="failed",
                    result_summary=None,
                    results_json=[],
                    error_message="Erro interno no worker. Tente novamente.",
                    screenshot_b64=None,
                    duration_seconds=0,
                    bo_credential_id=None,
                )
            except Exception:
                logger.exception("Falha ao marcar consulta OS %s como erro", job_id)
        return False


def main() -> None:
    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)
    interval = settings.PAP_WORKER_POLL_SECONDS
    logger.info("Worker PAP Plano Ideal iniciado (crédito + OS, poll=%ss)", interval)

    while _running:
        try:
            if process_once():
                continue
        except Exception:
            logger.exception("Erro no ciclo do worker")
        time.sleep(interval)

    logger.info("Worker encerrado.")


if __name__ == "__main__":
    main()
