from pantin_step_converter.units import UNKNOWN_UNIT, source_unit_symbol


def test_known_units_map_to_protocol_symbols() -> None:
    assert source_unit_symbol(["millimetre"]) == "mm"
    assert source_unit_symbol(["METRE"]) == "m"
    assert source_unit_symbol(["centimetre", "metre"]) == "cm"
    assert source_unit_symbol(["inch"]) == "in"


def test_unknown_unit_keeps_its_step_name() -> None:
    assert source_unit_symbol(["foot"]) == "foot"


def test_file_without_unit_is_unknown() -> None:
    assert source_unit_symbol([]) == UNKNOWN_UNIT
