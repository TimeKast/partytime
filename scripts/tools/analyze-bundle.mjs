#!/usr/bin/env node

/**
 * Bundle Size Analyzer
 *
 * Reads the .next build output and reports chunk sizes.
 * Run: pnpm analyze (builds first, then reports)
 *
 * Output is text-based so it can be consumed by automation (e.g. /preflight).
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { join, basename } from 'path';

const NEXT_DIR = join(process.cwd(), '.next');
const CHUNKS_DIR = join(NEXT_DIR, 'static', 'chunks');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFilesRecursive(dir, ext = '.js') {
  const results = [];
  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getFilesRecursive(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push({ path: fullPath, name: entry.name, size: statSync(fullPath).size });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

function analyze() {
  if (!existsSync(CHUNKS_DIR)) {
    console.error('❌ No .next/static/chunks/ found. Run "pnpm build" first.');
    process.exit(1);
  }

  const files = getFilesRecursive(CHUNKS_DIR);
  if (files.length === 0) {
    console.error('❌ No JS chunks found.');
    process.exit(1);
  }

  // Sort by size descending
  files.sort((a, b) => b.size - a.size);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const top10 = files.slice(0, 10);
  const over500K = files.filter((f) => f.size > 500 * 1024);
  const over100K = files.filter((f) => f.size > 100 * 1024);

  // Report
  console.log('');
  console.log('📦 Bundle Size Analysis');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Total chunks: ${files.length} files`);
  console.log(`  Total size:   ${formatBytes(totalSize)}`);
  console.log(`  Chunks > 100KB: ${over100K.length}`);
  console.log(`  Chunks > 500KB: ${over500K.length}`);
  console.log('');

  // Top 10
  console.log('🏆 Top 10 Largest Chunks');
  console.log('───────────────────────────────────────────────');
  for (const f of top10) {
    const name = basename(f.path);
    const bar = '█'.repeat(Math.ceil((f.size / top10[0].size) * 30));
    console.log(`  ${formatBytes(f.size).padStart(10)}  ${bar}  ${name}`);
  }
  console.log('');

  // Warnings
  if (over500K.length > 0) {
    console.log('⚠️  Chunks > 500KB (review recommended):');
    for (const f of over500K) {
      console.log(`  - ${basename(f.path)} (${formatBytes(f.size)})`);
    }
    console.log('');
  }

  // Verdict
  if (over500K.length === 0) {
    console.log('✅ PASS — No oversized chunks detected');
  } else if (over500K.length <= 2) {
    console.log('🟡 WARN — Some large chunks, review for optimization');
  } else {
    console.log('🔴 FAIL — Multiple oversized chunks');
  }
  console.log('');
}

analyze();
