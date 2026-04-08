"""Logging utilities with PII redaction."""
import hashlib
import logging
import re
from typing import Optional


def setup_logger(name: str, level: str = "INFO") -> logging.Logger:
    """
    Configura um logger estruturado.
    
    Args:
        name: Nome do logger (geralmente __name__)
        level: Nível de log (DEBUG, INFO, WARNING, ERROR, CRITICAL)
    
    Returns:
        Logger configurado
    """
    logger = logging.getLogger(name)
    
    # Configurar nível
    log_level = getattr(logging, level.upper(), logging.INFO)
    logger.setLevel(log_level)
    
    # Evitar duplicação de handlers
    if logger.handlers:
        return logger
    
    # Handler para console
    handler = logging.StreamHandler()
    handler.setLevel(log_level)
    
    # Formato estruturado
    formatter = logging.Formatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    
    logger.addHandler(handler)
    
    return logger


def mask_email(email: str) -> str:
    """
    Mascara um email para logs.
    
    Exemplos:
        user@example.com -> u***@e***.com
        admin@test.org -> a***@t***.org
    """
    if not email or '@' not in email:
        return "***"
    
    try:
        local, domain = email.split('@', 1)
        domain_parts = domain.split('.')
        
        masked_local = local[0] + '***' if len(local) > 0 else '***'
        masked_domain_name = domain_parts[0][0] + '***' if len(domain_parts[0]) > 0 else '***'
        
        if len(domain_parts) > 1:
            masked_domain = f"{masked_domain_name}.{'.'.join(domain_parts[1:])}"
        else:
            masked_domain = masked_domain_name
        
        return f"{masked_local}@{masked_domain}"
    except Exception:
        return "***@***.***"


def hash_email(email: str) -> str:
    """
    Retorna um hash SHA256 do email (8 primeiros caracteres).
    Útil para correlacionar logs sem expor o email real.
    
    Exemplo:
        user@example.com -> user_a3f5b2c1
    """
    if not email:
        return "unknown"
    
    try:
        email_hash = hashlib.sha256(email.encode()).hexdigest()[:8]
        return f"user_{email_hash}"
    except Exception:
        return "user_unknown"


def mask_phone(phone: str) -> str:
    """
    Mascara um telefone para logs.
    
    Exemplos:
        +55 11 98765-4321 -> +55 11 98***-****
        (11) 98765-4321 -> (11) 98***-****
    """
    if not phone:
        return "***"
    
    # Remover caracteres não numéricos para análise
    digits = re.sub(r'\D', '', phone)
    
    if len(digits) < 4:
        return "***"
    
    # Manter formato original mas mascarar dígitos finais
    masked = re.sub(r'\d(?=\d{4})', '*', phone)
    return masked


def redact_pii(text: str) -> str:
    """
    Remove/mascara PII comum de uma string genérica.
    Útil para sanitizar mensagens antes de logar.
    
    Remove:
    - Emails (substitui por e***@d***.com)
    - CPFs (substitui por ***.***.***-**)
    - Telefones (substitui por padrão mascarado)
    """
    # Mascarar emails
    text = re.sub(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
        lambda m: mask_email(m.group(0)),
        text
    )
    
    # Mascarar CPFs (formato: 123.456.789-01)
    text = re.sub(
        r'\b\d{3}\.\d{3}\.\d{3}-\d{2}\b',
        '***.***.***-**',
        text
    )
    
    # Mascarar telefones brasileiros (vários formatos)
    text = re.sub(
        r'\+?55\s?\(?\d{2}\)?\s?\d{4,5}-?\d{4}',
        '+55 (**) *****-****',
        text
    )
    
    return text


# Exemplo de uso:
# from .logging_utils import setup_logger, mask_email, hash_email
# 
# logger = setup_logger(__name__)
# logger.info(f"Login attempt - User: {hash_email(email)}")
# logger.debug(f"Request from: {mask_email(email)}")
