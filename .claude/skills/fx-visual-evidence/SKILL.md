---
name: fx-visual-evidence
description: Factory-internal harness that produces RENDERED evidence of the UI: screenshots of every declared surface × every theme of the active skin × the kit's three widths (plus the project's own) and declared interaction states, with contrast measured on the live DOM, and a manifest that `ui-critic` consumes. Runs as the opt-in `evidence` phase of the E2E runner (`pnpm evidence:visual`), never by driving Playwright directly. Invoke when auditing UI, when DS4 is "no demostrado", or to add a screen.
family: factory-internal
runtime: true
last-verified: 2026-09-22
user-invocable: false
---

# fx-visual-evidence — evidencia visual renderizada

> **El problema que existe para cerrar.** `ui-critic` audita interfaz con `Read`, `Grep` y `Glob`: herramientas que leen **código**, no pantallas. Un veredicto "multi-tema: Pass" emitido así no es optimista — es una afirmación sobre algo que nadie miró. Este harness produce lo que faltaba: imágenes reales de la app corriendo, con datos reales, en cada tema y en cada ancho, y un manifest que le dice al agente qué es cada imagen.
>
> **Lo que NO hace: emitir el juicio.** Genera evidencia. El veredicto lo firma `ui-critic`, y la pasada humana antes de mergear sigue en pie.

---

## 1. ¿Cuándo se auto-carga?

Routing semántico (`CC.md §1.1`). Triggers típicos:

- "auditemos la UI", "corre `ui-critic`", un reporte suyo que dice **DS4 `no demostrado`**
- "agrega la pantalla X a las capturas", "¿por qué el manifest no trae contraste?"
- `/implement` Phase 4.4 y 4.7.5 (una vez por tramo del fix-loop, no por ronda) — el orquestador produce evidencia antes de spawnear a `ui-critic`
- Enganchar el harness en un proyecto que nació antes que él (§8)
- Edición de `scripts/tools/visual-evidence/**`, `tests/e2e/visual.evidence.spec.ts` o del proyecto `evidence` de `playwright.config.ts`

**NO se carga cuando:**

- Se audita una **especificación** en markdown (`/design` Phase 8): no hay pantalla que capturar y DS4 sale `no demostrado` por construcción.
- Se pregunta por las fases del runner en general → [`sk-e2e §1.7`](../sk-e2e/SKILL.md).
- Se pregunta qué temas define un skin → [`sk-skins`](../sk-skins/SKILL.md), que es el registro.

---

## 2. El punto de entrada

```bash
pnpm evidence:visual                                    # toda la matriz
EVIDENCE_SURFACES=dashboard,login pnpm evidence:visual  # sólo esas superficies
```

`pnpm evidence:visual` es exactamente `pnpm test:e2e --project=evidence`.

| Qué                          | Dónde                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Las capturas                 | `tests/.evidence/<timestamp>/<superficie>__<tema>__<ancho>__<estado>.png`                           |
| El manifest                  | `tests/.evidence/<timestamp>/manifest.json`                                                          |
| Puntero al más reciente      | `tests/.evidence/latest.json` — para no adivinar el timestamp                                        |
| Ignorado por git             | sí, `tests/.evidence/` (igual que `tests/.auth/`): son pantallas autenticadas con datos sembrados   |

**Una carpeta por corrida, y es lo que hace la evidencia durable.** Playwright **borra** su `outputDir` al arrancar; escribir la evidencia ahí significa que la corrida N+1 borra la de la corrida N a media ejecución, sin aviso. `tests/.evidence/` no es el `outputDir` de nadie, y dentro cada corrida tiene su propio directorio: correr el harness dos veces seguidas deja **dos** juegos de capturas, no uno pisando al otro.

### Qué produce, exactamente

```jsonc
{
  "schema": "timekast.visual-evidence/4",
  "runId": "2026-08-25T18-40-11-903Z",
  "generatedAt": "2026-08-25T18-42-58.114Z",
  "baseURL": "http://localhost:31042",
  "codeSeal": { "codeCommit": "b3000ad2feed…", "codeDirty": false, "inputs": ["src", "…"], /* … */ },  // DE QUÉ CÓDIGO salió — §2.1
  "skin": "neomorphism",          // el skin ACTIVO de ese checkout, no un default del kit
  "themes": ["light", "midnight", "dark"],  // los que ESE skin declara — otro declara otros
  "viewports": [{ "name": "narrow", "width": 375, "height": 812 }, /* medium, wide */],
  "surfaces": [{ "name": "dashboard", "route": "/dashboard", "role": "admin", "purpose": "…" }],
  "captures": [
    {
      "surface": "dashboard",
      "theme": "midnight",
      "viewport": { "name": "medium", "width": 768, "height": 1024 },
      "state": "rest",              // en reposo, o el estado que la superficie declaró — §4
      // "prepared": true, "landedAt": "/investments/42"   ← sólo en una celda que un `prepare` del proyecto alcanzó (§4.2)
      "screenshot": "dashboard__midnight__medium__rest.png",
      "contrast": {
        "samples": 118, "evaluated": 114, "min": 4.83, "failing": 0, "failures": [], "pass": true,
        "notApplicable": 2,   // texto DECLARADO decorativo: nunca medido, nunca falla — y nunca oculto (§2.3)
        "exemptions": { "ariaHidden": 2, "presentation": 0, "excluded": 0 }
      }
    }
  ],
  "staleExclusions": [],      // exclusiones del proyecto que ya no apuntan a nada (§5)
  "contrastExclusions": [],   // los selectores que el proyecto declaró decorativos, tal cual (§2.3)
  "skippedSurfaces": [],      // pantallas del KIT que este checkout no tiene (§5.1)
  "skippedStates": [],        // estados de una pantalla del KIT que este checkout no alcanzó (§4.1)
  "unpreparedSurfaces": []    // superficies del PROYECTO cuyo `prepare` no encontró qué fotografiar (§4.2)
}
```

🔴 **El `schema` es `/4`, y los dos últimos saltos no fueron cosméticos.** En `/3` fue la
**cardinalidad** de `captures`: hasta `/2` había exactamente **una** fila por
`(superficie, tema, ancho)`, y con el eje de estado hay una por estado — un consumidor que agrupaba
por esos tres, que es justo lo que hace `ui-critic` para comparar una pantalla entre temas (DS4),
ahora encuentra dos, y comparar una captura enfocada contra una en reposo se reportaría como
defecto de la pantalla. Por eso el nombre del archivo ganó un cuarto segmento. En `/4` fue el
**sello**: cambió de forma y, con él, la operación que hace cada consumidor (§2.1). Un manifest
`/3` no trae `codeCommit`, así que un lector nuevo que lo comparara obtendría `undefined` contra un
commit real y respondería «no corresponde» a todo, en silencio; el tag es lo que le permite decir
en cambio *este manifest es anterior al sello por código, recaptura*. Una clave nueva no habría
justificado ninguno de los dos saltos; un conjunto que se **parte** bajo la agrupación de un lector
—o una comparación que deja de estar definida— sí.

🔴 **Una captura es el ÁREA VISIBLE de la pantalla en ese ancho, no el documento completo.** El
harness dispara `page.screenshot()` sin `fullPage` (`CAPTURE_FULL_PAGE`, `scripts/tools/visual-evidence/capture.ts`),
y la razón es un artefacto que mentía: con el lienzo del documento entero, el navegador dibuja cada
elemento **fijo** en su posición de viewport sobre esa altura, así que la barra inferior del kit
(`bottom-0`) salía estampada a media página, encima del contenido. Un auditor estuvo a punto de
reportar un solapamiento que la pantalla real no tiene — el shell sí reserva ese espacio
(`pb-content-safe`). El precio se acepta a propósito: una pantalla más alta que el viewport pierde
lo que queda bajo el pliegue, y esa es justo la pregunta que responde la matriz de tres anchos —
qué ve el usuario en cada uno. Una superficie que de verdad necesite el lienzo completo tendría que
declararlo por superficie; no se vuelve a poner a todas en el ajuste que miente.

El `contrast` de cada captura se **mide sobre el DOM vivo de esa captura** — el color computado del texto y el fondo real que quedó detrás de él, con la relación WCAG calculada sobre eso — y **sobre la misma área visible que la imagen muestra**: las muestras se recortan a esa banda (`clipSamplesToViewport`), así que el número y la imagen describen lo mismo. El recorte es una **intersección** con el área fotografiada, nunca algo más estricto: un título partido por el pliegue sigue contando, porque el lector de la imagen lo ve. No es una regla estática ni una auditoría de tokens: responde a qué resolvió realmente la pantalla después del skin, del tema, de los ancestros y de cada `color-mix`.

Dos cosas que ese campo aprendió pagando una corrida entera en blanco, y que están en el código, no acá: **(a) la notación que llega no es la que se escribió** — los tokens se autoran en `oklch()` y el build de producción los sirve como `lab()`, así que el parser entiende ambas (más `rgb()`, hex y `lch()`), y lo que no entiende se cuenta como **no evaluado** en vez de adivinarse; **(b) un fondo translúcido se compone sobre el fondo que de verdad tiene debajo**, nunca sobre blanco — componer sobre blanco en un tema oscuro produce un número que describe una pantalla inexistente, justo en el eje multi-tema que este campo existe para probar. `evaluated` junto a `samples` es lo que hace visible el hueco: una captura con muestras y cero evaluadas **falla la corrida** — que es lo único del contraste que la falla: un ratio bajo el umbral **nunca** lo hace (§2.3).

### 2.1 El sello — de qué código salió esta evidencia

`generatedAt` dice **cuándo** se capturó. No dice **de qué código**, y esa es la pregunta que
importa: un manifest tomado antes de un arreglo y uno tomado después son dos timestamps, y el
código no tiene ninguno. `/implement §4.4` permite reusar un manifest previo "sólo si es posterior
al último cambio de código" — una regla que sin el sello es **prosa sin nada contra qué
comprobarse**, y con él es un `jq` contra `git`.

```jsonc
// Lo normal: la evidencia es del código que dejó ese commit, y ese código estaba commiteado.
"codeSeal": { "commit": "200e0fa3…", "dirty": false,
              "codeCommit": "b3000ad2…", "codeDirty": false, "inputs": ["src", "…"] }

// El árbol tenía trabajo suelto, pero NADA que pueda repintar una pantalla (un plan, un scratch).
"codeSeal": { "commit": "200e0fa3…", "dirty": true,
              "codeCommit": "b3000ad2…", "codeDirty": false, "inputs": ["src", "…"] }

// Había código sin commitear: la evidencia no se puede atribuir a ningún commit.
"codeSeal": { "commit": "200e0fa3…", "dirty": true,
              "codeCommit": "b3000ad2…", "codeDirty": true,  "inputs": ["src", "…"] }

// git no pudo responder: sin sellar, y la nota dice por qué.
"codeSeal": { "commit": null, "dirty": null,
              "codeCommit": null, "codeDirty": null, "inputs": ["src", "…"], "note": "…" }
```

**Son dos pares, y sólo el segundo decide.** El primero describe el **checkout**; el segundo, el
**código que dibuja**.

| Campo        | Qué afirma                                                                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commit`     | El `git rev-parse HEAD` del checkout al capturar. **Contexto** — es cómo un humano ubica la corrida en el tiempo, no lo que se compara                     |
| `dirty`      | Si `git status --porcelain` reportó algo en **todo** el árbol — incluye archivos sin trackear. También contexto                                           |
| `codeCommit` | 🔴 **El valor que se compara.** El último commit alcanzable desde `HEAD` que tocó una ruta de `inputs`. `null` **es un valor válido**                      |
| `codeDirty`  | 🔴 Si había algo sin commitear **dentro de `inputs`** — archivos sin trackear incluidos                                                                    |
| `inputs`     | Las rutas contra las que se midieron los dos campos anteriores, tal como estaban al capturar. Viajan en el manifest para que la comparación sea un comando |
| `note`       | Presente **siempre** que falte alguna respuesta, nombrando **todas** las causas, no la primera                                                            |

🔴 **Se sella por el código que dibuja, no por `HEAD`, y eso es lo que quitó un costo real.** Sellar
por `HEAD` respondía una pregunta que nadie hace —*¿se hizo algún commit?*— y cobraba caro: en la
corrida de EPIC-16 el commit que **cerró** un issue no tocó más que markdown del backlog, y costó
una recaptura completa. Dos commits pueden ser un repintado o una errata en un documento, y sólo
las rutas de `inputs` los distinguen.

**Qué hay en `inputs`: el registro de entradas del stamp de build del runner de e2e, completo.** Ese
registro ya contesta exactamente esta pregunta para otro consumidor (*¿puedo reusar la app
compilada?*), y la contesta en **tres piezas**: `BUILD_SOURCE_DIRS` (`src`, `public`, `types`),
`BUILD_SOURCE_FILES` (los archivos raíz que lee `next build` — `next.config.*`, `tailwind.config.*`,
`postcss.config.*`, `package.json`, los lockfiles, `components.json`, `instrumentation*`, las
configs de Sentry, la cadena de env de producción) y lo que el **proyecto** declare en
`package.json#e2eBuildInputs`. 🔴 **Tomar sólo los directorios no alcanza:** dejaría el sello ciego a
`tailwind.config.ts`, así que un tema recompilado repintaría todo sin mover el sello y la evidencia
vieja se certificaría como fresca. Reusar un **subconjunto** de un registro es justo lo que
[`kb-ssot-registries`](../kb-ssot-registries/SKILL.md) prohíbe, y aquí el subconjunto fallaría en
silencio en vez de romperse a la vista. Por eso el cálculo **importa** las tres piezas de
`scripts/tools/e2e-runner.ts` en vez de repetirlas.

🔴 **Qué queda FUERA de `inputs`, declarado: `scripts/tools/visual-evidence/**` — el harness
mismo.** Ese directorio sí decide qué **muestra** una captura (el ancho, el recorte de la medición
de contraste, qué estados se fotografían), así que el enunciado de arriba —"las rutas cuyo
contenido puede cambiar lo que una captura muestra"— promete un poco más de lo que el conjunto
entrega. **La exclusión es una decisión, no un olvido:** endurecerla invalidaría la evidencia en
**cada** edición del harness, que es justo la fricción que el sello por código vino a eliminar (un
commit de backlog llegó a costar una recaptura completa). Y hoy la exposición es **nula** por una
razón mecánica: un cambio en la **forma** de lo que se captura mueve el tag de esquema del
manifest, y un consumidor que lee un tag viejo recaptura de todos modos. El día que un cambio
altere la imagen **sin** tocar el esquema, este conjunto es donde se corrige — el mismo enunciado
vive en el JSDoc de `sealInputs()`.

🔴 **Los dos `dirty` cuentan los archivos sin trackear, y eso es deliberado y definitivo.** No es una
aproximación pendiente de afinarse a "solo cambios trackeados": la pregunta que el sello responde
es *¿esta evidencia describe el código que alguien va a revisar?*, y un archivo nuevo sin commitear
la mueve igual que uno editado. Lo que se acotó es **qué rutas** se preguntan, nunca si un archivo
sin trackear cuenta. Dos razones que siguen en pie:

1. **Un hueco real seguiría abierto sin ellos.** Next.js resuelve varios archivos **por convención**
   — `layout.tsx`, `template.tsx`, `loading.tsx`, `src/proxy.ts`: **agregar** uno cambia cómo
   renderiza una superficie ya fotografiada sin que ningún archivo trackeado cambie. `src/` está
   dentro de `inputs`, así que `codeDirty` lo sigue atrapando. Un sello ciego a eso declararía
   limpio ese árbol y dejaría que la evidencia vieja avale código nuevo.
2. **Los costos no son simétricos.** Un `codeDirty: true` de más cuesta una corrida de captura **y,
   si ese manifest llega igual a una auditoría, el veredicto renderizado de esa corrida**:
   `ui-critic` baja a *no demostrado* cada hallazgo que dependía de una captura con sello sucio. Un
   `codeDirty: false` de más cuesta un veredicto firmado como `pantalla vista` sobre pantallas que
   ya no son las que están en el código.

🔴 **De ahí la regla operativa: para una auditoría, el CÓDIGO se commitea (o se saca del árbol) ANTES
de capturar.** Con `codeDirty: true` las capturas pueden ser perfectas y aun así `ui-critic` degrada
cada hallazgo `pantalla vista` a *no demostrado* — no firma nada, y la corrida de captura se pagó
para nada. El orden es: commitear lo que toca código → `pnpm evidence:visual` → spawnear la
auditoría. **Un plan o un scratch fuera de `inputs` ya no obliga a nada:** enciende `dirty`, que es
contexto, y deja `codeDirty` en `false`. Los casos que lo fijan viven en
`scripts/tools/__tests__/visual-evidence-git.test.ts`.

🔴 **Un sello nunca se adivina.** Fuera de un repo git, sin binario `git`, en un repo sin commits, o
en un historial donde ningún commit tocó una entrada de código, el sello sale `codeCommit: null`
**con su nota** y la corrida sigue normal — degrada declarándolo. Lo que no puede pasar es un sello
que **parezca** válido sin serlo (un `HEAD` literal, una cadena vacía, el valor de otra corrida, o
caer de vuelta en la respuesta del árbol completo cuando falta la acotada): eso es lo que un
consumidor compararía contra un sha real obteniendo una respuesta en silencio.

**Quién compara, y con qué — porque un sello que nadie sabe comparar apaga todo.** Es el modo de
falla más caro de este campo: `ui-critic` baja a *no demostrado* cada hallazgo `pantalla vista` que
no puede atribuir, así que un sello incomparable apagaría los veredictos visuales del kit entero, de
forma permanente y silenciosa. Por eso el sello sigue siendo **un id de commit** y no un hash de
contenido:

| Consumidor                               | Qué compara                                                                                       | Con qué                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [`ui-critic`](../../agents/ui-critic.md) | `codeSeal.codeCommit` contra el **commit de código** que le pasó quien lo spawneó — una igualdad de cadenas | Nada: tiene `Read`, `Grep` y `Glob`, y no le hace falta un shell                  |
| `/implement §4.4`                        | Lo mismo, pero recalculando el valor de ahora                                                        | `git rev-list -1 HEAD -- $(jq -r '.codeSeal.inputs[]' <manifest>)` — un solo comando, con las rutas que el propio manifest trae |

Que `inputs` viaje en el manifest es lo que hace ese comando autosuficiente: ningún documento tiene
que copiar el registro del kit para poder comparar. Y un manifest **sin** `inputs` (esquema `/3` o
anterior) **no se compara, se recaptura** — `git rev-list -1 HEAD --` sin pathspecs responde por el
árbol entero, o sea una respuesta plausible a otra pregunta.

### 2.2 La carpeta de salida se comprueba, no se supone

Antes de escribir nada, el harness le pregunta a git si `tests/.evidence/` está ignorado
(`git check-ignore`). Son **pantallas autenticadas con datos sembrados**: en este repo la línea
del `.gitignore` viajó con el harness, pero un derivado con adopción parcial (aplicó el spec, se
saltó el paso) puede commitearlas con un `git add` amplio.

- **No está ignorado** → banner prominente al **inicio** (para que el arreglo preceda a la
  escritura) y otra vez al **final** (donde se lee el resumen), con la línea exacta a agregar.
- **Git no pudo responder** (sin `.git/`, sin binario) → un aviso de una línea, **nunca** el
  banner de fuga: un banner que grita en cada checkout sin repo es uno que nadie lee el día que
  tiene razón.
- **Avisa, no rompe.** La corrida que hace la comprobación no es la que está en riesgo, y matarla
  destruiría una auditoría legítima por una línea que falta en el `.gitignore` de alguien más. Es
  la misma decisión que el runner ya toma con el cableado del guard de DB y del env de CI
  ([`sk-e2e §1.6`](../sk-e2e/SKILL.md)): fuerte, dos veces, nunca un abort.

### 2.3 El contraste es un DATO, nunca una compuerta de la corrida

🔴 **El harness no gatea por contraste, y esa es la política declarada — no un pendiente.** Un
**ratio bajo el umbral** no falla la corrida: una captura con texto que no llega a AA, veinte o
todas terminan **en verde** y escriben su manifest igual. Quien firma el juicio es
[`ui-critic`](../../agents/ui-critic.md) sobre ese manifest, con la pasada humana antes de mergear
detrás. Es la misma frontera del encabezado de este documento — el harness **produce evidencia, no
emite el veredicto** — aplicada al único campo donde tentaba romperla.

🔴 **Lo único del contraste que SÍ falla la corrida es el dato ausente, y la distinción no es un
matiz.** `pass` es `evaluated > 0 && failing === 0` (§2), así que la bandera se apaga por dos
hechos distintos: **una pantalla mala** (`failing > 0` — información, nunca compuerta) o **el
pipeline de medición muerto** (muestras cosechadas y **cero** evaluadas, con `min` en `null`). Lo
segundo no es un veredicto sobre la interfaz: es un manifest cuya columna de contraste no prueba
nada, y dejarlo pasar produce exactamente el "no había nada que auditar" leído como "sin
hallazgos". Por eso ahí la corrida **revienta**, nombrando las capturas afectadas.

> **Dónde viven esas aserciones, dicho con honestidad.** En `tests/e2e/visual.evidence.spec.ts`,
> que **no** es un path trackeado: nace con el proyecto y ningún `factory update` lo reescribe (§7).
> Un derivado las tiene sólo si su spec las trajo al adoptar el harness, y si no las tiene, un
> pipeline de medición muerto le sale en verde. El remedio es el mismo que para el resto del
> cableado: la [guía de adopción](../../docs/retrofits/visual-evidence-adoption.md).

**Por qué convertirlo en compuerta apagaría el manifest justo cuando más se necesita.** Si el
harness corre y **falla**, [`/implement §4.4`](../tk-implement/SKILL.md) sigue **sin** manifest y
`ui-critic` reporta DS4 y DS7 como *no demostrado* por su cláusula de degradación. O sea: en
cualquier checkout con **una sola** muestra bajo AA, gatear produciría "no demostrado" de forma
permanente — justo donde sale un `Fail` de DS7 que nombra superficie, tema y ratio medido. Se
cambiaría información medible por silencio, y el silencio se lee igual que "no había nada que
auditar".

**Y la compuerta ya existe, en la capa correcta, con nombre propio.** Es el check **`DS7 —
Contrast`** de [`ui-critic`](../../agents/ui-critic.md) (Part 1, severidad BLOCKER): se evalúa sobre
el campo `contrast` de las capturas del manifest, un incumplimiento sale como `Fail` citando
superficie / tema / ancho / ratio, y el retrabajo se abre como issue de arreglo del contraste real.
Ahí es donde un humano decide qué se corrige y qué es aceptable — decisión que un `exit 1` del
capturador tomaría por él, sin contexto y sin poder de matizar. El eslabón es verificable: sin esa
fila en la tabla de compliance, esta sección estaría delegando en nadie.

| Qué                                   | Quién                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| Medir el ratio sobre el DOM vivo      | Este harness (`summarizeContrast`) — reporta `pass`, `min`, `failing` y los ofensores |
| Emitir Pass / Fail sobre accesibilidad| [`ui-critic`](../../agents/ui-critic.md) leyendo el manifest — su check `DS7 — Contrast`  |
| Aceptar o rechazar el resultado       | La pasada humana antes de mergear                                                     |

**El umbral por muestra no se reabre.** `requiredRatio()` sigue siendo AA (4.5 texto normal · 3.0
texto grande, según tamaño y peso). Esta sección decide **qué se hace con el resultado**, nunca cuál
es la métrica.

🔴 **El texto decorativo es una TERCERA respuesta, declarada y contada — nunca una exención
silenciosa.** Este documento decía que sin compuerta no había nada que exentar y que un ratio bajo
en un elemento legítimamente no-AA se reportaba como los demás "y el juicio lo emite quien puede
distinguirlos". La práctica lo refutó: un manifest real traía **148 fallas de contraste, 108 de
ellas las iniciales del avatar** junto al nombre completo, y las 40 que importaban quedaban
enterradas — un revisor que abre eso dos veces aprende a saltárselo. Peor: marcar las iniciales con
`aria-hidden` es el arreglo correcto (WCAG exime el texto decorativo, y además evita que un lector
de pantalla anuncie el nombre dos veces), y el barrido las seguía contando, así que el gate
castigaba la corrección correcta.

La cosecha honra ahora tres declaraciones: `aria-hidden="true"` y `role="presentation"` /
`role="none"` en el nodo o en cualquier ancestro, y `EXCLUDED_CONTRAST_SELECTORS` en
`tests/e2e/visual-evidence.surfaces.ts` (la granularidad entre "este elemento" y "toda la pantalla"
que la exclusión por superficie no daba — para texto que no puede llevar el atributo, un widget de
terceros). Lo que **no** cambia es la política de arriba: sigue sin haber compuerta, y una muestra
exenta **no es un pase** — es `notApplicable`, contada aparte de `samples`, con su clase en
`exemptions`, y los selectores del proyecto viajan tal cual en `contrastExclusions`. El harness
reporta la **declaración**; no la verifica. Por eso se cuenta en vez de borrarse: una pantalla que
"se limpia" exentando la mayor parte de su texto se ve distinta de una que lo arregló, y
[`ui-critic`](../../agents/ui-critic.md) lee ese número al lado de los medidos. Una lista de
exenciones que nadie ve es una forma de bajar el umbral sin decirlo; una que va en el manifest, no.

---

## 3. Por qué NO invoca Playwright por su cuenta

El harness es una **fase del runner de e2e** (`E2EPhase`, [`sk-e2e`](../sk-e2e/SKILL.md) §1.7), declarada `optIn`. Nunca un script que llame a `playwright test` por fuera. Tres razones, en orden de peso:

1. **El candado de la rama efímera no gana ninguna vía de excepción.** `tests/global-setup.ts` llama a `assertDisposableBranch()` (`scripts/tools/e2e-guard.ts`): rechaza cualquier corrida cuyo `DATABASE_URL` no sea la rama de Neon que el runner acaba de crear. Ese candado declara en su propio comentario que es un **anti-footgun, no una frontera de seguridad**, y que nada debe construirse encima como si lo fuera. Pedirle una excepción al harness sería exactamente eso.
2. **No es un rodeo: el harness necesita esa rama de todos modos.** Fotografiar pantallas vacías no demuestra nada. Las capturas necesitan la app real con datos sembrados — o sea, lo mismo que necesita el resto de la suite. Correr por fuera del runner no ahorra trabajo, lo duplica.
3. **`optIn` ya resuelve el único problema que quedaba** — que el harness no corra en cada `pnpm test:e2e` normal. No hace falta inventar otro mecanismo.

> **El costo, sin promesas de cifras.** Correr sólo `pnpm evidence:visual` **sigue pagando** el costo por-corrida del runner: crear la rama, migrar, sembrar, compilar (o reusar el build) y levantar el servidor. Lo que se salta es la **suite de specs normal**, que es lo que domina el tiempo total. Ninguna cifra de ahorro se promete aquí.

---

## 4. Qué se captura — la lista es un dato, en dos mitades

La matriz es **superficies declaradas × temas del skin activo × 3 anchos × los estados que esa superficie declara**. Ninguno de los cuatro ejes está escrito a mano dentro del spec. Cada celda produce **una imagen del área visible** de esa pantalla en ese ancho (§2), no del documento completo — por eso el ancho no es sólo el layout: también es cuánto de la pantalla entra en la evidencia.

| Mitad                    | Archivo                                            | ¿La toca `factory update`?                                                             |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Lista base del kit**   | `scripts/tools/visual-evidence/surfaces.ts`        | **Sí** — `scripts/**` es un path trackeado: el Factory agrega una pantalla y llega a la flota |
| **Lista del proyecto**   | `tests/e2e/visual-evidence.surfaces.ts`            | **Nunca** — `tests/**` nace congelado con el proyecto (`BR-FACTORY-006`)                 |

El harness **une** las dos. Una entrada del proyecto cuyo `name` repite el de una del kit la **reemplaza en su lugar** (así se conserva la pantalla apuntando a otra ruta), y un proyecto que no tiene una pantalla del kit la excluye por nombre. Cada superficie sale de la unión **etiquetada con su origen** (`kit` / `project`) — no es decoración: es lo que decide si una pantalla inalcanzable se salta o mata la corrida (§5.1).

**Quién carga la mitad del proyecto: el kit.** `scripts/tools/visual-evidence/project-surfaces.ts` —un archivo trackeado, que viaja— comprueba que el archivo exista y lo carga; `capture.ts` consume las dos listas al componer la matriz. Eso hace de la lista del proyecto un **punto de extensión declarado** ([`fx-extension-points §3`](../fx-extension-points/SKILL.md)) y no una convención: un derivado que todavía no tiene el archivo corre con las cuatro pantallas del kit y **sin ningún aviso** (es el estado normal), mientras que un archivo presente que no se puede cargar **corta la corrida** nombrándolo, en vez de fotografiar en silencio una matriz que nadie pidió.

- **La lista base son las cuatro pantallas que todo derivado tiene** porque el kit las shippea: `login` (sin sesión), `dashboard`, `profile` y `settings-users`.
- **Los temas salen del registro del skin activo** (`activeSkinThemes()` en `src/config/skins.ts`, [`sk-skins`](../sk-skins/SKILL.md)), y **cuántos son es una pregunta que sólo el registro contesta**: un skin declara los que declara — `fintech`, el activo por default en el kit, declara **dos** (`light` / `dark`); `neomorphism` declara tres. Ningún documento del kit repite la lista, y este tampoco: escribirla aquí la vuelve falsa el día que alguien cambia `ACTIVE_SKIN`. Insistir en un `midnight` que el skin nunca definió produciría una imagen con los tokens del fallback y el nombre del tema pedido — evidencia falsa, que es peor que ninguna.
- **Los tres anchos del kit incluyen el intermedio:** 375 (baseline mobile-first de `SK.md §3.2`), **768** y 1440. El de en medio es el que faltaba: una regresión que sólo aparecía en ese rango llegó a producción en un derivado real.
- **Y el intermedio es del proyecto.** Un segundo derivado aprendió la misma lección a **otro** ancho — sus rejillas pasan a cuatro columnas en la banda 1024-1180, y 768 no retrata nada de eso. Dos apps, un diagnóstico, dos números: el ancho correcto depende de **dónde cambia el layout de cada app**, así que el eje se declara en la lista del proyecto, `PROJECT_VIEWPORTS` en `tests/e2e/visual-evidence.surfaces.ts` (§9), con la misma mecánica que las superficies (`mergeViewports`): una entrada llamada `medium` **reemplaza** el 768 del kit en su lugar; un nombre nuevo **agrega** una columna. No hay mitad sustractiva — menos de tres anchos es fotografiar menos de lo que `SK.md §3.2` exige. Cada ancho admite un `why` de una línea que viaja al manifest: la razón es lo único que un revisor no puede recuperar del número. Lista ausente o vacía = los tres del kit, sin aviso.
- **Los estados viajan CON la superficie**, no en una lista global: `states: [{ name, focus }]` en la entrada de la pantalla (§9), y una pantalla que no es una ruta se alcanza con `prepare` — sólo en la lista del proyecto (§4.2). Así la lista del proyecto declara los suyos sin editar un archivo que el update reescribe, y el costo queda proporcional — un estado extra cuesta una celda por tema y por ancho **de esa pantalla**, no de todas.

### 4.1 Qué garantiza una captura con estado (y qué no)

Toda superficie se fotografía primero **en reposo** (`state: "rest"` — un valor explícito, nunca un
campo ausente: un lector tiene que poder distinguir "en reposo" de "manifest anterior a este eje").
Después, una captura por cada estado que declare.

**Lo que un estado de foco garantiza, exactamente:** la imagen se tomó con ese elemento enfocado
**y con el navegador en modalidad de teclado**. Lo segundo no es un detalle: `:focus-visible` es una
heurística, y sobre un `<button>` sólo se activa si el usuario está navegando con el teclado. Sin
esa pulsación previa, un botón enfocado por script se ve **idéntico** al de reposo — la evidencia
diría que un arreglo de foco no funciona cuando lo que falla es la captura. Por eso el harness
pulsa `Tab` (modalidad) y **después** mueve el foco al elemento que el estado nombra.

**Lo que NO garantiza:** que la primitiva enfocada esté en la pantalla. El foco tampoco se mueve a
un control **deshabilitado**, así que un selector que resuelve a uno produciría otra foto del
reposo — declara `:not([disabled])` cuando el control pueda estarlo.

| Un estado declarado que esta pantalla no alcanza… | Qué pasa                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| …en una superficie del **KIT**                       | Cuesta **sólo sus celdas** y queda declarado en `skippedStates` (superficie, estado, motivo, celdas) + aviso en consola. La pantalla **sí** se fotografía en reposo |
| …en una superficie del **PROYECTO**                  | **Mata la corrida**: el equipo escribió esa línea sobre su propia app — misma regla que una pantalla suya inalcanzable (§5.1) |

> **Por qué no es un cuarto motivo de falla.** El conjunto de tres (`integrity` / `availability` /
> `readiness`) es cerrado a propósito: lo que hace saltable a un rechazo es que **alguien decidió**
> sobre él, y un motivo inventado por situación es cómo ese conjunto deja de significar algo. Un
> elemento que la lista del kit nombra y esta pantalla no tiene **es** `readiness` — lo que cambia
> es la granularidad: el `readySelector` lo dice de la pantalla y cuesta la superficie entera; un
> estado lo dice de un elemento y cuesta sus celdas. Cobrar la superficie por un estado tiraría
> capturas reales de una pantalla que en reposo sale perfecta.

### 4.2 Estados profundos — una pantalla que no es una ruta (`prepare`, sólo en la lista del proyecto)

Un estado de foco es un dato: nombre + selector. Eso cubre lo que el kit shippea, y **no** cubre
una clase entera de pantallas que sí hay que auditar: el paso 3 de un wizard, el panel que abre un
botón dentro de una fila, el detalle del primer registro de un listado cuyo id no es estable, un
menú desplegado sobre una tabla. Un derivado real tenía **29 de 34** superficies así, y con el
modelo de datos puros su única salida era mantener un segundo harness al lado del kit.

La salida que conserva el principio: la superficie del **proyecto** puede declarar `prepare`, una
función contra el `Page` real de Playwright que deja la pantalla en el estado a fotografiar. La
lista del kit **sigue siendo datos** — `mergeSurfaceLists` rechaza una entrada del kit con
`prepare`, porque comportamiento en una lista que viaja viva a un `src/` congelado es código que
la flota ejecutaría sin revisar. En el archivo del proyecto lo revisa el equipo, como una fase
propia en `scripts/tools/e2e.project.ts`.

| Qué                      | Cómo                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dónde arranca            | `path` es la **ruta de entrada** (el listado, el paso 1); ahí se prueba identidad, `readySelector` y placeholders como en cualquier superficie (§7, pasos 2-4). Luego corre `prepare`.                                                                      |
| Cuándo corre             | **Una vez por ancho y por tema**, entre el paso 4 (contenido asentado) y el 5 (tema aplicado y verificado): el `reload` del paso 1 reinicia la página, y lo que `prepare` abre tiene que fotografiarse en el tema correcto, con sus imágenes esperadas (paso 7) |
| Qué devuelve             | Nada = listo. **`false` = no hay nada que fotografiar** (sin datos para ese estado): la superficie va a `unpreparedSurfaces` con sus celdas perdidas y la corrida sigue. No es un pase ni una falla — para `ui-critic` es cobertura que no existe              |
| Qué pasa si lanza        | **Mata la corrida**, como cualquier rechazo sobre una superficie del proyecto (§5.1): el equipo escribió ese código sobre su propia app                                                                                                                       |
| Qué queda en el manifest | Cada captura preparada lleva `prepared: true` y `landedAt` (la ruta donde de verdad estaba el navegador al disparar). Un lector sabe que esa celda dependió de código del proyecto, y adónde llegó                                                             |
| Costo                    | Una corrida de `prepare` por tema y ancho de **esa** superficie; el presupuesto de la corrida lo suma (`captureTimeoutMs`, `prepareRuns` en la matriz)                                                                                                       |

---

## 5. Las trampas que este harness canoniza

Ninguna es hipotética: las cuatro primeras se pagaron en un derivado real, y las dos últimas en la
primera corrida real de este harness.

| # | Trampa                                                          | Cómo se cierra                                                                                                                                        |
| - | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | La carpeta de salida que Playwright borra al arrancar           | La evidencia va a `tests/.evidence/<corrida>/`, que no es el `outputDir` de nadie (§2)                                                                  |
| 2 | El tema se dispara y se captura de inmediato                    | Se fuerza y **se verifica**: se lee la clase de `<html>` **y** el token `--background` del skin; si no coinciden, la corrida **falla** y no hay captura |
| 3 | Un filtro con typo degrada a cero capturas                      | Un nombre sin coincidencia **revienta** nombrándolo y listando las superficies que sí existen                                                          |
| 4 | Falta el ancho intermedio                                       | Los tres anchos son un dato del kit, con 768 entre los otros dos (§4)                                                                                  |
| 5 | **La pantalla hidratada todavía no tiene su contenido**         | Después del `readySelector` se espera a que **desaparezcan los placeholders de carga** (`PENDING_CONTENT_SELECTOR`) — condición, nunca un sleep fijo   |
| 6 | **La captura es de OTRA pantalla** (redirect a login, 404)      | Se comprueba el status de la navegación **y** la URL donde terminó el navegador; si no es la superficie pedida, la corrida **falla**                    |
| 7 | **Las imágenes del área visible todavía no cargaron**            | Antes del disparo se espera a que **toda imagen del área visible** haya terminado (`complete`), ya aplicado y verificado el tema — condición sobre los elementos, nunca `networkidle` ni un sleep |

**Por qué la trampa 5 no es "un caso raro de timing".** Una corrida capturó `/settings/users` con la
barra lateral, las migas y el encabezado perfectos, y placeholders grises donde va la tabla — es
decir, sin lo único que esa superficie declara auditar. La MISMA superficie salió completa en otro
ancho de la misma corrida: la firma de una carrera, no de una pantalla. Esperar la hidratación
responde "¿montó el shell?", que es otra pregunta.

**Por qué la trampa 7 no es la 5 con otro nombre, y por qué la espera va donde va.** El logo de la
marca apareció en `login__dark__medium__rest` y `login__dark__wide__rest` y **faltó** en `login__dark__narrow__rest`:
misma pantalla, mismo tema, misma corrida. El auditor lo reportó como un defecto de la pantalla de
acceso que no existe — el ancho angosto pide otra variante del archivo y esa petición no había
terminado. Los placeholders (trampa 5) ya se habían ido: son dos preguntas distintas, "¿llegaron los
datos?" y "¿llegó la imagen?".

Tres cosas de esta espera, y ninguna es un detalle:

- **Cubre sólo el área visible.** Los avatares de la tabla son `next/image` sin `priority`, así que
  fuera de pantalla **nunca se piden**: esperar "todas las imágenes del documento" no convergería
  con una lista larga y terminaría fallando una pantalla cuya foto estaba completa.
- **Va DESPUÉS de aplicar y verificar el tema** (el séptimo de los pasos ordenados de `capture.ts` — §7). El tema decide qué
  archivo se pide, así que una espera anterior asentaría la variante vieja y el obturador atraparía
  la nueva a medio camino. Por eso tampoco puede colgar de `waitForSurfaceReady`, que corre en el
  paso 3 y debe correr ahí.
- **Su vencimiento es MORTAL para la superficie de cualquier origen** — nunca un salto
  (`VisibleImagesNotSettledError`, motivo `integrity`). Es el mismo trato que la espera de
  placeholders y por la misma razón (§5.1). La condición es `complete`, no `naturalWidth`: una
  imagen genuinamente rota **converge** y se fotografía como el defecto que es, en vez de colgar la
  corrida.

**Por qué la trampa 6 existe.** El tema se demuestra de tres formas y la **identidad de la
superficie** no se demostraba de ninguna: una sesión que dejó de ser válida redirige a `/login`, y
el archivo se habría archivado como `settings-users__dark__wide__rest.png`, con su contraste medido
encima y el manifest en verde.

**Por qué la trampa 2 es la más cara.** No produce un error: produce un archivo llamado `dashboard__dark__wide__rest.png` que muestra el tema claro. La corrida sale verde, el manifest se ve completo, y DS4 se decide sobre evidencia **equivocada** — peor que sobre evidencia ausente, porque nadie sospecha de ella.

**Por qué la trampa 3 no admite degradación.** Cero capturas produce un manifest vacío, y un manifest vacío se lee como "sin hallazgos": DS4 pasa porque no había nada que auditar, no porque no hubiera violaciones. Es el único lugar del harness donde fallar es obligatorio.

> **Una asimetría deliberada:** un **filtro** con typo revienta (se tecleó ahora mismo); una **exclusión** obsoleta en la lista del proyecto sólo se **reporta** en el manifest (`staleExclusions`). La exclusión es una declaración durable cuyo blanco el kit puede renombrar mañana — matar la corrida de toda la flota por eso sería una suite destruida por el rename de otro.

### 5.1 Y la mitad simétrica: una pantalla que el kit **agrega**

El **alta** de una pantalla tiene idéntico radio de daño que el **rename**: la lista del kit viaja
viva (`scripts/**` es trackeado) sobre un `src/` que **nace congelado** (`BR-FACTORY-006`). El día
que el Factory agrega una pantalla, todo derivado que no la tenga intenta fotografiar una ruta que
su app nunca tuvo — y como **toda la matriz es un solo test**, un throw sin clasificar aborta el
bucle, `finish()` no corre y **no se escribe manifest para ninguna** de las superficies que sí
existían. Todo-o-nada por el alta de otro, que es exactamente lo que esta misma sección se niega a
aceptar por el rename de otro.

Por eso una superficie **del kit** que no se puede alcanzar se **salta**, con su motivo en el
manifest, y la corrida sigue con las demás.

```jsonc
"skippedSurfaces": [
  { "surface": "reports", "route": "/reports", "origin": "kit",
    "reason": "[reports · narrow] '/reports' respondió 404 …", "lostCaptures": 6 }
]
```

Tres condiciones, y ninguna es negociable:

| Condición                                                     | Por qué                                                                                                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sólo superficies **del kit** (`origin: 'kit'`)                | Una superficie que el **proyecto** declaró y falla **sí** rompe: el equipo escribió esa línea sobre su propia app, así que su ausencia es un error suyo. Silenciarla sería "degradar a cero capturas" llegando de a una en vez de todas juntas |
| Sólo fallas de **disponibilidad** o de **preparación** (`availability` · `readiness`) | Las dos dicen algo del **checkout**: la ruta no está, o la ruta está y la pantalla que sirve no es la del kit. Una falla de **integridad** — el tema que no se aplicó, un segmento que se saldría del directorio — dice que el harness está produciendo evidencia falsa, y eso no es tolerable para la superficie de nadie. Un error **sin clasificar** (timeout de Playwright en otro punto, `TypeError`) tampoco se salta. La frontera de tres, abajo |
| El salto **se declara**                                       | Va en `skippedSurfaces` con superficie, ruta, motivo y cuántas celdas se perdieron, más un aviso en consola con el remedio (`EXCLUDED_KIT_SURFACES`). Nunca un salto silencioso |

#### La frontera son TRES motivos, y el enum cerrado es lo que la sostiene

`FailureKind` (`scripts/tools/visual-evidence/manifest.ts`) nombra por qué se rechazó una captura, y
de ahí sale qué puede hacerse al respecto. **Sólo estos tres existen; cualquier otra cosa que se
lance no está clasificada, y lo no clasificado mata la corrida.**

| Motivo         | Qué afirma                                                                                    | ¿Se salta una superficie del kit? |
| -------------- | ----------------------------------------------------------------------------------------------- | --------------------------------- |
| `availability` | La pantalla no es alcanzable en ESTA app: 404, el navegador terminó en otra pantalla (`assertSurfaceIdentity`), o el **rol** que la superficie pide no existe en el `src/config/roles.ts` de este checkout (`SurfaceRoleMissingError`) | Sí                                |
| `readiness`    | La ruta **sí** está y sirvió la pantalla correcta, y la espera del elemento que prueba que renderizó (`readySelector`) **expiró** — nunca apareció | Sí                                |
| `integrity`    | El harness se descubre a sí mismo produciendo evidencia falsa: el tema que no se aplicó, un nombre que se saldría del directorio, un filtro que no matchea nada | **Nunca**, para la superficie de nadie |

**Qué distingue a `readiness` de un timeout cualquiera** — y por qué no es "cualquier error de una
pantalla del kit":

- **Un solo sitio de lanzamiento, y dentro de él una sola falla.** Lo produce `waitForSurfaceReady()`
  (`scripts/tools/visual-evidence/readiness.ts`), que envuelve **una** espera: la del selector que
  prueba que la pantalla renderizó. Ninguna otra espera. Y de esa espera clasifica **sólo el
  timeout** — el hecho que de verdad significa "el selector nunca apareció". Un selector
  sintácticamente inválido en la lista del kit, un `page`/`context` ya cerrado o un frame
  desprendido **no** dicen eso: dicen que el harness está roto, se re-lanzan intactos y siguen
  siendo mortales. La comprobación es **por forma** (`error.name === 'TimeoutError'`), nunca
  importando tipos de Playwright: este directorio viaja a la flota y no importa nada del navegador
  ni de `src/`.
- **Después de probar la identidad.** Se llama cuando `assertSurfaceIdentity()` ya pasó, así que su
  afirmación es precisa: *la ruta existe, sirvió la pantalla correcta, y esa pantalla no tiene la
  forma que la lista del kit describe*. Sin ese orden, un redirect se colaría dentro de este motivo
  y se perdería la distinción para la que existen los dos.
- **Sólo para superficies del kit, y con doble candado.** El helper ni siquiera **construye** el
  error para una superficie de origen `project`: le devuelve su error original intacto. El segundo
  candado es `isSurfaceSkippable()`, que además vuelve a exigir `origin: 'kit'`.
- **Lo que sigue siendo mortal:** un `TypeError`, un timeout en cualquier otro punto del bucle, un
  tema que no se aplicó. Ampliar la tolerancia a "cualquier error" reabriría el todo-o-nada al
  revés: un harness roto pasaría por una pantalla faltante.
- **Las otras dos esperas de una captura quedan FUERA, a propósito.** Toda superficie espera además
  a que desaparezcan los placeholders de carga (`PENDING_CONTENT_SELECTOR`, trampa 5) **y** a que
  terminen las imágenes del área visible (trampa 7), y esos dos timeouts **no** se envuelven: son
  mortales para la superficie de cualquier origen. Son preguntas distintas — `readiness` pregunta
  *¿esta pantalla tiene la forma que la lista del kit describe?*, y las otras dos preguntan *¿los
  datos llegaron?* y *¿la imagen llegó?*. Una app cuyos placeholders no se resuelven —o cuyas
  imágenes del área visible no terminan— no es una app con otra pantalla: es una app cuyo contenido
  no cargó, y fotografiar ese esqueleto es justo lo que la trampa 5 prohíbe. Tolerarlo ahí escondería,
  detrás de una tolerancia hecha para una lista que viaja sobre un `src/` congelado, exactamente la
  evidencia falsa que el harness existe para rechazar. Remedio para esos casos: un `readySelector`
  propio en la lista del proyecto (§9), o exclusión por nombre en `EXCLUDED_KIT_SURFACES`.

**Por qué el helper vive en `scripts/tools/visual-evidence/` y no en el spec.** La razón de ser de
esta señal es la **flota**: la lista del kit viaja viva (`scripts/**` es un path trackeado del
lockfile) sobre un `src/` congelado en el bootstrap, y ese desfase es justo lo que tolera. El spec
de captura (`tests/e2e/visual.evidence.spec.ts`) **no** viaja — nace con el proyecto y ningún
`factory update` lo reescribe (§7) — así que una tolerancia escrita ahí no llegaría a ningún
derivado. Este directorio sí viaja y, como el resto de sus módulos, **no importa nada de `src/`**:
la espera entra **por parámetro**, igual que `makeGitRunner()` recibe su runner. Por eso también
sus casos se prueban sin navegador, en `scripts/tools/__tests__/visual-evidence-manifest.test.ts`.

🔴 **Un rol que este checkout no tiene también se salta — y la resolución entra INYECTADA, que es lo que hace que el arreglo viaje.** Las superficies del kit fijan `role: 'admin'` (`surfaces.ts`), un valor de `src/config/roles.ts` — que en un derivado **nace congelado** y cuyo propio doc dice *«customize per project — add/remove as needed»*: un proyecto con `owner`/`member` no tiene `admin`, y eso es el estado normal de la flota, no un defecto.

Quien traduce rol → sesión guardada sigue siendo `resolveStorageState()` en el **cascarón** (`tests/e2e/visual.evidence.spec.ts`), porque `AUTH_FILES` vive en `tests/fixtures/` y no puede cruzar la frontera. Lo que cambió es qué hace con la pregunta sin respuesta: **devuelve `null` en vez de lanzar**, y el módulo que **sí** viaja lo recibe como una función (`ResolveSurfaceSession`, `scripts/tools/visual-evidence/capture.ts` — el mismo patrón de inyección que la fábrica de página, los temas del skin y el runner de git). Ahí se clasifica como **`availability`** (`SurfaceRoleMissingError`): el mismo hecho que un 404 dicho de otra forma — esta pantalla no es alcanzable en esta app. Desde ese punto la mecánica es la de arriba, sin nada nuevo: `isSurfaceSkippable` la perdona **sólo** si es del kit, queda en `skippedSurfaces` con su motivo (que **nombra el rol faltante**) y sus celdas perdidas, y la corrida sigue con las pantallas que este checkout sí tiene. Se pregunta **antes** de abrir el navegador, así que no se paga un contexto para descartarlo.

Antes de eso, la falla salía como `VisualEvidenceError` **sin `kind`** — o sea `integrity`, que no se salta para la superficie de nadie — y **mataba la corrida entera sin escribir manifest**, ni siquiera el de `login`, que no necesita sesión. Y arreglarlo en el cascarón no habría servido: ese archivo nace con el proyecto y ningún `factory update` lo reescribe (§7), así que la decisión tenía que quedar del lado que viaja.

🔴 **El doble candado no se debilita:** una superficie de la **lista del proyecto** que pida un rol inexistente **sigue matando la corrida**. El equipo escribió esa línea sobre su propia app, así que es un typo suyo — mismo criterio que rige para todo `origin: 'project'`. De ahí un costo que conviene saber antes de elegir remedio: **redeclarar** una pantalla del kit en `PROJECT_SURFACES` (una entrada cuyo `name` repite el de una del kit la reemplaza en su lugar, §4) la etiqueta `origin: 'project'` y **le quita la tolerancia del kit** — desde ese momento un 404, un `readySelector` que no aparece o un rol ausente matan la corrida en vez de saltarse. Excluirla por nombre en `EXCLUDED_KIT_SURFACES` no tiene ese costo, y sigue siendo el remedio durable cuando la pantalla de plano no aplica a este proyecto.

🔴 **El piso no se mueve con ningún motivo:** `finish()` rechaza un manifest con **cero** capturas,
así que un checkout donde se saltaron **todas** falla igual de fuerte. Tolerar una pantalla que
falta —o una que no es la del kit— no es tolerar una auditoría vacía. El remedio durable sigue siendo declararla en
`EXCLUDED_KIT_SURFACES`; el salto sólo evita que el intervalo entre el alta del kit y esa
declaración cueste la corrida entera.

---

## 6. Quién consume el manifest

| Consumidor                     | Qué hace con él                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| [`ui-critic`](../../agents/ui-critic.md) | Es su **contrato de entrada**: marca cada hallazgo `código leído` o `pantalla vista`, y sin manifest reporta DS4 y DS7 como `no demostrado` |
| `/implement` §4.4              | Corre el harness (si la fase existe en el checkout) antes de spawnear a `ui-critic`, y le pasa el path                                |
| `/backlog`                     | El issue de auditoría que emite lleva un AC de evidencia adjunta, condicionado a que el harness esté disponible                       |
| `/design` Phase 8              | **No** lo consume: audita especificaciones en markdown, donde no hay pantalla renderizada — DS4 sale `no demostrado` ahí, y es correcto |

---

## 7. Dónde vive cada pieza

| Pieza                              | Ruta                                          | Por qué ahí                                                                                                       |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Esta documentación                 | `.claude/skills/fx-visual-evidence/SKILL.md`  | Viaja en los dos perfiles (glob `fx-*`)                                                                            |
| Capturador, helpers y lista base   | `scripts/tools/visual-evidence/`              | Junto al resto del tooling; set `track`, así que se refresca en cada update                                        |
| La captura misma: matriz y pasos   | `scripts/tools/visual-evidence/capture.ts`    | 🔴 **Del lado que viaja, a propósito:** la matriz, el bucle ancho × tema × estado y los nueve pasos ordenados de una captura. Un arreglo escrito aquí llega a la flota en el siguiente update |
| Carga de la lista del proyecto     | `.../visual-evidence/project-surfaces.ts`     | El invocador de un punto de extensión tiene que ser un archivo **del kit** (`fx-extension-points §2`, propiedad 2): guard de existencia + carga lazy |
| Tests unitarios de esos helpers    | `scripts/tools/__tests__/`                    | Excluidos de **ambos** perfiles: un test bajo la carpeta de la skill viajaría a la flota sin runner que lo corra   |
| Cascarón de captura                | `tests/e2e/visual.evidence.spec.ts`           | Playwright sólo busca specs bajo su `testDir`. Nace congelado, así que guarda **sólo lo que no puede viajar**: el navegador, las sesiones de `tests/fixtures/`, el registro de skins de `src/` y las aserciones de Playwright |
| Lista de superficies del proyecto  | `tests/e2e/visual-evidence.surfaces.ts`       | Dev-owned: el update nunca la toca                                                                                 |
| Proyecto `evidence` de Playwright  | `playwright.config.ts`                        | Dos mitades: su `testMatch` **y** el `testIgnore` del proyecto base (si no, el spec corre en cada suite)           |
| Declaración de la fase             | `scripts/tools/e2e-runner.ts` (`KIT_PHASES`)  | Una fase es un dato, nunca un fork del runner                                                                      |

🔴 **`.claude/skills/fx-visual-evidence/` contiene sólo este documento.** El ejecutable **no** vive bajo la carpeta de la skill: el argumento a favor era que esa carpeta viaja a los dos perfiles, pero en `core` el harness **no puede correr igual** — `scripts/tools/e2e-runner.ts` no está en el `include` de ese perfil, así que llegaría la herramienta sin la maquinaria. Ese hueco es estructural y la respuesta permanente es el degradado explícito de `ui-critic`, no mover archivos de carpeta.

---

## 8. En un proyecto que nació antes del harness

`factory update` refresca `.claude/**` y `scripts/**`, pero **no** `playwright.config.ts` ni `tests/e2e/` — son del proyecto desde que nace. Un derivado recibe entonces la doctrina y la maquinaria, y le falta el cableado.

Qué pasa mientras tanto, sin que nada explote:

- La fase `evidence` se declara `optIn` y **sin `required`**, así que un checkout cuyo `playwright.config.ts` no la declara **la salta con aviso** en vez de reventar la suite entera.
- `/implement` §4.4 **comprueba que la fase exista** antes de invocarla; si no está, sigue sin manifest y `ui-critic` reporta DS4 `no demostrado` por su cláusula de degradación.
- Los AC que emite `/backlog` piden la evidencia **condicionada** a que el harness esté disponible — nunca un criterio imposible de cumplir.

Para engancharlo (cuatro pasos, ~10 minutos — el cuarto es la línea del `.gitignore`, que es lo que impide que capturas autenticadas lleguen al repo): [`.claude/docs/retrofits/visual-evidence-adoption.md`](../../docs/retrofits/visual-evidence-adoption.md).

---

## 9. Agregar una pantalla

```ts
// tests/e2e/visual-evidence.surfaces.ts — la lista del proyecto (el update no la toca)
export const PROJECT_SURFACES: VisualSurface[] = [
  {
    name: 'invoices',        // segmento del nombre de archivo: sin '/', sin '..'
    path: '/invoices',
    role: 'admin',           // un rol de src/config/roles.ts, o null para "sin sesión"
    purpose: 'Listado de facturas — tabla densa con filtros en cascada.',
    readySelector: 'table',  // opcional: qué prueba que la pantalla sí renderizó
  },
];
```

**Y para demostrar un estado de interacción, decláralo en esa misma entrada:**

```ts
{
  name: 'invoices',
  path: '/invoices',
  role: 'admin',
  purpose: 'Listado de facturas — tabla densa con filtros en cascada.',
  readySelector: 'table',
  states: [
    // `name` es segmento del archivo (sin '/', sin '..') y no puede llamarse `rest`.
    // `focus` apunta a algo que la cámara pueda ver: enfocar hace scroll hasta el elemento,
    // pero una captura es el ÁREA VISIBLE (§2), así que un control oculto no prueba nada.
    { name: 'focus-filter', focus: 'input[type="search"]' },
  ],
}
```

El kit declara dos: `login` → `focus-email` y `settings-users` → `focus-switch`. Cada uno existe
para fotografiar un indicador de foco que el kit shippea en una primitiva (`Input`, `Switch`, las
dos con `.surface-focus-inset` del skin) — un estado que apunta a algo que el kit no shippea sería
la promesa de una evidencia que la flota no puede producir.

**Y una pantalla que no es una ruta se alcanza con `prepare` (§4.2) — sólo en TU lista:**

```ts
import type { Page } from '@playwright/test';

{
  name: 'investment-detail',
  path: '/investments',            // la ruta de ENTRADA: aquí arranca `prepare`
  role: 'admin',
  purpose: 'Detalle de una inversión — cabecera, KPIs y pestañas.',
  readySelector: 'table',
  async prepare(page: Page) {
    const first = page.getByRole('row').nth(1).getByRole('link').first();
    if ((await first.count()) === 0) return false;   // sin filas sembradas → no hay qué fotografiar
    await first.click();
    await page.getByRole('heading', { level: 1 }).waitFor();
  },
}
```

**Y para fotografiar la banda donde TU layout cambia, declara el ancho en el mismo archivo:**

```ts
export const PROJECT_VIEWPORTS: VisualViewport[] = [
  // Mismo `name` que uno del kit = lo reemplaza en su lugar (aquí, el 768 se vuelve 1024).
  // Un nombre nuevo agrega una columna: una captura más por superficie, tema y estado.
  { name: 'medium', width: 1024, height: 768, why: 'Las tarjetas hero pasan a 4 columnas en 1024-1180.' },
];
```

**Elige un selector que el estado de CARGA no tenga.** `table` sirve para un listado (su esqueleto son `div`s); `main` no, porque lo renderizan los dos estados. Sin `readySelector` el harness espera a `body`, que matchea cualquier cosa — por eso, además, **toda** superficie espera a que desaparezcan los placeholders de carga (trampa 5), tenga o no selector propio. Una app cuyos placeholders no llevan ninguno de los marcadores que el kit reconoce (`.animate-pulse`, `aria-busy`, `data-loading`) necesita sí o sí un `readySelector` de contenido real.

---

## 10. Frontera — qué NO cubre este skill

| No cubre                                                   | Va a                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Emitir el juicio** sobre la UI (Pass / Fail / no demostrado) | [`ui-critic`](../../agents/ui-critic.md) — este harness sólo produce la evidencia que él lee      |
| Correr Playwright por fuera del runner de e2e              | No existe esa vía, y no se pide: [`sk-e2e §1.6`](../sk-e2e/SKILL.md) (rama efímera) · §3           |
| Declarar fases del runner, `optIn`, `required`             | [`sk-e2e §1.7`](../sk-e2e/SKILL.md) — la fase `evidence` es un dato de ese registro                |
| Qué temas existen y cuál es el default                     | [`sk-skins`](../sk-skins/SKILL.md) + `src/config/skins.ts` — el registro, nunca una lista aquí     |
| Auditar **especificaciones** (`/design` Phase 8)           | No hay pantalla renderizada ahí; DS4 sale `no demostrado` y es correcto                            |
| Reglas de design system, tokens, escalas                   | [`sk-skins`](../sk-skins/SKILL.md) · [`sk-tokens-neomorphism`](../sk-tokens-neomorphism/SKILL.md) · [`kb-design-engineering`](../kb-design-engineering/SKILL.md) |
| Perfil `core`                                              | La skill viaja, la maquinaria no (§7). Degradado explícito y **permanente**, no un pendiente       |

---

_TimeKast Factory — fx-visual-evidence skill_
