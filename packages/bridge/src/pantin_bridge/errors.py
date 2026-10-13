"""Typed errors of the bridge. Each message says what to do next (CLAUDE.md section 8.6)."""


class BridgeError(Exception):
    """Base of every error the bridge raises on purpose; the command line prints its message."""


class ConfigurationError(BridgeError):
    """A command line value breaks the security rules of ADR 0004 or 0046."""


class ProtocolError(BridgeError):
    """The core sent something the bridge's hand-written decoders refuse."""


class CoreUnavailableError(BridgeError):
    """The core could not be reached, or refused the bridge."""


class MappingNotValidError(BridgeError):
    """The Pantin has no valid I/O mapping: there is nothing to bridge."""


class RestartRequiredError(BridgeError):
    """The bridge ran on a mapping or a bus that is gone: stop and start it again."""
