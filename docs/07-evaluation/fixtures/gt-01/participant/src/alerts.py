"""Alert selection utility used by the GT-01 continuation fixture."""

from __future__ import annotations

from typing import Any

SEVERITY_RANK = {
    "info": 1,
    "warning": 2,
    "critical": 3,
}


def select_alerts(
    events: list[dict[str, Any]],
    minimum_severity: str = "warning",
) -> list[dict[str, Any]]:
    """Select dashboard alerts at or above minimum_severity.

    Return selected events in newest-first order. The implementation is
    intentionally incomplete for the GT-01 continuation exercise.
    """
    if minimum_severity not in SEVERITY_RANK:
        raise ValueError(f"Unknown minimum severity: {minimum_severity}")

    # TODO: filter by severity, validate records, and order by timestamp.
    return []
