# Migration brief — al cambiar de pantalla te quedas a media página

> **Aplica si:** tu app usa el shell del kit (`DashboardShell` o cualquier layout compartido con header fijo) **y** no tiene un `ScrollToTop` montado en su layout raíz.
>
> **Prioridad: BAJA.** Nadie se queda sin poder trabajar por esto y no hay riesgo de datos — es pulido de experiencia. Vale la pena porque es la diferencia entre "se siente app" y "se siente sitio web", cuesta un archivo, y mientras no esté, cada pantalla nueva del proyecto nace con el defecto. Agéndalo con calma; no interrumpas nada por él.
>
> **Cuesta:** un archivo nuevo (~50 líneas, se copia tal cual) más una línea en el layout raíz. Sin tocar rutas, sin tocar el shell, sin config.
>
> **Disponible desde:** kit `v12.0.0`
>
> **Por qué no llega solo:** vive en `src/`, que nace congelado con tu proyecto y `factory update` nunca toca (`BR-FACTORY-006`). Los proyectos nuevos ya nacen con el arreglo; este es el camino para los que ya existen.

---

## 1. El síntoma

Navegas de una pantalla a otra y la nueva **aparece a la altura de scroll en la que quedó la anterior**. Abres el detalle de un registro desde la mitad de una lista larga y aterrizas a media ficha, con el título fuera de vista. Lo esperado es llegar siempre hasta arriba, y de forma instantánea — sin animación de scroll.

Se nota más en mobile, donde las listas son largas y el pulgar ya bajó bastante antes de tocar el ítem.

---

## 2. Phase 0 — ¿me aplica?

```bash
grep -rn "ScrollToTop\|window.scrollTo" src/app/layout.tsx src/components/common/ 2>/dev/null
```

**Te aplica** si no sale nada. **No te aplica** si ya tienes un componente que hace el reset (revisa entonces la sección 5: puede que le falten los guards).

---

## 3. Por qué pasa (y por qué no es un bug de tu código)

El App Router de Next **ya trae** reset de scroll al navegar. Lo que hace es una heurística: antes de scrollear comprueba si el contenido entrante ya está dentro del viewport, y si lo está, no hace nada — asume que no hay nada que corregir.

Un layout compartido con **header fijo** es justo el caso donde esa comprobación se equivoca: el header sigue pintado en la misma posición durante toda la navegación, el contenedor del contenido nuevo cae dentro del área visible, y Next concluye que ya estás viendo la pantalla nueva. Conserva el offset anterior. `DashboardShell` es exactamente esa forma, así que el defecto es del patrón, no de tu proyecto.

Por eso el arreglo es re-aplicar el reset a mano en vez de "arreglar el shell": el shell está bien.

---

## 4. Phase 1 — el archivo

Crea `src/components/common/ScrollToTop.tsx` con esto tal cual:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * ScrollToTop
 *
 * Restores the "a new page starts at the top" expectation that the App Router's
 * built-in scroll reset skips when a shared layout keeps a fixed header on
 * screen: its heuristic sees the incoming content already inside the viewport
 * and preserves the previous offset.
 *
 * Mounted once in the root layout. Three deliberate constraints:
 *  - keyed on `pathname` ONLY — same-page query changes (filters, pagination,
 *    sorting) must not yank the user back to the top.
 *  - skipped when the URL carries a hash — in-page anchors win.
 *  - skipped on back/forward and on first paint — the browser and Next restore
 *    the previous offset there, which is what returning to a list should do.
 */
export function ScrollToTop() {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);
  const isHistoryNavRef = useRef(false);

  // popstate fires before React re-renders, so the flag is already set by the
  // time the pathname effect below runs for a back/forward navigation.
  useEffect(() => {
    const markHistoryNav = () => {
      isHistoryNavRef.current = true;
    };
    window.addEventListener('popstate', markHistoryNav);
    return () => window.removeEventListener('popstate', markHistoryNav);
  }, []);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    previousPathRef.current = pathname;

    const wasHistoryNav = isHistoryNavRef.current;
    isHistoryNavRef.current = false;

    // First paint (nothing to reset) or a re-render without a route change.
    if (previousPath === null || previousPath === pathname) return;
    if (wasHistoryNav) return;
    if (window.location.hash) return;

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}
```

Y móntalo en `src/app/layout.tsx`, dentro del `<body>`:

```tsx
import { ScrollToTop } from '@/components/common/ScrollToTop';

// ...
<body className={...}>
  <ScrollToTop />
  {/* el resto de tu árbol */}
</body>
```

🔴 **En el layout raíz, no en `DashboardShell`.** Montarlo en el shell deja fuera las pantallas de login y las legales, que están en otro grupo de rutas y tienen el mismo problema. Un solo montaje cubre toda la app.

ℹ️ Si tu `<body>` está envuelto por providers, da igual dónde caiga entre ellos: el componente no renderiza nada y no consume contexto.

---

## 5. Los tres guards son el punto (no son defensividad)

Si vas a escribir tu propia versión en vez de copiar la de arriba, estos tres casos **tienen** que quedar fuera del reset. Cada uno es una regresión de UX real, y los tres son fáciles de omitir:

| Caso | Qué NO debe pasar | Cómo se logra |
| --- | --- | --- |
| Cambia solo el query string (`?page=3`, filtros, orden) | Que brinque al inicio mientras el usuario filtra una tabla | Dependencia del effect en `pathname`, **nunca** en `useSearchParams()` ni en la URL completa |
| La URL trae ancla (`/profile#seguridad`) | Que pise el scroll al ancla y te deje arriba | `if (window.location.hash) return;` |
| Botón atrás / adelante | Que pierdas la posición al volver a la lista de donde saliste | Bandera puesta en `popstate`, que corre antes del re-render |

El primero probablemente ya lo tengas en mente. Los otros dos son los que se olvidan, y el del ancla muerde fuerte si tu app deep-linkea a secciones dentro de una pantalla (el perfil del kit lo hace).

---

## 6. Phase 2 — el test que lo fija

El kit trae la suite completa en `tests/unit/components/common/ScrollToTop.test.tsx` — seis casos, copiables tal cual: primer paint sin scroll, cambio de ruta con `scrollTo` instantáneo, query-only sin scroll, hash sin scroll, back sin scroll, y la navegación siguiente a un back volviendo a scrollear.

El mock es todo lo que necesitas para controlar la navegación:

```tsx
let mockPathname = '/dashboard';
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
```

Cambias `mockPathname` y haces `rerender(<ScrollToTop />)` para simular cada navegación, con `window.scrollTo` mockeado como espía.

> Comprobación que vale la pena: quita un guard (el del hash, por ejemplo) y confirma que su test **falla**. Si pasa igual, no está probando lo que crees.

---

## 7. Verifica en el navegador

1. Entra a una lista larga y baja hasta la mitad.
2. Abre el detalle de un ítem → **debes aterrizar hasta arriba**, sin animación.
3. Regresa con el botón atrás → **debes volver a donde estabas** en la lista, no al inicio.
4. Aplica un filtro o cambia de página en la tabla → **la vista no debe moverse**.
5. Si tu app tiene links a secciones internas (`/perfil#seguridad`), ábrelo → **debe posicionarse en la sección**, no arriba.

Los cinco pasos cubren el arreglo y sus tres guards.

---

_TimeKast Factory — retrofit `scroll-reset-on-navigation` (kit v12.0.0)_
