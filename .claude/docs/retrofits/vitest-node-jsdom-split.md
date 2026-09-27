# Retrofit — partir la suite de vitest en `node` + `jsdom`

> **Para quién:** un proyecto derivado cuya suite unitaria corre entera bajo `jsdom`.
> **Cuesta:** una edición de `vitest.config.ts` + un comentario en los pocos `.test.ts` que sí
> necesitan DOM. **Devuelve:** entre un 20 % y un 40 % del wall clock de `pnpm test`, en cada
> corrida, para siempre.
> **Por qué no llega solo:** `vitest.config.ts` **no está en el manifiesto de distribución** — nace
> con tu proyecto en `factory new` y es tuyo desde entonces (`BR-FACTORY-006`). `factory update`
> nunca lo toca, así que este cambio es opt-in.
> **Disponible desde:** kit `v11.7.0`

## El problema

Construir un DOM cuesta, y se paga **por archivo de test**, no por test. En el Factory, con los 158
archivos compartiendo un solo project `jsdom`, el desglose de vitest decía:

```
Duration 29.13s (transform 5.72s, setup 34.78s, import 25.83s, tests 31.73s, environment 86.38s)
                                                                             ^^^^^^^^^^^^^^^^^^^
```

`environment` —la construcción de jsdom— costaba **más que todas las aserciones juntas**. Y 115 de
esos 158 archivos son Node puro: parsers, validaciones, helpers, tooling. Nunca tocan el DOM.

La prueba de cuánto se paga de más está en el mismo repo: el subproyecto `cli/`, que usa
`environment: 'node'`, corre **942 tests en 3.79 s**; la raíz corría 1935 en 29.87 s.

## Antes de tocar nada — mide

```bash
pnpm test 2>&1 | tail -5
```

Apunta dos cosas: el **conteo de tests** (tu invariante: no puede bajar) y la línea `Duration`,
sobre todo `environment`. Si `environment` no es una fracción notable del total, tu suite no tiene
este problema y este retrofit no te sirve.

## Paso 1 — declarar dos projects

En `vitest.config.ts`, reemplaza el bloque `test: { environment, setupFiles, include, exclude }` por
dos projects. Extrae `alias` y `exclude` a constantes primero, para no mantener dos copias:

```ts
const EXCLUDE = ['node_modules', '.next', 'tests/e2e' /* …lo que ya tuvieras */];
const ALIAS = {
  /* …tu bloque resolve.alias tal cual */
};

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias: ALIAS },
        test: {
          name: 'node',
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
          include: ['**/*.test.ts'],
          exclude: EXCLUDE,
        },
      },
      {
        plugins: [react()],
        resolve: { alias: ALIAS },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
          include: ['**/*.test.tsx'],
          exclude: EXCLUDE,
        },
      },
    ],
    coverage: {
      /* …tu bloque coverage, sin cambios, a nivel raíz */
    },
  },
  resolve: { alias: ALIAS },
});
```

🔴 **Los dos projects cargan el MISMO `vitest.setup.ts`, sin modificarlo.** Es deliberado y es la
parte que no debes "mejorar":

- El setup **sí** viaja con `factory update` (`profiles.json#track`) mientras este config **no**.
  Si lo partes en dos, el próximo update te devuelve la versión del kit y tu config queda apuntando
  a un archivo que ya no existe.
- Ya es seguro bajo `node`: sus toques al DOM están feature-guarded
  (`typeof Element !== 'undefined'`, `typeof window !== 'undefined'`), así que en el project node
  simplemente no hacen nada.
- Y lo que un test de Node **sí** necesita de él —los mocks de `server-only`/`client-only` y la
  carga de tu `vitest.setup.project.ts`— no depende del entorno.

Si tienes `vitest.setup.project.ts`, no lo toques: lo sigue cargando el setup del kit al final, en
los dos projects.

## Paso 2 — encontrar los `.test.ts` que sí necesitan DOM

No los adivines. Córrelo y deja que fallen:

```bash
pnpm test 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "^ *FAIL" | sed 's/.*node *//' | cut -d'>' -f1 | sort -u
```

El síntoma es siempre el mismo: `ReferenceError: window is not defined`, o
`document is not defined`. Son tests de hooks (`renderHook`) o de utilidades que tocan el DOM sin
tener JSX.

**Cuántos esperar:** en el Factory fueron 3 de 115. En un derivado medido, 6 de 318 (1.9 %). En otro,
0 de 120. Si te salen decenas, tu suite tiene componentes escritos como `.ts` — vale la pena
renombrarlos a `.tsx` en lugar de acumular docblocks.

## Paso 3 — el docblock, en la primera línea

```ts
// @vitest-environment jsdom
// `.test.ts` but renders a React hook — opts out of the node project.
import { renderHook } from '@testing-library/react';
```

Vitest lo lee antes de decidir el entorno del archivo, así que gana sobre el project. Tiene que
estar **arriba**, antes de cualquier import; si el archivo empieza con un bloque `/** … */` de
documentación, el docblock va **encima** de ese bloque.

## Paso 4 — verificar

```bash
pnpm test
```

Dos condiciones, ambas obligatorias:

1. **El conteo de tests es idéntico al del inicio.** Si bajó, un archivo quedó fuera de los dos
   globs — típicamente una extensión que no es `.test.ts` ni `.test.tsx` (`.spec.ts`, por ejemplo).
   Ajusta los `include`.
2. **Todo verde.**

Si tu proyecto tiene un test que verifica que los módulos marcados con `server-only` se pueden
importar, que siga verde es la señal de que el project `node` conserva los mocks del setup.

## Lo que este retrofit NO hace

- **No toca `vitest.setup.ts`.** Ver el paso 1.
- **No baja la línea `setup`.** Los 115 archivos de Node siguen cargando
  `@testing-library/jest-dom` porque el setup es compartido. Es el precio de no partirlo, y es el
  precio correcto.
- **No es un 40 % garantizado.** Los dos projects corren en paralelo y compiten por CPU: en el
  Factory el wall clock fue de 29.87 s a 22.57 s (−24 %) con la suite completa en verde. La mejora
  crece con la proporción de archivos Node de tu suite.
