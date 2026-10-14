"""Command line: `python -m pantin_bridge --core <url> --pantin <id> ...` (ADR 0045 point 10)."""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import io
import logging
import signal
import sys
from collections.abc import Sequence

from pantin_bridge.bridge import BridgeConfig, run_bridge
from pantin_bridge.core_endpoint import parse_core_endpoint
from pantin_bridge.errors import BridgeError, ConfigurationError
from pantin_bridge.network_address import parse_allow_entry, resolve_listen_address
from pantin_bridge.status_lines import StatusLines

EXIT_OK = 0
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
    parser.add_argument(
        "--status-lines",
        action="store_true",
        help="write JSON status lines (ready, exiting) on stdout, for a supervising process",
    )
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING"])
    return parser


def build_config(arguments: argparse.Namespace) -> BridgeConfig:
    """Apply the security rules of ADR 0004 and 0046 to the command line."""
    allow = tuple(parse_allow_entry(entry) for entry in arguments.allow)
    listen = resolve_listen_address(arguments.listen, allow)
    endpoint = parse_core_endpoint(arguments.core, arguments.pantin)
    return BridgeConfig(endpoint=endpoint, listen_host=listen.host, allow=allow)


async def serve_until_terminated(config: BridgeConfig, status: StatusLines) -> None:
    """Run the bridge; return normally only when SIGTERM asked it to stop (ADR 0050 point 2)."""
    terminated = False
    work = asyncio.create_task(
        run_bridge(config, lambda modules: status.ready(config.listen_host, modules))
    )

    def terminate() -> None:
        nonlocal terminated
        terminated = True
        # Cancelling runs the `finally` of run_bridge: slaves stopped, bus closed.
        work.cancel()

    # Windows event loops have no signal handlers (the core's kill is a forced termination
    # there, NOT VERIFIED in ADR 0050): the bridge must still run, only without a clean SIGTERM.
    with contextlib.suppress(NotImplementedError):
        asyncio.get_running_loop().add_signal_handler(signal.SIGTERM, terminate)
    try:
        await work
    except asyncio.CancelledError:
        if not terminated:
            raise


def _report_failure(error: Exception, status: StatusLines, exit_code: int) -> int:
    print(f"pantin-bridge: {error}", file=sys.stderr)  # noqa: T201
    status.exiting(error)
    return exit_code


def main(argv: Sequence[str] | None = None) -> int:
    arguments = build_parser().parse_args(argv)
    logging.basicConfig(
        level=arguments.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    # The core reads UTF-8; with `-I` PYTHONIOENCODING is ignored, and a Windows pipe
    # would otherwise use the ANSI code page.
    if arguments.status_lines and isinstance(sys.stdout, io.TextIOWrapper):
        sys.stdout.reconfigure(encoding="utf-8")
    status = StatusLines(sys.stdout if arguments.status_lines else None)
    try:
        config = build_config(arguments)
        asyncio.run(serve_until_terminated(config, status))
    except ConfigurationError as error:
        return _report_failure(error, status, EXIT_BAD_CONFIGURATION)
    except BridgeError as error:
        return _report_failure(error, status, EXIT_FAILURE)
    except KeyboardInterrupt:
        return EXIT_INTERRUPTED
    except Exception as error:
        # Without the flag the traceback is the right output; a supervisor needs a line instead.
        if not arguments.status_lines:
            raise
        logging.getLogger(__name__).exception("Unexpected failure")
        return _report_failure(error, status, EXIT_FAILURE)
    return EXIT_OK
