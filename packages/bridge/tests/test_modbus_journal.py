"""The connection log (ADR 0054 point 3): what a PLC did, read from the log records."""

from __future__ import annotations

import asyncio
import logging
import struct

import pytest

from pantin_bridge.modbus_journal import MAX_LOGGED_REFUSALS, ConnectionJournal
from pantin_bridge.modbus_pdu import ModbusStore, handle_pdu
from slave_harness import HOST, SIZES, started_slave
from support import RecordingListener, eventually

REFUSED_READ = struct.pack(">HH", 99, 1)


def _request(transaction: int, function_code: int, body: bytes, unit_id: int = 1) -> bytes:
    return (
        struct.pack(">HHHB", transaction, 0, len(body) + 2, unit_id) + bytes([function_code]) + body
    )


def test_the_first_identical_refusal_is_a_warning_and_the_rest_are_counted(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO)
    store = ModbusStore(1, SIZES)
    journal = ConnectionJournal("m1", "10.0.0.5")
    journal.opened()
    refusal = handle_pdu(1, bytes([3]) + REFUSED_READ, store)
    for _ in range(3):
        journal.request_handled(refusal)
    journal.request_handled(handle_pdu(2, bytes([6]) + struct.pack(">HH", 0, 1), store))
    journal.request_handled(handle_pdu(1, bytes([3]) + struct.pack(">HH", 0, 1), store))
    journal.closed("the PLC finished sending")

    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert warnings == [
        "Module m1 refused a request from 10.0.0.5: unit 1, function 3, address 99, "
        "quantity 1 -> ILLEGAL_ADDRESS (2).",
        "Module m1 refused a request from 10.0.0.5: unit 2, function 6, address 0, "
        "quantity 1 -> GATEWAY_NO_RESPONSE (11); this module answers unit 1.",
    ]
    assert caplog.records[0].getMessage() == "Module m1 accepted a connection from 10.0.0.5."
    assert caplog.records[-1].getMessage() == (
        "Module m1 closed the connection from 10.0.0.5 (the PLC finished sending): "
        "1 requests answered, 4 refused (2 distinct)."
    )


def test_a_scan_of_many_addresses_stops_logging_at_the_cap(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO)
    store = ModbusStore(1, SIZES)
    journal = ConnectionJournal("m1", "10.0.0.5")
    for address in range(MAX_LOGGED_REFUSALS + 20):
        journal.request_handled(
            handle_pdu(1, bytes([3]) + struct.pack(">HH", 1000 + address, 1), store)
        )
    journal.closed("the PLC finished sending")

    warnings = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) == MAX_LOGGED_REFUSALS + 1
    assert warnings[-1] == (
        "Module m1: more than 100 distinct requests from 10.0.0.5 refused; "
        "the next ones are only counted."
    )
    assert caplog.records[-1].getMessage().endswith("120 refused (more than 100 distinct).")


def test_a_real_connection_logs_its_acceptance_refusals_and_close(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO)

    async def scenario() -> None:
        listener = RecordingListener()
        slave, port = await started_slave(listener)
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(_request(1, 3, REFUSED_READ))
        await asyncio.wait_for(reader.read(100), timeout=2)
        writer.close()
        await eventually(lambda: listener.closed == 1)
        await slave.stop()

    asyncio.run(scenario())

    messages = [r.getMessage() for r in caplog.records]
    assert "Module m1 accepted a connection from 127.0.0.1." in messages
    assert any("address 99, quantity 1 -> ILLEGAL_ADDRESS (2)" in m for m in messages)
    assert any(
        m.startswith("Module m1 closed the connection from 127.0.0.1 (the PLC finished sending)")
        and m.endswith("0 requests answered, 1 refused (1 distinct).")
        for m in messages
    )
