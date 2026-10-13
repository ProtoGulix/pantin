"""The whole bridge against a fake core, with a pymodbus client playing the PLC."""

from __future__ import annotations

import asyncio

import pytest
from pymodbus.pdu import ExceptionResponse

from fake_core import FakeCore
from pantin_bridge.io_mapping import WordOrder
from pantin_bridge.registers import encode_real
from plc_scene import MAPPING_ID, connect_plc, io_answer, read_until, with_bridge
from support import free_port


def _tags_of_subscription(core: FakeCore) -> set[str]:
    tags = core.messages_of("subscribe")[0]["tags"]
    assert isinstance(tags, list)
    return {str(tag) for tag in tags}


MAPPED_TAGS = {
    "press.valve.extend",
    "press.ext.state",
    "axis.stroke.setpoint",
    "axis.stroke.position",
}


async def _play_a_cycle(core: FakeCore, port: int) -> None:
    """The PLC writes a coil and a REAL, then reads the feedback the core pushes."""
    await core.wait_for("subscribe")
    plc = await connect_plc(port)
    try:
        await plc.write_coil(0, True, device_id=1)
        await plc.write_registers(0, encode_real(0.05, WordOrder.LOW_WORD_FIRST), device_id=1)
        await core.wait_for("write", 2)
        await core.set_tags(press__ext__state=1, axis__stroke__position=1.0)

        async def inputs() -> list[bool]:
            return list((await plc.read_discrete_inputs(0, count=1, device_id=1)).bits)

        async def registers() -> list[int]:
            return (await plc.read_input_registers(0, count=2, device_id=1)).registers

        await read_until(inputs, [True])
        await read_until(registers, [0x0000, 0x3F80])
    finally:
        plc.close()
    await core.wait_for("plc_status", 2)


def test_closed_loop_between_a_plc_client_and_the_core() -> None:
    port = free_port()

    async def scenario() -> FakeCore:
        async with FakeCore(io_answer(port)) as core:
            core.tags = dict.fromkeys(MAPPED_TAGS, (0, False))

            async def play(_bridge: asyncio.Task[None]) -> None:
                await _play_a_cycle(core, port)

            await with_bridge(core, port, play)
            return core

    core = asyncio.run(scenario())

    assert core.received[0]["mappingId"] == MAPPING_ID
    assert _tags_of_subscription(core) == MAPPED_TAGS
    first, second = core.messages_of("write")
    assert (first["tag"], first["value"]) == ("press.valve.extend", 1)
    assert second["tag"] == "axis.stroke.setpoint"
    assert second["value"] == pytest.approx(0.05, rel=1e-6)
    statuses = core.messages_of("plc_status")
    assert [(s["connected"], s["reason"]) for s in statuses] == [(True, None), (False, "closed")]


def test_a_snapshot_after_a_core_reset_gives_the_core_the_plc_value_back() -> None:
    port = free_port()

    async def scenario() -> FakeCore:
        async with FakeCore(io_answer(port)) as core:
            core.tags = {"press.valve.extend": (0, False)}

            async def play(_bridge: asyncio.Task[None]) -> None:
                await core.wait_for("subscribe")
                plc = await connect_plc(port)
                try:
                    await plc.write_coil(0, True, device_id=1)
                    await core.wait_for("write")
                    await core.push_snapshot()  # the core says the coil is 0 again
                    await core.wait_for("write", 2)
                finally:
                    plc.close()

            await with_bridge(core, port, play)
            return core

    writes = asyncio.run(scenario()).messages_of("write")

    assert [(w["tag"], w["value"]) for w in writes] == [("press.valve.extend", 1)] * 2


def test_the_watchdog_expires_when_the_plc_goes_silent_with_its_connection_open() -> None:
    port = free_port()

    async def scenario() -> FakeCore:
        async with FakeCore(io_answer(port)) as core:

            async def play(_bridge: asyncio.Task[None]) -> None:
                await core.wait_for("subscribe")
                plc = await connect_plc(port)
                try:
                    await plc.read_coils(0, count=1, device_id=1)
                    await core.wait_for("plc_status", 2, timeout=3)
                finally:
                    plc.close()

            await with_bridge(core, port, play)
            return core

    statuses = asyncio.run(scenario()).messages_of("plc_status")

    assert [(s["connected"], s["reason"]) for s in statuses] == [(True, None), (False, "timeout")]


def test_a_word_order_setting_changes_the_registers_the_plc_reads() -> None:
    port = free_port()

    async def scenario() -> list[int]:
        async with FakeCore(io_answer(port, "high_word_first")) as core:
            core.tags = {"axis.stroke.position": (1.0, False)}
            registers: list[int] = []

            async def play(_bridge: asyncio.Task[None]) -> None:
                await core.wait_for("subscribe")
                plc = await connect_plc(port)
                try:

                    async def read() -> list[int]:
                        return (await plc.read_input_registers(0, count=2, device_id=1)).registers

                    await read_until(read, [0x3F80, 0x0000])
                    registers.extend(await read())
                finally:
                    plc.close()

            await with_bridge(core, port, play)
            return registers

    assert asyncio.run(scenario()) == [0x3F80, 0x0000]


def test_the_plc_cannot_read_what_the_core_did_not_map() -> None:
    port = free_port()

    async def scenario() -> object:
        async with FakeCore(io_answer(port)) as core:
            answers: list[object] = []

            async def play(_bridge: asyncio.Task[None]) -> None:
                await core.wait_for("subscribe")
                plc = await connect_plc(port)
                try:
                    answers.append(await plc.read_holding_registers(500, count=1, device_id=1))
                finally:
                    plc.close()

            await with_bridge(core, port, play)
            return answers[0]

    assert isinstance(asyncio.run(scenario()), ExceptionResponse)
