"""Command line: `python -m pantin_bridge --core <url> --pantin <id> ...` (ADR 0045 point 10)."""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from collections.abc import Sequence

from pantin_bridge.bridge import BridgeConfig, run_bridge
from pantin_bridge.core_endpoint import parse_core_endpoint
from pantin_bridge.errors import BridgeError, ConfigurationError
from pantin_bridge.network_address import parse_allow_entry, resolve_listen_address

EXIT_FAILURE = 1
EXIT_BAD_CONFIGURATION = 2
EXIT_INTERRUPTED = 130


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m pantin_bridge",
        description="Bridge a Pantin core to a PLC over Modbus TCP (slave role).",
    )
    parser.add_argument("--core", required=True, help="core URL, e.g. http://127.0.0.1:4800")
    parser.add_argument("--pantin", required=True, help="id of the Pantin to bridge")
    parser.add_argument(
        "--listen",
        default="127.0.0.1",
        help="address of the Modbus slaves: 127.0.0.1 (default) or one private address",
    )
    parser.add_argument(
        "--allow",
        action="append",
        default=[],
        metavar="IP_OR_CIDR",
        help="accepted PLC source, repeatable; required with a private --listen address",
    )
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING"])
    return parser


def build_config(arguments: argparse.Namespace) -> BridgeConfig:
    """Apply the security rules of ADR 0004 and 0046 to the command line."""
    allow = tuple(parse_allow_entry(entry) for entry in arguments.allow)
    listen = resolve_listen_address(arguments.listen, allow)
    endpoint = parse_core_endpoint(arguments.core, arguments.pantin)
    return BridgeConfig(endpoint=endpoint, listen_host=listen.host, allow=allow)


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    logging.basicConfig(
        level=arguments.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    try:
        config = build_config(arguments)
        asyncio.run(run_bridge(config))
    except ConfigurationError as error:
        print(f"pantin-bridge: {error}", file=sys.stderr)  # noqa: T201
        return EXIT_BAD_CONFIGURATION
    except BridgeError as error:
        print(f"pantin-bridge: {error}", file=sys.stderr)  # noqa: T201
        return EXIT_FAILURE
    except KeyboardInterrupt:
        return EXIT_INTERRUPTED
    return EXIT_FAILURE
