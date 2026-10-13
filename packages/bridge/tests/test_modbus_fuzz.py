"""Fuzz test: random bytes and random well-formed frames never take the slave down.

The slave runs in a thread with its own event loop, so that the example loop of hypothesis can
stay a plain synchronous function over blocking sockets. Each example sends its bytes, closes
its sending side and reads to the end: the server answers every complete frame, then closes
after the end-of-file, so no sleep or timeout decides the result.
"""

from __future__ import annotations

import asyncio
import contextlib
import socket
import struct
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from itertools import pairwise

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from pantin_bridge.modbus_frames import FrameDecoder, FrameError
from slave_harness import HOST, READ_ONE_HOLDING_REGISTER, started_slave
from support import RecordingListener

KNOWN_FUNCTION_CODES = [1, 2, 3, 4, 5, 6, 15, 16, 23]
HEADER_SIZE = 7
RECEIVE_TIMEOUT_SECONDS = 5.0


@contextmanager
def slave_in_a_thread() -> Iterator[int]:
    ready = threading.Event()
    port_holder: list[int] = []
    failures: list[BaseException] = []
    loop_holder: list[asyncio.AbstractEventLoop] = []
    stopped: list[asyncio.Event] = []

    async def serve() -> None:
        loop_holder.append(asyncio.get_running_loop())
        stopped.append(asyncio.Event())
        slave, port = await started_slave(RecordingListener())
        port_holder.append(port)
        ready.set()
        try:
            await stopped[0].wait()
        finally:
            await slave.stop()

    def run() -> None:
        try:
            asyncio.run(serve())
        except BaseException as error:  # noqa: BLE001 - handed to the test thread below
            failures.append(error)
            ready.set()

    thread = threading.Thread(target=run)
    thread.start()
    try:
        assert ready.wait(RECEIVE_TIMEOUT_SECONDS)
        if failures:
            raise failures[0]
        yield port_holder[0]
    finally:
        if loop_holder and stopped:
            loop_holder[0].call_soon_threadsafe(stopped[0].set)
        thread.join(RECEIVE_TIMEOUT_SECONDS)
    if failures:
        raise failures[0]


def exchange(port: int, chunks: list[bytes], *, tolerate_reset: bool) -> bytes:
    """Send the chunks, close the sending side, return everything the server answers.

    After a bad header the server closes at once, so our later bytes may meet a closed socket
    and the kernel may drop answers still queued: `tolerate_reset` accepts that, and only for
    streams that contain garbage.
    """
    with socket.create_connection((HOST, port), timeout=RECEIVE_TIMEOUT_SECONDS) as client:
        received = bytearray()
        try:
            for chunk in chunks:
                client.sendall(chunk)
            client.shutdown(socket.SHUT_WR)
            while data := client.recv(4096):
                received.extend(data)
        except (ConnectionResetError, BrokenPipeError):
            if not tolerate_reset:
                raise
        return bytes(received)


def well_formed_frames(data: bytes) -> list[tuple[int, int, int]]:
    """(transaction id, unit id, function code) of each frame the decoder cuts from data."""
    found: list[tuple[int, int, int]] = []
    # The frames before a bad header are collected, then the error ends the stream.
    with contextlib.suppress(FrameError):
        found.extend(
            (frame.transaction_id, frame.unit_id, frame.pdu[0] & 0x7F)
            for frame in FrameDecoder().feed(data)
        )
    return found


def answers(data: bytes, *, tail_may_be_cut: bool) -> list[tuple[int, int, int]]:
    """Parse the server's output: whole, well-formed frames, the last one cut only after a reset."""
    parsed: list[tuple[int, int, int]] = []
    offset = 0
    while offset < len(data):
        if len(data) - offset < HEADER_SIZE + 1:
            assert tail_may_be_cut, "a truncated answer"
            break
        transaction_id, protocol_id, length, unit_id = struct.unpack_from(">HHHB", data, offset)
        assert protocol_id == 0
        assert 2 <= length <= 254
        if offset + 6 + length > len(data):
            assert tail_may_be_cut, "a truncated answer"
            break
        parsed.append((transaction_id, unit_id, data[offset + HEADER_SIZE] & 0x7F))
        offset += 6 + length
    return parsed


frame_strategy = st.builds(
    lambda transaction_id, unit_id, function_code, body: (
        struct.pack(">HHHB", transaction_id, 0, len(body) + 2, unit_id)
        + bytes([function_code])
        + body
    ),
    st.integers(0, 65535),
    st.sampled_from([0, 1, 1, 1, 2, 255]),
    st.sampled_from([*KNOWN_FUNCTION_CODES, 0, 7, 22, 43, 127, 128, 255]),
    st.binary(max_size=40),
)
garbage_strategy = st.lists(
    st.one_of(frame_strategy, st.binary(max_size=40)), min_size=1, max_size=8
).map(b"".join)
frames_only_strategy = st.lists(frame_strategy, min_size=1, max_size=8).map(b"".join)
cut_points_strategy = st.lists(st.integers(0, 400), max_size=4)
FUZZ_SETTINGS = settings(
    max_examples=200,
    derandomize=True,  # the same examples on every run and every machine
    database=None,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)


def split(stream: bytes, cut_points: list[int]) -> list[bytes]:
    bounds = [0, *sorted({min(point, len(stream)) for point in cut_points}), len(stream)]
    return [stream[start:end] for start, end in pairwise(bounds)]


def slave_still_answers(port: int) -> bool:
    received = exchange(port, [READ_ONE_HOLDING_REGISTER], tolerate_reset=False)
    return answers(received, tail_may_be_cut=False) == [(1, 1, 3)]


def test_well_formed_frames_split_anywhere_get_exactly_one_answer_each() -> None:
    with slave_in_a_thread() as port:

        @FUZZ_SETTINGS
        @given(stream=frames_only_strategy, cut_points=cut_points_strategy)
        def check(stream: bytes, cut_points: list[int]) -> None:
            received = exchange(port, split(stream, cut_points), tolerate_reset=False)

            # Ids and function code are echoed in order; an exception only sets the top bit.
            assert answers(received, tail_may_be_cut=False) == well_formed_frames(stream)

        check()


def test_random_bytes_never_take_the_slave_down_nor_get_a_malformed_answer() -> None:
    with slave_in_a_thread() as port:

        @FUZZ_SETTINGS
        @given(stream=garbage_strategy, cut_points=cut_points_strategy)
        def check(stream: bytes, cut_points: list[int]) -> None:
            received = exchange(port, split(stream, cut_points), tolerate_reset=True)

            parsed = answers(received, tail_may_be_cut=True)

            # Answers only for frames that were complete and preceded any bad header.
            expected = well_formed_frames(stream)
            assert parsed == expected[: len(parsed)]
            assert slave_still_answers(port)

        check()
