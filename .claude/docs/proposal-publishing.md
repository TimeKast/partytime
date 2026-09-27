# Publicación de propuestas y mockups (`proposals.timekast.mx`)

> Sube los entregables client-facing de `/proposal` y `/mockup` a una URL propia
> bajo `proposals.timekast.mx`, en vez de mandar un zip+html. Lo hace el CLI
> `@timekast/factory` (`publish` / `unpublish`); el hub es un sitio estático en Vercel.

---

## 1. Modelo de seguridad — honesto

**v1 = solo "link no-adivinable + `noindex`".** El path de una propuesta es
`{repo}-{token}`: el **nombre del repo** (único en la org) da identidad/propiedad,
y el **token** (16 chars, `crypto.randomBytes`) hace el link no-adivinable. **No es
control de acceso fuerte** — equivale a un Google Doc con link-sharing.

> ⚠️ **Agujero conocido (unfurl):** cuando el cliente reenvía el link por
> WhatsApp/Slack/Gmail, esos servicios fetchean la URL para el preview y pueden
> **descargar el contenido antes** de que `noindex` aplique. Una propuesta con
> pricing reenviada por chat puede quedar en cachés de terceros. Para v1 se acepta;
> **no publiques datos muy sensibles** hasta que exista el escalón de password.

**`unpublish` es contención, no recall:** baja el contenido del hub (corta el acceso
futuro vía la URL), pero **no recupera** lo que un unfurler ya descargó. Mata el link,
no deshace la fuga.

> Desde 2026-09 `/proposal` **sí puede llevar montos** en el Apéndice D (confirmados en
> su CP1; nunca el desglose interno del estimate). Si una propuesta trae precios, trátala
> como dato comercial sensible bajo el agujero de unfurl de arriba.

---

## 2. Arquitectura del hub

**Repo `TimeKast/proposals`** = sitio estático en Vercel, dominio `proposals.timekast.mx`.
Sin compute (sin middleware, sin DB):

```
proposals/
├── vercel.json               # X-Robots-Tag: noindex,nofollow en /(.*) + trailingSlash
├── robots.txt                # Disallow: /
├── index.html                # placeholder noindex
├── favicon.ico               # logo TimeKast — servido desde el root (cubre TODA página)
├── favicon.png / apple-touch-icon.png
├── og-image.png              # 1200×630, preview de chat (Open Graph)
└── {repo}-{token}/
    ├── proposal/{index.html, assets/}
    └── mockup/{index.html, assets/, …}
```

`trailingSlash` es obligatorio: las propuestas referencian sus assets de forma
relativa (`assets/…`), así que la URL canónica termina en `/`.

**Branding del link (favicon + preview):**

- **Favicon:** vive en el **root del hub** (`/favicon.ico`). El navegador lo busca
  ahí por default, así que aparece en la pestaña de **cualquier** página
  `proposals.timekast.mx/...` sin tocar el entregable. Los templates además emiten
  `<link rel="icon" href="/favicon.ico">` explícito.
- **Open Graph (preview de chat):** los templates emiten `og:title`/`og:description`
  **genéricos** ("Propuesta — TimeKast") + `og:image` → `og-image.png`. Genéricos
  **a propósito**: el unfurl muestra la marca TimeKast, nunca el contenido sensible
  de la propuesta. `og:image` es URL absoluta al hub (los unfurlers la requieren).

---

## 3. Setup one-time (manual — quien administra el hub)

1. Crear el repo `TimeKast/proposals` (privado) con el contenido semilla
   (`vercel.json`, `robots.txt`, `index.html`). Quien publique necesita push access
   (team de la org).
2. Conectar el repo a Vercel **por dashboard** (preset "Other", output root) —
   **nunca** `vercel` CLI en derivados (`SK.md §7`).
3. Agregar el dominio `proposals.timekast.mx` (CNAME → `cname.vercel-dns.com`).
4. Verificar: `curl -I https://proposals.timekast.mx/` → 200 + `x-robots-tag: noindex`.

De ahí en adelante, cada `factory publish` solo pushea y Vercel redeploya.

---

## 4. Comandos

```bash
# Publicar mockup (arg obligatorio — no se publica "lo que haya"):
npx @timekast/factory publish mockup
npx @timekast/factory publish mockup --opaque-url     # path solo-token (oculta el repo)

# Bajar del hub:
npx @timekast/factory unpublish mockup
```

- **Atajos** (proyectos Node): `pnpm factory:publish` / `pnpm factory:unpublish`
  (alias de `npx @timekast/factory …`, inyectados por el instalador).
- **`/publish`** (slash command): detecta el entregable, confirma y corre el CLI.
- **Workflows:** `/mockup` ofrece publicar en su Phase 4 (CP) y commitea el entregable
  al cerrar. El wrapper llama `npx @timekast/factory publish` **directo**, nunca el
  script `factory:publish`.

> ### ⚠️ `proposal` ya no es una ruta de publicación viva — solo-mockup
>
> **`/publish proposal` quedó sin entregable.** `/proposal` ya no emite un one-pager
> HTML: entrega vía Gamma (Markdown → Gamma deck). No hay artefacto HTML de propuesta
> que subir a este hub. La única ruta viva de `/publish` y `factory publish` es
> **`mockup`**.
>
> **`factory publish proposal` queda TEMPORALMENTE ROTA — defer consciente, no bug
> silencioso.** El CLI resuelve la entrada HTML de un deliverable con `findHtmlEntry`
> (`cli/src/lib/publish-core.ts`): para `proposal` busca un archivo que matchee el regex
> `/-proposal\.html$/` dentro de `project/presentation/`. PROP-002 eliminó la generación
> de ese one-pager (`presentation.template.html` borrado, `/proposal` ya no escribe
> `project/presentation/`), así que el directorio ya no existe y `findHtmlEntry` no
> encuentra nada → la ruta `proposal` del CLI falla.
>
> **Tarea futura de reparación del CLI (fuera de este epic):** decidir el destino de la
> ruta `proposal` en `findHtmlEntry` / `publish-core.ts` / `commands/publish.ts` — sea
> retirarla por completo (junto con su `DELIVERABLE_DIR['proposal']` y el branch
> `/-proposal\.html$/`), sea reapuntarla al nuevo flujo de entrega Gamma si en el futuro
> se publica un export de Gamma. No requiere investigación adicional: el punto de fractura
> es el regex `/-proposal\.html$/` contra un `project/presentation/` que ya no se genera.

---

## 5. Identidad, URL y estado

- **`{repo}`** sale del git remote (`origin` → `owner/repo` → repo name). Sin remote,
  fallback al nombre del directorio (con warning). Único en la org → un match
  `{repo}-*` en el hub **es tuyo** (sin manifest ni origin-check).
- **`{token}`** se genera en el primer publish y es **sticky**: re-publicar reusa la
  misma URL (el link del cliente sigue vivo); el contenido se reemplaza (sin huérfanos).
- **`urlShape`** (`named` | `opaque`) también es sticky. `--opaque-url` (`p-{token}`,
  sin repo) aplica **solo al primer publish**; cambiarla rompería el link → requiere
  `--change-url` explícito (deja la ruta vieja huérfana, candidata a `unpublish`).
- **Estado** en `project/.publish.json` (trackeado, sin secretos): `{ repo, token, urlShape, urls, publishedAt }`.

---

## 6. Auth (dual)

- **Dev local:** reusa la sesión `gh` (preflight: `gh` instalado + autenticado +
  miembro de la org) → `gh auth token` para el push. **Cero credencial en derivados.**
- **Headless (sin TTY):** `TIMEKAST_PUBLISH_TOKEN` en el entorno del proceso
  (infra TimeKast, **no** derivados). No viola `SK.md §7`.

El CLI nunca se instala global ni como dependencia — siempre `npx @timekast/factory`.

---

## 7. Ruta de evolución (escalones futuros)

- **Password por-propuesta:** el contenido pasaría de carpetas estáticas a `content/`
  servido por un **route handler Node** (gate fail-closed + cookie atada al token +
  scrypt; hash fuera del repo). Cierra el agujero de unfurl en modo protegido.
- **Expiración (30d):** middleware ligero de fecha → 410, o cron de borrado, + banner
  "válida por N días" en los templates **junto con** el enforcement.

---

_TimeKast Factory — proposal publishing (v1 estático)_
