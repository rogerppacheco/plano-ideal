"""Executa consulta de OS (pedido) no PAP Nio para o Plano Ideal."""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import time
from typing import Any

from config import settings
from db import db_cursor
from pap_automation import PAPNioAutomation

logger = logging.getLogger(__name__)


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _release_bo(cur, credential_id: int | None) -> None:
    if not credential_id:
        return
    cur.execute(
        """
        UPDATE pap_bo_credentials
        SET in_use_by = NULL, locked_at = NULL, in_use_kind = NULL
        WHERE id = %s
        """,
        [credential_id],
    )


def _file_to_base64(path: str | None) -> str | None:
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "rb") as handle:
            return base64.b64encode(handle.read()).decode("ascii")
    except OSError as exc:
        logger.warning("[OS] Falha ao ler screenshot %s: %s", path, exc)
        return None


def _sanitize_results_for_storage(detalhes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    for item in detalhes or []:
        row = {
            key: value
            for key, value in item.items()
            if key not in ("detail_screenshot_path", "detalhe_href") and value is not None
        }
        cleaned.append(row)
    return cleaned


def _build_summary(
    msg: str,
    detalhes: list[dict[str, Any]],
    *,
    numero_os_filtro: str | None = None,
) -> str:
    if msg.startswith("os_not_found"):
        os_list = msg.split(":", 1)[1] if ":" in msg else ""
        os_hint = ""
        if os_list:
            os_hint = f" Pedidos encontrados para este documento: {os_list.replace(',', ', ')}."
        os_num = numero_os_filtro or "informada"
        return (
            f"OS {os_num} não encontrada nos últimos 30 dias para este documento."
            f"{os_hint}"
        )
    if msg == "no_results" or not detalhes:
        if numero_os_filtro:
            return (
                f"Nenhum pedido encontrado nos últimos 30 dias para este documento "
                f"(filtro OS {numero_os_filtro})."
            )
        return "Nenhum pedido encontrado nos últimos 30 dias."
    count = len(detalhes)
    if count == 1:
        numero = detalhes[0].get("numero_os") or "—"
        status = detalhes[0].get("status") or "—"
        return f"1 pedido encontrado (OS {numero}) — {status}"
    return f"{count} pedidos encontrados."


def _resolve_screenshot_path(
    detalhes: list[dict[str, Any]],
    list_screenshot_path: str | None,
) -> str | None:
    for item in detalhes or []:
        detail_path = item.get("detail_screenshot_path")
        if detail_path and os.path.isfile(detail_path):
            return detail_path
    return list_screenshot_path


def _finish_consultation(
    consultation_id: int,
    *,
    status: str,
    result_summary: str | None,
    results_json: list[dict[str, Any]],
    error_message: str | None,
    screenshot_b64: str | None,
    duration_seconds: float,
    bo_credential_id: int | None,
) -> None:
    with db_cursor() as (_conn, cur):
        cur.execute(
            """
            UPDATE os_consultations
            SET status = %s,
                result_summary = %s,
                results_json = %s::jsonb,
                error_message = %s,
                screenshot_base64 = %s,
                duration_seconds = %s,
                pap_bo_credential_id = %s,
                finished_at = NOW()
            WHERE id = %s
            """,
            [
                status,
                result_summary,
                json.dumps(results_json, ensure_ascii=False),
                error_message,
                screenshot_b64,
                round(duration_seconds, 1),
                bo_credential_id,
                consultation_id,
            ],
        )
        _release_bo(cur, bo_credential_id)


def _load_consultation_context(consultation_id: int) -> dict | None:
    with db_cursor() as (_conn, cur):
        cur.execute(
            """
            SELECT id, document, numero_os_filtro, pap_bo_credential_id
            FROM os_consultations
            WHERE id = %s
            """,
            [consultation_id],
        )
        consultation = cur.fetchone()
        if not consultation:
            return None

        bo_credential_id = consultation["pap_bo_credential_id"]
        if not bo_credential_id:
            _finish_consultation(
                consultation_id,
                status="failed",
                result_summary=None,
                results_json=[],
                error_message="Consulta sem login BackOffice associado.",
                screenshot_b64=None,
                duration_seconds=0,
                bo_credential_id=None,
            )
            return None

        cur.execute(
            """
            SELECT id, matricula_pap, senha_pap_encrypted, label
            FROM pap_bo_credentials
            WHERE id = %s
            """,
            [bo_credential_id],
        )
        bo = cur.fetchone()
        if not bo:
            _finish_consultation(
                consultation_id,
                status="failed",
                result_summary=None,
                results_json=[],
                error_message="Login BackOffice PAP não encontrado.",
                screenshot_b64=None,
                duration_seconds=0,
                bo_credential_id=bo_credential_id,
            )
            return None

        matricula_pap = (bo["matricula_pap"] or "").strip()
        senha_encrypted = bo["senha_pap_encrypted"]
        if not matricula_pap or not senha_encrypted:
            _finish_consultation(
                consultation_id,
                status="failed",
                result_summary=None,
                results_json=[],
                error_message="Credencial PAP incompleta.",
                screenshot_b64=None,
                duration_seconds=0,
                bo_credential_id=bo["id"],
            )
            return None

        return {
            "document": _digits(consultation["document"]),
            "numero_os_filtro": (consultation["numero_os_filtro"] or "").strip() or None,
            "bo_id": bo["id"],
            "matricula_pap": matricula_pap,
            "senha_encrypted": senha_encrypted,
        }


def execute_os_consultation(consultation_id: int) -> None:
    from crypto_secret import decrypt_secret

    ctx = _load_consultation_context(consultation_id)
    if not ctx:
        return

    document = ctx["document"]
    numero_os_filtro = ctx["numero_os_filtro"]
    bo_id = ctx["bo_id"]
    matricula_pap = ctx["matricula_pap"]
    senha_pap = decrypt_secret(ctx["senha_encrypted"])

    tempo_inicio = time.time()
    automacao = None

    try:
        automacao = PAPNioAutomation(
            matricula_pap=matricula_pap,
            senha_pap=senha_pap,
            vendedor_nome=f"PlanoIdeal-OS-{consultation_id}",
            headless=settings.PAP_HEADLESS,
            capture_screenshots=getattr(settings, "PAP_CAPTURE_SCREENSHOTS_OS", False),
            optimize_for_credit=getattr(settings, "PAP_OS_FAST_MODE", True),
        )

        ok, msg = automacao.iniciar_sessao()
        if not ok:
            raise RuntimeError(f"Erro ao acessar PAP: {msg}")

        logger.info("[OS] Consulta %s: login PAP OK", consultation_id)

        sucesso, msg, detalhes, list_screenshot_path = automacao.consulta_os_por_cpf_com_resultado(
            document,
            numero_os_filtro=numero_os_filtro,
        )

        duration = time.time() - tempo_inicio
        screenshot_path = _resolve_screenshot_path(detalhes, list_screenshot_path)
        screenshot_b64 = _file_to_base64(screenshot_path)
        if not screenshot_b64:
            logger.warning(
                "[OS] Consulta %s sem captura persistida (list=%s, detail=%s)",
                consultation_id,
                list_screenshot_path,
                [item.get("detail_screenshot_path") for item in (detalhes or [])],
            )

        if not sucesso:
            raise RuntimeError(msg or "Falha na consulta de OS no PAP.")

        results_json = _sanitize_results_for_storage(detalhes)
        summary = _build_summary(
            msg,
            results_json,
            numero_os_filtro=numero_os_filtro,
        )

        _finish_consultation(
            consultation_id,
            status="success",
            result_summary=summary,
            results_json=results_json,
            error_message=None,
            screenshot_b64=screenshot_b64,
            duration_seconds=duration,
            bo_credential_id=bo_id,
        )
        logger.info("[OS] Consulta %s concluída: %s", consultation_id, summary)

    except Exception as exc:
        duration = time.time() - tempo_inicio
        logger.exception("[OS] Consulta %s falhou: %s", consultation_id, exc)
        _finish_consultation(
            consultation_id,
            status="failed",
            result_summary=None,
            results_json=[],
            error_message=str(exc)[:500],
            screenshot_b64=None,
            duration_seconds=duration,
            bo_credential_id=bo_id,
        )
    finally:
        if automacao:
            try:
                automacao._fechar_sessao()
            except Exception:
                logger.debug("[OS] Erro ao fechar sessão PAP", exc_info=True)
