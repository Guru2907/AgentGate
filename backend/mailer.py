"""Deliver ALLOWED emails to a local test inbox (Mailpit). Nothing ever leaves this machine.

Mailpit (MIT, github.com/axllent/mailpit) gives a real SMTP port (1025) and a web inbox (8025). Only
localhost is accepted as the SMTP host; if Mailpit is not running, callers fall back to the outbox record.
"""

from __future__ import annotations

import mimetypes
import os
import smtplib
from email.message import EmailMessage
from pathlib import Path

LOCAL_HOSTS = {"localhost", "127.0.0.1"}
FROM_ADDR = "placement-cell@agentgate.local"
TIMEOUT_S = 3


def inbox_url() -> str:
    return os.getenv("MAILPIT_UI", "http://localhost:8025")


def _host_port() -> tuple[str, int]:
    host = os.getenv("MAILPIT_HOST", "localhost").strip()
    if host not in LOCAL_HOSTS:
        raise PermissionError(f"refusing to send to non-local SMTP host {host!r}")
    return host, int(os.getenv("MAILPIT_SMTP_PORT", "1025"))


def send(to: str, subject: str, body: str, attachment: Path | None = None) -> None:
    """Send one message to the local test inbox. Raises if Mailpit is unreachable or the host isn't local."""
    host, port = _host_port()
    msg = EmailMessage()
    msg["From"] = FROM_ADDR
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if attachment is not None:
        ctype, _ = mimetypes.guess_type(attachment.name)
        maintype, subtype = (ctype or "application/octet-stream").split("/", 1)
        msg.add_attachment(attachment.read_bytes(), maintype=maintype, subtype=subtype, filename=attachment.name)
    with smtplib.SMTP(host, port, timeout=TIMEOUT_S) as smtp:
        smtp.send_message(msg)
