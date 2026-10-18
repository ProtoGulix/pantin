"""Zones are sized to the mapped range: an unmapped zone is empty and refuses every access."""

from __future__ import annotations

import asyncio
import logging

import pytest

from pantin_bridge.io_mapping import IoType, IoZone, zone_sizes
from pantin_bridge.modbus_server import ModbusSlave
from pantin_bridge.network_address import SourceFilter
from support import RecordingListener, free_port, make_module, make_row

HOST = "127.0.0.1"
READ_ONE_HOLDING_REGISTER = bytes.fromhex("000100000006010300000001")


def test_a_zone_without_rows_has_size_zero() -> None:
    rows = (make_row("a.coil", IoZone.COIL, 3, IoType.BOOL),)

    sizes = zone_sizes(rows)

    assert sizes[IoZone.COIL] == 4
    assert sizes[IoZone.HOLDING_REGISTER] == 0
    assert sizes[IoZone.DISCRETE_INPUT] == 0
    assert sizes[IoZone.INPUT_REGISTER] == 0


def test_a_two_register_row_sizes_its_zone_to_its_last_register() -> None:
    rows = (make_row("a.speed", IoZone.HOLDING_REGISTER, 2, IoType.REAL),)

    assert zone_sizes(rows)[IoZone.HOLDING_REGISTER] == 4


def test_reading_an_unmapped_zone_is_refused_and_journaled(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO)
    rows = (make_row("a.coil", IoZone.COIL, 0, IoType.BOOL),)

    async def scenario() -> bytes:
        port = free_port()
        slave = ModbusSlave(
            make_module(port=port),
            zone_sizes(rows),
            HOST,
            SourceFilter(),
            RecordingListener(),
        )
        await slave.start()
        try:
            reader, writer = await asyncio.open_connection(HOST, port)
            writer.write(READ_ONE_HOLDING_REGISTER)
            answer = await asyncio.wait_for(reader.read(100), timeout=2)
            writer.close()
            return answer
        finally:
            await slave.stop()

    answer = asyncio.run(scenario())

    # Function 0x83 with exception 02 (ILLEGAL_ADDRESS).
    assert answer[7:] == bytes([0x83, 0x02])
    assert any("ILLEGAL_ADDRESS (2)" in record.getMessage() for record in caplog.records)
