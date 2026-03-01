---
description: Router inteligente universal - detecta tipo de solicitud y carga contexto relevante
---

# /start - Router Inteligente

Este workflow te convierte en un especialista optimizado para la tarea solicitada.

---

## Paso 1: Clasificar la Solicitud

Analiza el prompt del usuario y clasifícalo en **UNA** de estas categorías:

| Categoría  | Señales Típicas                                                 |
| ---------- | --------------------------------------------------------------- |
| `feature`  | crear, agregar, implementar, nuevo, añadir, desarrollar         |
| `bugfix`   | fix, error, bug, rompe, falla, no funciona, crashes             |
| `frontend` | UI, diseño, componente, mobile, responsive, layout, estilo, CSS |
| `backend`  | API, server action, database, schema, query, endpoint, modelo   |
| `pwa`      | PWA, offline, instalar, service worker, notificaciones push     |
| `security` | seguridad, auth, permisos, RBAC, tokens, vulnerabilidad, XSS    |
| `docs`     | documentar, actualizar docs, README, escribir guía              |
| `setup`    | setup, ambiente, env, dependencias, deploy, Vercel, Neon        |
| `refactor` | refactor, limpiar, optimizar, reorganizar, mejorar código       |
| `query`    | cómo, qué es, dónde, por qué, explicar, consulta                |

> **Regla**: Si la solicitud involucra MÚLTIPLES categorías, usa la tabla de combinaciones.

**Combinaciones**: Feature+UI → `feature`+`frontend` | Feature+DB → `feature`+`backend` | Bug+UI → `bugfix`+`frontend` | Bug+API → `bugfix`+`backend`

---

## Paso 1.5: Detección de Orquestación

> ⚠️ **EVALUAR SI REQUIERE MULTI-AGENTE**

Si detectas **3+ dominios** (ej: Frontend + Backend + Database), sugiere:

> 🔄 **Tarea multi-dominio detectada.** Para máximo contexto, también invoca `/orchestrate` después de /start.

Si es **1-2 dominios**: Continúa normalmente con /start.

---

## Paso 2: Cargar Rules (OBLIGATORIO)

> ⚠️ **Las Rules tienen máxima prioridad** sobre agentes y documentación. Definen comportamientos obligatorios.

### 2.1 Siempre cargar (sin excepción):

```
.agent/rules/00_global.mdc
```

### 2.2 Según clasificación, cargar adicionales:

| Clasificación | Rules adicionales a cargar                                      |
| ------------- | --------------------------------------------------------------- |
| `feature`     | `01_typescript.mdc` + `02_nextjs.mdc`                           |
| `bugfix`      | `01_typescript.mdc` + `02_nextjs.mdc`                           |
| `frontend`    | `01_typescript.mdc` + `02_nextjs.mdc`                           |
| `backend`     | `01_typescript.mdc` + `02_nextjs.mdc` + `03_drizzle.mdc`        |
| `pwa`         | `01_typescript.mdc` + `02_nextjs.mdc`                           |
| `security`    | Todas: `01_typescript.mdc` + `02_nextjs.mdc` + `03_drizzle.mdc` |
| `refactor`    | `01_typescript.mdc` + `02_nextjs.mdc`                           |
| `docs`        | Solo `00_global.mdc`                                            |
| `setup`       | Solo `00_global.mdc`                                            |
| `query`       | Solo `00_global.mdc`                                            |

### 2.3 Leer contenido COMPLETO de cada rule

Las rules contienen patrones obligatorios, prohibiciones absolutas y checklists de validación.

---

## Paso 3: Cargar Agentes Relevantes

Según clasificación, **lee COMPLETO** cada archivo de agente en `/.agent/agents/`:

| Clasificación       | Agentes (en `/.agent/agents/`)                                   |
| ------------------- | ---------------------------------------------------------------- |
| `feature`, `bugfix` | `fullstack-engineer.md`, `tech-lead.md`                          |
| `frontend`          | `frontend-engineer.md`, `design-system-lead.md`, `tech-lead.md`  |
| `backend`           | `backend-engineer.md`, `data-modeler-drizzle.md`, `tech-lead.md` |
| `pwa`               | `pwa-engineer.md`, `frontend-engineer.md`                        |
| `security`          | `security-reviewer.md`, `backend-engineer.md`, `tech-lead.md`    |
| `docs`              | `technical-writer.md`, `project-architect.md`                    |
| `setup`             | `devops-engineer.md`, `fullstack-engineer.md`                    |
| `refactor`          | `tech-lead.md`, `fullstack-engineer.md`                          |
| `query`             | No requiere agentes                                              |

### 3.1 Anuncio de Agente (OBLIGATORIO)

Al cargar agentes, **siempre anunciar** al usuario cuál expertise estás aplicando:

```markdown
🤖 **Aplicando conocimiento de `@frontend-engineer`...**

[Continuar con respuesta especializada]
```

### 3.2 Cargar Skills Relevantes

Según clasificación, cargar skills de `/.agent/skills/`:

| Clasificación | Skills a cargar                       |
| ------------- | ------------------------------------- |
| `bugfix`      | `systematic-debugging`                |
| `frontend`    | `react-best-practices` (si existe)    |
| `backend`     | `clean-code`                          |
| `refactor`    | `performance-profiling`, `clean-code` |
| `security`    | (skills de seguridad si existen)      |

## Paso 4: Cargar Documentación del Proyecto

### 4.1 Explorar `/docs/`

**OBLIGATORIO**: Lista el contenido de `/docs/` para ver qué documentación existe.

### 4.2 Seleccionar según clasificación

| Categoría  | Documentos a buscar y leer                                   |
| ---------- | ------------------------------------------------------------ |
| `feature`  | overview, user stories, flujos funcionales, modelo de datos  |
| `bugfix`   | overview, flujos funcionales, doc del área afectada          |
| `frontend` | overview, design system, UI/UX, componentes, temas           |
| `backend`  | overview, modelo de datos, APIs, validaciones, permisos/RBAC |
| `pwa`      | overview, docs de PWA/offline/service worker                 |
| `security` | overview, permisos, RBAC, autenticación, validaciones        |
| `docs`     | overview + TODOS los docs existentes                         |
| `setup`    | overview, arquitectura, dependencias, variables de entorno   |
| `refactor` | overview + docs del área a refactorizar                      |
| `query`    | overview (mínimo) + docs relacionados con la pregunta        |

> **Criterio de selección**: Si un documento parece relevante por su nombre, léelo completo. Es mejor tener más contexto que menos.

### 4.3 Documentos Globales (SIEMPRE leer)

```
/docs/reference/reusable-library.md    (catálogo de componentes reutilizables)
```

### 4.4 Protocolos de Ejecución

Si aplica, consulta estos protocolos:

| Situación               | Protocolo                      |
| ----------------------- | ------------------------------ |
| Implementar feature/fix | `/plan/3.0_Ejecucion_Local.md` |
| Auditar proyecto        | `/plan/4.0_Auditoria.md`       |
| Configurar ambiente     | `/plan/2.2_Setup_Ambiente.md`  |

---

## Paso 5: Confirmar Contexto Cargado

Antes de continuar, valida mentalmente:

- [ ] Clasificación correcta identificada
- [ ] Rules relevantes leídas COMPLETAS
- [ ] Agentes relevantes leídos COMPLETOS
- [ ] Documentación relevante leída COMPLETA
- [ ] Catálogo de reusable-library.md consultado

> Si falta algo, cargarlo ahora antes de continuar.

---

## Paso 6: Evaluar Complejidad y Planificar

### 6.1 ¿Requiere plan?

**Requiere plan**: >3 archivos, cambios schema, múltiples componentes, APIs externas, auth/permisos.
**No requiere**: Fix simple (1 archivo), cambio UI menor, query.

> Ante la duda, hacer plan.

### 6.2 Template de Plan

```markdown
## Plan: [Título]

### Objetivo

[Qué se va a lograr]

### Archivos

1. `path/file.ts` - [cambio]
2. [NEW] `path/new.ts` - [propósito]

### Pasos

1. [ ] Paso 1
2. [ ] Paso 2

### Criterios

- [ ] [Criterio 1]
```

Marca: `[x]` completado, `[/]` en progreso, `[ ]` pendiente.

---

## Paso 7: Implementar

Con todo el contexto cargado (y plan si aplica):

1. **Actúa** como el(los) agente(s) cargado(s)
2. **Sigue** el plan paso a paso (si existe)
3. **Aplica** las rules estrictas cargadas (máxima prioridad)
4. **Cumple** las reglas globales del proyecto

> ⚠️ **CRÍTICO**: Si durante la ejecución descubres que necesitas agentes, docs adicionales, o modificar el plan, hazlo antes de continuar. Calidad > Velocidad.

> 🔧 **REGLA DE COMANDOS**: NUNCA uses `&&` para encadenar comandos `git` o `gh`. Ejecuta cada comando **por separado**, uno a la vez.

---

## Paso 8: Auditoría Post-Implementación

**OBLIGATORIO** después de implementar (excepto para `query`).

### 8.1 Comandos de Calidad

Ejecuta TODOS estos comandos en orden:

```bash
npm run format     # Prettier - formatear código
npm run build      # Build - debe pasar sin errores
npm run typecheck  # TypeScript - debe pasar sin errores
npm run lint       # ESLint - sin errores críticos
npm run test       # Tests - deben pasar (si existen)
```

| Comando             | Status | Notas                         |
| ------------------- | ------ | ----------------------------- |
| `npm run format`    | ⬜     | Aplicar antes de otros checks |
| `npm run build`     | ⬜     |                               |
| `npm run typecheck` | ⬜     |                               |
| `npm run lint`      | ⬜     |                               |
| `npm run test`      | ⬜     | N/A si no hay tests           |

### 8.2 Checklist de Revisión

- [ ] Código sigue convenciones del proyecto
- [ ] Sin código muerto o comentado
- [ ] Sin console.log de debug
- [ ] Nomenclatura consistente
- [ ] Feature funciona según criterios
- [ ] No rompe flujos existentes
- [ ] Estados edge case manejados

### 8.3 Si hay errores → FIX y RE-AUDITAR

1. Identifica el problema
2. Corrige el código
3. Ejecuta `npm run format`
4. Vuelve a ejecutar los checks
5. Repite hasta que todo pase ✅

> **Regla**: NO avanzar al Paso 9 hasta que TODO esté verde.

---

## Paso 9: Sincronización de Documentación

**OBLIGATORIO** si los cambios afectan comportamiento de la app.

### 9.1 Evaluar Impacto

| Pregunta                                 | Acción                 |
| ---------------------------------------- | ---------------------- |
| ¿Se agregó funcionalidad nueva?          | Documentar en `/docs`  |
| ¿Se modificó comportamiento existente?   | Actualizar docs        |
| ¿Se cambió UI/UX de forma significativa? | Actualizar docs        |
| ¿Se agregaron/modificaron permisos?      | Actualizar RBAC docs   |
| ¿Se cambió el modelo de datos?           | Actualizar schema docs |

> Si TODAS las respuestas son "No", puedes saltar este paso.

### 9.2 Actualizar `/docs/`

1. Identifica qué documentos están afectados
2. Lee esos documentos completos
3. Actualiza las secciones relevantes
4. Verifica que no haya contradicciones

---

## Paso 10: Entrega Final

### 10.1 Checklist Final

- [ ] Implementación completa según request
- [ ] Build, typecheck, lint pasando
- [ ] Auditoría de cambios completada
- [ ] Documentación actualizada (si aplica)

### 10.2 Pregunta de Oro

> "¿Esto es lo que entregaría el mejor desarrollador del mundo?"

Si la respuesta no es **sí**, vuelve al paso correspondiente y mejora.

### 10.3 Resumen de Cambios

Al finalizar, presenta al usuario:

```markdown
## ✅ Cambios Realizados

- [Lista de cambios implementados]

## 📁 Archivos Modificados

- [Lista de archivos]

## 🔍 Validación

- [x] Build OK
- [x] TypeCheck OK
- [x] Lint OK
- [x] Tests OK (si aplican)

## 📝 Documentación Actualizada

- [Lista de docs actualizados, o "N/A - sin impacto en docs"]
```

---

## Referencia Rápida: Jerarquía de Documentos

```
1. Rules (.agent/rules/*.mdc)      (máxima autoridad)
2. /docs/*                          (reglas de negocio)
3. /agents/*.md                     (especialización técnica)
4. /plan/*                          (protocolos de ejecución)
```

Si hay conflicto, gana el documento de mayor rango.
