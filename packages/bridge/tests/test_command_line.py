"""The command line applies the security rules before anything is opened."""

from __future__ import annotations

import asyncio

import pytest

from fake_core import FakeCore
from pantin_bridge import cli
from pantin_bridge.bus_client import BusClient
from pantin_bridge.core_endpoint import fetch_io_mapping, parse_core_endpoint
from pantin_bridge.errors import CoreUnavailableError, ProtocolError
from support import free_port

CORE = "http://127.0.0.1:4800"


def _arguments(*extra: str) -> list[str]:
    return ["--core", CORE, "--pantin", "demo", *extra]


def test_listens_on_loopback_by_default() -> None:
    config = cli.build_config(cli.build_parser().parse_args(_arguments()))

    assert config.listen_host == "127.0.0.1"
    assert config.allow == ()


def test_a_private_address_with_an_allow_list_is_accepted() -> None:
    parsed = cli.build_parser().parse_args(
        _arguments("--listen", "192.168.1.10", "--allow", "192.168.1.20", "--allow", "10.0.0.0/8")
    )

    config = cli.build_config(parsed)

    assert config.listen_host == "192.168.1.10"
    assert [str(network) for network in config.allow] == ["192.168.1.20/32", "10.0.0.0/8"]


@pytest.mark.parametrize(
    "extra",
    [
        ["--listen", "0.0.0.0"],
        ["--listen", "8.8.8.8", "--allow", "8.8.8.8"],
        ["--listen", "192.168.1.10"],
        ["--listen", "localhost"],
        ["--allow", "not-an-ip"],
    ],
)
def test_main_refuses_unsafe_arguments_with_status_2_and_opens_nothing(
    extra: list[str], capsys: pytest.CaptureFixture[str]
) -> None:
    status = cli.main(_arguments(*extra))

    assert status == cli.EXIT_BAD_CONFIGURATION
    assert capsys.readouterr().err.startswith("pantin-bridge: ")


def test_main_refuses_a_public_core_url(capsys: pytest.CaptureFixture[str]) -> None:
    status = cli.main(["--core", "http://8.8.8.8:4800", "--pantin", "demo"])

    assert status == cli.EXIT_BAD_CONFIGURATION
    assert "clear text" in capsys.readouterr().err


def test_main_reports_a_core_that_is_down_with_status_1(capsys: pytest.CaptureFixture[str]) -> None:
    status = cli.main(["--core", f"http://127.0.0.1:{free_port()}", "--pantin", "demo"])

    assert status == cli.EXIT_FAILURE
    assert "Cannot reach the core" in capsys.readouterr().err


def test_fetches_and_decodes_the_io_answer() -> None:
    async def scenario() -> int:
        answer: dict[str, object] = {
            "status": "missing",
            "mappingId": None,
            "modules": [],
            "problems": [],
            "unmappedTags": [],
        }
        async with FakeCore(answer) as core:
            mapping = await asyncio.to_thread(
                fetch_io_mapping, parse_core_endpoint(core.url, "demo")
            )
            return len(mapping.rows)

    assert asyncio.run(scenario()) == 0


def test_an_io_answer_that_is_not_an_io_answer_is_a_protocol_error() -> None:
    async def scenario() -> None:
        async with FakeCore({"unexpected": True}) as core:
            await asyncio.to_thread(fetch_io_mapping, parse_core_endpoint(core.url, "demo"))

    with pytest.raises(ProtocolError):
        asyncio.run(scenario())


def test_an_unreachable_core_is_a_core_unavailable_error() -> None:
    with pytest.raises(CoreUnavailableError):
        fetch_io_mapping(parse_core_endpoint(f"http://127.0.0.1:{free_port()}", "demo"))


def test_a_proxy_environment_is_ignored_for_the_io_call_and_the_bus(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A proxy nobody listens on: following it would fail both calls (ADR 0046 point 8).
    dead_proxy = f"http://127.0.0.1:{free_port()}"
    for name in ("HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy", "WS_PROXY", "ws_proxy"):
        monkeypatch.setenv(name, dead_proxy)
    for name in ("NO_PROXY", "no_proxy"):
        monkeypatch.setenv(name, "")
    answer: dict[str, object] = {
        "status": "missing",
        "mappingId": None,
        "modules": [],
        "problems": [],
        "unmappedTags": [],
    }

    async def scenario() -> None:
        async with FakeCore(answer) as core:
            await asyncio.to_thread(fetch_io_mapping, parse_core_endpoint(core.url, "demo"))
            client, _welcome = await BusClient.open(
                f"ws://127.0.0.1:{core.port}/api/pantins/demo/bus", "modbus_tcp_slave", "id"
            )
            # The bridge reads the projection of the one transport it serves (ADR 0065).
            assert core.io_queries == ["transport=modbus_tcp_slave"]
            await client.close()

    asyncio.run(scenario())
