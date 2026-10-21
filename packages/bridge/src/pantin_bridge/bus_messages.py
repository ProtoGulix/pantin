"""Tag bus messages (ADR 0045 point 4): hand-written decoders and encoders.

The decoders accept exactly what packages/protocol/src/tag-bus.ts accepts, which the shared
fixtures (packages/protocol/fixtures/tag-bus-messages.json) check on both sides.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from enum import StrEnum
from typing import Final, Literal

from pantin_bridge.errors import ProtocolError, UnknownConsoleCodeError
from pantin_bridge.wire_decoding import (
    JsonObject,
    as_boolean,
    as_enum,
    as_integer,
    as_list,
    as_number,
    as_object,
    as_string,
    as_tag_name,
)

# Version 2 (ADR 0065 point 7): the plc hello names its transport and carries the id of that
# transport's projection of the mapping.
TAG_BUS_VERSION: Final = 2


class CloseCode:
    """Application close codes of the bus (RFC 6455 section 7.4.2)."""

    INVALID_MESSAGE: Final = 4000
    UNSUPPORTED_VERSION: Final = 4001
    PLC_ALREADY_CONNECTED: Final = 4002
    MAPPING_MISMATCH: Final = 4003
    HELLO_TIMEOUT: Final = 4004
    ROLE_NOT_ACCEPTED: Final = 4005


class ErrorCode(StrEnum):
    INVALID_REQUEST = "invalid_request"
    NOT_FOUND = "not_found"
    CONFLICT = "conflict"
    UNSUPPORTED_FILE = "unsupported_file"
    PAYLOAD_TOO_LARGE = "payload_too_large"
    CONVERSION_UNAVAILABLE = "conversion_unavailable"
    CONVERSION_FAILED = "conversion_failed"
    INTERNAL_ERROR = "internal_error"


# The level of each console code is fixed by the code (ADR 0031 point 3). A test checks this
# table against packages/protocol/fixtures/console-codes.json, which the protocol tests check
# against the schema.
_CONSOLE_LEVELS: Final = {
    "forced_tag_written": "error",
    "step_error": "error",
    "diagnostic_raised": "warning",
    "diagnostic_cleared": "info",
    "fault_set": "info",
    "fault_cleared": "info",
    "migrated": "info",
    "file_changed_outside": "warning",
    "clock_paused": "info",
    "clock_resumed": "info",
    "face_file_missing": "warning",
    "emitter_blocked": "warning",
    "product_limit": "warning",
    "physics_rebuilt": "info",
    "plc_connected": "info",
    "plc_disconnected": "warning",
    "bridge_connected": "info",
    "bridge_disconnected": "warning",
    "bridge_failed": "error",
    "bridge_log": "warning",
    "opcua_unsecured_lan": "warning",
    "clock_paused_with_bridge": "warning",
    "sensor_changed": "trace",
    "trace_dropped": "info",
}


@dataclass(frozen=True)
class BusTag:
    name: str
    value: float
    forced: bool


@dataclass(frozen=True)
class Welcome:
    console_id: str


@dataclass(frozen=True)
class Snapshot:
    step: int
    tags: tuple[BusTag, ...]


@dataclass(frozen=True)
class TagsChanged:
    step: int
    tags: tuple[BusTag, ...]


@dataclass(frozen=True)
class Ack:
    message_id: str
    tag: BusTag | None
    ignored_because_forced: bool


@dataclass(frozen=True)
class BusError:
    message_id: str | None
    code: ErrorCode
    message: str


@dataclass(frozen=True)
class ConsoleEntry:
    code: str
    level: str
    params: JsonObject


@dataclass(frozen=True)
class ClockChanged:
    running: bool


@dataclass(frozen=True)
class IoChanged:
    pass


type ServerMessage = (
    Welcome | Snapshot | TagsChanged | Ack | BusError | ConsoleEntry | ClockChanged | IoChanged
)


def _decode_bus_tag(raw: object, where: str) -> BusTag:
    item = as_object(raw, where)
    return BusTag(
        name=as_tag_name(item.get("name"), f"{where}.name"),
        value=as_number(item.get("value"), f"{where}.value"),
        forced=as_boolean(item.get("forced"), f"{where}.forced"),
    )


def _decode_bus_tags(raw: object, where: str) -> tuple[BusTag, ...]:
    return tuple(
        _decode_bus_tag(item, f"{where}[{index}]") for index, item in enumerate(as_list(raw, where))
    )


def _decode_clock(raw: object, where: str) -> ClockChanged:
    clock = as_object(raw, where)
    as_integer(clock.get("step"), f"{where}.step", minimum=0)
    as_integer(clock.get("droppedSteps"), f"{where}.droppedSteps", minimum=0)
    if as_number(clock.get("stepSeconds"), f"{where}.stepSeconds") <= 0:
        raise ProtocolError(f"{where}.stepSeconds must be positive.")
    ratio = clock.get("achievedRatio")
    if ratio is not None and as_number(ratio, f"{where}.achievedRatio") < 0:
        raise ProtocolError(f"{where}.achievedRatio must not be negative.")
    return ClockChanged(running=as_boolean(clock.get("running"), f"{where}.running"))


def _decode_console_entry(raw: object) -> ConsoleEntry:
    entry = as_object(raw, "entry")
    for field in ("sequence", "firstSequence", "count"):
        as_integer(entry.get(field), f"entry.{field}", minimum=1)
    as_string(entry.get("wallTime"), "entry.wallTime")
    if as_number(entry.get("simulationTime"), "entry.simulationTime") < 0:
        raise ProtocolError("entry.simulationTime must not be negative.")
    code = as_string(entry.get("code"), "entry.code")
    expected_level = _CONSOLE_LEVELS.get(code)
    if expected_level is None:
        raise UnknownConsoleCodeError(f'entry.code "{code}" is not a known console code.')
    level = as_string(entry.get("level"), "entry.level")
    if level != expected_level:
        raise ProtocolError(f'entry.level of "{code}" must be {expected_level}, got {level}.')
    as_string(as_object(entry.get("source"), "entry.source").get("kind"), "entry.source.kind")
    return ConsoleEntry(
        code=code, level=level, params=as_object(entry.get("params"), "entry.params")
    )


def _decode_ack(body: JsonObject) -> Ack:
    raw_tag = body.get("tag")
    ignored = body.get("ignored")
    if ignored is not None and ignored != "forced":
        raise ProtocolError('ignored must be null or "forced".')
    if "ignored" not in body:
        raise ProtocolError('ignored is required (null or "forced").')
    return Ack(
        message_id=as_string(body.get("id"), "id"),
        tag=None if raw_tag is None else _decode_bus_tag(raw_tag, "tag"),
        ignored_because_forced=ignored == "forced",
    )


def _decode_error(body: JsonObject) -> BusError:
    raw_id = body.get("id")
    return BusError(
        message_id=None if raw_id is None else as_string(raw_id, "id"),
        code=as_enum(body.get("code"), ErrorCode, "code"),
        message=as_string(body.get("message"), "message", allow_empty=True),
    )


def _decode_welcome(body: JsonObject) -> Welcome:
    if as_integer(body.get("version"), "version") != TAG_BUS_VERSION:
        raise ProtocolError(
            f"The core speaks another tag bus version: this bridge speaks {TAG_BUS_VERSION}."
        )
    _decode_clock(body.get("clock"), "clock")
    return Welcome(console_id=as_string(body.get("consoleId"), "consoleId"))


def _decode_snapshot(body: JsonObject) -> ServerMessage:
    return Snapshot(
        as_integer(body.get("step"), "step", minimum=0), _decode_bus_tags(body.get("tags"), "tags")
    )


def _decode_tags_changed(body: JsonObject) -> ServerMessage:
    return TagsChanged(
        as_integer(body.get("step"), "step", minimum=0), _decode_bus_tags(body.get("tags"), "tags")
    )


_DECODERS: Final[dict[str, Callable[[JsonObject], ServerMessage]]] = {
    "welcome": _decode_welcome,
    "snapshot": _decode_snapshot,
    "tags": _decode_tags_changed,
    "ack": _decode_ack,
    "error": _decode_error,
    "console": lambda body: _decode_console_entry(body.get("entry")),
    "clock": lambda body: _decode_clock(body.get("clock"), "clock"),
    "io_changed": lambda _body: IoChanged(),
}


def decode_server_message(text: str) -> ServerMessage:
    """Decode one text frame of the core; anything else is a ProtocolError."""
    try:
        document: object = json.loads(text)
    except json.JSONDecodeError as error:
        raise ProtocolError(f"The core sent a frame that is not JSON: {error}.") from error
    body = as_object(document, "A bus message")
    kind = as_string(body.get("type"), "type")
    decoder = _DECODERS.get(kind)
    if decoder is None:
        raise ProtocolError(f'Unknown bus message type "{kind}".')
    return decoder(body)


# The transports a bridge announces in its hello; this bridge serves one (ADR 0065 point 7).
TransportKind = Literal["modbus_tcp_slave"]

# --- bridge to core -----------------------------------------------------------


def _frame(message: JsonObject) -> str:
    # allow_nan=False: a NaN or infinity must fail here, not reach the core as invalid JSON.
    return json.dumps(message, allow_nan=False, separators=(",", ":"))


def encode_hello(transport: TransportKind, mapping_id: str) -> str:
    return _frame(
        {
            "type": "hello",
            "version": TAG_BUS_VERSION,
            "role": "plc",
            "transport": transport,
            "mappingId": mapping_id,
        }
    )


def encode_subscribe(tags: list[str]) -> str:
    return _frame({"type": "subscribe", "tags": tags})


def encode_write(message_id: str, tag: str, value: float) -> str:
    return _frame({"type": "write", "id": message_id, "tag": tag, "value": value})


def encode_plc_status(module: str, *, connected: bool, reason: str | None) -> str:
    return _frame(
        {"type": "plc_status", "module": module, "connected": connected, "reason": reason}
    )
