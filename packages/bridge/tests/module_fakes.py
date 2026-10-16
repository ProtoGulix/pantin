"""Fakes for ModuleBridge: a bus that records, a slave that records, tasks the test runs."""

from __future__ import annotations

from collections.abc import Coroutine
from dataclasses import dataclass, field

from pantin_bridge.io_mapping import IoModule, IoType, IoZone
from pantin_bridge.module_bridge import ModuleBridge, ModuleServices
from support import make_module, make_row

COIL_TAG = "press.valve.extend"
SETPOINT_TAG = "axis.stroke.setpoint"
COUNT_TAG = "axis.encoder.count"
SWITCH_TAG = "press.ext.state"
POSITION_TAG = "axis.stroke.position"

ROWS = (
    make_row(COIL_TAG, IoZone.COIL, 0, IoType.BOOL),
    make_row("press.valve.retract", IoZone.COIL, 1, IoType.BOOL),
    make_row("press.clamp.close", IoZone.COIL, 5, IoType.BOOL),
    make_row(SETPOINT_TAG, IoZone.HOLDING_REGISTER, 2, IoType.REAL),
    make_row("axis.speed.target", IoZone.HOLDING_REGISTER, 4, IoType.DINT),
    make_row(SWITCH_TAG, IoZone.DISCRETE_INPUT, 3, IoType.BOOL),
    make_row(POSITION_TAG, IoZone.INPUT_REGISTER, 0, IoType.REAL),
    make_row(COUNT_TAG, IoZone.INPUT_REGISTER, 2, IoType.DINT),
)


@dataclass
class FakeBus:
    writes: list[tuple[str, float]] = field(default_factory=list)
    statuses: list[tuple[str, bool, str | None]] = field(default_factory=list)

    def write(self, tag: str, value: float) -> None:
        self.writes.append((tag, value))

    def plc_status(self, module: str, *, connected: bool, reason: str | None) -> None:
        self.statuses.append((module, connected, reason))


@dataclass
class FakeSlave:
    writes: list[tuple[IoZone, int, list[int] | list[bool]]] = field(default_factory=list)

    async def start(self) -> None: ...

    async def stop(self) -> None: ...

    async def write(self, zone: IoZone, address: int, values: list[int] | list[bool]) -> None:
        self.writes.append((zone, address, values))


class InlineBackground:
    """Keeps the coroutines the module spawns, to run them from the test."""

    def __init__(self) -> None:
        self.pending: list[Coroutine[None, None, None]] = []

    def spawn(self, work: Coroutine[None, None, None]) -> None:
        self.pending.append(work)

    async def run_all(self) -> None:
        while self.pending:
            await self.pending.pop(0)


class Setup:
    def __init__(self, module: IoModule | None = None, now: float = 0.0) -> None:
        self.bus = FakeBus()
        self.slave = FakeSlave()
        self.background = InlineBackground()
        self.now = now
        self.module = module or make_module()
        self.bridge = ModuleBridge(
            self.module,
            ROWS,
            ModuleServices(self.bus, self.background, lambda: self.now),
            lambda _listener: self.slave,
        )

    async def started(self) -> Setup:
        await self.bridge.start()
        return self
