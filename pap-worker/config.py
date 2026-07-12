"""Configuração do worker PAP (substitui django.conf.settings)."""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


class Settings:
    BASE_DIR = BASE_DIR
    PAP_CAPTURE_SCREENSHOTS = os.environ.get("PAP_CAPTURE_SCREENSHOTS", "").lower() in ("1", "true", "yes")
    PAP_CAPTURE_SCREENSHOTS_CREDITO = os.environ.get("PAP_CAPTURE_SCREENSHOTS_CREDITO", "").lower() in (
        "1",
        "true",
        "yes",
    )
    PAP_SCREENSHOTS_R2 = False
    PAP_HEADLESS = os.environ.get("PAP_HEADLESS", "true").lower() in ("1", "true", "yes")
    PAP_CREDITO_FAST_MODE = os.environ.get("PAP_CREDITO_FAST_MODE", "true").lower() in ("1", "true", "yes")
    PAP_OS_FAST_MODE = os.environ.get("PAP_OS_FAST_MODE", "true").lower() in ("1", "true", "yes")
    PAP_CAPTURE_SCREENSHOTS_OS = os.environ.get("PAP_CAPTURE_SCREENSHOTS_OS", "").lower() in (
        "1",
        "true",
        "yes",
    )
    PAP_CREDITO_MAX_CONSULTAS_POR_TT_DIA = int(os.environ.get("PAP_CREDITO_MAX_CONSULTAS_POR_TT_DIA", "6"))
    PAP_WORKER_POLL_SECONDS = float(os.environ.get("PAP_WORKER_POLL_SECONDS", "2"))
    PAP_BO_LOCK_TIMEOUT_MINUTES = int(os.environ.get("PAP_BO_LOCK_TIMEOUT_MINUTES", "30"))
    DB_SCHEMA = os.environ.get("DB_SCHEMA", "plano_ideal")
    DATABASE_URL = os.environ.get("DATABASE_URL", "")
    PAP_CREDENTIALS_SECRET = os.environ.get("PAP_CREDENTIALS_SECRET", "")


settings = Settings()

CREDITO_CEP_FIXO = "32140000"
CREDITO_NUMERO_FIXO = "712"
CREDITO_REFERENCIA_FIXA = "do lado da mecânica"
CREDITO_ENDERECO_ALVO = "Avenida Fernão Dias"
