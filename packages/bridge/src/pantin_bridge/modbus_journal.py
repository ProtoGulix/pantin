"""What one Modbus connection did, as log lines (ADR 0054 point 3).

The PLC side of a failed test is only visible here: which requests it sent and which we
refused. The decision to refuse stays in modbus_pdu.py, which does not log; this class turns a
`Refusal` into one line, once per distinct request per connection, and counts the rest.
"""

from __future__ import annotations

import logging
from typing import Final

from pantin_bridge.modbus_pdu import PduResult, Refusal

_log = logging.getLogger(__name__)

_RefusalKey = tuple[int, int, int | None, int | None, int]

# A PLC scanning addresses would otherwise write one line, and one console entry, per address.
MAX_LOGGED_REFUSALS: Final = 100


def describe_refusal(refusal: Refusal) -> str:
    text = (
        f"unit {refusal.unit_id}, function {refusal.function_code}, "
        f"address {_or_unknown(refusal.address)}, quantity {_or_unknown(refusal.quantity)}"
        f" -> {refusal.exception.name} ({int(refusal.exception)})"
    )
    if refusal.unit_id != refusal.expected_unit_id:
        text += f"; this module answers unit {refusal.expected_unit_id}"
    return text


def _or_unknown(value: int | None) -> str:
    return "?" if value is None else str(value)


class ConnectionJournal:
    """Counts and logs the requests of one accepted connection."""

    def __init__(self, module_key: str, source: str) -> None:
        self._module_key = module_key
        self._source = source
        self._answered = 0
        self._refused = 0
        self._logged: set[_RefusalKey] = set()
        self._capped = False

    def opened(self) -> None:
        _log.info("Module %s accepted a connection from %s.", self._module_key, self._source)

    def request_handled(self, result: PduResult) -> None:
        refusal = result.refusal
        if refusal is None:
            self._answered += 1
            return
        self._refused += 1
        key = (
            refusal.unit_id,
            refusal.function_code,
            refusal.address,
            refusal.quantity,
            int(refusal.exception),
        )
        if key in self._logged or self._capped:
            return
        if len(self._logged) == MAX_LOGGED_REFUSALS:
            self._capped = True
            _log.warning(
                "Module %s: more than %d distinct requests from %s refused; "
                "the next ones are only counted.",
                self._module_key,
                MAX_LOGGED_REFUSALS,
                self._source,
            )
            return
        self._logged.add(key)
        _log.warning(
            "Module %s refused a request from %s: %s.",
            self._module_key,
            self._source,
            describe_refusal(refusal),
        )

    def closed(self, reason: str) -> None:
        _log.info(
            "Module %s closed the connection from %s (%s): %d requests answered, "
            "%d refused (%s%d distinct).",
            self._module_key,
            self._source,
            reason,
            self._answered,
            self._refused,
            "more than " if self._capped else "",
            len(self._logged),
        )
