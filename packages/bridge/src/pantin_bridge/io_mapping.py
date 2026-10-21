"""The I/O mapping the core serves at GET /api/pantins/:pantinId/io (ADR 0049 point 5, ADR 0064).

This bridge serves the modules of the `modbus_tcp_slave` transport. A module of another kind is
not an error: it belongs to another bridge, so it is skipped and reported (ADR 0064 point 8).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from pantin_bridge.errors import ProtocolError
from pantin_bridge.io_modbus import (
    MODBUS_TCP_SLAVE_KIND,
    IoModule,
    IoRow,
    IoType,
    IoZone,
    WordOrder,
    decode_modbus_channel,
    decode_modbus_transport,
)
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

# The codes of IO_PROBLEM_CODES (packages/protocol/src/io-mapping.ts): the common ones, then
# those of the transports (packages/transport-types).
IO_PROBLEM_CODES = frozenset(
    {
        "file_too_large",
        "invalid_encoding",
        "invalid_json",
        "unreadable_file",
        "schema_invalid",
        "newer_schema_version",
        "unknown_tag",
        "command_mapped_twice",
        "unsupported_signal",
        "listen_port_used_twice",
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


class IoStatus(StrEnum):
    VALID = "valid"
    INVALID = "invalid"
    MISSING = "missing"


@dataclass(frozen=True)
class SkippedModule:
    """A module of a transport this bridge does not serve."""

    key: str
    kind: str


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
    # The Modbus TCP slave modules only: the ones this bridge serves.
    modules: tuple[IoModule, ...]
    rows: tuple[IoRow, ...]
    problems: tuple[IoProblem, ...]
    skipped_modules: tuple[SkippedModule, ...] = ()

    def rows_of(self, module_key: str) -> tuple[IoRow, ...]:
        return tuple(row for row in self.rows if row.module == module_key)


_MODULE_FIELDS = frozenset({"key", "transport", "channels"})


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


def _decode_module_channels(
    raw: object, where: str
) -> tuple[IoModule, tuple[IoRow, ...]] | SkippedModule:
    item = as_object(raw, where)
    reject_unknown_fields(item, _MODULE_FIELDS, where)
    key = as_key(item.get("key"), f"{where}.key")
    transport = as_object(item.get("transport"), f"{where}.transport")
    kind = as_string(transport.get("kind"), f"{where}.transport.kind")
    channels = as_list(item.get("channels"), f"{where}.channels")
    if kind != MODBUS_TCP_SLAVE_KIND:
        # The channels of another transport carry fields this bridge does not know.
        return SkippedModule(key=key, kind=kind)
    module = decode_modbus_transport(key, transport, f"{where}.transport")
    rows = tuple(
        _decode_channel(channel, key, f"{where}.channels[{index}]")
        for index, channel in enumerate(channels)
    )
    return module, rows


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
    served = [item for item in decoded if not isinstance(item, SkippedModule)]
    skipped = tuple(item for item in decoded if isinstance(item, SkippedModule))
    problems = tuple(
        _decode_problem(item, f"problems[{index}]")
        for index, item in enumerate(as_list(body.get("problems"), "problems"))
    )
    for index, tag in enumerate(as_list(body.get("unmappedTags"), "unmappedTags")):
        _decode_unmapped_tag(tag, f"unmappedTags[{index}]")
    return IoMapping(
        status=as_enum(body.get("status"), IoStatus, "status"),
        mapping_id=_decode_mapping_id(body.get("mappingId")),
        modules=tuple(module for module, _channels in served),
        rows=tuple(row for _module, channels in served for row in channels),
        problems=problems,
        skipped_modules=skipped,
    )


def zone_sizes(rows: tuple[IoRow, ...]) -> dict[IoZone, int]:
    """How many coils, inputs or registers each zone needs to hold the rows.

    A zone without rows has size 0, so any access to it is refused with ILLEGAL_ADDRESS and
    shows in the journal (ADR 0048 point 3), instead of being answered with a meaningless 0.
    """
    sizes = dict.fromkeys(IoZone, 0)
    for row in rows:
        sizes[row.zone] = max(sizes[row.zone], row.address + row.width)
    return sizes


def _decode_channel(raw: object, module_key: str, where: str) -> IoRow:
    item = as_object(raw, where)
    tag = as_tag_name(item.get("tag"), f"{where}.tag")
    row = decode_modbus_channel(item, tag, module_key, where)
    _check_annotations(item, where)
    # Empty is accepted by the schema and reported by the core as invalid_variable.
    as_string(item.get("variable"), f"{where}.variable", allow_empty=True)
    as_string(item.get("comment"), f"{where}.comment", allow_empty=True)
    return row


# Names other modules import from here; the Modbus ones are defined in io_modbus.py.
__all__ = [
    "IoMapping",
    "IoModule",
    "IoProblem",
    "IoRow",
    "IoStatus",
    "IoType",
    "IoZone",
    "SkippedModule",
    "WordOrder",
    "decode_io_mapping",
    "zone_sizes",
]
