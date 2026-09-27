# tier-strategy — estrategia de render por tier

> El **tier es SSOT de `tk-design`**. Fuente autoritativa = el **frontmatter `tier:` de cada `SCR-*.md`**;
> el `16_DESIGN §8 Kit-bindings` lista las `kit-pure`. (El `§3 Screen Map` trae columna `tier` solo en
> algunos outputs de `/design` — no depender de ella.) `tk-mockup` lo **consume**, no lo recalcula (SSOT §4).

> **Modelo B' (ver render-contract.md):** todo se emite como **fragmento** — pantallas `(protected)`
> como body (`mck-screen`), pantallas `(public)`/auth como full-screen (`mck-auth-screen`). El shell
> (sidebar+header+bottomnav) lo arma el orchestrator una sola vez desde la nav real, no cada pantalla.

| Tier | Quién | Estrategia (emite fragmento) |
| --- | --- | --- |
| `kit-pure` | **Orchestrator** (sin agente) | Toma el body de la preconstruida del catálogo `fx-presentation-kit/screens/{slug}.html`. Auth (login/forgot/reset/accept-invite/error) → fragmento `mck-auth-screen` (el `pk-auth`). Protected (notification-settings / notifications) → fragmento `mck-screen` (su `pk-body`). Brand vacío var-driven. Mapeo de slug si difiere (recuperar→forgot, etc.). |
| `kit-extended` | **Orchestrator** (sin agente) | Body fragment: primitiva base del catálogo + deltas del SCR light (`§3 Customizations`). Inline, sin spawn. |
| `custom` | **`mck-screen-renderer`** (batched, `sonnet` — excepción declarada en `SKILL.md §14`) | Body fragment compuesto con `render-contract.md`: `§5` binding + `§3` ASCII (layout ref) + `§11` copy + `§9` states (toggle por pantalla). CMP custom → lee `CMP-*.md`. |

## Mapping kit-pure → catálogo

El `slug` del SCR (frontmatter) mapea al archivo de `fx-presentation-kit/screens/`. Si el slug del SCR
no coincide exactamente con un screen del catálogo pero es semánticamente el mismo (ej. `iniciar-sesion`
↔ `login`), `mck-context-analyst` declara el mapeo en el render-plan. Si **no hay** screen kit-pure
equivalente en el catálogo para un SCR clasificado `kit-pure` → se trata como `kit-extended` (base + el
SCR como delta) y se anota como candidato a agregar al catálogo (factory-ticket).

> **Notificaciones — dos superficies con entry points distintos, no confundir.** `sk-notifications`
> shippea dos cosas separadas, y el catálogo trae una pantalla para cada una:
>
> - **Campanita (header) → feed/panel** = `notifications.html` (lista de avisos recibidos + "marcar todas
>   como leídas" + link a preferencias). La campanita es su **único entry point**.
> - **Preferencias de notificación** (matriz categoría × canal in-app/push/email + "Mis dispositivos") =
>   `notification-settings.html`. Es un **tab del usuario** (entra desde perfil/cuenta o desde el link del
>   panel) — **NO** desde la campanita.
>
> Wiring del shell (Phase 3): el `{{HEADER_ACTIONS}}` de la campanita apunta SIEMPRE al **feed**
> (`notifications.html`), nunca a las preferencias. Si la nav del `/design` (§2.4) cablea la campanita a una
> ruta de "ajustes/preferencias", es un bug de IA — la campanita va al feed; las preferencias son un tab del
> usuario. Cada superficie es su propia pantalla/fragmento en el mockup.

## Batching (custom)

- `batch_size: 4` default (frontmatter `batch_size_default`). Cap concurrente: 6 (CC native).
- **Tier wins, cohesión best-effort dentro del tier.** No mezclar tiers en un batch.
- Para N pantallas custom: `ceil(N / batch_size)` batches por mensaje (cap 6 paralelos).
- Per-target atomicity: cada pantalla se escribe independiente; si una falla, las otras se escriben +
  re-spawn de la fallida (máx 2 intentos), espejo de `dsg-screen-specer-full`.
