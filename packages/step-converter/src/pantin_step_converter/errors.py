"""Errors raised by the converter, one type per exit code of the process contract."""


class ConverterError(Exception):
    """The conversion failed for a reason that is not the user's file (exit code 1)."""


class UnusableStepFileError(ConverterError):
    """The input is not a usable STEP file (exit code 2).

    The message reaches the user through the core, so it says what to do.
    """
