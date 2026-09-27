<!--
  ===== tk-backlog: REMEDIATION PLAN template =====
  El shape que `/implement` Phase 5.2 escribe cuando cierra un epic con deuda pendiente,
  y que `/backlog` consume después SIN edición manual.

  Vive en tk-backlog (no en tk-implement) porque el contrato que debe satisfacer es el del
  parser de plan-mode: `methodology/plan-mode-input.md` §Required plan content + §Step 1-3.
  Mismo patrón C5 que protege a `tk-design` como consumidor externo del parser — si esas
  reglas cambian, este template cambia con ellas.

  DOS DESTINOS, mismo shape. `/implement` emite un archivo por destino:

    Deuda DENTRO de la frontera del epic  →  /backlog extend-epic EPIC-NN <plan>
    Deuda FUERA de la frontera            →  /backlog add <plan>   (epic nuevo)

  Regla anti-proliferación para el segundo: si ya hay un epic de deuda ABIERTO en el layout
  activo, se extiende con `extend-epic`; si no, `add` crea uno. Máximo uno abierto a la vez;
  cierra normal cuando se implementa.

  Path: project/backlog/{LAYOUT}/remediation/EPIC-NN-{run-id}.md        → deuda DENTRO
        project/backlog/{LAYOUT}/remediation/EPIC-NN-{run-id}-fuera.md  → deuda FUERA
  (TRACKED los dos — nunca implement-artifacts/, que está gitignored: cada issue
  emitido lleva `> **Plan source:** <path> (hash: <sha-12>)` y nacería con una ref
  muerta).

  La deuda FUERA de la frontera del epic va TODA consolidada en ese único archivo,
  con N ítems (`tk-implement §5.2`) → una sola corrida de `/backlog add`. Los dos
  archivos NUNCA se fusionan: cada corrida de /backlog consume UN plan con UN
  destino, y el parser no lleva noción de destino por ítem.

  🔴 INMUTABLE tras escribirse. El hash del archivo alimenta el drift detection de
  `/backlog validar`; un archivo que se re-edita reporta CHANGED en cada corrida, para
  siempre. Un run nuevo escribe un archivo nuevo — nunca appendea a éste.
-->

# Remediación — {{EPIC-NN-slug}} · run {{RUN-ID}}

> Deuda que `/implement` Phase 4.7 no pudo cerrar en la corrida del {{YYYY-MM-DD}}.
> Destino: **{{`extend-epic EPIC-NN` | `add` (epic nuevo de deuda)}}**.
> Origen de cada ítem: el `## QC Delta (Phase 4.7 — …)` del epic file.

## Contexto

{{2-4 líneas: qué entregó el epic y por qué estos puntos quedaron fuera. Sin repetir los
ítems — el parser lee esta sección como prose-non-issue y es correcto que así sea.}}

---

<!--
  A PARTIR DE AQUÍ: UN HEADING POR ÍTEM. Nunca por bucket.

  🔴 `Issue: sí` — OBLIGATORIO, PRIMERA LÍNEA DEL CUERPO DE CADA ÍTEM

  Es el marcador explícito de `plan-mode-input.md` §Step 2 (fila 1): la unidad se clasifica
  como issue SIN pasar por la evaluación semántica del heading. Es la única garantía dura
  de que el ítem sobrevive; todo lo de abajo es defensa en profundidad.

  🔴 CÓMO TITULAR (segunda línea de defensa, por si el marcador se pierde en una edición)

  `plan-mode-input.md` §Step 2 clasifica con FIRST MATCH WINS, y tras el marcador la
  siguiente fila es "process heading": descarta como prose-non-issue, por match SEMÁNTICO
  ES/EN, cualquier heading que suene a Contexto · Antecedentes · Secuencia · Rollout ·
  Riesgos · Verificación · Fuera de alcance · Archivos críticos · Decisiones.

  Tener `Files:` NO rescata un heading que matcheó — la clasificación ocurre antes.

  ✅ TITULAR EN IMPERATIVO DE ACCIÓN. Un heading que abre con verbo describe un cambio,
     no un proceso, y no cae en la lista:
       "Definir si el borrado es lógico o definitivo"
       "Migrar el módulo de reportes al patrón de paginación actual"
       "Corregir el filtro de estado que no limpia la búsqueda"

  ❌ NUNCA titular con la pregunta, el sustantivo o el bucket:
       "El borrado, ¿es lógico o definitivo?"     → suena a Decisión → descartado
       "Riesgo de race condition en el filtro"    → suena a Riesgos  → descartado
       "Decisiones pendientes" / "Fuera de alcance" (buckets) → descartados

  CP-B agrupa por bucket porque lo lee un humano. Este archivo lo lee un parser. Son dos
  representaciones del mismo contenido y no deben compartir formato.

  El heading es además el ANCHOR estable del `> **Plan source:** <path>#<anchor>` de cada
  issue emitido — no renombrarlo después de emitir.
-->

## {{Verbo en imperativo + qué}}

Issue: sí

{{2-5 líneas: qué se encontró y qué hay que hacer. Si la clase es `decisión`, enunciar los
caminos posibles y qué cambia entre ellos — es lo que el implementador necesita para elegir.}}

Files:

- `{{path/al/archivo.ts}}` — {{qué se toca ahí}}
- `{{path/al/otro.tsx}}` — {{…}}

<!--
  🔴 ≥1 archivo, EN LISTA. `plan-mode-input.md` §Step 3 — File attribution: sólo los enumerados en una lista cuentan
  como modify-targets; una cita en prosa (`foo.ts:82`) es read-reference y NO se atribuye.
  Sin archivos, la unidad dispara STOP y aborta la corrida completa de `/backlog`.

  · Clase `rompe` / `está mal` → los archivos del fix, que ya se conocen.
  · Clase `decisión`          → la UNIÓN de los archivos candidatos de los caminos posibles.
                                No está decidido CUÁL camino, pero sí DÓNDE caería cada uno.
  · Sin ningún archivo derivable → el ítem NO va a este plan. Se queda reportado en el
                                   QC delta del epic. Uno solo abortaría toda la corrida.
-->

Verificación:

- {{Cómo se comprueba que quedó resuelto — 1 bullet como mínimo, específico a ESTE ítem}}

<!--
  🔴 ≥1 bullet POR ÍTEM, no una sección global. El Gherkin del issue (issue-shape §4) se
  deriva de aquí: una verificación genérica produce escenarios inventados, que es
  exactamente lo que el hard-requirement del parser existe para evitar.

  🔴 SI EL BULLET SE VERIFICA CON UNA BÚSQUEDA, se redacta con vocabulario INDEPENDIENTE
  del cambio que verifica. La regla de autoría y sus tres componentes viven en
  `plan-mode-input.md` §Authoring de verification bullets — LÉELA AHÍ. No se reproduce en
  este template a propósito: una copia local diverge en el primer ajuste de la regla, y el
  productor de /implement escribe con el mismo estándar que el specer de /backlog.
-->

Refutado: {{la consulta que corrió — el grep, el test, el comando}}

<!--
  OPCIONAL (RF-prev) — y sólo si el ítem realmente pasó por la refutación de deuda de
  `tk-implement §4.7.2.1`, que corre SOBRE LO QUE SALIÓ DE LA FRONTERA del epic. En la
  práctica: la lleva el archivo `EPIC-NN-{run-id}-fuera.md`, NUNCA el `EPIC-NN-{run-id}.md`
  del propio epic — esa deuda no pasó por la refutación, y estampar la línea ahí afirmaría
  una verificación que no ocurrió. Detalle de autoría en `tk-implement §5.2`.
  Transporta ESE trabajo a través de la frontera entre workflows:
  `/backlog` corre en otra sesión y lo único que recibe es este archivo, así que sin la
  línea el panel adversarial de `tk-backlog §12.5` vuelve a preguntar "¿esto existe?" sobre
  algo que ya se verificó con el repo caliente.

  · Va la CONSULTA, no la conclusión — clase de evidencia cerrada de `fx-execution-policy §7`
    (test rojo · línea de log · resultado de una búsqueda en el código). "Ya lo revisé" NO
    califica y es peor que omitir la línea.
  · Omitirla es seguro y es el default: el panel pregunta todo. La ausencia NUNCA se lee
    como "ya refutado" — sólo la presencia de una consulta concreta acota el panel.
  · Refuta el ÍTEM, no la descomposición: el panel igual juzga si esto son dos unidades,
    si el orden deja el repo roto, y si falta una pieza. Esa parte no la cubre nadie aguas
    arriba.
-->

---

## {{Siguiente ítem — mismo shape}}

Issue: sí

{{…}}

Files:

- `{{…}}`

Verificación:

- {{…}}

---

<!--
  CIERRE DEL CICLO — lo hace `/implement`, no este template:

  Al emitir, `/implement` anuncia N ítems en CP-B y escribe N unidades aquí. Después de
  correr `/backlog`, comparar los issues emitidos contra N: si no coinciden, el parser
  descartó alguno (§Step 2) y hay que revisar su heading. Es lo que convierte un drop
  silencioso en uno detectable sin tener que auditar el parser.
-->
