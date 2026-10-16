"""Starts and always stops the real processes of the closed loop test (core, bridge)."""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator
from pathlib import Path

STOP_GRACE_SECONDS = 5.0


class SpawnedProcess:
    """A child process whose output goes to a file, shown when the test fails."""

    def __init__(self, name: str, process: asyncio.subprocess.Process, log: Path) -> None:
        self.name = name
        self._process = process
        self._log = log

    def output(self) -> str:
        return self._log.read_text(encoding="utf-8", errors="replace")

    def ensure_running(self) -> None:
        """Fail with the child's own output when it died, instead of a bare timeout later."""
        if self._process.returncode is not None:
            message = f"{self.name} exited with {self._process.returncode}:\n{self.output()}"
            raise RuntimeError(message)

    async def stop(self) -> None:
        if self._process.returncode is not None:
            return
        self._process.terminate()
        try:
            await asyncio.wait_for(self._process.wait(), STOP_GRACE_SECONDS)
        except TimeoutError:
            self._process.kill()
            await self._process.wait()


@contextlib.asynccontextmanager
async def spawned(
    name: str, command: list[str], log: Path, cwd: Path, env: dict[str, str] | None = None
) -> AsyncIterator[SpawnedProcess]:
    """Run a child for the duration of the block, whatever happens inside it."""
    with log.open("wb") as log_file:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=cwd,
            env=env,
            stdin=asyncio.subprocess.DEVNULL,
            stdout=log_file,
            stderr=asyncio.subprocess.STDOUT,
        )
    child = SpawnedProcess(name, process, log)
    try:
        yield child
    finally:
        await child.stop()
