# Checkpoint inline — Template (auto-advance fluido / STOP)

<!--
  ===== Cuándo usar este template =====
  CP1 conversational review post-context-load. LOW-MEDIUM risk reversible.
  Modo DEFAULT = fluido: auto-advance con resumen sin señal real.
  Cae a STOP (imprimir bloque + esperar respuesta) ante señal real o `--step`.
  Ejes y criterio de señal real: §7.1 de fx-workflow-authoring/SKILL.md.

  NO usar este template para CP2 — para synthesis multi-fuente HIGH-risk
  usar `checkpoint-planmode.template.md` (Plan Mode formal).
-->

---

## Auto-advance mode (fluido — DEFAULT interactivo)

Modo fluido (default) + **sin señal real** (§7.1): NO imprimir tabla 1/2/3 ni esperar respuesta. Emitir un
resumen breve y continuar a la fase siguiente.

```markdown
✅ CP{{N}} — {{Nombre}}: sin señal → continúo a Phase {{N+1}}.
   {{1 línea esencial — qué se validó / qué sigue}}.
```

Cae a **Compact mode (STOP)** abajo si hay **señal real** (algo falla · ambigüedad · HIGH-risk/irreversible ·
decisión sin default obvio) o el user invocó `--step`. En modo verbose, el resumen se amplía sin parar.

---

## Compact mode (STOP — señal real o `--step`)

```markdown
## 🛑 CP{{N}} — {{Nombre del checkpoint}}

### Critical signals (top 3 max)

- {{signal 1 con impacto concreto}}
- {{signal 2}}
- {{signal 3}}

### Plan de continuación

{{1-2 oraciones describiendo Phase N+1..N+K — qué hace cada fase, qué subprocesses corren, qué paralelismo}}.

### Opciones

| #   | Acción                                     |
| --- | ------------------------------------------ |
| 1   | continuar a Phase {{N+1}}                  |
| 2   | ajustar {{X}} antes de continuar           |
| 3   | ahondar en {{Y-id}} (sub-ronda focalizada) |
```

> **Cómo se presentan estas tres opciones** → [`SKILL.md §7.0`](../SKILL.md). Con `AskUserQuestion` disponible van estructuradas (default interactivo) y el bloque de arriba es la **presentación** del contexto; sin la tool, la tabla ES la vía y se espera **respuesta numérica** — no aceptar "ok" / "sí" / "procede" libres, re-presentar si llega texto libre. **Headless: ninguna de las dos** — el CP resuelve por su fail-open/fail-closed declarado y **no intenta** la tool (sin usuario bloquea).

---

## Verbose mode (solo si user declaró `verbose=true` en Phase 0)

```markdown
## 🛑 CP{{N}} — {{Nombre del checkpoint}} (verbose)

### Coverage map (qué se cubrió en las fases anteriores)

| Sección | Estado       | Notas   |
| ------- | ------------ | ------- |
| {{...}} | 🟢 / 🟡 / 🔴 | {{...}} |

### Critical signals

- {{signal 1 expandido con contexto}}
- {{...}}

### Plan detallado de continuación

**Phase {{N+1}}** — {{título}}

- Acciones: {{...}}
- Subprocesses: {{...}}
- Output esperado: {{...}}

**Phase {{N+2}}** — {{...}}

### Invalidation rules (qué triggers re-trabajo de fases anteriores)

- {{trigger 1}} → {{acción}}
- {{trigger 2}} → {{acción}}

¿Procedo, o ajustas algún punto antes?
```

---

## 🔴 Regla de invalidación

Si durante el CP el user aporta info que invalida una fase anterior, regresar a la fase correspondiente ANTES de re-presentar el plan:

- **{{Trigger A}}** → re-ejecutar Phase {{X}} → re-presenta CP
- **{{Trigger B}}** → actualiza scratchpad → re-ejecuta Phase {{Y}}
- **{{Trigger C}}** → resuelve en este CP sin rebote

Cuando el CP **para** (modo STOP — señal real o `--step`): solo tras una **elección explícita** del user entre las tres opciones → siguiente fase. Por la vía estructurada, la elección es la respuesta de la tool; por el fallback de tabla, la respuesta numérica (`1`, `2` o `3`) — y ahí texto libre (`ok`, `sí`, `procede`) NO cuenta como aprobación: re-presentar las opciones. En **auto-advance** (fluido sin señal) no hay respuesta que esperar — el resumen ya es el registro.

---

## Sub-ronda opcional ("3 = ahondar en X")

Cuando el checkpoint cierra batches o sub-procesos, ofrecer:

```
1=continuar / 2=revisar OQs / 3=ahondar en {{X-id}}
```

La opción 3 abre un sub-batch focalizado sin avanzar al siguiente CP. Es flujo normal, no edge case.

---

_TimeKast Factory — checkpoint-inline template (CP1 mecanismo)_
