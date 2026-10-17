"""Modbus request handling (ADR 0048 point 2): a request PDU in, an answer PDU out. Pure.

Function codes 1 to 6, 15, 16 and 23, with the limits of the Modbus Application Protocol
V1.1b3. Checks run in the order of the specification: function code (exception 1), then the
structure and quantity (3), then the address range (2). A request that gets an exception
changes nothing and reports no write, so a refused PLC write never reaches the core.
"""

from __future__ import annotations

import struct
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from enum import IntEnum
from typing import Final, NamedTuple

from pantin_bridge.io_mapping import IoZone


class ExceptionCode(IntEnum):
    ILLEGAL_FUNCTION = 1
    ILLEGAL_ADDRESS = 2
    ILLEGAL_VALUE = 3
    # What a gateway answers when no device sits at the unit id (Application Protocol 7).
    GATEWAY_NO_RESPONSE = 11


class ModbusException(Exception):  # noqa: N818 - the protocol's own word for it
    """A request the slave answers with an exception PDU. Never leaves `handle_pdu`."""

    def __init__(self, code: ExceptionCode) -> None:
        super().__init__(code.name)
        self.code = code


MAX_READ_BITS: Final = 2000
MAX_WRITE_BITS: Final = 1968
MAX_READ_REGISTERS: Final = 125
MAX_WRITE_REGISTERS: Final = 123
MAX_WRITE_REGISTERS_IN_READ_WRITE: Final = 121

_COIL_ON: Final = 0xFF00
_EXCEPTION_FLAG: Final = 0x80


@dataclass(frozen=True)
class PlcWrite:
    zone: IoZone
    address: int
    values: tuple[int, ...]


@dataclass(frozen=True)
class Refusal:
    """What an exception answer was about, for the log (ADR 0054 point 3). Never logged here."""

    unit_id: int
    expected_unit_id: int
    function_code: int
    # None when the request is too short to carry them.
    address: int | None
    quantity: int | None
    exception: ExceptionCode


@dataclass(frozen=True)
class PduResult:
    response: bytes
    writes: tuple[PlcWrite, ...] = ()
    # False for a request addressed to another unit id: it is not traffic of this module.
    served: bool = True
    # Set exactly when the response is an exception.
    refusal: Refusal | None = None


class ModbusStore:
    """The four zones of one module, sized to its mapped range. Bits are stored as 0 or 1."""

    def __init__(self, unit_id: int, sizes: Mapping[IoZone, int]) -> None:
        self.unit_id = unit_id
        self._zones = {zone: [0] * sizes[zone] for zone in IoZone}

    def size(self, zone: IoZone) -> int:
        return len(self._zones[zone])

    def read(self, zone: IoZone, address: int, count: int) -> list[int]:
        return self._zones[zone][address : address + count]

    def write(self, zone: IoZone, address: int, values: Sequence[int] | Sequence[bool]) -> None:
        if address < 0 or address + len(values) > self.size(zone):
            # Slice assignment would silently grow the zone: fail where the bug is.
            raise ValueError(f"Write of {len(values)} at {address} is outside {zone.value}.")
        self._zones[zone][address : address + len(values)] = [int(value) for value in values]


class _Outcome(NamedTuple):
    body: bytes
    writes: tuple[PlcWrite, ...] = ()


_Handler = Callable[[ModbusStore, bytes], _Outcome]


def _fixed(body: bytes, layout: str) -> tuple[int, ...]:
    """Unpack a request whose size is fixed; any other size is a structure error."""
    if len(body) != struct.calcsize(layout):
        raise ModbusException(ExceptionCode.ILLEGAL_VALUE)
    return struct.unpack(layout, body)


def _with_data(body: bytes, layout: str) -> tuple[tuple[int, ...], bytes]:
    """Unpack a header whose last field is a byte count, then the data it announces."""
    header_size = struct.calcsize(layout)
    if len(body) < header_size:
        raise ModbusException(ExceptionCode.ILLEGAL_VALUE)
    header = struct.unpack(layout, body[:header_size])
    data = body[header_size:]
    if len(data) != header[-1]:
        raise ModbusException(ExceptionCode.ILLEGAL_VALUE)
    return header, data


def _check_quantity(quantity: int, maximum: int) -> None:
    if not 1 <= quantity <= maximum:
        raise ModbusException(ExceptionCode.ILLEGAL_VALUE)


def _check_range(store: ModbusStore, zone: IoZone, address: int, quantity: int) -> None:
    if address + quantity > store.size(zone):
        raise ModbusException(ExceptionCode.ILLEGAL_ADDRESS)


def _pack_bits(bits: Sequence[int]) -> bytes:
    packed = bytearray((len(bits) + 7) // 8)
    for index, bit in enumerate(bits):
        packed[index // 8] |= bit << (index % 8)
    return bytes(packed)


def _unpack_bits(data: bytes, quantity: int) -> tuple[int, ...]:
    return tuple((data[index // 8] >> (index % 8)) & 1 for index in range(quantity))


def _pack_registers(words: Sequence[int]) -> bytes:
    return struct.pack(f">{len(words)}H", *words)


def _unpack_registers(data: bytes) -> tuple[int, ...]:
    return struct.unpack(f">{len(data) // 2}H", data)


def _prefixed(data: bytes) -> bytes:
    return bytes([len(data)]) + data


def _read_zone(
    store: ModbusStore, zone: IoZone, address: int, quantity: int, maximum: int
) -> bytes:
    _check_quantity(quantity, maximum)
    _check_range(store, zone, address, quantity)
    values = store.read(zone, address, quantity)
    return _prefixed(_pack_bits(values) if zone.is_bit_zone else _pack_registers(values))


def _reader(zone: IoZone, maximum: int) -> _Handler:
    def handle(store: ModbusStore, body: bytes) -> _Outcome:
        address, quantity = _fixed(body, ">HH")
        return _Outcome(_read_zone(store, zone, address, quantity, maximum))

    return handle


def _write_single_coil(store: ModbusStore, body: bytes) -> _Outcome:
    address, value = _fixed(body, ">HH")
    if value not in (0, _COIL_ON):
        raise ModbusException(ExceptionCode.ILLEGAL_VALUE)
    _check_range(store, IoZone.COIL, address, 1)
    bit = int(value == _COIL_ON)
    store.write(IoZone.COIL, address, [bit])
    return _Outcome(body, (PlcWrite(IoZone.COIL, address, (bit,)),))


def _write_single_register(store: ModbusStore, body: bytes) -> _Outcome:
    address, value = _fixed(body, ">HH")
    _check_range(store, IoZone.HOLDING_REGISTER, address, 1)
    store.write(IoZone.HOLDING_REGISTER, address, [value])
    return _Outcome(body, (PlcWrite(IoZone.HOLDING_REGISTER, address, (value,)),))


def _write_multiple_coils(store: ModbusStore, body: bytes) -> _Outcome:
    (address, quantity, byte_count), data = _with_data(body, ">HHB")
    _check_quantity(quantity, MAX_WRITE_BITS)
    if byte_count != (quantity + 7) // 8:
        raise ModbusException(ExceptionCode.ILLEGAL_VALUE)
    _check_range(store, IoZone.COIL, address, quantity)
    bits = _unpack_bits(data, quantity)
    store.write(IoZone.COIL, address, bits)
    return _Outcome(body[:4], (PlcWrite(IoZone.COIL, address, bits),))


def _write_multiple_registers(store: ModbusStore, body: bytes) -> _Outcome:
    (address, quantity, byte_count), data = _with_data(body, ">HHB")
    _check_quantity(quantity, MAX_WRITE_REGISTERS)
    if byte_count != quantity * 2:
        raise ModbusException(ExceptionCode.ILLEGAL_VALUE)
    _check_range(store, IoZone.HOLDING_REGISTER, address, quantity)
    words = _unpack_registers(data)
    store.write(IoZone.HOLDING_REGISTER, address, words)
    return _Outcome(body[:4], (PlcWrite(IoZone.HOLDING_REGISTER, address, words),))


def _read_write_registers(store: ModbusStore, body: bytes) -> _Outcome:
    holding = IoZone.HOLDING_REGISTER
    (read_address, read_quantity, write_address, write_quantity, byte_count), data = _with_data(
        body, ">HHHHB"
    )
    _check_quantity(read_quantity, MAX_READ_REGISTERS)
    _check_quantity(write_quantity, MAX_WRITE_REGISTERS_IN_READ_WRITE)
    if byte_count != write_quantity * 2:
        raise ModbusException(ExceptionCode.ILLEGAL_VALUE)
    # Both ranges are checked before the write, so a refused request changes nothing.
    _check_range(store, holding, read_address, read_quantity)
    _check_range(store, holding, write_address, write_quantity)
    words = _unpack_registers(data)
    # The specification performs the write operation before the read operation.
    store.write(holding, write_address, words)
    answer = _read_zone(store, holding, read_address, read_quantity, MAX_READ_REGISTERS)
    return _Outcome(answer, (PlcWrite(holding, write_address, words),))


_HANDLERS: Final[Mapping[int, _Handler]] = {
    1: _reader(IoZone.COIL, MAX_READ_BITS),
    2: _reader(IoZone.DISCRETE_INPUT, MAX_READ_BITS),
    3: _reader(IoZone.HOLDING_REGISTER, MAX_READ_REGISTERS),
    4: _reader(IoZone.INPUT_REGISTER, MAX_READ_REGISTERS),
    5: _write_single_coil,
    6: _write_single_register,
    15: _write_multiple_coils,
    16: _write_multiple_registers,
    23: _read_write_registers,
}


def _exception_pdu(function_code: int, code: ExceptionCode) -> bytes:
    return bytes([function_code | _EXCEPTION_FLAG, code])


def _requested_range(function_code: int, body: bytes) -> tuple[int | None, int | None]:
    """The address and quantity a request asks for, as far as its first four bytes tell."""
    if function_code not in _HANDLERS or len(body) < struct.calcsize(">HH"):
        return None, None
    address, second = struct.unpack(">HH", body[:4])
    # The second word of functions 5 and 6 is the value written, not a quantity.
    return address, 1 if function_code in (5, 6) else second


def _refused(
    unit_id: int, pdu: bytes, store: ModbusStore, code: ExceptionCode, *, served: bool
) -> PduResult:
    function_code = pdu[0] if pdu else 0
    address, quantity = _requested_range(function_code, pdu[1:])
    refusal = Refusal(unit_id, store.unit_id, function_code, address, quantity, code)
    return PduResult(_exception_pdu(function_code, code), served=served, refusal=refusal)


def handle_pdu(unit_id: int, pdu: bytes, store: ModbusStore) -> PduResult:
    """Answer one request. The store changes only for a request that is answered normally."""
    function_code = pdu[0] if pdu else 0
    if unit_id != store.unit_id:
        return _refused(unit_id, pdu, store, ExceptionCode.GATEWAY_NO_RESPONSE, served=False)
    handler = _HANDLERS.get(function_code)
    if handler is None:
        return _refused(unit_id, pdu, store, ExceptionCode.ILLEGAL_FUNCTION, served=True)
    try:
        outcome = handler(store, pdu[1:])
    except ModbusException as refusal:
        return _refused(unit_id, pdu, store, refusal.code, served=True)
    return PduResult(bytes([function_code]) + outcome.body, outcome.writes)
