"""One module of the bridge: PLC writes to the bus, bus feedback to the datastore.

Everything the PLC can write (coils, holding registers) is mirrored in `_command_words`,
because the slave reports only the range one request wrote, and a REAL written in two
requests needs its other half.
"""

from __future__ import annotations

import asyncio
import logging
import math
import time
from collections.abc import Callable, Coroutine, Iterable, Sequence
from dataclasses import dataclass
from typing import Protocol

from pantin_bridge.bus_messages import BusTag
from pantin_bridge.io_mapping import IoModule, IoRow, IoType, IoZone, zone_sizes
from pantin_bridge.modbus_gate import SlaveListener
from pantin_bridge.registers import decode_registers, encode_registers, normalize_value
from pantin_bridge.watchdog import ModuleWatchdog, StatusChange

_log = logging.getLogger(__name__)
_WATCHDOG_TICK_SECONDS_MAX = 0.1


class BusSink(Protocol):
    def write(self, tag: str, value: float) -> None: ...

    def plc_status(self, module: str, *, connected: bool, reason: str | None) -> None: ...


class Slave(Protocol):
    async def start(self) -> None: ...

    async def stop(self) -> None: ...

    async def write(self, zone: IoZone, address: int, values: list[int] | list[bool]) -> None: ...


class BackgroundTasks(Protocol):
    def spawn(self, work: Coroutine[None, None, None]) -> None:
        """Run a coroutine in the background; its failure stops the bridge."""


@dataclass(frozen=True)
class ModuleServices:
    """What a module needs from the rest of the bridge; injected so tests can fake each."""

    bus: BusSink
    background: BackgroundTasks
    clock: Callable[[], float] = time.monotonic


class ModuleBridge(SlaveListener):
    def __init__(
        self,
        module: IoModule,
        rows: Sequence[IoRow],
        services: ModuleServices,
        make_slave: Callable[[SlaveListener], Slave],
    ) -> None:
        self._module = module
        self._bus = services.bus
        self._background = services.background
        self._clock = services.clock
        self._make_slave = make_slave
        self._slave: Slave | None = None
        self._watchdog = ModuleWatchdog(module.watchdog_milliseconds / 1000)
        self._sizes = zone_sizes(tuple(rows))
        self.rows = tuple(rows)
        self._command_row_at: dict[tuple[IoZone, int], IoRow] = {}
        self._feedback_by_tag: dict[str, IoRow] = {}
        self._command_by_tag: dict[str, IoRow] = {}
        for row in rows:
            self._index(row)
        self._command_words = {
            zone: [0] * self._sizes[zone] for zone in (IoZone.COIL, IoZone.HOLDING_REGISTER)
        }
        # The last value the PLC wrote for each tag, as the core knows it.
        self._last_sent: dict[str, float] = {}

    def _index(self, row: IoRow) -> None:
        if row.zone.is_command:
            self._command_by_tag[row.tag] = row
            for offset in range(row.width):
                self._command_row_at[(row.zone, row.address + offset)] = row
        else:
            self._feedback_by_tag[row.tag] = row

    @property
    def tags(self) -> list[str]:
        return [row.tag for row in self.rows]

    async def start(self) -> None:
        self._slave = self._make_slave(self)
        await self._slave.start()

    async def stop(self) -> None:
        if self._slave is not None:
            await self._slave.stop()

    # --- PLC to core -------------------------------------------------------------

    def plc_wrote(self, zone: IoZone, address: int, values: Sequence[int] | Sequence[bool]) -> None:
        words = self._command_words[zone]
        touched: dict[str, IoRow] = {}
        for offset, value in enumerate(values):
            words[address + offset] = int(value)
            row = self._command_row_at.get((zone, address + offset))
            if row is not None:
                touched[row.tag] = row
        for row in touched.values():
            self._send_if_changed(row)

    def _row_value(self, row: IoRow) -> float | None:
        words = self._command_words[row.zone][row.address : row.address + row.width]
        if row.io_type is IoType.BOOL:
            return float(words[0])
        value = decode_registers(row.io_type, words, self._module.word_order)
        if not math.isfinite(value):
            _log.warning(
                "PLC wrote %s to %s: not sent, the core takes finite numbers.", value, row.tag
            )
            return None
        return value

    def _send_if_changed(self, row: IoRow) -> None:
        value = self._row_value(row)
        if value is None or self._last_sent.get(row.tag) == value:
            return
        self._last_sent[row.tag] = value
        self._bus.write(row.tag, value)

    # --- core to PLC -------------------------------------------------------------

    async def apply_feedback(self, tags: Iterable[BusTag]) -> None:
        for tag in tags:
            row = self._feedback_by_tag.get(tag.name)
            if row is not None:
                await self._write_feedback(row, tag.value)

    async def _write_feedback(self, row: IoRow, value: float) -> None:
        if self._slave is None:
            raise RuntimeError("The module is not started.")
        if row.io_type is IoType.BOOL:
            await self._slave.write(row.zone, row.address, [bool(value)])
            return
        words = encode_registers(row.io_type, value, self._module.word_order)
        await self._slave.write(row.zone, row.address, words)

    async def apply_snapshot(self, tags: Iterable[BusTag]) -> None:
        """Feedback to the datastore, and the PLC's last values back to a core that lost them.

        Only tags the PLC has written are synchronised: a PLC that never wrote a tag must not
        overwrite the core's own value (a setpoint saved in the document) with the datastore's 0.
        A forced tag is left alone: the core already holds the PLC's value for it (ADR 0045
        point 5).
        """
        snapshot = list(tags)
        await self.apply_feedback(snapshot)
        for tag in snapshot:
            row = self._command_by_tag.get(tag.name)
            last = self._last_sent.get(tag.name)
            if row is None or last is None or tag.forced:
                continue
            if normalize_value(row.io_type, tag.value, self._module.word_order) != last:
                self._bus.write(row.tag, last)

    # --- watchdog ----------------------------------------------------------------

    def request_served(self) -> None:
        self._report(self._watchdog.request_served(self._clock()))

    def connection_opened(self) -> None:
        self._watchdog.connection_opened()

    def connection_closed(self) -> None:
        self._report(self._watchdog.connection_closed())

    async def watch(self) -> None:
        """Expires the watchdog; runs until cancelled."""
        tick = min(_WATCHDOG_TICK_SECONDS_MAX, self._module.watchdog_milliseconds / 4000)
        while True:
            await asyncio.sleep(tick)
            self._report(self._watchdog.check_timeout(self._clock()))

    def _report(self, change: StatusChange | None) -> None:
        if change is None:
            return
        reason = None if change.reason is None else change.reason.value
        self._bus.plc_status(self._module.key, connected=change.connected, reason=reason)
        if not change.connected:
            self._reset_bit_commands()

    def _reset_bit_commands(self) -> None:
        """Mirror the core, which writes 0 to every bit command of a lost module (point 11).

        The datastore and the memory of what was sent follow, so that the PLC writing a 1
        again when it reconnects is a change and reaches the core.
        """
        bit_tags = [t for t, row in self._command_by_tag.items() if row.io_type is IoType.BOOL]
        for tag in bit_tags:
            self._last_sent.pop(tag, None)
        coils = self._command_words[IoZone.COIL]
        coils[:] = [0] * len(coils)
        self._background.spawn(self._sync_coils())

    async def _sync_coils(self) -> None:
        # Writes the mirror as it is when this runs, not zeros: a PLC write handled between
        # the disconnect and now is already in the mirror, and must stay in the datastore.
        if self._slave is not None:
            mirror = self._command_words[IoZone.COIL]
            await self._slave.write(IoZone.COIL, 0, [bool(word) for word in mirror])
