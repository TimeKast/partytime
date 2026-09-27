<!--
  ===== tk-deploy: CHANGELOG entry template =====
  Used in Phase 2.5 to generate a new entry inferred from Conventional Commits.
  Buckets follow Keep a Changelog (https://keepachangelog.com) + Breaking.

  Placeholders:
  - {VERSION}            — e.g. "1.2.0" (sin `v` prefix — el `v` solo va en el tag, no en el header)
  - {DATE}               — YYYY-MM-DD
  - {TITLE}              — título descriptivo corto del release (e.g. "tk-design tier classification + tk-backlog plan-mode")
  - {BREAKING_BLOCK}     — only emit if any commit has `!:` or `BREAKING CHANGE:`
  - {ADDED_BLOCK}        — only emit if any commit is `feat:`
  - {CHANGED_BLOCK}      — only emit if any commit is `refactor:` or `perf:`
  - {FIXED_BLOCK}        — only emit if any commit is `fix:`

  Header format: `## [{VERSION}] - {DATE} — {TITLE}`
  (sin `v` prefix, hyphen entre VERSION y DATE, em-dash + título descriptivo después del DATE)
  Coincide con las entries históricas reales (v6.2.0, v6.1.1, v6.1.0 en `.claude/docs/CHANGELOG.md`).

  Each line within a block:
  - Strip `<type>(<scope>)!?:` prefix from subject.
  - Append `(closes ISSUE-XXX, ISSUE-YYY)` if commit body has `Closes:` footer.
  - Append `(refs ISSUE-ZZZ)` if commit body has `Refs:` footer (and no Closes).

  Excluded by default: chore, docs, style, test, ci, build, revert.
  User can manually add anything excluded during the editing step (Phase 2.6).

  Idioma:
  - **Headings** (`### Added` / etc): inglés (Keep a Changelog canonical).
  - **Bullets**: por `locale:` del frontmatter YAML del project-config (schema v2.0).
    Default = es-MX cuando ausente o pre-v2.0; `locale: en-US` → inglés.
  - **es-MX rules**: términos técnicos en inglés sin traducir (`commit`, `push`, `merge`,
    `deploy`, `schema`, `hook`, `tag`, `bump`, `lockfile`, `frontmatter`, `branch`).
    Anglicismos verbalizados OK (`commitear`, `mergear`, `bumpear`, `pushear`).
    NUNCA argentino (voseo prohibido).
  - Ver `methodology/conventional-commits.md §Idioma del entry` para el algoritmo completo.
-->

## [{VERSION}] - {DATE} — {TITLE}

{BREAKING_BLOCK}

{ADDED_BLOCK}

{CHANGED_BLOCK}

{FIXED_BLOCK}

---

<!--
  Per-block format (only emit if at least one matching commit):

  ### Breaking
  - {cleaned subject} (closes {refs})

  ### Added
  - {cleaned subject}
  - {cleaned subject} (closes ISSUE-XXX)

  ### Changed
  - {cleaned subject}

  ### Fixed
  - {cleaned subject}
-->
