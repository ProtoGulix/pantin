"""A fake core, a mapping and a PLC client: the scene shared by the bridge tests."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from pymodbus.client import AsyncModbusTcpClient

from fake_core import FakeCore
from pantin_bridge.bridge import BridgeConfig, run_bridge
from pantin_bridge.core_endpoint import parse_core_endpoint

HOST = "127.0.0.1"
MAPPING_ID = "mapping-1"


def row(tag: str, zone: str, address: int, io_type: str) -> dict[str, object]:
    direction = "command" if zone in ("coil", "holding_register") else "feedback"
    return {
        "line": 2,
        "tag": tag,
        "variable": tag.replace(".", "_"),
        "module": "m1",
        "zone": zone,
        "address": address,
        "ioType": io_type,
        "comment": "",
        "type": "bit" if io_type == "BOOL" else "float",
        "direction": direction,
    }


def io_answer(port: int, word_order: str = "low_word_first") -> dict[str, object]:
    module = {
        "key": "m1",
        "port": port,
        "unitId": 1,
        "wordOrder": word_order,
        "watchdogMilliseconds": 200,
    }
    return {
        "status": "valid",
        "mappingId": MAPPING_ID,
        "modules": [module],
        "rows": [
            row("press.valve.extend", "coil", 0, "BOOL"),
            row("press.ext.state", "discrete_input", 0, "BOOL"),
            row("axis.stroke.setpoint", "holding_register", 0, "REAL"),
            row("axis.stroke.position", "input_register", 0, "REAL"),
        ],
        "problems": [],
        "unmappedTags": [],
    }


async def connect_plc(port: int) -> AsyncModbusTcpClient:
    client = AsyncModbusTcpClient(HOST, port=port, timeout=2, retries=0)
    async with asyncio.timeout(3):
        while not await client.connect():
            await asyncio.sleep(0.02)
    return client


async def with_bridge(
    core: FakeCore, port: int, scenario: Callable[[asyncio.Task[None]], Awaitable[None]]
) -> None:
    config = BridgeConfig(parse_core_endpoint(core.url, "demo"), HOST, ())
    bridge = asyncio.create_task(run_bridge(config))
    try:
        await scenario(bridge)
    finally:
        bridge.cancel()
        await asyncio.gather(bridge, return_exceptions=True)


async def read_until(
    read: Callable[[], Awaitable[list[int] | list[bool]]], expected: list[int] | list[bool]
) -> None:
    """Poll the PLC side until the bridge has copied the core's feedback into the datastore."""
    async with asyncio.timeout(3):
        while list(await read())[: len(expected)] != expected:
            await asyncio.sleep(0.02)
