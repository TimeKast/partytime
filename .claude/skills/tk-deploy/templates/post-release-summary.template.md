<!--
  ===== tk-deploy: post-release transition summary =====
  Emitted in Phase 7.2.4 ONLY when first-release derivado triggers (0.0.0 → 1.0.0+).
  Placeholders: {NEW_VERSION}, {DEVELOP_STATE}, {TARGET}

  DEVELOP_STATE = "creada" si Phase 7.2.2 creó la branch
                | "confirmada existente" si ya existía
  TARGET        = `target` de .timekast/provision.json (Phase 1 §1.4): "vercel" | "railway".
                  Emitir SOLO el bloque de ese destino (abajo). Sin target → omitir los dos
                  bloques de destino y decir que el destino no está registrado.
-->

## 🔒 Transición a Post-Release

| Acción                       | Estado                                |
| ---------------------------- | ------------------------------------- |
| Tag `v{NEW_VERSION}` en main | ✅                                    |
| Branch `develop`             | {DEVELOP_STATE} ✅                    |
| Branching phase              | `post-release` (develop-first activo) |

### A partir de ahora

- `develop` es la rama de trabajo del proyecto.
- `main` solo recibe merges via `/deploy`.
<!-- TARGET = vercel → emitir esta línea -->

- `main` = production, `develop` = preview (Vercel).

<!-- TARGET = railway → emitir esta línea en lugar de la anterior -->

- El entorno `main` de Railway (producción) despliega `main`; el entorno `develop` despliega `develop`.

<!-- TARGET = vercel → emitir este bloque -->

### ⚠️ Configurar Vercel manual (workflow no automatiza)

1. Vercel dashboard → Settings → Git
2. **Production Branch:** `main`
3. **Preview Branch:** `develop`

<!-- TARGET = railway → emitir este bloque en lugar del anterior -->

### Railway: ramas de cada entorno

Si `factory provision` dio de alta el proyecto, ya ató cada entorno a su rama: el entorno
`main` despliega `main` y el entorno `develop` despliega `develop`. Si el proyecto ya existía
y el kit lo adoptó (`--adopt`), revísalo en el dashboard de Railway → cada servicio →
Settings → Source: el entorno de producción debe desplegar `main` y el de desarrollo `develop`.

---

Esta transición es **one-way** — el proyecto no vuelve a pre-release. Versiones futuras se bumpean con `/deploy release` desde `develop`.
