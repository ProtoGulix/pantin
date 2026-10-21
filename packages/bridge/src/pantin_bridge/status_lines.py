"""The JSON lines the bridge writes on stdout under `--status-lines` (ADR 0050 point 2).

The core reads them to know when the slaves are bound and why the bridge stopped. The shape is
held by packages/protocol/fixtures/bridge-status-lines.json, shared with the core's Zod schema.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from enum import StrEnum
from typing import TextIO

from pantin_bridge.errors import (
    BusClosedError,
    ConfigurationError,
    CoreUnavailableError,
    MappingChangedError,
    MappingNotValidError,
    ProtocolError,
)
from pantin_bridge.io_mapping import IoModule
from pantin_bridge.io_modbus import MODBUS_TCP_SLAVE_KIND

MAX_LINE_BYTES = 4096


class ExitKind(StrEnum):
    CONFIGURATION = "configuration"
    CORE_UNAVAILABLE = "core_unavailable"
    MAPPING_NOT_VALID = "mapping_not_valid"
    MAPPING_CHANGED = "mapping_changed"
    BUS_CLOSED = "bus_closed"
    PROTOCOL = "protocol"
    UNEXPECTED = "unexpected"


_KIND_OF_ERROR: tuple[tuple[type[Exception], ExitKind], ...] = (
    (ConfigurationError, ExitKind.CONFIGURATION),
    (CoreUnavailableError, ExitKind.CORE_UNAVAILABLE),
    (MappingNotValidError, ExitKind.MAPPING_NOT_VALID),
    (MappingChangedError, ExitKind.MAPPING_CHANGED),
    (BusClosedError, ExitKind.BUS_CLOSED),
    (ProtocolError, ExitKind.PROTOCOL),
)


def exit_kind_of(error: Exception) -> ExitKind:
    for error_type, kind in _KIND_OF_ERROR:
        if isinstance(error, error_type):
            return kind
    return ExitKind.UNEXPECTED


def _encode(document: dict[str, object]) -> str:
    return json.dumps(document, ensure_ascii=False, separators=(",", ":"))


def encode_ready(listen: str, modules: Sequence[IoModule]) -> str:
    return _encode(
        {
            "event": "ready",
            "transport": MODBUS_TCP_SLAVE_KIND,
            "listen": listen,
            "modules": [{"key": module.key, "port": module.port} for module in modules],
        }
    )


def _exiting_line(kind: ExitKind, message: str) -> str:
    # This bridge has no server certificate and no per-module failure: both stay null (the
    # OPC UA bridge fills them, ADR 0065 point 7).
    return _encode(
        {
            "event": "exiting",
            "kind": kind.value,
            "message": message,
            "certificate": None,
            "module": None,
        }
    )


def encode_exiting(kind: ExitKind, message: str) -> str:
    """A line over the limit would be read as a log line, so the message is cut, not the line.

    The cut is measured on the encoded line: JSON escapes a control character as 6 bytes.
    """
    line = _exiting_line(kind, message)
    while (excess := len(line.encode("utf-8")) - MAX_LINE_BYTES) > 0:
        message = message[: max(0, len(message) - max(1, excess // 6))]
        line = _exiting_line(kind, message)
    return line


class StatusLines:
    """Writes status lines to `stream`, one flushed line each; writes nothing when it is None."""

    def __init__(self, stream: TextIO | None) -> None:
        self._stream = stream

    def _emit(self, line: str) -> None:
        if self._stream is None:
            return
        self._stream.write(line + "\n")
        self._stream.flush()

    def ready(self, listen: str, modules: Sequence[IoModule]) -> None:
        self._emit(encode_ready(listen, modules))

    def exiting(self, error: Exception) -> None:
        self._emit(encode_exiting(exit_kind_of(error), str(error)))
