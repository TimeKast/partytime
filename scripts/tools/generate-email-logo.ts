#!/usr/bin/env tsx
/**
 * Email Logo Generator
 *
 * Reads the configured logo, optimizes it with sharp, and writes
 * src/lib/email/logo-data.ts as a committed base64 module.
 *
 * This ensures both Resend and SMTP providers can embed the logo inline
 * (CID attachment) without relying on the runtime filesystem — which is
 * unavailable in Vercel serverless lambdas.
 *
 * Usage:
 *   pnpm generate:email-logo
 *
 * Logo source priority:
 *   1. NEXT_PUBLIC_CLIENT_LOGO_DARK (local path under public/)
 *   2. Fallback: public/assets/timekast/timekast-logo-silver-full.png
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const OUTPUT_PATH = resolve('./src/lib/email/logo-data.ts');
const FALLBACK_LOGO = './public/assets/timekast/timekast-logo-silver-full.png';
const MAX_BASE64_BYTES = 80 * 1024; // 80 KB warn threshold

async function main() {
  // Load .env.local to pick up NEXT_PUBLIC_CLIENT_LOGO_DARK
  const dotenv = await import('dotenv');
  dotenv.config({ path: '.env.local' });

  const sharp = (await import('sharp')).default;

  // Resolve logo source path
  const customLogo = process.env.NEXT_PUBLIC_CLIENT_LOGO_DARK;
  let sourcePath: string;

  if (customLogo) {
    // Reject external URLs — EMAIL_LOGO_URL handles those
    if (customLogo.startsWith('http://') || customLogo.startsWith('https://')) {
      console.error(
        '❌ NEXT_PUBLIC_CLIENT_LOGO_DARK is an external URL. ' +
          'Use EMAIL_LOGO_URL for external logos. ' +
          'Set NEXT_PUBLIC_CLIENT_LOGO_DARK to a local path under public/ instead.'
      );
      process.exit(1);
    }
    // Resolve relative to public/ (env var contains public-relative path like /assets/...)
    const cleanPath = customLogo.startsWith('/') ? customLogo.slice(1) : customLogo;
    sourcePath = resolve(`./public/${cleanPath}`);
  } else {
    sourcePath = resolve(FALLBACK_LOGO);
  }

  if (!existsSync(sourcePath)) {
    console.error(`❌ Logo file not found: ${sourcePath}`);
    process.exit(1);
  }

  console.log(`📷  Processing: ${sourcePath}`);

  // Optimize with sharp
  const optimized = await sharp(sourcePath)
    .resize(600, undefined, { withoutEnlargement: true })
    .png({ palette: true })
    .toBuffer();

  const base64 = optimized.toString('base64');
  const byteSize = Buffer.byteLength(base64, 'utf8');

  if (byteSize > MAX_BASE64_BYTES) {
    console.warn(
      `⚠️  Generated base64 is ${Math.round(byteSize / 1024)} KB — ` +
        `consider optimizing the source PNG (threshold: 80 KB).`
    );
  }

  const content = [
    '// AUTO-GENERATED — do not edit manually. Run: pnpm generate:email-logo',
    `export const EMAIL_LOGO_BASE64 = "${base64}";`,
    `export const EMAIL_LOGO_FILENAME = "email-logo.png";`,
    `export const EMAIL_LOGO_CID = "logo";`,
    `export const EMAIL_LOGO_CONTENT_TYPE = "image/png";`,
    '',
  ].join('\n');

  // No-churn: skip write if content unchanged
  if (existsSync(OUTPUT_PATH)) {
    const existing = readFileSync(OUTPUT_PATH, 'utf8');
    if (existing === content) {
      console.log('✅  logo-data.ts unchanged — skipping write.');
      return;
    }
  }

  writeFileSync(OUTPUT_PATH, content, 'utf8');
  console.log(`✅  Written: ${OUTPUT_PATH} (${Math.round(byteSize / 1024)} KB base64)`);
}

main().catch((err) => {
  console.error('❌ generate-email-logo failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
