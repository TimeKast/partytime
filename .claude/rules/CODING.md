---
trigger: always_on
---

# CODING — Discipline & Quality Rules

> Principios de código y hard limits. Extiende `CORE.md`. Aplica a TODO cambio de código.

---

## 1. Think Before Coding

- Leer issue/spec/contexto antes de tocar archivos
- Ante ambigüedad → preguntar antes de tocar código
- Formar hipótesis de causa raíz antes de proponer fix
- No codear por intuición en problemas que no entiendes — investiga primero

```
❌ "el botón no funciona" → editar onClick a ciegas
✅ Lee componente → traza handler → valida causa → propone fix
```

---

## 2. Simplicity First

- No abstracciones, generics o capas sin caso de uso real
- No pre-optimizar — optimiza con evidencia
- YAGNI: no anticipar requisitos futuros
- Tres líneas similares > abstracción prematura
- Código claro > código "elegante"

```
❌ `GenericFactory<T, U extends Base>` para 2 tipos concretos
✅ Dos funciones explícitas. Se abstrae cuando aparezca el tercer caso.
```

---

## 3. Surgical Changes

- Bug fix no incluye refactors adyacentes
- Feature no incluye "cleanup" no pedido
- No renombrar, mover ni reformatear fuera del scope
- Deuda técnica adyacente → anótala, no la toques en este PR

```
❌ PR "fix auth bug" con 400 líneas en 15 archivos
✅ PR "fix auth bug" con 12 líneas en 1-2 archivos + issue aparte para la deuda
```

---

## 4. Goal-Driven Execution

- Antes de cada edit: "¿esto me acerca al objetivo del request?". Si "no" → no lo hagas
- Si encuentras un camino mejor → explica y pide decisión, no ejecutes unilateralmente
- Completar **esto** antes de abrir otra dirección

```
❌ "agrega un toast al guardar" → agente además reestructura el form
✅ "agrega un toast al guardar" → agrega toast y STOP
```

---

## 5. 🔴 NUNCA hardcodear valores

```
❌ PROHIBIDO: Valores mágicos en código (URLs, colores, tamaños)
✅ OBLIGATORIO: Usar constantes, config files, o CSS variables
ℹ️  Textos de UI: viven en el componente; a una constante solo si se repiten
```

---

## 6. 🔴 NUNCA marcar completo sin verificar

```
❌ PROHIBIDO: Decir "feature completa" sin verificar
✅ OBLIGATORIO: Confirmar que pre-commit pasó o ejecutar manualmente
```

---

## 7. Instalar dependencias → gate del harness (ASK), no hard-block

Instalar deps requiere aprobación, pero vía el **gate del harness** (tier `ask` en `settings.json`:
`pnpm install`/`add`/`remove`), no un bloqueo de regla. El prompt **es** la autorización.

```
✅ OBLIGATORIO: Proponer la dependencia + justificación; el harness pide confirmación (tier ASK) → aprobar/rechazar en el prompt
ℹ️  Headless (sin TTY): el ASK no tiene quién responda → bloquea de facto. Una corrida headless no instala deps a ciegas (intencional).
❌ PROHIBIDO: Bypassear el gate. Daños reales irreversibles (db:push) siguen en DENY (hard-block), no en ASK.
```

---

## 8. 🔴 NUNCA inventar business rules o modelo de datos

```
❌ PROHIBIDO: Asumir reglas de negocio que no están en project/planning/
❌ PROHIBIDO: Crear tablas, columnas o entidades que no están en la documentación
✅ OBLIGATORIO: Consultar project/planning/ antes de cualquier cambio al modelo de datos
✅ OBLIGATORIO: Si algo no está documentado → preguntar al usuario
```

---

_TimeKast Factory — Coding Rules (L1 Peer)_
