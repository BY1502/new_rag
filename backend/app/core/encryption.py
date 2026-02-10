"""
암호화 유틸리티
- Fernet 대칭 암호화 (API 키, 비밀번호 등)
- SECRET_KEY에서 PBKDF2로 Fernet 키 파생
"""
import base64
import logging
from functools import lru_cache

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache()
def get_fernet() -> Fernet:
    """SECRET_KEY에서 Fernet 키를 파생하여 반환합니다."""
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"ai-rag-salt",
        iterations=100_000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(settings.SECRET_KEY.encode()))
    return Fernet(key)


def encrypt_value(plaintext: str) -> str:
    """문자열을 Fernet으로 암호화하여 base64 문자열로 반환합니다."""
    f = get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Fernet 암호화된 base64 문자열을 복호화합니다."""
    f = get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
