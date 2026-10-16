"""The PLC-side watchdog of one module (ADR 0045 point 11): a pure state machine.

Time is a parameter, never read here, so tests need no sleeping.

    connected    -> first served request
    disconnected -> the last accepted TCP connection closed ("closed"),
                    or no request for `timeout_seconds` ("timeout")
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class DisconnectReason(StrEnum):
    CLOSED = "closed"
    TIMEOUT = "timeout"


@dataclass(frozen=True)
class StatusChange:
    """What the bridge reports to the core as `plc_status`."""

    connected: bool
    reason: DisconnectReason | None


_CONNECTED = StatusChange(connected=True, reason=None)


class ModuleWatchdog:
    def __init__(self, timeout_seconds: float) -> None:
        if timeout_seconds <= 0:
            raise ValueError("The watchdog time must be positive.")
        self._timeout_seconds = timeout_seconds
        self._connected = False
        self._open_connections = 0
        self._last_request_at = 0.0

    @property
    def connected(self) -> bool:
        return self._connected

    def connection_opened(self) -> None:
        self._open_connections += 1

    def connection_closed(self) -> StatusChange | None:
        # A connection refused at accept was never counted as opened: callers only report
        # accepted ones, so the count cannot go below zero.
        if self._open_connections == 0:
            raise ValueError("A connection closed that was never opened.")
        self._open_connections -= 1
        if self._open_connections > 0 or not self._connected:
            return None
        return self._disconnect(DisconnectReason.CLOSED)

    def request_served(self, now: float) -> StatusChange | None:
        self._last_request_at = now
        if self._connected:
            return None
        self._connected = True
        return _CONNECTED

    def check_timeout(self, now: float) -> StatusChange | None:
        if not self._connected or now - self._last_request_at < self._timeout_seconds:
            return None
        return self._disconnect(DisconnectReason.TIMEOUT)

    def _disconnect(self, reason: DisconnectReason) -> StatusChange:
        self._connected = False
        return StatusChange(connected=False, reason=reason)
