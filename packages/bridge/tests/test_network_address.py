"""Address classification, the source filter and the listen rules (ADR 0004, 0046)."""

from __future__ import annotations

import pytest

from fixture_files import load_json
from pantin_bridge.core_endpoint import parse_core_endpoint
from pantin_bridge.errors import ConfigurationError
from pantin_bridge.network_address import (
    AddressClass,
    SourceFilter,
    classify_address,
    parse_allow_entry,
    resolve_listen_address,
)


def _entries(key: str) -> list[dict[str, object]]:
    raw = load_json("address-cases.json")[key]
    assert isinstance(raw, list)
    return [{str(k): v for k, v in item.items()} for item in raw if isinstance(item, dict)]


@pytest.mark.parametrize("case", _entries("classification"), ids=lambda case: str(case["address"]))
def test_classifies_like_the_core(case: dict[str, object]) -> None:
    assert classify_address(str(case["address"])).value == case["class"]


@pytest.mark.parametrize(
    "case", _entries("sourceAcceptance"), ids=lambda case: f"{case['source']!r} {case['note']}"
)
def test_filters_sources_like_the_core(case: dict[str, object]) -> None:
    allow = case["allow"]
    assert isinstance(allow, list)
    source_filter = SourceFilter(tuple(parse_allow_entry(str(entry)) for entry in allow))

    assert source_filter.is_accepted(str(case["source"])) is case["accepted"]


def test_allow_entry_must_be_an_ip_or_a_cidr() -> None:
    with pytest.raises(ConfigurationError, match="not an IP address or a CIDR"):
        parse_allow_entry("plc.local")


def test_allow_entry_refuses_host_bits_in_a_cidr() -> None:
    with pytest.raises(ConfigurationError):
        parse_allow_entry("192.168.1.5/24")


def test_listens_on_loopback_without_an_allow_list() -> None:
    assert resolve_listen_address("127.0.0.1", ()).is_loopback


def test_a_private_listen_address_needs_an_allow_list() -> None:
    with pytest.raises(ConfigurationError, match="--allow"):
        resolve_listen_address("192.168.1.10", ())


def test_a_private_listen_address_with_an_allow_list_is_accepted() -> None:
    listen = resolve_listen_address("192.168.1.10", (parse_allow_entry("192.168.1.20"),))

    assert (listen.host, listen.is_loopback) == ("192.168.1.10", False)


@pytest.mark.parametrize(
    ("address", "named"),
    [
        ("0.0.0.0", "wildcard"),
        ("::", "wildcard"),
        ("8.8.8.8", "public"),
        ("169.254.1.1", "link-local"),
        ("localhost", "invalid"),
        ("plc.example.com", "invalid"),
        ("", "invalid"),
    ],
)
def test_refuses_public_wildcard_link_local_and_hostname_listen_addresses(
    address: str, named: str
) -> None:
    allow = (parse_allow_entry("192.168.1.20"),)

    with pytest.raises(ConfigurationError, match=named):
        resolve_listen_address(address, allow)


def test_every_class_has_a_fixture() -> None:
    covered = {AddressClass(str(case["class"])) for case in _entries("classification")}

    assert covered == set(AddressClass)


def test_core_endpoint_accepts_a_loopback_or_private_http_url() -> None:
    endpoint = parse_core_endpoint("http://127.0.0.1:4800", "demo")

    assert endpoint.io_url == (
        "http://127.0.0.1:4800/api/pantins/demo/io?transport=modbus_tcp_slave"
    )
    assert endpoint.bus_url == "ws://127.0.0.1:4800/api/pantins/demo/bus"
    assert parse_core_endpoint("http://192.168.1.5:4800/", "demo").port == 4800
    assert parse_core_endpoint("http://localhost:4800", "demo").host == "localhost"


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:4800",
        "http://8.8.8.8:4800",
        "http://core.example.com:4800",
        "http://127.0.0.1:4800/api",
        "http://127.0.0.1:4800/?x=1",
        "127.0.0.1:4800",
        "http://127.0.0.1:notaport",
    ],
)
def test_core_endpoint_refuses_other_urls(url: str) -> None:
    with pytest.raises(ConfigurationError):
        parse_core_endpoint(url, "demo")
