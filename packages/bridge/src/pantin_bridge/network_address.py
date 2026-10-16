"""Address classification and the source filter of ADR 0004 and ADR 0046.

Pure functions, held equal to the core's by packages/protocol/fixtures/address-cases.json.
"""

from __future__ import annotations

import ipaddress
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from pantin_bridge.errors import ConfigurationError

type IpAddress = ipaddress.IPv4Address | ipaddress.IPv6Address
type IpNetwork = ipaddress.IPv4Network | ipaddress.IPv6Network


class AddressClass(StrEnum):
    LOOPBACK = "loopback"
    PRIVATE = "private"
    WILDCARD = "wildcard"
    LINK_LOCAL = "link-local"
    PUBLIC = "public"
    INVALID = "invalid"


# RFC 1918 and unique local addresses (ADR 0004 point 2). Listed here rather than taken
# from `ipaddress.is_private`, which also covers ranges the core refuses (100.64.0.0/10
# is not one, but fec0::/10 and others are): the two sides must agree.
_PRIVATE_NETWORKS: tuple[IpNetwork, ...] = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("fc00::/7"),
)
_LINK_LOCAL_NETWORKS: tuple[IpNetwork, ...] = (
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("fe80::/10"),
)
_LOOPBACK_NETWORKS: tuple[IpNetwork, ...] = (
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
)


def parse_address(text: str) -> IpAddress | None:
    """Parse one IP literal, with IPv4-mapped IPv6 turned into its IPv4 address.

    Returns None for anything else: hostnames, ranges, scoped (`%eth0`) or bracketed
    forms. Python 3.13 accepts a scope id, which the core refuses, so it is refused here.
    """
    if "%" in text:
        return None
    try:
        address = ipaddress.ip_address(text)
    except ValueError:
        return None
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped is not None:
        return address.ipv4_mapped
    return address


def _inside_any(address: IpAddress, networks: Sequence[IpNetwork]) -> bool:
    # A version mismatch makes `in` answer False, which is the wanted result.
    return any(address in network for network in networks)


def classify_address(text: str) -> AddressClass:
    address = parse_address(text)
    if address is None:
        return AddressClass.INVALID
    if address.is_unspecified:
        return AddressClass.WILDCARD
    if _inside_any(address, _LOOPBACK_NETWORKS):
        return AddressClass.LOOPBACK
    if _inside_any(address, _PRIVATE_NETWORKS):
        return AddressClass.PRIVATE
    if _inside_any(address, _LINK_LOCAL_NETWORKS):
        return AddressClass.LINK_LOCAL
    return AddressClass.PUBLIC


def parse_allow_entry(text: str) -> IpNetwork:
    """Parse an `--allow` value: one IP or a CIDR."""
    try:
        network = ipaddress.ip_network(text, strict=True)
    except ValueError:
        raise ConfigurationError(
            f'--allow "{text}" is not an IP address or a CIDR such as 192.168.1.0/24.'
        ) from None
    return network


@dataclass(frozen=True)
class SourceFilter:
    """Accepts loopback and private sources, narrowed by the allow list, never widened."""

    allow: tuple[IpNetwork, ...] = ()

    def is_accepted(self, source: str) -> bool:
        address = parse_address(source)
        if address is None:
            return False
        if classify_address(source) not in (AddressClass.LOOPBACK, AddressClass.PRIVATE):
            return False
        return not self.allow or _inside_any(address, self.allow)


@dataclass(frozen=True)
class ListenAddress:
    host: str
    is_loopback: bool


def resolve_listen_address(text: str, allow: Sequence[IpNetwork]) -> ListenAddress:
    """Apply ADR 0046 points 1 and 3 to `--listen` and `--allow`."""
    address_class = classify_address(text)
    if address_class is AddressClass.LOOPBACK:
        return ListenAddress(host=text, is_loopback=True)
    if address_class is AddressClass.PRIVATE:
        if not allow:
            raise ConfigurationError(
                f"--listen {text} opens Modbus to the network, which has no authentication: "
                "add at least one --allow <ip or cidr> naming the PLC (ADR 0046 point 3)."
            )
        return ListenAddress(host=text, is_loopback=False)
    raise ConfigurationError(
        f'--listen "{text}" is refused ({address_class.value}): use 127.0.0.1, or one explicit '
        "private address (10.x, 172.16-31.x, 192.168.x, fc00::/7) with --allow (ADR 0004, 0046)."
    )
