---
description: Plan and implement UI using the UI/UX Pro Max design system with CSV databases and Python scripts
---

# /ui-ux-pro-max - Design System Workflow

Este workflow activa el sistema de diseño avanzado con bases de datos de patrones y scripts de generación.

---

## Paso 1: Preparación

Verifica que tienes acceso a los recursos:

```
.agent/.shared/ui-ux-pro-max/
├── data/           # CSV databases con patrones
│   ├── charts.csv
│   ├── colors.csv
│   ├── icons.csv
│   ├── landing.csv
│   ├── products.csv
│   ├── prompts.csv
│   ├── react-performance.csv
│   ├── styles.csv
│   ├── typography.csv
│   ├── ui-reasoning.csv
│   ├── ux-guidelines.csv
│   ├── web-interface.csv
│   └── stacks/     # Stack-specific patterns
└── scripts/
    ├── core.py           # Core utilities
    ├── design_system.py  # Design system generator
    └── search.py         # Pattern search
```

---

## Paso 2: Analizar el Request

Clasifica el tipo de diseño:

| Tipo             | CSVs Relevantes                                       |
| ---------------- | ----------------------------------------------------- |
| **Landing Page** | `landing.csv`, `styles.csv`, `colors.csv`             |
| **Dashboard**    | `charts.csv`, `ui-reasoning.csv`, `ux-guidelines.csv` |
| **E-commerce**   | `products.csv`, `landing.csv`                         |
| **Typography**   | `typography.csv`, `styles.csv`                        |
| **Icons/UI**     | `icons.csv`, `web-interface.csv`                      |

---

## Paso 3: Consultar Patrones

### Búsqueda Rápida

```python
# Search patterns by keyword
python .agent/.shared/ui-ux-pro-max/scripts/search.py "hero section"
```

### Usar Design System Generator

```python
# Generate design tokens
python .agent/.shared/ui-ux-pro-max/scripts/design_system.py generate
```

---

## Paso 4: Aplicar Patrones

Al diseñar, SIEMPRE:

1. **Consultar CSV relevante** para obtener patterns probados
2. **Evitar AI clichés** (ver frontend-design skill)
3. **Aplicar UX psychology** (Hick's Law, Fitts' Law, etc.)
4. **Validar colores** contra `colors.csv` para armonía

---

## Paso 5: Anti-Patterns

🚫 **NUNCA USAR:**

- Purple/Violet (Purple Ban)
- Bento Grids por defecto
- Mesh/Aurora Gradients
- Dark + neon como default
- Glassmorphism genérico

✅ **SIEMPRE:**

- ASK user su preferencia de color/estilo
- Variar layouts entre proyectos
- Aplicar 60-30-10 rule
- Mantener whitespace generoso

---

## Paso 6: Validación

Después de implementar, ejecutar:

```bash
# UX Audit (si tienes el script)
python .agent/skills/frontend-design/scripts/ux_audit.py .

# Lighthouse Performance
python .agent/skills/performance-profiling/scripts/lighthouse_audit.py http://localhost:3000
```

---

## Scripts Disponibles

| Script             | Propósito               |
| ------------------ | ----------------------- |
| `search.py`        | Buscar patrones en CSVs |
| `design_system.py` | Generar design tokens   |
| `core.py`          | Utilidades core         |

---

## Skills Relacionados

| Skill               | Cuándo Usar               |
| ------------------- | ------------------------- |
| `frontend-design`   | Principios de diseño y UX |
| `tailwind-patterns` | Patrones Tailwind v4      |
| `clean-code`        | Código limpio             |
| `seo-fundamentals`  | SEO básico                |

---

> **Recuerda:** El diseño es PENSAR, no copiar. Cada proyecto merece consideración fresca.
