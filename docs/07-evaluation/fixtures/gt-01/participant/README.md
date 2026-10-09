# Alert Selector

Small standard-library-only Python task. No network access or third-party dependencies are required.

## Task

Implement `select_alerts(events, minimum_severity)` in `src/alerts.py`.

The function should return the alerts relevant to a dashboard at or above the requested minimum severity, with the newest alerts first. Preserve the original event dictionaries and do not mutate the input list.

Run the public tests with:

```sh
python -m unittest discover -s tests -v
```

The starter implementation is intentionally incomplete. Do not add dependencies.
