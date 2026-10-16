"""Modbus TCP framing (ADR 0048 point 2): bytes in, MBAP frames out. Pure, no I/O.

A TCP stream carries no frame boundary of its own, so the decoder accumulates bytes and cuts
a frame as soon as the length in its header is available. A header that cannot be valid
(wrong protocol id, impossible length) means the stream can no longer be framed: the caller
must close the connection instead of guessing where the next frame starts.
"""

from __future__ import annotations

import struct
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Final

_HEADER: Final = struct.Struct(">HHHB")  # transaction id, protocol id, length, unit id
HEADER_SIZE: Final = _HEADER.size
# The length field counts the unit id and the PDU, which is 1 to 253 bytes.
MIN_LENGTH_FIELD: Final = 2
MAX_LENGTH_FIELD: Final = 254
# Bytes of the header that the length field does not count (everything but the unit id).
_UNCOUNTED_HEADER_BYTES: Final = HEADER_SIZE - 1
_PROTOCOL_ID: Final = 0


class FrameError(ValueError):
    """The stream cannot be framed any more; the connection must be closed."""


@dataclass(frozen=True)
class Frame:
    transaction_id: int
    unit_id: int
    pdu: bytes


def encode_frame(transaction_id: int, unit_id: int, pdu: bytes) -> bytes:
    """An answer frame: the request's transaction and unit ids are echoed."""
    length = len(pdu) + 1
    if not MIN_LENGTH_FIELD <= length <= MAX_LENGTH_FIELD:
        raise ValueError(f"A PDU of {len(pdu)} bytes does not fit a Modbus TCP frame.")
    return _HEADER.pack(transaction_id, _PROTOCOL_ID, length, unit_id) + pdu


class FrameDecoder:
    """Cuts the bytes of one connection into frames, whatever the segmentation."""

    def __init__(self) -> None:
        self._buffer = bytearray()

    @property
    def buffered_bytes(self) -> int:
        return len(self._buffer)

    def extend(self, data: bytes) -> None:
        self._buffer.extend(data)

    def feed(self, data: bytes) -> Iterator[Frame]:
        """Add bytes, then yield each complete frame (see `frames`)."""
        self.extend(data)
        return self.frames()

    def frames(self) -> Iterator[Frame]:
        """Yield each complete frame of the buffer, then wait for more bytes.

        A generator, so a caller handles the good frames that precede a bad header before it
        sees the `FrameError`. A frame leaves the buffer as it is yielded, so a caller may stop
        early and call `frames` again later.
        """
        while len(self._buffer) >= HEADER_SIZE:
            transaction_id, protocol_id, length, unit_id = _HEADER.unpack_from(self._buffer)
            if protocol_id != _PROTOCOL_ID:
                raise FrameError(f"protocol id {protocol_id}, Modbus TCP uses {_PROTOCOL_ID}")
            if not MIN_LENGTH_FIELD <= length <= MAX_LENGTH_FIELD:
                raise FrameError(f"length field {length}, expected {MIN_LENGTH_FIELD} to 254")
            frame_end = _UNCOUNTED_HEADER_BYTES + length
            if len(self._buffer) < frame_end:
                return
            pdu = bytes(self._buffer[HEADER_SIZE:frame_end])
            del self._buffer[:frame_end]
            yield Frame(transaction_id, unit_id, pdu)
