"""The I/O mapping the core serves at GET /api/pantins/:pantinId/io (ADR 0045 points 6 and 7)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from pantin_bridge.errors import ProtocolError
from pantin_bridge.wire_decoding import (
    JsonObject,
    as_enum,
    as_integer,
    as_key,
    as_list,
    as_object,
    as_string,
    as_tag_name,
    reject_unknown_fields,
)

_IO_FILES = frozenset({"io.csv", "io-modules.json"})
# The codes of IO_PROBLEM_CODES (packages/protocol/src/io-mapping.ts).
IO_PROBLEM_CODES = frozenset(
    {
        "file_too_large",
        "invalid_encoding",
        "byte_order_mark",
        "bad_header",
        "blank_line",
        "bare_carriage_return",
        "wrong_field_count",
        "quote_in_field",
        "invalid_zone",
        "invalid_type",
        "invalid_address",
        "modules_missing",
        "modules_invalid",
        "unknown_tag",
        "duplicate_tag",
        "unknown_module",
        "zone_direction_mismatch",
        "type_mismatch",
        "type_zone_mismatch",
        "address_out_of_range",
        "address_overlap",
        "invalid_variable",
        "duplicate_variable",
    }
)


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


class IoStatus(StrEnum):
    VALID = "valid"
    INVALID = "invalid"
    MISSING = "missing"


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


@dataclass(frozen=True)
class IoProblem:
    file: str
    line: int | None
    code: str
    message: str


@dataclass(frozen=True)
class IoMapping:
    status: IoStatus
    mapping_id: str | None
    modules: tuple[IoModule, ...]
    rows: tuple[IoRow, ...]
    problems: tuple[IoProblem, ...]

    def rows_of(self, module_key: str) -> tuple[IoRow, ...]:
        return tuple(row for row in self.rows if row.module == module_key)


_MODULE_FIELDS = frozenset({"key", "port", "unitId", "wordOrder", "watchdogMilliseconds"})
# The bounds of IoModuleSchema (packages/protocol/src/io-mapping.ts).
_PORTS = (1024, 65535)
_UNIT_IDS = (1, 247)
_WATCHDOG_MILLISECONDS = (100, 3_600_000)


def _in_range(value: int, bounds: tuple[int, int], where: str) -> int:
    if not bounds[0] <= value <= bounds[1]:
        raise ProtocolError(f"{where} must be from {bounds[0]} to {bounds[1]}.")
    return value


def _decode_module(raw: object, where: str) -> IoModule:
    item = as_object(raw, where)
    reject_unknown_fields(item, _MODULE_FIELDS, where)
    return IoModule(
        key=as_key(item.get("key"), f"{where}.key"),
        port=_in_range(as_integer(item.get("port"), f"{where}.port"), _PORTS, f"{where}.port"),
        unit_id=_in_range(
            as_integer(item.get("unitId"), f"{where}.unitId"), _UNIT_IDS, f"{where}.unitId"
        ),
        word_order=as_enum(item.get("wordOrder"), WordOrder, f"{where}.wordOrder"),
        watchdog_milliseconds=_in_range(
            as_integer(item.get("watchdogMilliseconds"), f"{where}.watchdogMilliseconds"),
            _WATCHDOG_MILLISECONDS,
            f"{where}.watchdogMilliseconds",
        ),
    )


def _decode_row(raw: object, where: str) -> IoRow:
    item = as_object(raw, where)
    zone = as_enum(item.get("zone"), IoZone, f"{where}.zone")
    io_type = as_enum(item.get("ioType"), IoType, f"{where}.ioType")
    # The core validates this pairing; a bridge that trusted a wrong one would encode a
    # bit as registers, so the cheap check stays.
    if zone.is_bit_zone != (io_type is IoType.BOOL):
        raise ProtocolError(f"{where}: a {io_type.value} cannot sit in the {zone.value} zone.")
    as_integer(item.get("line"), f"{where}.line", minimum=1)
    return IoRow(
        tag=as_string(item.get("tag"), f"{where}.tag"),
        module=as_string(item.get("module"), f"{where}.module"),
        zone=zone,
        address=as_integer(item.get("address"), f"{where}.address", minimum=0),
        io_type=io_type,
    )


def _decode_problem(raw: object, where: str) -> IoProblem:
    item = as_object(raw, where)
    line = item.get("line")
    file = as_string(item.get("file"), f"{where}.file")
    if file not in _IO_FILES:
        raise ProtocolError(f"{where}.file must be one of {', '.join(sorted(_IO_FILES))}.")
    code = as_string(item.get("code"), f"{where}.code")
    if code not in IO_PROBLEM_CODES:
        raise ProtocolError(f'{where}.code "{code}" is not a known io problem code.')
    return IoProblem(
        file=file,
        line=None if line is None else as_integer(line, f"{where}.line", minimum=1),
        code=code,
        message=as_string(item.get("message"), f"{where}.message", allow_empty=True),
    )


def _decode_mapping_id(raw: object) -> str | None:
    return None if raw is None else as_string(raw, "mappingId")


def decode_io_mapping(document: object) -> IoMapping:
    """Decode an IoMappingResponse; any field of the wrong shape is a ProtocolError."""
    body: JsonObject = as_object(document, "The io answer")
    modules = tuple(
        _decode_module(item, f"modules[{index}]")
        for index, item in enumerate(as_list(body.get("modules"), "modules"))
    )
    rows = tuple(
        _decode_row(item, f"rows[{index}]")
        for index, item in enumerate(as_list(body.get("rows"), "rows"))
    )
    problems = tuple(
        _decode_problem(item, f"problems[{index}]")
        for index, item in enumerate(as_list(body.get("problems"), "problems"))
    )
    # unmappedTags is read for its shape only: unmapped tags are a warning, not the bridge's job.
    for index, name in enumerate(as_list(body.get("unmappedTags"), "unmappedTags")):
        as_tag_name(name, f"unmappedTags[{index}]")
    return IoMapping(
        status=as_enum(body.get("status"), IoStatus, "status"),
        mapping_id=_decode_mapping_id(body.get("mappingId")),
        modules=modules,
        rows=rows,
        problems=problems,
    )


def zone_sizes(rows: tuple[IoRow, ...]) -> dict[IoZone, int]:
    """How many coils, inputs or registers each zone needs to hold the rows (at least 1)."""
    sizes = dict.fromkeys(IoZone, 1)
    for row in rows:
        sizes[row.zone] = max(sizes[row.zone], row.address + row.width)
    return sizes
