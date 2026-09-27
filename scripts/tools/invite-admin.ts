// ⚠️ Load env vars FIRST (before the @/lib imports that open the DB pool), so
// DATABASE_URL from .env.local is available when drizzle.ts evaluates. dotenv
// never overrides an already-set DATABASE_URL — the CLI sets it for `--target
// main`, and dotenv fills it (develop) only when unset. Mirrors src/lib/db/seed.ts.
//
// 🔴 EXCEPT in a repo with a `vault` block (read exactly as the wrapper and
// `db-query.ts` read it): there the CLI injected the whole environment of the
// target from the vault, and a leftover `.env.local` would fill every key the
// vault did not set with develop's values — even under `--target main`.
import dotenv from 'dotenv';

import { readVaultBlock } from './with-vault.mjs';

/**
 * Load `.env.local` unless the repo lives in the vault. Returns what it did.
 *
 * Fail-closed like the wrapper: a state file it cannot parse, or a `vault` block
 * with the wrong shape, THROWS (never read as "no vault"). Without a block the
 * behavior is the historical one.
 *
 * @param rootDir - The repo root (the script runs from it).
 * @param load - The loader (injectable for tests; default `dotenv.config`).
 */
export function loadEnvLocalUnlessVault(
  rootDir: string,
  load: () => void = () => {
    dotenv.config({ path: '.env.local' });
  }
): 'vault' | 'env-local' {
  if (readVaultBlock(rootDir) !== null) return 'vault';
  load();
  return 'env-local';
}

loadEnvLocalUnlessVault(process.cwd());

/**
 * Invite Admin — mint a single-use super_admin invite (no plaintext password).
 *
 * Replaces the old SUPER_ADMIN_* seed: instead of writing a password into env,
 * this creates an invite token with `metadata.role = 'super_admin'` and emails
 * the accept link. The recipient sets their own password at /accept-invite, so
 * no admin password ever lives in env or code, and a soft-deleted admin is
 * recovered by minting a fresh single-use invite (lifecycle by construction).
 *
 * Calls the invite + email LIBRARIES directly — NOT `POST /api/invites/send`,
 * which requires a super_admin session and would 403 here. This runs in a
 * trusted shell context (the CLI / a kit script) against the target DATABASE_URL.
 *
 * Run standalone (uses .env.local → develop branch; in a vault repo, run it
 * through the CLI, which injects the target's environment from the vault):
 *   tsx scripts/tools/invite-admin.ts --email=you@example.com
 *
 * Or via the CLI, which resolves the target branch's DATABASE_URL:
 *   pnpm invite:admin --email=you@example.com [--target develop|main]
 */
import { createInviteToken } from '@/lib/invites';
import { sendEmail, inviteUserEmail, inviteUserEmailText } from '@/lib/email';
import { getAppUrl, isEmailConfigured } from '@/lib/env';

import { isMainModule } from './lib/is-main-module.mjs';

export interface InviteAdminResult {
  /** The /accept-invite URL the recipient opens to set their password. */
  acceptUrl: string;
  /** Whether the invite email was dispatched (false when email is unconfigured). */
  emailSent: boolean;
}

/**
 * Create a super_admin invite and, when email is configured, send it.
 *
 * Always returns the accept URL so a caller can surface it for manual use when
 * email is unconfigured (mirrors `POST /api/invites/send`'s fallback).
 *
 * @param email - Address that will receive the invite and become super_admin.
 */
export async function inviteAdmin(email: string): Promise<InviteAdminResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) {
    throw new Error(`Invalid email: "${email}"`);
  }

  // Stamp the role in metadata — the accept route reads `metadata.role` (behind
  // an `isValidRole` guard) to assign it on account creation.
  const { token } = await createInviteToken(normalized, undefined, {
    metadata: { role: 'super_admin' },
  });

  const acceptUrl = `${getAppUrl()}/accept-invite?token=${token}`;

  if (!isEmailConfigured()) {
    return { acceptUrl, emailSent: false };
  }

  const result = await sendEmail({
    to: normalized,
    subject: 'Tu acceso de administrador',
    html: inviteUserEmail({ url: acceptUrl }),
    text: inviteUserEmailText({ url: acceptUrl }),
  });

  return { acceptUrl, emailSent: result.success };
}

/** Read `--email=<addr>` (or the first positional) from argv. */
function parseEmail(argv: string[]): string | undefined {
  const flag = argv.find((arg) => arg.startsWith('--email='));
  if (flag) return flag.slice('--email='.length);
  return argv.find((arg) => !arg.startsWith('-'));
}

// Standalone execution guard (matches scripts/tools/setup-e2e.ts).
const isMain = isMainModule(import.meta.url, process.argv[1]);
if (isMain) {
  const email = parseEmail(process.argv.slice(2));
  if (!email) {
    console.error('Uso: tsx scripts/tools/invite-admin.ts --email=you@example.com');
    process.exit(1);
  }
  inviteAdmin(email)
    .then(({ acceptUrl, emailSent }) => {
      if (emailSent) {
        console.log(`✅ Invitación de super_admin enviada a ${email}`);
      } else {
        console.log('ℹ️  Email no configurado. Abre este enlace para crear tu cuenta:');
        console.log(`   ${acceptUrl}`);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ invite-admin falló:', error);
      process.exit(1);
    });
}
