"""The real bridge process under --status-lines: ready, exiting, SIGTERM, and `python -I`."""

from __future__ import annotations

import asyncio
import contextlib
import json
import signal
import socket
import subprocess
import sys
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path

from fake_core import FakeCore
from plc_scene import HOST, io_answer
from support import free_port

WAIT_SECONDS = 10.0


@contextlib.asynccontextmanager
async def bridge_process(
    core_url: str, *extra: str, flag: bool = True
) -> AsyncIterator[asyncio.subprocess.Process]:
    """Run the bridge for the block and kill it after, so a failed assert leaks no port."""
    # `-I` is how the core will start it (ADR 0050 point 1); the working directory is
    # elsewhere on purpose, so only the venv's .pth file can make the package importable.
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-I",
        "-u",
        "-m",
        "pantin_bridge",
        *(["--status-lines"] if flag else []),
        "--core",
        core_url,
        "--pantin",
        "demo",
        *extra,
        cwd=Path(sys.executable).parent,
        stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        yield process
    finally:
        if process.returncode is None:
            process.kill()
        await process.wait()


async def read_status_line(process: asyncio.subprocess.Process) -> dict[str, object]:
    assert process.stdout is not None
    async with asyncio.timeout(WAIT_SECONDS):
        raw = await process.stdout.readline()
    decoded = json.loads(raw)
    assert isinstance(decoded, dict)
    return {str(key): value for key, value in decoded.items()}


@dataclass(frozen=True)
class Exit:
    code: int
    stdout: bytes
    stderr: str


async def finish(process: asyncio.subprocess.Process) -> Exit:
    """Wait for the exit and collect the output; the context manager kills a hung process."""
    assert process.stdout is not None
    assert process.stderr is not None
    async with asyncio.timeout(WAIT_SECONDS):
        stdout = await process.stdout.read()
        stderr = await process.stderr.read()
        code = await process.wait()
    return Exit(code, stdout, stderr.decode("utf-8", errors="replace"))


def port_is_free(port: int) -> bool:
    with socket.socket() as probe:
        return probe.connect_ex((HOST, port)) != 0


def test_ready_comes_after_binding_and_sigterm_exits_zero_with_the_bus_closed() -> None:
    port = free_port()

    async def scenario() -> None:
        async with FakeCore(io_answer(port)) as core, bridge_process(core.url) as process:
            ready = await read_status_line(process)
            assert ready == {
                "event": "ready",
                "listen": HOST,
                "modules": [{"key": "m1", "port": port}],
            }
            assert not port_is_free(port)

            process.send_signal(signal.SIGTERM)
            outcome = await finish(process)

            assert outcome.code == 0, outcome.stderr
            assert outcome.stdout == b""
            assert port_is_free(port)
            # The bus is closed by the bridge's `finally`: proof the clean path ran.
            async with asyncio.timeout(WAIT_SECONDS):
                await core.bus_closed.wait()

    asyncio.run(scenario())


def test_without_the_flag_stdout_stays_empty() -> None:
    port = free_port()

    async def scenario() -> None:
        async with FakeCore(io_answer(port)) as core, bridge_process(core.url, flag=False) as p:
            await core.wait_for("subscribe")
            p.send_signal(signal.SIGTERM)
            outcome = await finish(p)

            assert outcome.code == 0, outcome.stderr
            assert outcome.stdout == b""

    asyncio.run(scenario())


async def exiting_line(process: asyncio.subprocess.Process) -> dict[str, object]:
    line = await read_status_line(process)
    outcome = await finish(process)
    assert outcome.code != 0, outcome.stderr
    assert outcome.stdout == b"", outcome.stderr
    return line


async def exits_with(core_url: str, *extra: str) -> dict[str, object]:
    async with bridge_process(core_url, *extra) as process:
        return await exiting_line(process)


def test_a_configuration_error_ends_with_kind_configuration() -> None:
    line = asyncio.run(exits_with("http://127.0.0.1:4800", "--listen", "0.0.0.0"))

    assert line["event"] == "exiting"
    assert line["kind"] == "configuration"


def test_a_port_that_is_taken_ends_with_kind_configuration() -> None:
    port = free_port()

    async def scenario() -> dict[str, object]:
        server = await asyncio.start_server(lambda _r, _w: None, HOST, port)
        try:
            async with FakeCore(io_answer(port)) as core:
                return await exits_with(core.url)
        finally:
            server.close()
            await server.wait_closed()

    assert asyncio.run(scenario())["kind"] == "configuration"


def test_an_unreachable_core_ends_with_kind_core_unavailable() -> None:
    line = asyncio.run(exits_with(f"http://{HOST}:{free_port()}"))

    assert line["kind"] == "core_unavailable"


def test_a_missing_mapping_ends_with_kind_mapping_not_valid() -> None:
    answer: dict[str, object] = {
        "status": "missing",
        "mappingId": None,
        "modules": [],
        "problems": [],
        "unmappedTags": [],
    }

    async def scenario() -> dict[str, object]:
        async with FakeCore(answer) as core:
            return await exits_with(core.url)

    assert asyncio.run(scenario())["kind"] == "mapping_not_valid"


def test_an_answer_that_is_not_an_io_answer_ends_with_kind_protocol() -> None:
    async def scenario() -> dict[str, object]:
        async with FakeCore({"unexpected": True}) as core:
            return await exits_with(core.url)

    assert asyncio.run(scenario())["kind"] == "protocol"


async def _after_ready(action: Callable[[FakeCore], Awaitable[None]]) -> dict[str, object]:
    async with FakeCore(io_answer(free_port())) as core, bridge_process(core.url) as process:
        assert (await read_status_line(process))["event"] == "ready"
        await action(core)
        return await exiting_line(process)


def test_io_changed_ends_with_kind_mapping_changed() -> None:
    async def action(core: FakeCore) -> None:
        await core.send({"type": "io_changed"})

    assert asyncio.run(_after_ready(action))["kind"] == "mapping_changed"


def test_the_bus_closing_ends_with_kind_bus_closed() -> None:
    async def action(core: FakeCore) -> None:
        await core.close_bus(4003)

    assert asyncio.run(_after_ready(action))["kind"] == "bus_closed"


def test_python_isolated_mode_still_imports_the_bridge_from_the_venv(tmp_path: Path) -> None:
    # Settles ADR 0050's NOT VERIFIED point: -I skips PYTHON* and the user site, not the
    # site-packages .pth file that setup.sh writes.
    result = subprocess.run(
        [sys.executable, "-I", "-m", "pantin_bridge", "--help"],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        timeout=WAIT_SECONDS,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "--status-lines" in result.stdout
