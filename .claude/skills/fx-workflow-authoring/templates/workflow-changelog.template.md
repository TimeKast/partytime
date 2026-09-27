# {{workflow-name}} — Changelog

> Audit trail for the `/{{command}}` workflow and its supporting files (skill body, methodology, templates, scoped subprocesses). Convention: [Keep a Changelog](https://keepachangelog.com).
>
> **Scope rule:** `fx-workflow-authoring §11` decides which workflows carry a CHANGELOG — this header only points there (for declarative skills the authority is `fx-skill-author §8`). Body stays ahistorical; evolution lives here.

---

## [Unreleased] — date TBD upon merge

### Added

- **R{{N}}** {{New behavior with section reference. See SKILL.md §{{N}}.}}

### Changed

- **R{{N}}** {{Modified behavior with reasoning. See SKILL.md §{{N}}.}}

### Deprecated

- {{Behavior still works but slated for removal next release. Replacement: {{...}}.}}

### Removed

- {{Deleted behavior. Reason: {{...}}.}}

### Fixed

- {{Bug fix. Symptom: {{...}}. Root cause: {{...}}.}}

### Rationale

{{Brief paragraph explaining the post-mortem or observation that drove this set of changes. Generic phrasing — no specific project names or calibration IDs.}}

### Verification path

- {{How to verify the change took effect — grep, behavioral check, file existence, etc.}}

---

## How to add an entry

When making a change to `SKILL.md`, `methodology.md`, `templates/*.md`, or scoped `agents/{{prefix}}-*.md`:

1. Choose semantic version slot under `[Unreleased]` if no release is scheduled, or create a new versioned section above (e.g., `## [1.1.0] — 2026-MM-DD`).
2. Bucket the change: **Added** / **Changed** / **Deprecated** / **Removed** / **Fixed** / **Security**.
3. Write the entry as a behavior delta — what the workflow does now that it didn't do before. Generic phrasing.
4. Reference the exact section/file modified (e.g., `See SKILL.md §Phase N`).
5. If the change has user-visible consequences during a `/{{command}}` run, note them under "Verification path."

---

_TimeKast Factory — {{workflow-name}} CHANGELOG_
