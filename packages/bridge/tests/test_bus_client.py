"""The bus client against a fake core: hello, headers, frames and close codes."""

from __future__ import annotations

import asyncio
import json

import pytest

from fake_core import FakeCore
from pantin_bridge import bus_messages
from pantin_bridge.bus_client import BusClient
from pantin_bridge.bus_messages import (
    CloseCode,
    ConsoleEntry,
    IoChanged,
    ServerMessage,
    Snapshot,
    TagsChanged,
)
from pantin_bridge.errors import BusClosedError, CoreUnavailableError, ProtocolError
from support import eventually

MAPPING_ID = "abc123"
TRANSPORT = "modbus_tcp_slave"


def _url(core: FakeCore) -> str:
    return f"ws://127.0.0.1:{core.port}/api/pantins/demo/bus"


def test_says_hello_as_a_plc_with_the_mapping_id_and_sends_no_origin() -> None:
    async def scenario() -> FakeCore:
        async with FakeCore({}) as core:
            client, welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            assert welcome.console_id == "c-1"
            await client.close()
            return core

    core = asyncio.run(scenario())

    assert core.received[0] == {
        "type": "hello",
        "version": 2,
        "role": "plc",
        "transport": "modbus_tcp_slave",
        "mappingId": MAPPING_ID,
    }
    # ADR 0046 point 5: a missing Origin is how the core knows a non-browser client.
    assert core.handshake_headers is not None
    assert core.handshake_headers.get("Origin") is None


def test_subscribes_and_receives_the_snapshot_then_changes() -> None:
    async def scenario() -> list[ServerMessage]:
        async with FakeCore({}) as core:
            core.tags["press.valve.extend"] = (1, False)
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            await client.subscribe(["press.valve.extend"])
            received: list[ServerMessage] = []
            messages = client.messages()
            received.append(await anext(messages))
            await core.set_tags(press__valve__extend=0)
            received.append(await anext(messages))
            await client.close()
            return received

    snapshot, changed = asyncio.run(scenario())

    assert isinstance(snapshot, Snapshot)
    assert snapshot.tags[0].name == "press.valve.extend"
    assert isinstance(changed, TagsChanged)
    assert changed.tags[0].value == 0


def test_sends_writes_and_plc_status_in_order() -> None:
    async def scenario() -> list[dict[str, object]]:
        async with FakeCore({}) as core:
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            sender = asyncio.create_task(client.send_pending())
            client.write("press.valve.extend", 1)
            client.plc_status("m1", connected=True, reason=None)
            client.plc_status("m1", connected=False, reason="timeout")
            await core.wait_for("plc_status", 2)
            sender.cancel()
            await client.close()
            return core.received[1:]

    received = asyncio.run(scenario())

    assert [message["type"] for message in received] == ["write", "plc_status", "plc_status"]
    assert received[0]["tag"] == "press.valve.extend"
    assert received[2]["reason"] == "timeout"


def test_message_ids_are_unique() -> None:
    async def scenario() -> list[object]:
        async with FakeCore({}) as core:
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            sender = asyncio.create_task(client.send_pending())
            client.write("a.b.c", 1)
            client.write("a.b.c", 0)
            await core.wait_for("write", 2)
            sender.cancel()
            await client.close()
            return [message["id"] for message in core.messages_of("write")]

    ids = asyncio.run(scenario())

    assert len(set(ids)) == 2


@pytest.mark.parametrize(
    ("code", "fragment"),
    [
        (CloseCode.MAPPING_MISMATCH, "mapping"),
        (CloseCode.PLC_ALREADY_CONNECTED, "another bridge"),
        (CloseCode.ROLE_NOT_ACCEPTED, "own host"),
        (CloseCode.UNSUPPORTED_VERSION, "version"),
    ],
)
def test_a_refused_hello_says_why_and_asks_for_a_restart(code: int, fragment: str) -> None:
    async def scenario() -> None:
        async with FakeCore({}, hello_close_code=code) as core:
            await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)

    with pytest.raises(BusClosedError, match=fragment):
        asyncio.run(scenario())


def test_the_end_of_the_bus_is_an_error_asking_for_a_restart() -> None:
    async def scenario() -> None:
        async with FakeCore({}) as core:
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            await core.close_bus(CloseCode.MAPPING_MISMATCH)
            async for _message in client.messages():
                pass

    with pytest.raises(BusClosedError, match="Restart the bridge"):
        asyncio.run(scenario())


def test_a_clean_close_by_the_core_is_also_an_error() -> None:
    async def scenario() -> None:
        async with FakeCore({}) as core:
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            await core.close_bus(1000)
            async for _message in client.messages():
                pass

    with pytest.raises(BusClosedError):
        asyncio.run(scenario())


def test_nothing_listening_is_a_core_unavailable_error() -> None:
    async def scenario() -> None:
        await BusClient.open("ws://127.0.0.1:1/api/pantins/demo/bus", TRANSPORT, MAPPING_ID)

    with pytest.raises(CoreUnavailableError, match="Cannot open the tag bus"):
        asyncio.run(scenario())


def test_a_binary_frame_is_a_protocol_error() -> None:
    async def scenario() -> None:
        async with FakeCore({}) as core:
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            assert core._connection is not None
            await core._connection.send(b"\x00\x01")
            await anext(client.messages())

    with pytest.raises(ProtocolError, match="binary"):
        asyncio.run(scenario())


def test_a_malformed_message_is_a_protocol_error() -> None:
    async def scenario() -> None:
        async with FakeCore({}) as core:
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            await core.send({"type": "tags", "step": -1, "tags": []})
            await anext(client.messages())

    with pytest.raises(ProtocolError):
        asyncio.run(scenario())


def test_decodes_io_changed_and_console_messages() -> None:
    async def scenario() -> list[ServerMessage]:
        async with FakeCore({}) as core:
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            await core.send({"type": "io_changed"})
            await core.send(
                {
                    "type": "console",
                    "entry": json.loads(
                        '{"sequence":1,"firstSequence":1,"wallTime":"2026-10-13T08:00:00.000Z",'
                        '"simulationTime":0,"count":1,"code":"plc_connected","level":"info",'
                        '"source":{"kind":"pantin"},"params":{"module":"m1"}}'
                    ),
                }
            )
            messages = client.messages()
            return [await anext(messages), await anext(messages)]

    io_changed, console = asyncio.run(scenario())

    assert isinstance(io_changed, IoChanged)
    assert isinstance(console, ConsoleEntry)
    assert console.code == "plc_connected"


def test_a_full_outbox_fails_the_client_instead_of_raising_in_a_modbus_callback() -> None:
    async def scenario() -> BaseException | None:
        async with FakeCore({}) as core:
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            for _ in range(5000):
                client.write("a.b.c", 1)
            await eventually(client.failed.done)
            await client.close()
            return client.failed.exception()

    assert isinstance(asyncio.run(scenario()), BusClosedError)


def _console_frame(code: str, level: str) -> dict[str, object]:
    return {
        "type": "console",
        "entry": {
            "sequence": 1,
            "firstSequence": 1,
            "wallTime": "2026-10-13T08:00:00.000Z",
            "simulationTime": 0,
            "count": 1,
            "code": code,
            "level": level,
            "source": {"kind": "pantin"},
            "params": {},
        },
    }


def test_skips_a_console_entry_of_an_unknown_code_and_keeps_reading() -> None:
    async def scenario() -> ServerMessage:
        async with FakeCore({}) as core:
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            await core.send(_console_frame("a_code_of_a_newer_core", "warning"))
            await core.send({"type": "io_changed"})
            return await anext(client.messages())

    # The unknown entry is skipped, and the next message arrives.
    assert isinstance(asyncio.run(scenario()), IoChanged)


def test_a_known_console_code_with_the_wrong_level_still_fails() -> None:
    async def scenario() -> None:
        async with FakeCore({}) as core:
            client, _welcome = await BusClient.open(_url(core), TRANSPORT, MAPPING_ID)
            await core.send(_console_frame("bridge_log", "info"))
            await anext(client.messages())

    with pytest.raises(ProtocolError):
        asyncio.run(scenario())


def test_decodes_the_bridge_log_and_bridge_failed_entries() -> None:
    for code, level in (("bridge_log", "warning"), ("bridge_failed", "error")):
        message = bus_messages.decode_server_message(json.dumps(_console_frame(code, level)))
        assert isinstance(message, ConsoleEntry)
        assert message.code == code
