"""Typed accessors for JSON values read from the core.

The bridge cannot import Zod (ADR 0045 point 2): every field it uses is checked
here, so a malformed message becomes a ProtocolError that names the field.
"""

from __future__ import annotations

import math
import re
from enum import StrEnum
from typing import Final

from pantin_bridge.errors import ProtocolError

JsonObject = dict[str, object]

# The key and tag name patterns of packages/protocol/src/ids.ts and tag.ts.
_KEY_SOURCE: Final = r"[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?"
_KEY: Final = re.compile(_KEY_SOURCE)
_TAG_NAME: Final = re.compile(rf"{_KEY_SOURCE}\.{_KEY_SOURCE}\.[a-z][a-z0-9_]{{0,31}}")


def as_object(value: object, where: str) -> JsonObject:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise ProtocolError(f"{where} must be a JSON object.")
    return {str(key): item for key, item in value.items()}


def as_list(value: object, where: str) -> list[object]:
    if not isinstance(value, list):
        raise ProtocolError(f"{where} must be a JSON array.")
    return list(value)


def as_string(value: object, where: str, *, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or (not allow_empty and value == ""):
        raise ProtocolError(f"{where} must be a non-empty string.")
    return value


def as_boolean(value: object, where: str) -> bool:
    if not isinstance(value, bool):
        raise ProtocolError(f"{where} must be a boolean.")
    return value


def as_integer(value: object, where: str, *, minimum: int | None = None) -> int:
    # bool is an int subclass in Python, but a boolean is never a number in the protocol.
    if isinstance(value, bool) or not isinstance(value, int):
        raise ProtocolError(f"{where} must be an integer.")
    if minimum is not None and value < minimum:
        raise ProtocolError(f"{where} must be at least {minimum}.")
    return value


def as_number(value: object, where: str) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise ProtocolError(f"{where} must be a number.")
    if not math.isfinite(value):
        raise ProtocolError(f"{where} must be finite.")
    return float(value)


def as_enum[Member: StrEnum](value: object, enum_type: type[Member], where: str) -> Member:
    allowed = ", ".join(member.value for member in enum_type)
    if not isinstance(value, str):
        raise ProtocolError(f"{where} must be one of {allowed}.")
    try:
        return enum_type(value)
    except ValueError:
        raise ProtocolError(f"{where} must be one of {allowed}.") from None


def as_key(value: object, where: str) -> str:
    key = as_string(value, where)
    if _KEY.fullmatch(key) is None:
        raise ProtocolError(f'{where} "{key}" is not a key (lowercase letters, digits, - and _).')
    return key


def as_tag_name(value: object, where: str) -> str:
    name = as_string(value, where)
    if _TAG_NAME.fullmatch(name) is None:
        raise ProtocolError(f'{where} "{name}" is not a tag name (<assembly>.<tag key>.<member>).')
    return name


def reject_unknown_fields(item: JsonObject, known: frozenset[str], where: str) -> None:
    unknown = sorted(set(item) - known)
    if unknown:
        raise ProtocolError(f"{where} has unknown field(s): {', '.join(unknown)}.")
