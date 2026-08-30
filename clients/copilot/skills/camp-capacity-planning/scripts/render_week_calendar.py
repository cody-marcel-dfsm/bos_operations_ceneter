#!/usr/bin/env python3
"""Render a Monday-Friday camp roster calendar from verified JSON data."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
import textwrap
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape


COLORS = {
    "background": "#F4F7FB",
    "border": "#D7DFEA",
    "header": "#2457A7",
    "title": "#14213D",
    "paid_label": "#2457A7",
    "paid_text": "#182230",
    "bh_label": "#B35C00",
    "bh_text": "#4A2A00",
    "care_label": "#007A5E",
    "care_text": "#005A46",
}


def roster_line(entry: Any) -> str:
    if isinstance(entry, dict):
        name = str(entry.get("name", "")).strip()
        camp = str(entry.get("camp", "")).strip()
        if not name or not camp:
            raise ValueError("each roster object requires non-empty name and camp")
        return f"{name} — {camp}"
    if isinstance(entry, str) and " — " in entry:
        name, camp = (value.strip() for value in entry.split(" — ", 1))
        if name and camp:
            return f"{name} — {camp}"
    raise ValueError("each roster entry must identify both student and camp")


def normalized_days(data: dict[str, Any]) -> list[dict[str, Any]]:
    days = data.get("days")
    if not isinstance(days, list) or len(days) != 5:
        raise ValueError("calendar requires exactly five weekday objects")
    normalized = []
    for day in days:
        if not isinstance(day, dict) or not str(day.get("date", "")).strip():
            raise ValueError("each weekday requires a date label")
        normalized.append(
            {
                "date": str(day["date"]).strip(),
                "paid": [roster_line(item) for item in day.get("paid", [])],
                "bh": [roster_line(item) for item in day.get("bh", [])],
                "care_com": [roster_line(item) for item in day.get("care_com", [])],
            }
        )
    return normalized


def wrapped(text: str) -> list[str]:
    return textwrap.wrap(text, width=28, break_long_words=False, break_on_hyphens=False) or [""]


def text_element(
    x: int,
    y: int,
    value: str,
    size: int,
    color: str,
    bold: bool = False,
) -> str:
    weight = "700" if bold else "400"
    return (
        f'<text x="{x}" y="{y}" fill="{color}" font-family="Arial, DejaVu Sans, sans-serif" '
        f'font-size="{size}" font-weight="{weight}">{escape(value)}</text>'
    )


def build_svg(data: dict[str, Any]) -> str:
    days = normalized_days(data)
    width, margin, gap = 1800, 48, 16
    card_w = (width - 2 * margin - 4 * gap) // 5
    max_lines = 0
    for day in days:
        roster_lines = sum(
            len(wrapped(line))
            for key in ("paid", "bh", "care_com")
            for line in day[key]
        )
        populated_groups = sum(bool(day[key]) for key in ("paid", "bh", "care_com"))
        max_lines = max(max_lines, roster_lines + 2 * populated_groups)
    height = max(760, 300 + max_lines * 34)

    elements = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        f'<rect width="{width}" height="{height}" fill="{COLORS["background"]}"/>',
        text_element(margin, 65, str(data.get("title", "Camp Calendar")), 40, COLORS["title"], True),
    ]
    groups = (
        ("paid", "Paid", COLORS["paid_label"], COLORS["paid_text"]),
        ("bh", str(data.get("bh_label", "Provisional BH")), COLORS["bh_label"], COLORS["bh_text"]),
        (
            "care_com",
            str(data.get("care_com_label", "Confirmed Care.com")),
            COLORS["care_label"],
            COLORS["care_text"],
        ),
    )

    for index, day in enumerate(days):
        x = margin + index * (card_w + gap)
        y = 100
        elements.extend(
            [
                f'<rect x="{x}" y="{y}" width="{card_w}" height="{height - margin - y}" rx="18" fill="white" stroke="{COLORS["border"]}" stroke-width="2"/>',
                f'<rect x="{x}" y="{y}" width="{card_w}" height="76" rx="18" fill="{COLORS["header"]}"/>',
                f'<rect x="{x}" y="{y + 58}" width="{card_w}" height="18" fill="{COLORS["header"]}"/>',
                text_element(x + 18, y + 48, day["date"], 28, "white", True),
            ]
        )
        cursor = y + 122
        for key, label, label_color, line_color in groups:
            entries = day[key]
            if not entries:
                continue
            elements.append(text_element(x + 18, cursor, label, 20, label_color, True))
            cursor += 34
            for entry in entries:
                for line in wrapped(entry):
                    elements.append(text_element(x + 18, cursor, line, 23, line_color))
                    cursor += 34
            cursor += 14
        total = len(day["paid"]) + len(day["bh"]) + len(day["care_com"])
        elements.append(
            text_element(x + 18, height - margin - 20, f"Headcount: {total}", 20, COLORS["title"], True)
        )

    elements.append("</svg>")
    return "\n".join(elements) + "\n"


def write_output(svg: str, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.suffix.lower() == ".svg":
        output.write_text(svg, encoding="utf-8")
        return
    if output.suffix.lower() != ".png":
        raise ValueError("output must use .png or .svg")
    converter = shutil.which("rsvg-convert")
    if not converter:
        raise RuntimeError("PNG output requires rsvg-convert; use an .svg output when unavailable")
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".svg", encoding="utf-8", dir=output.parent, delete=False
    ) as handle:
        handle.write(svg)
        temporary_svg = Path(handle.name)
    try:
        subprocess.run(
            [converter, "--output", str(output), str(temporary_svg)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
    finally:
        temporary_svg.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    write_output(build_svg(data), args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
