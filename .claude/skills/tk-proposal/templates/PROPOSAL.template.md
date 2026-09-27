---
title: 'Título de la propuesta' # ej. "TimeKast Insights para {Cliente}"
slug: 'slug-del-proyecto' # kebab-case; deriva de project-config.md `Slug`
tier: 'developer | ejecutivo | negocio' # tier elegido en CP1 — fija profundidad + jerga
created_at: 'ISO-8601' # timestamp de emisión del MD (P2)
image_style: '' # dirección visual de las imágenes, confirmada en CP1 (P2)
client_logo_url: '' # logo del cliente en assets.timekast.com, o '' si el deck va sin él (P2)
gamma_url: '' # vacío hasta P3 (provenance — NUNCA llega al body de Gamma)
short_url: '' # vacío hasta P3 (provenance — NUNCA llega al body de Gamma)
---

<!--
  PROPOSAL.template.md — shape obligatorio del MD que tk-proposal emite en P2.
  Regla "no template, no artifact" (fx-workflow-authoring §11).

  · El BODY (todo lo que sigue al cierre del frontmatter `---`) es lo que P3
    convierte en `inputText` para Gamma. El frontmatter NO viaja a Gamma
    (strip-frontmatter, SKILL §13 P3).
  · Cada `---` en línea propia es un CORTE DE TARJETA (card-break) para Gamma:
    una sección = una tarjeta. [contrato a confirmar contra el MCP real — R2-2.]
  · Secciones §1-9 = el cuerpo de la propuesta. Apéndices A-D = profundidad
    opcional por tier (arquitectura/seguridad/plan/inversión-estructura).
  · Contenido se FUNDA en /discovery (+ /design si existe) — cero invención
    (CODING.md §8). Gap → supuesto explícito en §7, no improvisar.
  · Reglas de contenido (anti-drift) en SKILL §3: montos solo en Apéndice D y
    confirmados en CP1 (nunca el desglose interno del estimate), framing positivo,
    jerga tier-aware. El tier developer SÍ lleva internals; negocio/ejecutivo no.
-->

# {Título de la propuesta}

> **Cliente:** {Nombre del cliente}
> **Equipo TimeKast:** {stakeholder(s) reales de project-config — nunca inventar nombres}
> **Documento:** Propuesta comercial — {línea de una frase del producto}

---

## 1. Resumen Ejecutivo

{2-3 párrafos: el problema que resuelve, el resultado esperado, por qué esta
solución. Funda en `00_DISCOVERY_BRIEF §1` + `03_DEEP_DIVE`. Cierra con el
time-to-value si el discovery lo respalda (fases con entregables, NUNCA fechas
duras sin confirmar — SKILL §3).}

---

## 2. Objetivos

**Objetivo principal:** {de `00_DISCOVERY_BRIEF` — el norte del proyecto.}

**Objetivos secundarios:**

- {objetivo reescrito como meta accionable, en lenguaje de negocio}
- {…}

---

## 3. Solución Propuesta

{Qué hace la app, procesos que simplifica, decisiones que facilita,
automatizaciones. Funda en `03_DEEP_DIVE` (capacidades) + `06_ACCEPTANCE_SCENARIOS`.}

**{Capacidad central 1}.**
{descripción en el registro del tier}

**{Capacidad central 2}.**
{…}

### Cómo se sostiene en el tiempo

{Operación / calibración continua si el discovery lo respalda.}

### Lo que el cliente no tiene que hacer

- {responsabilidad que la plataforma absorbe — framing positivo}
- {…}

---

## 4. Usuarios y Roles

{Funda en `02_PERSONAS` + `05_RBAC_MATRIX`. Tabla rol × descripción × acciones.}

| Rol     | Descripción       | Acciones principales |
| ------- | ----------------- | -------------------- |
| {rol 1} | {quién es}        | {qué puede hacer}    |
| {rol 2} | {…}               | {…}                  |

> {nota de alcance de datos / concurrencia si aplica.}

---

## 5. Flujos Principales

{Funda en `06_ACCEPTANCE_SCENARIOS` (flujo estrella + secundarios). Usar
descriptor de rol genérico o stakeholder real — NUNCA nombre propio inventado
(SKILL §3).}

**Flujo 1 — {nombre del flujo estrella}.**
{pasos detallados en narrativa}

**Flujo 2 — {flujo secundario}.**
{resumido}

---

## 6. Alcance MVP

{Funda en el MoSCoW de `00_DISCOVERY_BRIEF §3`. Drift/gap reconciliado en P1:
toda Must/Should mapea a "incluido v1" o a "evolución planificada" con decisión
explícita.}

### Incluye en V1:

- {feature Must/Should incluida}
- {…}

### Evolución planificada (fases posteriores):

{Framing positivo SIEMPRE — "evolución planificada" / "fase posterior", NUNCA
"no incluye" / "excluido" / "fuera de alcance" (SKILL §3).}

- {capacidad diferida + por qué V1 ya cubre el valor central}
- {…}

---

## 7. Supuestos y Decisiones Pendientes

{Cada gap del discovery sin lugar en la propuesta se declara aquí como supuesto
explícito — no se improvisa (CODING.md §8 / SKILL §3).}

| #   | Supuesto / Decisión Pendiente | Estado                          |
| --- | ----------------------------- | ------------------------------- |
| 1   | {supuesto}                    | {Pendiente confirmar / discovery} |
| …   | {…}                           | {…}                             |

---

## 8. Compromisos del cliente para el éxito del proyecto

{Lo que el proyecto requiere del lado del cliente. Funda en
`04_ARCHITECTURE` (dependencias) + el discovery.}

- {compromiso confirmable}
- {…}

---

## 9. Próximos Pasos

{Funda en el plan / próximos pasos del `00_DISCOVERY_BRIEF`. Lista numerada.}

1. {paso}
2. {…}

<!--
  ════════════════════════════════════════════════════════════════════
  APÉNDICES — profundidad por tier.
  · negocio   → omitir Apéndice A/B (o versión a grandes rasgos sin internals).
  · ejecutivo → A/B a nivel concepto (capas + principios de seguridad), SIN internals.
  · developer → A/B/C/D completos CON internals (cifrado, transporte, contratos).
  Aplicar la regla tier-aware de SKILL §3 al instanciar cada apéndice.
  ════════════════════════════════════════════════════════════════════
-->

---

## Apéndice A — Arquitectura de la Solución

> {Detalle técnico para validación con el equipo del cliente. Profundidad por tier.}

{Diagrama ASCII de componentes + flujo seguro. `negocio` → 4 piezas a grandes
rasgos. `ejecutivo`/`developer` → stack en capas. Funda en `04_ARCHITECTURE` +
`07_SK_LEVERAGE` (split "plataforma probada vs a medida").}

**Componentes:**

- {componente + responsabilidad}
- {…}

---

## Apéndice B — Garantías de Seguridad

> {Defensa en capas. Profundidad por tier — internals SOLO en developer.}

{Funda en `04_ARCHITECTURE` (posture de seguridad). `developer` lleva internals
(cifrado AES-256-GCM, transporte, validación sintáctica); `ejecutivo` los nombra
a nivel principio; `negocio` los describe en lenguaje de negocio.}

- {garantía de seguridad}
- {…}

---

## Apéndice C — Plan de Trabajo

> {Fases con entregables — NUNCA fechas duras sin confirmar (SKILL §3).}

### Fase 1 — {nombre} ({ventana relativa})

**Actividades:** {…}
**Entregables:** {…}

### Fase 2 — {…}

{…}

---

## Apéndice D — Inversión

> {Montos EXACTAMENTE como se confirmaron en CP1 (SKILL §3). Fuente: §1 de
> `00b_INTERNAL_ESTIMATE.md` o lo que dictó quien cotiza. NUNCA el desglose interno
> (puntos, tarifa por punto, cobertura, tokens, márgenes). Sin montos confirmados →
> solo la estructura, sin cifras.}

| Concepto | Inversión (MXN) |
| -------- | --------------: |
| Desarrollo v1 (setup one-time) | {$ total confirmado, o rango} |
| Soporte mensual — plan {Care / Pro / Priority} | {$ /mes} |
| Infraestructura (hosting + base de datos, pago directo al proveedor) | {~$ /mes} |

{Condiciones: forma de pago por fases, rondas de revisión incluidas, y que todo
alcance nuevo post-firma se cotiza aparte. Sin montos confirmados → reemplazar la
tabla por la estructura (setup one-time, operación mensual, planes opcionales,
consumo de terceros).}
