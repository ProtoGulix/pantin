"""Module watchdog wiring: what the module tells the core and resets when the PLC goes."""

from __future__ import annotations

import asyncio

import pytest

from module_fakes import COIL_TAG, SETPOINT_TAG, FakeBus, Setup
from pantin_bridge.bus_messages import BusTag
from pantin_bridge.io_mapping import IoZone, WordOrder
from pantin_bridge.registers import encode_real
from support import make_module


def _tag(name: str, value: float, *, forced: bool = False) -> BusTag:
    return BusTag(name, value, forced)


def test_the_first_request_connects_the_module_and_tells_the_core() -> None:
    setup = Setup(now=5.0)
    setup.bridge.connection_opened()

    setup.bridge.request_served()

    assert setup.bus.statuses == [("m1", True, None)]


def test_closing_the_connection_resets_bit_commands_in_the_bridge_like_the_core_does() -> None:
    async def scenario() -> Setup:
        setup = await Setup().started()
        setup.bridge.connection_opened()
        setup.bridge.request_served()
        setup.bridge.plc_wrote(IoZone.COIL, 0, [True])
        setup.bridge.plc_wrote(
            IoZone.HOLDING_REGISTER, 2, encode_real(0.05, WordOrder.LOW_WORD_FIRST)
        )
        setup.bus.writes.clear()

        setup.bridge.connection_closed()
        await setup.background.run_all()
        # The PLC reconnects and writes the same coil: it is a change again.
        setup.bridge.connection_opened()
        setup.bridge.plc_wrote(IoZone.COIL, 0, [True])
        return setup

    setup = asyncio.run(scenario())

    assert setup.bus.statuses == [("m1", True, None), ("m1", False, "closed")]
    assert setup.slave.writes[0][:2] == (IoZone.COIL, 0)
    assert set(setup.slave.writes[0][2]) == {False}
    assert setup.bus.writes == [(COIL_TAG, 1.0)]


def test_float_commands_keep_their_value_when_the_module_is_lost() -> None:
    async def scenario() -> Setup:
        setup = await Setup().started()
        setup.bridge.connection_opened()
        setup.bridge.request_served()
        setup.bridge.plc_wrote(
            IoZone.HOLDING_REGISTER, 2, encode_real(0.05, WordOrder.LOW_WORD_FIRST)
        )
        setup.bus.writes.clear()
        setup.bridge.connection_closed()
        await setup.background.run_all()
        # A snapshot afterwards still restores the setpoint the PLC wrote.
        await setup.bridge.apply_snapshot([_tag(SETPOINT_TAG, 0)])
        return setup

    [(tag, value)] = asyncio.run(scenario()).bus.writes
    assert tag == SETPOINT_TAG
    assert value == pytest.approx(0.05, rel=1e-6)


def test_the_watchdog_reports_a_timeout_without_waiting() -> None:
    async def scenario() -> FakeBus:
        setup = await Setup(make_module(watchdog_milliseconds=100)).started()
        setup.bridge.connection_opened()
        setup.bridge.request_served()
        watcher = asyncio.create_task(setup.bridge.watch())
        await asyncio.sleep(0.05)
        setup.now = 10.0  # the injected clock jumps far past the watchdog time
        await asyncio.sleep(0.1)
        watcher.cancel()
        await setup.background.run_all()
        return setup.bus

    assert asyncio.run(scenario()).statuses == [("m1", True, None), ("m1", False, "timeout")]


def test_a_plc_write_between_the_disconnect_and_the_resync_stays_in_the_datastore() -> None:
    async def scenario() -> Setup:
        setup = await Setup().started()
        setup.bridge.connection_opened()
        setup.bridge.request_served()
        setup.bridge.plc_wrote(IoZone.COIL, 0, [True])
        setup.bridge.connection_closed()
        # A new connection writes before the background resync has run.
        setup.bridge.connection_opened()
        setup.bridge.plc_wrote(IoZone.COIL, 0, [True])
        await setup.background.run_all()
        return setup

    [(zone, address, values)] = asyncio.run(scenario()).slave.writes
    assert (zone, address, values[0]) == (IoZone.COIL, 0, True)
