"""A stand-in for the core: serves GET .../io and the tag bus on one port.

Just enough of ADR 0045 point 4 for the bridge: welcome after a plc hello, a snapshot after a
subscribe, `tags` pushed by the test, and every received message kept for assertions.
"""

from __future__ import annotations

import asyncio
import json
from http import HTTPStatus
from types import TracebackType

from websockets.asyncio.server import Server, ServerConnection, serve
from websockets.datastructures import Headers
from websockets.http11 import Request, Response

CLOCK = {
    "running": True,
    "step": 0,
    "stepSeconds": 1 / 120,
    "achievedRatio": 1,
    "droppedSteps": 0,
}


class FakeCore:
    def __init__(
        self, io_answer: dict[str, object], *, hello_close_code: int | None = None
    ) -> None:
        self.io_answer = io_answer
        self.hello_close_code = hello_close_code
        self.received: list[dict[str, object]] = []
        self.handshake_headers: Headers | None = None
        self.tags: dict[str, tuple[float, bool]] = {}
        self._connection: ServerConnection | None = None
        self._server: Server | None = None
        self.port = 0
        self.bus_closed = asyncio.Event()

    async def __aenter__(self) -> FakeCore:
        self._server = await serve(
            self._handle, "127.0.0.1", 0, process_request=self._process_request, compression=None
        )
        self.port = int(self._server.sockets[0].getsockname()[1])
        return self

    async def __aexit__(
        self,
        error_type: type[BaseException] | None,
        error: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        assert self._server is not None
        self._server.close()
        await self._server.wait_closed()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def _process_request(self, connection: ServerConnection, request: Request) -> Response | None:
        if request.path.endswith("/io"):
            return connection.respond(HTTPStatus.OK, json.dumps(self.io_answer))
        return None

    async def _handle(self, connection: ServerConnection) -> None:
        self.handshake_headers = connection.request.headers if connection.request else None
        hello = json.loads(await connection.recv())
        self.received.append(hello)
        if self.hello_close_code is not None:
            await connection.close(self.hello_close_code, "refused by the fake core")
            return
        self._connection = connection
        await connection.send(
            json.dumps({"type": "welcome", "version": 1, "consoleId": "c-1", "clock": CLOCK})
        )
        try:
            async for raw in connection:
                message = json.loads(raw)
                self.received.append(message)
                if message["type"] == "subscribe":
                    await self.send(self._tags_message("snapshot", list(self.tags)))
        finally:
            self.bus_closed.set()

    def _tags_message(self, kind: str, names: list[str]) -> dict[str, object]:
        items = [
            {"name": name, "value": self.tags[name][0], "forced": self.tags[name][1]}
            for name in names
        ]
        return {"type": kind, "step": 1, "tags": items}

    async def send(self, message: dict[str, object]) -> None:
        assert self._connection is not None
        await self._connection.send(json.dumps(message))

    async def set_tags(self, **values: float) -> None:
        """Change tag values and push them as a `tags` message. Names use `__` for dots."""
        names = []
        for key, value in values.items():
            name = key.replace("__", ".")
            self.tags[name] = (value, self.tags.get(name, (0, False))[1])
            names.append(name)
        await self.send(self._tags_message("tags", names))

    async def push_snapshot(self) -> None:
        """Send the current tags as a `snapshot`, as the core does after a reset."""
        await self.send(self._tags_message("snapshot", list(self.tags)))

    async def close_bus(self, code: int = 1000) -> None:
        assert self._connection is not None
        await self._connection.close(code, "closed by the test")

    def messages_of(self, kind: str) -> list[dict[str, object]]:
        return [message for message in self.received if message["type"] == kind]

    async def wait_for(self, kind: str, count: int = 1, timeout: float = 3.0) -> None:
        async with asyncio.timeout(timeout):
            while len(self.messages_of(kind)) < count:
                await asyncio.sleep(0.01)
