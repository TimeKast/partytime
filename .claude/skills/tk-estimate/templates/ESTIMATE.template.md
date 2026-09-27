---
doc: internal_estimate
project: {{NOMBRE_PROYECTO}}
source: {{backlog|brief|scoping}}
generated_at: {{FECHA}}
confidence: {{CONFIDENCE}}
version: 0.1
---

<!-- {{CONFIDENCE}} debe ser uno de: low | medium | high (valor literal). -->
<!-- Phase 5 DEBE reemplazar todos los {{...}} antes de guardar; un {{...}} literal en el output es bug. -->
<!-- La numeración de secciones es CONTRATO: /estimate refresh parsea §10 por header, y /proposal lee §1. -->

> ⚠️ **INTERNAL DOCUMENT — DO NOT SHARE WITH CLIENT**
> Solo las cifras de oferta de §1, confirmadas en el CP1 de `/proposal`, llegan al cliente.

---

# Cotización Interna — {{NOMBRE_PROYECTO}}

## 1. Resumen Ejecutivo

| Métrica                          | Optimista        | **Realista**        | Conservador         |
| -------------------------------- | ---------------: | ------------------: | ------------------: |
| Puntos totales                   | {{PTS_OPT}}      | **{{PTS_REAL}}**    | {{PTS_CONS}}        |
| Tier de proyecto                 | {{tier}}         | {{tier}}            | {{tier}}            |
| Semanas (velocity {{V}} pts/sem) | {{W_OPT}}        | {{W_REAL}}          | {{W_CONS}}          |
| Precio dirección (MXN)           | ${{DIR_OPT}}     | ${{DIR_REAL}}       | ${{DIR_CONS}}       |
| **Capacidad de Factory (MXN)**   | **${{FAC_OPT}}** | **${{FAC_REAL}}**   | **${{FAC_CONS}}**   |
| Cobertura de riesgo ({{COB}}%)   | ${{COB_OPT}}     | ${{COB_REAL}}       | ${{COB_CONS}}       |
| **Precio Total (MXN)**           | **${{TOT_OPT}}** | **${{TOT_REAL}}**   | **${{TOT_CONS}}**   |
| Soporte mensual sugerido         | Care ${{S_CARE}} | **Pro ${{S_PRO}}**  | Priority ${{S_PRI}} |
| Infraestructura mensual (MXN)    | ${{INFRA}}       | ${{INFRA}}          | ${{INFRA}}          |

> **Recomendación:** anclar la negociación en **Realista**; Conservador es el colchón interno.
> {{Si aplica piso: "Total ajustado al piso de ${{PISO}} — decisión comercial {{en modo equipo: bajo el costo de entrega}}."}}

---

## 2. Fuente y Confianza

| Campo | Valor |
| ----- | ----- |
| Fuente | {{backlog / brief / scoping rápido}} |
| Confidence | {{low / medium / high}} |
| Pricing mode | {{interim / calibrated}} |
| Tarifas | {{defaults del kit / override del host}} — `last_confirmed: {{FECHA_RATES}}` |
| Modo de compensación | {{solo / equipo}} |
| Issues puntuados | {{N}} ({{M}} marcados inciertos) |
| Warnings | {{ej. "estimate de scoping — validar con /discovery antes de /proposal" / ninguno}} |

---

## 3. Desglose por Epic e Issue

<!-- E1 (refresh) trata esta sección como FUENTE DE VERDAD y NUNCA la reescribe. -->

| Epic | ID | Issue | pts (min/real/max) | Incierto | Lote | Razonamiento (1 línea) | Flag |
| ---- | -- | ----- | :----------------: | :------: | :--: | ---------------------- | ---- |
| {{EPIC-01}} | {{ISSUE-001}} | {{título}} | {{3/5/8}} | {{sí/no}} | {{—/sí (sin regla: N)}} | {{por qué 5 y no 3}} | {{—/dividir}} |

**Totales:** OPT = {{PTS_OPT}} · REAL = {{PTS_REAL}} · CONS = {{PTS_CONS}}

---

## 4. Riesgo — Cobertura

### 4a. Señales marcadas

<!-- E1 preserva este sub-bloque intacto — es INPUT, no cálculo. -->

| Señal | Pts | Cita textual (fuente) |
| ----- | :-: | --------------------- |
| {{señal}} | {{n}} | "{{cita}}" — {{archivo §}} |

### 4b. Score → cobertura

<!-- E1 REESCRIBE este sub-bloque a partir de 4a + §10. -->

```
score = {{N}} → nivel {{bajo|medio|alto|muy_alto}} → cobertura {{10|20|30|40}}%
```

**Cubre:** lo no visto al estimar + scope chico sin re-cotizar. **No cubre:** módulos nuevos, features
fuera de alcance, cambios de arquitectura.

---

## 5. Costos de Infraestructura

| Componente           | Servicio                          | USD/mes    | MXN/mes       |
| -------------------- | --------------------------------- | ---------: | ------------: |
| Compute              | Vercel ({{tier}})                 | ${{n}}     | ${{n_mxn}}    |
| Base de datos        | Neon ({{tier_neon}})              | ${{n}}     | ${{n_mxn}}    |
| Auth                 | Auth.js / Neon Auth (self-hosted) | **$0**     | **$0**        |
| Storage              | Vercel Blob (si hay upload)       | ${{n}}     | ${{n_mxn}}    |
| Email                | (si hay email transaccional)      | ${{n}}     | ${{n_mxn}}    |
| **Total mensual**    |                                   | **${{N}}** | **${{N_MX}}** |

> Validar precios contra el pricing vigente antes de cerrar.

---

## 6. Capacidad de Factory

```
modo calibrated:
  horas_dirigidas   = {{PTS_REAL}} / {{densidad}} = {{H}} h
  Capacidad_Factory = {{H}} × ${{costo_hora}} = ${{FAC_REAL}}
  Cons              = f({{PTS_CONS}} × 1.15)   = ${{FAC_CONS}}
```

{{Solo modo interim: tabla puntos → token-units → tokens → USD → MXN con factory_cost_model.}}

---

## 7. Modelo de Soporte Mensual

| Plan       | h/mes | Precio/mes (MXN) | SLA crítico | Updates     |
| ---------- | :---: | :--------------: | :---------: | :---------: |
| Care       | 4     | ${{S_CARE}}      | 48h         | best-effort |
| **Pro** ⭐ | 10    | **${{S_PRO}}**   | 24h         | incluidos   |
| Priority   | 20    | ${{S_PRI}}       | 8h          | incluidos   |

Default recomendado: Pro. Horas no usadas: rollover 1 mes.

---

## 8. Timeline

| Escenario    | Puntos        | Semanas (redondeo a media semana) |
| ------------ | :-----------: | :-------------------------------: |
| Optimista    | {{PTS_OPT}}   | {{W_OPT}}                         |
| **Realista** | {{PTS_REAL}}  | **{{W_REAL}}**                    |
| Conservador  | {{PTS_CONS}}  | {{W_CONS}}                        |

> Velocity = throughput de la Factory bajo la capacidad actual, NO duración del punto. Confianza
> {{media/baja}}. Incluye **{{rondas_revision_incluidas}}** rondas de revisión con el cliente.
> {{Si se usó el puente: curado {{D}} días activos → ~{{DC}} días de calendario.}}

---

## 9. Fórmula y Rangos Consolidados

```
Puntos_OPT  = Σ pts_min  = {{PTS_OPT}}
Puntos_REAL = Σ pts_real = {{PTS_REAL}}
Puntos_CONS = Σ pts_max  = {{PTS_CONS}}          # banda mínima aplicada: {{sí/no}}

Precio_Dirección(e) = Puntos(e) × {{tarifa_por_punto}}
Capacidad_Factory(e)= f(Puntos(e))                 # Cons: f(Puntos_CONS × 1.15)
Precio_Total(e)     = max(({{BASE}} + Dirección(e) + Factory(e)) × (1 + {{COB}}%), {{PISO}})

Tarifa por punto implícita (Realista) = ${{TOT_REAL}} / {{PTS_REAL}} = ${{T_IMPL}}/pt
{{Puente: hoja ÷ puntos = {{RATIO}}× vs curva esperada {{RATIO_ESP}}× — {{dentro / fuera (candado)}}}}
```

{{Si Opt=Real: "⚠️ Escenario optimista = realista: sin margen de reducción (piso Fibonacci)."}}

---

## 10. Assumptions Editables

> 🔧 **Edita este bloque y corre `/estimate refresh` para recalcular sin re-puntuar issues.**
> Snapshot de las tarifas resueltas (defaults del kit + override del host) al momento de E0.

```yaml
assumptions:
  schema: story_points_v1

  pricing:
    mode: {{interim|calibrated}}
    precio_base_mxn: {{BASE}}
    precio_minimo_proyecto_mxn: {{PISO}}
    tarifa_por_punto_mxn: {{TARIFA}}
    tarifa_hora_dirigida_objetivo_mxn: {{n}}
    moneda: MXN
    usd_to_mxn: {{n}}

  calibration:
    velocity_pts_semana: {{V}}
    densidad_pts_por_hora_dirigida: {{n}}
    costo_factory_mxn_por_hora_dirigida: {{n}}
    token_units_por_punto: {{n}}       # solo modo interim

  riesgo:
    score: {{N}}
    nivel: {{bajo|medio|alto|muy_alto}}
    cobertura_pct: {{10|20|30|40}}     # piso 10%
    senales: []                        # cada una con su cita textual
    consumida_pct: 0                   # se actualiza durante el proyecto

  compensacion:
    modo: {{solo|equipo}}
    sp_por_dia_activo: {{n}}

  infra:
    vercel_tier_usd_per_month: {{n}}
    neon_usd_per_month: {{n}}
    auth_provider: {{authjs|neon_auth}}
    has_blob_storage: {{true|false}}
    has_email: {{true|false}}

  support:
    care_mxn: {{n}}
    pro_mxn: {{n}}
    priority_mxn: {{n}}
    support_plan_default: pro          # care | pro | priority

  policy:
    rondas_revision_incluidas: {{n}}

  confidence: {{CONFIDENCE}}
```

---

## 11. Exclusiones de Scope + Issues Subestimados

<!-- Poblado en el checkpoint de Phase 4. E1 preserva esta sección intacta. -->

**Exclusiones de scope (no incluido en esta cotización):**

- {{exclusión 1}}

**Issues potencialmente subestimados (revisados en el checkpoint):**

- {{ISSUE-XXX: razón / ninguno}}

**Riesgos que podrían mover el precio:**

- {{ej. contenido del cliente no listo, acceso a stakeholder, migración legacy}}

---

## 12. Next Steps

1. Revisar §10 y ajustar si aplica → `/estimate refresh`.
2. Si un issue está mal puntuado: regenerar E0, no editar §3 a mano.
3. Aprobado internamente → `/proposal`: su CP1 propone las cifras de oferta de §1 para confirmarlas.
4. Durante el proyecto: registrar el consumo de la bolsa de cobertura en §10 (`consumida_pct`).
5. Post-entrega: registrar puntos entregados y horas medidas → recalibrar las tarifas (skill §5).

---

_TimeKast Factory — Internal Estimate (story points) · Generado por `/estimate`_
