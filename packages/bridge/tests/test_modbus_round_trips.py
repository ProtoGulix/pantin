"""All nine function codes against the slave, with pymodbus as the independent client."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from pymodbus.pdu import ExceptionResponse

from pantin_bridge.io_mapping import IoZone
from slave_harness import Running, running_slave


def _run(scenario: Callable[[Running], Awaitable[None]]) -> None:
    async def main() -> None:
        async with running_slave() as running:
            await scenario(running)

    asyncio.run(main())


def test_fc1_reads_coils_the_bridge_set() -> None:
    async def scenario(running: Running) -> None:
        await running.slave.write(IoZone.COIL, 1, [True, False, True])

        answer = await running.client.read_coils(0, count=5, device_id=1)

        assert answer.bits[:5] == [False, True, False, True, False]

    _run(scenario)


def test_fc2_reads_discrete_inputs_the_bridge_set() -> None:
    async def scenario(running: Running) -> None:
        await running.slave.write(IoZone.DISCRETE_INPUT, 15, [True])

        answer = await running.client.read_discrete_inputs(14, count=2, device_id=1)

        assert answer.bits[:2] == [False, True]

    _run(scenario)


def test_fc3_reads_holding_registers_the_plc_wrote() -> None:
    async def scenario(running: Running) -> None:
        await running.client.write_registers(2, [0xBEEF, 7], device_id=1)

        answer = await running.client.read_holding_registers(1, count=4, device_id=1)

        assert answer.registers == [0, 0xBEEF, 7, 0]

    _run(scenario)


def test_fc4_reads_input_registers_the_bridge_set() -> None:
    async def scenario(running: Running) -> None:
        await running.slave.write(IoZone.INPUT_REGISTER, 6, [65535, 1])

        answer = await running.client.read_input_registers(6, count=2, device_id=1)

        assert answer.registers == [65535, 1]

    _run(scenario)


def test_fc5_writes_one_coil_and_reads_back() -> None:
    async def scenario(running: Running) -> None:
        await running.client.write_coil(9, True, device_id=1)

        answer = await running.client.read_coils(8, count=3, device_id=1)

        assert answer.bits[:3] == [False, True, False]
        assert running.listener.writes == [(IoZone.COIL, 9, [True])]

    _run(scenario)


def test_fc6_writes_one_register_and_reads_back() -> None:
    async def scenario(running: Running) -> None:
        await running.client.write_register(7, 0xFFFF, device_id=1)

        answer = await running.client.read_holding_registers(7, count=1, device_id=1)

        assert answer.registers == [0xFFFF]
        assert running.listener.writes == [(IoZone.HOLDING_REGISTER, 7, [0xFFFF])]

    _run(scenario)


def test_fc15_writes_coils_across_a_byte_boundary() -> None:
    async def scenario(running: Running) -> None:
        pattern = [True, False, True, True, False, False, True, False, True, True]
        await running.client.write_coils(4, pattern, device_id=1)

        answer = await running.client.read_coils(4, count=10, device_id=1)

        assert answer.bits[:10] == pattern
        assert running.listener.writes == [(IoZone.COIL, 4, pattern)]

    _run(scenario)


def test_fc16_writes_registers() -> None:
    async def scenario(running: Running) -> None:
        await running.client.write_registers(0, [1, 2, 3], device_id=1)

        answer = await running.client.read_holding_registers(0, count=3, device_id=1)

        assert answer.registers == [1, 2, 3]
        assert running.listener.writes == [(IoZone.HOLDING_REGISTER, 0, [1, 2, 3])]

    _run(scenario)


def test_fc23_writes_then_reads_in_one_request() -> None:
    async def scenario(running: Running) -> None:
        answer = await running.client.readwrite_registers(
            read_address=0, read_count=3, write_address=1, values=[11, 22], device_id=1
        )

        # Register 1 and 2 come back as just written: the write happens first.
        assert answer.registers == [0, 11, 22]
        assert running.listener.writes == [(IoZone.HOLDING_REGISTER, 1, [11, 22])]

    _run(scenario)


def test_an_exception_reaches_the_client_as_an_exception_response() -> None:
    async def scenario(running: Running) -> None:
        answer = await running.client.write_registers(7, [1, 2], device_id=1)

        assert isinstance(answer, ExceptionResponse)
        assert answer.exception_code == 2

    _run(scenario)
