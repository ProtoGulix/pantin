"""MBAP framing: header checks, split and pipelined delivery, answer encoding."""

from __future__ import annotations

import pytest

from pantin_bridge.modbus_frames import Frame, FrameDecoder, FrameError, encode_frame

READ_TWO = bytes.fromhex("0300000002")


def _frame_bytes(transaction_id: int, unit_id: int, pdu: bytes) -> bytes:
    return encode_frame(transaction_id, unit_id, pdu)


def _decode(*chunks: bytes) -> list[Frame]:
    decoder = FrameDecoder()
    return [frame for chunk in chunks for frame in decoder.feed(chunk)]


def test_encodes_the_header_with_the_length_of_unit_id_and_pdu() -> None:
    assert encode_frame(0x1234, 7, READ_TWO) == bytes.fromhex("1234 0000 0006 07") + READ_TWO


def test_decodes_one_frame() -> None:
    assert _decode(_frame_bytes(9, 1, READ_TWO)) == [Frame(9, 1, READ_TWO)]


def test_waits_for_the_rest_of_a_split_frame_at_every_offset() -> None:
    data = _frame_bytes(9, 1, READ_TWO)

    for offset in range(1, len(data)):
        assert _decode(data[:offset], data[offset:]) == [Frame(9, 1, READ_TWO)]


def test_decodes_a_frame_delivered_one_byte_at_a_time() -> None:
    data = _frame_bytes(9, 1, READ_TWO)

    assert _decode(*(data[i : i + 1] for i in range(len(data)))) == [Frame(9, 1, READ_TWO)]


def test_decodes_pipelined_frames_in_order() -> None:
    data = _frame_bytes(1, 1, READ_TWO) + _frame_bytes(2, 1, READ_TWO) + _frame_bytes(3, 2, b"\x01")

    assert [frame.transaction_id for frame in _decode(data)] == [1, 2, 3]


def test_keeps_the_start_of_the_next_frame_after_a_complete_one() -> None:
    first = _frame_bytes(1, 1, READ_TWO)
    second = _frame_bytes(2, 1, READ_TWO)

    decoder = FrameDecoder()
    frames = list(decoder.feed(first + second[:5]))
    frames += decoder.feed(second[5:])

    assert [frame.transaction_id for frame in frames] == [1, 2]


@pytest.mark.parametrize("length", [2, 254])
def test_accepts_the_smallest_and_the_largest_length(length: int) -> None:
    pdu = bytes(length - 1)

    assert _decode(_frame_bytes(1, 1, pdu)) == [Frame(1, 1, pdu)]


@pytest.mark.parametrize("length", [0, 1, 255, 300, 65535])
def test_a_length_outside_two_to_254_is_a_frame_error(length: int) -> None:
    header = bytes.fromhex("0001 0000") + length.to_bytes(2, "big") + b"\x01"

    with pytest.raises(FrameError, match="length"):
        _decode(header)


def test_a_protocol_id_other_than_zero_is_a_frame_error() -> None:
    with pytest.raises(FrameError, match="protocol"):
        _decode(bytes.fromhex("0001 0001 0006 01") + READ_TWO)


def test_a_bad_header_is_refused_before_its_body_arrives() -> None:
    with pytest.raises(FrameError):
        _decode(bytes.fromhex("0001 0000 0000 01"))


def test_good_frames_before_a_bad_header_are_still_yielded() -> None:
    decoder = FrameDecoder()
    stream = decoder.feed(_frame_bytes(1, 1, READ_TWO) + bytes.fromhex("0002 0005 0006 01"))

    assert next(stream).transaction_id == 1
    with pytest.raises(FrameError):
        next(stream)


@pytest.mark.parametrize("size", [0, 254])
def test_refuses_to_encode_a_pdu_that_does_not_fit(size: int) -> None:
    with pytest.raises(ValueError, match="does not fit"):
        encode_frame(1, 1, bytes(size))
