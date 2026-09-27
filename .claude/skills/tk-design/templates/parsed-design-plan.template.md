# Parsed design plan: {{filename}}

> **Frozen day-2 parse (orchestrator-direct, Phase 0.5).** This is the authoritative decomposition for the run — downstream phases (Phase 1 dispatch, Phase 3-delta index reconcile, Phase 5 specers) **read** this artifact; none re-derives the classification or attribution. A content change to the plan is the only re-parse signal.
>
> **Produced by:** `tk-design` orchestrator Phase 0.5 (day-2 parser). **Path:** `project/design-artifacts/{run-id}/parsed-design-plan.md`.
>
> **Shared vs own:** Step 1 — unit detection is **shared** with `tk-backlog` (cross-ref `.claude/skills/tk-backlog/methodology/plan-mode-input.md §Step 1`; same mechanics). Classification (`ui-unit` / `non-ui-unit` / `prose`) and attribution (unit → screen(s) by route) are **own** to design — spec in `.claude/skills/tk-design/methodology/day2-plan-input.md`.

---

## Header (frozen metadata)

```yaml
source: { absolute path to the plan file }
hash: { SHA-256 of the full plan file bytes } # drift detection — re-hashed (never re-parsed) on a mid-run edit; §21
parsed_at: { ISO timestamp }
needs_seed: { true | false } # Phase 0 set this — 16_DESIGN.md absent → Phase 2-seed runs first
units_detected: { U } # Step 1 — unit detection (shared)
ui_units: { N } # classified ui-unit (each attributed to ≥1 screen)
non_ui_units: { M } # classified non-ui-unit (component-only / no page) — surfaced, not screen-attributed
prose_skipped: { U - N - M } # process headings (Context / Verification / Risks …)
```

> **Hash & re-entry:** SHA-256 of the full file bytes. On a mid-run plan edit, the orchestrator **re-hashes** and diffs the affected screens — it does NOT re-parse from scratch (`SKILL.md §21`). On a STOP, the run re-enters with a new run-id; an unchanged plan re-parses deterministically to the same attribution.

---

## §1 Context (narrative, by content)

> The plan's narrative body, read by content (any heading). Source for each emitted SCR's purpose framing. Not a magic heading match.

{ narrative context body }

---

## §2 UI units (frozen decomposition)

> One block per classified `ui-unit`. Each has ≥1 attributed screen (a `ui-unit` with no resolvable screen STOPs the parse — `day2-plan-input.md`). `day2_action` (nueva / regenerar / backfill) is assigned downstream in Phase 4 day-2 classification (DSGN-002) — left blank here.

```yaml
- unit_title: { from the unit heading }
  body: { the unit's prose — source for the SCR delta + purpose }
  screens:
    - route: /(protected)/{ ... } # attributed by route (primary); slug fallback when no route resolvable
      slug: { ... }
      as_built: { src/app/(protected)/.../page.tsx — file on disk if existing, or "new" if the plan adds it }
      day2_action: { '' } # assigned in Phase 4 (DSGN-002): nueva | regenerar | backfill
      scr_id: { '' } # assigned in Phase 3-delta index reconcile (max+1 of §3); blank until reconciled
```

---

## §3 Non-UI units (surfaced, not screen-attributed)

> Classified `non-ui-unit` — implementable changes with no new page (component-only edits, backend, copy). Surfaced for the user, never screen-attributed. A plan with **zero** ui-units exits with a redirect to `/backlog add` (`day2-plan-input.md`).

```yaml
- unit_title: { ... }
  body: { ... }
  reason: { why classified non-ui — e.g. "component-only, no page file" }
```

---

## §4 Override tombstones (append-only)

> Append-only log of action overrides made at CP3 (Phase 3-delta / Phase 4 day-2). A tombstone records the superseded decision; the live decision lives in §2. Never rewritten — only appended (`SKILL.md §21`).

```yaml
tombstones:
  # Example entry (append-only):
  - scr_id: SCR-{{NN}}
    field: day2_action
    from: backfill
    to: regenerar
    reason: { user override at CP3 — why }
    timestamp: { ISO timestamp }
```

---

## §5 Provenance

```yaml
sources_consulted:
  - { plan file path }
  - project/config (project-config.md)
  - src/app/ tree (as-built page files)
  - project/planning/16_DESIGN.md (§3 Screen Map — for max-ID read in Phase 3-delta)
shared_step1_ref: .claude/skills/tk-backlog/methodology/plan-mode-input.md#step-1--unit-detection
classify_attribute_ref: .claude/skills/tk-design/methodology/day2-plan-input.md
generated_at: { ISO timestamp }
```

---

_TimeKast Factory — tk-design template · parsed-design-plan (Phase 0.5 day-2 parse, frozen)_