# Runbook — Pasar a la bóveda de secretos un repo que nació antes de ella (o declinarla)

> **Aplica si:** tu derivado es de perfil `full` y su `.timekast/provision.json` no tiene bloque `vault` (trabaja con `.env.local` + `env:push`).
>
> 🔴 **En perfil `core` la bóveda no se ofrece:** ese perfil no trae el wrapper que la inyecta a los
> scripts, y `factory vault adopt` lo dice y no hace nada. Si tu repo es `core`, esta guía no te aplica.
>
> **Disponible desde:** kit `v13.0.0`
>
> **Audiencia:** el equipo (o el agente) de un derivado. La guía se basta sola; el contrato que describe —
> layout de carpetas, syncs, qué es cada entorno— vive en [`fx-secrets-vault`](../../skills/fx-secrets-vault/SKILL.md),
> y los flags del CLI en [`fx-factory-cli`](../../skills/fx-factory-cli/SKILL.md).
>
> 🔴 **Ningún paso de esta guía imprime un valor.** El CLI reporta **nombres** de variable y, donde
> compara, una **huella** (un hash con una llave aleatoria de esa corrida, que no sirve fuera de ella).
> Si en algún momento ves un valor en pantalla, algo está mal: detente y repórtalo.

---

## 0. TL;DR

| Paso | Qué haces                                                                                   |
| ---- | ------------------------------------------------------------------------------------------- |
| 1    | Onboarding de tu máquina (§1) — una sola vez por persona                                    |
| 2    | `factory update` y `factory update --verify` limpio en lo que corre el wrapper (§3, caso 3) |
| 3    | `npx @timekast/factory vault adopt` — **sin `--apply`**: sólo enseña el plan                |
| 4    | Revisa el plan con tu caso (§3) y resuelve lo que bloquea                                   |
| 5    | `npx @timekast/factory vault adopt --apply` en una terminal (pide confirmaciones)           |
| 6    | Prueba el repo (§4)                                                                         |

**O**, si tu equipo decide no entrar: `npx @timekast/factory vault adopt --decline` (§3, caso 7).

**No confundir dos comandos que se llaman parecido:**

| Comando                      | Qué hace                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `factory provision --adopt`  | Reconstruye `.timekast/provision.json` (ids de Neon, Vercel, GitHub, dominios) leyendo a los proveedores. **No toca secretos** |
| `factory vault adopt`        | Pasa los **secretos** del repo a la bóveda: los importa, crea los syncs, cablea el wrapper y retira `.env.local` |

No necesitas correr el primero antes del segundo: `vault adopt` escribe el vínculo con la bóveda en
`.timekast/provision.json` exista o no el archivo, y un `provision --adopt --force` posterior conserva ese
vínculo.

---

## 1. Onboarding — tu máquina, una sola vez

1. **Acepta la invitación** a la organización `TimeKast` que llega por correo, y crea tu cuenta desde ese enlace.
2. **Instala el CLI de la bóveda y entra con el dominio:**

   ```bash
   brew install infisical
   infisical login --domain=https://secrets.timekast.com
   ```

   🔴 **El `--domain` no es opcional.** Sin él, el CLI apunta a la nube de pago de Infisical y el login
   **crea una cuenta ahí**, que no es la de la organización. Los síntomas después confunden ("run infisical
   init", `connection refused`, proyectos que "no existen"). Si alguna vez entraste a otro lado, vuelve a
   hacer login con el `--domain` (detalle en [`fx-secrets-vault §3`](../../skills/fx-secrets-vault/SKILL.md)).

3. **Pide acceso al proyecto `rail-timekast` a un admin de la bóveda.** El acceso es por proyecto: estar en
   la organización no da acceso a ninguno. Sin él, `vault adopt` no puede leer los tokens con los que
   consulta a Vercel, Neon y Railway.
4. **Borra `~/.claude/.env` si existe.** Es una copia local de tokens de la organización que ningún
   comando del kit lee y que nadie rota. `factory doctor` te nombra la ruta si encuentra un archivo así.
   Lo mismo con un `export` de un token de la organización en tu `.zshrc`: los comandos lo ignoran y avisan
   nombrando la variable; bórralo.

**Cómo verificar:** corre `npx @timekast/factory doctor` en cualquier derivado. No debe nombrar ningún
archivo con tokens en tu máquina, y un comando que lee el rail (por ejemplo, el plan de `vault adopt`) no
debe decir "sin sesión" ni "sin acceso". Si lo dice, la tabla de fallas de
[`fx-secrets-vault §3`](../../skills/fx-secrets-vault/SKILL.md) nombra el arreglo de cada una.

Además necesitas tu sesión de `gh` (el plan lista los nombres de los secrets de GitHub Actions del repo).

---

## 2. Qué hace `vault adopt`, en orden

**Sin `--apply` (el plan) no escribe nada.** Corre las precondiciones y enseña, por variable: su **estado**
entre las fuentes, dónde la escribiría el `--apply` y qué confirmaciones te va a pedir.

- **Precondiciones:** el cerebro al día (compara tu versión instalada con la última, igual que
  `factory status`) y sin forks en los archivos que corre el wrapper. Si falla cualquiera, se detiene
  nombrando qué hacer.
- **Fuentes:** `.env.local`, Vercel production, Vercel preview y Railway (el proyecto de Railway que tiene
  conectado el repo, se llame como se llame). El proyecto de Vercel se busca por el id registrado en `.timekast/provision.json` y, si no hay,
  por el repo de GitHub conectado.
- **Estados:** `igual` · `distinta` · `sólo local` · `sólo en el deploy` · `ilegible`.
- **`--json`** imprime el mismo plan como JSON (nombres y huellas, nunca valores).

**Con `--apply`**, a grandes rasgos (el orden exacto, paso por paso, está en
[`fx-factory-cli` § `factory vault adopt --apply`](../../skills/fx-factory-cli/SKILL.md)):

1. Crea el proyecto del repo en la bóveda (mismo slug que en Vercel) con sus miembros y protegido contra
   borrado, o adopta el que ya existe con ese slug.
2. **Importa primero:** escribe cada valor en su carpeta — `main` y `develop` **desde el deploy**, `local`
   **desde `.env.local`** — antes de crear cualquier sync. Un deploy **conectado y vacío** es la única
   excepción (caso 8). Los tokens de la organización nunca se importan, tengan el valor que tengan (la
   lista está en [`fx-secrets-vault §8`](../../skills/fx-secrets-vault/SKILL.md)). La `NEON_API_KEY` de
   `.env.local` se importa **sólo si se prueba** acotada al proyecto (cómo se prueba:
   [`fx-factory-cli`](../../skills/fx-factory-cli/SKILL.md)); si no, se acuña una del proyecto, y la
   anterior se revoca sólo cuando el sync de `develop:/ci` entregó la nueva a GitHub.
3. Crea los syncs (`main:/` → Vercel production, `develop:/` → preview, `develop:/ci` → secrets de GitHub
   Actions, y los de Railway que confirmes). Justo antes, vuelve a comprobar por nombres que cada clave
   del destino esté en su carpeta: el primer sync no debe borrar nada.
4. Guarda el vínculo en `.timekast/provision.json` (bloque `vault`).
5. Cablea el wrapper de la bóveda en los scripts de `package.json`, **mostrando el diff antes de escribir**.
6. Renombra `.env.local` a `.env.local.pre-vault.bak`.

Cada diferencia la confirmas tú, una por una. **Sin terminal no se confirma nada a ciegas:** el `--apply`
se detiene nombrando lo que necesita confirmación y no escribe nada. Correrlo otra vez adopta lo que ya
existe y no duplica.

---

## 3. Tu caso

Cada caso: **síntoma → pasos → cómo verificar.** Un repo puede caer en varios.

### Caso 1 — Repo al día

**Síntoma:** el plan sale sin bloqueos; las variables están `igual` o `sólo en el deploy`, y
`.env.local` sólo trae lo de tu máquina.

**Pasos:**

1. Lee el plan completo. Revisa en particular la sección de GitHub: si nombra secrets del repo que **no
   estarían en `develop:/ci`**, el `--apply` los va a tratar como en el caso 2 (se detiene antes de crear
   los syncs).
2. Corre `npx @timekast/factory vault adopt --apply` en una terminal y confirma cada pregunta.
3. Commitea `.timekast/provision.json` y `package.json` (el vínculo son ids, no secretos).

**Cómo verificar:** el comando termina con `✔ Repo adoptado en la bóveda`; `factory doctor` reporta el
modo `bóveda` y el drift contra Vercel sin diferencias; y §4 pasa.

### Caso 2 — `.env.local` viejo frente al deploy

**Síntoma:** el plan marca variables `distinta` entre tu `.env.local` y Vercel, o `sólo local` que en
realidad deberían estar en el deploy.

**Por qué no pasa nada grave:** `main` y `develop` se importan **del deploy**, nunca de `.env.local`, que
apunta a develop y puede estar viejo. Lo que está en producción hoy es lo que sigue en producción mañana.
`local` sí sale de `.env.local`.

**Pasos:**

1. Corre el plan (sin `--apply`) y lee cada `distinta`: la huella del deploy y la de `.env.local` difieren.
   Decide si tu archivo local está simplemente atrasado (lo normal) o si el deploy tiene un valor que ya
   no debería.
2. Si el deploy es el que está mal, arréglalo **después** de adoptar, en la bóveda: desde ahí el sync lo
   lleva al deploy. No lo arregles a mano en Vercel antes: sería un segundo escritor.
3. El plan también marca lo que **no se importa**: una clave sólo-local que vive en un deploy (por ejemplo,
   la key del backlog central) o un token de la organización en un deploy. No se importa y el sync la quita
   del deploy; te pide confirmarlo. Si el deploy trae la key de equipo de Resend, se acuña una propia del
   proyecto (sólo envío, limitada a su dominio) y reemplaza a la de equipo; también se confirma.
4. **Secrets de GitHub Actions que no estarían en `develop:/ci`:** el `--apply` importa todo y se
   **detiene antes de crear cualquier sync**, nombrándolos. Agrégalos en `develop:/ci` del proyecto del
   repo en la bóveda (o bórralos del repo de GitHub si ya no se usan) y repite el `--apply`: adopta lo que
   ya escribió y sigue. 🔴 Lo que escribes desde el dashboard de la bóveda o con `infisical secrets set`
   no pasa por el guard del CLI: la carpeta correcta de cada clave es la de
   [`fx-secrets-vault §7`](../../skills/fx-secrets-vault/SKILL.md).
5. Corre `--apply` y confirma cada diferencia.

**Cómo verificar:** `factory doctor` sin drift contra Vercel. Tu viejo archivo quedó como
`.env.local.pre-vault.bak`: revísalo y bórralo cuando ya no lo necesites. Si ya existía un `.bak`, el CLI
no lo pisa y deja `.env.local` en su lugar con un aviso: retíralo tú, porque Next.js lo carga encima de la
bóveda. Si git no ignora el `.bak`, tampoco renombra (un secreto en el historial es permanente): agrega
`.env*` a tu `.gitignore` y renómbralo tú.

### Caso 3 — Scripts forkeados

**Síntoma:** el plan se detiene diciendo que los archivos que corre el wrapper difieren de lo que instaló
el kit (o faltan), nombrándolos; o, ya con el `--apply`, avisa que ciertos scripts de `package.json` son de
tu equipo y no los tocó.

Son dos cosas distintas:

- **Archivos del kit que tu repo modificó** (por ejemplo, un script de `scripts/tools/` que corren
  `db:query` o `test:e2e`, el propio wrapper, o `.claude/policy/vault.json`). La adopción **aborta** sin
  hacer nada. `npx @timekast/factory update --verify` te los reporta; `factory update` te ofrece traer los
  del kit, archivo por archivo. Si tu equipo forkeó para meter lógica propia, sácala a un punto de
  extensión ([`extending-the-kit.md`](../extending-the-kit.md)) y vuelve al archivo del kit.
- **Scripts de `package.json` que tu equipo customizó** (un valor distinto del que shippeó el kit). El
  `--apply` cablea el wrapper sólo en los que conservan el valor del kit y **nombra los demás sin
  tocarlos**. Esos scripts corren **sin** los secretos de la bóveda hasta que los adaptes, anteponiendo
  `node scripts/tools/with-vault.mjs` a su comando.

**Cómo verificar:** `factory update --verify` sin diferencias en esos archivos, y el plan ya no se detiene.
Después del `--apply`, cada script que el aviso nombró arranca con el wrapper.

### Caso 4 — Deploy en Railway

**Síntoma:** el plan tiene una sección de Railway: un proyecto de Railway tiene conectado este repo (el
`source.repo` de sus servicios, sin distinguir mayúsculas). El nombre del proyecto en Railway no importa:
`constela` puede desplegar `TimeKast/constela_front`, y un proyecto que se llama como el repo pero despliega
otro repo no es éste.

**Pasos:**

1. **Dentro de `vault adopt`:** por cada servicio cuyo entorno de Railway **se llama igual** que uno de la
   bóveda (`main` o `develop`), el plan propone un sync. Con `--apply` los confirmas uno por uno; el que no
   confirmes no se importa ni se crea. Lo que sólo tiene Railway se escribe en la bóveda **antes** de crear
   el sync, con la misma re-comprobación justo antes. Las variables que Railway inyecta por su cuenta
   (`RAILWAY_*`) nunca se importan.
2. **Entornos con otro nombre** (por ejemplo, `production`): el plan los lista sin sync. Después de adoptar,
   créalo tú:

   ```bash
   npx @timekast/factory vault sync railway --project <id> --service <id> --env main --railway-env production
   ```

   `--env` es el entorno de la bóveda (`main` o `develop`) y, por default, también el nombre del entorno de
   Railway; `--railway-env` va cuando se llama distinto. Si Railway no tiene ese entorno, el comando aborta
   nombrando los que sí existen. Este subcomando exige que el repo ya tenga bloque `vault`.
3. Un valor distinto, una clave sólo-local o un token de la organización presentes en Railway se confirman
   uno por uno; sin terminal no se escribe nada.

**Si se detiene:**

- Falta la conexión de la bóveda con Railway (la "app connection" de la organización) → la crea un admin
  de la bóveda. El CLI no la crea: guardaría en la bóveda una copia de un token de la organización.
- El proyecto no aparece → vive en la cuenta de Railway **de un cliente**, que usa otro token; este comando
  no lo maneja.
- Hay **dos o más** proyectos de Railway conectados al repo → es un repo con varios despliegues (uno por
  cliente). El plan y el `--apply` se detienen **antes de escribir nada**, nombrándolos con su id: `vault
  adopt` nunca importa a una sola bóveda valores de despliegues distintos. Esos despliegues siguen el patrón
  de varios despliegues —un proyecto de la bóveda por despliegue, con plantilla y registro— y se operan con
  `factory vault deploys` (caso 6). Varios servicios de **un mismo** proyecto (web + worker) son un solo
  despliegue y no detienen nada.
- El plan dice que no inventarió Railway → falta `RAILWAY_TOKEN` en el rail, o el repo no tiene remote
  `origin` de GitHub: sin repo no hay contra qué buscar.
- Railway respondió sin una lista (de proyectos, servicios, entornos o variables) o en varias páginas → el
  plan se detiene: una respuesta incompleta nunca se lee como "sin proyecto". Repite; si persiste, prueba
  el token como indica [`fx-secrets-vault §5`](../../skills/fx-secrets-vault/SKILL.md).
- Dos servicios que leerían la misma carpeta tienen valores distintos para una clave → iguálalos en
  Railway, o no confirmes uno de esos syncs.

**Cómo verificar:** en la bóveda, los syncs del proyecto muestran uno por servicio hacia Railway.
`factory doctor` compara la bóveda contra Railway sólo si `.timekast/provision.json` trae `target: railway`
**y** el bloque `railway` (proyecto, servicio, entornos); `vault adopt` no escribe ninguno de los dos. Sin
ellos, para Railway reporta "no verificado" (o "no verificable" si el destino ya es Railway pero falta el
bloque). Regístralos con `factory provision --adopt --force --target=railway` — el `--force` porque el
`--apply` ya dejó el archivo, y `--adopt` a secas se niega a reescribirlo.

### Caso 5 — Llave sellada

**Síntoma:** el `--apply` se detiene **antes de escribir nada**, con un bloque que empieza por
"🔴 Me detengo sin escribir nada: hay llaves SELLADAS", y sale con **código 3** (no con 0: nadie debe
leerlo como terminado).

**Qué es:** Vercel tiene variables marcadas `sensitive`, que no devuelve ni por API ni en el dashboard.
`vault adopt` clasifica cada una:

- **derivable** — se recalcula del proveedor: `DATABASE_URL` (se pide a Neon), el origen de la app y el
  rpID de las passkeys (del dominio del proyecto en Vercel). Confirmas cada derivación. Si hay cero o
  varios dominios candidatos, no adivina: el `--apply` te pregunta el host y, sin terminal, se detiene
  nombrándolos (la regla completa está en [`fx-factory-cli`](../../skills/fx-factory-cli/SKILL.md)).
- **rotable** — `AUTH_SECRET` lo genera el CLI tras confirmar, avisando que **cierra todas las sesiones**
  de ese entorno. Las credenciales OAuth y las API keys se reemiten en la consola de su proveedor y se
  cargan en su carpeta de la bóveda; hasta que estén ahí, el `--apply` se detiene nombrándolas.
- **sellada** — cifra datos guardados: `MFA_ENCRYPTION_KEY` y toda variable con forma de llave de cifrado.
  Una llave nueva deja ilegible, **para siempre**, lo que ya está cifrado con la vieja.

Una `sensitive` que el kit no conoce se pregunta ("¿confirmas que NO cifra datos guardados?"). **Sin
terminal, o si no respondes que sí, se trata como sellada.** Si dudas, responde que no.

**Pasos:**

1. 🔴 **Nunca generes una llave nueva para destrabar la adopción.**
2. La llave se recupera con un **deploy puente**: un build único del proyecto en Vercel que lee la variable
   y la escribe directo a su carpeta de la bóveda, sin imprimirla en ningún log. El mensaje del CLI nombra
   la variable, el entorno de Vercel y la carpeta de destino.
3. Ese deploy lo **autoriza y lo supervisa paso a paso una persona**: ni el CLI ni un agente lo disparan
   solos.
   - **Si el proyecto del repo todavía no existe en la bóveda** (el mensaje del CLI lo dice), esa persona
     crea a mano el layout mínimo, con su sesión: un proyecto con el **slug del repo**, los entornos
     `main`, `develop` y `local`, y la **carpeta destino** de la llave que nombra el mensaje. Nada más: el
     `--apply` siguiente adopta el proyecto por su slug y completa miembros, protección contra borrado e
     import. Lo mismo aplica a una credencial rotable que se reemite en su proveedor y se carga a mano.
4. Con la llave en la bóveda, vuelve a correr `vault adopt --apply`: la reconoce, **no la sobrescribe** y
   continúa.

**Cómo verificar:** el `--apply` ya no se detiene en esa variable, y después de adoptar los usuarios con
MFA siguen entrando (el secreto de MFA de uno de ellos se descifra con la llave recuperada).

### Caso 6 — Repo con varios despliegues

**Síntoma:** el mismo código está desplegado varias veces (uno por cliente, por ejemplo). `vault adopt` se
detiene si encuentra varios proyectos de Vercel conectados al repo y ninguno registrado en
`.timekast/provision.json`: los nombra con su id y no elige uno a ciegas.

**Versión del CLI:** la que trae `factory vault deploys` — corre los comandos con
`npx @timekast/factory@latest …`.

**El modelo** ([`fx-secrets-vault §6`](../../skills/fx-secrets-vault/SKILL.md), "Un repo con varios
despliegues" — ahí está la forma completa del registro y la lista de claves de valor único): el repo
conserva su proyecto **principal** (el del bloque `vault`); cada despliegue es su propio proyecto
`<repo>-<slug>`; lo común vive en la **plantilla** `<repo>-defaults`; y la precedencia por clave es valor
propio del despliegue → lo que deriva su registro (dominio, bucket) → la plantilla. Lo opera
`factory vault deploys` (flags y errores → [`fx-factory-cli`](../../skills/fx-factory-cli/SKILL.md)).

**Pasos:**

1. **El principal primero.** Elige cuál de los proyectos de Vercel queda en el proyecto principal y
   adóptalo con `npx @timekast/factory@latest vault adopt --vercel-project <id>` (sin `--apply` para ver el
   plan, luego con `--apply`), siguiendo los casos 1 a 5 para ese despliegue. El `--apply` registra el
   elegido: las corridas siguientes ya no piden el flag. Ese despliegue **no** se declara en el registro:
   un destino tiene un solo escritor, y `vault deploys` se detiene si otro proyecto ya sincroniza a él.
2. **La plantilla, a mano.** En el dashboard de la bóveda, con tu sesión:
   - Crea el proyecto `<repo>-defaults` (siempre empieza por el slug del principal y un guion).
   - Deja sólo el entorno `main`: borra `dev`, `staging` y `prod`, que Infisical crea solos.
   - Agrega como miembros a los admins de la bóveda: el acceso es por proyecto, y sin ellos la plantilla
     queda visible sólo para ti.
   - Enciende la protección contra borrado (_Delete Protection_).
   - Carga en `main:/` los valores comunes a todos los despliegues. No van claves de valor único (la
     lista está en `fx-secrets-vault §6`), ni tokens del rail, ni nombres con `_MAIN`/`_DEVELOP`: el
     comando se detiene nombrándolas.
   - Copia el id del proyecto: va en `template.projectId` del registro.
3. **El registro.** Escribe `.timekast/deploys.json`:

   ```json
   {
     "template": { "projectId": "<id de la plantilla>" },
     "deploys": [
       {
         "slug": "cliente-a",
         "name": "Cliente A",
         "domains": { "main": "app.cliente-a.com", "develop": "dev.cliente-a.com" },
         "ownKeys": ["DATABASE_URL", "AUTH_SECRET", "MFA_ENCRYPTION_KEY"],
         "vercel": { "projectId": "prj_…" }
       }
     ]
   }
   ```

   `ownKeys` lista los **nombres** de lo que es propio de ese despliegue; todo lo demás se vuelve a
   sembrar desde la plantilla en cada corrida. Si el proyecto `<repo>-<slug>` de un despliegue **ya
   existe** en la bóveda, verifica en el dashboard que es de ese cliente (miembros, secretos, syncs) y
   anota su id en `vault.projectId` de ese despliegue: sin el id, el comando no lo adopta. Los proyectos
   que el `--apply` crea anotan su id solos.

   Comprueba que git no ignora el archivo: `git check-ignore .timekast/deploys.json` no debe imprimir
   nada. Commitéalo (son nombres e ids, nunca credenciales).
4. **El plan:** `npx @timekast/factory@latest vault deploys`. Lee por despliegue y por entorno qué clave
   se añade o cambia, qué proyectos se crean, las claves propias que todavía no tienen valor y cada sync.
   No escribe nada.
5. **Primer `--apply` sobre un despliegue vivo:** `npx @timekast/factory@latest vault deploys --apply`
   (o `--deploy <slug>` para uno solo). Crea los proyectos que faltan con sus miembros y protección
   contra borrado, anota sus ids en el registro y siembra lo común. Mientras un entorno no tenga los
   valores de sus claves propias, su sync queda **pendiente** ("pendiente — faltan valores propios: …")
   y no se crea: todavía no se compara con el destino, así que nada del despliegue vivo se borra.
6. **Los valores propios.** Carga en `main:/` y `develop:/` del proyecto de cada despliegue sus claves de
   `ownKeys` que el plan marca sin valor, importándolos del despliegue vivo.
   - 🔴 **`MFA_ENCRYPTION_KEY` y toda llave de cifrado son selladas:** nunca generes una nueva para
     completar la lista; se importa primero la que el despliegue ya usa. Si Vercel la tiene como
     `sensitive` y no se puede leer, se recupera con un deploy puente, igual que en el caso 5
     ([`fx-secrets-vault §8`](../../skills/fx-secrets-vault/SKILL.md)).
7. **Segundo `--apply`:** con los valores cargados, el comando compara cada destino con su carpeta. Si el
   destino tiene variables que la bóveda no tendrá, se detiene nombrándolas: decláralas propias (en
   `ownKeys` y con su valor) o ponlas en la plantilla, y repite. Si no, crea los syncs.
   - Si el `--apply` va a **cambiar** valores ya guardados, primero los lista y pide confirmación; sin
     terminal, sólo `--yes` la da.
   - Si el comando dice que un valor de un despliegue aparece en otro (o en el principal), corrígelo en
     el que lo tiene mal: no se escribió nada.
8. **Commitea el registro** con los ids que anotó el `--apply`.

**Cómo verificar:** una segunda corrida sin `--apply` dice "Nada que cambiar en la bóveda." y cada sync
`ya existe` (ninguno `pendiente`). En el dashboard de la bóveda, cada `<repo>-<slug>` tiene sus miembros,
y sus syncs apuntan sólo a su propio destino, nunca a `/ci`. Para rotar un valor común, cámbialo en la
plantilla y repite el `--apply`: la plantilla no tiene sync, así que el cambio llega a los despliegues
que no lo declaran propio sólo con esa corrida. Una clave no propia que alguien editó a mano en un
despliegue vuelve al valor de la plantilla en la corrida siguiente.

### Caso 7 — Declinar

**Síntoma:** tu equipo decide que este repo **no** entra a la bóveda.

**Pasos:**

```bash
npx @timekast/factory vault adopt --decline
```

Registra el "no" en `.timekast/provision.json` y nada más: no toca `.env.local` ni `package.json`, no
consulta ningún servicio. Va solo (con `--apply`, `--json` o `--team` se rechaza). Correrlo otra vez no
cambia nada. En un repo ya adoptado se niega sin escribir.

**Qué cambia:** `factory doctor` deja de proponerte `vault adopt`; `doctor` y `status` reportan el modo
`declinado`. El repo sigue con `.env.local` y `env:push` como siempre.

**Cambiar de opinión:** `factory vault adopt` sigue disponible. El plan avisa que el repo había declinado,
y el `--apply` borra esa marca al guardar el vínculo.

**Cómo verificar:** `factory doctor` dice "este repo declinó la bóveda (modo `declinado`)" y no sugiere
adoptar.

### Caso 8 — Deploy conectado y vacío

**Síntoma:** el plan dice "Deploy conectado y VACÍO": el proyecto de Vercel conectado al repo no tiene
ninguna variable y Railway se consultó y ningún proyecto tiene conectado el repo. Pasa con un proyecto de Vercel
recién creado para el repo.

**Qué cuenta como vacío:** el criterio exacto está en
[`fx-factory-cli` § `factory vault adopt`](../../skills/fx-factory-cli/SKILL.md). Lo que importa aquí: una
respuesta que no se pudo leer, o no poder consultar Railway, **nunca** cuenta como vacío; ahí rige la
regla normal.

**Qué hace distinto:** los valores **por entorno** se generan o derivan como en un deploy nuevo, nunca de
`.env.local`: un `AUTH_SECRET` distinto en `main:/` y en `develop:/`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_APP_ENV`, `WEBAUTHN_RP_ID`/`WEBAUTHN_RELATED_ORIGINS` (de los hosts) y `DATABASE_URL` por
branch de Neon. De `.env.local` salen sólo los valores **compartidos** del producto (`MFA_ENCRYPTION_KEY`, el
remitente, flags del producto): cada uno se confirma; el que no confirmes queda sólo en `local`.

**Pasos:**

1. Lee en el plan los hosts. El de producción es el dominio del proyecto en Vercel que no está ligado a
   una rama; el de preview, el ligado a la rama `develop`. Si Vercel no da uno, o da varios, el `--apply`
   te lo pregunta (sólo el host, sin `https://`); sin terminal se detiene nombrándolos. Nunca se inventa.
2. Si el proyecto de Neon tiene un solo branch, el plan dice que `main` y `develop` quedan en la **misma
   base**; el `--apply` te pide confirmarlo. Si no lo quieres, crea un branch `develop` en Neon y repite.
3. Corre `--apply` y confirma cada valor compartido.

**Cómo verificar:** en la bóveda, `main:/AUTH_SECRET` y `develop:/AUTH_SECRET` existen y son distintos, y
`develop:/` referencia los compartidos de `main:/`. Tras el primer deploy, `factory doctor` sin drift.

---

## 4. Cómo probar después de adoptar

Todo corre sin `.env.local`: el wrapper inyecta el entorno `local` de la bóveda con tu sesión.

| Prueba                 | Qué esperas                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm dev`             | La app arranca y conecta a la base de develop                                                |
| `pnpm db:query "SELECT 1"` | Responde desde develop                                                                   |
| `pnpm db:query:main "SELECT 1"` | Responde desde producción (lee `DATABASE_URL` del entorno `main`)                   |
| `pnpm test:e2e`        | La corrida crea su branch efímera y pasa como antes                                          |
| Un deploy preview      | Un push a `develop` genera un preview que recibe sus valores **por el sync** de `develop:/`  |
| `npx @timekast/factory doctor` | Modo `bóveda`; drift contra el destino sin diferencias: contra Vercel, o contra Railway si el state trae `target: railway` y el bloque `railway`. Sin ellos, Railway sale "no verificado" → `factory provision --adopt --force --target=railway` |

**Lo que `doctor` y `status` te dicen del modo:** `bóveda` (el repo vive en la bóveda) · `declinado` ·
`sin decidir` (nadie ha decidido; sólo aquí `doctor` sugiere `vault adopt`) · `no aplica` (perfil `core`, o
falta `scripts/tools/with-vault.mjs`).
En modo `bóveda` agregan el **drift** bóveda ↔ Vercel por huella (`main` ↔ production, `develop` ↔
preview): una clave `distinta` o `sólo en el deploy` es la marca de un segundo escritor — el valor se
cambia en la bóveda y llega por el sync. `ilegible` es una `sensitive` de Vercel. Sin sesión, sin red o si
la bóveda tarda, el drift sale "no verificable" con su causa, sin fallar el comando. En CI no se intenta.

Si algo falla: `TK_ENV_OVERRIDE=<archivo> pnpm dev` pisa valores **sólo en esa corrida** (el wrapper
imprime los nombres que pisó), útil para aislar si el problema es un valor de la bóveda.

---

_TimeKast Factory — retrofit: adopción de la bóveda de secretos. Complementa
[`fx-secrets-vault`](../../skills/fx-secrets-vault/SKILL.md) (contrato),
[`fx-factory-cli`](../../skills/fx-factory-cli/SKILL.md) (flags) y
[`legacy-migration.md`](./legacy-migration.md) (índice de retrofits)._
