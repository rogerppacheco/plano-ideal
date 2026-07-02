"""Descriptografia de senhas PAP (AES-256-GCM, compatível com backend Node)."""
from __future__ import annotations

import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import settings


def _derive_key(secret: str) -> bytes:
    raw = (secret or "").encode("utf-8")
    if not raw:
        raise RuntimeError("PAP_CREDENTIALS_SECRET não configurada.")
    return hashlib.sha256(raw).digest()


def decrypt_secret(payload: str) -> str:
    """Formato: base64(iv[12] + authTag[16] + ciphertext)."""
    secret = settings.PAP_CREDENTIALS_SECRET or os.environ.get("PAP_CREDENTIALS_SECRET", "")
    key = _derive_key(secret)
    raw = base64.b64decode(payload)
    iv = raw[:12]
    tag = raw[12:28]
    ciphertext = raw[28:]
    aes = AESGCM(key)
    plain = aes.decrypt(iv, ciphertext + tag, None)
    return plain.decode("utf-8")
