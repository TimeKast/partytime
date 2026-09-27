# Migration brief — las variables de tu corrida de E2E dejan de vivir en `.env.local`

> **Aplica si:** tu suite de E2E necesita variables que valen para **toda la corrida** (no para una fase suelta) y hoy las tienes en `.env.local`, en los secrets de CI, o exportadas a mano antes de `pnpm test:e2e`.
>
> **Cuesta:** un archivo nuevo de 5-10 líneas. Sin tocar el runner, sin tocar `playwright.config.ts`.
>
> **Disponible desde:** kit `v11.8.0`. Hermano del registro de fases (`e2e.project.ts`, guía [aquí](./e2e-phases-adoption.md)), un nivel de alcance más arriba.

---

## 1. Qué se arregla

El runner **fija** la postura de la corrida: la base de datos desechable, el puerto, `EMAIL_PROVIDER=none` para que la suite no mande correos reales, `RATE_LIMIT_ENABLED=false` para que el bucket de login no tumbe la suite entera. Esa garantía no depende de lo que tenga cada quien en su disco — es del runner.

Tus variables no tenían dónde vivir con esa misma garantía. El `env()` de una fase (§1.7 de `sk-e2e`) resuelve el caso "esta fase necesita X", pero no "toda la corrida necesita X"; para eso el kit se apuntaba a sí mismo a su base, que es kit-owned. Así que la salida era `.env.local`.

**Por qué eso es un downgrade y no una cuestión de estilo.** En `.env.local`, la garantía se vuelve convención, y el modo de falla es del silencioso: alguien corre la suite con un feature flag apagado, las specs de esa feature **se saltan**, la corrida termina en verde y nadie se entera de que no se probó nada.

---

## 2. Phase 0 — ¿me aplica?

```bash
# ¿Tienes variables que TODA la corrida necesita y que no son del kit?
grep -nE '^(?!#)[A-Z0-9_]+=' .env.local | grep -viE 'database_url|auth_secret|^port|next_public_app_url'
```

Te aplica si en esa lista hay variables **sin las cuales tu suite no prueba lo que cree probar**. Ejemplos reales: un flag que enciende el módulo de reportes, el host de un servicio interno que las specs consultan, una clave que se firma por corrida.

**No te aplica** si tus variables son de una sola fase (van en el `env()` de esa fase) o si de verdad son configuración del desarrollador (una URL de un servicio local que cada quien tiene distinta).

---

## 3. Phase 1 — crea el archivo

`scripts/tools/e2e.env.project.ts` — dev-owned, no viaja en ningún perfil, `factory update` no lo toca nunca:

```ts
export default () => ({
  // Se hornean en el build Y entran al build stamp. Única mitad que admite NEXT_PUBLIC_*.
  build: {
    NEXT_PUBLIC_AUTH_REGISTRATION: 'false',
  },
  // Van al `next start` de todas las fases.
  server: {
    REPORTS_ENABLED: 'true',
    PLATFORM_OPS_HOST: 'ops.localhost',
  },
  // Van al proceso de Playwright de todas las fases.
  playwright: {
    REPORTS_ENABLED: 'true',
  },
});
```

**Las tres mitades son independientes**: declara solo las que uses. Un objeto plano funciona igual que la función; la función existe para lo que se genera **por corrida** (un secreto efímero, un id de sesión), y se evalúa **una sola vez**, antes de la rama de Neon y del build.

### Un secreto que se parte entre el server y las specs

Mismo patrón que el `env()` de una fase, y por la misma razón: **una** evaluación, así que las dos mitades concuerdan por construcción y no por una regla que alguien tiene que recordar.

```ts
import { randomBytes } from 'node:crypto';

export default () => {
  const token = randomBytes(32).toString('hex'); // se genera UNA vez por corrida
  return {
    server: { OPS_WEBHOOK_TOKEN: token },      // el que verifica
    playwright: { OPS_WEBHOOK_TOKEN: token },  // el que firma
  };
};
```

---

## 4. La regla de las `NEXT_PUBLIC_*` — la que sorprende

Van **solo** en `build`. En `server` o `playwright` el runner las rechaza, y no por purismo: una variable pública se **inlinea en el bundle** cuando Next compila, así que ponerla en el proceso del servidor no hace absolutamente nada — la habrías declarado creyendo que aplicaba.

Y hay un segundo motivo, más filoso: `build` es la única mitad que alimenta el **build stamp**. El runner recicla `.next/` entre corridas (`sk-e2e §1.3`), así que una variable pública que cambia sin entrar al stamp deja servir el bundle **anterior** — en verde, con el valor viejo. Ese es exactamente el caso que el stamp existe para atrapar.

```ts
// ❌ no hace nada, y el runner te lo dice
server: { NEXT_PUBLIC_AUTH_REGISTRATION: 'false' }

// ✅
build: { NEXT_PUBLIC_AUTH_REGISTRATION: 'false' }
```

---

## 5. Phase 2 — quita las variables de `.env.local`

Solo las que moviste. Después:

```bash
pnpm test:e2e
```

Al arrancar, el runner narra lo que fijaste:

```
   ⚙️  scripts/tools/e2e.env.project.ts pins this run's env (build: 1, server: 2, playwright: 1).
```

Si esa línea no aparece, el archivo no se está cargando — revisa el nombre y la ruta (`scripts/tools/`, no la raíz).

**Verifica que de verdad fijaste algo**, en vez de asumirlo: borra la variable de `.env.local`, corre la suite y comprueba que las specs que dependen de ella **siguen ejecutándose**. Ese es el punto entero del cambio.

---

## 6. Qué pasa cuando algo no cuadra

| Situación                                                | Qué hace el runner                                             |
| -------------------------------------------------------- | -------------------------------------------------------------- |
| No existe el archivo                                     | Nada. La corrida es byte por byte la de antes                   |
| Existe pero no carga (error de sintaxis)                 | **Aborta**, nombrando el error real                            |
| Su función lanza al evaluarse                            | **Aborta**, nombrando lo que lanzó                             |
| Una mitad mal escrita (`severs`)                         | **Aborta**, nombrándola y listando las válidas                 |
| Un valor que no es string (`PORT_ISH: 42`)               | **Aborta**, nombrando la clave                                 |
| Declara `DATABASE_URL`, `PORT`, `NODE_OPTIONS`…          | **Aborta**. Es infraestructura de la corrida, no configuración |
| Declara `NEXT_PUBLIC_*` fuera de `build`                 | **Aborta**, diciéndote que la muevas a `build`                 |

Ninguna es un skip silencioso, y es deliberado: un archivo que existe es una afirmación del proyecto sobre cómo debe correr su suite. Ignorarlo a medias produce la corrida verde que no probó lo que creía.

---

## 7. Preguntas que aparecen siempre

**¿Y si una fase necesita una variable distinta a la de la corrida?** La declara en su `env()` y gana: la fase es el alcance más específico. Esto fija el piso, no el techo.

**¿Puedo sobrescribir algo que el kit fija?** Sí, salvo la infraestructura de la tabla de arriba. Si quieres `EMAIL_PROVIDER=smtp` en tu corrida, decláralo — la responsabilidad es tuya y queda escrita en tu repo.

**¿Reemplaza a `.env.local`?** No. `.env.local` sigue siendo para lo que es de cada desarrollador. Esto es para lo que la **suite** necesita para probar lo que dice probar.

**¿Entra al build stamp todo lo que declaro?** Solo `build`. `server` y `playwright` no afectan el bundle, así que no invalidan el reciclado.

---

_TimeKast Factory — retrofit: entorno de la corrida de E2E declarado por el proyecto_
