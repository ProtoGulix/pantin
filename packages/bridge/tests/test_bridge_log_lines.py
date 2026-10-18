"""What the bridge logs for the core's messages (ADR 0054 and its amendment of 2026-10-18)."""

from __future__ import annotations

import asyncio
import logging
from unittest.mock import AsyncMock

import pytest

from pantin_bridge.bridge import Bridge
from pantin_bridge.bus_client import BusClient
from pantin_bridge.bus_messages import Ack, BusTag, ConsoleEntry


def _logged_by(message: Ack | ConsoleEntry, caplog: pytest.LogCaptureFixture) -> list[str]:
    caplog.set_level(logging.DEBUG)
    asyncio.run(Bridge(AsyncMock(spec=BusClient), []).handle(message))
    return [
        f"{record.levelname} {record.getMessage()}"
        for record in caplog.records
        if record.name == "pantin_bridge.bridge"
    ]


def test_an_ignored_write_names_the_tag_not_the_message_id(
    caplog: pytest.LogCaptureFixture,
) -> None:
    ack = Ack("b3", BusTag("verin1.verin1.coil_14", 1, True), ignored_because_forced=True)

    assert _logged_by(ack, caplog) == [
        "INFO PLC write to verin1.verin1.coil_14 ignored: the tag is forced in the core."
    ]


def test_an_ignored_write_without_a_tag_is_still_logged(caplog: pytest.LogCaptureFixture) -> None:
    ack = Ack("b3", None, ignored_because_forced=True)

    assert _logged_by(ack, caplog) == ["INFO PLC write ignored: its tag is forced in the core."]


def test_core_console_entries_are_not_echoed(caplog: pytest.LogCaptureFixture) -> None:
    entry = ConsoleEntry("forced_tag_written", "error", {"tag": "a.b"})

    assert _logged_by(entry, caplog) == []
