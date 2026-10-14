"""Every way the bridge stops: all are errors with a message, none is retried (point 10)."""

from __future__ import annotations

import asyncio
import json

import pytest
from pymodbus.client import AsyncModbusTcpClient

from fake_core import FakeCore
from fixture_files import io_cases
from pantin_bridge.bridge import BridgeConfig, require_valid_mapping, run_bridge
from pantin_bridge.core_endpoint import parse_core_endpoint
from pantin_bridge.errors import (
    BusClosedError,
    CoreUnavailableError,
    MappingChangedError,
    MappingNotValidError,
)
from pantin_bridge.io_mapping import decode_io_mapping
from plc_scene import HOST, connect_plc, io_answer, with_bridge
from support import free_port


def test_io_changed_stops_the_bridge_with_a_restart_message() -> None:
    port = free_port()

    async def scenario() -> None:
        async with FakeCore(io_answer(port)) as core:

            async def play(bridge: asyncio.Task[None]) -> None:
                await core.wait_for("subscribe")
                await core.send({"type": "io_changed"})
                await bridge

            await with_bridge(core, port, play)

    with pytest.raises(MappingChangedError, match="restart the bridge"):
        asyncio.run(scenario())


def test_the_bus_closing_stops_the_bridge() -> None:
    port = free_port()

    async def scenario() -> None:
        async with FakeCore(io_answer(port)) as core:

            async def play(bridge: asyncio.Task[None]) -> None:
                await core.wait_for("subscribe")
                await core.close_bus(4003)
                await bridge

            await with_bridge(core, port, play)

    with pytest.raises(BusClosedError, match="Restart the bridge"):
        asyncio.run(scenario())


def test_the_slaves_are_gone_when_the_bridge_stops() -> None:
    port = free_port()

    async def scenario() -> bool:
        async with FakeCore(io_answer(port)) as core:

            async def play(bridge: asyncio.Task[None]) -> None:
                await core.wait_for("subscribe")
                (await connect_plc(port)).close()
                bridge.cancel()
                await asyncio.gather(bridge, return_exceptions=True)

            await with_bridge(core, port, play)
        client = AsyncModbusTcpClient(HOST, port=port, timeout=1, retries=0)
        return bool(await client.connect())

    assert asyncio.run(scenario()) is False


def test_an_invalid_mapping_stops_the_bridge_before_the_bus_with_the_problems() -> None:
    answer = json.loads(io_cases("valid")[2].frame)

    async def scenario() -> FakeCore:
        async with FakeCore(answer) as core:
            config = BridgeConfig(parse_core_endpoint(core.url, "demo"), HOST, ())
            with pytest.raises(
                MappingNotValidError, match=r"modules\[0\]\.channels\[0\]\.tag: No tag"
            ):
                await run_bridge(config)
            return core

    assert asyncio.run(scenario()).received == []


def test_a_missing_mapping_tells_how_to_create_one() -> None:
    mapping = decode_io_mapping(json.loads(io_cases("valid")[1].frame))

    with pytest.raises(MappingNotValidError, match="pantin io init"):
        require_valid_mapping(mapping)


def test_a_core_that_is_down_is_reported_not_retried() -> None:
    config = BridgeConfig(parse_core_endpoint(f"http://127.0.0.1:{free_port()}", "demo"), HOST, ())

    with pytest.raises(CoreUnavailableError, match="Cannot reach the core"):
        asyncio.run(run_bridge(config))
