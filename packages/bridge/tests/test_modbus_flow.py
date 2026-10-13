"""Connection life of the slave: idle timeout, batching, flow control, half-close."""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager

import pytest

from pantin_bridge.modbus_frames import FrameDecoder
from pantin_bridge.modbus_server import ModbusSlave
from pantin_bridge.network_address import SourceFilter
from slave_harness import HOST, READ_ONE_HOLDING_REGISTER, SIZES, started_slave
from support import RecordingListener, eventually, make_module

ANSWER_SIZE = 11
INPUT_LIMIT_BYTES = 4 * 1024


def _request(transaction: int) -> bytes:
    return transaction.to_bytes(2, "big") + READ_ONE_HOLDING_REGISTER[2:]


def test_closes_a_connection_that_sends_nothing_and_frees_its_slot() -> None:
    async def scenario() -> tuple[bytes, RecordingListener]:
        listener = RecordingListener()
        # A timeout the test controls: 50 ms instead of the 5 s floor.
        slave, port = await started_slave(listener, idle_timeout_seconds=0.05)
        try:
            reader, writer = await asyncio.open_connection(HOST, port)
            # The read ends only when the server closes: no sleep decides the outcome.
            async with asyncio.timeout(3):
                try:
                    received = await reader.read()
                except ConnectionResetError:
                    received = b""
            await eventually(lambda: listener.closed == 1)
            writer.close()
        finally:
            await slave.stop()
        return received, listener

    received, listener = asyncio.run(scenario())

    assert received == b""
    assert (listener.opened, listener.closed) == (1, 1)


def test_the_idle_timeout_is_three_watchdogs_with_a_floor() -> None:
    async def timeout_for(watchdog_milliseconds: int) -> float:
        slave = ModbusSlave(
            make_module(watchdog_milliseconds=watchdog_milliseconds),
            SIZES,
            HOST,
            SourceFilter(),
            RecordingListener(),
        )
        return slave.idle_timeout_seconds

    assert asyncio.run(timeout_for(1000)) == 5.0
    assert asyncio.run(timeout_for(10000)) == 30.0


def test_a_connection_that_keeps_polling_is_not_closed_by_the_idle_timeout() -> None:
    timeout = 0.2  # not 50 ms: a stalled CI scheduler must not look like an idle master

    async def scenario() -> tuple[int, float]:
        slave, port = await started_slave(RecordingListener(), idle_timeout_seconds=timeout)
        loop = asyncio.get_running_loop()
        try:
            reader, writer = await asyncio.open_connection(HOST, port)
            started = loop.time()
            answered = 0
            # Each round trip is the pacing, and it is far shorter than the timeout; the loop
            # runs on until the elapsed time is past it, so only a reset timer lets it finish.
            while loop.time() - started < timeout * 1.5:
                writer.write(READ_ONE_HOLDING_REGISTER)
                await asyncio.wait_for(reader.readexactly(11), timeout=2)
                answered += 1
            elapsed = loop.time() - started
            writer.close()
        finally:
            await slave.stop()
        return answered, elapsed

    answered, elapsed = asyncio.run(scenario())

    assert elapsed > timeout
    assert answered > 1


def test_more_than_one_batch_of_pipelined_requests_are_all_answered_in_order() -> None:
    count = 50  # three full batches of 16 and a rest

    async def scenario() -> list[int]:
        slave, port = await started_slave(RecordingListener())
        try:
            reader, writer = await asyncio.open_connection(HOST, port)
            writer.write(
                b"".join(
                    transaction.to_bytes(2, "big") + READ_ONE_HOLDING_REGISTER[2:]
                    for transaction in range(1, count + 1)
                )
            )
            answers = await asyncio.wait_for(reader.readexactly(11 * count), timeout=3)
            writer.close()
        finally:
            await slave.stop()
        return [int.from_bytes(answers[i * 11 : i * 11 + 2], "big") for i in range(count)]

    assert asyncio.run(scenario()) == list(range(1, count + 1))


@contextmanager
def _recorded_buffer(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, int]]:
    """Largest decoder buffer seen right after bytes arrive, and the largest chunk."""
    seen = {"buffer": 0, "chunk": 0}
    original = FrameDecoder.extend

    def extend(self: FrameDecoder, data: bytes) -> None:
        original(self, data)
        seen["buffer"] = max(seen["buffer"], self.buffered_bytes)
        seen["chunk"] = max(seen["chunk"], len(data))

    monkeypatch.setattr(FrameDecoder, "extend", extend)
    yield seen


def test_a_flooding_peer_cannot_grow_the_input_buffer(monkeypatch: pytest.MonkeyPatch) -> None:
    total = 4000

    async def scenario() -> int:
        slave, port = await started_slave(RecordingListener())
        try:
            reader, writer = await asyncio.open_connection(HOST, port)

            async def flood() -> None:
                for start in range(0, total, 100):
                    writer.write(b"".join(_request(n) for n in range(start, start + 100)))
                    await writer.drain()

            sender = asyncio.create_task(flood())
            answers = await asyncio.wait_for(reader.readexactly(ANSWER_SIZE * total), timeout=20)
            await sender
            writer.close()
        finally:
            await slave.stop()
        return len(answers) // ANSWER_SIZE

    with _recorded_buffer(monkeypatch) as seen:
        answered = asyncio.run(scenario())

    assert answered == total
    # Reading stops above the limit, so the buffer is at most the limit plus the last read.
    assert seen["buffer"] <= INPUT_LIMIT_BYTES + seen["chunk"]


def test_requests_sent_before_a_half_close_are_all_answered_then_the_server_closes() -> None:
    count = 50

    async def scenario() -> bytes:
        slave, port = await started_slave(RecordingListener())
        try:
            reader, writer = await asyncio.open_connection(HOST, port)
            writer.write(b"".join(_request(n) for n in range(1, count + 1)))
            writer.write_eof()
            async with asyncio.timeout(3):
                answers = await reader.read()  # returns only when the server closes
            writer.close()
        finally:
            await slave.stop()
        return answers

    answers = asyncio.run(scenario())

    ids = [int.from_bytes(answers[i : i + 2], "big") for i in range(0, len(answers), ANSWER_SIZE)]
    assert ids == list(range(1, count + 1))


def test_a_failing_listener_inside_a_batch_drops_only_that_connection(
    caplog: pytest.LogCaptureFixture,
) -> None:
    class Failing(RecordingListener):
        def request_served(self) -> None:
            super().request_served()
            if self.requests == 20:
                raise RuntimeError("bus is gone")

    async def scenario() -> bytes:
        slave, port = await started_slave(Failing())
        try:
            reader, writer = await asyncio.open_connection(HOST, port)
            writer.write(b"".join(_request(n) for n in range(1, 41)))
            try:
                async with asyncio.timeout(3):
                    received = await reader.read()
            except ConnectionResetError:
                received = b""
            writer.close()
        finally:
            await slave.stop()
        return received

    with caplog.at_level("ERROR"):
        asyncio.run(scenario())

    errors = [r for r in caplog.records if r.levelname == "ERROR"]
    assert len(errors) == 1
    assert "request handling failed" in errors[0].getMessage()
