"""Where the core is, and the one REST call the bridge makes (ADR 0045 point 10)."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from urllib.parse import quote, urlsplit

from pantin_bridge.errors import ConfigurationError, CoreUnavailableError, ProtocolError
from pantin_bridge.io_mapping import IoMapping, decode_io_mapping
from pantin_bridge.network_address import AddressClass, classify_address

# No proxy, whatever HTTP_PROXY says: the core is on this host (ADR 0046 point 8).
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_REQUEST_TIMEOUT_SECONDS = 10.0
# The io answer is two small tables (each file at most 1 MiB, ADR 0045 point 6) as JSON.
_MAX_ANSWER_BYTES = 8 * 1024 * 1024


@dataclass(frozen=True)
class CoreEndpoint:
    host: str
    port: int
    pantin_id: str

    @property
    def _authority(self) -> str:
        host = f"[{self.host}]" if ":" in self.host else self.host
        return f"{host}:{self.port}"

    @property
    def io_url(self) -> str:
        return f"http://{self._authority}/api/pantins/{quote(self.pantin_id, safe='')}/io"

    @property
    def bus_url(self) -> str:
        return f"ws://{self._authority}/api/pantins/{quote(self.pantin_id, safe='')}/bus"


def parse_core_endpoint(core_url: str, pantin_id: str) -> CoreEndpoint:
    """ADR 0046 point 8: clear text, so only http:// to a loopback or private address."""
    try:
        parts = urlsplit(core_url)
        port = parts.port
    except ValueError:
        raise ConfigurationError(
            f'--core "{core_url}" is not a URL such as http://127.0.0.1:4800.'
        ) from None
    host = parts.hostname or ""
    if parts.scheme != "http" or host == "" or parts.path not in ("", "/") or parts.query:
        raise ConfigurationError(
            f'--core "{core_url}" must be http://<address>:<port>, with no path (ADR 0046 point 8).'
        )
    # "localhost" is the one name accepted: every resolver maps it to loopback.
    if host != "localhost" and classify_address(host) not in (
        AddressClass.LOOPBACK,
        AddressClass.PRIVATE,
    ):
        raise ConfigurationError(
            f"--core {host} is not a loopback or private address: the bridge talks to the core "
            "in clear text and runs on the core's host (ADR 0046 point 8)."
        )
    return CoreEndpoint(host=host, port=port or 80, pantin_id=pantin_id)


def _error_message(error: urllib.error.HTTPError) -> str:
    try:
        body: object = json.loads(error.read(4096))
        detail = body["error"]["message"] if isinstance(body, dict) else ""
    except (ValueError, KeyError, TypeError):
        detail = ""
    return f"The core answered {error.code}: {detail}".rstrip(": ")


def fetch_io_mapping(endpoint: CoreEndpoint) -> IoMapping:
    """GET .../io, blocking: it runs once at start-up, before the event loop has work."""
    request = urllib.request.Request(endpoint.io_url, headers={"Accept": "application/json"})  # noqa: S310
    try:
        # S310: the scheme is http by construction (parse_core_endpoint).
        with _OPENER.open(request, timeout=_REQUEST_TIMEOUT_SECONDS) as answer:
            raw = answer.read(_MAX_ANSWER_BYTES + 1)
    except urllib.error.HTTPError as error:
        raise CoreUnavailableError(f"{_error_message(error)} ({endpoint.io_url})") from error
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise CoreUnavailableError(
            f"Cannot reach the core at {endpoint.io_url}: {error}. Is it running?"
        ) from error
    if len(raw) > _MAX_ANSWER_BYTES:
        raise ProtocolError("The io answer is larger than 8 MiB.")
    try:
        return decode_io_mapping(json.loads(raw))
    except json.JSONDecodeError as error:
        raise ProtocolError(f"The io answer is not JSON: {error}.") from error
