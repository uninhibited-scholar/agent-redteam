"""Conservative decoding helpers for content-based security checks."""
from __future__ import annotations

import base64
import binascii
import re
from urllib.parse import unquote


_BASE64_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{24,}={0,2}(?![A-Za-z0-9+/])")


def decoded_variants(text: str) -> list[str]:
    """Return the original text plus safe URL/Base64 decodings.

    Only printable UTF-8 Base64 payloads are considered. This avoids treating
    arbitrary binary-looking text as evidence while still catching common
    encoding-based attempts to hide a response payload.
    """
    variants = [text]
    url_decoded = unquote(text)
    if url_decoded != text:
        variants.append(url_decoded)
    for token in _BASE64_TOKEN_RE.findall(text):
        padded = token + "=" * (-len(token) % 4)
        try:
            decoded = base64.b64decode(padded, validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError, binascii.Error):
            continue
        if decoded.isprintable() and decoded not in variants:
            variants.append(decoded)
    return variants
