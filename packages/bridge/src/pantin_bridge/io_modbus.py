"""The Modbus TCP slave part of the I/O mapping: its zones, types, module settings and rows.

Kept apart from io_mapping.py so that the common decoding stays small (ADR 0064 point 3).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Final

from pantin_bridge.errors import ProtocolError
from pantin_bridge.wire_decoding import (
    JsonObject,
    as_enum,
    as_integer,
    as_object,
    reject_unknown_fields,
)

MODBUS_TCP_SLAVE_KIND: Final = "modbus_tcp_slave"
_MAX_ADDRESS = 65535
_TRANSPORT_FIELDS = frozenset({"kind", "port", "unitId", "wordOrder", "watchdogMilliseconds"})
_MODBUS_CHANNEL_FIELDS = frozenset({"zone", "address", "ioType"})


class IoZone(StrEnum):
    COIL = "coil"
    DISCRETE_INPUT = "discrete_input"
    HOLDING_REGISTER = "holding_register"
    INPUT_REGISTER = "input_register"

    @property
    def is_bit_zone(self) -> bool:
        return self in (IoZone.COIL, IoZone.DISCRETE_INPUT)

    @property
    def is_command(self) -> bool:
        """The PLC writes coils and holding registers; it reads the other two zones."""
        return self in (IoZone.COIL, IoZone.HOLDING_REGISTER)


class IoType(StrEnum):
    BOOL = "BOOL"
    REAL = "REAL"
    DINT = "DINT"

    @property
    def register_count(self) -> int:
        """REAL and DINT take two registers, BOOL takes one coil or input."""
        return 1 if self is IoType.BOOL else 2


class WordOrder(StrEnum):
    LOW_WORD_FIRST = "low_word_first"
    HIGH_WORD_FIRST = "high_word_first"


@dataclass(frozen=True)
class IoModule:
    key: str
    port: int
    unit_id: int
    word_order: WordOrder
    watchdog_milliseconds: int


@dataclass(frozen=True)
class IoRow:
    tag: str
    module: str
    zone: IoZone
    address: int
    io_type: IoType

    @property
    def width(self) -> int:
        return self.io_type.register_count


# The bounds of the Modbus transport (packages/transport-types/src/modbus-tcp-slave/schema.ts).
_PORTS = (1024, 65535)
_UNIT_IDS = (1, 247)
_WATCHDOG_MILLISECONDS = (100, 3_600_000)


def _in_range(value: int, bounds: tuple[int, int], where: str) -> int:
    if not bounds[0] <= value <= bounds[1]:
        raise ProtocolError(f"{where} must be from {bounds[0]} to {bounds[1]}.")
    return value


def decode_modbus_transport(key: str, transport: JsonObject, where: str) -> IoModule:
    reject_unknown_fields(transport, _TRANSPORT_FIELDS, where)
    return IoModule(
        key=key,
        port=_in_range(as_integer(transport.get("port"), f"{where}.port"), _PORTS, f"{where}.port"),
        unit_id=_in_range(
            as_integer(transport.get("unitId"), f"{where}.unitId"), _UNIT_IDS, f"{where}.unitId"
        ),
        word_order=as_enum(transport.get("wordOrder"), WordOrder, f"{where}.wordOrder"),
        watchdog_milliseconds=_in_range(
            as_integer(transport.get("watchdogMilliseconds"), f"{where}.watchdogMilliseconds"),
            _WATCHDOG_MILLISECONDS,
            f"{where}.watchdogMilliseconds",
        ),
    )


def decode_modbus_channel(item: JsonObject, tag: str, module_key: str, where: str) -> IoRow:
    """The row of a channel of a Modbus module; `item` is the channel object."""
    modbus = as_object(item.get("modbus"), f"{where}.modbus")
    reject_unknown_fields(modbus, _MODBUS_CHANNEL_FIELDS, f"{where}.modbus")
    zone = as_enum(modbus.get("zone"), IoZone, f"{where}.modbus.zone")
    io_type = as_enum(modbus.get("ioType"), IoType, f"{where}.modbus.ioType")
    # The core validates this pairing; a bridge that trusted a wrong one would encode a
    # bit as registers, so the cheap check stays.
    if zone.is_bit_zone != (io_type is IoType.BOOL):
        raise ProtocolError(f"{where}: a {io_type.value} cannot sit in the {zone.value} zone.")
    return IoRow(
        tag=tag,
        module=module_key,
        zone=zone,
        address=_in_range(
            as_integer(modbus.get("address"), f"{where}.modbus.address", minimum=0),
            (0, _MAX_ADDRESS),
            f"{where}.modbus.address",
        ),
        io_type=io_type,
    )
