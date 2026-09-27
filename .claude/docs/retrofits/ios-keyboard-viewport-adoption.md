# Migration brief — que tu shell sobreviva al teclado de iOS

> **Retrofit shipped** (`.claude/docs/retrofits/`) — aplica a **todo derivado que nació antes de que el kit siguiera la parte visible de la página**. El síntoma que lo delata: en iPhone, abrir el teclado descuadra el header, el bottom nav o cualquier cosa pegada a un borde. Si tu `src/app/globals.css` ya declara `--viewport-offset-top`, **no te aplica**.
>
> **Audience:** el equipo (o el agente) de una app TimeKast derivada del Factory. No hace falta haber leído el ticket de origen — esta guía se basta sola.
>
> **Date:** 2026-09-11
> **Origin:** dos factory-tickets que apuntaban al mismo hueco — `sk-bug 2026-09-09` (agent-portal, cinco piezas medidas en un iPhone) y `FACTORY-015` (mvpicks-v2, cuatro causas del mismo síntoma). Contrato vivo: [`sk-pwa §0` y `§6b`](../../skills/sk-pwa/SKILL.md) + [`sk-navigation §7`](../../skills/sk-navigation/SKILL.md).
>
> **Costo de aplicarlo:** ~30 minutos de edición + una ronda de validación en un iPhone de verdad. Cuatro pasos, todos en tu `src/`.
> **Disponible desde:** kit `v12.1.0`

---

## 1. Qué pasa, y por qué `factory update` no te lo trajo

Tu `src/` **nació congelado** (`BR-FACTORY-006`): `factory update` refresca el cerebro (`.claude/**`) y el tooling (`scripts/**`), y **nunca** toca el código de tu app. Así que después de actualizar tienes las skills que describen el patrón, y **ninguna** de las piezas de código. Este documento las lista.

**Nada explotó mientras tanto** porque el defecto sólo se manifiesta en iOS con el teclado abierto — en un escritorio, en Android y en los tests, todo se ve bien.

---

## 2. El modelo mental, en un párrafo

En iOS Safari, **el teclado no encoge la página**. Existe una línea de CSS que haría eso (`interactive-widget=resizes-content`) y **WebKit no la implementa** ([bug 259770](https://bugs.webkit.org/show_bug.cgi?id=259770), abierto; Chrome 108+ y Firefox 132+ sí). Lo que hace iOS es **deslizar hacia arriba la parte visible** de una página que sigue midiendo lo mismo. Consecuencias directas:

```
· un `fixed top-0`  → se va FUERA de la pantalla
· un `fixed bottom-0` → queda DETRÁS del teclado (el layout viewport no se movió)
· `env(safe-area-inset-bottom)` → SIGUE valiendo 34px en la app instalada: el inset es de
  la VENTANA, no de lo visible, así que acolchas para un home indicator que ya no está ahí
· `innerHeight` → NO es estable con el teclado abierto (641 → 421 → 330 en tres capturas
  del MISMO teclado), así que todo lo derivado de él es inservible
```

🔴 **Y hay un cuarto invariante que cuesta caro aprender solo: nunca calibres un umbral de "teclado abierto".** Su altura cambia por modelo **y por teclado** (emoji, barra predictiva, teclados de terceros): el umbral que cuadra en un teléfono se rompe en el siguiente. La geometría se sigue **siempre**, con y sin teclado.

---

## 3. Phase 0 — ¿me aplica?

> No modifica nada.

```bash
echo "=== 1. ¿Ya tengo el hook? ==="
test -f src/lib/hooks/useViewportInsets.ts && echo "  SÍ — no te aplica" || echo "  NO — sigue leyendo"

echo "=== 2. ¿Tengo el scroll fantasma? ==="
grep -rn "100vh\|min-h-screen\|h-screen" src/ || echo "  limpio"

echo "=== 3. ¿Mi chrome fijo sigue clavado? ==="
grep -rn "fixed top-0\|fixed inset-x-0 bottom-0\|bottom-0 z-" src/components/layout/ || echo "  revisa a mano"
```

---

## 4. Los cuatro pasos

### 4.1 `100vh` → `100svh` (el más barato, y explica la mitad del problema)

En iOS `100vh` es el alto con las barras del navegador **plegadas**: 852 en una ventana que mide 641, medido. Tu documento siempre fue ~211 px más alto que lo visible aunque el contenido cupiera, y iOS gasta ese scroll fantasma en "revelar" el campo enfocado **encima** de deslizar la parte visible. Esa doble corrección es el rebote.

```diff
  body {
-   min-height: 100vh;
+   min-height: 100svh;
  }
```

Y en tus componentes: `min-h-screen` → `min-h-svh`, `h-screen` → `h-svh`.

🔴 **Cambiar sólo el shell NO basta** — si el `body` se queda alto, el scroll fantasma sigue ahí. El proyecto que lo midió se cayó en eso una vez antes de darse cuenta.

### 4.2 Monta `useViewportInsets`

Cópialo del kit (`src/lib/hooks/useViewportInsets.ts` del tarball, o de un checkout del Factory) junto con su test, exporta el hook desde tu `src/lib/hooks/index.ts` e invócalo **una vez** en tu shell:

```tsx
export function DashboardShell({ children, user }: DashboardShellProps) {
  useViewportInsets();
  // …
}
```

Y declara los defaults en tu `globals.css` — **no los omitas**: son los que hacen que un render de servidor, un navegador sin la API y el instante anterior al montaje se vean exactamente como hoy.

```css
:root {
  --viewport-offset-top: 0px;
  --visual-viewport-height: 100dvh;
  --viewport-bottom-gap: 0px;
}
```

> **No "simplifiques" el hook.** Su JSDoc **es** la medición: explica por qué `offsetTop` se acota por arriba (sin ese tope, el rebote del final de una tabla larga baja el header 167 px en cada arrastre), por qué no hay `requestAnimationFrame` (iOS desliza **antes** de avisar; agrupar sumaba un cuadro más de desfase) y qué dos referencias se probaron y fallaron. Cada renglón que parece de más costó una ronda en un teléfono.

### 4.3 Que el chrome fijo siga la geometría

```diff
- <header className="… fixed top-0 …" />
+ <header className="… fixed top-(--viewport-offset-top) …" />
```

🔴 **El bottom nav se queda en `bottom-0` y se ESCONDE con el teclado.** `bottom-(--viewport-bottom-gap)` se probó y flota a media pantalla: el gap es `innerHeight − vv.height` e ignora `vv.offsetTop`, así que con el teclado abierto el nav queda `offsetTop` px demasiado arriba (medido en iPhone: gap 338, offsetTop 195). En su lugar, el hook pone `data-keyboard="open"` en `<html>` mientras hay un campo de texto enfocado y lo visible se encogió más que la barra de Safari, y una regla plana oculta lo marcado:

```diff
+ <nav className="… pb-nav-safe fixed inset-x-0 bottom-0 …" data-hides-for-keyboard="" />
```

```css
/* Regla plana a propósito: la variante `in-data-[keyboard=open]:hidden` emite
   `&`-nesting que Safari en iOS no aplicó (medido 2026-09-12). */
html[data-keyboard='open'] [data-hides-for-keyboard] {
  display: none !important;
}
```

Ponle el mismo atributo a cualquier cosa pegada al borde inferior que no tenga sentido mientras se escribe.

Y **todo lo pegado al borde inferior** (un composer de chat, una barra de acciones, tu bottom nav) resta el gap de su acolchado:

```css
@utility pb-nav-safe {
  padding-bottom: max(calc(env(safe-area-inset-bottom, 0px) - var(--viewport-bottom-gap)), 0px);
}
```

En reposo el gap vale 0 y esto es byte-por-byte lo que tenías.

### 4.4 Toda pantalla que apague el PTR del shell cancela ella misma el gesto

`<PullToRefreshShell>` es quien cancela el `touchmove`. Una pantalla que llama a `useDisableShellPTR()` **sin** montar el wrapper per-screen se queda sin ninguna cancelación, y reaparece el rubber-band nativo de Safari (spinner gris de UIKit sobre tu header, ~70 px de hueco). Lo normal es usar el wrapper; si no puedes, cancela el gesto **en tu propia región** cuando nada bajo el dedo pueda scrollear.

🔴 **`html { overscroll-behavior-y: none }` NO es el atajo.** Darle semántica de scroll a `<html>` desprende los `position: fixed` en WebKit — tu bottom nav se iría con el scroll, y peor todavía con `viewport-fit: cover`. La cancelación va **acotada a la región**, nunca en la raíz.

---

## 5. Opcional, pero es lo que hace medible todo lo demás

El kit shippea un **lector de diagnóstico** (`ViewportDebug` + `lib/pwa/viewportDebug`) que pinta en vivo `innerHeight`, `visualViewport.height/offsetTop`, `scrollY`, las tres variables y el rango que recorrieron durante el último arrastre. Es inerte sin `#vvdebug` en la URL o sin la puerta guardada, que se alterna tocando la píldora de entorno — la única vía dentro de la app instalada, que no tiene barra de direcciones, y que sólo existe fuera de producción.

Cópialo si vas a validar en el teléfono. El proyecto que midió esto quemó sus **tres primeras rondas teorizando sin lector**; las tres que funcionaron fueron con él.

### 5.1 Que el teléfono pueda abrir tu dev server

Next 16 rechaza sus recursos `/_next/*` en dev desde cualquier origen distinto al que abrió el server. Desde `http://<ip-lan>:3000` en el teléfono la página carga, el bundle **no**, nada hidrata y un login rebota a `/login` sin error en ningún lado. Tu `next.config.ts` nació congelado, así que agrégalo tú (el kit lo lee de una variable de entorno para no commitear la IP de nadie):

```ts
// next.config.ts — dev-only by construction; Next ignores it in a production build
...(process.env.NEXT_DEV_ORIGINS
  ? { allowedDevOrigins: process.env.NEXT_DEV_ORIGINS.split(',').map((o) => o.trim()) }
  : {}),
```

```bash
NEXT_DEV_ORIGINS=192.168.0.10 pnpm dev -H 0.0.0.0
```

🔴 **El teléfono cachea los chunks por URL.** Turbopack no cambia el nombre del chunk cuando cambia su contenido, así que tras editar `globals.css` o el hook, una pestaña nueva **no** basta para ver el cambio: recarga saltando el caché (Safari → botón de recargar mantenido → «Recargar sin caché»), o mide con el inspector por USB. Dos rondas de este retrofit se midieron sobre un bundle viejo sin saberlo.

---

## 6. Cómo validar (y dos trampas que cuestan una tarde)

### 6.1 Cierra la app POR COMPLETO antes de creerle a una prueba

> Un bug de layout de PWA que **se cura solo al reabrir** no es un bug de layout hasta que se demuestre lo contrario.

Para validar cualquier arreglo hay que **cerrar la app entera** (deslizarla fuera del selector de apps), o el service worker sigue sirviendo el bundle anterior y estás midiendo código viejo.

### 6.2 Producción, preview y local son tres PWA distintas e indistinguibles

Son **tres orígenes aislados** y en la pantalla de inicio de iOS se ven igual. Un bug "que reapareció" suele ser la PWA gemela de otro origen. Verifica cuál abriste antes de reportar nada.

### 6.3 Checklist en el iPhone (PWA instalada)

1. En reposo: el header y el nav **exactamente** donde estaban antes del retrofit.
2. Teclado abierto: el header visible arriba; el nav justo **encima** de las teclas, sin hueco muerto debajo.
3. Arrastra al **fondo** de una lista larga **sin** teclado: el header **no** se mueve (si baja, el acote de `offsetTop` se rompió).
4. Con el teclado abierto, toca un botón: responde **al primer toque**.
5. Gira el teléfono: nadie midió landscape — si tu app lo permite, es territorio sin explorar.

---

## 7. Lo que NO se arregla, y conviene decirlo

Al abrir el teclado, iOS desliza la parte visible cuadro a cuadro **antes** de avisar. El layout la alcanza un cuadro después, así que se ve un pequeño ajuste al final de la animación. Sin `resizes-content` no hay forma de ir junto con el teclado sin **adivinar su destino**, y adivinar es exactamente lo que rompió las primeras rondas del proyecto que lo midió. **Es un límite de plataforma, no un pendiente** — no lo persigas.

---

## 8. Nada de esto está atado a un iPhone concreto

Todo se midió en un iPhone 15 Pro, así que la pregunta es legítima:

- Los números (852, 641, 34) viven **sólo en comentarios** que documentan la medición. Ninguno está en una regla CSS ni en el hook.
- Los insets salen de `env(safe-area-inset-*)`: 59 px arriba en un 15 Pro Max, 50 en un 12 mini, 47 en el notch clásico, 20 en un SE con botón. El CSS no sabe cuál es y no le hace falta.
- El teclado se sigue por `visualViewport` **sin umbral** — por eso no importa cuánto mida.
- `100svh` es relativo por definición.

---

_TimeKast Factory — retrofit brief (2026-09-11)_
