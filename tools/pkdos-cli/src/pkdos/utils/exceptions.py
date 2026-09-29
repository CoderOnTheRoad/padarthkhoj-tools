class PkdosError(Exception):
    """Base exception for pkdos."""


class SummaryFormatError(PkdosError):
    """Raised when a summary file has an invalid format."""
