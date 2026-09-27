<!--
  ===== tk-preflight: Readiness Report template =====
  Shape del output de scripts/tools/preflight.ts (stdout, no archivo durable por default).
  El script es el SSOT — este template documenta el shape, no se llena a mano.

  Severidades: 🔴 critical · 🟠 high · 🟡 warn · 🔵 info · ✅ ok · ⚪ N/A
  Veredicto: ✅ READY · 🟡 READY-WITH-WARNINGS · 🔴 NOT-READY
  Bloqueantes (pueden producir NOT-READY): dep audit (high/critical) y migrations (high).
  Advisory (capean en 🟡, nunca bloquean): knip, bundle size, Lighthouse.
  Como gate de /deploy (Phase 1.6 de tk-deploy): NOT-READY bloquea el merge.
-->

# Preflight readiness — {{✅ READY | 🟡 READY-WITH-WARNINGS | 🔴 NOT-READY}}

| Check | Tier | Severidad | Resultado |
| --- | --- | --- | --- |
| Dead code (knip) | T1 | {{icon}} | {{summary}} |
| Dep audit (pnpm audit) | T1 | {{icon}} | {{summary}} |
| Migrations (drizzle-kit check) | T1 | {{icon}} | {{summary}} |
| Bundle size | T1 | {{icon}} | {{summary}} |
| Lighthouse | T2 | {{icon}} | {{summary}} |

## Detalle

{{Por cada check con findings — severidad + nombre + bullets (counts, paths, comando para el detalle completo). Checks ✅/⚪ sin findings no aparecen acá.}}

### {{icon}} {{check name}}

- {{detail line}}
- {{comando para profundizar, ej. `pnpm audit` / `pnpm knip` / `pnpm analyze`}}
