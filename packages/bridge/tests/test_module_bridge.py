"""Module logic with fakes: PLC writes to the bus, feedback to registers, watchdog resets."""

from __future__ import annotations

import asyncio
import math

import pytest

from module_fakes import (
    COIL_TAG,
    COUNT_TAG,
    POSITION_TAG,
    ROWS,
    SETPOINT_TAG,
    SWITCH_TAG,
    FakeBus,
    FakeSlave,
    Setup,
)
from pantin_bridge.bus_messages import BusTag
from pantin_bridge.io_mapping import IoZone, WordOrder
from pantin_bridge.registers import encode_real
from support import make_module


def _tag(name: str, value: float, *, forced: bool = False) -> BusTag:
    return BusTag(name, value, forced)


def test_lists_every_mapped_tag_for_the_subscription() -> None:
    assert Setup().bridge.tags == [row.tag for row in ROWS]


def test_a_coil_write_reaches_the_bus_only_when_the_value_changes() -> None:
    setup = Setup()

    setup.bridge.plc_wrote(IoZone.COIL, 0, [True])
    setup.bridge.plc_wrote(IoZone.COIL, 0, [True])
    setup.bridge.plc_wrote(IoZone.COIL, 0, [False])

    assert setup.bus.writes == [(COIL_TAG, 1.0), (COIL_TAG, 0.0)]


def test_the_first_write_of_a_tag_is_sent_even_when_it_is_zero() -> None:
    setup = Setup()

    setup.bridge.plc_wrote(IoZone.COIL, 1, [False])

    assert setup.bus.writes == [("press.valve.retract", 0.0)]


def test_a_multiple_coil_write_sends_each_changed_mapped_coil() -> None:
    setup = Setup()

    setup.bridge.plc_wrote(IoZone.COIL, 0, [True, True, True])

    assert setup.bus.writes == [(COIL_TAG, 1.0), ("press.valve.retract", 1.0)]


@pytest.mark.parametrize("order", [WordOrder.LOW_WORD_FIRST, WordOrder.HIGH_WORD_FIRST])
def test_a_real_written_in_one_request_is_decoded_with_the_module_word_order(
    order: WordOrder,
) -> None:
    setup = Setup(make_module(word_order=order))

    setup.bridge.plc_wrote(IoZone.HOLDING_REGISTER, 2, encode_real(0.05, order))

    [(tag, value)] = setup.bus.writes
    assert tag == SETPOINT_TAG
    assert value == pytest.approx(0.05, rel=1e-6)


def test_a_real_written_one_register_at_a_time_is_sent_once_per_change() -> None:
    setup = Setup()
    low, high = encode_real(1.0, WordOrder.LOW_WORD_FIRST)

    setup.bridge.plc_wrote(IoZone.HOLDING_REGISTER, 2, [low])
    setup.bridge.plc_wrote(IoZone.HOLDING_REGISTER, 3, [high])

    # 1.0 is the words [0x0000, 0x3F80]: the first request leaves the value at 0.
    assert setup.bus.writes[-1] == (SETPOINT_TAG, 1.0)


def test_a_dint_is_signed() -> None:
    setup = Setup()

    setup.bridge.plc_wrote(IoZone.HOLDING_REGISTER, 4, [0xFFFF, 0xFFFF])

    assert setup.bus.writes == [("axis.speed.target", -1.0)]


def test_a_write_to_an_unmapped_address_sends_nothing() -> None:
    setup = Setup()

    setup.bridge.plc_wrote(IoZone.COIL, 3, [True])
    setup.bridge.plc_wrote(IoZone.HOLDING_REGISTER, 0, [5, 6])

    assert setup.bus.writes == []


def test_a_real_that_is_not_a_finite_number_is_not_sent() -> None:
    setup = Setup()
    words = encode_real(math.inf, WordOrder.LOW_WORD_FIRST)

    setup.bridge.plc_wrote(IoZone.HOLDING_REGISTER, 2, words)

    assert setup.bus.writes == []


def test_feedback_goes_to_the_datastore_with_the_right_encoding() -> None:
    async def scenario() -> FakeSlave:
        setup = await Setup(make_module(word_order=WordOrder.HIGH_WORD_FIRST)).started()
        await setup.bridge.apply_feedback(
            [
                _tag(SWITCH_TAG, 1),
                _tag(POSITION_TAG, 1.0),
                _tag(COUNT_TAG, 70000),
                _tag(COIL_TAG, 1),
            ]
        )
        return setup.slave

    assert asyncio.run(scenario()).writes == [
        (IoZone.DISCRETE_INPUT, 3, [True]),
        (IoZone.INPUT_REGISTER, 0, [0x3F80, 0x0000]),
        (IoZone.INPUT_REGISTER, 2, [0x0001, 0x1170]),
    ]


def test_a_snapshot_returns_the_plc_last_values_to_a_core_that_lost_them() -> None:
    async def scenario() -> FakeBus:
        setup = await Setup().started()
        setup.bridge.plc_wrote(IoZone.COIL, 0, [True])
        setup.bus.writes.clear()
        # The core was reset: its command reads 0 again while the datastore still holds 1.
        await setup.bridge.apply_snapshot([_tag(COIL_TAG, 0), _tag(SWITCH_TAG, 1)])
        return setup.bus

    assert asyncio.run(scenario()).writes == [(COIL_TAG, 1.0)]


def test_a_snapshot_leaves_a_tag_the_plc_never_wrote_to_the_core() -> None:
    async def scenario() -> FakeBus:
        setup = await Setup().started()
        await setup.bridge.apply_snapshot([_tag(SETPOINT_TAG, 0.05), _tag(COIL_TAG, 1)])
        return setup.bus

    assert asyncio.run(scenario()).writes == []


def test_a_snapshot_leaves_a_forced_tag_alone() -> None:
    async def scenario() -> FakeBus:
        setup = await Setup().started()
        setup.bridge.plc_wrote(IoZone.COIL, 0, [True])
        setup.bus.writes.clear()
        await setup.bridge.apply_snapshot([_tag(COIL_TAG, 0, forced=True)])
        return setup.bus

    assert asyncio.run(scenario()).writes == []


def test_a_snapshot_does_not_resend_a_value_the_core_already_has() -> None:
    async def scenario() -> FakeBus:
        setup = await Setup().started()
        setup.bridge.plc_wrote(
            IoZone.HOLDING_REGISTER, 2, encode_real(0.1, WordOrder.LOW_WORD_FIRST)
        )
        setup.bus.writes.clear()
        # The core holds the double 0.1 it was given; the PLC's register is the single 0.1.
        await setup.bridge.apply_snapshot([_tag(SETPOINT_TAG, 0.10000000149011612)])
        return setup.bus

    assert asyncio.run(scenario()).writes == []
