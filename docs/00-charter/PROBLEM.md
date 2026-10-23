# Problem Statement

## Core problem

Work performed through coding agents is distributed across sessions, harnesses, tools, and transient context. The resulting decisions, procedures, partial progress, failures, and evidence are not always packaged in a portable and governed form. On handoff, a new agent may repeat work, misread an old conclusion as current, or use an unverified suggestion as if it were a trusted fact.

## Distinct failure modes

- **Continuity failure:** the next session lacks the state needed to resume.
- **Retrieval failure:** irrelevant or stale memories are injected into context.
- **Trust failure:** model-generated statements are mistaken for verified knowledge.
- **Attribution failure:** a failure is blamed on a Skill when the harness, tool, environment, policy, or model caused it.
- **Portability failure:** one harness's session conventions do not transfer to another.
- **Evolution failure:** one successful or failed run triggers a broad asset change without adequate evidence.
- **Governance failure:** a generated asset or persona is treated as permission to perform an action.

## Problem boundary

Nemons addresses continuity and governance across Coding Agents. It does not promise to solve model reasoning, replace agent harnesses, guarantee truth, or make every task fully autonomous.

## Required distinction

Memory is a durable, governed source. Context is a task-specific selection made through retrieval and curation. A handoff artifact is a delivery snapshot, not a new permanent memory category.
