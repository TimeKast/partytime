#!/usr/bin/env node
/**
 * Development Server Starter
 *
 * Features:
 * 1. Auto-kill port if blocked (supports macOS, Linux, Windows)
 * 2. Always start on configured port (OAuth/redirects work consistently)
 *
 * Port is read from package.json `ports.dev` (default: 3000).
 *
 * This solves:
 * - Port blocked after crashed dev server
 * - OAuth callbacks breaking when forced to use different port
 * - Manual `killall node` commands
 *
 * Usage: pnpm dev
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { platform } from 'os';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const execAsync = promisify(exec);

// Read port from package.json (SSOT)
const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf-8'));
const PORT = pkg.ports?.dev ?? 3000;

/**
 * Kill process using specified port
 * Cross-platform: macOS, Linux, Windows
 */
async function killPort(port) {
  const isWindows = platform() === 'win32';

  try {
    if (isWindows) {
      // Windows: Use netstat + taskkill
      const { stdout } = await execAsync(`netstat -ano | findstr :${port} | findstr LISTENING`);

      const lines = stdout.trim().split('\n');
      const pid = lines[0]?.trim().split(/\s+/).pop();

      if (pid) {
        console.log(`🔧 Puerto ${port} ocupado (PID: ${pid}), liberando...`);
        await execAsync(`taskkill /F /PID ${pid}`);
        console.log(`✅ Puerto ${port} liberado`);
        // Wait for port to fully release
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } else {
      // macOS/Linux: Use lsof
      const { stdout } = await execAsync(`lsof -ti:${port}`);
      const pid = stdout.trim();

      if (pid) {
        console.log(`🔧 Puerto ${port} ocupado (PID: ${pid}), liberando...`);
        await execAsync(`kill -9 ${pid}`);
        console.log(`✅ Puerto ${port} liberado`);
        // Wait for port to fully release
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  } catch {
    // Port is free (lsof/netstat found nothing)
    // This is expected and not an error
  }
}

/**
 * Patterns to silence in dev server output. Routes here fire on a fixed
 * cadence (notification polling, health pings) and flood the terminal,
 * making real errors hard to spot. Override with `DEV_VERBOSE=1`.
 */
const SILENT_PATTERNS = [
  /\bGET \/api\/notifications\/poll\b/,
  /\bGET \/serwist\/[^\s]+\b/,
  /\bGET \/sw\.js\b/,
];

const isSilent = (line) =>
  process.env.DEV_VERBOSE !== '1' && SILENT_PATTERNS.some((re) => re.test(line));

/**
 * Pipe a child stream to a destination, dropping lines that match the
 * silence patterns. Buffers across chunk boundaries so a noisy line
 * split across two reads still gets filtered.
 */
function filterStream(source, dest) {
  let buffer = '';
  source.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!isSilent(line)) dest.write(line + '\n');
    }
  });
  source.on('end', () => {
    if (buffer && !isSilent(buffer)) dest.write(buffer);
  });
}

/**
 * Start Next.js development server
 */
async function startDev() {
  // Kill any process using the dev port
  await killPort(PORT);

  console.log(`🚀 Iniciando Next.js en http://localhost:${PORT}\n`);

  // Start Next.js
  // Use spawn instead of exec to stream output in real-time
  const { spawn } = await import('child_process');

  const child = spawn('pnpm', ['dev:next', '--port', String(PORT)], {
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
    env: {
      ...process.env,
      // Piping stdio kills TTY detection → Next.js / chalk drop ANSI
      // colors. FORCE_COLOR=1 restores them so we keep the green 200,
      // red errors, etc.
      FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
    },
  });

  filterStream(child.stdout, process.stdout);
  filterStream(child.stderr, process.stderr);

  child.on('error', (err) => {
    console.error(`Error al iniciar Next.js: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Next.js terminó con código: ${code}`);
    }
    process.exit(code || 0);
  });
}

// Run
startDev().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
