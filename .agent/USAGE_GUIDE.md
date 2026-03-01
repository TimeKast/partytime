# 🚀 Guía Completa: Cómo Usar TimeKast Template

> **Maximiza el poder de 31 agentes, 36 skills y 11 workflows**

---

## 📐 Visión General del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    TU SOLICITUD                              │
└─────────────────────────────┬───────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
    ┌─────────────────┐             ┌─────────────────┐
    │ 📋 PLAN FOLDER  │             │ ⚡ SLASH COMMANDS │
    │  (Metodología)  │             │  (Ejecución)     │
    └────────┬────────┘             └────────┬────────┘
             │                               │
    ┌────────┴────────┐             ┌────────┴────────┐
    │ Fases ordenadas │             │ /start          │
    │ Discovery →     │             │ /orchestrate    │
    │ Backlog →       │             │ /test, /deploy  │
    │ Ejecución →     │             │ /audit, etc.    │
    │ Auditoría       │             └────────┬────────┘
    └────────┬────────┘                      │
             │                               │
             └───────────────┬───────────────┘
                             │
                             ▼
              ┌─────────────────────────────┐
              │ 🤖 AGENTES + SKILLS + RULES │
              │   (Se cargan automáticamente)│
              └─────────────────────────────┘
```

---

## 🎯 ¿Cuándo Usar Qué?

| Situación                     | Usa Esto                        | Por Qué                    |
| ----------------------------- | ------------------------------- | -------------------------- |
| **Crear app desde cero**      | `plan/1.0_Discovery.md` → fases | Metodología completa       |
| **Feature específico**        | `/start`                        | Clasifica y carga contexto |
| **Bug/Fix rápido**            | `/start`                        | Carga agentes de debugging |
| **UI/UX diseño**              | `/ui-ux-pro-max`                | 50 estilos, 21 paletas     |
| **Tarea compleja multi-área** | `/orchestrate`                  | Coordina múltiples agentes |
| **Testing**                   | `/test`                         | Genera y ejecuta tests     |
| **Deploy**                    | `/deploy`                       | Pre-flight checks + deploy |
| **Auditoría completa**        | `/audit`                        | Valida todo el proyecto    |

---

## 📋 FLUJO 1: Crear App Nueva (Metodología Completa)

### Usa el folder `plan/` en orden:

```
PASO 1: plan/1.0_Discovery.md
   └── Responder preguntas de discovery
   └── Definir scope, usuarios, features

PASO 2: plan/1.1_Propuesta.md (opcional)
   └── Generar propuesta comercial

PASO 3: plan/2.0_Documentacion.md
   └── Crear estructura en /docs
   └── Documentar modelo de datos, APIs, flujos

PASO 4: plan/2.1_Backlog.md
   └── Generar BACKLOG.md con issues
   └── Cada issue tiene agentes asignados

PASO 5: plan/2.2_Setup_Ambiente.md
   └── Configurar DB, env, dependencias

PASO 6: plan/3.0_Ejecucion_Local.md  ← PRINCIPAL
   └── Ejecutar cada issue del backlog
   └── LEER AGENTES antes de implementar
   └── Seguir protocolo de verificación

PASO 7: plan/4.0_Auditoria.md
   └── Validación final antes de deploy

PASO 8: plan/7.0_Mantenimiento_*.md
   └── Post-launch updates
```

### Ejemplo de Prompt para Iniciar:

```
Lee plan/1.0_Discovery.md y guíame por las preguntas
de discovery para mi nueva app de [descripción].
```

---

## ⚡ FLUJO 2: Feature/Bug/Mejora Rápida

### Usa `/start` - El Router Inteligente

```bash
# En el chat, simplemente escribe:
/start
```

**¿Qué hace `/start`?**

1. Clasifica tu solicitud (feature, bugfix, frontend, backend, etc.)
2. Carga las Rules apropiadas (`00_global.mdc`, `01_typescript.mdc`, etc.)
3. Carga los Agentes relevantes (`frontend-specialist.md`, etc.)
4. Carga los Skills necesarios
5. Anuncia: "🤖 Aplicando conocimiento de @frontend-specialist..."

### Ejemplos de uso de `/start`:

```bash
/start
Necesito agregar autenticación con Google OAuth

/start
El formulario de login no valida correctamente emails

/start
Quiero optimizar el performance del dashboard
```

---

## 🎨 FLUJO 3: Diseño UI/UX Premium

### Usa `/ui-ux-pro-max`

```bash
/ui-ux-pro-max
```

**¿Qué hace?**

- Acceso a 50 estilos de diseño
- 21 paletas de colores curadas
- 50 combinaciones tipográficas
- Patrones de landing page probados

### Ejemplo:

```bash
/ui-ux-pro-max
Diseña el dashboard principal para una app fintech
con estilo profesional pero moderno
```

---

## 🔧 FLUJO 4: Tarea Compleja Multi-Agente

### Usa `/orchestrate`

```bash
/orchestrate
```

**¿Qué hace?**

1. Descompone la tarea en subtareas
2. Asigna cada subtarea a un agente especialista
3. Ejecuta secuencialmente con contexto consistente
4. Valida con múltiples perspectivas

### Cuándo usarlo:

- Features full-stack (UI + API + DB)
- Refactors grandes
- Nuevos módulos completos
- Integraciones complejas

### Ejemplo:

```bash
/orchestrate
Implementar sistema de notificaciones push con:
- UI de preferencias del usuario
- API para enviar notificaciones
- Modelo de datos para historial
- Tests E2E del flujo completo
```

---

## 🧪 Otros Workflows Importantes

| Comando    | Uso                            |
| ---------- | ------------------------------ |
| `/test`    | Generar y ejecutar tests       |
| `/deploy`  | Deploy a producción con checks |
| `/preview` | Levantar servidor de preview   |
| `/status`  | Ver estado del proyecto        |
| `/audit`   | Auditoría completa             |
| `/dev`     | Comandos de desarrollo seguros |
| `/git`     | Operaciones git seguras        |

---

## 📚 Referencia: AGENT_FLOW.md

El archivo `.agent/AGENT_FLOW.md` es **documentación de referencia** (604 líneas).

**NO lo ejecutas directamente.** Es la guía técnica de:

- Cómo funcionan los agentes internamente
- Matriz de selección de agentes por dominio
- Protocolo de carga de skills
- Pipeline de validación
- Ejemplos de ciclo de vida completo

**Consultarlo cuando:**

- Quieras entender por qué el sistema eligió cierto agente
- Necesites debuggear el comportamiento del sistema
- Estés extendiendo el template con nuevos agentes/skills

---

## 🎯 Resumen Ejecutivo

```
┌─────────────────────────────────────────────────────────────┐
│                DECISION TREE                                 │
└─────────────────────────────────────────────────────────────┘

¿Es un proyecto NUEVO desde cero?
├── SÍ → plan/1.0_Discovery.md (seguir fases)
└── NO ↓

¿Es una TAREA específica (feature, bug, mejora)?
├── SÍ → /start (router inteligente)
└── NO ↓

¿Necesita MÚLTIPLES áreas (frontend + backend + db)?
├── SÍ → /orchestrate (multi-agente)
└── NO ↓

¿Es trabajo de DISEÑO UI/UX?
├── SÍ → /ui-ux-pro-max (sistema de diseño)
└── NO ↓

¿Es TESTING o DEPLOY?
├── TESTING → /test
├── DEPLOY → /deploy
└── OTRO → /start (catch-all)
```

---

## 💡 Tips para Máximo Provecho

1. **Siempre empieza con /start** si no sabes qué workflow usar
2. **Lee los agentes** que aparecen en "🤖 Aplicando conocimiento de..."
3. **Usa /audit** antes de deployar
4. **Consulta /docs** si el AI pregunta por contexto
5. **El BACKLOG.md** es tu fuente de verdad durante desarrollo

---

**Archivos clave:**

- `plan/` - Metodología por fases
- `.agent/workflows/start.md` - Router inteligente
- `.agent/agents/` - 31 especialistas
- `.agent/AGENT_FLOW.md` - Documentación técnica
- `.agent/ARCHITECTURE.md` - Mapa del sistema
