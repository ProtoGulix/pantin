"""The bridge process: the core's tag bus wired to one Modbus slave per module (ADR 0045 p. 10)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable, Coroutine, Sequence
from dataclasses import dataclass

from pantin_bridge.bus_client import BusClient
from pantin_bridge.bus_messages import (
    Ack,
    BusError,
    ConsoleEntry,
    IoChanged,
    ServerMessage,
    Snapshot,
    TagsChanged,
)
from pantin_bridge.core_endpoint import CoreEndpoint, fetch_io_mapping
from pantin_bridge.errors import BridgeError, MappingChangedError, MappingNotValidError
from pantin_bridge.io_mapping import IoMapping, IoModule, IoProblem, IoRow, IoStatus, zone_sizes
from pantin_bridge.modbus_gate import SlaveListener
from pantin_bridge.modbus_server import ModbusSlave
from pantin_bridge.module_bridge import ModuleBridge, ModuleServices, Slave
from pantin_bridge.network_address import IpNetwork, SourceFilter

_log = logging.getLogger(__name__)

_CONSOLE_LOG_LEVELS = {"error": logging.ERROR, "warning": logging.WARNING, "info": logging.INFO}


@dataclass(frozen=True)
class BridgeConfig:
    endpoint: CoreEndpoint
    listen_host: str
    allow: tuple[IpNetwork, ...]


class BackgroundWork:
    """Runs coroutines the Modbus callbacks cannot await, and fails the bridge if one fails."""

    def __init__(self) -> None:
        self._tasks: set[asyncio.Task[None]] = set()
        self.failed: asyncio.Future[None] = asyncio.get_running_loop().create_future()

    def spawn(self, work: Coroutine[None, None, None]) -> None:
        task = asyncio.get_running_loop().create_task(work)
        self._tasks.add(task)
        task.add_done_callback(self._finished)

    def _finished(self, task: asyncio.Task[None]) -> None:
        self._tasks.discard(task)
        if task.cancelled() or self.failed.done():
            return
        error = task.exception()
        if error is not None:
            self.failed.set_exception(error)


def _describe_path(path: tuple[str | int, ...]) -> str:
    """A JSON path as modules[0].channels[3].address; io.json for the whole file."""
    text = ""
    for part in path:
        text += f"[{part}]" if isinstance(part, int) else f".{part}" if text else part
    return text or "io.json"


def _describe_problem(problem: IoProblem) -> str:
    where = _describe_path(problem.path)
    return f"{where}: {problem.message}"


def require_valid_mapping(mapping: IoMapping) -> str:
    """The mapping id of a valid mapping; anything else says what to fix."""
    if mapping.status is IoStatus.VALID and mapping.mapping_id is not None:
        return mapping.mapping_id
    reasons = "; ".join(_describe_problem(problem) for problem in mapping.problems)
    raise MappingNotValidError(
        f"The io mapping is {mapping.status.value}"
        + (
            f": {reasons}"
            if reasons
            else " (map the tags in the viewer's I/O view, or run `pantin io init`)."
        )
    )


def _log_console(entry: ConsoleEntry) -> None:
    _log.log(_CONSOLE_LOG_LEVELS[entry.level], "core: %s %s", entry.code, entry.params)


class Bridge:
    def __init__(self, bus: BusClient, modules: Sequence[ModuleBridge]) -> None:
        self._bus = bus
        self._modules = modules

    async def handle(self, message: ServerMessage) -> None:
        match message:
            case Snapshot():
                for module in self._modules:
                    await module.apply_snapshot(message.tags)
            case TagsChanged():
                for module in self._modules:
                    await module.apply_feedback(message.tags)
            case IoChanged():
                raise MappingChangedError(
                    "The Pantin's tags changed, so the io mapping may no longer match: "
                    "restart the bridge."
                )
            case Ack() if message.ignored_because_forced:
                _log.info("Write %s ignored: its tag is forced in the core.", message.message_id)
            case BusError():
                _log.warning("Core error %s: %s", message.code.value, message.message)
            case ConsoleEntry():
                _log_console(message)
            case _:
                # welcome (handled at start), clock and plain acks need nothing.
                return

    async def serve(self, background: BackgroundWork) -> None:
        """Run until something fails; every way out is an error (no reconnection, point 10)."""

        async def receive() -> None:
            async for message in self._bus.messages():
                await self.handle(message)

        tasks = [
            asyncio.create_task(receive()),
            asyncio.create_task(self._bus.send_pending()),
            asyncio.ensure_future(self._bus.failed),
            asyncio.ensure_future(background.failed),
            *(asyncio.create_task(module.watch()) for module in self._modules),
        ]
        try:
            await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        for task in tasks:
            if not task.cancelled() and (error := task.exception()) is not None:
                raise error
        raise BridgeError("The bridge stopped without an error: restart it.")


def _slave_factory(
    module: IoModule, rows: tuple[IoRow, ...], config: BridgeConfig
) -> Callable[[SlaveListener], Slave]:
    def make(listener: SlaveListener) -> Slave:
        return ModbusSlave(
            module, zone_sizes(rows), config.listen_host, SourceFilter(config.allow), listener
        )

    return make


def _ignore_ready(modules: Sequence[IoModule]) -> None:
    """Default for callers that need no ready notification."""


async def run_bridge(
    config: BridgeConfig, on_ready: Callable[[Sequence[IoModule]], None] = _ignore_ready
) -> None:
    """Start-up order of ADR 0045 point 10; returns never, raises a BridgeError to stop.

    `on_ready` is called once every slave is bound (ADR 0050 point 2).
    """
    # urllib blocks; this runs once, before anything else needs the loop.
    mapping = await asyncio.to_thread(fetch_io_mapping, config.endpoint)
    mapping_id = require_valid_mapping(mapping)
    bus, _welcome = await BusClient.open(config.endpoint.bus_url, mapping_id)
    background = BackgroundWork()
    services = ModuleServices(bus=bus, background=background)
    modules = [
        ModuleBridge(
            module,
            mapping.rows_of(module.key),
            services,
            _slave_factory(module, mapping.rows_of(module.key), config),
        )
        for module in mapping.modules
    ]
    try:
        await bus.subscribe([tag for module in modules for tag in module.tags])
        for module in modules:
            await module.start()
        _log.info("Bridge ready: %d module(s) on %s.", len(modules), config.listen_host)
        on_ready(mapping.modules)
        await Bridge(bus, modules).serve(background)
    finally:
        for module in modules:
            await module.stop()
        await bus.close()
