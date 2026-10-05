---
name: fx-secrets-vault
description: Factory-internal admin guide to the org secrets vault (self-hosted Infisical at secrets.timekast.com) — the rail-timekast tokens and how to test each one, how a project is set up in the vault (provision, folder layout, syncs to deploys, adopting an older repo) and repos deployed once per client. Invoke when a rail token looks dead or missing, when granting vault access, or when creating, adopting or splitting vault projects. First login and daily local work → sk-vault; CLI flags → fx-factory-cli.
family: factory-internal
last-verified: 2026-10-01
user-invocable: false
---

# fx-secrets-vault — La bóveda de secretos y el rail de la organización

> **Propósito:** explicar dónde viven los secretos de TimeKast, cómo entra cada persona, qué alcanza
> cada token de la organización, y cómo vive un proyecto en la bóveda: alta, trabajo local, deploys y adopción.
>
> **Viaja a los derivados** por el glob `fx-*`.
>
> **Boundary:** los flags y el troubleshooting de cada comando del CLI →
> [`fx-factory-cli`](../fx-factory-cli/SKILL.md). La key project-scoped del backlog central →
> [`fx-backlog-central`](../fx-backlog-central/SKILL.md).
>
> 🔴 **Los valores no se imprimen nunca** — ni completos, ni en cola, ni en un log, ni en un mensaje.
> Lo que se reporta es el **nombre** de la variable.

---

## §1 ¿Cuándo se auto-carga?

Routing semántico (CC.md §1.1). Triggers típicos:

- "falta `NEON_API_KEY`", "el token de Railway dice Not Authorized", "¿el token de Cloudflare está muerto?"
- "¿cómo entro a la bóveda?", "da acceso a X a los secretos", "da de alta el proyecto en Infisical"
- Antes de hablarle a la API de Railway, Neon, Vercel, Cloudflare, Resend o de la bóveda

**NO se carga cuando:** vas a correr o depurar un comando del CLI → [`fx-factory-cli`](../fx-factory-cli/SKILL.md).

---

## §2 Dos capas que no se mezclan

| Capa | Qué es | Dónde vive |
| --- | --- | --- |
| **Rail** | Los tokens de administración con los que una persona opera la metodología desde su máquina: crear bases, proyectos de hosting, DNS, publicar propuestas | Proyecto **`rail-timekast`** de la bóveda |
| **Secretos de un proyecto** | Lo que necesita UN despliegue para correr: cadena de conexión, `AUTH_SECRET`, credenciales OAuth… | El proyecto de la bóveda de ese repo (§6) |

🔴 **Un token del rail nunca sale hacia un despliegue** — con o sin bóveda: tampoco la key de Resend,
que sólo acuña la del proyecto (§5), ni el token de DNS de Cloudflare, que `provision` usa al correr y
no copia a ningún lado. Y al revés: un valor que se siembra a cada despliegue no es del rail aunque sea
de la organización — vive en el proyecto del producto que lo siembra. La única excepción es una copia
de `SHORTIO_API_KEY` para el CI del Factory (abajo). Mezclarlos da a quien despliega
un derivado una credencial que no opera, y deja **dos copias del mismo secreto**: la rotación se hace
en una y la otra se queda viva.

**`rail-timekast` no tiene syncs.** Ninguna carpeta del rail se sincroniza a un destino, y ningún
comando del kit crea un sync ahí: los tokens se leen con la sesión de quien opera, y nada más.

**La única copia aceptada de un token del rail** (sólo en el repo del Factory; no aplica a un
derivado). El release del launcher (`gui-release.yml`) re-apunta su link corto con `SHORTIO_API_KEY`, y
lo corre el CI del Factory, que no lee el rail: ninguna identidad de máquina lo lee (§3). Por eso ese
token vive, además de en `rail-timekast`, en `develop:/ci` del **proyecto del Factory** en la bóveda, y
llega al secret de GitHub Actions del repo por el sync de esa carpeta (§7), su único escritor.

- **Razón:** la key del acortador es una sola en la cuenta, y el CI no tiene otra vía para leerla.
- **Costo, aceptado:** al rotarla en el rail, la copia se actualiza **a mano** (§9); mientras no se
  copie, el release usa la key vieja. La administra una sola persona y casi no rota.
- Un `gh secret set SHORTIO_API_KEY` a mano es un segundo escritor: su valor dura hasta el siguiente
  sync, que lo pisa.

---

## §3 Entrar a la bóveda

| Qué | Valor |
| --- | --- |
| Instancia | Infisical self-hosted en **`https://secrets.timekast.com`**, organización `TimeKast` |
| Rail | Proyecto **`rail-timekast`**, id `32ab3274-c272-4c31-ace4-fc6726f775ba`, entorno `main`, carpeta `/`. Sin syncs (§2) |
| Credencial | **La sesión de la persona** (`infisical login`). Nunca un archivo compartido ni una identidad de máquina en una laptop |

### Primera vez en una máquina

1. La cuenta, el CLI, el login con `--domain` y la comprobación de la sesión →
   [`sk-vault §2`](../sk-vault/SKILL.md). Es lo mismo para quien administra y para quien solo trabaja en
   el código. El CLI recuerda el dominio del último login en `~/.infisical/infisical-config.json` y ese
   recuerdo le gana a `INFISICAL_API_URL`; los lectores del kit usan el dominio de
   `.claude/policy/vault.json` (el CLI, desde una copia embebida: ver abajo).
2. Quien opera la metodología pide además acceso al proyecto `rail-timekast` a un admin de la bóveda.
   **El acceso es por proyecto**: estar en la organización no da acceso a ninguno, y un member no se
   agrega solo. Quien solo trabaja en el código de un repo necesita el proyecto de ese repo, nunca el rail.

La sesión caduca. Si un comando dice que no hay sesión, es `infisical login` otra vez, no un token muerto.
Una clave ausente que nombra un lector del kit es otra falla (tabla de abajo): la sesión está bien y la
clave falta en la bóveda.

### Cómo leen el rail las herramientas del kit

**No hay copia en disco y hay una sola fuente.** Ni `~/.claude/.env`, ni un `.env` del rail en el repo,
ni un import. Cada consumidor del kit —el CLI (`factory provision`, `factory env push`, el preflight del
launcher), los scripts de `/proposal` y `/publish`, y `/deploy` al observar el deployment de producción—
pide cada token a la bóveda con **tu sesión** (proyecto `rail-timekast`, entorno `main`). El valor vive
sólo en la memoria de ese proceso. Los consumidores en bash (los scripts y `/deploy`) leen con
`scripts/tools/lib/rail.sh`, que exige `bash`: desde zsh o sh se niega a cargarse.

Las coordenadas del rail no salen del mismo lugar para todos: los scripts de bash leen
`.claude/policy/vault.json` del disco; el CLI lleva una **copia embebida** en su paquete y no lee ese
archivo al correr. El rail de un cliente (`rail-<cliente>`) lo toma el CLI del campo **Rail del cliente**
de `project-config.md`.

Un token del rail que aparezca en el entorno de tu terminal (un `export` viejo en `.zshrc`, por ejemplo)
**se ignora**, y el comando avisa nombrando la variable: es una copia que ya nadie rota, y se borra.

Ninguna identidad de máquina lee `rail-timekast`: quien usa un token de administración es una persona con nombre.

Los scripts de bash salen con un código por falla, `40`-`45`, en el orden de esta tabla (encabezado de
`scripts/tools/lib/rail.sh`); quien los llama ramifica por el código, nunca por el mensaje. El tiempo
agotado es sólo del CLI: bash no tiene límite de tiempo, y su `43` es "respuesta no reconocida" o que el
lector se cargó fuera de `bash`.

| Falla | Qué dice | Arreglo |
| --- | --- | --- |
| Sin sesión o sesión caducada | Nombra `infisical login --domain=<dominio>` | Volver a entrar. Si el dominio que nombra **no** es `https://secrets.timekast.com`, no es un problema de sesión: el `vault.json` del repo está editado → "Recuperar `vault.json`" (abajo). Nunca se entra a otra instancia |
| Sesión viva, sin acceso a `rail-timekast` — o el proyecto configurado no existe | Nombra el proyecto y su id | Pedir acceso a un admin. Si el acceso está, según quién lee: **bash** → el `rail.projectId` de `.claude/policy/vault.json` no corresponde: recupera el archivo del kit (fila "Falta o no se puede usar `vault.json`" de esta tabla); si ya coincide con el del kit, el proyecto cambió en la bóveda (avisar al equipo del Factory); **CLI** → si el id del mensaje difiere del de `vault.json`, el CLI está viejo (`npx @timekast/factory@latest …`), y si coinciden, el proyecto cambió en la bóveda (avisar al equipo del Factory); un `rail-<cliente>` → revisar **Rail del cliente** en `project-config.md` |
| El token no existe en la bóveda | Nombra la clave | Un admin la carga |
| Respuesta no reconocida, o la bóveda no respondió a tiempo | Dice que no la reconoce | Reintentar; si persiste, revisar la versión de `infisical` (`brew upgrade infisical`) y la red, y reportarlo al equipo del Factory. **Nunca** se trata como clave ausente ni como falta de acceso |
| `infisical` no está instalado | Nombra `brew install infisical` | Instalarlo y entrar con el `--domain` |
| Falta `.claude/policy/vault.json`, o está ilegible o incompleto | Nombra el archivo | Recuperar el del kit — ver "Recuperar `vault.json`" abajo |

Un token del rail en un archivo de la máquina es la misma copia muerta: se borra.

**Recuperar `vault.json`** — la única sede de este remedio; los mensajes y los workflows remiten aquí.
`factory update` trae un archivo del kit que **falta**, pero **no pisa** uno editado (lo trata como edición
local y lo respeta). Por eso, en un proyecto derivado:

- Falta → `factory update`.
- Editado y **sin commitear** → `git checkout HEAD -- .claude/policy/vault.json`.
- Editado y ya commiteado, o sin trackear → bórralo y corre `factory update`, que lo trae como faltante.

Ojo con las dos rutas que pasan por `factory update`: actualizan el cerebro completo a la versión que
`update` instala, no sólo este archivo, con lo que eso trae (posibles conflictos en otros archivos editados,
avisos de retrofit). En un repo del canal beta se corre con `--beta`: sin ese flag `update` pide salir del
canal, y en headless se niega sin traer nada. Canales y versión → `fx-factory-cli` (§ Canal beta).

En el repo del Factory `vault.json` **es** la fuente: se corrige en el propio archivo (o con
`git checkout HEAD -- …`); `factory update` no aplica ahí.

### El rail en un comando tuyo

Para una llamada directa a la API de un proveedor (las pruebas de §5):

```bash
INFISICAL_DOMAIN=https://secrets.timekast.com infisical run --domain=https://secrets.timekast.com \
  --projectId=32ab3274-c272-4c31-ace4-fc6726f775ba --env=main -- sh -c '<comando que usa "$TOKEN">'
```

`infisical run` inyecta los tokens como variables de entorno de ese proceso, sin tocar disco.

🔴 **El comando va dentro de `sh -c '…'` con comillas SIMPLES.** Escrito suelto
(`-- curl … "$TOKEN"`), la shell externa expande la variable **antes** de que `infisical` la inyecte: el
proveedor recibe un bearer vacío —o una copia vieja exportada en tu terminal— y el `401` resultante se lee
como token muerto. Con comillas simples la expansión la hace el `sh` hijo, que ya tiene el valor. Las
recetas de §5 ya vienen escritas así.

🔴 **`INFISICAL_DOMAIN` va fijado delante de cada `infisical`, además de `--domain`.** Sin sesión,
`infisical` lanza un login automático que **ignora** `--domain` y toma el dominio de un `.infisical.json`
que encuentre subiendo desde la carpeta actual: un repo ajeno puede abrirte así la página de login de otra
instancia. La variable de entorno le gana a ese archivo.

🔴 **El token llega a `curl` por stdin, no en sus argumentos:** `printf "Authorization: Bearer %s\n"
"$TOKEN" | curl -H @- …`. Un `-H "Authorization: Bearer $TOKEN"` deja el valor en la lista de procesos
(`ps`), visible para otros usuarios de la máquina. `printf` es interno de la shell y no aparece ahí.

Para un script que además le hable a la API de la bóveda (crear un proyecto, escribir secretos), el
token de tu sesión va en `INFISICAL_TOKEN`:

```bash
T=$(INFISICAL_DOMAIN=https://secrets.timekast.com infisical user get token --domain=https://secrets.timekast.com --plain </dev/null 2>/dev/null) \
  || { echo "sin sesión: corre infisical login --domain=https://secrets.timekast.com" >&2; exit 1; }
export INFISICAL_TOKEN="$T"; unset T
```

⚠️ Sin `--plain`, `infisical user get token` imprime también el id de sesión. Y el token **es** tu
sesión: no lo pegues en un archivo, un log ni un mensaje.

---

## §4 🔴 Cómo probar un token sin diagnosticarlo muerto en falso

**La prueba de vida "obvia" de cada proveedor asume un token PERSONAL.** Con un token de equipo o de
cuenta, esa misma prueba falla estando el token perfectamente vivo, y se lee como token muerto. Pasa
con Railway y con Cloudflare.

- **Un token muerto falla en CUALQUIER llamada.**
- **Un token vivo mal probado falla SÓLO en el endpoint de identidad** (`me`, `/user/...`) y responde
  bien en todo lo demás.

Antes de concluir nada, separa **autenticación** ("no te reconozco") de **autorización** ("te
reconozco, no puedes"). Son diagnósticos distintos con arreglos distintos. La prueba correcta de cada
token está en §5.

---

## §5 Los tokens del rail — qué alcanza cada uno y cómo se prueba

| Token | Tipo | Lo usa el kit en |
| --- | --- | --- |
| `RAILWAY_TOKEN` | De equipo | Descubrir el destino de cualquier repo (`factory provision --resolve-target`, `/deploy` §1.4, cualquier alta sin `--target`); `factory provision --target=railway` (también `--adopt` y `--destroy`), `factory vault adopt`, `factory vault sync railway`; `/deploy` lo lee para observar el deployment de producción de un repo en Railway. Sin él, un derivado sin `target` guardado sale del descubrimiento con código `12` y no se observa su deploy, aunque viva en Vercel |
| `NEON_API_KEY` + `NEON_ORG` | Personal de una cuenta de servicio | `factory provision` (base de datos) |
| `VERCEL_TOKEN` + `VERCEL_TEAM_ID` | De usuario, acotado al equipo | `factory provision`, `factory env push`; descubrir el destino (`factory provision --resolve-target`, `/deploy` §1.4, cualquier alta sin `--target`); `/deploy` lee `VERCEL_TOKEN` para observar el deployment de producción |
| `CLOUDFLARE_API_TOKEN` | De cuenta | `factory provision --domain` (DNS) |
| `CLOUDFLARE_R2_TOKEN` | De cuenta | — (operación directa: buckets) |
| `PROPOSAL_ASSETS_R2_TOKEN` | De cuenta, acotado a un bucket | `/proposal` (logos) |
| `RESEND_API_KEY` | De equipo | `factory provision` (acuña la key de envío del proyecto) |
| `SHORTIO_API_KEY` | De cuenta | `/proposal`, `/publish` |
| `GAMMA_API_KEY` | Personal (el proveedor no tiene equipos) | `/proposal` (deck) |
| `BACKLOG_ADMIN_TOKEN` | Propio, de la organización | `factory provision --services=backlog` |

### `RAILWAY_TOKEN` — de equipo

Alcanza todos los proyectos de la organización TimeKast en Railway. **No crece** cuando a una persona
la agregan a la organización de un cliente: es de la organización, no de la persona.

También **borra**, como los tokens de Neon, Vercel y Cloudflare en ese mismo comando: `factory provision --destroy` lo usa para quitar
los dominios y el proyecto de Railway, porque Railway no tiene un CLI humano que un agente pueda usar
(ver abajo). Lo que frena el borrado no es el token, que alcanza toda la organización, sino el
`lifecycle` del estado y la confirmación escrita, que se evalúan antes de leerlo. Los syncs de la bóveda
hacia Railway se borran con la sesión de la persona, nunca con este token.

```bash
# ❌ `me` responde "Not Authorized" estando VIVO — sólo existe para tokens personales.
# ✅ Prueba correcta:
INFISICAL_DOMAIN=https://secrets.timekast.com infisical run --domain=https://secrets.timekast.com \
  --projectId=32ab3274-c272-4c31-ace4-fc6726f775ba --env=main -- sh -c '
printf "Authorization: Bearer %s\n" "$RAILWAY_TOKEN" | curl -s -X POST https://backboard.railway.com/graphql/v2 \
  -H @- -H "Content-Type: application/json" \
  -d "{\"query\":\"query { projects { edges { node { id name } } } }\"}"'
```

**El CLI de Railway no sirve para agentes:** aborta pidiendo `railway setup agent`. Usa siempre la API
GraphQL. La infraestructura que un cliente tiene en **su propia** cuenta de Railway usa otro token, que
no es de la organización y no va en este rail (§6).

### `NEON_API_KEY` + `NEON_ORG` — cuenta de servicio

Neon exige una API key **personal** para crear proyectos y acuñar keys project-scoped, así que ésta es
de una **cuenta dedicada** que sólo es miembro de las organizaciones de TimeKast. Por eso no crece.

```bash
INFISICAL_DOMAIN=https://secrets.timekast.com infisical run --domain=https://secrets.timekast.com \
  --projectId=32ab3274-c272-4c31-ace4-fc6726f775ba --env=main -- sh -c '
printf "Authorization: Bearer %s\n" "$NEON_API_KEY" | curl -s -H @- https://console.neon.tech/api/v2/users/me/organizations'
```

`NEON_ORG` es un **nombre**, no un id, y sólo es el default al **crear**. Otra organización se pide con
`factory provision --neon-org "<nombre exacto>"`; un selector que no existe aborta nombrando las
visibles, nunca cae al default. Sobre un proyecto existente (`--adopt`, `--destroy`, `--remint`,
`--resume`) la organización se lee del proyecto mismo.

### `VERCEL_TOKEN` + `VERCEL_TEAM_ID` — de usuario, acotado al equipo

Vercel no tiene tokens de equipo: todo token es de un usuario. Éste se crea con **ámbito = equipo
TimeKast**, así que aunque a su dueño lo agreguen al equipo de un cliente, el token no lo ve. Al
rotarlo, se crea igual: ámbito = equipo, nunca "cuenta completa".

```bash
# Responde scopes: [{type: team}]
INFISICAL_DOMAIN=https://secrets.timekast.com infisical run --domain=https://secrets.timekast.com \
  --projectId=32ab3274-c272-4c31-ace4-fc6726f775ba --env=main -- sh -c '
printf "Authorization: Bearer %s\n" "$VERCEL_TOKEN" | curl -s -H @- https://api.vercel.com/v5/user/tokens/current'
```

### `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_R2_TOKEN` — de cuenta

Los dos son tokens **de cuenta**, no de usuario, y alcanzan sólo la cuenta TimeKast.
`CLOUDFLARE_API_TOKEN` administra el DNS de sus zonas. `CLOUDFLARE_R2_TOKEN` administra **todos** los
buckets de **todos** los clientes, y además puede emitir tokens nuevos de la cuenta (así se crean los
acotados a un bucket); tenerlo es tenerlos todos.

```bash
# ❌ /user/tokens/verify responde "Invalid API Token" estando VIVO (es para tokens de usuario).
# ✅ Prueba correcta — el id de la cuenta sale de la misma respuesta:
INFISICAL_DOMAIN=https://secrets.timekast.com infisical run --domain=https://secrets.timekast.com \
  --projectId=32ab3274-c272-4c31-ace4-fc6726f775ba --env=main -- sh -c '
printf "Authorization: Bearer %s\n" "$CLOUDFLARE_R2_TOKEN" | curl -s -H @- https://api.cloudflare.com/client/v4/accounts
printf "Authorization: Bearer %s\n" "$CLOUDFLARE_R2_TOKEN" | curl -s -H @- \
  "https://api.cloudflare.com/client/v4/accounts/<account_id>/r2/buckets"'
```

⚠️ Borrar un bucket es real y no pregunta: lee el nombre completo antes. Producción y desarrollo de un
cliente difieren en un sufijo.

Un token nuevo se ve **una sola vez**, en la respuesta que lo emite: se guarda directo en la bóveda
desde el mismo proceso, sin imprimirlo.

### `PROPOSAL_ASSETS_R2_TOKEN` — de cuenta, acotado a un bucket

Sólo lee y escribe objetos de `timekast-proposal-assets`, el bucket público de logos de propuestas
(servido en `https://assets.timekast.com`). No crea ni borra buckets. Radio de daño si se filtra: subir
o reemplazar un logo. Lo consume `scripts/tools/proposal-asset-upload.sh`.

```bash
# ✅ Identidad (endpoint de cuenta, no de usuario):
INFISICAL_DOMAIN=https://secrets.timekast.com infisical run --domain=https://secrets.timekast.com \
  --projectId=32ab3274-c272-4c31-ace4-fc6726f775ba --env=main -- sh -c '
printf "Authorization: Bearer %s\n" "$PROPOSAL_ASSETS_R2_TOKEN" | curl -s -H @- \
  "https://api.cloudflare.com/client/v4/accounts/<account_id>/tokens/verify"'
```

⚠️ La API REST de objetos de R2 le responde **403 estando vivo**: exige permisos de cuenta. Un token
acotado a un bucket viaja por la **API S3** (`https://<account_id>.r2.cloudflarestorage.com`), con
access key = id del token y secret = sha256 del valor. Justo después de emitirlo responde 401 unos
segundos: es propagación, no un token muerto.

### `RESEND_API_KEY` — de equipo

Alcanza **todos** los dominios de envío de la cuenta de Resend. Quien lo tiene manda correo desde
cualquiera de ellos. Por eso **no** es la key que llega a un despliegue, ni a un `.env.local`: sólo
acuña una key **propia de cada proyecto**, de sólo envío y limitada a su dominio, que se revoca por su
id sin tocar a los demás. Con bóveda, esa key vive en el proyecto de la bóveda del repo (§7); sin
bóveda, `provision` se la entrega directo a los despliegues y al `.env.local`. En los dos casos su id
queda en el state de provision (detalle del ciclo de la key → `fx-factory-cli`).

```bash
INFISICAL_DOMAIN=https://secrets.timekast.com infisical run --domain=https://secrets.timekast.com \
  --projectId=32ab3274-c272-4c31-ace4-fc6726f775ba --env=main -- sh -c '
printf "Authorization: Bearer %s\n" "$RESEND_API_KEY" | curl -s -H @- https://api.resend.com/domains'
```

### `SHORTIO_API_KEY` — de cuenta

Acorta las URLs de propuestas y mockups. Alcanza todos los dominios cortos de la cuenta. Tiene **la
única copia aceptada de un token del rail**: `develop:/ci` del proyecto del Factory, para el release
del launcher (sólo en el repo del Factory; razón y costo en §2). Al rotarla aquí, esa copia se
actualiza a mano (§9).

### `GAMMA_API_KEY` — personal

Gamma no tiene equipos en su API: la key es de la cuenta de una persona y `/proposal` genera los decks a
su nombre. Es el único token del rail que no es de la organización, por diseño del proveedor.

### `BACKLOG_ADMIN_TOKEN` — propio, de la organización

Da de alta proyectos en el backlog central y acuña su key. **No** es la credencial del día a día: ésa es
project-scoped y vive en el entorno `local` del proyecto del repo en la bóveda (§7; en un repo sin bloque
`vault`, en su `.env.local`) → [`fx-backlog-central`](../fx-backlog-central/SKILL.md).

---

## §6 Los secretos de un proyecto

**Un proyecto de la bóveda = una cosa que se otorga a una persona.** Se da el rail sin dar clientes, o
un cliente sin dar el rail.

| Convención | Regla |
| --- | --- |
| **Nombre** | El **mismo slug** que el proyecto tiene en Neon, Vercel y Railway al **crearlos**. Un slug da todos los nombres y no hay tabla de traducción que se desincronice. Encontrar uno que ya existe no va por el nombre: en Railway (y en Vercel) se busca por el repo que tiene conectado |
| **Rails** | `rail-<ámbito>`: `rail-timekast` para la organización, `rail-<cliente>` para la infraestructura propia de un cliente. Los rails de un proyecto se declaran en su `project-config.md` |
| **Entornos** | Uno **por despliegue**, con el nombre de su rama: `main` (producción) y `develop` (preview). Más `local` para la máquina de quien desarrolla |
| **Nombres de variable** | El nombre real en cada entorno: `DATABASE_URL` vale una cosa en `main` y otra en `develop`. **Nunca** sufijos de entorno (`_MAIN`, `_DEVELOP`): en la bóveda, un sufijo es una migración a medias |
| **Vínculo repo ↔ bóveda** | El bloque `vault` de `.timekast/provision.json` (id del proyecto y sus entornos). Va commiteado: son ids, no secretos |

### El alta la hace `factory provision`

`factory provision` crea el proyecto de la bóveda **antes** que la base, el hosting y el dominio, porque
esos pasos escriben ahí lo que acuñan. `--no-vault` lo omite y el repo trabaja con `.env.local` (§8).

1. Crea el proyecto con el slug y sus entornos `main`, `develop` y `local`, y **protegido contra
   borrado** (_Delete Protection_ de la instancia) en la misma petición que lo crea: un proyecto
   borrado se lleva los secretos de producción de un cliente y todos sus syncs.
2. 🔴 **Agrega a sus miembros en el mismo paso**: quien corre `provision` (por su sesión) y los admins de
   la bóveda. El acceso es por proyecto —ser admin de la organización no da acceso— y un proyecto sin
   miembros queda invisible para todos menos para quien lo creó: _"Unable to access project"_.
3. Crea las carpetas `main:/ci` y `develop:/ci`, y el import de `develop:/ci` en `local` (§7). Un
   proyecto recién creado trae los entornos `dev`, `staging` y `prod` de Infisical: el alta los borra;
   un proyecto adoptado no se poda.
4. Escribe cada valor que acuña en **su** carpeta, bajo su nombre real, con el layout de §7: cadena de
   conexión de cada rama, `AUTH_SECRET`, la llave de MFA, el origen de la app, la key de Neon del
   proyecto, la key de Resend del proyecto, la del backlog central.
5. Guarda el vínculo en `.timekast/provision.json`.

Correrlo otra vez adopta lo que ya existe (proyecto por slug, entornos, carpetas, miembros, import) y
no pisa un valor ya escrito: es la forma de retomar un alta a medias. Si el slug ya lo tiene un
proyecto que tu sesión no ve, se detiene y lo dice: nunca crea otro con un nombre distinto.

**La protección contra borrado también la enciende una re-corrida.** La leen, y la encienden si está
apagada, las corridas de alta o reanudación de `provision` con bóveda fuera de `--dry-run` —incluidos
`--resume` y `--remint`— y todo `factory vault adopt --apply`; si ya estaba, no escriben nada, y lo
dicen. `provision --adopt` y `provision --destroy` **no** la encienden. Un
error de la instancia al encenderla detiene la corrida nombrando el proyecto y la causa. Ningún
comando del kit la apaga en un proyecto `live`: para destruirlo se apaga **a mano** en el dashboard
(`provision --destroy` → [`fx-factory-cli`](../fx-factory-cli/SKILL.md)).

`rail-timekast` no es proyecto de repo y ningún comando del kit lo crea ni lo toca: su protección
contra borrado se enciende **a mano**, en el dashboard.

### Qué NO va en el proyecto de un repo

- Tokens del rail (§2): se leen de `rail-timekast` con la sesión de quien opera.
- Valores de la máquina de alguien que no son de un despliegue: van en su entorno `local`, no en `develop`.

### Un repo con varios despliegues

Cuando un mismo código se despliega N veces (uno por cliente), cada despliegue es **su propio proyecto**
de la bóveda y los valores comunes viven en **un proyecto plantilla**. Lo opera
`factory vault deploys` (flags y errores → [`fx-factory-cli`](../fx-factory-cli/SKILL.md); el paso a
paso → la guía de retrofit, caso 6).

| Proyecto | Nombre | Qué es |
| --- | --- | --- |
| **Principal** | El del bloque `vault` de `.timekast/provision.json` | El del repo: lo leen el wrapper local, `invite-admin` y el backlog central, y de él sale **el único** sync de `/ci` a GitHub |
| **Plantilla** | `<repo>-defaults`, o el que declare el registro (siempre `<repo>-…`) | Los valores comunes, sólo en el entorno `main`. Se crea a mano; el comando la lee y nunca la escribe |
| **Despliegue** | `<repo>-<slug>` | Uno por cliente, con el layout de §7 (`main`, `develop`, `local`, `/ci`), sus miembros y protección contra borrado |

`<repo>` es el slug del principal. Un despliegue nunca puede llamarse como `rail-timekast`, la plantilla
o el principal, y una plantilla que no empieza por `<repo>-` detiene el comando.

**El registro** es `.timekast/deploys.json` y va commiteado: son nombres e ids, **nunca credenciales**.
Se valida campo por campo: un campo que no admite o un archivo ilegible detienen el comando nombrándolo.
Forma completa (todo campo que no aparece aquí se rechaza):

```json
{
  "$comment": "nota libre, opcional",
  "template": { "project": "<repo>-defaults", "projectId": "<id de la plantilla>" },
  "bucketKey": "R2_BUCKET_NAME",
  "deploys": [
    {
      "slug": "cliente-a",
      "name": "Cliente A",
      "domains": { "main": "app.cliente-a.com", "develop": "dev.cliente-a.com" },
      "bucket": { "main": "cliente-a-prod", "develop": "cliente-a-dev" },
      "ownKeys": ["DATABASE_URL", "AUTH_SECRET", "MFA_ENCRYPTION_KEY"],
      "vault": { "projectId": "<id del proyecto de este despliegue>" },
      "vercel": { "projectId": "prj_…", "teamId": "team_…" },
      "railway": {
        "projectId": "<id>",
        "services": [{ "serviceId": "<id>", "env": "main", "railwayEnv": "production" }]
      },
      "neon": { "projectId": "<id>" }
    }
  ]
}
```

- `slug`: `^[a-z0-9][a-z0-9-]*$`. `domains` y `bucket`: por entorno (`main`, `develop`), un host sin
  `https://`. `ownKeys`: los **nombres** de las claves propias del despliegue.
- `vercel.teamId` es opcional (default: `VERCEL_TEAM_ID` del rail). Cada servicio de `railway.services`
  declara `env` (`main` o `develop`, el entorno de la bóveda que sincroniza) y, si en Railway se llama
  distinto, `railwayEnv`.
- `bucketKey` es la variable a la que va el bucket; obligatoria si algún despliegue declara uno. No puede
  ser una clave de valor único ni una que el registro ya deriva (`NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_APP_ENV`, `WEBAUTHN_RP_ID`, `WEBAUTHN_RELATED_ORIGINS`).
- 🔴 **`vault.projectId` y `template.projectId` son la única forma de adoptar un proyecto existente.** Un
  nombre no prueba de quién es un proyecto: uno con el slug esperado puede ser de otro cliente. Si existe
  y su id no está anotado, o el anotado no coincide, el comando se detiene nombrando el proyecto; se
  verifica en el dashboard que es de ese cliente y se anota su id. Un proyecto que el `--apply` **crea**
  anota su id en el registro en ese momento (el archivo queda sin commitear); si no puede anotarlo, el
  error da el id para anotarlo a mano. Uno que aparece con ese slug entre el plan y la creación no se
  adopta: se detiene sin escribir nada en él. La plantilla se crea a mano, así que su id siempre se anota
  a mano.
- **Qué protege el id anotado:** un choque accidental de nombre, con un proyecto que la persona ve y que
  es de otro cliente. **Qué no:** un registro escrito con mala intención — quien puede editarlo ya
  decide los destinos, así que el registro se revisa en su PR.

**Claves de valor único** — la lista que el resto del kit referencia: `DATABASE_URL`, `AUTH_SECRET`,
`NEXTAUTH_SECRET`, `MFA_ENCRYPTION_KEY`, `NEON_API_KEY`, `NEON_PROJECT_ID`, `RESEND_API_KEY`,
`CRON_SECRET`, `VAPID_PRIVATE_KEY`, `BACKLOG_API_KEY`, `BACKLOG_PROJECT_ID`, y todo `*_CLIENT_SECRET` y
`AUTH_*_SECRET`. Nunca van en la plantilla y siempre se comparan entre proyectos.

**Precedencia, por clave y por entorno:**

1. **Propio:** una clave declarada en `ownKeys` con valor guardado no vacío en el despliegue se respeta.
   En `develop`, una clave propia sin valor ahí y sin derivado toma el de `main`, como referencia.
2. **Registro:** `NEXT_PUBLIC_APP_URL` desde el dominio de cada entorno, `WEBAUTHN_RP_ID` desde el de
   producción, `WEBAUTHN_RELATED_ORIGINS` desde el de develop, `NEXT_PUBLIC_APP_ENV` y el bucket.
3. **Plantilla:** todo lo demás. Una clave que **no** está en `ownKeys` se vuelve a sembrar desde la
   plantilla en cada corrida, así que una rotación en la plantilla llega a todos los despliegues.

Un valor vacío (`''`) cuenta como ausente. La bóveda no referencia entre proyectos: `main:/` de cada
despliegue recibe los valores por copia, y `develop:/` referencia a `main` (`${main.KEY}`) lo que vale
igual en los dos. No se borra nada: lo que el despliegue tiene fuera del cálculo se reporta por nombre.
Un `--apply` que **cambia** un valor ya guardado (no una alta) lista esas claves por nombre y entorno y
pide confirmación; sin terminal sólo la da `--yes`.

**Dos escritores, y cómo no se pisan.** La plantilla no tiene sync: un cambio común llega a los
despliegues con otro `--apply`, no solo. Y una clave que **no** es propia, editada a mano en el proyecto
de un despliegue, se revierte al valor de la plantilla en la corrida siguiente (con la confirmación de
arriba): si ese despliegue necesita un valor distinto, se declara en `ownKeys`.

🔴 **Un valor de un despliegue nunca llega a otro.** Antes de la **primera** escritura, crear un proyecto
incluido, el comando calcula todos los despliegues y compara cada valor con cualquier clave de cada
entorno de los demás y del **principal** (todos sus entornos y sus carpetas `/ci`). Una coincidencia
detiene todo, nombrando la clave, el entorno y el dueño (el despliegue, o `principal`), nunca el valor.
No cuentan como coincidencia un valor igual al de la plantilla en esa clave ni uno de menos de 16
caracteres, salvo en las claves de valor único, que siempre se comparan. Los **identificadores del
registro** de los demás (dominios, buckets, ids) se buscan siempre, sin esas excepciones, y por etiqueta
de host: `cdn.app.cliente-b.com` contiene `app.cliente-b.com`, y `cliente-b-prod.<cuenta>.r2…` contiene el
bucket `cliente-b-prod`; `app.cliente-bb.com` no contiene `app.cliente-b.com`. Por eso quien lo corre
necesita acceso a **todos** los proyectos del registro: uno que no se puede leer detiene el comando
nombrando sus dos causas posibles (no existe, o no hay acceso).

**La plantilla no puede llevar** claves de valor único, tokens del rail (§5), nombres con sufijo de
entorno, ni el valor propio de un despliegue: el comando se detiene nombrándolas.

**Syncs.** Cada despliegue con proyecto de Vercel recibe `main:/` → production y `develop:/` → preview
de **su** proyecto; cada servicio de Railway declarado, el de su entorno. Nunca `/ci`. Antes de escribir:

- 🔴 El proyecto de Vercel del despliegue tiene que estar **conectado a este repo** (el del remote
  `origin`). Si está conectado a otro repo, no tiene repo o no está en el team, se detiene nombrando el
  despliegue y el id del proyecto de Vercel; sin `origin` no hay contra qué comprobarlo y también se
  detiene. Un id copiado de otro repo mandaría los valores de este cliente al despliegue de otro código.

- Si **otro** proyecto de la corrida (el principal, la plantilla u otro despliegue) ya sincroniza a ese
  destino, se detiene nombrando el proyecto y el destino: dos escritores se pisan.
- Un sync del propio despliegue hacia ese destino se adopta sólo si coincide su origen (entorno y
  carpeta) y tiene el borrado en destino y el auto-sync encendidos; si no, se detiene nombrando el sync y
  la diferencia. Nunca lo modifica.
- Un sync que falta se compara por nombres con su carpeta: si el destino tiene claves que la bóveda no
  tendrá, se detiene nombrándolas, porque el primer sync las borraría.
- **Excepción, el despliegue vivo:** si el entorno de ese sync todavía no tiene los valores de sus
  claves propias, el sync queda **pendiente** (nombrando las claves que faltan), no se crea y el destino
  no se compara; el proyecto y sus valores comunes sí se escriben. Con los valores propios cargados, la
  corrida siguiente hace la comprobación normal y lo crea.

**Cuándo un aborto no escribe nada.** Todo lo anterior —registro, sesión, ids anotados, plantilla,
valores ajenos, destinos y la confirmación— se resuelve antes de la primera escritura: un aborto ahí
deja la bóveda como estaba. Después el `--apply` escribe en orden (proyectos nuevos, valores, syncs); una
falla en esa fase deja lo ya escrito, lo nombra, y correrlo otra vez lo adopta y completa el resto.

**Sólo con la sesión de una persona.** Antes de leer nada, el comando confirma con la bóveda que hay
una persona detrás del token; sin sesión nombra `infisical login --domain=…` y no intenta otra vía.

---

## §7 Trabajar con un repo que está en la bóveda

### El layout: una carpeta por destino, una copia de cada valor

Un sync copia **una carpeta completa** de un entorno a su destino. Por eso lo que va a cada destino
vive en su propia carpeta:

| Carpeta | Destino | Qué lleva |
| --- | --- | --- |
| `main:/` | Producción: Vercel production, o el entorno `main` de Railway | Lo que varía por entorno + la **única copia** de lo compartido |
| `develop:/` | Preview: Vercel preview, o el entorno `develop` de Railway | Lo que varía por entorno; lo compartido, como **referencia** a `main:/` |
| `develop:/ci` | Secrets de GitHub | Lo que sólo CI necesita: `NEON_API_KEY` del proyecto, `NEON_PROJECT_ID` y `DATABASE_URL` como referencia `${develop.DATABASE_URL}` |
| `main:/ci` | Ninguno (no se sincroniza) | La cadena **directa** de main (`DATABASE_URL`), para herramientas como `db:query:main` |
| `local` | Ninguno (no se sincroniza) | Sólo lo de tu máquina; **importa** `develop:/ci`, referencia el `AUTH_SECRET` de `develop:/` y lo compartido de `main:/` |

**Sólo varía por entorno lo indispensable:** `DATABASE_URL` (pooled en `/` de cada entorno de
despliegue; directa en `main:/ci` y como valor propio de `local`), `AUTH_SECRET`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_ENV` y, cuando existan, buckets y `NODE_ENV`.

🔴 **`AUTH_SECRET` es uno por entorno de despliegue:** `main:/` y `develop:/` tienen cada uno el suyo, y
`local` referencia el de develop (`${develop.AUTH_SECRET}`). Firma las sesiones, no cifra datos
guardados, así que separarlo no rompe copiar datos de producción a develop; compartido, un preview o una
laptop tendrían la llave que firma las sesiones de producción.

**Todo lo demás vive una vez, en `main:/`,** y `develop:/` y `local` lo referencian (`${main.KEY}`):
`MFA_ENCRYPTION_KEY`, el correo y la key de Resend del proyecto, `WEBAUTHN_RP_ID` (el host de
producción) y `WEBAUTHN_RELATED_ORIGINS` (el origen de develop). 🔴 Las llaves de cifrado nunca se
separan por entorno: copiar datos de producción a develop no debe dejarlos ilegibles.

`local` conserva sólo lo de la máquina —`DATABASE_URL` directa de develop, `NEXT_PUBLIC_APP_URL` y
`WEBAUTHN_RP_ID` de localhost—, y un valor propio **gana** sobre el mismo nombre importado (comprobado
en la instancia: el `DATABASE_URL` directo de `local` le gana al que trae el import de `develop:/ci`).

**Conexión a la base.** El runtime usa la cadena **pooled**; las herramientas (migraciones, `db:query`,
`db:seed`, `pnpm dev`), la **directa**. `DATABASE_URL_MAIN` no existe en un repo con bóveda.

**Referencias:** `${KEY}` en la misma carpeta, `${entorno.KEY}` en la raíz de otro entorno,
`${entorno.carpeta.KEY}` dentro de una carpeta. La bóveda las resuelve al leer.

### El guard de escritura, y lo que no cubre

Cada clave **sólo-local** tiene una lista cerrada de carpetas donde puede vivir, y el CLI rechaza la
escritura fuera de ella **antes** de hablarle a la bóveda:

| Clave | Dónde sí |
| --- | --- |
| `NEON_API_KEY`, `NEON_PROJECT_ID` | `develop:/ci` y `local` |
| `BACKLOG_API_KEY`, `BACKLOG_PROJECT_ID` | Sólo `local` |
| `DATABASE_URL_MAIN` | En ningún lado |

La destinación se juzga **por clave**, no por "se sincroniza o no": `develop:/ci` **sí** se sincroniza
(a los secrets de GitHub), y la key de Neon del proyecto puede ir ahí mientras la del backlog no. La
misma regla cubre los imports (el único permitido es `develop:/ci` → `local`) y las referencias: una
referencia a una clave sólo-local sólo se acepta donde podría escribirse la clave misma —un sync
resuelve la referencia y manda el valor—, y una referencia a una clave que todavía no existe se
rechaza siempre. Entorno y ruta se comparan normalizados: `/CI`, `//` o `MAIN` no lo evaden.

🔴 **El guard protege lo que escribe el CLI, nada más.** Lo que escribes desde el dashboard de la bóveda
o con `infisical secrets set` no pasa por él: ahí, la carpeta correcta depende de ti.

### En local

El trabajo diario —el wrapper `scripts/tools/with-vault.mjs`, `TK_ENV_OVERRIDE`, ver las claves del
entorno, qué significa cada aviso y por qué un `.env.local` estorba— vive en
[`sk-vault §3-§4`](../sk-vault/SKILL.md). Aquí queda lo que solo importa a quien administra:

- **Producción:** `pnpm db:query:main` lee `DATABASE_URL` del entorno `main`. `main` sólo se acepta para
  `db:query:main` (con `--vault-env=main` en su valor); otro script que lo pida se rechaza antes de tocar
  la bóveda. Para `main` el wrapper junta `main:/` y `main:/ci`, y gana la cadena directa de `/ci`.
- **Llamadas anidadas:** el wrapper marca a su hijo con `TK_VAULT_INJECTED=<entorno>`, así que el
  `pnpm db:migrate` que el runner de E2E lanza contra su branch efímera no se pisa. `db:query:main` exige
  esa marca en `main`; sin ella no conecta, en vez de consultar develop creyendo que es producción.
- `scripts/tools/invite-admin.ts` no carga `.env.local` en un repo con bóveda: recibe el entorno del
  destino que le inyecta `factory invite-admin`.
- La adopción retira el `.env.local` de un repo (§8) porque Next.js lo cargaría aunque el wrapper no lo lea.

### Deploys y CI

La bóveda **sincroniza** cada carpeta a su destino, según la tabla del layout: `main:/` → producción,
`develop:/` → preview, `develop:/ci` → secrets de GitHub; `main:/ci` y `local` no salen. Un valor se
cambia **en la bóveda** y llega solo.

Con destino Railway, cada entorno va a su igual: `factory provision --target=railway` crea el sync de
`main:/` al entorno `main` y el de `develop:/` al entorno `develop` (la misma primitiva que
`factory vault sync railway`, la vía de un repo que ya vivía en Railway), y escribe en `main:/` —con
referencia desde `develop:/`— `PORT` y `AUTH_TRUST_HOST`, que Railway necesita y Vercel no. Railway exige
bóveda: sin ella no hay quién le lleve las variables.

Lo que hace un sync, comprobado en la instancia con un destino GitHub:

- Lee **sólo** su carpeta: el sync de `develop:/` no lleva lo de `develop:/ci`.
- Entrega las referencias **resueltas**, también a GitHub y también entre entornos: el secret recibe el
  valor, nunca el literal `${…}`.
- Sigue a las referencias: cambiar el valor referenciado vuelve a correr, en segundos, el sync de la
  carpeta que lo referencia, aunque esa carpeta no haya cambiado.

**Borrado:** todo sync que crea el kit borra en el destino lo que se borra en la bóveda, sin
excepciones —el del repo del Factory también—, y `provision` no adopta un sync existente que tenga el
borrado apagado.

🔴 **Un solo escritor por destino.** En un repo con bóveda, la bóveda y su sync son los únicos que
escriben en Vercel, en Railway y en los secrets de GitHub: dos escritores se pisan y el destino queda con el valor de
quien escribió al último. Por eso `env:push` no escribe en esos destinos, y `provision --remint` deja la
key nueva en `develop:/ci` y el sync la lleva a GitHub. Sin bóveda, `--remint` sube los secrets con
`gh secret set` y `env:push` sube a Vercel.

---

## §8 Repos que nacieron antes de la bóveda

Un repo sin bloque `vault` trabaja con `.env.local` y `env:push`, como siempre. Pasarlo a la bóveda es
decisión de su equipo y la hace `factory vault adopt`: sin `--apply` sólo enseña el plan, y
`--decline` registra que el repo **no** entra.

Esta sección fija las **invariantes** de la adopción: lo que ninguna corrida puede violar, sea cual sea
el caso. El **orden** del `--apply`, los criterios operativos (dónde busca cada deploy, qué cuenta como
deploy vacío, cómo resuelve los hosts, cómo prueba una key), los flags y los códigos de salida viven en
[`fx-factory-cli` § `factory vault`](../fx-factory-cli/SKILL.md); el paso a paso por caso, en la guía de
retrofit `.claude/docs/retrofits/secrets-vault-adoption.md`.

1. 🔴 **`main` y `develop` se importan del deploy, nunca de `.env.local`**, que apunta a develop y puede
   estar viejo; `local` sale de `.env.local`. Cada diferencia la confirma quien corre la adopción. La
   única excepción es el **deploy conectado y vacío** (Vercel responde con su lista de variables y está
   vacía, y Railway se consultó y no tiene proyecto): ahí los valores por entorno se generan o derivan
   como en un deploy nuevo, y de `.env.local` sale sólo lo compartido, confirmado clave por clave. Una
   respuesta que no se pudo leer nunca cuenta como vacía.
2. 🔴 **Los tokens del rail nunca se importan** (§5: `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `CLOUDFLARE_*`,
   `RAILWAY_TOKEN`, `SHORTIO_API_KEY`, `GAMMA_*`, `BACKLOG_ADMIN_TOKEN`, `PROPOSAL_ASSETS_R2_TOKEN`,
   `NEON_ORG`), aparezcan en `.env.local` o en un deploy y con la huella que tengan: una copia vieja o
   rotada tampoco es del proyecto. `NEON_ORGANIZATION_ID` no tiene lector y sale como retirada. Una
   `NEON_API_KEY` se importa sólo si se **prueba** acotada al proyecto; una que no se pudo probar nunca se
   importa, y en su lugar se acuña una del proyecto. La copia de `SHORTIO_API_KEY` en el CI del propio
   Factory no es una importación: es la única copia aceptada de un token del rail (§2).
3. 🔴 **Primer sync = importar primero.** Todo lo que un destino tiene se escribe en la bóveda **antes**
   de crear su sync: un sync borra en su destino lo que su carpeta no tiene, y sobre un deploy vivo eso
   sería borrar producción.
4. 🔴 **Una llave sellada nunca se regenera.** Las variables `sensitive` de Vercel no se leen ni por API
   ni en el dashboard, así que cada una se clasifica:
   - **derivable** → se recalcula del proveedor (la cadena de conexión desde Neon; el origen y el rpID
     desde los dominios del proyecto);
   - **rotable** → se genera un valor nuevo aceptando su efecto (`AUTH_SECRET` cierra las sesiones;
     OAuth y API keys se reemiten en la consola del proveedor);
   - **sellada** → cifra datos guardados (`MFA_ENCRYPTION_KEY` o cualquier llave de cifrado del
     derivado): una llave nueva deja ilegible lo guardado, **para siempre**. Se recupera con un **deploy
     puente** —un build único que lee la variable y la escribe directo a la bóveda, sin imprimirla— que
     una persona **autoriza y supervisa** paso a paso. Nunca se genera una nueva para "destrabar" la
     adopción.

   Una `sensitive` que el kit no conoce es **sellada** mientras nadie confirme explícitamente que no
   cifra datos guardados.
5. **Nada se escribe sin mostrarse.** El cambio a los scripts de `package.json` se imprime antes de
   escribirlo; lo que pide confirmación, sin terminal no se confirma; y `.env.local` se retira al final
   (Next.js lo carga, §7), nunca antes de que el resto quede escrito.
6. **El drift que se reporta después es sólo contra Vercel.** `doctor` y `status` comparan la bóveda con
   production y preview por huella; Railway sale "no verificado".

Un repo con varios despliegues sigue el patrón de §6: `vault adopt` no elige uno de varios proyectos
de Vercel conectados y se detiene nombrándolos; `--vercel-project <id>` elige el que queda como
principal, y los demás despliegues se operan con `factory vault deploys`.

---

## §9 Higiene

```
🔴 Los valores NUNCA se imprimen ni se copian a un archivo del repo — en el historial de git son permanentes
🔴 Los tokens salen de cuentas de servicio o de organización, nunca de la cuenta personal de alguien:
   un token personal hereda todo lo que su dueño alcanza y CRECE SOLO. El día que a esa persona la
   agregan a la organización de un cliente, el rail le daría ese cliente al equipo entero
✅ Rotar: el valor nuevo entra a `rail-timekast` con el MISMO nombre; nadie cambia scripts
✅ Rotar `SHORTIO_API_KEY`: además, actualiza a mano la única copia aceptada de un token del rail
   (§2) — `develop:/ci` del proyecto del Factory, sin imprimir el valor; su sync la lleva al secret
   del repo. Mientras no se copie, el release del launcher usa la key vieja
✅ Dar acceso al rail es dar TODOS sus tokens, y la edición gratuita no tiene audit log: después no se
   puede contestar "quién leyó qué". Se da a quien aprovisiona o despliega
✅ Un `infisical run` tuyo que entrega un token vacío: primero la sesión (caduca), después el acceso al
   proyecto. Desde tu comando las dos fallas se ven igual y tienen arreglos distintos; los lectores del
   kit ya las separan y nombran cuál es (§3)
```

---

## §10 Boundary

| Si vas a… | Usa en su lugar… |
| --- | --- |
| Entrar a la bóveda por primera vez o trabajar en local en un repo con bóveda | [`sk-vault`](../sk-vault/SKILL.md) |
| Flags y troubleshooting de `factory provision`, `factory vault adopt`, `factory vault deploys`, `factory env push` | [`fx-factory-cli`](../fx-factory-cli/SKILL.md) |
| Aprovisionar la infraestructura de un derivado de punta a punta | `/provision` ([`tk-provision`](../tk-provision/SKILL.md)) |
| Entender la sincronización con el backlog central | [`fx-backlog-central`](../fx-backlog-central/SKILL.md) |
| Subir variables del producto a Vercel en un repo sin bóveda | `SK.md §7.2` (`pnpm env:push`) |

---

_TimeKast Factory — fx-secrets-vault (bóveda de secretos + rail de la organización, factory-internal)_
