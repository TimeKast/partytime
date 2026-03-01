# 📜 Sistema de Rules

> Reglas declarativas que guían el comportamiento del AI según contexto.

---

## ¿Qué son las Rules?

Las **Rules** son archivos `.mdc` (Markdown con frontmatter) que definen comportamientos obligatorios para el AI Agent. A diferencia de los agentes (que definen "cómo hacer algo"), las rules definen "qué siempre debe cumplirse".

---

## Estructura

```
.agent/rules/
  ├── README.md              ← Este archivo
  ├── 00_global.mdc          ← Siempre aplica
  ├── 01_typescript.mdc      ← Aplica a *.ts, *.tsx
  ├── 02_nextjs.mdc          ← Aplica a app/**
  └── 03_drizzle.mdc         ← Aplica a lib/db/**
```

---

## Formato de una Rule

```yaml
---
description: Breve descripción de la regla
alwaysApply: true # Si true, siempre aplica
globs: ['**/*.ts'] # Si no alwaysApply, aplica a estos patrones
---
# Contenido de la regla en Markdown
```

---

## Jerarquía de Prioridad

Las rules se aplican en orden numérico. Si hay conflicto, gana la de menor número:

1. `00_*` → Máxima prioridad (reglas universales)
2. `01_*` → Alta prioridad (stack core)
3. `02_*` → Media prioridad (framework)
4. `03_*` → Baja prioridad (librerías específicas)

---

## Cuándo Aplicar Rules

| Tipo de Rule        | Se aplica cuando...                      |
| ------------------- | ---------------------------------------- |
| `alwaysApply: true` | Siempre, en cualquier contexto           |
| `globs: [...]`      | El archivo actual coincide con el patrón |

---

## Cómo Agregar una Nueva Rule

1. Crear archivo `.mdc` con prefijo numérico apropiado
2. Definir frontmatter con `description` y `alwaysApply` o `globs`
3. Escribir las reglas en Markdown
4. Documentar en este README

---

## Relación con Agentes

```
┌─────────────────────────────────────────────┐
│              JERARQUÍA                      │
├─────────────────────────────────────────────┤
│  1. Rules (qué DEBE cumplirse)              │
│     ↓                                       │
│  2. Agents (cómo HACER algo)                │
│     ↓                                       │
│  3. Workflows (cuándo EJECUTAR)             │
└─────────────────────────────────────────────┘
```

Las rules tienen prioridad sobre las instrucciones de agentes si hay conflicto.
