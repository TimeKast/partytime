/**
 * The omission channel shared by the `project/reference` generators.
 *
 * Every generator in this family parses TypeScript with regexes, so every one of them
 * can fail to read a declaration it was supposed to catalog. The failure mode that
 * matters is not the miss — it is the SILENCE: a document that renders complete while
 * something is missing from it is worse than one that renders with a hole, because a
 * reader (human or agent) has no way to tell the two apart.
 *
 * This module is the channel that turns a miss into a visible hole. It ships the two
 * halves the contract needs:
 *
 *   - `skipEntry`   — one line for the aggregated list a reader scans at the top.
 *   - `skipComment` — the marker planted AT the place the thing would have been.
 *
 * Both halves are needed. The list alone tells you the count; the marker alone is easy
 * to miss. Together they answer "is anything missing?" and "what, and where?".
 *
 * Extracted from `generate-schema.ts`, where the pair was born and is still re-exported
 * from, so its suite keeps importing them unchanged.
 */

/** The two emitters of one generator's omission channel. */
export interface SkipChannel {
  /** One line of the aggregated `skips` list for a declaration that could not be read. */
  skipEntry: (name: string, file: string, reason: string) => string;
  /** The visible `<!-- parse-skip: … -->` marker that goes into the generated body. */
  skipComment: (name: string, file: string, reason: string) => string;
}

/**
 * Neutralise an HTML comment terminator coming from an uncaptured input.
 *
 * `file` is the ONE argument that does not come from a closed regex capture — it comes
 * from `readdirSync`, and `>` is a legal character in a POSIX filename, so `evil-->y.ts`
 * would close the comment early and turn the rest into rendered Markdown inside a
 * document agents read as the truth of the codebase. Neutralising the terminator costs
 * one line and removes the only input that could do it.
 *
 * Exported so the guarantee can be asserted directly, not only through a caller.
 */
export function neutraliseCommentTerminator(text: string): string {
  return text.replace(/--+>/g, '-->'.replace('>', '&gt;'));
}

/**
 * Build the omission channel for ONE generator.
 *
 * A factory rather than two free functions because the marker has to name the script a
 * reader should go fix, and that differs per generator. The returned emitters keep the
 * three-argument shape the original pair had, so a caller that already used them needs
 * no change.
 *
 * @param generatorScript  Filename of the generator, named in the marker so a reader
 *                         knows which script to send back (e.g. `generate-hooks.ts`).
 * @param missingNoun      What is missing, in es-MX, for the marker's second sentence
 *                         (e.g. `'Esta tabla'`, `'Esta dependencia'`).
 */
export function createSkipChannel(generatorScript: string, missingNoun: string): SkipChannel {
  return {
    skipEntry(name: string, file: string, reason: string): string {
      return `declaración \`${name}\` (${file}) — ${reason}`;
    },

    skipComment(name: string, file: string, reason: string): string {
      // BOTH are neutralised, not just `file`. In `generate-schema` the name always came
      // from a closed `[A-Za-z_][\w]*` capture, so escaping it would have been a no-op.
      // Generators that report an UNPARSEABLE line have no such capture to lean on — the
      // name they pass is a raw snippet of that line. Escaping here keeps the guarantee a
      // property of the channel instead of a property of each caller's regex.
      const safeName = neutraliseCommentTerminator(name);
      const safeFile = neutraliseCommentTerminator(file);
      return (
        `<!-- parse-skip: declaración \`${safeName}\` en ${safeFile} — ${reason}. ` +
        `${missingNoun} falta abajo; revisa ${generatorScript} o avisa al equipo del kit. -->\n\n`
      );
    },
  };
}

/**
 * The header note every generated document carries, so a reader who meets a marker
 * knows what it means without having to find this module.
 */
export function docHeaderNote(generatorScript: string): string {
  return (
    '> ℹ️ **¿Ves un bloque `parse-skip`?** El generador no pudo leer una parte del código; ' +
    `esa parte falta en este archivo. Pídele a Claude/Codex que revise ` +
    `\`scripts/tools/${generatorScript}\`, o avisa al equipo del kit.`
  );
}
