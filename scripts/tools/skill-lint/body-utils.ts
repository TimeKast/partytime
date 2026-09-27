/**
 * Helpers for extracting content regions from a skill body.
 *
 * Many checks need to operate on the prose *outside* of fenced code blocks, or
 * specifically *inside* them. Centralizing the split here keeps the checks
 * simple and consistent.
 */

export interface CodeBlock {
  lang: string;
  content: string;
  startLine: number;
}

export function extractCodeBlocks(body: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const lines = body.split('\n');
  let inBlock = false;
  let lang = '';
  let buf: string[] = [];
  let start = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^```([a-zA-Z0-9_-]*)/);
    if (!inBlock && fenceMatch) {
      inBlock = true;
      lang = fenceMatch[1];
      buf = [];
      start = i + 1;
      continue;
    }
    if (inBlock && line.trim().startsWith('```')) {
      blocks.push({ lang, content: buf.join('\n'), startLine: start });
      inBlock = false;
      continue;
    }
    if (inBlock) buf.push(line);
  }

  return blocks;
}

/**
 * Return body with fenced code blocks replaced by blank lines, preserving
 * overall line numbering. Used when a check should ignore code examples.
 *
 * Recognizes both top-level fences (^```) and indented fences
 * (whitespace-prefixed, common in nested list items).
 */
export function stripCodeBlocks(body: string): string {
  const lines = body.split('\n');
  const out: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    if (line.match(/^\s*```/)) {
      inBlock = !inBlock;
      out.push('');
      continue;
    }
    out.push(inBlock ? '' : line);
  }
  return out.join('\n');
}

/**
 * Extract inline backtick runs `foo` → array of {text, line} (1-indexed).
 * Multi-backtick runs (``foo``) are not handled — skill corpus uses singles.
 */
export function extractInlineCode(body: string): Array<{ text: string; line: number }> {
  const out: Array<{ text: string; line: number }> = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const re = /`([^`\n]+)`/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      out.push({ text: m[1], line: i + 1 });
    }
  }
  return out;
}

/**
 * Return body with inline backtick runs `foo` replaced by blank-equivalent
 * content (preserving line count and column offsets). Used by checks that
 * treat inline code as data (paths, tokens), not as prose references.
 *
 * Complements stripCodeBlocks(), which only handles fenced triple-backtick.
 */
export function stripInlineCode(body: string): string {
  return body.replace(/`[^`\n]+`/g, (match) => ' '.repeat(match.length));
}
