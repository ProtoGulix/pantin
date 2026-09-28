"""Maps the length unit names that OpenCascade reads from a STEP file to short symbols."""

from collections.abc import Sequence

# Symbols match the LengthUnit enum of @pantin/protocol where a match exists.
_SYMBOL_BY_STEP_UNIT_NAME = {
    "metre": "m",
    "millimetre": "mm",
    "centimetre": "cm",
    "inch": "in",
}

UNKNOWN_UNIT = "unknown"


def source_unit_symbol(step_unit_names: Sequence[str]) -> str:
    """Return the symbol of the first length unit declared by the file.

    A unit without a known symbol is returned by its STEP name, so that the
    information is not lost; the mesh itself is always converted to metres.
    """
    if not step_unit_names:
        return UNKNOWN_UNIT
    first_name = step_unit_names[0].strip().lower()
    return _SYMBOL_BY_STEP_UNIT_NAME.get(first_name, first_name)
