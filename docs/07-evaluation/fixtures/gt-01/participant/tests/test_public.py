"""Public smoke tests for the GT-01 fixture.

Detailed edge-case acceptance criteria are maintained separately for the
evaluator and must not be copied into the participant workspace.
"""

import unittest

from src.alerts import select_alerts


class SelectAlertsPublicTests(unittest.TestCase):
    def test_filters_below_minimum_severity(self):
        events = [
            {"id": "a", "severity": "info", "timestamp": "2026-01-01T10:00:00Z"},
            {"id": "b", "severity": "warning", "timestamp": "2026-01-01T11:00:00Z"},
            {"id": "c", "severity": "critical", "timestamp": "2026-01-01T12:00:00Z"},
        ]

        result = select_alerts(events, "warning")

        self.assertEqual([event["id"] for event in result], ["b", "c"])

    def test_newest_first(self):
        events = [
            {"id": "older", "severity": "critical", "timestamp": "2026-01-01T09:00:00Z"},
            {"id": "newer", "severity": "critical", "timestamp": "2026-01-01T10:00:00Z"},
        ]

        result = select_alerts(events, "critical")

        self.assertEqual([event["id"] for event in result], ["newer", "older"])


if __name__ == "__main__":
    unittest.main()
