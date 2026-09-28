"""Command line entry point: python -m pantin_step_converter --input <file> --output-dir <dir>.

Process contract (ADR 0009): stdout carries exactly one JSON object; exit code 0
with the converted components, exit code 2 with {"error": ...} when the input is
not a usable STEP file. Every diagnostic goes to stderr.
"""

import argparse
import json
import os
import sys
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import NoReturn, TextIO

from pantin_step_converter.conversion import convert_step
from pantin_step_converter.errors import ConverterError, UnusableStepFileError

EXIT_OK = 0
EXIT_FAILURE = 1
EXIT_UNUSABLE_INPUT = 2
# Exit code 2 is reserved for unusable input, so usage errors take EX_USAGE from sysexits.h.
EXIT_USAGE = 64


class _ArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        self.print_usage(sys.stderr)
        self.exit(EXIT_USAGE, f"{self.prog}: error: {message}\n")


def _parse_arguments(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = _ArgumentParser(
        prog="pantin_step_converter",
        description="Convert a STEP file into one GLB per leaf component (metres, Z up).",
    )
    parser.add_argument("--input", type=Path, required=True, help="STEP file to convert")
    parser.add_argument(
        "--output-dir", type=Path, required=True, help="existing directory for the GLB files"
    )
    return parser.parse_args(argv)


@contextmanager
def _stdout_reserved_for_result() -> Iterator[TextIO]:
    """Send everything written to stdout to stderr, and yield a stream to the real stdout.

    OpenCascade prints its progress from C++ straight to file descriptor 1,
    bypassing sys.stdout, and its buffered output may only be flushed when the
    process exits. The core parses stdout as one JSON object, so file
    descriptor 1 points at stderr until the end of the process, never back.
    """
    sys.stdout.flush()
    with os.fdopen(os.dup(1), "w", encoding="utf-8") as result_stream:
        os.dup2(sys.stderr.fileno(), 1)
        yield result_stream


def _write_json(stream: TextIO, value: dict[str, object]) -> None:
    stream.write(json.dumps(value) + "\n")
    stream.flush()


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parse_arguments(argv)
    with _stdout_reserved_for_result() as result_stream:
        try:
            result = convert_step(arguments.input, arguments.output_dir)
        except UnusableStepFileError as error:
            _write_json(result_stream, {"error": str(error)})
            return EXIT_UNUSABLE_INPUT
        except ConverterError as error:
            sys.stderr.write(f"pantin_step_converter: {error}\n")
            return EXIT_FAILURE
        _write_json(result_stream, result.to_json())
        return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
