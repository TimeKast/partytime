# INDEX — Rules del kit

> Único punto de entrada de las rules always-on. `CLAUDE.md` importa **este** archivo;
> este archivo importa las 6 rules. El INDEX solo enumera — la doctrina vive en cada rule.

@CORE.md
@CODING.md
@GIT.md
@SK.md
@CC.md
@DOR_DOD.md

<!--
Mecánica (detalle en el header de scripts/tools/generate-agent-adapters.mjs):
1. Anidación: `CLAUDE.md` → `INDEX.md` → cada rule usa 2 de los 4 hops de `@import`.
2. Los paths se resuelven contra el archivo que CONTIENE el import: por eso `@CORE.md`.
3. Full-only: `core` excluye este archivo (importa `SK.md`) y usa sus 5 `@import` directos.
-->

---

_TimeKast Factory — Rules INDEX (L1, kit-owned)_
