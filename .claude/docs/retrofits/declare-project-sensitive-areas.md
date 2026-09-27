# Retrofit — declara las áreas sensibles de tu proyecto

> **Aplica si:** tu proyecto tiene áreas sensibles que el kit no conoce (pagos, PII, salud, dominio propio).
> **Cuesta:** una sesión corta con el agente y un archivo JSON nuevo, dev-owned.
> **Devuelve:** el criterio de negocio de **tu** proyecto declarado junto al registry de gates del
> kit, visible y revisable en cada PR — y validado en pre-commit para que solo pueda endurecer.
> **Por qué no llega solo:** clasificar un área como sensible es **juicio de negocio**
> (`CODING.md §8`). El kit shippea el piso genérico — schema, auth, server actions — pero no puede
> saber que en tu app `src/features/payments/**` mueve dinero. Esa decisión es tuya, y
> `factory update` nunca la va a tomar por ti.
> **Disponible desde:** kit `v12.0`

## El punto de partida — dos archivos, dos dueños

El kit trae un registry de gates de calidad: qué nivel de riesgo (0-4) dispara un cambio según los
paths que toca, y qué revisores le corresponden. Viven **lado a lado** en el mismo directorio:

| Archivo                                      | Dueño            | Qué es                                                                                     |
| -------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `.claude/policy/quality-gates.json`          | **el kit**       | El piso genérico. Territorio trackeado (`CORE.md §5`) — solo-lectura para ti; se refresca con cada `factory update` |
| `.claude/policy/quality-gates.project.json`  | **tu proyecto**  | Tu override. Patrón `*.project.*` (el mismo de `.husky/pre-commit.project`) — excluido de los perfiles de distribución: el update nunca lo ve, nunca lo pisa |

El piso genérico ya cubre lo que **todo** proyecto Next comparte: `src/lib/db/schema/**` y las
migraciones son riesgo 3, `src/lib/auth/**` y `src/config/roles.ts` son riesgo 4, todo `src/**`
tiene un piso de riesgo 2. Lo que el piso **no** puede cubrir es tu dominio: el módulo de cobros,
la tabla con datos personales, la integración con la aseguradora. Para eso existe el override.

## Qué hace hoy — y qué todavía no

Vale decirlo sin adornos, porque es la parte que decide tus expectativas:

- **El override ya se lee en runtime — por los gates de cierre de `/implement`.** Escribir una regla
  aquí agrega escrutinio desde la próxima corrida: el gate de cierre de epic la agrega vía la unión
  kit ∪ override (`fx-execution-policy §4.2` — `risk = máximo`, `require = unión`), igual que su
  micro-gate de área sensible y su post-hoc. Además queda **declarada, visible y revisable** — el
  archivo se commitea y aparece en el PR como cualquier otro cambio. Qué lee cada consumidor hoy
  (y qué evalúa cada consumidor, incluida la plan-time de CP-A) → `fx-execution-policy §4.3` y `§6`.
- **El fail-safe es total, en las dos direcciones.** Sin acción tuya nada se rompe: el piso
  genérico del kit (`quality-gates.json`) sigue aplicando exactamente igual. Y declarar tampoco
  rompe nada: el override es estrictamente aditivo — solo puede subir riesgo o sumar revisores,
  nunca relajar el piso del kit; la entrada vale además como declaración revisable,
  no como cobertura.

El detalle completo del modelo (la escala 0-4, la agregación de reglas, el bloque `review`) vive
en la skill [`fx-execution-policy`](../../skills/fx-execution-policy/SKILL.md) (§4.2 para el
override) — viaja contigo en los dos perfiles.

## La regla: solo endurece, nunca relaja

El piso del kit es un piso. Tu override puede:

- **Subir** el `risk` de un path que el kit ya cubre.
- **Sumar** revisores al `require` de un predicado.
- **Declarar** áreas sensibles nuevas que el kit genérico no conoce.

No puede bajar un nivel ni quitar un revisor que el kit exige — y no es solo convención: la
agregación es `risk = máximo` / `require = unión`, así que una regla tuya "más floja" que la del
kit es matemáticamente inerte (el linter te la marca como warning para que no cargues peso
muerto). En el bloque `review`, donde no hay agregación que te salve, aflojar (volver un revisor
`informative`, bajar `clean_rounds`, relajar el `severity_floor`) es directamente **error**.

## Cómo correrlo — con el agente

Este retrofit no es "copia este JSON": es una conversación corta. El agente **propone**; la
clasificación la apruebas **tú** — un área sensible mal clasificada por un agente que no conoce tu
negocio es exactamente el error que `CODING.md §8` prohíbe.

1. Pídele al agente algo como:

   > Lee `.claude/docs/retrofits/declare-project-sensitive-areas.md` y
   > `fx-execution-policy §4.2`. Escanea `project/backlog/`, `project/planning/` y
   > `src/features/**` de este repo y proponme las áreas sensibles del proyecto para un
   > `quality-gates.project.json` inicial. No escribas el archivo hasta que yo apruebe la lista.

2. El agente escanea esas tres fuentes — el backlog y el planning dicen **qué hace** tu producto
   (ahí aparecen "cobros", "expedientes", "nómina"); `src/features/**` dice **dónde vive** cada
   cosa — y te presenta candidatos: path, riesgo propuesto, revisores propuestos, y por qué.
3. Tú decides: apruebas, recortas o corriges. Que un módulo maneje dinero, salud o datos
   personales lo sabes tú, no el escaneo.
4. Solo con tu aprobación explícita el agente escribe el archivo. Después: `pnpm skill:lint` en
   verde y commit — el archivo es tuyo, trackéalo en git.

## El shape

La misma forma que el default del kit: reglas `when` + `risk` + `require`. Un ejemplo completo y
válido (el schema exige `panel_by_risk` y `rules`; los niveles que no endureces se quedan vacíos):

```json
{
  "panel_by_risk": { "0": [], "1": [], "2": [], "3": [], "4": [] },
  "rules": [
    {
      "when": { "paths": ["src/features/payments/**"] },
      "risk": 4,
      "require": ["security-auditor", "architect"]
    },
    {
      "when": { "paths": ["src/features/medical-records/**"] },
      "risk": 3,
      "require": ["security-auditor"]
    }
  ]
}
```

- Cada regla declara **exactamente un** predicado: `when.paths` (globs) o `when.signal` (enum
  cerrado del kit) — nunca ambos, nunca ninguno.
- **Si tu auth vive fuera de las rutas del kit** (una puerta OAuth propia, un módulo MCP con
  tokens), no la subas a riesgo 4 por path — cada retoque de copy convocaría el panel completo.
  Extiende el conjunto de la señal que existe para eso, y el epic que toque **esa** auth y el
  schema a la vez escalará solo:

  ```json
  {
    "when": { "signal": "combined-auth-schema", "pathSets": { "auth": ["src/app/oauth/**", "src/lib/mcp/**"] } },
    "risk": 4,
    "require": ["security-auditor", "architect"]
  }
  ```

  Sólo suma globs al conjunto del kit (`auth` / `schema`), nunca los quita; `pathSets` sólo es
  válido en esa señal (`fx-execution-policy §4.2`).
- **Cuando el código se mueve, la regla no avisa sola — el linter sí.** Un glob tuyo que ya no
  encuentra ningún archivo (renombraste el directorio, metiste la ruta en un grupo de App Router)
  sale como **warning** en `pnpm skill:lint`: la regla quedó inerte. Actualiza el glob. Si el
  aviso es por código que todavía no escribiste, desaparece cuando el código llegue.
- Los nombres de `require` deben existir como agents en `.claude/agents/` — un typo dejaría un
  gate sin su revisor en silencio, y el linter lo atrapa.
- El override también puede endurecer el bloque `review`, con cuatro palancas: subir
  `clean_rounds`, endurecer el `severity_floor` bajándolo por el orden total
  `breaks` → `wrong` → `cosmetic`, quitar agentes de `informative`, y mover
  `unevidenced_dirties` de `false` a `true` (que un hallazgo sin evidencia citada vuelva a
  ensuciar la ronda de revisión — `fx-execution-policy §4.4`). Si lo declaras, va el bloque
  completo — mismos campos obligatorios que el default (`default_mode`, `informative`,
  `loop_by_risk`); `unevidenced_dirties` es **opcional**: omitirlo hereda el valor del kit,
  y solo lo escribes si lo endureces a `true` — y cualquier aflojamiento respecto al kit es
  error. El foco de este retrofit son las áreas por paths; el `review` es opcional.

## Verificar

```bash
pnpm skill:lint
```

El check `policy-registry` valida el override por **forma** (shape del JSON, predicados bien
declarados, riesgo en 0-4, revisores existentes) y por **dirección** (que solo endurezca): una
regla inerte sale como warning, un `review` aflojado sale como error. Corre también en el
pre-commit del kit, así que un override inválido no llega ni a commitearse.

## Lo que este retrofit NO hace

- **No cablea consumidores nuevos.** Los gates de cierre de `/implement` ya leen tu override;
  los consumidores que falten (`fx-execution-policy §4.3`) los cablea el kit y te llegarán por
  `factory update` sin que tu archivo cambie.
- **No edita el registry del kit.** `quality-gates.json` es solo-lectura para tu proyecto — un
  fork local se pierde en el siguiente update (`CORE.md §5`). Todo lo tuyo va en el `*.project.*`.
- **No decide por ti qué es sensible.** El agente propone con lo que lee; la última palabra sobre
  el negocio es del developer, siempre.

---

_TimeKast Factory — retrofit: áreas sensibles del proyecto en el registry de gates_
