# Opcional — que tu E2E arranque de una base vacía (`e2e.config.json`)

> **Aplica si:** tu derivado corre E2E con el runner del kit (`pnpm test:e2e`), tiene migraciones (`src/lib/db/migrations/meta/_journal.json`) y todavía no tiene `e2e.config.json` en la raíz.
>
> **Cuesta:** un archivo de una línea y una corrida de `pnpm test:e2e`. Si no lo activas, nada cambia.
>
> **Disponible desde:** kit `v13.0.0`. El contrato vive en [`sk-e2e`](../../skills/sk-e2e/SKILL.md) §1 (*The empty-branch mode*).

---

## 1. Qué es

Hoy tu runner clona tu branch `develop` de Neon **con sus datos** y le aplica solo las migraciones que le faltan. Con la base vacía activada, justo después de clonarla **la vacía**: borra todos los schemas (tus tablas y el registro de migraciones de drizzle) y corre `pnpm db:migrate`, así que **toda** tu cadena de migraciones se aplica desde `0000` en cada corrida.

Ganas dos cosas:

- **Tus migraciones se prueban completas siempre.** Una migración que solo funcionó porque alguien aplicó algo a mano en develop (una extensión, una columna de un `db:push` viejo), o un journal roto, truena en el E2E y no en un deploy.
- **La suite ya no depende de datos que casualmente estaban en develop.**

Los proyectos nuevos nacen con la base vacía activada. Los que nacieron antes siguen como estaban hasta que alguien la activa: por eso es opcional.

## 2. Cómo se activa y cómo se revierte

`factory update` te lo pregunta una vez, en terminal interactiva, si tu repo todavía no decidió. Si contestas que sí escribe `true`, y si contestas que no escribe `false`. En los dos casos no vuelve a preguntar. Con `--yes` o desde el launcher no pregunta y no toca nada.

A mano es lo mismo. Crea `e2e.config.json` en la raíz:

```json
{
  "emptyBranch": true
}
```

Luego corre `pnpm test:e2e` y commitea el archivo.

**Revertir:** cambia el valor a `false` o borra el archivo. La siguiente corrida vuelve a clonar develop con sus datos.

El runner imprime al arrancar qué modo usa (`🗄️  E2E database: …`). Si el archivo no es JSON válido o trae otra cosa, la corrida aborta nombrándolo: nunca adivina el modo.

## 3. Para el agente que revisa esta guía: presenta la decisión

Si el update se hizo desde el launcher (GUI) o con `--yes`, **nadie le hizo esta pregunta al usuario**. Te toca a ti, igual que la haría el CLI.

1. **¿Aplica?** Solo si existen `scripts/tools/e2e-runner.ts` y `src/lib/db/migrations/meta/_journal.json` y **no** existe `e2e.config.json` en la raíz. Si el archivo ya existe (con cualquier valor), el repo ya decidió: no preguntes y no lo toques.
2. **Explica en lenguaje plano**, antes de pedir la decisión:
   - **Qué gana:** cada corrida de E2E vacía la base temporal y aplica **todas** las migraciones desde cero, y ningún spec depende de datos que solo existen en develop.
   - **Qué implica:** un spec que leía datos de develop, o una migración que no construye la base desde cero, va a tronar. Hay que correr `pnpm test:e2e` después de activarlo.
   - **Se revierte:** poniendo `"emptyBranch": false` o borrando el archivo.
3. **Pide la decisión con opciones explícitas y excluyentes** (no la tomes tú):
   - **Activarla** → escribe `{ "emptyBranch": true }` en `e2e.config.json`, corre `pnpm test:e2e` y, si truena, usa la tabla de §4 con el usuario.
   - **No activarla** → escribe `{ "emptyBranch": false }` para que no se vuelva a preguntar en el siguiente update.
   - **Decidir después** → no escribas nada.
4. En cualquiera de las dos primeras opciones, el archivo es del proyecto: propón commitearlo.

## 4. Si truena después de activarlo, cómo leerlo

| Síntoma | Qué significa | Arreglo |
| --- | --- | --- |
| Falla `pnpm db:migrate` en el runner (`relation … does not exist`, `type … does not exist`, `extension …`) | Tu cadena de migraciones **no** construye la base desde cero. Develop tiene algo que ninguna migración crea | Crea ese objeto en una migración (`pnpm db:generate`, o `pnpm db:generate --custom` para una extensión o un DML). Nunca edites una migración ya aplicada en otro entorno (`SK.md §1.2`) |
| Un spec no encuentra un registro, una opción de un select sale vacía, o truena un FK | El spec leía una fila que solo existía en develop | Siémbrala en el propio spec o en `tests/e2e/auth.setup.ts` |
| `Failed to empty the E2E branch` | El rol de la base no pudo borrar algún schema (lo creó otro rol) | Revisa quién es el dueño de ese schema en develop. El run se detiene sin probar nada encima de los datos del padre |

¿No hay tiempo de arreglarlo ahora? Regresa a `false` y sigues como antes. Arreglarlo después no cuesta más.

Lo que una base vacía **no** revisa es una migración que solo truena con datos reales (por ejemplo, un `NOT NULL` sin default sobre una tabla con filas). Eso lo sigue revisando el deploy de `develop`, que migra la base develop antes de que algo llegue a `main`.
