"""ADR 0045 P4 exit test: a PLC client closes the loop on the real core and the real bridge.

The core runs `examples/plc-cylinder` (valve 5/2 with two coils, double-acting cylinder, two
limit switches) at 1x. A pymodbus client plays the PLC: it polls every 20 ms and drives five
extend and retract cycles through the Modbus slave of the bridge.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from pymodbus.client import AsyncModbusTcpClient

from spawned_processes import SpawnedProcess, spawned
from support import free_port

REPOSITORY = Path(__file__).resolve().parents[3]
EXAMPLE = REPOSITORY / "examples" / "plc-cylinder"
BRIDGE_SOURCES = REPOSITORY / "packages" / "bridge" / "src"
HOST = "127.0.0.1"
PANTIN_ID = "plc-cylinder"

POLL_SECONDS = 0.02
CYCLES = 5
STARTUP_SECONDS = 20.0
# The slowest stroke is 0.125 m at 0.05 m/s, 2.5 s: this is a hang detector, not a measure.
STROKE_TIMEOUT_SECONDS = 10.0

# io.json of the example: coil 0 is the valve pilot 14, coil 1 the pilot 12, and
# discrete input 0 the switch at the retracted end, 1 the one at the extended end.
EXTEND_COIL = 0
RETRACT_COIL = 1


@dataclass(frozen=True)
class Sample:
    retracted: bool
    extended: bool


def first_index(samples: list[Sample], matches: str, value: bool) -> int:
    """Index of the first sample whose switch `matches` ("retracted" or "extended") is `value`."""
    for index, sample in enumerate(samples):
        if getattr(sample, matches) is value:
            return index
    message = f"{matches} never became {value} in {len(samples)} samples"
    raise AssertionError(message)


def prepare_pantins_directory(directory: Path, modbus_port: int) -> None:
    """A temporary copy of the example, its Modbus module moved to a free port."""
    folder = directory / PANTIN_ID
    shutil.copytree(EXAMPLE, folder)
    io_path = folder / "io.json"
    document = json.loads(io_path.read_text(encoding="utf-8"))
    document["modules"][0]["port"] = modbus_port
    io_path.write_text(json.dumps(document, indent=2), encoding="utf-8")


async def wait_for_port(port: int, process: SpawnedProcess) -> None:
    """Wait until `process` accepts connections on `port`, failing early if it died."""
    async with asyncio.timeout(STARTUP_SECONDS):
        while True:
            process.ensure_running()
            try:
                _, writer = await asyncio.open_connection(HOST, port)
            except OSError:
                await asyncio.sleep(0.1)
                continue
            writer.close()
            await writer.wait_closed()
            return


async def connect_when_ready(port: int, bridge: SpawnedProcess) -> AsyncModbusTcpClient:
    """The bridge opens its slave once it has read the mapping from the core."""
    await wait_for_port(port, bridge)
    client = AsyncModbusTcpClient(HOST, port=port, timeout=2, retries=0)
    async with asyncio.timeout(STARTUP_SECONDS):
        while not await client.connect():
            await asyncio.sleep(0.1)
    return client


async def read_sample(plc: AsyncModbusTcpClient) -> Sample:
    answer = await plc.read_discrete_inputs(0, count=2, device_id=1)
    assert not answer.isError(), answer
    return Sample(retracted=bool(answer.bits[0]), extended=bool(answer.bits[1]))


async def stroke(plc: AsyncModbusTcpClient, coil: int, other_coil: int, done: str) -> list[Sample]:
    """Hold one pilot (the valve has memory), poll every 20 ms until switch `done` is 1."""
    for address, value in ((other_coil, False), (coil, True)):
        answer = await plc.write_coil(address, value, device_id=1)
        assert not answer.isError(), answer
    samples: list[Sample] = []
    deadline = time.monotonic() + STROKE_TIMEOUT_SECONDS
    next_poll = time.monotonic()
    while time.monotonic() < deadline:
        samples.append(await read_sample(plc))
        if getattr(samples[-1], done):
            return samples
        next_poll += POLL_SECONDS
        await asyncio.sleep(max(0.0, next_poll - time.monotonic()))
    message = f"switch {done} never rose within {STROKE_TIMEOUT_SECONDS} s after coil {coil}"
    raise AssertionError(message)


def assert_leaves_then_reaches(samples: list[Sample], leaves: str, reaches: str) -> None:
    """The switch left falls strictly before the switch reached rises, never both at 1."""
    assert not any(sample.retracted and sample.extended for sample in samples)
    fell = first_index(samples, leaves, False)
    rose = first_index(samples, reaches, True)
    assert fell < rose, f"{leaves} fell at sample {fell}, {reaches} rose at sample {rose}"


async def run_cycles(plc: AsyncModbusTcpClient) -> None:
    start = await read_sample(plc)
    assert start == Sample(retracted=True, extended=False)
    for _ in range(CYCLES):
        out = await stroke(plc, EXTEND_COIL, RETRACT_COIL, done="extended")
        assert_leaves_then_reaches(out, leaves="retracted", reaches="extended")
        back = await stroke(plc, RETRACT_COIL, EXTEND_COIL, done="retracted")
        assert_leaves_then_reaches(back, leaves="extended", reaches="retracted")


def with_logs(error: Exception, **logs: str) -> AssertionError:
    """A failure that carries the children's output, so a CI run can be diagnosed."""
    sections = "".join(f"\n--- {name} ---\n{text}" for name, text in logs.items())
    return AssertionError(f"{error}{sections}")


async def scenario(workspace: Path) -> None:
    core_port = free_port()
    modbus_port = free_port()
    pantins = workspace / "pantins"
    pantins.mkdir()
    prepare_pantins_directory(pantins, modbus_port)
    core_command = ["node", "packages/core/src/main.ts", "--pantins-dir", str(pantins)]
    core_command += ["--port", str(core_port)]
    bridge_command = [sys.executable, "-m", "pantin_bridge", "--pantin", PANTIN_ID]
    bridge_command += ["--core", f"http://{HOST}:{core_port}"]
    bridge_command += ["--listen", HOST, "--allow", HOST]
    bridge_env = {**os.environ, "PYTHONPATH": str(BRIDGE_SOURCES)}
    async with spawned("core", core_command, workspace / "core.log", REPOSITORY) as core:
        try:
            await wait_for_port(core_port, core)
        except TimeoutError as error:
            raise with_logs(error, core=core.output()) from error
        async with spawned(
            "bridge", bridge_command, workspace / "bridge.log", REPOSITORY, bridge_env
        ) as bridge:
            try:
                plc = await connect_when_ready(modbus_port, bridge)
            except TimeoutError as error:
                raise with_logs(error, core=core.output(), bridge=bridge.output()) from error
            try:
                await run_cycles(plc)
            except (AssertionError, TimeoutError) as error:
                raise with_logs(error, core=core.output(), bridge=bridge.output()) from error
            finally:
                plc.close()


def test_a_plc_client_runs_five_extend_and_retract_cycles(tmp_path: Path) -> None:
    asyncio.run(scenario(tmp_path))
