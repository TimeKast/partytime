---
name: fx-{slug}
# description = trigger surface, EN-only, single-line. fx-* may note whether it ships to
# derivatives (via the fx-* glob) or is origin-only — but the prefix does NOT decide shipping.
description: Factory-internal {tool/doctrine} for {what it operates or builds in the kit} — {2-4 capabilities}. Invoke when {user-prompt-shaped trigger}. {boundary / NOT-for}.
family: factory-internal
last-verified: { YYYY-MM-DD } # today
# Optional, only if true:
# model: opus           # heavy reasoning at authoring/operation time
# authoring_time: true  # loaded when building, not at app runtime
# runtime: false        # not loaded when a derived app runs
---

# fx-{slug} — {Title in English}

> **Propósito:** {what doctrine/operation this captures}.
>
> **{NO es runtime — se carga al construir/operar el kit, no al ejecutar la app. | Ships to derivatives via the fx-* glob. | Origin-only — no viaja a derivados.}**
>
> **Boundary:** {what closely-related thing is OUT of scope and where it lives}.

---

## §1 ¿Cuándo se auto-carga?

Routing semántico (CC.md §1.1). Triggers típicos:

- "{trigger phrase 1}", "{trigger phrase 2}"
- Edición de {paths that signal this domain}

**NO se carga cuando:** {adjacent domain} → {the right skill}.

---

## §2 {Doctrina / Comandos / Invariants}

<!-- For an operational tool: command table. For doctrine: numbered rules. -->

| Comando / Regla            | Qué hace / Invariante                         |
| -------------------------- | --------------------------------------------- |
| `{cmd}`                    | {effect}                                       |

<!-- repeat §3..§N as needed -->

---

## §N Checks / Invariants antes de cerrar

- [ ] {check 1}
- [ ] {check 2}

---

## §N+1 Boundary

| Si vas a…                       | Usa en su lugar…                  |
| ------------------------------- | --------------------------------- |
| {adjacent task}                 | {the right skill/agent}           |

---

_TimeKast Factory — fx-{slug} ({one-line domain}, factory-internal)_

<!--
AUTHORING NOTES (delete before commit):
- body AHISTORICAL: no version tags, no journey narrative, no client names (fx-skill-author §8).
- description: 3-prompt routing test (fx-skill-author §6).
- close with: pnpm skill:lint → 0 errors.
-->
