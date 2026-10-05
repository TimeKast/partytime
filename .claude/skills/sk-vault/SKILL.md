---
name: sk-vault
description: Kit-shipped secrets wiring for developers working in a repo backed by the org vault (self-hosted Infisical) — first login on a machine, how `pnpm dev`/`build`/`db:*`/`test:e2e` get their environment through the `with-vault` wrapper with no `.env.local`, per-run overrides, and what each wrapper error means. Invoke when setting up a machine, when a script says there is no vault session or no access, or when asking where env vars come from. Org admin tokens, project setup and syncs → `fx-secrets-vault`.
last-verified: 2026-10-01
user-invocable: false
---

# sk-vault — Trabajar en un repo que lee sus secretos de la bóveda

> Stack: Next.js + scripts del kit sobre Infisical self-hosted.
> **Kit-shipped — no portable.** Grounded in: `scripts/tools/with-vault.mjs`, `.claude/policy/vault.json`, el bloque `vault` de `.timekast/provision.json`, los scripts de `package.json`.
>
> Related: la administración de la bóveda (tokens de la organización, alta de proyectos, syncs a los deploys, adopción de repos viejos) vive en `fx-secrets-vault`, que no viaja a todos los repos. Esta skill cubre solo lo que necesita quien **trabaja** en el código.
>
> 🔴 **Los valores no se imprimen nunca** — ni completos, ni en un log, ni en un mensaje, ni en un archivo del repo. Lo que se reporta es el **nombre** de la variable.

---

## 1. ¿Mi repo usa la bóveda?

| Señal | Qué significa |
| --- | --- |
| `.timekast/provision.json` tiene un bloque `vault` | Los secretos vienen de la bóveda. **No hay `.env.local`** y no se crea uno |
| No hay bloque `vault` | El repo trabaja con `.env.local`, como cualquier Next.js. Esta skill no aplica |

En un repo con bóveda, la credencial es **tu sesión personal** (`infisical login`). Nadie comparte archivos de secretos ni tokens de máquina.

---

## 2. Primera vez en una máquina

1. Acepta la invitación a la organización `TimeKast` en la bóveda que te llega por correo y crea tu cuenta desde ese enlace.
2. Instala el CLI y entra **con el dominio**:

```bash
brew install infisical
infisical login --domain=https://secrets.timekast.com
```

🔴 **El `--domain` no es opcional.** Sin él, el CLI apunta a la nube de pago de Infisical (`app.infisical.com`) y el login **crea una cuenta ahí**, que no es la nuestra. Los síntomas después confunden: "run infisical init", `connection refused`, o proyectos que "no existen". El CLI recuerda el dominio del último login; si alguna vez entraste a otro lado, vuelve a entrar con el `--domain`. El dominio correcto vive en `.claude/policy/vault.json`.

3. Pide a quien administra el proyecto **acceso al proyecto de la bóveda de este repo**. El acceso es por proyecto: estar en la organización no da acceso a ninguno. Para trabajar en local basta el entorno `local`.

Para comprobar que tu sesión está viva, se lee el **código de salida**, nunca la salida:

```bash
INFISICAL_DOMAIN=https://secrets.timekast.com infisical user get token --domain=https://secrets.timekast.com --plain </dev/null >/dev/null 2>&1
echo $?   # 0 → sesión viva · distinto de 0 → sin sesión
```

La sesión caduca. Cuando un script dice que no hay sesión, es `infisical login` otra vez, no un secreto roto.

---

## 3. El día a día: el wrapper `with-vault`

Los scripts de `package.json` que necesitan secretos (`dev`, `build`, `start`, `test:e2e`, `db:*` y otros) pasan por `scripts/tools/with-vault.mjs`. El wrapper:

- Lee el vínculo de `.timekast/provision.json` y pide el entorno a la bóveda **con tu sesión**, en memoria. Nada va a disco ni a la salida.
- Usa el entorno **`local`** por default. Algunos scripts declaran otro en su propio valor (`--vault-env=…`), y ese gana sobre `TK_VAULT_ENV`.
- Lee valores frescos en cada corrida: si alguien cambia un valor en la bóveda, aplica en tu siguiente comando, sin pasos.
- **Pasa de largo** —corre el comando tal cual— en Vercel, en CI o en Railway, con `TK_VAULT=off`, en un repo sin bloque `vault`, y cuando ya lo llamó otro wrapper (llamada anidada).

| Para | Cómo |
| --- | --- |
| Levantar el proyecto | `pnpm dev` — nada más |
| Pisar valores **en una sola corrida** | `TK_ENV_OVERRIDE=<archivo> pnpm dev` — las claves de ese archivo ganan sólo en esa corrida, y el wrapper imprime los **nombres** que pisó o agregó. El archivo **no** se commitea |
| Correr un comando sin bóveda | `TK_VAULT=off pnpm <script>` — toma solo lo que tenga tu terminal |
| Ver qué claves tiene tu entorno | `INFISICAL_DOMAIN=https://secrets.timekast.com infisical secrets --domain=https://secrets.timekast.com --projectId=<id del bloque vault> --env=local` — **muestra valores**: no lo corras donde quede registro (grabaciones, logs, chats) |

🔴 **Un `.env.local` en un repo con bóveda estorba.** El wrapper no lo lee, pero Next.js sí lo carga, y sus claves sueltas se cuelan sobre las de la bóveda. El wrapper avisa cuando encuentra uno: bórralo.

---

## 4. Qué significa cada aviso del wrapper

| El wrapper dice | Causa | Arreglo |
| --- | --- | --- |
| "`infisical` no está instalado" | Falta el CLI | `brew install infisical` y luego el login de §2 |
| "no hay sesión de la bóveda (o caducó)" | Sin login, o la sesión venció | `infisical login --domain=https://secrets.timekast.com` y vuelve a correr |
| "no pude leer `<entorno>:<carpeta>` del proyecto `<id>`" | Con la sesión viva, casi siempre es **falta de acceso** a ese proyecto o entorno | Pide acceso a quien administra el proyecto. Si un script pide un entorno que no es `local` (p. ej. `setup:e2e`), ese entorno no es para trabajo diario: pregunta antes de pedir acceso |
| "la bóveda no respondió a tiempo" | Red o versión del CLI | Reintenta; si persiste, `brew upgrade infisical` y revisa la red |
| "falta `.claude/policy/vault.json`, o está ilegible o incompleto" | El archivo se borró o se editó | Recupéralo del repo: `git checkout origin/<branch de trabajo> -- .claude/policy/vault.json`. No lo edites: el dominio que trae es el único válido |
| "`TK_ENV_OVERRIDE` apunta a … y no pude leer ese archivo" | Ruta mal escrita | Corrige la ruta, o quita la variable para usar solo la bóveda |
| "hay un `.env.local` en este repo" | Ver §3 | Bórralo |

---

## 5. Variables nuevas y deploys: un solo escritor

- Los valores de los deploys (producción, preview) y los secrets de GitHub los **escribe la bóveda** con sus syncs. Un valor puesto a mano en Vercel, en Railway o con `gh secret set` lo pisa o lo borra el siguiente sync.
- **¿Necesitas una variable nueva o un valor distinto?** Pídeselo a quien administra el proyecto de la bóveda. Lo agrega en el entorno que corresponde y llega solo a tu siguiente comando y a los deploys.
- Para probar algo en tu máquina sin tocar la bóveda, usa `TK_ENV_OVERRIDE` (§3).

---

## 6. Anti-patterns

| ❌ | ✅ |
| --- | --- |
| Crear un `.env.local` "para que funcione" | `infisical login` + `pnpm dev`; para una prueba puntual, `TK_ENV_OVERRIDE` |
| `infisical login` sin `--domain` | Siempre `--domain=https://secrets.timekast.com` |
| Pegar un valor en un mensaje, un issue, un commit o un log | Nombrar la variable, nunca su valor |
| Poner una variable a mano en Vercel o en GitHub | Pedirla a quien administra la bóveda |
| Exportar secretos en `.zshrc` para "no depender de la sesión" | La sesión es la credencial; si caduca, se vuelve a entrar |
| Editar `.claude/policy/vault.json` | Recuperarlo del repo tal cual (§4) |

---

## 7. Checklist

- [ ] `infisical` instalado y login hecho **con** `--domain`
- [ ] Acceso al proyecto de este repo, entorno `local`
- [ ] Sin `.env.local` en el repo
- [ ] `pnpm dev` levanta sin avisos del wrapper
- [ ] Ningún valor de secreto copiado a un archivo, mensaje o log

---

_Cross-reference: [`sk-e2e`](../sk-e2e/SKILL.md) — cómo corre `test:e2e` sobre el wrapper. La administración de la bóveda (tokens de la organización, alta de proyectos, syncs, adopción) vive en `fx-secrets-vault`, para quien administra._
