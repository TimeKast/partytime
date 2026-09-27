# Migration brief — el botón "Recargar" del aviso de nueva versión deja la pestaña trabada

> **Aplica si:** tu app usa el PWA del kit y shippea `src/components/pwa/PwaUpdateToast.tsx` (o su equivalente con otro nombre) **y** ese archivo no tiene un guard que impida recargar dos veces.
>
> **Cuesta:** unas 15 líneas en un solo archivo, más su test. Sin tocar el Service Worker, sin tocar la config.
>
> **Disponible desde:** kit `v12.0.0`
>
> **Por qué no llega solo:** vive en `src/`, que nace congelado con tu proyecto y `factory update` nunca toca (`BR-FACTORY-006`). El kit ya salió arreglado para proyectos nuevos; este es el camino para los que ya existen.

---

## 1. El síntoma

Pulsas **"Recargar"** en el aviso de nueva versión y la pestaña **se queda trabada**: no avanza, el contador de errores de consola sube, y solo un refresh manual la saca. Reportado en producción por un PO y reproducible en varios deploys.

Hay un segundo síntoma, más silencioso: a veces el botón **no hace nada** y el aviso se queda ahí para siempre.

---

## 2. Phase 0 — ¿me aplica?

```bash
grep -n "controllerchange" -A 3 src/components/pwa/PwaUpdateToast.tsx
```

**Te aplica** si ves un `window.location.reload()` dentro del listener sin ninguna bandera que lo proteja:

```ts
navigator.serviceWorker.addEventListener('controllerchange', () => {
  window.location.reload();        // ← nada impide que corra dos veces
});
```

⚠️ **Ojo con un falso negativo.** Puede que tengas un `controllerBoundRef` (o similar) y parezca resuelto. **No lo está**: ese protege el *registro* del listener, no su *ejecución*. Son garantías distintas, y la que falta es la segunda. Si no encuentras `reloadingRef` / `refreshing` / `hasReloaded`, te aplica.

**No te aplica** si no usas el PWA del kit, o si tu componente ya tiene ese guard.

---

## 3. Por qué se traba (y por qué el guard es la respuesta)

`controllerchange` **puede emitirse más de una vez**. Un `location.reload()` disparado sobre una navegación que ya está en curso **la reinicia**, y eso es exactamente "no avanza". Es el guard canónico que Workbox documenta para el patrón `skipWaiting`.

El segundo síntoma tiene otra causa: si el worker **ya fue activado desde otra pestaña** —`skipWaiting()` activa para todas—, el evento ya ocurrió y no vuelve. El click manda su mensaje, nadie responde, y el aviso se queda con duración infinita.

---

## 4. Phase 1 — el arreglo

Tres cambios dentro de `PwaUpdateToast.tsx`:

**a) Una recarga idempotente.** Reemplaza el cuerpo del listener por una función con bandera:

```ts
const reloadingRef = useRef(false);   // junto a los demás refs del componente

// dentro del useEffect:
const reloadOnce = () => {
  if (reloadingRef.current) return;
  reloadingRef.current = true;
  window.location.reload();
};

const onControllerChange = () => reloadOnce();
```

Y que el `addEventListener` use `onControllerChange` en vez de una función anónima — vas a necesitar la referencia para el punto (c).

**b) Un respaldo, para que el botón nunca quede muerto.** En el `onClick` del aviso, después del `postMessage`:

```ts
waitingSW.postMessage({ type: 'SKIP_WAITING' });
window.setTimeout(reloadOnce, 3000);
```

Es seguro dispararlo siempre: el usuario acaba de pedir esa recarga, y `reloadOnce` la mantiene en una.

**c) Quitar el listener al desmontar.** En el `return` del `useEffect`:

```ts
navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
```

---

## 5. Phase 2 — dónde enganchar el listener (lo que de verdad importa)

Si tu componente llama al bind **al mostrar el aviso**, muévelo **al `onClick`**, antes del `postMessage`.

No es cosmético. El aviso aparece precisamente cuando recargar en automático **no** era seguro — porque hay un formulario sin guardar, un guardado en vuelo, o más de una pestaña abierta. Con el bind al mostrar, un click en **otra** pestaña activa el worker para todas y **esta** recarga encima de ese trabajo, sin pasar por ningún guard. Es justo lo que los dos guards duros prometen que no pasa.

```ts
onClick: () => {
  bindControllerReload();          // ← aquí, no al mostrar el aviso
  waitingSW.postMessage({ type: 'SKIP_WAITING' });
  window.setTimeout(reloadOnce, 3000);
},
```

**No pierdes la actualización en la pestaña que no pulsó.** Los cuatro disparadores de detección (montaje, cambio de ruta, visibilidad, foco) la re-evalúan cuando vuelvas a ella, y se actualiza sola en cuanto sea seguro. Se difiere, no se cae.

---

## 6. Phase 3 — el test que lo fija

Un test que solo renderice el aviso no sirve. El caso a fijar es preciso: **dos `controllerchange` seguidos ⇒ una sola recarga**. El kit lo trae en `tests/unit/pwa/PwaUpdateToast.test.tsx` (`describe('PwaUpdateToast — reload guard')`), con cuatro casos que puedes copiar tal cual: la recarga única, que no se engancha hasta el click, el respaldo cuando el evento nunca llega, y la limpieza al desmontar.

> Comprobación que vale la pena hacer: revierte tu arreglo y confirma que los tests **fallan**. Si pasan en ambos casos, no están probando lo que crees.

---

## 7. Verifica en el navegador

1. Abre la app en **dos** pestañas.
2. Deploya una versión nueva y espera el aviso.
3. En la pestaña 1, escribe algo en un formulario sin guardar.
4. En la pestaña 2, pulsa **"Recargar"**.

**Antes:** la pestaña 1 se recargaba y perdías lo escrito. **Después:** la pestaña 1 se queda intacta; la 2 recarga sola.

---

_TimeKast Factory — retrofit `pwa-update-toast-reload-guard` (kit v12.0.0)_
