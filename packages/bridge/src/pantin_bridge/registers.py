"""Register encoding of ADR 0045 point 8: pure functions, no pymodbus.

A BOOL is one coil or input. A REAL (IEEE 754 single) and a DINT (signed 32 bits) take two
consecutive 16-bit registers; each register is big-endian as the Modbus specification says,
and the module's word order says which register holds the high half.
"""

from __future__ import annotations

import math
import struct

from pantin_bridge.io_mapping import IoType, WordOrder

_WORD_MASK = 0xFFFF
_DOUBLE_WORD_MASK = 0xFFFF_FFFF
_SIGN_BIT = 0x8000_0000
_SINGLE_PRECISION_LIMIT = 3.4028234663852886e38


def _split_words(unsigned: int, word_order: WordOrder) -> list[int]:
    high = (unsigned >> 16) & _WORD_MASK
    low = unsigned & _WORD_MASK
    return [low, high] if word_order is WordOrder.LOW_WORD_FIRST else [high, low]


def _join_words(words: list[int], word_order: WordOrder) -> int:
    if len(words) != 2:
        raise ValueError(f"A 32-bit value takes 2 registers, got {len(words)}.")
    if any(not 0 <= word <= _WORD_MASK for word in words):
        raise ValueError("A register holds 16 bits.")
    low, high = words if word_order is WordOrder.LOW_WORD_FIRST else (words[1], words[0])
    return (high << 16) | low


def encode_real(value: float, word_order: WordOrder) -> list[int]:
    """Round a double to single precision. Beyond the single range it becomes infinity."""
    if math.isnan(value):
        raise ValueError("NaN has no tag value: the core never sends one.")
    if abs(value) > _SINGLE_PRECISION_LIMIT:
        value = math.copysign(math.inf, value)
    (unsigned,) = struct.unpack(">I", struct.pack(">f", value))
    return _split_words(unsigned, word_order)


def decode_real(words: list[int], word_order: WordOrder) -> float:
    (value,) = struct.unpack(">f", struct.pack(">I", _join_words(words, word_order)))
    return float(value)


def encode_dint(value: int, word_order: WordOrder) -> list[int]:
    """Two's complement: a count beyond the DINT range wraps like a hardware counter."""
    return _split_words(value & _DOUBLE_WORD_MASK, word_order)


def decode_dint(words: list[int], word_order: WordOrder) -> int:
    unsigned = _join_words(words, word_order)
    return unsigned - (1 << 32) if unsigned & _SIGN_BIT else unsigned


def encode_registers(io_type: IoType, value: float, word_order: WordOrder) -> list[int]:
    """The registers of a REAL or DINT tag value."""
    if io_type is IoType.REAL:
        return encode_real(value, word_order)
    if io_type is IoType.DINT:
        # The core's integer tags are integers; rounding only guards a float that slipped in.
        return encode_dint(round(value), word_order)
    raise ValueError("A BOOL is a coil or an input, not a register.")


def decode_registers(io_type: IoType, words: list[int], word_order: WordOrder) -> int | float:
    """The tag value of the registers of a REAL (a float) or a DINT (an int)."""
    if io_type is IoType.REAL:
        return decode_real(words, word_order)
    if io_type is IoType.DINT:
        return decode_dint(words, word_order)
    raise ValueError("A BOOL is a coil or an input, not a register.")


def normalize_value(io_type: IoType, value: float, word_order: WordOrder) -> float:
    """The value a PLC would read back: what the registers (or the coil) can hold of `value`."""
    if io_type is IoType.BOOL:
        return 1 if value else 0
    return decode_registers(io_type, encode_registers(io_type, value, word_order), word_order)
