"""The slave on the wire, with hand-made bytes: malformed headers, split and pipelined frames."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

import pytest

from pantin_bridge.modbus_gate import MAX_CONNECTIONS_PER_MODULE
from slave_harness import HOST, READ_ONE_HOLDING_REGISTER, started_slave
from support import RecordingListener, eventually

ANSWER_TO_READ = bytes.fromhex("0001 0000 0005 01 03 02 0000")
WRONG_PROTOCOL = bytes.fromhex("0001 0001 0006 01")
LENGTHS_OUT_OF_RANGE = [0, 1, 255, 300]


async def _read_to_close(reader: asyncio.StreamReader) -> bytes:
    """Everything the server sent before it closed the connection."""
    try:
        async with asyncio.timeout(2):
            return await reader.read()
    except ConnectionResetError:
        # The server closed with bytes of ours still unread: the kernel resets instead of FIN.
        return b""


def _with_slave(
    scenario: Callable[[int, RecordingListener], Awaitable[None]],
) -> None:
    async def main() -> None:
        listener = RecordingListener()
        slave, port = await started_slave(listener)
        try:
            await scenario(port, listener)
        finally:
            await slave.stop()

    asyncio.run(main())


@pytest.mark.parametrize(
    "header",
    [WRONG_PROTOCOL]
    + [bytes.fromhex("0001 0000") + n.to_bytes(2, "big") + b"\x01" for n in LENGTHS_OUT_OF_RANGE],
)
def test_a_malformed_header_closes_the_connection_without_an_answer(header: bytes) -> None:
    async def scenario(port: int, listener: RecordingListener) -> None:
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(header)

        assert await _read_to_close(reader) == b""

        writer.close()
        # The slave is still up for the next connection.
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(READ_ONE_HOLDING_REGISTER)
        assert await reader.readexactly(len(ANSWER_TO_READ)) == ANSWER_TO_READ
        writer.close()

    _with_slave(scenario)


def test_the_answers_before_a_malformed_header_are_still_sent() -> None:
    async def scenario(port: int, listener: RecordingListener) -> None:
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(READ_ONE_HOLDING_REGISTER + WRONG_PROTOCOL)

        assert await _read_to_close(reader) == ANSWER_TO_READ

        writer.close()

    _with_slave(scenario)


def test_a_frame_sent_one_byte_at_a_time_gets_its_answer() -> None:
    async def scenario(port: int, listener: RecordingListener) -> None:
        reader, writer = await asyncio.open_connection(HOST, port)
        for index in range(len(READ_ONE_HOLDING_REGISTER)):
            writer.write(READ_ONE_HOLDING_REGISTER[index : index + 1])
            await writer.drain()

        assert await reader.readexactly(len(ANSWER_TO_READ)) == ANSWER_TO_READ

        writer.close()

    _with_slave(scenario)


def test_pipelined_requests_are_answered_in_order_with_their_transaction_ids() -> None:
    async def scenario(port: int, listener: RecordingListener) -> None:
        requests = b"".join(
            bytes.fromhex("00") + bytes([transaction]) + READ_ONE_HOLDING_REGISTER[2:]
            for transaction in (21, 22, 23)
        )
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(requests)

        answers = await reader.readexactly(3 * len(ANSWER_TO_READ))

        size = len(ANSWER_TO_READ)
        assert [answers[i * size + 1] for i in range(3)] == [21, 22, 23]
        assert listener.requests == 3
        writer.close()

    _with_slave(scenario)


def test_two_frames_split_at_an_arbitrary_offset_are_both_answered() -> None:
    async def scenario(port: int, listener: RecordingListener) -> None:
        both = READ_ONE_HOLDING_REGISTER * 2
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(both[:17])
        await writer.drain()
        writer.write(both[17:])

        answers = await reader.readexactly(2 * len(ANSWER_TO_READ))

        assert answers == ANSWER_TO_READ * 2
        writer.close()

    _with_slave(scenario)


def test_another_unit_id_gets_exception_11_on_the_wire() -> None:
    async def scenario(port: int, listener: RecordingListener) -> None:
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(bytes.fromhex("0007 0000 0006 09 03 0000 0001"))

        assert await reader.readexactly(9) == bytes.fromhex("0007 0000 0003 09 83 0B")
        assert listener.requests == 0
        writer.close()

    _with_slave(scenario)


def test_a_fifth_connection_is_closed_unread_and_a_released_slot_is_reused() -> None:
    async def scenario(port: int, listener: RecordingListener) -> None:
        held = [
            await asyncio.open_connection(HOST, port) for _ in range(MAX_CONNECTIONS_PER_MODULE)
        ]
        await eventually(lambda: listener.opened == MAX_CONNECTIONS_PER_MODULE)
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(READ_ONE_HOLDING_REGISTER)

        assert await _read_to_close(reader) == b""

        writer.close()
        for held_reader, held_writer in held:
            held_writer.write(READ_ONE_HOLDING_REGISTER)
            assert await held_reader.readexactly(len(ANSWER_TO_READ)) == ANSWER_TO_READ
        held[0][1].close()
        await eventually(lambda: listener.closed == 1)
        reader, writer = await asyncio.open_connection(HOST, port)
        writer.write(READ_ONE_HOLDING_REGISTER)
        assert await reader.readexactly(len(ANSWER_TO_READ)) == ANSWER_TO_READ
        writer.close()
        for _held_reader, held_writer in held[1:]:
            held_writer.close()

    _with_slave(scenario)
