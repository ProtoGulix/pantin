"""handle_pdu, table driven: every function code at the quantity and address limits."""

from __future__ import annotations

import struct
from collections.abc import Callable
from dataclasses import dataclass

import pytest

from pantin_bridge.io_mapping import IoZone
from pantin_bridge.modbus_pdu import ModbusStore, PlcWrite, handle_pdu

UNIT = 1
SIZES = {
    IoZone.COIL: 2000,
    IoZone.DISCRETE_INPUT: 2000,
    IoZone.HOLDING_REGISTER: 200,
    IoZone.INPUT_REGISTER: 200,
}
ILLEGAL_FUNCTION, ILLEGAL_ADDRESS, ILLEGAL_VALUE, NO_GATEWAY = 1, 2, 3, 11


def make_store(unit_id: int = UNIT) -> ModbusStore:
    return ModbusStore(unit_id, SIZES)


def exception_pdu(function_code: int, code: int) -> bytes:
    return bytes([function_code | 0x80, code])


def read_request(function_code: int) -> Callable[[int, int], bytes]:
    return lambda address, quantity: struct.pack(">BHH", function_code, address, quantity)


def write_coils(address: int, quantity: int) -> bytes:
    byte_count = (quantity + 7) // 8
    return struct.pack(">BHHB", 15, address, quantity, byte_count) + bytes(byte_count)


def write_registers(address: int, quantity: int) -> bytes:
    return struct.pack(">BHHB", 16, address, quantity, quantity * 2) + bytes(quantity * 2)


def read_write_read_side(address: int, quantity: int) -> bytes:
    return struct.pack(">BHHHHB", 23, address, quantity, 0, 1, 2) + bytes(2)


def read_write_write_side(address: int, quantity: int) -> bytes:
    return struct.pack(">BHHHHB", 23, 0, 1, address, quantity, quantity * 2) + bytes(quantity * 2)


@dataclass(frozen=True)
class Case:
    function_code: int
    build: Callable[[int, int], bytes]
    maximum: int
    zone_size: int


CASES = {
    "fc1": Case(1, read_request(1), 2000, 2000),
    "fc2": Case(2, read_request(2), 2000, 2000),
    "fc3": Case(3, read_request(3), 125, 200),
    "fc4": Case(4, read_request(4), 125, 200),
    "fc15": Case(15, write_coils, 1968, 2000),
    "fc16": Case(16, write_registers, 123, 200),
    "fc23-read": Case(23, read_write_read_side, 125, 200),
    "fc23-write": Case(23, read_write_write_side, 121, 200),
}
case_ids = list(CASES)


def answer(pdu: bytes) -> bytes:
    return handle_pdu(UNIT, pdu, make_store()).response


@pytest.mark.parametrize("name", case_ids)
def test_quantity_zero_is_illegal_value(name: str) -> None:
    case = CASES[name]

    assert answer(case.build(0, 0)) == exception_pdu(case.function_code, ILLEGAL_VALUE)


@pytest.mark.parametrize("name", case_ids)
@pytest.mark.parametrize("which", ["one", "maximum"])
def test_quantity_one_and_the_maximum_are_served(name: str, which: str) -> None:
    case = CASES[name]

    response = answer(case.build(0, 1 if which == "one" else case.maximum))

    assert response[0] == case.function_code


@pytest.mark.parametrize("name", case_ids)
def test_quantity_above_the_maximum_is_illegal_value(name: str) -> None:
    case = CASES[name]

    assert answer(case.build(0, case.maximum + 1)) == exception_pdu(
        case.function_code, ILLEGAL_VALUE
    )


@pytest.mark.parametrize("name", case_ids)
def test_the_last_address_is_served_and_the_one_after_is_illegal_address(name: str) -> None:
    case = CASES[name]

    assert answer(case.build(case.zone_size - 1, 1))[0] == case.function_code
    assert answer(case.build(case.zone_size, 1)) == exception_pdu(
        case.function_code, ILLEGAL_ADDRESS
    )


@pytest.mark.parametrize("name", case_ids)
def test_a_range_that_crosses_the_end_is_illegal_address(name: str) -> None:
    case = CASES[name]

    assert answer(case.build(case.zone_size - 1, 2)) == exception_pdu(
        case.function_code, ILLEGAL_ADDRESS
    )


@pytest.mark.parametrize("function_code", [5, 6])
def test_single_writes_serve_the_last_address_and_refuse_the_next(function_code: int) -> None:
    zone_size = SIZES[IoZone.COIL if function_code == 5 else IoZone.HOLDING_REGISTER]
    last = struct.pack(">BHH", function_code, zone_size - 1, 0xFF00 if function_code == 5 else 7)
    after = struct.pack(">BHH", function_code, zone_size, 0)

    assert answer(last) == last
    assert answer(after) == exception_pdu(function_code, ILLEGAL_ADDRESS)


@pytest.mark.parametrize("value", [1, 0x1234, 0xFF01, 0xFFFF])
def test_a_coil_value_other_than_0_or_ff00_is_illegal_value(value: int) -> None:
    assert answer(struct.pack(">BHH", 5, 0, value)) == exception_pdu(5, ILLEGAL_VALUE)


def test_a_coil_value_is_checked_before_the_address() -> None:
    assert answer(struct.pack(">BHH", 5, 5000, 1)) == exception_pdu(5, ILLEGAL_VALUE)


def test_reads_return_the_stored_values_packed() -> None:
    store = make_store()
    store.write(IoZone.COIL, 0, [True, False, True, True, False, False, False, False, True])
    store.write(IoZone.HOLDING_REGISTER, 2, [0x1234, 0xABCD])

    coils = handle_pdu(UNIT, struct.pack(">BHH", 1, 0, 9), store).response
    registers = handle_pdu(UNIT, struct.pack(">BHH", 3, 2, 2), store).response

    assert coils == bytes([1, 2, 0b00001101, 0b1])
    assert registers == bytes([3, 4, 0x12, 0x34, 0xAB, 0xCD])


def test_fc5_and_fc6_echo_the_request_and_report_the_write() -> None:
    store = make_store()
    coil = struct.pack(">BHH", 5, 3, 0xFF00)
    register = struct.pack(">BHH", 6, 4, 0xBEEF)

    coil_result = handle_pdu(UNIT, coil, store)
    register_result = handle_pdu(UNIT, register, store)

    assert coil_result.response == coil
    assert coil_result.writes == (PlcWrite(IoZone.COIL, 3, (1,)),)
    assert register_result.response == register
    assert register_result.writes == (PlcWrite(IoZone.HOLDING_REGISTER, 4, (0xBEEF,)),)
    assert store.read(IoZone.COIL, 3, 1) == [1]
    assert store.read(IoZone.HOLDING_REGISTER, 4, 1) == [0xBEEF]


def test_fc15_unpacks_bits_lowest_first_and_answers_address_and_quantity() -> None:
    store = make_store()
    request = struct.pack(">BHHB", 15, 10, 10, 2) + bytes([0b00000101, 0b10])

    result = handle_pdu(UNIT, request, store)

    assert result.response == struct.pack(">BHH", 15, 10, 10)
    assert result.writes == (PlcWrite(IoZone.COIL, 10, (1, 0, 1, 0, 0, 0, 0, 0, 0, 1)),)


def test_fc16_answers_address_and_quantity() -> None:
    store = make_store()
    request = struct.pack(">BHHB", 16, 5, 2, 4) + struct.pack(">HH", 1, 2)

    result = handle_pdu(UNIT, request, store)

    assert result.response == struct.pack(">BHH", 16, 5, 2)
    assert result.writes == (PlcWrite(IoZone.HOLDING_REGISTER, 5, (1, 2)),)


def test_fc23_writes_before_it_reads() -> None:
    store = make_store()
    store.write(IoZone.HOLDING_REGISTER, 0, [9, 9, 9])
    request = struct.pack(">BHHHHB", 23, 0, 3, 1, 2, 4) + struct.pack(">HH", 100, 200)

    result = handle_pdu(UNIT, request, store)

    # Register 0 keeps its old value, 1 and 2 are what this very request wrote.
    assert result.response == bytes([23, 6]) + struct.pack(">HHH", 9, 100, 200)
    assert result.writes == (PlcWrite(IoZone.HOLDING_REGISTER, 1, (100, 200)),)


@pytest.mark.parametrize("name", ["fc23-read", "fc23-write"])
def test_a_refused_fc23_changes_nothing_and_reports_no_write(name: str) -> None:
    case = CASES[name]
    store = make_store()

    result = handle_pdu(UNIT, case.build(case.zone_size, 1), store)

    assert result.response == exception_pdu(23, ILLEGAL_ADDRESS)
    assert result.writes == ()
    assert store.read(IoZone.HOLDING_REGISTER, 0, 200) == [0] * 200


@pytest.mark.parametrize(
    ("zone", "pdu"),
    [
        (IoZone.COIL, struct.pack(">BHHB", 15, 1999, 2, 1) + b"\xff"),
        (IoZone.HOLDING_REGISTER, struct.pack(">BHHB", 16, 199, 2, 4) + b"\xff" * 4),
    ],
)
def test_a_refused_fc15_or_fc16_changes_nothing_and_reports_no_write(
    zone: IoZone, pdu: bytes
) -> None:
    store = make_store()

    result = handle_pdu(UNIT, pdu, store)

    assert result.response == exception_pdu(pdu[0], ILLEGAL_ADDRESS)
    assert result.writes == ()
    assert store.read(zone, 0, SIZES[zone]) == [0] * SIZES[zone]


def test_fc23_with_a_valid_write_and_an_out_of_range_read_does_not_write() -> None:
    store = make_store()
    request = struct.pack(">BHHHHB", 23, 199, 2, 0, 1, 2) + struct.pack(">H", 77)

    result = handle_pdu(UNIT, request, store)

    assert result.response == exception_pdu(23, ILLEGAL_ADDRESS)
    assert store.read(IoZone.HOLDING_REGISTER, 0, 1) == [0]


@pytest.mark.parametrize(
    "pdu",
    [
        struct.pack(">BHHB", 15, 0, 9, 3) + bytes(3),  # byte count 3 for 9 bits, which need 2
        struct.pack(">BHHB", 15, 0, 9, 1) + bytes(1),  # byte count 1 for 9 bits
        struct.pack(">BHHB", 16, 0, 2, 2) + bytes(2),  # byte count 2 for 2 registers
        struct.pack(">BHHB", 16, 0, 1, 2) + bytes(1),  # announces 2 data bytes, has 1
        struct.pack(">BHHB", 16, 0, 1, 2) + bytes(3),  # announces 2 data bytes, has 3
        struct.pack(">BHHHHB", 23, 0, 1, 0, 2, 2) + bytes(2),  # byte count for 1 of 2 registers
    ],
)
def test_a_byte_count_that_does_not_match_is_illegal_value(pdu: bytes) -> None:
    assert answer(pdu) == exception_pdu(pdu[0], ILLEGAL_VALUE)


@pytest.mark.parametrize(
    "pdu",
    [bytes([code]) + bytes(size) for code in (1, 2, 3, 4, 5, 6) for size in (0, 3, 5)]
    + [bytes([15, 0, 0, 0, 1]), bytes([16, 0, 0, 0]), bytes([23, 0, 0, 0, 1, 0, 0, 0])],
)
def test_a_truncated_or_overlong_request_is_illegal_value(pdu: bytes) -> None:
    assert answer(pdu) == exception_pdu(pdu[0], ILLEGAL_VALUE)


@pytest.mark.parametrize("function_code", [0, 7, 8, 22, 24, 43, 0x80, 255])
def test_an_unknown_function_code_is_illegal_function(function_code: int) -> None:
    result = handle_pdu(UNIT, bytes([function_code]) + bytes(4), make_store())

    assert result.response == exception_pdu(function_code, ILLEGAL_FUNCTION)
    assert result.writes == ()


@pytest.mark.parametrize(
    "pdu",
    [
        struct.pack(">BHH", 3, 0, 1),
        struct.pack(">BHH", 3, 60000, 1),
        struct.pack(">BHH", 1, 5000, 1),
        struct.pack(">BHH", 6, 0, 1),
        write_registers(0, 1),
        bytes([99]),
    ],
)
def test_another_unit_id_gets_exception_11_at_any_address_and_writes_nothing(pdu: bytes) -> None:
    store = make_store(unit_id=7)

    result = handle_pdu(UNIT, pdu, store)

    assert result.response == exception_pdu(pdu[0], NO_GATEWAY)
    assert result.writes == ()
    assert not result.served
    assert store.read(IoZone.HOLDING_REGISTER, 0, 200) == [0] * 200


def test_the_served_unit_id_is_counted_as_served_even_for_an_exception() -> None:
    assert handle_pdu(UNIT, bytes([99]), make_store()).served


def test_an_empty_pdu_is_illegal_function() -> None:
    assert handle_pdu(UNIT, b"", make_store()).response == exception_pdu(0, ILLEGAL_FUNCTION)


def test_the_store_refuses_a_write_outside_its_zone() -> None:
    with pytest.raises(ValueError, match="outside"):
        make_store().write(IoZone.COIL, 1999, [True, True])
