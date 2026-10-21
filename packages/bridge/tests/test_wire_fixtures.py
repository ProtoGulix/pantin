"""The bridge's hand-written decoders against the fixtures the Zod schemas are tested with."""

from __future__ import annotations

import json

import pytest

from fixture_files import FixtureCase, bus_cases, io_cases, load_json, message_of
from pantin_bridge import bus_messages
from pantin_bridge.errors import ProtocolError
from pantin_bridge.io_mapping import (
    IoStatus,
    IoType,
    IoZone,
    SkippedModule,
    WordOrder,
    decode_io_mapping,
)


def _ids(cases: list[FixtureCase]) -> list[str]:
    return [case.name for case in cases]


@pytest.mark.parametrize(
    "case", bus_cases("server", "valid"), ids=_ids(bus_cases("server", "valid"))
)
def test_decodes_every_valid_server_message(case: FixtureCase) -> None:
    message = bus_messages.decode_server_message(case.frame)

    assert message is not None


@pytest.mark.parametrize(
    "case", bus_cases("server", "invalid"), ids=_ids(bus_cases("server", "invalid"))
)
def test_refuses_every_invalid_server_message(case: FixtureCase) -> None:
    with pytest.raises(ProtocolError):
        bus_messages.decode_server_message(case.frame)


def test_server_fixtures_cover_every_message_type_of_the_core() -> None:
    covered = {message_of(case)["type"] for case in bus_cases("server", "valid")}

    assert covered == {
        "welcome",
        "snapshot",
        "tags",
        "ack",
        "error",
        "console",
        "clock",
        "io_changed",
    }


@pytest.mark.parametrize("case", io_cases("valid"), ids=_ids(io_cases("valid")))
def test_decodes_every_valid_io_answer(case: FixtureCase) -> None:
    mapping = decode_io_mapping(json.loads(case.frame))

    assert mapping.status in IoStatus


@pytest.mark.parametrize("case", io_cases("invalid"), ids=_ids(io_cases("invalid")))
def test_refuses_every_invalid_io_answer(case: FixtureCase) -> None:
    with pytest.raises(ProtocolError):
        decode_io_mapping(json.loads(case.frame))


def test_decodes_the_fields_the_bridge_uses() -> None:
    valid = io_cases("valid")[0]

    mapping = decode_io_mapping(json.loads(valid.frame))

    assert mapping.status is IoStatus.VALID
    assert [module.key for module in mapping.modules] == ["m1", "m2"]
    assert mapping.modules[1].word_order is WordOrder.HIGH_WORD_FIRST
    assert mapping.modules[1].unit_id == 7
    assert len(mapping.rows) == 6
    encoder = mapping.rows_of("m2")[0]
    assert (encoder.zone, encoder.address, encoder.io_type) == (
        IoZone.INPUT_REGISTER,
        4,
        IoType.DINT,
    )


def test_decodes_the_path_of_a_problem_and_nests_channels_under_their_module() -> None:
    unreadable = decode_io_mapping(json.loads(io_cases("valid")[3].frame))

    assert [problem.path for problem in unreadable.problems] == [
        (),
        ("modules", 0, "transport", "port"),
    ]
    assert [problem.code for problem in unreadable.problems] == [
        "unreadable_file",
        "schema_invalid",
    ]
    valid = decode_io_mapping(json.loads(io_cases("valid")[0].frame))
    assert [row.tag for row in valid.rows_of("m2")] == ["axis.encoder.count"]


def test_refuses_a_bool_in_a_register_zone() -> None:
    document = json.loads(io_cases("valid")[0].frame)
    document["modules"][0]["channels"][0]["modbus"]["zone"] = "holding_register"

    with pytest.raises(ProtocolError, match="cannot sit in"):
        decode_io_mapping(document)


def test_the_bridge_builds_messages_the_fixtures_call_valid() -> None:
    sent = {
        "hello": bus_messages.encode_hello(
            "modbus_tcp_slave", "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
        ),
        "write": bus_messages.encode_write("w2", "axis.stroke.setpoint", 0.05),
        "plc_status": bus_messages.encode_plc_status("m1", connected=False, reason="timeout"),
        "subscribe": bus_messages.encode_subscribe(
            ["press.valve.extend", "press.cylinder.position"]
        ),
    }
    valid = [message_of(case) for case in bus_cases("client", "valid")]

    for kind, frame in sent.items():
        assert json.loads(frame) in [message for message in valid if message["type"] == kind]


def test_console_levels_equal_the_shared_fixture() -> None:
    # The fixture is checked against the Zod schema by the protocol tests (ADR 0045 point 2).
    assert dict(bus_messages._CONSOLE_LEVELS) == load_json("console-codes.json")


def _module_of_another_transport() -> dict[str, object]:
    return {
        "key": "far",
        "transport": {"kind": "carrier_pigeon", "loft": "north"},
        "channels": [{"tag": "press.valve.extend", "pigeon": {"ring": 3}}],
    }


def test_skips_a_module_of_a_transport_it_does_not_serve_and_keeps_the_others() -> None:
    document = json.loads(io_cases("valid")[0].frame)
    document["modules"].append(_module_of_another_transport())

    mapping = decode_io_mapping(document)

    assert [module.key for module in mapping.modules] == ["m1", "m2"]
    assert mapping.skipped_modules == (SkippedModule(key="far", kind="carrier_pigeon"),)
    assert all(row.module != "far" for row in mapping.rows)


def test_still_refuses_a_module_of_another_transport_without_a_key_or_channels_list() -> None:
    document = json.loads(io_cases("valid")[0].frame)
    broken = _module_of_another_transport()
    del broken["channels"]
    document["modules"].append(broken)

    with pytest.raises(ProtocolError):
        decode_io_mapping(document)
