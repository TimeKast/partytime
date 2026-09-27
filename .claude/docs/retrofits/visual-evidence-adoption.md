# Migration brief — engancha el harness de evidencia visual en tu proyecto

> **Retrofit shipped** (`.claude/docs/retrofits/`) — aplica a **todo derivado que nació antes del harness de evidencia visual** y quiera que `ui-critic` audite pantallas de verdad en vez de sólo leer código. Si tu proyecto ya tiene el `project: 'evidence'` en su `playwright.config.ts`, **no te aplica**.
>
> **Audience:** el equipo (o el agente) de una app TimeKast derivada del Factory. No hace falta leer el código del harness — esta guía se basta sola; ese es su criterio de éxito.
>
> **Date:** 2026-08-25
> **Origin:** `EPIC-13-e2e-y-evidencia-visual · EVID-002`. Contrato vivo: [`fx-visual-evidence`](../../skills/fx-visual-evidence/SKILL.md) + [`sk-e2e §1.7`](../../skills/sk-e2e/SKILL.md).
>
> **Costo de aplicarlo:** ~10 minutos. Dos ediciones a tu `playwright.config.ts`, dos archivos extraídos del tarball del kit (§4.1.a), tu lista de pantallas y **una línea en tu `.gitignore`** (§5 — la que impide que capturas autenticadas lleguen al repo).
> **Disponible desde:** kit `v12.0.0`

---

## 1. Qué pasa, y por qué no explotó nada

`factory update` refresca el cerebro (`.claude/**`) y el tooling (`scripts/**`). **No toca** `playwright.config.ts` ni `tests/e2e/`: son tuyos desde que el proyecto nació (`BR-FACTORY-006`). Así que después de actualizar tienes:

| Ya lo tienes                                        | Todavía no                                                    |
| --------------------------------------------------- | -------------------------------------------------------------- |
| **La lógica de captura completa** — la matriz y los pasos ordenados de una captura (`scripts/tools/visual-evidence/capture.ts`), más sus helpers | El proyecto `evidence` en tu `playwright.config.ts`   |
| La fase `evidence` declarada en el runner           | El **cascarón** del spec en tu `tests/e2e/`                    |
| El alias `pnpm evidence:visual` (lo inserta el CLI) | Tu lista de superficies (opcional — ver §4.2)                  |

> **El spec no llega por `factory update` y no va a llegar:** vive en `tests/**`, que no viaja en ningún perfil. §4.1.a dice de dónde sacarlo — no asume que tengas un checkout del Factory.
>
> **Lo bueno es que ese archivo hace poco.** El spec es un **cascarón**: arma lo que no puede viajar (el navegador, tus sesiones guardadas, el registro de skins de tu `src/`, las aserciones de Playwright) y llama al módulo del kit. Todo lo que decide **cómo** se fotografía una pantalla vive del lado que sí se refresca, así que un arreglo del harness te llega con el siguiente `factory update` sin que vuelvas a copiar nada.

**Nada de eso rompe tu suite, y es a propósito.** La fase se declara `optIn` y **sin `required`**: un checkout cuyo `playwright.config.ts` no la conoce **la salta con un aviso** en vez de reventar la corrida. Y `/implement` comprueba que la fase exista antes de invocarla; si falta, sigue sin manifest y `ui-critic` reporta el check multi-tema como **"no demostrado"** — nunca como Pass. O sea: sin este retrofit no pierdes nada que tuvieras, pero tampoco ganas evidencia.

---

## 2. Phase 0 — ¿me aplica?

> No modifica nada.

```bash
echo "=== 1. ¿Recibí el harness? ==="
test -d scripts/tools/visual-evidence && echo "  SÍ" || echo "  NO — corre primero \`pnpm factory:update\`"

echo "=== 2. ¿El runner conoce la fase? ==="
grep -q "KIT_EVIDENCE_PROJECT" scripts/tools/e2e-runner.ts && echo "  SÍ" || echo "  NO — falta el update"

echo "=== 3. ¿Ya está cableado en Playwright? ==="
grep -q "'evidence'" playwright.config.ts && echo "  YA APLICADO (revisa igual el paso 3.2)" || echo "  Falta"

echo "=== 4. ¿Tengo el spec de captura? ==="
ls tests/e2e/*.evidence.spec.ts 2>/dev/null || echo "  Falta"

echo "=== 5. ¿Tengo el alias? ==="
node -e "console.log(require('./package.json').scripts['evidence:visual'] ?? '  Falta — lo inserta factory update')"

echo "=== 6. ¿Tengo el registro de skins que el spec importa? ==="
test -f src/config/skins.ts && echo "  SÍ" || echo "  NO — proyecto nacido antes del sistema de skins: aplica el paso 4.1.b"

echo "=== 7. ¿Tengo la herramienta para bajar el tarball del kit? ==="
command -v gh >/dev/null && echo "  SÍ (gh)" || echo "  NO — instala GitHub CLI: https://cli.github.com"

echo "=== 8. ¿La carpeta de salida ya está ignorada por git? ==="
git check-ignore -q tests/.evidence \
  && echo "  SÍ" \
  || echo "  NO — aplica el §5 ANTES de la primera corrida (capturas autenticadas al repo)"
```

> **El punto 6 no es decorativo.** El spec importa `ACTIVE_SKIN` y `activeSkinThemes()` de
> `@/config/skins`, y `src/` **nace congelado** (`BR-FACTORY-006`): un derivado creado antes del
> sistema de skins no tiene ese módulo, así que copiar el spec tal cual le rompe el `pnpm typecheck`
> del §6 con un `Cannot find module '@/config/skins'`. El paso 4.1.b lo resuelve en dos líneas.

---

## 3. Phase 1 — cablea el proyecto de Playwright (las DOS mitades)

🔴 **Un patrón de opt-out tiene dos mitades y las dos son obligatorias.** Si sólo agregas el `testMatch` del proyecto nuevo, tu suite base (`chromium`, que no declara `testMatch` y por lo tanto recoge **todo**) también levanta el spec de captura: tomarías capturas en **cada** `pnpm test:e2e`, que es exactamente lo que la fase `optIn` existe para evitar.

### 3.1 Agrega el proyecto

En `playwright.config.ts`, dentro de `projects: [...]`, al final:

```ts
{
  name: 'evidence',
  use: { ...devices['Desktop Chrome'] },
  dependencies: ['setup'],          // las pantallas autenticadas reusan el storageState
  testMatch: /\.evidence\.spec\./,
},
```

`dependencies: ['setup']` no es opcional: casi todas las superficies son pantallas con sesión, y `auth.setup.ts` es quien escribe `tests/.auth/<rol>.json`. Sin eso el harness falla nombrando el archivo que falta.

### 3.2 La otra mitad — ignóralo en tu proyecto base

En el mismo archivo, en el proyecto `chromium`:

```diff
-  testIgnore: /\.mfa\.spec\./,
+  testIgnore: /\.(mfa|evidence)\.spec\./,
```

Si tu `chromium` no declara `testIgnore` (derivado nacido pre-MFA), agrégalo con `/\.evidence\.spec\./`.

---

## 4. Phase 2 — copia el spec y declara tus superficies

### 4.1.a El spec — de dónde sale, exactamente

`factory update` **no** trae estos dos archivos (viven en `tests/**`, que no viaja), y el CLI no
tiene un comando que los materialice. Se sacan del **mismo tarball del que nació tu proyecto**: el
asset `tk-full-*.tgz` del último release del kit, que es lo que `factory new` descarga. Necesitas
[GitHub CLI](https://cli.github.com) con acceso al repo del Factory — el mismo acceso que ya usaste
para crear el proyecto.

```bash
REPO=TimeKast/TimeKast-Factory
TAG=$(gh release list --repo "$REPO" --json tagName,isPrerelease --limit 30 \
  -q '[.[] | select(.tagName | startswith("v")) | select(.isPrerelease == false)][0].tagName')
echo "kit: $TAG"

# 1. Baja el tarball del perfil `full` a una carpeta temporal
gh release download "$TAG" --repo "$REPO" --pattern 'tk-full-*.tgz' --dir /tmp/tk-kit --clobber

# 2. Extrae SÓLO los dos archivos (las rutas del tarball son relativas a la raíz del repo)
tar -xzf /tmp/tk-kit/tk-full-*.tgz \
  ./tests/e2e/visual.evidence.spec.ts \
  ./tests/e2e/visual-evidence.surfaces.ts

ls -l tests/e2e/visual.evidence.spec.ts tests/e2e/visual-evidence.surfaces.ts
```

> **¿Ya tienes un checkout del Factory a mano?** Entonces es un `cp` de esos dos archivos y te
> saltas todo lo anterior. Lo de arriba existe porque **no** tenerlo es el caso normal.

### 4.1.b Si tu proyecto no tiene `src/config/skins.ts`

El spec importa dos cosas del kit — `ACTIVE_SKIN` y `activeSkinThemes()` de `@/config/skins` —
porque la matriz de temas sale del **registro del skin activo** y nunca de una lista escrita a mano.
Si el punto 6 del Phase 0 dijo `NO`, tu `src/` es anterior a ese registro (nació congelado y ningún
update lo toca). El spec es **tuyo** desde que lo copias, así que la salida son dos líneas: cambia el
import por tu propia declaración, arriba del todo.

```diff
-import { ACTIVE_SKIN, activeSkinThemes } from '@/config/skins';
+// Este proyecto no tiene registro de skins: declara aquí los temas que TU app define de verdad.
+const ACTIVE_SKIN = 'default';
+const activeSkinThemes = () => ['light', 'dark'] as const;
```

🔴 **Declara los que tu app realmente define, ni uno más.** Pedir un tema que tu CSS nunca definió
produce una imagen con los tokens del fallback y el nombre del tema pedido — evidencia falsa, que es
peor que ninguna. El resto del spec no depende de nada más del kit: itera tu lista de superficies,
esos temas y los tres anchos.

### 4.2 Tus pantallas

`tests/e2e/visual-evidence.surfaces.ts` es **tuyo**: `tests/**` no viaja en ningún perfil, así que ningún update lo va a reescribir.

**Y es opcional.** Quien lo carga es un archivo del kit (`scripts/tools/visual-evidence/project-surfaces.ts`) que primero comprueba si existe: si no lo tienes, corres con las cuatro pantallas del kit y sin ningún aviso. Lo que sí es fatal es tenerlo **roto** — un archivo presente que no se puede cargar corta la corrida nombrándolo, en vez de fotografiar en silencio una matriz distinta de la que declaraste. Ésa es la razón por la que aparece en el inventario de puntos de extensión ([`fx-extension-points §3`](../../skills/fx-extension-points/SKILL.md)): no es una convención de nombre, hay alguien del otro lado.

```ts
export const PROJECT_SURFACES: VisualSurface[] = [
  {
    name: 'invoices',        // sin '/', sin '..' — es un segmento del nombre de archivo
    path: '/invoices',
    role: 'admin',           // un rol de src/config/roles.ts, o null para "sin sesión"
    purpose: 'Listado de facturas — tabla densa con filtros en cascada.',
    readySelector: 'table',  // opcional: qué prueba que la pantalla sí renderizó
  },
];

// Pantallas del kit que tu app no tiene (si borraste /settings/users, por ejemplo)
export const EXCLUDED_KIT_SURFACES: string[] = [];

// Anchos propios. El kit captura a 375 / 768 / 1440; si tu layout cambia en otra banda,
// declárala aquí: mismo `name` que uno del kit lo reemplaza, un nombre nuevo agrega una columna.
export const PROJECT_VIEWPORTS: VisualViewport[] = [
  // { name: 'medium', width: 1024, height: 768, why: 'Las rejillas pasan a 4 columnas en 1024-1180.' },
];

// Texto decorativo que NO puede llevar `aria-hidden` en el DOM (un widget de terceros). Lo que
// sí puede, márcalo en el DOM: el barrido de contraste honra `aria-hidden` y `role="presentation"`.
// Cada exención se cuenta en el manifest (`notApplicable`) — es una declaración tuya, y ui-critic la lee.
export const EXCLUDED_CONTRAST_SELECTORS: string[] = [];
```

La lista base del kit (`login`, `dashboard`, `profile`, `settings-users`) se **une** a la tuya y sí se refresca con cada update. Una entrada tuya con el mismo `name` que una del kit la reemplaza en su lugar — así conservas la pantalla apuntando a tu ruta.

**Una pantalla que no es una ruta** (el paso 3 de un wizard, el panel que abre una fila, el detalle del primer registro) se declara con `prepare`: tu código contra el `Page` real, que deja la pantalla en el estado a fotografiar; devuelve `false` cuando no hay datos y la superficie queda registrada como no preparada en vez de fotografiar otra cosa. Sólo tu lista puede llevarlo. Ejemplo y reglas → [`fx-visual-evidence §4.2`](../../skills/fx-visual-evidence/SKILL.md).

---

## 5. Phase 3 — 🔴 la carpeta de salida NO puede llegar al repo

> **Este paso es el que impide una fuga, no un detalle de limpieza.** Va en su propia fase, antes
> de la primera corrida, por eso mismo: es un paso de seguridad y se saltaba leyéndolo como una
> nota al pie del anterior.

En el `.gitignore` de tu proyecto:

```
tests/.evidence/
```

**Qué pasa si te lo saltas.** El harness escribe pantallas **autenticadas con datos sembrados**, y
algunas muestran códigos de verificación en pantalla. Sin la regla, un `git add -A` las commitea —
y una vez en el historial, borrarlas después no las saca. Misma razón por la que `tests/.auth/`
está ignorado desde que tu proyecto nació.

**Compruébalo, no lo supongas** (`git check-ignore` responde por código de salida):

```bash
git check-ignore -q tests/.evidence && echo "ignorado ✅" || echo "NO ignorado 🔴"
```

**Y el harness lo vuelve a comprobar en cada corrida.** Si la carpeta no está ignorada, imprime un
banner al arrancar (antes de escribir la primera captura) y otra vez al terminar, con la línea
exacta a agregar. **Avisa, no rompe**: la corrida que hace la comprobación no es la que está en
riesgo, y matarla destruiría una auditoría legítima por una línea que falta en un archivo. Fuera
de un repo git no hay banner — sólo un aviso de una línea diciendo que no se pudo comprobar.

---

## 6. Phase 4 — verifica

```bash
pnpm typecheck && pnpm lint && pnpm test
```

| Si falla con…                                                | Es esto                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `Cannot find module '@/config/skins'`                        | Te faltó el paso 4.1.b — tu `src/` es anterior al registro de skins    |
| `Cannot find module '../fixtures/auth-files'`                | Tu suite nombra distinto el archivo de sesiones: ajusta ese import (el spec es tuyo) |
| Un tipo que no existe en `VisualSurface`                     | El spec y `scripts/tools/visual-evidence/` quedaron de versiones distintas: corre `factory update` y vuelve a extraer el spec del tarball de ESE release |

Luego la corrida real (crea una rama efímera de Neon, como cualquier corrida de e2e):

```bash
pnpm evidence:visual
```

Lo que debes ver:

```
▶ Phase C — visual evidence capture (opt-in, MFA off)
📸 [visual-evidence] N capturas → …/tests/.evidence/2026-08-25T18-40-11-903Z/manifest.json
   contraste: M muestras evaluadas de K cosechadas
   código: 200e0fa3c0ff
```

`N` = tus superficies × los temas de tu skin × 3 anchos. Y **`M` tiene que ser mayor que cero**: una
corrida donde se cosecharon muestras y no se evaluó ninguna **falla** a propósito — significaría que
el contraste no se está midiendo (típicamente una notación de color que el parser no conoce), y un
manifest así se lee como evidencia sin serlo.

La línea **`código:`** es el sello, y **no es el `HEAD` de tu checkout**: es el último commit que
tocó **código que dibuja** — `src/`, `public/`, `types/`, los archivos raíz con los que se compila la
app (`next.config.*`, `tailwind.config.*`, `package.json`, los lockfiles, …) y lo que tu proyecto
declare en `package.json#e2eBuildInputs`. Un commit que sólo toca documentación **no lo mueve**, así
que no te obliga a recapturar; uno bajo `src/` sí. Si además había código sin commitear, la línea lo
dice con `(entradas de código sin commitear)` — un plan o un scratch fuera de esas rutas **no**
enciende ese aviso.

Va también dentro del manifest, en `codeSeal`, con cinco campos: `commit` / `dirty` describen el
checkout (contexto), `codeCommit` / `codeDirty` son los que un consumidor compara, e `inputs` lista
las rutas contra las que se midieron — para que la comprobación sea un solo comando sin copiar
ninguna lista:

```bash
M="$(jq -r .manifest tests/.evidence/latest.json)"
jq -r '.codeSeal.codeCommit, .codeSeal.codeDirty' "$M"
git rev-list -1 HEAD -- $(jq -r '.codeSeal.inputs[]' "$M")
```

Fuera de un repo git dice `sin sello` con el motivo, y la corrida sigue igual.

Y tres comprobaciones que valen más que la corrida verde:

```bash
# 1. NO corre sola: una corrida normal no debe capturar nada
pnpm test:e2e            # → sólo Phase A y Phase B

# 2. Un filtro con typo REVIENTA nombrándolo — nunca cero capturas en silencio
EVIDENCE_SURFACES=dashbaord pnpm evidence:visual

# 3. La evidencia de la corrida anterior SIGUE AHÍ después de la segunda
ls tests/.evidence/
```

Si (1) captura, te faltó la mitad `testIgnore` del paso 3.2. Si (2) termina verde, el harness no está resolviendo tu lista. Si (3) muestra un solo directorio, revisa que no hayas movido la salida a `test-results/` o `playwright-report/` — Playwright borra esas carpetas al arrancar.

---

## 7. Qué pasa cuando algo no cuadra

| Situación                                                       | Qué pasa                                                                         |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| No aplicaste este retrofit                                      | La fase se **salta con aviso**; tu suite corre idéntica a antes                    |
| `--project=evidence` sin el proyecto en tu config               | **Falla rápido**, listando las fases que sí existen — antes de crear la rama       |
| Falta `dependencies: ['setup']`                                 | Falla nombrando el `tests/.auth/<rol>.json` que no existe y apuntando a esta guía  |
| Una superficie **tuya** apunta a un rol que no está en `src/config/roles.ts` | 🔴 **Rompe la corrida**, nombrando el rol. Tú escribiste esa línea sobre tu propia app: es un typo tuyo, no una diferencia con el kit |
| Una superficie **DEL KIT** pide un rol que tu `src/config/roles.ts` no tiene | Se **salta** con su motivo en el manifest (`skippedSurfaces`, nombrando el rol) y la corrida sigue con las demás. Tu `roles.ts` nació congelado y el kit no lo conoce: entra como `availability` — el mismo hecho que un 404 — y la pregunta se resuelve **antes** de abrir el navegador. Remedio durable: nombra esa pantalla en `EXCLUDED_KIT_SURFACES`, o redeclárala en `PROJECT_SURFACES` con el rol que tú sí tienes (mismo `name` = la reemplaza en su lugar). ⚠️ **Los dos remedios no cuestan lo mismo:** al redeclararla pasa a `origin: 'project'` y **pierde la tolerancia del kit** — desde ahí un 404, un `readySelector` ausente o un rol inexistente matan la corrida. La exclusión por nombre no tiene ese costo |
| No copiaste `tests/e2e/visual-evidence.surfaces.ts`             | Corres con las cuatro pantallas del kit, **sin aviso**. Es un estado válido        |
| Ese archivo existe pero no carga (un error de sintaxis, un import roto) | **Corta la corrida** nombrándolo. Nunca sigue "con las del kit": fotografiaría una matriz distinta de la que declaraste y la reportaría como la auditoría que pediste |
| Excluiste una pantalla del kit que después el kit renombró      | Se **reporta** en el manifest (`staleExclusions`); la corrida sigue                |
| Un filtro `EVIDENCE_SURFACES` con typo                          | **Revienta** nombrándolo. Nunca degrada a cero capturas                            |
| Tu skin declara dos temas y no tres                             | Captura dos. Los temas salen del registro del skin, no de una lista fija           |
| El kit agregó una pantalla que **tu app no tiene**              | Se **salta** con su motivo en el manifest (`skippedSurfaces`) y la corrida sigue con las demás. Remedio durable: agrégala a `EXCLUDED_KIT_SURFACES` |
| El kit agregó una pantalla que **tu app sí tiene, con otra forma** | Mismo trato: la ruta responde y sirve la pantalla correcta, pero el elemento que el kit espera (`readySelector`) nunca aparece → se **salta** con su motivo. Remedio durable: decláratela en tu lista con tu propio `readySelector`, o exclúyela por nombre |
| Una pantalla que **tú** declaraste no carga                     | **Rompe la corrida.** Tú escribiste esa línea sobre tu propia app: su ausencia es un error tuyo, no una diferencia con el kit |
| **Todas** las superficies se saltaron                           | **Falla.** Cero capturas se leería como "sin hallazgos" — tolerar una pantalla que falta no es tolerar una auditoría vacía |
| `tests/.evidence/` sin ignorar en tu `.gitignore`               | Banner al inicio y al final con la línea a agregar. **Avisa, no rompe** (§5)        |

---

## 8. Preguntas que aparecen siempre

**¿Esto encarece mi `pnpm test:e2e` de siempre?** No. La fase es `optIn`: sólo corre cuando la nombras (`pnpm evidence:visual`).

**¿Puedo correr el capturador sin el runner, con `playwright test`?** No, y no es una limitación del harness: `tests/global-setup.ts` rechaza toda corrida cuyo `DATABASE_URL` no sea la rama efímera que el runner creó. El harness no pide excepción — fotografiar pantallas vacías no demuestra nada.

**¿Cuánto tarda?** Paga el costo por-corrida del runner (rama, migración, sembrado, build, servidor) y se salta la suite de specs, que es lo que domina el tiempo total. No se promete una cifra.

**¿Y si estoy en perfil `core`?** No se puede: `core` recibe la skill (glob `fx-*`) pero no `scripts/tools/e2e-runner.ts`. Es estructural. `ui-critic` reporta el check multi-tema como "no demostrado" ahí, permanentemente y a propósito.

**¿El harness decide si mi UI está bien?** No. Produce evidencia; el veredicto lo firma `ui-critic` y la pasada humana antes de mergear sigue en pie.

---

## 9. Qué esperar

- **Si no lo aplicas:** nada cambia. Tu suite corre igual y `ui-critic` sigue auditando por código, reportando el check multi-tema como "no demostrado".
- **Si lo aplicas:** cada auditoría visual llega con imágenes reales de tu app en cada tema y cada ancho, con el contraste medido sobre el DOM vivo — y un hallazgo "pantalla vista" deja de ser una afirmación sobre algo que nadie miró.

---

_TimeKast Factory — retrofit: adopción del harness de evidencia visual_
