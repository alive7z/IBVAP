"""Conservative plate text normalization.

Rules applied:
  - uppercase
  - strip surrounding whitespace
  - collapse internal runs of whitespace to a single space
  - remove clearly unsupported punctuation (dots, quotes, slashes, underscores,
    braces, etc.) while keeping a hyphen as a possible plate separator

We deliberately do NOT perform speculative character substitution such as
O↔0 or I↔1 unless a documented plate-format rule requires it. Callers must
keep raw_text alongside normalized_text.
"""

import re

# Characters considered supported in a normalized plate (India/dev context).
ALLOWED = re.compile(r"[^A-Z0-9 -]")
# Punctuation we strip out entirely (never replaced with a digit/letter).
UNSUPPORTED = set(".,;:'\"`~!@#$%^&*()[]{}<>_+=/\\|")


def normalize_plate_text(raw: str | None) -> str | None:
    """Return the normalized plate text, or None when input is empty/None."""
    if not raw:
        return None
    text = raw.upper().strip()
    text = re.sub(r"\s+", " ", text)
    # Remove unsupported punctuation characters.
    text = "".join(ch for ch in text if ch not in UNSUPPORTED)
    text = re.sub(r"\s+", "", text)  # drop internal spaces for a compact form
    text = text.strip(" -")
    return text or None


def is_equivalent(canonical_a: str | None, candidate_b: str | None) -> bool:
    """Cheap equality for consensus — exact normalized match (no fuzzy logic)."""
    if not canonical_a or not candidate_b:
        return False
    return canonical_a == candidate_b
