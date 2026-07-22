"""Render injection text into real PNG pixels for true vision-channel attacks.

The existing `multimodal` suite passes SVG/HTML/PDF text *as text* — the model
never actually "sees" pixels, so it measures document-pipeline injection, not a
model-level multimodal attack (see paper §0-A). This module closes that gap: it
rasterizes the injected instruction into an image so the text exists only in the
visual channel, then hands it to a VLM as an OpenAI-compatible image part.

Pillow is an optional dependency (extras: ``pip install 'agent-redteam[vision]'``)
so the zero-dependency core stays intact — it is imported lazily and only when a
vision sample is actually rendered.
"""
from __future__ import annotations

import base64
import io

_RENDER_MODES = ("plain", "low_contrast", "tiny")


def _load_pil():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as exc:  # pragma: no cover - exercised via monkeypatch
        raise RuntimeError(
            "real-vision rendering needs Pillow. Install it with:\n"
            "    pip install 'agent-redteam[vision]'"
        ) from exc
    return Image, ImageDraw, ImageFont


def _wrap(text: str, width_chars: int) -> list[str]:
    """Greedy word-wrap; falls back to hard splits for long unbroken tokens."""
    lines: list[str] = []
    for para in text.splitlines() or [""]:
        line = ""
        for word in para.split(" "):
            while len(word) > width_chars:
                if line:
                    lines.append(line)
                    line = ""
                lines.append(word[:width_chars])
                word = word[width_chars:]
            candidate = f"{line} {word}".strip()
            if len(candidate) > width_chars and line:
                lines.append(line)
                line = word
            else:
                line = candidate
        lines.append(line)
    return lines


def _draw_block(draw, font, text, *, xy, fill, width_chars, line_h):
    x, y = xy
    for line in _wrap(text, width_chars):
        draw.text((x, y), line, fill=fill, font=font)
        y += line_h
    return y


def render_injection_png(
    visible_text: str,
    hidden_text: str = "",
    *,
    mode: str = "low_contrast",
    width: int = 1024,
    height: int = 576,
) -> bytes:
    """Rasterize an attack into a PNG whose text lives only in pixels.

    ``visible_text`` is the benign-looking foreground (the cover content the
    user thinks they uploaded). ``hidden_text`` is the injected instruction,
    placed according to ``mode``:

        plain        — injected text rendered in plain black (typographic attack)
        low_contrast — near-white on white: present to the pixel decoder but
                       low-salience to a human skimming the image (the classic
                       "hidden instruction in an image" attack)
        tiny         — small, tucked in a corner

    Returns raw PNG bytes.
    """
    if mode not in _RENDER_MODES:
        raise ValueError(f"mode must be one of {_RENDER_MODES}, got {mode!r}")
    Image, ImageDraw, ImageFont = _load_pil()
    img = Image.new("RGB", (width, height), (255, 255, 255))
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()
    width_chars = max(10, width // 8)

    _draw_block(draw, font, visible_text, xy=(40, 40),
                fill=(0, 0, 0), width_chars=width_chars, line_h=16)

    if hidden_text:
        if mode == "low_contrast":
            _draw_block(draw, font, hidden_text, xy=(40, height - 140),
                        fill=(246, 246, 246), width_chars=width_chars, line_h=14)
        elif mode == "tiny":
            draw.text((width - 260, height - 18), hidden_text[:120],
                      fill=(200, 200, 200), font=font)
        else:  # plain
            _draw_block(draw, font, hidden_text, xy=(40, height // 2),
                        fill=(0, 0, 0), width_chars=width_chars, line_h=16)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def png_to_data_uri(png_bytes: bytes) -> str:
    """Encode PNG bytes as an OpenAI-compatible ``data:`` image URL."""
    b64 = base64.b64encode(png_bytes).decode("ascii")
    return f"data:image/png;base64,{b64}"


def vision_content(text: str, png_bytes: bytes) -> list[dict]:
    """Build an OpenAI-compatible multimodal ``content`` array (text + image)."""
    return [
        {"type": "text", "text": text},
        {"type": "image_url", "image_url": {"url": png_to_data_uri(png_bytes)}},
    ]
