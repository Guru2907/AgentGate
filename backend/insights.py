import re
from typing import Any

from backend.schemas import ToolCall, Egress, CallExtras
from backend import gate


_HIDDEN_PATTERNS = [
    r"<!--(.*?)-->",
    r"(?im)^.*SYSTEM:.*$",
    r"(?im)^.*ignore\s+previous\s+instructions.*$",
    r"(?im)^.*you\s+are\s+now.*$",
    r"(?im)^.*admin\s+mode.*$",
    r"(?im)^.*(email|send|delete)\b.*\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b.*$",
    r"(?im)^.*(email|send|delete)\b.*\bsandbox/.*$",
]


def hidden_instructions(text: str) -> str | None:
    if not text:
        return None

    found_lines: list[str] = []
    seen = set()

    # Extract HTML comments content specifically
    for match in re.finditer(r"<!--(.*?)-->", text, re.DOTALL):
        line = match.group(1).strip()
        if line and line not in seen:
            seen.add(line)
            found_lines.append(line)

    # Check line-by-line patterns
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped in seen:
            continue
        for pattern in _HIDDEN_PATTERNS[1:]:  # skip HTML comment pattern, handled above
            if re.search(pattern, stripped):
                seen.add(stripped)
                found_lines.append(stripped)
                break

    return "\n".join(found_lines) if found_lines else None


def egress_preview(call: Any, policy: dict) -> Egress | None:
    if not isinstance(call, ToolCall) or call.tool != "send_email":
        return None

    args = call.args or {}
    recipient = args.get("to")
    attachment = args.get("attachment")
    subject = args.get("subject", "")
    body = args.get("body", "")

    detected: list[str] = []

    # 1. Confidential file attachment
    if attachment:
        sensitive_files = policy.get("global", {}).get("sensitive_files", [])
        if gate.matches_sensitive(attachment, sensitive_files):
            if "confidential file" not in detected:
                detected.append("confidential file")

    # 2. Sensitive data in subject/body (including decoded views)
    texts = [subject, body]
    decoded_texts = gate.get_decoded_views(texts)
    all_texts = texts + decoded_texts
    combined_text = " ".join(all_texts)

    sensitive_patterns = policy.get("global", {}).get("sensitive_patterns", {})

    if "phone" in sensitive_patterns and re.search(sensitive_patterns["phone"], combined_text):
        if "phone" not in detected:
            detected.append("phone")

    if "id_number" in sensitive_patterns and re.search(sensitive_patterns["id_number"], combined_text):
        if "id number" not in detected:
            detected.append("id number")

    if "email_list" in sensitive_patterns and re.search(sensitive_patterns["email_list"], combined_text):
        if "email list" not in detected:
            detected.append("email list")

    # 3. Confidential content (fingerprint overlap >= 3)
    conf_fps = gate.get_confidential_fingerprints(policy)
    if conf_fps:
        text_fps = gate.get_fingerprints(combined_text)
        overlap = len(text_fps & conf_fps)
        if overlap >= 3:
            if "confidential content" not in detected:
                detected.append("confidential content")

    return Egress(recipient=recipient, attachment=attachment, detected=detected)