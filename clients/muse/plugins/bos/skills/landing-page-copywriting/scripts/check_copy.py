#!/usr/bin/env python3
"""Estimate copy readability and flag common jargon."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


JARGON = {
    "best-in-class", "cutting-edge", "disruptive", "ecosystem", "end-to-end",
    "innovative", "leverage", "next-generation", "optimize", "proprietary",
    "revolutionary", "robust", "scalable", "seamless", "solution", "synergy",
    "transformative", "turnkey", "utilize",
}


def syllables(word: str) -> int:
    word = re.sub(r"[^a-z]", "", word.lower())
    if not word:
        return 0
    groups = re.findall(r"[aeiouy]+", word)
    count = len(groups)
    if word.endswith("e") and not word.endswith(("le", "ye")) and count > 1:
        count -= 1
    return max(1, count)


def analyze(text: str) -> dict[str, object]:
    words = re.findall(r"\b[A-Za-z][A-Za-z'-]*\b", text)
    sentences = [s for s in re.split(r"[.!?]+", text) if re.search(r"[A-Za-z]", s)]
    word_count = len(words)
    sentence_count = max(1, len(sentences))
    syllable_count = sum(syllables(word) for word in words)
    grade = 0.39 * (word_count / sentence_count) + 11.8 * (syllable_count / max(1, word_count)) - 15.59
    lower = text.lower()
    flagged = sorted(term for term in JARGON if re.search(rf"\b{re.escape(term)}\b", lower))
    long_sentences = []
    for sentence in sentences:
        count = len(re.findall(r"\b[A-Za-z][A-Za-z'-]*\b", sentence))
        if count > 20:
            long_sentences.append((count, " ".join(sentence.split())))
    return {
        "words": word_count,
        "sentences": sentence_count,
        "average_sentence_words": word_count / sentence_count,
        "grade": max(0.0, grade),
        "jargon": flagged,
        "long_sentences": long_sentences,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path)
    parser.add_argument("--target-grade", type=float, default=5.0)
    args = parser.parse_args()
    result = analyze(args.file.read_text(encoding="utf-8"))
    print(f"Words: {result['words']}")
    print(f"Sentences: {result['sentences']}")
    print(f"Average sentence length: {result['average_sentence_words']:.1f} words")
    print(f"Estimated Flesch-Kincaid grade: {result['grade']:.1f}")
    print("Jargon: " + (", ".join(result["jargon"]) or "none flagged"))
    if result["long_sentences"]:
        print("Sentences over 20 words:")
        for count, sentence in result["long_sentences"]:
            print(f"- {count} words: {sentence}")
    return 1 if result["grade"] > args.target_grade or result["jargon"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
