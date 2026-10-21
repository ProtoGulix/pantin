"""The status lines (ADR 0050 point 2) against the fixture shared with the core's Zod schema."""

from __future__ import annotations

import asyncio
import io
import json

import pytest

from fixture_files import FixtureCase, load_json, message_of, status_line_cases
from pantin_bridge import cli
from pantin_bridge.bridge import BridgeConfig
from pantin_bridge.core_endpoint import parse_core_endpoint
from pantin_bridge.errors import (
    BridgeError,
    BusClosedError,
    ConfigurationError,
    CoreUnavailableError,
    MappingChangedError,
    MappingNotValidError,
    ProtocolError,
)
from pantin_bridge.status_lines import (
    MAX_LINE_BYTES,
    ExitKind,
    StatusLines,
    encode_exiting,
    encode_ready,
    exit_kind_of,
)
from support import make_module


def _is_written_by_this_bridge(message: dict[str, object]) -> bool:
    """The fixture also holds the lines of the OPC UA bridge, which this one never writes."""
    if message["event"] == "ready":
        return message["transport"] == "modbus_tcp_slave"
    return message["kind"] in {kind.value for kind in ExitKind}


VALID = [
    case for case in status_line_cases("valid") if _is_written_by_this_bridge(message_of(case))
]


def _emitted_for(message: dict[str, object]) -> str:
    """The line the bridge writes for the inputs a fixture entry describes."""
    if message["event"] == "ready":
        modules = message["modules"]
        assert isinstance(modules, list)
        return encode_ready(
            str(message["listen"]),
            [make_module(key=str(m["key"]), port=int(m["port"])) for m in modules],
        )
    return encode_exiting(ExitKind(str(message["kind"])), str(message["message"]))


@pytest.mark.parametrize("case", VALID, ids=[case.name for case in VALID])
def test_every_line_the_bridge_writes_equals_its_fixture_entry(case: FixtureCase) -> None:
    message = message_of(case)

    line = _emitted_for(message)

    assert json.loads(line) == message
    assert "\n" not in line


def test_the_fixture_lists_every_exit_kind_of_the_bridge() -> None:
    fixture_kinds = load_json("bridge-status-lines.json")["exitKinds"]
    assert isinstance(fixture_kinds, list)
    assert {kind.value for kind in ExitKind} <= set(fixture_kinds)


def test_the_fixture_holds_the_line_limit_of_the_bridge() -> None:
    assert load_json("bridge-status-lines.json")["maxLineBytes"] == MAX_LINE_BYTES


def test_a_very_long_message_is_cut_so_the_line_stays_within_the_limit() -> None:
    for filler in ("é", "\x01", '"', "\U0001f600"):
        message = filler * 10_000
        line = encode_exiting(ExitKind.UNEXPECTED, message)

        assert len(line.encode("utf-8")) <= MAX_LINE_BYTES
        decoded = json.loads(line)
        assert decoded["kind"] == "unexpected"
        assert decoded["message"]
        assert message.startswith(decoded["message"])


@pytest.mark.parametrize(
    ("error", "kind"),
    [
        (ConfigurationError("x"), ExitKind.CONFIGURATION),
        (CoreUnavailableError("x"), ExitKind.CORE_UNAVAILABLE),
        (MappingNotValidError("x"), ExitKind.MAPPING_NOT_VALID),
        (MappingChangedError("x"), ExitKind.MAPPING_CHANGED),
        (BusClosedError("x"), ExitKind.BUS_CLOSED),
        (ProtocolError("x"), ExitKind.PROTOCOL),
        (BridgeError("x"), ExitKind.UNEXPECTED),
        (RuntimeError("x"), ExitKind.UNEXPECTED),
    ],
)
def test_each_error_maps_to_its_exit_kind(error: Exception, kind: ExitKind) -> None:
    assert exit_kind_of(error) is kind


def test_the_bridge_still_runs_when_the_loop_cannot_install_a_signal_handler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ran: list[bool] = []

    async def returns(*_arguments: object) -> None:
        ran.append(True)

    def refuse(*_arguments: object) -> None:
        raise NotImplementedError

    async def scenario() -> None:
        monkeypatch.setattr(type(asyncio.get_running_loop()), "add_signal_handler", refuse)
        await cli.serve_until_terminated(
            BridgeConfig(parse_core_endpoint("http://127.0.0.1:4800", "demo"), "127.0.0.1", ()),
            StatusLines(None),
        )

    monkeypatch.setattr(cli, "run_bridge", returns)
    asyncio.run(scenario())

    assert ran == [True]


def test_the_stream_gets_one_flushed_line_per_event() -> None:
    class FlushCounter(io.StringIO):
        flushes = 0

        def flush(self) -> None:
            self.flushes += 1

    stream = FlushCounter()
    lines = StatusLines(stream)

    lines.ready("127.0.0.1", [make_module(port=1502)])
    lines.exiting(BusClosedError("gone"))

    assert [json.loads(line)["event"] for line in stream.getvalue().splitlines()] == [
        "ready",
        "exiting",
    ]
    assert stream.flushes == 2


def test_without_a_stream_nothing_is_written() -> None:
    StatusLines(None).exiting(BusClosedError("gone"))


def test_an_unexpected_failure_gets_an_exiting_line_with_the_flag_only(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    async def failing(*_arguments: object) -> None:
        message = "boom"
        raise RuntimeError(message)

    monkeypatch.setattr(cli, "run_bridge", failing)
    arguments = ["--core", "http://127.0.0.1:4800", "--pantin", "demo"]

    status = cli.main([*arguments, "--status-lines"])

    assert status == cli.EXIT_FAILURE
    line = json.loads(capsys.readouterr().out)
    assert line == {
        "event": "exiting",
        "kind": "unexpected",
        "message": "boom",
        "certificate": None,
        "module": None,
    }
    with pytest.raises(RuntimeError):
        cli.main(arguments)
