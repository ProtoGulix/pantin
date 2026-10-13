"""The watchdog state machine of ADR 0045 point 11, with an injected clock."""

from __future__ import annotations

import pytest

from pantin_bridge.watchdog import DisconnectReason, ModuleWatchdog, StatusChange

CONNECTED = StatusChange(connected=True, reason=None)


def test_starts_disconnected_and_connects_at_the_first_served_request() -> None:
    watchdog = ModuleWatchdog(1.0)
    watchdog.connection_opened()

    assert not watchdog.connected
    assert watchdog.request_served(10.0) == CONNECTED
    assert watchdog.connected


def test_an_open_connection_without_a_request_is_not_connected() -> None:
    watchdog = ModuleWatchdog(1.0)
    watchdog.connection_opened()

    assert watchdog.check_timeout(100.0) is None
    assert watchdog.connection_closed() is None


def test_later_requests_change_nothing() -> None:
    watchdog = ModuleWatchdog(1.0)
    watchdog.connection_opened()
    watchdog.request_served(0.0)

    assert watchdog.request_served(0.5) is None


def test_expires_after_the_watchdog_time_without_a_request() -> None:
    watchdog = ModuleWatchdog(1.0)
    watchdog.connection_opened()
    watchdog.request_served(0.0)

    assert watchdog.check_timeout(0.99) is None
    assert watchdog.check_timeout(1.0) == StatusChange(False, DisconnectReason.TIMEOUT)
    assert watchdog.check_timeout(5.0) is None


def test_each_request_restarts_the_time() -> None:
    watchdog = ModuleWatchdog(1.0)
    watchdog.connection_opened()
    watchdog.request_served(0.0)
    watchdog.request_served(0.9)

    assert watchdog.check_timeout(1.5) is None
    assert watchdog.check_timeout(2.0) is not None


def test_a_request_after_a_timeout_connects_again() -> None:
    watchdog = ModuleWatchdog(1.0)
    watchdog.connection_opened()
    watchdog.request_served(0.0)
    watchdog.check_timeout(2.0)

    assert watchdog.request_served(3.0) == CONNECTED


def test_closing_the_last_connection_disconnects_with_reason_closed() -> None:
    watchdog = ModuleWatchdog(1.0)
    watchdog.connection_opened()
    watchdog.request_served(0.0)

    assert watchdog.connection_closed() == StatusChange(False, DisconnectReason.CLOSED)


def test_closing_one_of_two_connections_keeps_the_module_connected() -> None:
    watchdog = ModuleWatchdog(1.0)
    watchdog.connection_opened()
    watchdog.connection_opened()
    watchdog.request_served(0.0)

    assert watchdog.connection_closed() is None
    assert watchdog.connected
    assert watchdog.connection_closed() == StatusChange(False, DisconnectReason.CLOSED)


def test_closing_after_a_timeout_reports_nothing_more() -> None:
    watchdog = ModuleWatchdog(1.0)
    watchdog.connection_opened()
    watchdog.request_served(0.0)
    watchdog.check_timeout(2.0)

    assert watchdog.connection_closed() is None


def test_a_close_without_an_open_is_a_bug() -> None:
    with pytest.raises(ValueError, match="never opened"):
        ModuleWatchdog(1.0).connection_closed()


def test_refuses_a_zero_watchdog_time() -> None:
    with pytest.raises(ValueError, match="positive"):
        ModuleWatchdog(0)
