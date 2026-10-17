"""Typed errors of the bridge. Each message says what to do next (CLAUDE.md section 8.6)."""


class BridgeError(Exception):
    """Base of every error the bridge raises on purpose; the command line prints its message."""


class ConfigurationError(BridgeError):
    """A command line value breaks the security rules of ADR 0004 or 0046."""


class ProtocolError(BridgeError):
    """The core sent something the bridge's hand-written decoders refuse."""


class UnknownConsoleCodeError(ProtocolError):
    """A console entry of a code this bridge does not know: a newer core, harmless to skip."""


class CoreUnavailableError(BridgeError):
    """The core could not be reached, or refused the bridge."""


class MappingNotValidError(BridgeError):
    """The Pantin has no valid I/O mapping: there is nothing to bridge."""


class MappingChangedError(BridgeError):
    """The Pantin's tags changed (io_changed): the mapping the bridge serves may be stale."""


class BusClosedError(BridgeError):
    """The tag bus is gone or unusable: the bridge cannot go on and must be started again."""
