"""Executa consulta de crédito PAP Nio para o Plano Ideal."""
from __future__ import annotations

import logging
import re
import time

from config import (
    CREDITO_CEP_FIXO,
    CREDITO_ENDERECO_ALVO,
    CREDITO_NUMERO_FIXO,
    CREDITO_REFERENCIA_FIXA,
    settings,
)
from credito_utils import gerar_celular_random, gerar_email_credito
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


def _pick_tt_matricula(cur, exclude: set[str]) -> str | None:
    cur.execute(
        """
        SELECT m.matricula
        FROM pap_tt_matriculas m
        LEFT JOIN pap_tt_daily_usage u
          ON u.matricula = m.matricula AND u.usage_date = CURRENT_DATE
        WHERE m.enabled = true
          AND COALESCE(u.consultas, 0) < %s
        ORDER BY COALESCE(u.consultas, 0) ASC, m.id ASC
        """,
        [settings.PAP_CREDITO_MAX_CONSULTAS_POR_TT_DIA],
    )
    rows = cur.fetchall()
    for row in rows:
        mat = (row["matricula"] or "").strip()
        if mat and mat not in exclude:
            return mat
    return None


def _register_tt_usage(matricula: str) -> None:
    with db_cursor() as (_conn, cur):
        cur.execute(
            """
            INSERT INTO pap_tt_daily_usage (matricula, usage_date, consultas)
            VALUES (%s, CURRENT_DATE, 1)
            ON CONFLICT (matricula, usage_date)
            DO UPDATE SET consultas = pap_tt_daily_usage.consultas + 1
            """,
            [matricula],
        )


def _set_tt_matricula(consultation_id: int, matricula: str) -> None:
    with db_cursor() as (_conn, cur):
        cur.execute(
            "UPDATE credit_consultations SET pap_tt_matricula = %s WHERE id = %s",
            [matricula, consultation_id],
        )


def _finish_consultation(
    consultation_id: int,
    *,
    status: str,
    approved: bool | None,
    result_detail: str | None,
    error_message: str | None,
    screenshot_b64: str | None,
    duration_seconds: float,
    bo_credential_id: int | None,
) -> None:
    with db_cursor() as (_conn, cur):
        cur.execute(
            """
            UPDATE credit_consultations
            SET status = %s,
                approved = %s,
                result_detail = %s,
                error_message = %s,
                screenshot_base64 = %s,
                duration_seconds = %s,
                pap_bo_credential_id = %s,
                finished_at = NOW()
            WHERE id = %s
            """,
            [
                status,
                approved,
                result_detail,
                error_message,
                screenshot_b64,
                round(duration_seconds, 1),
                bo_credential_id,
                consultation_id,
            ],
        )
        _release_bo(cur, bo_credential_id)


def _load_consultation_context(consultation_id: int) -> dict | None:
    """Carrega dados da consulta e credencial BO sem manter transação aberta."""
    with db_cursor() as (_conn, cur):
        cur.execute(
            """
            SELECT id, document, cpf_representative, pap_bo_credential_id
            FROM credit_consultations
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
                approved=None,
                result_detail=None,
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
                approved=None,
                result_detail=None,
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
                approved=None,
                result_detail=None,
                error_message="Credencial PAP incompleta.",
                screenshot_b64=None,
                duration_seconds=0,
                bo_credential_id=bo["id"],
            )
            return None

        return {
            "document": _digits(consultation["document"]),
            "cpf_rep": _digits(consultation["cpf_representative"] or ""),
            "bo_id": bo["id"],
            "matricula_pap": matricula_pap,
            "senha_encrypted": senha_encrypted,
        }


def execute_credit_consultation(consultation_id: int) -> None:
    from crypto_secret import decrypt_secret

    ctx = _load_consultation_context(consultation_id)
    if not ctx:
        return

    document = ctx["document"]
    cpf_rep = ctx["cpf_rep"]
    bo_id = ctx["bo_id"]
    matricula_pap = ctx["matricula_pap"]
    senha_pap = decrypt_secret(ctx["senha_encrypted"])

    tempo_inicio = time.time()
    automacao = None
    screenshot_b64 = None

    try:
        automacao = PAPNioAutomation(
            matricula_pap=matricula_pap,
            senha_pap=senha_pap,
            vendedor_nome=f"PlanoIdeal-{consultation_id}",
            headless=settings.PAP_HEADLESS,
            capture_screenshots=getattr(settings, "PAP_CAPTURE_SCREENSHOTS_CREDITO", False),
            optimize_for_credit=settings.PAP_CREDITO_FAST_MODE,
        )

        ok, msg = automacao.iniciar_sessao()
        if not ok:
            raise RuntimeError(f"Erro ao acessar PAP: {msg}")
        logger.info("[CRÉDITO] Consulta %s: login PAP OK", consultation_id)

        ok_prep, msg_prep = automacao._preparar_novo_pedido_etapa1()
        if not ok_prep:
            raise RuntimeError(f"Erro ao iniciar pedido: {msg_prep}")

        excluir_tt: set[str] = set()
        matricula_pedido = None
        sucesso = False
        msg = ""
        max_tentativas_tt = 8

        for tentativa in range(1, max_tentativas_tt + 1):
            with db_cursor() as (_conn, cur):
                matricula_pedido = _pick_tt_matricula(cur, excluir_tt) or matricula_pap
            sucesso, msg = automacao._concluir_novo_pedido_etapa1(matricula_pedido)
            if sucesso:
                _register_tt_usage(matricula_pedido)
                _set_tt_matricula(consultation_id, matricula_pedido)
                break
            msg_lower = (msg or "").lower()
            tt_indisponivel = "não encontrada no pap" in msg_lower or "nao encontrada no pap" in msg_lower
            if tt_indisponivel and tentativa < max_tentativas_tt and matricula_pedido:
                excluir_tt.add(matricula_pedido)
                continue
            break

        if not sucesso:
            raise RuntimeError(f"Erro ao selecionar vendedor TT: {msg}")

        ok_tela, msg_tela = automacao.validar_tela_pronta_para_cep()
        if not ok_tela:
            raise RuntimeError(f"Página não pronta: {msg_tela}")

        sucesso, msg, extra = automacao.etapa2_viabilidade(
            CREDITO_CEP_FIXO, CREDITO_NUMERO_FIXO, CREDITO_REFERENCIA_FIXA
        )
        if isinstance(extra, dict) and extra.get("_codigo") == "COMPLEMENTOS":
            sucesso, msg, extra = automacao.etapa2_credito_selecionar_complemento_e_avancar(
                CREDITO_CEP_FIXO, CREDITO_NUMERO_FIXO, 1
            )

        if not sucesso and isinstance(extra, dict) and extra.get("_codigo") == "MULTIPLOS_ENDERECOS":
            lista = extra.get("lista", [])
            idx = 1
            for item in lista:
                txt = (item.get("texto") or "").upper()
                if CREDITO_ENDERECO_ALVO.upper() in txt and CREDITO_NUMERO_FIXO in txt:
                    idx = item.get("indice", 1)
                    break
            ok_sel, _ = automacao.etapa2_selecionar_endereco_instalacao(idx)
            if ok_sel:
                sucesso, msg, extra = automacao.etapa2_preencher_referencia_e_continuar(
                    CREDITO_CEP_FIXO, CREDITO_NUMERO_FIXO, CREDITO_REFERENCIA_FIXA
                )
                if isinstance(extra, dict) and extra.get("_codigo") == "COMPLEMENTOS":
                    sucesso, msg, extra = automacao.etapa2_credito_selecionar_complemento_e_avancar(
                        CREDITO_CEP_FIXO, CREDITO_NUMERO_FIXO, 1
                    )

        if not sucesso:
            raise RuntimeError(msg or "Falha na viabilidade.")

        sucesso, msg, _ = automacao.etapa3_cadastro_cliente(
            document, cpf_representante=cpf_rep or None
        )
        if not sucesso:
            raise RuntimeError(msg or "Falha no cadastro do cliente.")

        cel = gerar_celular_random()
        cel_sec = gerar_celular_random()
        email = gerar_email_credito()
        logger.info(
            "[CRÉDITO] Consulta %s — etapa 4 contato: cel=%s cel_sec=%s email=%s",
            consultation_id,
            cel,
            cel_sec,
            email,
        )
        aprovado = False
        resultado_credito = None

        for _ in range(5):
            sucesso, msg, resultado_credito, screenshot_b64 = automacao.etapa4_contato(
                cel, email, celular_secundario=cel_sec, parar_no_modal_credito=True
            )
            if sucesso:
                break
            if msg in ("TELEFONE_REJEITADO",):
                cel = gerar_celular_random()
                cel_sec = gerar_celular_random()
                logger.info(
                    "[CRÉDITO] Consulta %s — telefone rejeitado, novos: cel=%s cel_sec=%s",
                    consultation_id,
                    cel,
                    cel_sec,
                )
                continue
            if msg in ("EMAIL_REJEITADO", "EMAIL_INVALIDO"):
                email = gerar_email_credito()
                logger.info(
                    "[CRÉDITO] Consulta %s — e-mail rejeitado, novo: %s",
                    consultation_id,
                    email,
                )
                continue
            if msg == "CREDITO_NEGADO":
                break
            raise RuntimeError(msg or "Erro na análise de crédito.")

        aprovado = msg != "CREDITO_NEGADO" and sucesso
        duration = time.time() - tempo_inicio

        if aprovado:
            logger.info("[CRÉDITO] Consulta %s: APROVADO em %.1fs", consultation_id, duration)
            _finish_consultation(
                consultation_id,
                status="success",
                approved=True,
                result_detail=resultado_credito or "Elegível para formas de pagamento disponíveis.",
                error_message=None,
                screenshot_b64=screenshot_b64,
                duration_seconds=duration,
                bo_credential_id=bo_id,
            )
        else:
            logger.info("[CRÉDITO] Consulta %s: NEGADO em %.1fs", consultation_id, duration)
            _finish_consultation(
                consultation_id,
                status="success",
                approved=False,
                result_detail=resultado_credito,
                error_message="Crédito negado para este documento.",
                screenshot_b64=screenshot_b64,
                duration_seconds=duration,
                bo_credential_id=bo_id,
            )

    except Exception as exc:
        logger.exception("[CRÉDITO] Erro na consulta %s: %s", consultation_id, exc)
        duration = time.time() - tempo_inicio
        _finish_consultation(
            consultation_id,
            status="failed",
            approved=None,
            result_detail=None,
            error_message=str(exc),
            screenshot_b64=screenshot_b64,
            duration_seconds=duration,
            bo_credential_id=bo_id,
        )
    finally:
        if automacao:
            try:
                automacao._fechar_sessao()
            except Exception:
                pass
