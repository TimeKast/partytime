# Methodology — Kit Leverage Analysis

> Sub-file of `tk-discovery/methodology/`. See parent `methodology.md` for the full index.
> Topical scope: output schema for Phase 5 SK Leverage Analysis (`dsc-kit-analyst`) — feature × SK component mapping, coverage aggregation, drift surfacing, and trigger rule.

---

## §12 — SK Leverage Schema

Formaliza output del `dsc-kit-analyst` (currently implicit en agent prompt).

### Output shape

- **Feature × SK mapping:** FT-ID | Feature | Sub-feature | SK component | Skill reference | Acción (Configure/Extend/Build) | Effort (S/M/L/XL)
- **Coverage aggregated:**
  - Configure (≥80% kit): X% features
  - Extend (40-80%): Y%
  - Build (<40%): Z%
  - Overall SK Coverage weighted by effort tier
- **Drift tickets emitted (if any):** paths a `project/factory/sk-drift-*.md` + resumen
- **Leverage recommendations:** orden de attack, features P0, cortes candidatos si deadline aprieta
- **Risks de leverage:** RBAC collision, pattern drift, cuota limits, etc.

### Trigger rule

Solo se ejecuta si `SK_ACTIVE=true` (detectado en Phase 0 via `package.json.factoryVersion`).

---

_TimeKast Factory — Discovery methodology / kit leverage (sub-file)_
