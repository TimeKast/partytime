import { format, resolveConfig } from 'prettier';

/**
 * Run generated markdown through Prettier, resolving the repo's own `.prettierrc`.
 *
 * WHY THE GENERATORS DELEGATE INSTEAD OF MATCHING PRETTIER BY HAND. The five
 * `project/reference/*.md` files are written by a generator and staged by the pre-commit hook
 * raw — `lint-staged` sees the files that were staged BEFORE the hook regenerated them, so
 * nothing on either path formats the output. The result failed `prettier --check` in the kit
 * itself and, worse, in every derivative: the files travel to `main` and into the tarball, so a
 * project that ran `pnpm format:check` failed on kit-owned files it cannot fix (an edit is
 * overwritten by the next regeneration, and the file is not the developer's to own).
 *
 * Two details no hand-rolled padding tracked, and the reason keeping a second formatter in sync
 * with Prettier's algorithm is the thing we do NOT want to own (`CODING.md §2`): Prettier counts
 * an emoji as TWO columns, and it writes spaced separators (`| --- |`).
 *
 * The config is RESOLVED rather than defaulted because `printWidth` is what decides whether a
 * table stays aligned or collapses to its compact form — defaults would produce output that
 * `prettier --check` rejects on the very file this just formatted.
 *
 * `BND-006` made `update-board.ts` do exactly this for `BOARD.md`; this is that fix generalized
 * to the generators that were left out.
 *
 * @param markdown - the generated document, as the generator assembled it
 * @param filepath - the file it will be written to; Prettier resolves the config relative to it
 */
export async function formatGeneratedMarkdown(markdown: string, filepath: string): Promise<string> {
  const config = await resolveConfig(filepath);
  return format(markdown, { ...config, filepath, parser: 'markdown' });
}
