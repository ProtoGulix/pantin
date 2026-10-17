"""Accept-time decisions of one module, and what the bridge hears about its connections."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from typing import Final, Protocol

from pantin_bridge.io_mapping import IoZone
from pantin_bridge.network_address import SourceFilter

_log = logging.getLogger(__name__)

# ADR 0046 point 4: a flood cannot exhaust the bridge's sockets.
MAX_CONNECTIONS_PER_MODULE: Final = 4


class SlaveListener(Protocol):
    """What the bridge learns from a slave. Called on the event loop, must not block."""

    def plc_wrote(self, zone: IoZone, address: int, values: Sequence[int] | Sequence[bool]) -> None:
        """A PLC request wrote coils or holding registers."""

    def request_served(self) -> None:
        """A request for this module's unit id arrived."""

    def connection_opened(self) -> None:
        """A connection passed the accept filter."""

    def connection_closed(self) -> None:
        """An accepted connection ended."""


class ConnectionGate:
    """Accept-time decision, shared by the connections of one module."""

    def __init__(
        self,
        module_key: str,
        source_filter: SourceFilter,
        listener: SlaveListener,
        idle_timeout_seconds: float,
    ) -> None:
        self.module_key = module_key
        self.idle_timeout_seconds = idle_timeout_seconds
        self._source_filter = source_filter
        self.listener = listener
        self._open_connections = 0
        # Set when the bridge shuts the slave down, so a close is not blamed on the PLC.
        self.stopping = False

    def admit(self, source: str) -> bool:
        if not self._source_filter.is_accepted(source):
            _log.warning(
                "Module %s refused a connection from %s (source filter).", self.module_key, source
            )
            return False
        if self._open_connections >= MAX_CONNECTIONS_PER_MODULE:
            _log.warning(
                "Module %s refused a connection from %s: already %d open.",
                self.module_key,
                source,
                self._open_connections,
            )
            return False
        self._open_connections += 1
        self.listener.connection_opened()
        return True

    def released(self) -> None:
        self._open_connections -= 1
        self.listener.connection_closed()
