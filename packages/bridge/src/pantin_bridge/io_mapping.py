"""The I/O mapping the core serves at GET /api/pantins/:pantinId/io (ADR 0049 point 5)."""

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

# The codes of IO_PROBLEM_CODES (packages/protocol/src/io-mapping.ts).
IO_PROBLEM_CODES = frozenset(
    {
        "file_too_large",
        "invalid_encoding",
        "invalid_json",
        "unreadable_file",
        "schema_invalid",
        "legacy_io_files",
        "unknown_tag",
        "zone_direction_mismatch",
        "type_mismatch",
        "type_zone_mismatch",
        "address_out_of_range",
        "address_overlap",
        "invalid_variable",
        "duplicate_variable",
    }
)
_TAG_TYPES = frozenset({"bit", "float", "integer"})
_DIRECTIONS = frozenset({"command", "feedback"})
_OWNER_KINDS = frozenset({"joint", "drive", "sensor", "emitter", "presenceSensor"})
_MAX_ADDRESS = 65535


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
    # The JSON path into io.json, as in a Zod issue; empty for the whole file.
    path: tuple[str | int, ...]
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


def _decode_channel(raw: object, module_key: str, where: str) -> IoRow:
    item = as_object(raw, where)
    zone = as_enum(item.get("zone"), IoZone, f"{where}.zone")
    io_type = as_enum(item.get("ioType"), IoType, f"{where}.ioType")
    # The core validates this pairing; a bridge that trusted a wrong one would encode a
    # bit as registers, so the cheap check stays.
    if zone.is_bit_zone != (io_type is IoType.BOOL):
        raise ProtocolError(f"{where}: a {io_type.value} cannot sit in the {zone.value} zone.")
    _check_annotations(item, where)
    # Empty is accepted by the schema and reported by the core as invalid_variable.
    as_string(item.get("variable"), f"{where}.variable", allow_empty=True)
    as_string(item.get("comment"), f"{where}.comment", allow_empty=True)
    return IoRow(
        tag=as_tag_name(item.get("tag"), f"{where}.tag"),
        module=module_key,
        zone=zone,
        address=_in_range(
            as_integer(item.get("address"), f"{where}.address", minimum=0),
            (0, _MAX_ADDRESS),
            f"{where}.address",
        ),
        io_type=io_type,
    )


def _one_of(value: object, allowed: frozenset[str], where: str) -> None:
    if not isinstance(value, str) or value not in allowed:
        raise ProtocolError(f"{where} must be one of {', '.join(sorted(allowed))}.")


def _check_one_of(value: object, allowed: frozenset[str], where: str) -> None:
    """Like `_one_of`, for a field the core sets to null when the tag is unknown."""
    if value is not None:
        _one_of(value, allowed, where)


def _check_annotations(item: JsonObject, where: str) -> None:
    """The tag's type, direction and owner are the viewer's: read for their shape only."""
    for field in ("tagType", "direction", "owner"):
        if field not in item:
            raise ProtocolError(f"{where}.{field} is missing.")
    _check_one_of(item["tagType"], _TAG_TYPES, f"{where}.tagType")
    _check_one_of(item["direction"], _DIRECTIONS, f"{where}.direction")
    if item["owner"] is not None:
        _decode_owner(item["owner"], f"{where}.owner")


def _decode_owner(raw: object, where: str) -> None:
    owner = as_object(raw, where)
    _one_of(owner.get("kind"), _OWNER_KINDS, f"{where}.kind")
    as_string(owner.get("id"), f"{where}.id")


def _decode_module_channels(raw: object, where: str) -> tuple[IoModule, tuple[IoRow, ...]]:
    item = as_object(raw, where)
    settings = {name: value for name, value in item.items() if name != "channels"}
    module = _decode_module(settings, where)
    channels = tuple(
        _decode_channel(channel, module.key, f"{where}.channels[{index}]")
        for index, channel in enumerate(as_list(item.get("channels"), f"{where}.channels"))
    )
    return module, channels


def _decode_path(raw: object, where: str) -> tuple[str | int, ...]:
    parts: list[str | int] = []
    for index, part in enumerate(as_list(raw, where)):
        if isinstance(part, str):
            parts.append(part)
        else:
            parts.append(as_integer(part, f"{where}[{index}]", minimum=0))
    return tuple(parts)


def _decode_problem(raw: object, where: str) -> IoProblem:
    item = as_object(raw, where)
    code = as_string(item.get("code"), f"{where}.code")
    if code not in IO_PROBLEM_CODES:
        raise ProtocolError(f'{where}.code "{code}" is not a known io problem code.')
    return IoProblem(
        path=_decode_path(item.get("path"), f"{where}.path"),
        code=code,
        message=as_string(item.get("message"), f"{where}.message", allow_empty=True),
    )


def _decode_unmapped_tag(raw: object, where: str) -> None:
    """Unmapped tags are a warning, not the bridge's job: read for their shape only."""
    item = as_object(raw, where)
    as_tag_name(item.get("name"), f"{where}.name")
    _one_of(item.get("type"), _TAG_TYPES, f"{where}.type")
    _one_of(item.get("direction"), _DIRECTIONS, f"{where}.direction")
    _decode_owner(item.get("owner"), f"{where}.owner")


def _decode_mapping_id(raw: object) -> str | None:
    return None if raw is None else as_string(raw, "mappingId")


def decode_io_mapping(document: object) -> IoMapping:
    """Decode an IoMappingResponse; any field of the wrong shape is a ProtocolError."""
    body: JsonObject = as_object(document, "The io answer")
    decoded = [
        _decode_module_channels(item, f"modules[{index}]")
        for index, item in enumerate(as_list(body.get("modules"), "modules"))
    ]
    problems = tuple(
        _decode_problem(item, f"problems[{index}]")
        for index, item in enumerate(as_list(body.get("problems"), "problems"))
    )
    for index, tag in enumerate(as_list(body.get("unmappedTags"), "unmappedTags")):
        _decode_unmapped_tag(tag, f"unmappedTags[{index}]")
    return IoMapping(
        status=as_enum(body.get("status"), IoStatus, "status"),
        mapping_id=_decode_mapping_id(body.get("mappingId")),
        modules=tuple(module for module, _channels in decoded),
        rows=tuple(row for _module, channels in decoded for row in channels),
        problems=problems,
    )


def zone_sizes(rows: tuple[IoRow, ...]) -> dict[IoZone, int]:
    """How many coils, inputs or registers each zone needs to hold the rows (at least 1)."""
    sizes = dict.fromkeys(IoZone, 1)
    for row in rows:
        sizes[row.zone] = max(sizes[row.zone], row.address + row.width)
    return sizes
