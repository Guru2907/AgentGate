"""Password, opaque-session, CSRF and reset-email helpers for browser authentication."""

import hashlib
import hmac
import os
import secrets
import smtplib
import ssl
import time
from email.message import EmailMessage
from urllib.parse import quote

from fastapi import HTTPException, Request, Response
from pwdlib import PasswordHash
from pwdlib.exceptions import PwdlibError

from backend import db

COOKIE_NAME = "agentgate_session"
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
RESET_TTL_SECONDS = 30 * 60
PASSWORD_HASHER = PasswordHash.recommended()
_DUMMY_PASSWORD_HASH = PASSWORD_HASHER.hash(secrets.token_urlsafe(32))


def _truthy(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.casefold() in {"1", "true", "yes", "on"}


def cookie_secure() -> bool:
    return _truthy(os.getenv("COOKIE_SECURE"), os.getenv("APP_ENV", "development").casefold() == "production")


def allowed_origins() -> list[str]:
    configured = os.getenv("APP_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]


def validate_origin(request: Request) -> None:
    origin = request.headers.get("origin", "").rstrip("/")
    if not origin or origin not in allowed_origins():
        raise HTTPException(status_code=403, detail="Request origin is not allowed.")


def hash_password(password: str) -> str:
    return PASSWORD_HASHER.hash(password)


def verify_password(password: str, encoded_hash: str | None) -> bool:
    expected_hash = encoded_hash or _DUMMY_PASSWORD_HASH
    try:
        matches = PASSWORD_HASHER.verify(password, expected_hash)
    except (PwdlibError, ValueError):
        return False
    return matches and encoded_hash is not None


def _digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def token_hash(token: str) -> str:
    return _digest(token)


def create_session(response: Response, user_id: int) -> tuple[str, str]:
    session_token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    expires_at = time.time() + SESSION_TTL_SECONDS
    db.create_session(_digest(session_token), csrf_token, user_id, expires_at)
    response.set_cookie(
        COOKIE_NAME,
        session_token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        path="/",
    )
    return csrf_token, session_token


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        secure=cookie_secure(),
        httponly=True,
        samesite="lax",
    )


def current_session(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Please sign in to continue.")
    session = db.get_session(_digest(token))
    if session is None:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    return session


def require_user(request: Request) -> dict:
    return current_session(request)


def require_write_user(request: Request) -> dict:
    session = current_session(request)
    provided = request.headers.get("x-csrf-token", "")
    expected = session["csrf_token"]
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=403, detail="Your security token is missing or expired. Refresh and try again.")
    return session


def public_user(session_or_user: dict) -> dict:
    return {
        "id": session_or_user["id"],
        "workspace_id": session_or_user["workspace_id"],
        "full_name": session_or_user["full_name"],
        "email": session_or_user["email"],
        "created_at": session_or_user["created_at"],
        "updated_at": session_or_user["updated_at"],
    }


def rate_limit_key(kind: str, value: str) -> str:
    return hashlib.sha256(f"{kind}:{value}".encode("utf-8")).hexdigest()


def new_reset_token(user_id: int) -> tuple[str, float]:
    token = secrets.token_urlsafe(32)
    expires_at = time.time() + RESET_TTL_SECONDS
    db.add_password_reset_token(_digest(token), user_id, expires_at)
    return token, expires_at


def consume_reset_token(token: str, new_password: str) -> bool:
    return db.reset_password(_digest(token), hash_password(new_password))


def password_reset_enabled() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_FROM"))


def send_password_reset_email(email: str, token: str) -> None:
    host = os.getenv("SMTP_HOST", "")
    sender = os.getenv("SMTP_FROM", "")
    if not host or not sender:
        raise RuntimeError("Password-reset email is not configured.")

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    reset_url = f"{frontend_url}/#/reset-password?token={quote(token)}"
    message = EmailMessage()
    message["Subject"] = "Reset your AgentGate password"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        "We received a request to reset your AgentGate password.\n\n"
        f"Choose a new password using this one-time link (valid for 30 minutes):\n{reset_url}\n\n"
        "If you did not request this, you can ignore this email."
    )

    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    use_ssl = _truthy(os.getenv("SMTP_USE_SSL"))
    use_starttls = _truthy(os.getenv("SMTP_STARTTLS"), default=not use_ssl)
    timeout = 10

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, timeout=timeout, context=ssl.create_default_context()) as server:
            if username:
                server.login(username, password)
            server.send_message(message)
        return

    with smtplib.SMTP(host, port, timeout=timeout) as server:
        server.ehlo()
        if use_starttls:
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
        elif os.getenv("APP_ENV", "development").casefold() == "production":
            raise RuntimeError("SMTP must use TLS in production.")
        if username:
            server.login(username, password)
        server.send_message(message)
