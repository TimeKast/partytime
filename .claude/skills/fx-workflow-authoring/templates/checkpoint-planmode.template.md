# Checkpoint Plan Mode formal — Template

<!--
  ===== Cuándo usar este template =====
  CP2 (o checkpoint final): synthesis multi-fuente crítica. HIGH risk.
  Output durable que bloquea writes hasta approval del user.

  Mecanismo: Plan Mode formal entry → structured synthesis en plan buffer → Plan Mode exit.

  Pre-load: si las primitivas de Plan Mode son deferred en el runtime actual,
  el orchestrator debe cargarlas antes de invocar este checkpoint.
  El mecanismo concreto vive en docs del runtime; este template solo establece la estructura.

  Auto-advance (modo fluido — §7.1): un CP2 cuyo output NO es reversible NUNCA auto-avanza
  (HIGH-risk). Un CP2 sobre output REVERSIBLE (docs / issues regenerables) SÍ puede auto-aceptar
  sin señal real — el workflow lo declara explícito en su tabla checkpoint × modo, y entonces
  emite el "Plan de cierre" como resumen en vez de abrir Plan Mode formal.
-->

---

> **Estatus frente a la doctrina de presentación de opciones (`§7.0`): CONFORME — sin cambios.**
> Verificado: este template **no contiene ningún bloque de opciones** (`grep` de `1/2/3` / `### Opciones` / "respuesta numérica" → 0 resultados). Su "Plan de cierre" es una lista de action items, no un menú de decisión, y el gate de un CP2 sigue siendo **`ExitPlanMode`** (`CC.md §4`), que `§7.0` declara explícitamente que no se sustituye. No hay nada que migrar aquí.

## Estructura del plan buffer (6 secciones obligatorias)

El plan buffer en Plan Mode debe contener **synthesis genuina**, no checklist mecánico.

### 1. Findings synthesis (¿qué surfaced y qué importa?)

Lectura interpretativa de los inputs (subprocess outputs, gap rounds, source detections):

- **{{Source/lens 1}}** → ¿qué findings críticos? Agrupar por blast radius.
- **{{Source/lens 2}}** → ¿qué patterns surgieron?
- **{{Source/lens 3}}** → ¿qué gaps quedan?

NO repetir verdicts table — interpretar.

### 2. Cross-cutting impacts

Identificar findings que se afectan mutuamente:

- {{Impact 1: cómo finding A bloquea o condiciona finding B}}
- {{Impact 2}}
- {{Impact 3}}

Listar 3-5 cross-impacts críticos.

### 3. Sequencing rationale

¿En qué orden se deben atacar los items downstream? ¿Por qué? Justificar dependencies.

- {{Dependency 1}}
- {{Dependency 2}}

### 4. Risk-weighted prioritization

Top 3 risks post-{{phase}} con mitigation status (firm en output vs deferred a {{next-phase}} vs unresolved).

| Risk    | Severity         | Mitigation status            |
| ------- | ---------------- | ---------------------------- |
| {{...}} | High / Med / Low | Firm / Deferred / Unresolved |

### 5. Handoff packets per downstream phase

Qué necesita cada fase downstream del output actual:

- **`/{{next-1}}`:** {{qué inputs concretos}}
- **`/{{next-2}}`:** {{qué inputs concretos}}
- **`/{{next-3}}`:** {{qué inputs concretos}}

### 6. Plan de cierre Phase final (action items)

```markdown
## 🛑 CP{{N}} — Pre-Close Review

### Quantitative gate

{{Counts vs expected — ej: FT {X/Y} · BR {X/Y} · Entities {X/Y}}}

### Challenge / verification status

{{lens 1}} {✅/⚠️/🔴} · {{lens 2}} {✅/⚠️/🔴} · {{lens 3}} {✅/⚠️/🔴}
{{Stakeholder decisions resolved: N/M}}
{{ADRs identificados / pending: N}}

### Drift Report

{{items vs source: harmless / risky / unauthorized count}}

### Plan de cierre

1. {{action item 1}}
2. {{action item 2}}
3. {{action item N}}
```

---

## Verbose mode

Si user declaró `verbose=true`, ampliar cada sección con detalle (debugging / deep-review only).

---

## Post-approval contract

Una vez user aprueba via Plan Mode exit:

1. {{Acción concreta 1 — ej: "Brief canónico ya escrito en Phase 6 — verificar path"}}.
2. {{Acción concreta 2 — ej: "Generar project-config.md"}}.
3. {{Acción N — ej: "Cleanup transitional artifacts"}}.
4. **NO auto-commit.** Sugerir commit con autorización explícita del user (`GIT.md §2`).

---

_TimeKast Factory — checkpoint-planmode template (CP2 mecanismo)_
