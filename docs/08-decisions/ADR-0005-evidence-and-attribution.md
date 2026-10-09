# ADR-0005: Evidence, Provenance, and Failure Attribution

- **Status:** Accepted project invariant
- **Decision:** Material claims, outcomes, and candidate asset changes retain traceable source/version and relevant evidence. Failure analysis considers MODEL, HARNESS, SKILL, KNOWLEDGE, TOOL, POLICY, ENVIRONMENT, and UNKNOWN.
- **Context:** Failures cannot safely be attributed to the most visible asset alone; tests and judge results establish only what their method and scope support.
- **Consequences:** Link evidence to exact Run, asset/policy version, and decision. Passing a test does not prove task correctness; an LLM judge does not establish truth; one successful episode does not prove a general rule.
