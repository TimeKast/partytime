#!/usr/bin/env tsx
/**
 * SCR Classifier Fixture Harness
 *
 * Validates that the SCR classification rules from
 * `.claude/skills/tk-design/methodology/screen-contract-shape.md §Tier election rule`
 * produce expected tiers for the worked examples in
 * `.claude/skills/tk-design/methodology/scr-classifier-fixtures.md`.
 *
 * Usage:
 *   pnpm test:scr-classifier
 *
 * Exits with code 0 on all-pass, 1 if any fixture fails.
 *
 * @see tk-design v6.2.0 M-NEW-8
 */

interface SkLeverageRow {
  feature: string;
  sub_feature: string;
  action: 'Configure' | 'Extend' | 'Build';
  effort: 'S' | 'M' | 'L' | 'XL';
}

interface FixtureInput {
  scr_id: string;
  slug: string;
  features: string[];
  sk_leverage_rows: SkLeverageRow[];
  layout_impact: boolean | null;
  per_screen_customizations: string[];
  project_defaults_applied?: string[];
  packet_keywords_detected?: string[];
}

interface Fixture {
  number: number;
  title: string;
  input: FixtureInput;
  expected_tier: 'kit-pure' | 'kit-extended' | 'custom';
  edge_case_category: string;
}

type Tier = 'kit-pure' | 'kit-extended' | 'custom';

// ────────────────────────────────────────────────────────────────────────
// Day-2 action matrix — deterministic (the 4 cells). Tier is NOT asserted
// here (judgment, fail-toward-custom — lives in worked examples).
// @see .claude/skills/tk-design/methodology/day2-classification.md §Action matrix
// ────────────────────────────────────────────────────────────────────────

type Day2Action = 'nueva' | 'regenerar' | 'backfill';

interface Day2ActionInput {
  /** as-built page.tsx on disk (true) vs `new` page the plan adds (false) */
  exists_in_code: boolean;
  /** a covering SCR exists in 16_DESIGN.md (by route, fallback slug) */
  has_scr: boolean;
}

interface Day2ActionFixture {
  number: number;
  title: string;
  input: Day2ActionInput;
  expected_action: Day2Action;
  matrix_cell: string;
}

function classifyDay2Action(input: Day2ActionInput): Day2Action {
  // Row 1 & 2: new page file → nueva (regardless of a stale/orphan covering SCR).
  if (!input.exists_in_code) {
    return 'nueva';
  }
  // Row 3: exists in code AND has SCR → regenerar.
  if (input.has_scr) {
    return 'regenerar';
  }
  // Row 4: exists in code, no SCR → backfill.
  return 'backfill';
}

// ────────────────────────────────────────────────────────────────────────
// Classifier — pure function implementation of §Tier election rule
// ────────────────────────────────────────────────────────────────────────

const LAYOUT_IMPACT_KEYWORDS = [
  'rediseñar',
  'panel lateral',
  'panel',
  'sidebar',
  'wizard',
  'multi-step',
  'split view',
  'split-view',
  'columna custom',
  'tooltip',
  'chart',
  'dashboard',
];

function classifyTier(input: FixtureInput): Tier {
  const actions = input.sk_leverage_rows.map((r) => r.action);
  const configureCount = actions.filter((a) => a === 'Configure').length;
  const extendCount = actions.filter((a) => a === 'Extend').length;
  const buildCount = actions.filter((a) => a === 'Build').length;
  const totalCount = actions.length;

  // Rule 1: layout_impact: true → custom
  if (input.layout_impact === true) {
    return 'custom';
  }

  // Rule 2: any Build → custom
  if (buildCount > 0) {
    return 'custom';
  }

  // Rule 3: majority Extend → custom
  if (extendCount > configureCount) {
    return 'custom';
  }

  // Rule 6 bridge: layout_impact: null (legacy packet) + keyword detection
  if (input.layout_impact === null && input.packet_keywords_detected) {
    const hits = input.packet_keywords_detected.filter((k) =>
      LAYOUT_IMPACT_KEYWORDS.includes(k.toLowerCase())
    );
    // Default-conservative: if heuristic detects layout signal, fail-toward-custom
    if (hits.length >= 2) {
      return 'custom';
    }
  }

  // Rule 4: some Extend + per-screen customizations (no layout impact) → kit-extended
  if (extendCount > 0 && input.per_screen_customizations.length > 0) {
    return 'kit-extended';
  }

  // Rule 5: 100% Configure + cero per-screen customizations → kit-pure
  if (configureCount === totalCount && input.per_screen_customizations.length === 0) {
    return 'kit-pure';
  }

  // Default-conservative fallback
  return 'custom';
}

// ────────────────────────────────────────────────────────────────────────
// Fixtures — copied from scr-classifier-fixtures.md
// ────────────────────────────────────────────────────────────────────────

const fixtures: Fixture[] = [
  {
    number: 1,
    title: 'Pure kit-shipped (login magic-link only)',
    input: {
      scr_id: 'SCR-001',
      slug: 'login',
      features: ['FT-S01'],
      sk_leverage_rows: [
        {
          feature: 'FT-S01',
          sub_feature: 'NextAuth credentials provider',
          action: 'Configure',
          effort: 'S',
        },
      ],
      layout_impact: false,
      per_screen_customizations: [],
      project_defaults_applied: ['es-MX copy', 'neomorphism theme', 'TimeKast logo'],
    },
    expected_tier: 'kit-pure',
    edge_case_category: 'baseline canonical kit-shipped',
  },
  {
    number: 2,
    title: 'Kit-extended (mi-perfil con campo custom)',
    input: {
      scr_id: 'SCR-019',
      slug: 'mi-perfil',
      features: ['FT-S01'],
      sk_leverage_rows: [
        {
          feature: 'FT-S01',
          sub_feature: 'ProfileForm component (sk-security)',
          action: 'Configure',
          effort: 'S',
        },
        {
          feature: 'FT-S01',
          sub_feature: 'Custom field employee_id',
          action: 'Extend',
          effort: 'S',
        },
      ],
      layout_impact: false,
      per_screen_customizations: [
        'Campo employee_id agregado al ProfileForm',
        'Validation Zod custom para format RFC mexicano',
      ],
    },
    expected_tier: 'kit-extended',
    edge_case_category: 'Tier S feature con field custom',
  },
  {
    number: 3,
    title: 'Custom por layout_impact declarativo',
    input: {
      scr_id: 'SCR-022',
      slug: 'queries-proscai-editor',
      features: ['FT-M02'],
      sk_leverage_rows: [
        {
          feature: 'FT-M02',
          sub_feature: 'saved_queries CRUD via withAuth helpers',
          action: 'Configure',
          effort: 'S',
        },
        {
          feature: 'FT-M02',
          sub_feature: 'SQL editor with syntax highlighting',
          action: 'Build',
          effort: 'M',
        },
      ],
      layout_impact: true,
      per_screen_customizations: [
        'SQL editor con CodeMirror (no kit primitive)',
        'Split view: editor superior + preview inferior',
      ],
    },
    expected_tier: 'custom',
    edge_case_category: 'declarative layout_impact + Build',
  },
  {
    number: 4,
    title: 'Custom por fallback heuristic con default-conservative',
    input: {
      scr_id: 'SCR-005',
      slug: 'ventas-dashboard',
      features: ['FT-M11'],
      sk_leverage_rows: [
        {
          feature: 'FT-M11',
          sub_feature: 'DataTable con filtros cascada',
          action: 'Configure',
          effort: 'S',
        },
        {
          feature: 'FT-M11',
          sub_feature: 'Recharts AreaChart custom',
          action: 'Extend',
          effort: 'M',
        },
      ],
      layout_impact: null,
      per_screen_customizations: [
        'Chart Recharts con tooltip custom',
        'Filtros cascada por temporada + sucursal',
      ],
      packet_keywords_detected: ['dashboard', 'chart', 'tooltip'],
    },
    expected_tier: 'custom',
    edge_case_category: 'legacy packet + heuristic fail-toward-custom',
  },
  {
    number: 5,
    title: 'False-positive keyword "tabla" en CRUD generic',
    input: {
      scr_id: 'SCR-007',
      slug: 'usuarios-list',
      features: ['FT-S05'],
      sk_leverage_rows: [
        {
          feature: 'FT-S05',
          sub_feature: 'DataTable con paginación',
          action: 'Configure',
          effort: 'S',
        },
        {
          feature: 'FT-S05',
          sub_feature: 'Action inviteUser via withAuth',
          action: 'Configure',
          effort: 'S',
        },
      ],
      layout_impact: false,
      per_screen_customizations: [],
      packet_keywords_detected: ['tabla', 'DataTable'],
    },
    expected_tier: 'kit-pure',
    edge_case_category: 'declarative beats heuristic',
  },
  {
    number: 6,
    title: 'Boundary: kit-pure vs kit-extended (notifications)',
    input: {
      scr_id: 'SCR-018',
      slug: 'notifications-panel',
      features: ['FT-S03'],
      sk_leverage_rows: [
        {
          feature: 'FT-S03',
          sub_feature: 'NotificationPanel component (sk-notifications)',
          action: 'Configure',
          effort: 'S',
        },
        {
          feature: 'FT-S03',
          sub_feature: 'Custom categories cron-alerts + sync-failures',
          action: 'Extend',
          effort: 'S',
        },
      ],
      layout_impact: false,
      per_screen_customizations: [
        'Categories custom (cron-alerts, sync-failures) declaradas en src/config/notifications.ts',
      ],
    },
    expected_tier: 'kit-extended',
    edge_case_category: 'boundary per-screen vs project config',
  },
  {
    number: 7,
    title: 'Custom por majority Extend (FT-L04 admin matrix)',
    input: {
      scr_id: 'SCR-025',
      slug: 'permisos-matrix',
      features: ['FT-L04'],
      sk_leverage_rows: [
        {
          feature: 'FT-L04',
          sub_feature: 'DataTable con paginación',
          action: 'Configure',
          effort: 'S',
        },
        {
          feature: 'FT-L04',
          sub_feature: 'Matrix view custom (role × dashboard × scope)',
          action: 'Extend',
          effort: 'M',
        },
        {
          feature: 'FT-L04',
          sub_feature: 'Bulk assignment UI',
          action: 'Extend',
          effort: 'M',
        },
      ],
      layout_impact: true,
      per_screen_customizations: [
        'Matrix view 3D (role × dashboard × scope)',
        'Bulk assignment con checkboxes per-row',
      ],
    },
    expected_tier: 'custom',
    edge_case_category: 'admin matrix layout + majority Extend',
  },
  {
    number: 8,
    title: 'Custom por Build (FT-L01 Proscai MySQL connection)',
    input: {
      scr_id: 'SCR-020',
      slug: 'sincronizacion-config',
      features: ['FT-L01', 'FT-M01'],
      sk_leverage_rows: [
        {
          feature: 'FT-L01',
          sub_feature: 'MySQL2 connection pool (no kit precedent)',
          action: 'Build',
          effort: 'L',
        },
        {
          feature: 'FT-M01',
          sub_feature: 'HistoryTable de sync runs',
          action: 'Extend',
          effort: 'M',
        },
      ],
      layout_impact: false,
      per_screen_customizations: [
        'Form de configuración connection pool (host/port/SSL)',
        'HistoryTable con badges custom para sync status',
      ],
    },
    expected_tier: 'custom',
    edge_case_category: 'Build single sub-feature',
  },
];

// ────────────────────────────────────────────────────────────────────────
// Day-2 action fixtures — the 4 deterministic cells of the action matrix.
// Copied from scr-classifier-fixtures.md §Day-2 action matrix fixtures.
// ────────────────────────────────────────────────────────────────────────

const day2ActionFixtures: Day2ActionFixture[] = [
  {
    number: 1,
    title: 'New page, no SCR → nueva',
    input: { exists_in_code: false, has_scr: false },
    expected_action: 'nueva',
    matrix_cell: 'code:no × scr:no',
  },
  {
    number: 2,
    title: 'New page, covering SCR exists (stale/orphan) → nueva',
    input: { exists_in_code: false, has_scr: true },
    expected_action: 'nueva',
    matrix_cell: 'code:no × scr:yes',
  },
  {
    number: 3,
    title: 'Exists in code + has SCR → regenerar',
    input: { exists_in_code: true, has_scr: true },
    expected_action: 'regenerar',
    matrix_cell: 'code:yes × scr:yes',
  },
  {
    number: 4,
    title: 'Exists in code, no SCR → backfill',
    input: { exists_in_code: true, has_scr: false },
    expected_action: 'backfill',
    matrix_cell: 'code:yes × scr:no',
  },
];

// ────────────────────────────────────────────────────────────────────────
// Test harness
// ────────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('\n🧪  SCR Classifier Fixtures\n');

  let passed = 0;
  let failed = 0;

  for (const fixture of fixtures) {
    const actual = classifyTier(fixture.input);
    const ok = actual === fixture.expected_tier;

    if (ok) {
      console.log(
        `  ✅  Fixture ${fixture.number} — ${fixture.title}\n      → ${actual} (expected ${fixture.expected_tier})`
      );
      passed++;
    } else {
      console.log(
        `  ❌  Fixture ${fixture.number} — ${fixture.title}\n      → got ${actual}, expected ${fixture.expected_tier}\n      [${fixture.edge_case_category}]`
      );
      failed++;
    }
  }

  console.log('\n🧪  Day-2 Action Matrix Fixtures (deterministic cells)\n');

  for (const fixture of day2ActionFixtures) {
    const actual = classifyDay2Action(fixture.input);
    const ok = actual === fixture.expected_action;

    if (ok) {
      console.log(
        `  ✅  Day-2 Fixture ${fixture.number} — ${fixture.title}\n      → ${actual} (${fixture.matrix_cell})`
      );
      passed++;
    } else {
      console.log(
        `  ❌  Day-2 Fixture ${fixture.number} — ${fixture.title}\n      → got ${actual}, expected ${fixture.expected_action}\n      [${fixture.matrix_cell}]`
      );
      failed++;
    }
  }

  const total = fixtures.length + day2ActionFixtures.length;
  console.log(`\n${passed}/${total} passed${failed > 0 ? ` · ${failed} failed` : ''}\n`);

  if (failed > 0) {
    console.log(
      'Review tier rules in `.claude/skills/tk-design/methodology/screen-contract-shape.md §Tier election rule`'
    );
    console.log(
      'Review day-2 action matrix in `.claude/skills/tk-design/methodology/day2-classification.md §Action matrix`'
    );
    console.log(
      'Fixture details in `.claude/skills/tk-design/methodology/scr-classifier-fixtures.md`'
    );
    process.exit(1);
  }

  process.exit(0);
}

main();

// Makes this file a MODULE. Without a static import or export TypeScript treats it as a script,
// so every symbol it declares — `main` included — lands in the GLOBAL scope and collides with the
// same name in any other non-module file. The symptom is a `tsc` error in a file that has nothing
// to do with the one being edited, which is a bad way to spend an afternoon. Changes nothing at
// runtime: there is no import to resolve.
export {};
