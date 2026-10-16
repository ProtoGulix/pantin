"""Register encoding of ADR 0045 point 8."""

from __future__ import annotations

import math

import pytest

from pantin_bridge.io_mapping import IoType, WordOrder
from pantin_bridge.registers import (
    decode_dint,
    decode_real,
    encode_dint,
    encode_real,
    encode_registers,
    normalize_value,
)

LOW = WordOrder.LOW_WORD_FIRST
HIGH = WordOrder.HIGH_WORD_FIRST


def test_real_one_is_0x3f800000() -> None:
    # 1.0 is 0x3F80_0000: high word 0x3F80, low word 0x0000.
    assert encode_real(1.0, HIGH) == [0x3F80, 0x0000]
    assert encode_real(1.0, LOW) == [0x0000, 0x3F80]


def test_real_with_two_different_words_shows_the_word_order() -> None:
    # 0.05 as a single is 0x3D4C_CCCD.
    assert encode_real(0.05, HIGH) == [0x3D4C, 0xCCCD]
    assert encode_real(0.05, LOW) == [0xCCCD, 0x3D4C]


@pytest.mark.parametrize("order", [LOW, HIGH])
@pytest.mark.parametrize("value", [0.0, -0.0, 1.5, -273.15, 0.0125, 1e-30, 3.0e38])
def test_real_round_trips_to_single_precision(value: float, order: WordOrder) -> None:
    decoded = decode_real(encode_real(value, order), order)

    assert decoded == pytest.approx(value, rel=1e-6)


def test_real_rounds_a_double_to_single_precision() -> None:
    assert decode_real(encode_real(0.1, LOW), LOW) == pytest.approx(0.10000000149011612)


def test_real_beyond_the_single_range_becomes_infinity() -> None:
    assert decode_real(encode_real(1e300, LOW), LOW) == math.inf
    assert decode_real(encode_real(-1e300, LOW), LOW) == -math.inf


def test_real_refuses_nan() -> None:
    with pytest.raises(ValueError, match="NaN"):
        encode_real(math.nan, LOW)


def test_dint_words_follow_the_word_order() -> None:
    assert encode_dint(0x0001_0002, HIGH) == [0x0001, 0x0002]
    assert encode_dint(0x0001_0002, LOW) == [0x0002, 0x0001]


@pytest.mark.parametrize("order", [LOW, HIGH])
@pytest.mark.parametrize("value", [0, 1, -1, 32767, 32768, 70000, -2147483648, 2147483647])
def test_dint_round_trips(value: int, order: WordOrder) -> None:
    assert decode_dint(encode_dint(value, order), order) == value


def test_dint_beyond_the_range_wraps_like_a_hardware_counter() -> None:
    assert decode_dint(encode_dint(2**31, LOW), LOW) == -(2**31)
    assert decode_dint(encode_dint(2**32 + 5, LOW), LOW) == 5


def test_an_encoder_count_past_a_16_bit_register_needs_both_words() -> None:
    assert encode_dint(40000, LOW) == [40000, 0]


def test_decode_refuses_a_wrong_register_count() -> None:
    with pytest.raises(ValueError, match="2 registers"):
        decode_dint([1], LOW)


def test_decode_refuses_a_value_over_16_bits() -> None:
    with pytest.raises(ValueError, match="16 bits"):
        decode_dint([0x10000, 0], LOW)


def test_a_bool_has_no_registers() -> None:
    with pytest.raises(ValueError, match="BOOL"):
        encode_registers(IoType.BOOL, 1, LOW)


def test_normalize_gives_what_the_plc_reads_back() -> None:
    assert normalize_value(IoType.BOOL, 5, LOW) == 1
    assert normalize_value(IoType.BOOL, 0, LOW) == 0
    assert normalize_value(IoType.REAL, 0.1, LOW) == pytest.approx(0.10000000149011612)
    assert normalize_value(IoType.DINT, 2**31, LOW) == -(2**31)
