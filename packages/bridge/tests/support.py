"""Small helpers shared by the tests."""

from __future__ import annotations

import asyncio
import socket
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from pantin_bridge.io_mapping import IoModule, IoRow, IoType, IoZone, WordOrder


def free_port() -> int:
    """A port nobody listens on right now (a race is possible but harmless on loopback)."""
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


async def eventually(condition: Callable[[], bool], timeout: float = 3.0) -> None:
    """Wait for a condition that a background task will make true."""
    async with asyncio.timeout(timeout):
        while not condition():
            await asyncio.sleep(0.01)


def make_module(
    key: str = "m1",
    port: int = 1502,
    unit_id: int = 1,
    word_order: WordOrder = WordOrder.LOW_WORD_FIRST,
    watchdog_milliseconds: int = 1000,
) -> IoModule:
    return IoModule(key, port, unit_id, word_order, watchdog_milliseconds)


def make_row(tag: str, zone: IoZone, address: int, io_type: IoType, module: str = "m1") -> IoRow:
    return IoRow(tag=tag, module=module, zone=zone, address=address, io_type=io_type)


@dataclass
class RecordingListener:
    """A SlaveListener that remembers what the slave told it."""

    writes: list[tuple[IoZone, int, list[int] | list[bool]]] = field(default_factory=list)
    requests: int = 0
    opened: int = 0
    closed: int = 0

    def plc_wrote(self, zone: IoZone, address: int, values: Sequence[int] | Sequence[bool]) -> None:
        self.writes.append((zone, address, list(values)))

    def request_served(self) -> None:
        self.requests += 1

    def connection_opened(self) -> None:
        self.opened += 1

    def connection_closed(self) -> None:
        self.closed += 1
