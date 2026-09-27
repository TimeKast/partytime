---
description: Publish — sube el entregable client-facing (mockup) del repo actual al hub proposals.timekast.mx vía el CLI @timekast/factory. Thin wrapper sobre `factory publish`.
allowed-tools: Bash, Read, Glob, AskUserQuestion
argument-hint: '[mockup] [--opaque-url]'
---

# /publish

Sube a `proposals.timekast.mx` el entregable estático que generó `/mockup`
(`project/mockup/`). Modelo de seguridad honesto: **link no-adivinable + noindex**
(no es password). Detalle: [`proposal-publishing.md`](../docs/proposal-publishing.md).

> **`/publish proposal` es solo-mockup ahora.** `/proposal` ya no emite un one-pager
> HTML — entrega vía Gamma (Markdown → Gamma deck), así que **no hay artefacto HTML
> de propuesta que publicar a este hub**. La ruta `proposal` quedó sin entregable: si
> el usuario pide publicar una propuesta, redirígelo al flujo de Gamma de `/proposal`.
> La ruta CLI `factory publish proposal` queda **temporalmente rota** — el motivo y el
> defer consciente están documentados en
> [`proposal-publishing.md`](../docs/proposal-publishing.md).

> **Invocación:** este wrapper llama **`npx @timekast/factory publish` directo**,
> NUNCA el script `factory:publish` del package.json (no todos los repos lo tienen).
> El motor (auth, clone del hub, push) vive en el CLI; esto solo detecta, confirma
> y surfacea las URLs.

## Procedimiento

1. **Detectar qué hay.** Glob `project/mockup/` (→ mockup). La ruta `proposal` ya no
   tiene entregable HTML (`/proposal` entrega vía Gamma post-pivot), así que esta ruta
   publica **solo mockup**. Si `$ARGUMENTS` trae `proposal` → STOP plain:
   _"`/publish proposal` ya no está disponible: `/proposal` entrega vía Gamma, no genera
   un one-pager HTML para este hub. Usa el flujo de Gamma de `/proposal` para tu entrega
   de propuesta."_ Si no hay `project/mockup/` → STOP plain:
   _"No hay entregable que publicar. Corre `/mockup` primero."_

2. **Version guard (capability-detection).** Corre `npx @timekast/factory --help` y
   verifica que liste `publish`. Si **no** aparece (el npx resolvió una versión vieja,
   anterior al `cli-v1.2.0`) → STOP plain:
   _"Tu CLI de Factory no tiene `publish` todavía. Corre con `npx @timekast/factory@latest publish …` o espera a la versión publicada."_

3. **Confirmar** — CP plain es-MX con opciones explícitas y excluyentes: estructuradas (`AskUserQuestion`) por default, tabla numerada como fallback sin la tool (`CC.md §3`). Headless: resuelve por su fallback declarado, sin intentar la tool.

   ```
   Voy a publicar a proposals.timekast.mx:  <mockup>
     1. No, cancelar
     2. Sí, publicar
   ```

   Recuerda el modelo honesto: link no-adivinable, sin password — no mandes entregables
   con datos muy sensibles hasta que exista el escalón de password.

4. **Publicar.** Si el user elige Sí, corre por Bash:
   `npx @timekast/factory publish mockup` (agrega `--opaque-url` si vino en `$ARGUMENTS`).
   El CLI resuelve auth (`gh`), clona el hub, copia, pushea y escribe `project/.publish.json`.

5. **Surfacear el resultado.** Muestra al user las URL(s) que imprimió el CLI, tal cual.
   Recuérdale: el CLI **no commitea** tu repo — commitea `project/mockup`
   + `project/.publish.json` tú (o déjalo al cierre del workflow si vienes de `/mockup`).

## Reglas

- NO redefinir la lógica del CLI ni el modelo de identidad/URL — eso vive en `factory publish`.
- NO usar el script `factory:publish` internamente (ver nota arriba).
- Para **bajar** un mockup: `npx @timekast/factory unpublish mockup`.
