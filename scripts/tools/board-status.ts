import fs from 'fs';
import glob from 'fast-glob';

/**
 * Board Status Script — compact, mobile-friendly backlog view.
 *
 * Usage:
 *   pnpm board:status                         # v6.0 (default)
 *   pnpm board:status --milestone v5.5
 *   pnpm board:status --epic EPIC-AGENTS-RESHAPE
 *   pnpm board:status --priority P1
 *   pnpm board:status --limit 12
 */

const BACKLOG_DIR = 'project/backlog';
const DEFAULT_MILESTONE = 'v6.0';
const DEFAULT_LIMIT = 8;

type Status = 'todo' | 'in-progress' | 'done' | 'wont-do' | 'postponed';

interface Issue {
  id: string;
  title: string;
  status: Status;
  priority: string;
  priorityRank: number;
  sp: number;
  epic?: string;
}

function parseStatus(content: string): Status {
  // wont-do must win over done: a "❌ Won't Do … **Completed:** <date>" line
  // also matches the done regex via "Completed".
  if (content.match(/[>-] \*\*(Status|Estado):\*\*.*(Won't Do|Wont Do|Cancelled|Cancelado|❌)/i))
    return 'wont-do';
  if (content.match(/[>-] \*\*(Status|Estado):\*\*.*(✅|Completed|Completado|Done)/i))
    return 'done';
  if (content.match(/[>-] \*\*(Status|Estado):\*\*.*(In Progress|En Progreso|🚧|Working)/i))
    return 'in-progress';
  if (
    content.match(/[>-] \*\*(Status|Estado):\*\*.*(Postponed|Pospuesto|Deferred|Diferido|⏸️|🅿️)/i)
  )
    return 'postponed';
  return 'todo';
}

function parsePriority(content: string): string {
  const m = content.match(/[>-] \*\*(Priority|Prioridad):\*\* (.*)/i);
  return m ? m[2].trim() : '';
}

function priorityRank(p: string): number {
  const m = p.match(/P(\d)/);
  return m ? parseInt(m[1], 10) : 99;
}

function parseStoryPoints(content: string): number {
  const m = content.match(/[>-] \*\*(Story Points|SP):\*\* (\d+)/i);
  if (!m) return 0;
  const v = parseInt(m[2], 10);
  return isNaN(v) ? 0 : v;
}

function parseEpic(content: string): string | undefined {
  const m = content.match(/[>-] \*\*Epic:\*\* \[?([A-Z][\w-]+)/);
  return m ? m[1] : undefined;
}

function parseTitle(content: string): { id: string; short: string } {
  const h1 = content.match(/^# ([\w-]+): (.*)$/m);
  if (!h1) return { id: '?', short: 'sin título' };
  const metaId = content.match(/[>-] \*\*Issue ID:\*\* ([\w-]+)/i);
  const id = metaId ? metaId[1] : h1[1];
  return { id, short: h1[2].replace(/`/g, '').slice(0, 60) };
}

function parseArgs(argv: string[]): {
  milestone: string;
  epic?: string;
  priority?: string;
  limit: number;
} {
  const out = { milestone: DEFAULT_MILESTONE, limit: DEFAULT_LIMIT } as {
    milestone: string;
    epic?: string;
    priority?: string;
    limit: number;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--milestone' && argv[i + 1]) out.milestone = argv[++i];
    else if (a === '--epic' && argv[i + 1]) out.epic = argv[++i];
    else if (a === '--priority' && argv[i + 1]) out.priority = argv[++i];
    else if (a === '--limit' && argv[i + 1]) out.limit = parseInt(argv[++i], 10) || DEFAULT_LIMIT;
  }
  return out;
}

function statusIcon(s: Status): string {
  return { todo: '📋', 'in-progress': '🚧', done: '✅', 'wont-do': '❌', postponed: '🅿️' }[s];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pattern = `${BACKLOG_DIR}/${args.milestone}/issues/*.md`;
  const files = await glob(pattern);

  if (files.length === 0) {
    console.log(`no issues found under ${pattern}`);
    process.exit(0);
  }

  const issues: Issue[] = files.map((file) => {
    const content = fs.readFileSync(file, 'utf-8');
    const { id, short } = parseTitle(content);
    const priority = parsePriority(content);
    return {
      id,
      title: short,
      status: parseStatus(content),
      priority,
      priorityRank: priorityRank(priority),
      sp: parseStoryPoints(content),
      epic: parseEpic(content),
    };
  });

  const filtered = issues.filter((i) => {
    if (args.epic && i.epic !== args.epic) return false;
    if (args.priority && !i.priority.includes(args.priority)) return false;
    return true;
  });

  const total = filtered.length;
  const done = filtered.filter((i) => i.status === 'done').length;
  const wontDo = filtered.filter((i) => i.status === 'wont-do').length;
  const inProg = filtered.filter((i) => i.status === 'in-progress').length;
  const parked = filtered.filter((i) => i.status === 'postponed').length;
  const todo = filtered.filter((i) => i.status === 'todo').length;
  const totalSP = filtered.reduce((s, i) => s + i.sp, 0);
  const pct = total === 0 ? 0 : Math.round(((done + wontDo) / total) * 100);

  const header =
    `📊 ${args.milestone}` +
    (args.epic ? ` · ${args.epic}` : '') +
    (args.priority ? ` · ${args.priority}` : '') +
    ` — ${pct}% (${done}/${total}) — ${totalSP} SP`;
  console.log(header);
  console.log('─'.repeat(Math.min(header.length, 60)));

  // Per-epic breakdown
  const byEpic = new Map<string, Issue[]>();
  for (const i of filtered) {
    const key = i.epic ?? 'sin epic';
    if (!byEpic.has(key)) byEpic.set(key, []);
    byEpic.get(key)!.push(i);
  }
  const sortedEpics = [...byEpic.entries()].sort((a, b) => b[1].length - a[1].length);

  console.log('\nepics:');
  for (const [epic, items] of sortedEpics) {
    const d = items.filter((i) => i.status === 'done').length;
    const p = items.filter((i) => i.status === 'postponed').length;
    const t = items.filter((i) => i.status === 'todo').length;
    const w = items.filter((i) => i.status === 'wont-do').length;
    const ip = items.filter((i) => i.status === 'in-progress').length;
    const parts: string[] = [];
    if (d) parts.push(`${d} ✅`);
    if (ip) parts.push(`${ip} 🚧`);
    if (t) parts.push(`${t} 📋`);
    if (p) parts.push(`${p} 🅿️`);
    if (w) parts.push(`${w} ❌`);
    console.log(`  ${epic} — ${parts.join(' / ')}`);
  }

  // Top pendientes
  const pending = filtered
    .filter((i) => i.status === 'todo' || i.status === 'in-progress')
    .sort((a, b) => {
      if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
      return a.id.localeCompare(b.id);
    })
    .slice(0, args.limit);

  if (pending.length > 0) {
    console.log(`\ntop pendientes (${pending.length}/${todo + inProg}):`);
    for (const i of pending) {
      const pri = i.priority || '—';
      console.log(`  ${statusIcon(i.status)} ${i.id} (${pri}) — ${i.title}`);
    }
  }

  if (parked > 0) {
    console.log(`\n🅿️  parked: ${parked}`);
  }
}

main().catch((err) => {
  console.error('board:status failed:', err);
  process.exit(1);
});
