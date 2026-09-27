# 📦 INVENTORY

> **Auto-generated** — Run `pnpm generate:inventory` to update
> **Regla:** SIEMPRE consultar antes de crear algo nuevo.

> ℹ️ **¿Ves un bloque `parse-skip`?** El generador no pudo leer una parte del código; esa parte falta en este archivo. Pídele a Claude/Codex que revise `scripts/tools/generate-inventory.ts`, o avisa al equipo del kit.

---

## 📚 Dependencies

| Package                   | Version |
| ------------------------- | ------- |
| @neondatabase/serverless  | 1.1.0   |
| @types/bcryptjs           | 2.4.6   |
| @vercel/blob              | 2.8.0   |
| @vercel/functions         | 2.2.13  |
| bcryptjs                  | 2.4.3   |
| drizzle-orm               | 0.45.3  |
| firebase-admin            | 12.7.0  |
| framer-motion             | 11.18.2 |
| image-size                | 2.0.4   |
| jspdf                     | 3.0.4   |
| jspdf-autotable           | 5.0.8   |
| next                      | 14.2.35 |
| react                     | 18.3.1  |
| react-dom                 | 18.3.1  |
| react-international-phone | 4.8.0   |
| resend                    | 6.30.0  |
| sharp                     | 0.34.5  |
| stripe                    | 22.6.2  |
| xlsx                      | 0.18.5  |

---

## 🛠️ NPM Scripts

| Command                           | Script                                               |
| --------------------------------- | ---------------------------------------------------- |
| `pnpm dev`                        | `next dev`                                           |
| `pnpm build`                      | `node scripts/tools/with-vault.mjs next build`       |
| `pnpm start`                      | `node scripts/tools/with-vault.mjs next start`       |
| `pnpm lint`                       | `next lint`                                          |
| `pnpm test`                       | `vitest run`                                         |
| `pnpm verify:db`                  | `node --import tsx scripts/verify-db-contract.ts`    |
| `pnpm rehearse:rsvp-invitation`   | `node --import tsx scripts/rehearse-rsvp-invitat...` |
| `pnpm test:db:capacity-semantics` | `bash scripts/test-capacity-function-semantics.sh`   |
| `pnpm db:preflight`               | `node --import tsx scripts/migration-preflight.ts`   |
| `pnpm db:generate`                | `node scripts/tools/with-vault.mjs drizzle-kit g...` |
| `pnpm db:studio`                  | `node scripts/tools/with-vault.mjs drizzle-kit s...` |
| `pnpm factory:update`             | `npx @timekast/factory update`                       |
| `pnpm factory:doctor`             | `npx @timekast/factory doctor`                       |
| `pnpm factory:status`             | `npx @timekast/factory status`                       |
| `pnpm factory:publish`            | `npx @timekast/factory publish`                      |
| `pnpm factory:unpublish`          | `npx @timekast/factory unpublish`                    |
| `pnpm env:push`                   | `npx @timekast/factory env push`                     |
| `pnpm preflight`                  | `tsx scripts/tools/preflight.ts`                     |
| `pnpm invite:admin`               | `npx @timekast/factory invite-admin`                 |
| `pnpm setup:e2e:vars`             | `node scripts/tools/with-vault.mjs --vault-env=d...` |
| `pnpm e2e:setup`                  | `playwright install chromium`                        |
| `pnpm evidence:visual`            | `pnpm test:e2e --project=evidence`                   |
| `pnpm generate:inventory`         | `tsx scripts/tools/generate-inventory.ts`            |
| `pnpm generate:codebase`          | `tsx scripts/tools/generate-codebase.ts`             |
| `pnpm generate:hooks`             | `tsx scripts/tools/generate-hooks.ts`                |
| `pnpm generate:schema`            | `tsx scripts/tools/generate-schema.ts`               |
| `pnpm generate:api`               | `tsx scripts/tools/generate-api.ts`                  |
| `pnpm generate:reference`         | `tsx scripts/tools/generate-inventory.ts && tsx ...` |
| `pnpm verify`                     | `node scripts/tools/verify.mjs`                      |
| `pnpm verify:quick`               | `node scripts/tools/verify.mjs --quick`              |
| `pnpm dev:next`                   | `NODE_OPTIONS='--max-old-space-size=4096' next d...` |
| `pnpm typecheck`                  | `tsc --noEmit`                                       |
| `pnpm prepare`                    | `husky && git config --unset-all core.hooksPath ...` |
| `pnpm skill:lint`                 | `tsx scripts/tools/skill-lint/index.ts`              |
| `pnpm update-board`               | `tsx scripts/tools/update-board.ts`                  |
| `pnpm knip`                       | `knip`                                               |

---

## 📊 Summary

| Metric             | Value  |
| ------------------ | ------ |
| Dependencies       | 19     |
| NPM Scripts        | 36     |
| Page Routes        | 0      |
| API Routes         | 0      |
| Components & Utils | 0      |
| **Total items**    | **55** |
| Parse-skips        | 0      |

---

_Generated by `scripts/tools/generate-inventory.ts`_
