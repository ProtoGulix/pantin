"""One Modbus TCP slave per module (ADR 0048 point 2): asyncio server, accept filter, limits.

Framing is in modbus_frames.py and request handling in modbus_pdu.py; this file only moves
bytes between a socket and them, and tells the bridge what happened.
"""

from __future__ import annotations

import asyncio
import logging
import socket
from collections.abc import Mapping
from typing import Final

from pantin_bridge.errors import ConfigurationError
from pantin_bridge.io_mapping import IoModule, IoZone
from pantin_bridge.modbus_frames import Frame, FrameDecoder, FrameError, encode_frame
from pantin_bridge.modbus_gate import ConnectionGate, SlaveListener
from pantin_bridge.modbus_journal import ConnectionJournal
from pantin_bridge.modbus_pdu import ModbusStore, handle_pdu
from pantin_bridge.network_address import SourceFilter

_log = logging.getLogger(__name__)

# A PLC that sends requests and never reads the answers must not grow our buffer without end.
# Reading pauses above this many unsent bytes, but only after the batch in hand: the real bound
# is this plus _FRAMES_PER_BATCH answers (260 bytes each).
_WRITE_BUFFER_HIGH_BYTES: Final = 64 * 1024
_FRAMES_PER_BATCH: Final = 16
# Unanswered input we keep before we stop reading; a complete frame is at most 260 bytes.
_INPUT_BUFFER_LIMIT_BYTES: Final = 4 * 1024
# A half-open connection (a PLC VM hard-reset, a dropped NAT entry) never sends FIN, so without
# a timeout it would keep one of the 4 slots for ever and a real PLC would end up refused.
# A live master polls well inside the module's watchdog, so three times it means "gone".
_IDLE_WATCHDOG_FACTOR: Final = 3
_IDLE_TIMEOUT_FLOOR_SECONDS: Final = 5.0


class _Connection(asyncio.Protocol):
    def __init__(self, gate: ConnectionGate, store: ModbusStore) -> None:
        self._gate = gate
        self._store = store
        self._decoder = FrameDecoder()
        self._transport: asyncio.Transport | None = None
        self._admitted = False
        self._writing_paused = False
        self._reading_paused = False
        self._drain_scheduled = False
        self._eof = False
        self._idle_timer: asyncio.TimerHandle | None = None
        self._journal: ConnectionJournal | None = None
        self._close_reason = "closed by the PLC"

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        """Refuse before the first read: asyncio adds the reader only after this returns.

        An aborted socket leaves the client's first request unread in the kernel, so a refused
        source never gets a byte of ours parsed (spike 0003 B, spike 0009).
        """
        if not isinstance(transport, asyncio.Transport):
            raise TypeError(f"Expected a stream transport, got {type(transport).__name__}.")
        peer = transport.get_extra_info("peername")
        source = str(peer[0]) if isinstance(peer, tuple) and peer else ""
        if not self._gate.admit(source):
            transport.abort()
            return
        self._admitted = True
        self._transport = transport
        self._journal = ConnectionJournal(self._gate.module_key, source)
        self._journal.opened()
        sock = transport.get_extra_info("socket")
        if sock is not None:
            # The idle timer covers a silent master; keepalive makes the kernel notice a dead path.
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        transport.set_write_buffer_limits(high=_WRITE_BUFFER_HIGH_BYTES)
        self._restart_idle_timer()

    def _restart_idle_timer(self) -> None:
        if self._idle_timer is not None:
            self._idle_timer.cancel()
        self._idle_timer = asyncio.get_running_loop().call_later(
            self._gate.idle_timeout_seconds, self._close_idle
        )

    def _close_idle(self) -> None:
        self._idle_timer = None
        self._close_reason = f"no request for {self._gate.idle_timeout_seconds:.1f} s"
        _log.warning(
            "Module %s closed a connection: no request for %.1f s.",
            self._gate.module_key,
            self._gate.idle_timeout_seconds,
        )
        if self._transport is not None:
            # abort, not close: a dead peer would never acknowledge a graceful close.
            self._transport.abort()

    def data_received(self, data: bytes) -> None:
        if self._transport is None:
            return
        self._decoder.extend(data)
        self._update_reading()
        self._schedule_drain()

    def eof_received(self) -> bool:
        """Keep the connection open for the answers owed: a master may half-close after a burst."""
        self._eof = True
        self._close_reason = "the PLC finished sending"
        self._schedule_drain()
        return True

    def _update_reading(self) -> None:
        """Stop reading while the peer is not reading our answers or we are behind on its requests.

        Without this a peer that does read its answers would keep the write buffer empty and
        grow the input buffer as fast as it can send.
        """
        transport = self._transport
        if self._eof or transport is None or transport.is_closing():
            return
        wanted = self._writing_paused or self._decoder.buffered_bytes > _INPUT_BUFFER_LIMIT_BYTES
        if wanted == self._reading_paused:
            return
        self._reading_paused = wanted
        if wanted:
            transport.pause_reading()
        else:
            transport.resume_reading()

    def _schedule_drain(self) -> None:
        if self._drain_scheduled or self._transport is None:
            return
        self._drain_scheduled = True
        asyncio.get_running_loop().call_soon(self._drain)

    def _drain(self) -> None:
        """Answer at most one batch of buffered frames, then let the loop flush and breathe."""
        self._drain_scheduled = False
        transport = self._transport
        if transport is None or transport.is_closing() or self._writing_paused:
            return
        try:
            more = self._answer_batch(transport)
        except FrameError as error:
            self._close_reason = f"bad frame: {error}"
            _log.warning("Module %s closed a connection: %s.", self._gate.module_key, error)
            transport.close()
            return
        except Exception:  # noqa: BLE001 - logged with its traceback, and the connection is dropped
            self._close_reason = "request handling failed"
            # Run from call_soon, so nobody above would close this connection for us.
            _log.exception(
                "Module %s dropped a connection: request handling failed.", self._gate.module_key
            )
            transport.abort()
            return
        if more:
            self._schedule_drain()
        elif self._eof:
            transport.close()  # every request is answered; closing flushes the answers
        else:
            self._update_reading()

    def _answer_batch(self, transport: asyncio.Transport) -> bool:
        """Answer up to one batch; True when the batch was full and more may be waiting."""
        for answered, frame in enumerate(self._decoder.frames(), start=1):
            self._answer(transport, frame)
            if answered >= _FRAMES_PER_BATCH:
                return True
        return False

    def _answer(self, transport: asyncio.Transport, frame: Frame) -> None:
        self._restart_idle_timer()
        result = handle_pdu(frame.unit_id, frame.pdu, self._store)
        if self._journal is not None:
            self._journal.request_handled(result)
        transport.write(encode_frame(frame.transaction_id, frame.unit_id, result.response))
        listener = self._gate.listener
        if result.served:
            listener.request_served()
        for write in result.writes:
            listener.plc_wrote(write.zone, write.address, write.values)

    def pause_writing(self) -> None:
        self._writing_paused = True
        self._update_reading()

    def resume_writing(self) -> None:
        self._writing_paused = False
        self._update_reading()
        self._schedule_drain()

    def connection_lost(self, exc: Exception | None) -> None:
        if exc is not None:
            self._close_reason = f"connection lost: {exc}"
        elif self._gate.stopping:
            self._close_reason = "the bridge is stopping"
        if self._idle_timer is not None:
            self._idle_timer.cancel()
            self._idle_timer = None
        # A refused connection is aborted too, and was never counted.
        if self._admitted:
            self._admitted = False
            if self._journal is not None:
                self._journal.closed(self._close_reason)
            self._gate.released()


class ModbusSlave:
    def __init__(  # noqa: PLR0913, PLR0917 - the idle timeout is a test-only override
        self,
        module: IoModule,
        sizes: Mapping[IoZone, int],
        listen_host: str,
        source_filter: SourceFilter,
        listener: SlaveListener,
        idle_timeout_seconds: float | None = None,
    ) -> None:
        """`idle_timeout_seconds` overrides the watchdog-derived timeout, for tests."""
        self._module = module
        self._listen_host = listen_host
        if idle_timeout_seconds is None:
            idle_timeout_seconds = max(
                _IDLE_TIMEOUT_FLOOR_SECONDS,
                _IDLE_WATCHDOG_FACTOR * module.watchdog_milliseconds / 1000,
            )
        self._gate = ConnectionGate(module.key, source_filter, listener, idle_timeout_seconds)
        self._store = ModbusStore(module.unit_id, sizes)
        self._server: asyncio.Server | None = None

    @property
    def idle_timeout_seconds(self) -> float:
        return self._gate.idle_timeout_seconds

    async def start(self) -> None:
        loop = asyncio.get_running_loop()
        try:
            # Always an explicit host: an empty one would bind every interface (ADR 0046 point 1).
            self._server = await loop.create_server(
                lambda: _Connection(self._gate, self._store), self._listen_host, self._module.port
            )
        except OSError as error:
            raise ConfigurationError(
                f"Module {self._module.key} cannot listen on "
                f"{self._listen_host}:{self._module.port}: the port is taken, or this user may "
                "not bind it. Change the module's port in io.json."
            ) from error

    async def stop(self) -> None:
        if self._server is not None:
            self._gate.stopping = True
            self._server.close()
            self._server.close_clients()
            await self._server.wait_closed()
            self._server = None

    async def write(self, zone: IoZone, address: int, values: list[int] | list[bool]) -> None:
        """Set datastore values without telling the listener (feedback, or a reset to 0)."""
        self._store.write(zone, address, values)

    @property
    def bound_host(self) -> str | None:
        """The address the socket is really bound to, for the explicit-address test."""
        if self._server is None or not self._server.sockets:
            return None
        return str(self._server.sockets[0].getsockname()[0])
