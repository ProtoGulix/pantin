"""The bridge's side of the tag bus (ADR 0045 point 4): connect, hello, send, receive."""

from __future__ import annotations

import asyncio
import itertools
import logging
from collections.abc import AsyncIterator, Sequence
from typing import Final

from websockets.asyncio.client import ClientConnection, connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake, InvalidURI

from pantin_bridge import bus_messages
from pantin_bridge.bus_messages import CloseCode, ServerMessage, Welcome
from pantin_bridge.errors import CoreUnavailableError, ProtocolError, RestartRequiredError

_log = logging.getLogger(__name__)

_OPEN_TIMEOUT_SECONDS: Final = 10.0
_WELCOME_TIMEOUT_SECONDS: Final = 10.0
# Writes wait here for the sender task. A PLC cannot make the queue grow without bound: a full
# queue means the core stopped reading, which is fatal (see enqueue).
_OUTBOX_LIMIT: Final = 4096

_CLOSE_MEANINGS: Final = {
    CloseCode.INVALID_MESSAGE: "the core refused a message of the bridge (a bug: report it)",
    CloseCode.UNSUPPORTED_VERSION: "the core does not speak this tag bus version",
    CloseCode.PLC_ALREADY_CONNECTED: "another bridge is already connected to this Pantin",
    CloseCode.MAPPING_MISMATCH: "the io mapping changed since the bridge read it, or is not valid",
    CloseCode.HELLO_TIMEOUT: "the core got no hello in time",
    CloseCode.ROLE_NOT_ACCEPTED: "the core accepts the plc role from its own host only",
}


def _closed_error(error: ConnectionClosed) -> RestartRequiredError:
    close = error.rcvd
    if close is None:
        return RestartRequiredError("The tag bus connection was lost. Restart the bridge.")
    meaning = _CLOSE_MEANINGS.get(close.code, "the core closed the bus")
    return RestartRequiredError(
        f"The tag bus was closed ({close.code}: {meaning}; {close.reason or 'no reason'}). "
        "Restart the bridge."
    )


class BusClient:
    def __init__(self, connection: ClientConnection) -> None:
        self._connection = connection
        self._outbox: asyncio.Queue[str] = asyncio.Queue(maxsize=_OUTBOX_LIMIT)
        self._ids = itertools.count(1)
        # Set, never raised, when a write cannot be queued: the caller is a Modbus callback,
        # where an exception would close the PLC's connection.
        self.failed: asyncio.Future[None] = asyncio.get_running_loop().create_future()

    @classmethod
    async def open(cls, url: str, mapping_id: str) -> tuple[BusClient, Welcome]:
        """Connect as the plc and wait for the welcome."""
        try:
            # No Origin header is sent by default, which is how the core knows a non-browser
            # client (ADR 0046 point 5). Compression off: frames are tiny and latency matters.
            connection = await connect(
                url,
                open_timeout=_OPEN_TIMEOUT_SECONDS,
                compression=None,
                user_agent_header=None,
                proxy=None,  # websockets would follow HTTP_PROXY otherwise (ADR 0046 point 8)
            )
        except (OSError, TimeoutError, InvalidHandshake, InvalidURI) as error:
            raise CoreUnavailableError(f"Cannot open the tag bus at {url}: {error}") from error
        client = cls(connection)
        try:
            await connection.send(bus_messages.encode_hello(mapping_id))
            welcome = await client._read_welcome()
        except BaseException:
            await connection.close()
            raise
        return client, welcome

    async def _read_welcome(self) -> Welcome:
        try:
            async with asyncio.timeout(_WELCOME_TIMEOUT_SECONDS):
                raw = await self._connection.recv()
        except ConnectionClosed as error:
            raise _closed_error(error) from error
        except TimeoutError as error:
            raise CoreUnavailableError("The core did not answer the hello.") from error
        message = bus_messages.decode_server_message(self._as_text(raw))
        if not isinstance(message, Welcome):
            raise ProtocolError("The core answered the hello with something other than a welcome.")
        return message

    @staticmethod
    def _as_text(raw: str | bytes) -> str:
        if isinstance(raw, bytes):
            raise ProtocolError("The core sent a binary frame: the tag bus is text only.")
        return raw

    async def subscribe(self, tags: Sequence[str]) -> None:
        await self._connection.send(bus_messages.encode_subscribe(list(tags)))

    def _enqueue(self, frame: str) -> None:
        try:
            self._outbox.put_nowait(frame)
        except asyncio.QueueFull:
            if not self.failed.done():
                self.failed.set_exception(
                    RestartRequiredError(
                        "The core stopped reading the tag bus: too many writes are waiting. "
                        "Restart the bridge."
                    )
                )

    def write(self, tag: str, value: float) -> None:
        self._enqueue(bus_messages.encode_write(f"b{next(self._ids)}", tag, value))

    def plc_status(self, module: str, *, connected: bool, reason: str | None) -> None:
        self._enqueue(bus_messages.encode_plc_status(module, connected=connected, reason=reason))

    async def send_pending(self) -> None:
        """Sender loop: runs until cancelled or the connection ends."""
        try:
            while True:
                await self._connection.send(await self._outbox.get())
        except ConnectionClosed as error:
            raise _closed_error(error) from error

    async def messages(self) -> AsyncIterator[ServerMessage]:
        """Decoded messages until the core closes the bus, which is always an error here."""
        try:
            async for raw in self._connection:
                yield bus_messages.decode_server_message(self._as_text(raw))
        except ConnectionClosed as error:
            raise _closed_error(error) from error
        raise RestartRequiredError("The tag bus was closed by the core. Restart the bridge.")

    async def close(self) -> None:
        await self._connection.close()
