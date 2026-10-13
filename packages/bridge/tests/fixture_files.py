"""Loads the fixtures shared with the TypeScript protocol (ADR 0045 point 2)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

FIXTURE_DIRECTORY = Path(__file__).resolve().parents[2] / "protocol" / "fixtures"


@dataclass(frozen=True)
class FixtureCase:
    name: str
    frame: str


def load_json(file_name: str) -> dict[str, object]:
    document = json.loads((FIXTURE_DIRECTORY / file_name).read_text(encoding="utf-8"))
    assert isinstance(document, dict)
    return {str(key): value for key, value in document.items()}


def _as_dict(value: object) -> dict[str, object]:
    assert isinstance(value, dict)
    return {str(key): item for key, item in value.items()}


def _as_list(value: object) -> list[object]:
    assert isinstance(value, list)
    return list(value)


def cases(group: dict[str, object], outcome: str) -> list[FixtureCase]:
    """Each case as the text frame the decoder would read (`text` when it is not JSON)."""
    found: list[FixtureCase] = []
    for entry in _as_list(group[outcome]):
        item = _as_dict(entry)
        text = item.get("text")
        frame = text if isinstance(text, str) else json.dumps(item.get("message"))
        found.append(FixtureCase(name=str(item["name"]), frame=frame))
    return found


def bus_cases(side: str, outcome: str) -> list[FixtureCase]:
    return cases(_as_dict(load_json("tag-bus-messages.json")[side]), outcome)


def io_cases(outcome: str) -> list[FixtureCase]:
    return cases(load_json("io-mapping-responses.json"), outcome)


def message_of(case: FixtureCase) -> dict[str, object]:
    return _as_dict(json.loads(case.frame))
