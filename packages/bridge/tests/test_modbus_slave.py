"""The Modbus slave with a real pymodbus client: datastore, unit id, accept filter."""

from __future__ import annotations

import asyncio

import pytest
from pymodbus.client import AsyncModbusTcpClient
from pymodbus.pdu import ExceptionResponse

from pantin_bridge.errors import ConfigurationError
from pantin_bridge.io_mapping import IoZone
from pantin_bridge.modbus_gate import MAX_CONNECTIONS_PER_MODULE
from pantin_bridge.modbus_server import ModbusSlave
from pantin_bridge.network_address import SourceFilter, parse_allow_entry
from slave_harness import HOST, READ_ONE_HOLDING_REGISTER, SIZES, started_slave
from support import RecordingListener, eventually, make_module


async def _client(port: int, source: str | None = None) -> AsyncModbusTcpClient:
    client = AsyncModbusTcpClient(
        HOST, port=port, timeout=2, retries=0, source_address=(source, 0) if source else None
    )
    assert await client.connect()
    return client


def test_listens_on_the_explicit_address_only() -> None:
    async def scenario() -> str | None:
        slave, _port = await started_slave(RecordingListener())
        try:
            return slave.bound_host
        finally:
            await slave.stop()

    # An empty host would bind every interface (ADR 0046 point 1).
    assert asyncio.run(scenario()) == HOST


def test_forwards_coil_and_register_writes_of_the_plc() -> None:
    async def scenario() -> RecordingListener:
        listener = RecordingListener()
        slave, port = await started_slave(listener)
        client = await _client(port)
        try:
            await client.write_coil(3, True, device_id=1)
            await client.write_coils(5, [True, False, True], device_id=1)
            await client.write_register(1, 7, device_id=1)
            await client.write_registers(2, [9, 10], device_id=1)
            await client.readwrite_registers(
                read_address=0, read_count=1, address=4, values=[11], device_id=1
            )
        finally:
            client.close()
            await slave.stop()
        return listener

    assert asyncio.run(scenario()).writes == [
        (IoZone.COIL, 3, [True]),
        (IoZone.COIL, 5, [True, False, True]),
        (IoZone.HOLDING_REGISTER, 1, [7]),
        (IoZone.HOLDING_REGISTER, 2, [9, 10]),
        (IoZone.HOLDING_REGISTER, 4, [11]),
    ]


def test_a_write_past_the_mapped_range_is_refused_and_not_forwarded() -> None:
    async def scenario() -> tuple[RecordingListener, object]:
        listener = RecordingListener()
        slave, port = await started_slave(listener)
        client = await _client(port)
        try:
            answer = await client.write_registers(7, [1, 2], device_id=1)
        finally:
            client.close()
            await slave.stop()
        return listener, answer

    listener, answer = asyncio.run(scenario())

    assert isinstance(answer, ExceptionResponse)
    assert listener.writes == []


def test_feedback_set_by_the_bridge_is_readable_and_not_a_plc_write() -> None:
    async def scenario() -> tuple[RecordingListener, list[bool], list[int], list[int]]:
        listener = RecordingListener()
        slave, port = await started_slave(listener)
        client = await _client(port)
        try:
            await slave.write(IoZone.DISCRETE_INPUT, 2, [True, True])
            await slave.write(IoZone.INPUT_REGISTER, 1, [1234, 5])
            await slave.write(IoZone.COIL, 0, [True])
            await slave.write(IoZone.HOLDING_REGISTER, 0, [42])
            inputs = await client.read_discrete_inputs(0, count=4, device_id=1)
            registers = await client.read_input_registers(0, count=4, device_id=1)
            holding = await client.read_holding_registers(0, count=1, device_id=1)
        finally:
            client.close()
            await slave.stop()
        return listener, inputs.bits[:4], registers.registers, holding.registers

    listener, inputs, registers, holding = asyncio.run(scenario())

    assert inputs == [False, False, True, True]
    assert registers == [0, 1234, 5, 0]
    assert holding == [42]
    assert listener.writes == []


def test_does_not_serve_another_unit_id() -> None:
    async def scenario() -> tuple[RecordingListener, object, object]:
        listener = RecordingListener()
        slave, port = await started_slave(listener, unit_id=7)
        client = await _client(port)
        try:
            other = await client.read_holding_registers(0, count=1, device_id=1)
            served_after_other = listener.requests
            own = await client.read_holding_registers(0, count=1, device_id=7)
        finally:
            client.close()
            await slave.stop()
        assert served_after_other == 0
        return listener, other, own

    listener, other, own = asyncio.run(scenario())

    # Modbus' gateway answer "no response from the target device" (exception code 11).
    assert isinstance(other, ExceptionResponse)
    assert other.exception_code == 11
    assert not isinstance(own, ExceptionResponse)
    assert listener.requests == 1


def test_another_unit_id_gets_exception_11_at_any_address() -> None:
    async def scenario() -> list[object]:
        slave, port = await started_slave(RecordingListener(), unit_id=7)
        client = await _client(port)
        try:
            return [
                await client.read_holding_registers(5, count=1, device_id=1),
                await client.read_coils(20, count=1, device_id=1),
                await client.read_input_registers(60000, count=2, device_id=2),
            ]
        finally:
            client.close()
            await slave.stop()

    answers = asyncio.run(scenario())

    assert [getattr(a, "exception_code", None) for a in answers] == [11, 11, 11]


def test_a_read_past_the_mapped_range_is_illegal_for_every_zone() -> None:
    async def scenario() -> list[object]:
        slave, port = await started_slave(RecordingListener())
        client = await _client(port)
        try:
            return [
                await client.read_coils(14, count=3, device_id=1),
                await client.read_coils(16, count=1, device_id=1),
                await client.read_discrete_inputs(17, count=1, device_id=1),
                await client.read_holding_registers(7, count=2, device_id=1),
                await client.read_input_registers(8, count=1, device_id=1),
                await client.read_coils(13, count=3, device_id=1),
                await client.read_holding_registers(6, count=2, device_id=1),
            ]
        finally:
            client.close()
            await slave.stop()

    answers = asyncio.run(scenario())

    assert [isinstance(a, ExceptionResponse) for a in answers] == [True] * 5 + [False] * 2
    assert [getattr(a, "exception_code", None) for a in answers[:5]] == [2] * 5


def test_refuses_a_source_outside_the_allow_list_before_reading_anything() -> None:
    async def scenario() -> tuple[bytes, RecordingListener]:
        listener = RecordingListener()
        slave, port = await started_slave(listener, SourceFilter((parse_allow_entry("127.0.0.1"),)))
        try:
            reader, writer = await asyncio.open_connection(HOST, port, local_addr=("127.0.0.5", 0))
            writer.write(READ_ONE_HOLDING_REGISTER)
            try:
                answer = await asyncio.wait_for(reader.read(100), timeout=2)
            except ConnectionResetError:
                answer = b""
            writer.close()
        finally:
            await slave.stop()
        return answer, listener

    answer, listener = asyncio.run(scenario())

    assert answer == b""
    assert listener.opened == 0
    assert listener.requests == 0


def test_accepts_a_source_inside_the_allow_list() -> None:
    async def scenario() -> RecordingListener:
        listener = RecordingListener()
        slave, port = await started_slave(listener, SourceFilter((parse_allow_entry("127.0.0.5"),)))
        client = await _client(port, source="127.0.0.5")
        try:
            answer = await client.read_holding_registers(0, count=1, device_id=1)
            assert not isinstance(answer, ExceptionResponse)
        finally:
            client.close()
            await slave.stop()
        return listener

    assert asyncio.run(scenario()).requests == 1


def test_closes_the_connection_over_the_limit_of_four() -> None:
    async def scenario() -> tuple[int, bytes]:
        listener = RecordingListener()
        slave, port = await started_slave(listener)
        clients = [await _client(port) for _ in range(MAX_CONNECTIONS_PER_MODULE)]
        try:
            await eventually(lambda: listener.opened == MAX_CONNECTIONS_PER_MODULE)
            reader, writer = await asyncio.open_connection(HOST, port)
            writer.write(READ_ONE_HOLDING_REGISTER)
            try:
                answer = await asyncio.wait_for(reader.read(100), timeout=2)
            except ConnectionResetError:
                answer = b""
            writer.close()
        finally:
            for client in clients:
                client.close()
            await slave.stop()
        return listener.opened, answer

    opened, answer = asyncio.run(scenario())

    assert opened == MAX_CONNECTIONS_PER_MODULE
    assert answer == b""


def test_tells_the_listener_when_an_accepted_connection_closes() -> None:
    async def scenario() -> RecordingListener:
        listener = RecordingListener()
        slave, port = await started_slave(listener)
        client = await _client(port)
        try:
            await eventually(lambda: listener.opened == 1)
            client.close()
            await eventually(lambda: listener.closed == 1)
        finally:
            await slave.stop()
        return listener

    listener = asyncio.run(scenario())

    assert (listener.opened, listener.closed) == (1, 1)


def test_a_port_that_is_taken_is_a_configuration_error() -> None:
    async def scenario() -> None:
        first, port = await started_slave(RecordingListener())
        second = ModbusSlave(
            make_module(port=port), SIZES, HOST, SourceFilter(), RecordingListener()
        )
        try:
            with pytest.raises(ConfigurationError, match="cannot listen"):
                await second.start()
        finally:
            await first.stop()

    asyncio.run(scenario())
