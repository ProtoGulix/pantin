"""A started ModbusSlave on a free loopback port, shared by the slave tests."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from pymodbus.client import AsyncModbusTcpClient

from pantin_bridge.io_mapping import IoZone
from pantin_bridge.modbus_server import ModbusSlave
from pantin_bridge.network_address import SourceFilter
from support import RecordingListener, free_port, make_module

HOST = "127.0.0.1"
READ_ONE_HOLDING_REGISTER = bytes.fromhex("000100000006010300000001")
SIZES = {
    IoZone.COIL: 16,
    IoZone.DISCRETE_INPUT: 16,
    IoZone.HOLDING_REGISTER: 8,
    IoZone.INPUT_REGISTER: 8,
}


async def started_slave(
    listener: RecordingListener,
    source_filter: SourceFilter | None = None,
    unit_id: int = 1,
    idle_timeout_seconds: float | None = None,
) -> tuple[ModbusSlave, int]:
    port = free_port()
    slave = ModbusSlave(
        make_module(port=port, unit_id=unit_id),
        SIZES,
        HOST,
        source_filter or SourceFilter(),
        listener,
        idle_timeout_seconds,
    )
    await slave.start()
    return slave, port


@dataclass
class Running:
    slave: ModbusSlave
    listener: RecordingListener
    client: AsyncModbusTcpClient


@asynccontextmanager
async def running_slave() -> AsyncIterator[Running]:
    """A slave and a pymodbus client (the independent reference) connected to it."""
    listener = RecordingListener()
    slave, port = await started_slave(listener)
    client = AsyncModbusTcpClient(HOST, port=port, timeout=2, retries=0)
    assert await client.connect()
    try:
        yield Running(slave, listener, client)
    finally:
        client.close()
        await slave.stop()
