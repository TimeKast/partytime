---
description: Generate a branded PDF from a Markdown doc via fx-pdf-export
argument-hint: '<input.md> [--no-cover] [--no-logos] [--no-toc] [--appendix "T:F"] [--output PATH]'
---

# /pdf

Convierte un Markdown en PDF con branding TimeKast usando el skill `fx-pdf-export`.

**Argumento:** `$ARGUMENTS`

---

## Instrucciones al agente

1. **Invocar skill `fx-pdf-export`** — lee `.claude/skills/fx-pdf-export/SKILL.md` con Read tool antes de ejecutar (CC.md §8).
2. Parsear `$ARGUMENTS`:
   - Primer token que termine en `.md` → input path (obligatorio)
   - Si falta → pedir al usuario qué doc convertir (no asumir)
   - Resto de tokens → flags pass-through al script
3. Validar que el MD exista (Read o Glob). Si no existe → reportar y detener.
4. Decidir path:
   - Con flags `--no-cover` y sin `--appendix` → fast path (`npx md-to-pdf@5.2.5`)
   - Caso general → full path (`node build-pdf.mjs`)
5. Ejecutar via Bash:

   **Fast path:**

   ```bash
   npx -y md-to-pdf@5.2.5 \
     --stylesheet .claude/skills/fx-pdf-export/resources/timekast-style.css \
     --pdf-options '{"format":"A4","margin":{"top":"20mm","bottom":"20mm","left":"20mm","right":"20mm"},"printBackground":true}' \
     --gray-matter-options '{"delimiters":"\u0000"}' \
     <input.md>
   ```

   > 🔴 **`--gray-matter-options` no es opcional, y aquí menos que en ningún lado.** `md-to-pdf`
   > fusiona el front-matter YAML del documento **dentro de su propia config**, y esa config
   > alimenta `puppeteer.launch(launch_options)`, `page.addScriptTag(script)` y `dest`: quien
   > escribe el `.md` controlaría el navegador del renderizador. El delimitador imposible hace que
   > no encuentre front-matter. El fast path entrega el `.md` **crudo**, así que el vector es
   > directo — el full path pasa por `build-pdf.mjs`, que ya lleva la misma opción.

   **Full path:**

   ```bash
   node .claude/skills/fx-pdf-export/scripts/build-pdf.mjs <input.md> [flags…]
   ```

6. Reportar al usuario en ≤4 líneas:

   ```
   📄 PDF: <output.pdf> (<size>)
   📝 Título: <del H1>
   📷 Logos: <auto-detected | --no-logos>
   ```

7. No abrir el PDF automáticamente. No committear.

---

## Reglas

- **NUNCA** instalar paquetes sin autorización — el fast path corre la versión **fijada** `md-to-pdf@5.2.5`, que `npx` ejecuta desde su propia caché (`~/.npm/_npx`); no se instala global ni se agrega al `package.json` del proyecto
- 🔴 **El pin fija el paquete, no su árbol de dependencias:** `md-to-pdf@5.2.5` declara otras 13 dependencias, todas por rango —incluida `puppeteer: '>=8.0.0'`, sin cota superior— y `npx` las resuelve del registro en cada instalación fría, **sin lockfile que fije qué versiones toca**. Lo que sí ocurre siempre es la verificación de integridad: npm compara el sha512 de cada tarball contra el `dist.integrity` del packument, y eso no es opcional. Lo que falta, entonces, no son los bytes — es fijar las versiones transitivas resueltas, y la verificación de procedencia (`npm audit signatures`, opt-in). Queda fijo qué código de `md-to-pdf` corre, no qué Chromium ni qué transitivas bajan
- Subir la versión es una **edición manual**, y el control NO es una lista de lugares que alguien deba mantener al día: **la versión efectiva es una sola.** `grep -rn 'md-to-pdf@' .claude/ scripts/` debe devolver un único número de versión; correrlo es el cierre obligatorio de cualquier subida de versión. El barrido alcanza también el permiso `Bash(npx -y md-to-pdf@5.2.5 *)` de `.claude/settings.json`, que matchea el literal **con** versión, así que un pin subido a medias sale ahí. El invariante está mecanizado en `scripts/tools/__tests__/build-pdf.test.ts`, que falla si dos portadores del literal quedan desalineados
- **NUNCA** sobreescribir un PDF existente sin mostrar el path primero
- El logo de TimeKast siempre se resuelve (ruta fija del kit) — si `build-pdf.mjs` reporta "⚠️ Client logo skipped" es informativo (falta o es inválido el logo del cliente), no error; continuar
- Si el MD tiene <10 líneas o no tiene H1 → advertir "doc puede verse vacío en PDF" antes de generar

---

## Edge cases

- **Input sin `.md`:** pedir confirmación — ¿es MD sin extensión? si no, abortar
- **`NEXT_PUBLIC_CLIENT_LOGO_DARK`/`_LIGHT` ausentes o inválidas:** el PDF sale sin logo de cliente, sin error (solo el aviso informativo)
- **`--output` apunta a dir inexistente:** el script lo crea (`mkdirSync(..., { recursive: true })`)
- **md-to-pdf falla por Chromium no disponible:** reportar el stderr al usuario; es issue de env, no del skill
