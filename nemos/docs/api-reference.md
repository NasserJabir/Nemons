# Nemons API Reference

Base URL: `http://127.0.0.1:3456`

## Endpoints

### `GET /health`
Returns daemon health status.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 12.5,
  "timestamp": "2026-10-22T08:46:48.308Z",
  "config_loaded": true,
  "home": "/home/user/.nemons"
}
```

### `GET /metrics`
Returns daemon metrics.

**Response:**
```json
{
  "runs_total": 0,
  "experiences_total": 5,
  "verification_pass_rate": 1.0,
  "daemon_memory_mb": 69,
  "daemon_uptime_seconds": 12.5
}
```

### `POST /analyze`
Analyzes a prompt to decide if Nemons should intercept.

**Request:**
```json
{
  "prompt": "implement a hello world function",
  "project_root": "/path/to/project",
  "adapter": "opencode"
}
```

**Response (intercept):**
```json
{
  "should_intercept": true,
  "reason": "intercept_pattern_matched",
  "pattern": "build|implement|add|create|make",
  "suggested_pack_id": "default",
  "similar_experiences": [
    { "id": "exp-abc123", "relevance": 0.75, "prompt": "..." }
  ]
}
```

**Response (skip):**
```json
{
  "should_intercept": false,
  "reason": "prompt_too_short"
}
```

### `GET /context-pack/:id`
Returns a context pack by ID.

**Response:**
```json
{
  "id": "auth-feature",
  "persona": {
    "role": "Senior Auth Engineer",
    "constraints": ["OAuth 2.1 required"]
  },
  "skills": [
    { "id": "jwt-validation", "reference": "skills/jwt.md" }
  ],
  "knowledge": ["We use idempotency keys"],
  "success_criteria": ["tests pass", "no secrets in diff"]
}
```

### `POST /evidence`
Stores evidence for a run (with automatic redaction).

**Request:**
```json
{
  "run_id": "run-abc123",
  "evidence": {
    "diff": "...",
    "test_results": { "passed": true, "count": 5 },
    "lint_results": { "errors": 0 }
  }
}
```

**Response:**
```json
{
  "stored": true,
  "run_id": "run-abc123",
  "redacted": true
}
```

### `POST /evaluate`
Runs the verification loop on collected evidence.

**Request:**
```json
{
  "run_id": "run-abc123",
  "evidence": {
    "tests_pass": true,
    "no_syntax_errors": true
  }
}
```

**Response (passed):**
```json
{
  "passed": true,
  "level": "must",
  "failures": [],
  "experience_stored": "exp-xyz789"
}
```

**Response (failed):**
```json
{
  "passed": false,
  "level": "must",
  "failures": [
    { "check": "tests_pass", "expected": true, "actual": false }
  ],
  "experience_stored": null
}
```

### `GET /experiences`
Lists stored experiences.

**Query params:** `limit` (default 10)

**Response:**
```json
{
  "total": 5,
  "experiences": [
    {
      "id": "exp-abc123",
      "timestamp": "2026-10-22T08:46:48.308Z",
      "prompt": "...",
      "evidence": { ... }
    }
  ]
}
```

### `POST /experiences`
Manually store a new experience.

**Request:**
```json
{
  "prompt": "...",
  "evidence": { ... },
  "adapter": "opencode",
  "derived_skills": ["skill-1"]
}
```

**Response:**
```json
{
  "stored": true,
  "id": "exp-xyz789"
}
```

### `GET /governance/rules`
Returns loaded governance rules.

**Response:**
```json
{
  "change_categories": [
    { "id": "low", "auto_approve": true, ... },
    { "id": "medium", "requires_approval": 1, ... },
    { "id": "high", "requires_approval": 2, ... }
  ]
}
```

### `POST /sessions/start` and `POST /sessions/end`
Audit endpoints for session tracking.

## Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (missing fields) |
| 401 | Unauthorized (bearer token required) |
| 404 | Resource not found |
| 500 | Internal server error |
