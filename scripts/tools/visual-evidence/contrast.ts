/**
 * Visual evidence — contrast, measured over the LIVE DOM of each capture.
 *
 * Not a static rule and not a token audit: a token audit answers "did somebody hardcode a
 * colour", which `ui-critic` already does by reading code. This answers a different question
 * that reading code cannot — what the text/background pairs ACTUALLY resolve to once the skin,
 * the theme, the ancestors' backgrounds and every `color-mix` have had their say.
 *
 * SPLIT ON PURPOSE, AND THE SPLIT IS WHAT MAKES IT TESTABLE:
 *   · `collectContrastSamplesInPage` runs INSIDE the browser and only harvests raw values
 *     (computed colour, the stack of background layers above it, font size/weight). Self-contained,
 *     like every `*InPage` here — Playwright serializes it (`./theme`).
 *   · everything else runs in Node and is pure arithmetic, so the maths is asserted by unit
 *     tests instead of being trusted because a screenshot looked fine.
 *
 * 🔴 THE NOTATION THAT ARRIVES IS NOT THE NOTATION THAT WAS AUTHORED, AND THAT COST A WHOLE RUN.
 * The kit's skins author every token in `oklch()`, so a parser taught `rgb()` plus `oklch()` looks
 * complete — and the first real run measured NOTHING: 438 samples, 0 evaluated, every capture's
 * contrast column empty while the manifest read `pass: false` in a way nobody could act on. What
 * arrives is `lab()`: the production CSS pipeline (Lightning CSS, via Next/Tailwind) rewrites the
 * authored `oklch()` into CIE `lab()` on the way to the browser, and `getComputedStyle` serializes
 * what it was GIVEN, not what the source file said. A dev-server probe cannot catch this — there
 * the raw `oklch()` survives — which is why `visual-evidence-contrast.test.ts` pins the two
 * notations to the SAME rgb for real tokens instead of testing each in isolation.
 *
 * The parser therefore covers `rgb()`, hex, `oklch()`/`oklab()` AND `lab()`/`lch()`. Anything else
 * still returns null and is counted as NOT evaluated: a wrong ratio is worse than a missing one.
 *
 * 🔴 THE MEASUREMENT IS CLIPPED TO WHAT THE IMAGE SHOWS, AND THAT IS NOT AN OPTIMISATION. A capture
 * is the VISIBLE AREA of the screen (`./capture`, `page.screenshot` without `fullPage`), so a
 * measurement taken over the whole document would describe text no reader of that PNG can see —
 * and the manifest says of this field that it was measured "over the live DOM of this very
 * capture" (`./manifest`, `CaptureRecord.contrast`), a sentence that would stop being true. The
 * harvest therefore records each sample's viewport-relative RECT, and `clipSamplesToViewport`
 * drops what falls outside the photographed band. The split follows the same rule as the rest of
 * this module: the browser harvests raw facts, Node decides — so the geometry is asserted by unit
 * tests instead of trusted.
 */

import type { ContrastExemptions, ContrastFailure, ContrastSummary } from './manifest';

/**
 * A sample's box, VIEWPORT-RELATIVE, exactly as `getBoundingClientRect` hands it over.
 *
 * A plain object rather than the `DOMRect` itself: this crosses the browser/Node boundary through
 * Playwright's serialization, where a class instance is not the thing that arrives.
 */
export interface SampleRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** The photographed band: the size of the browser context's viewport, which is the PNG's size. */
export interface ViewportBox {
  width: number;
  height: number;
}

/**
 * Why a harvested text node is OUTSIDE the measurement — declared, never inferred.
 *
 * `aria-hidden` / `presentation`: the node (or an ancestor) is out of the accessibility layer by
 * the author's own declaration in the DOM. `excluded`: the project named it in
 * `EXCLUDED_CONTRAST_SELECTORS` (`tests/e2e/visual-evidence.surfaces.ts`). Three values so the
 * manifest can say WHICH declaration exempted what — an exemption the reader cannot see is a way
 * of lowering the threshold without saying so.
 */
export type ContrastExemption = 'aria-hidden' | 'presentation' | 'excluded';

/** One text node's colour situation, as harvested from the page. */
export interface ContrastSample {
  selector: string;
  /**
   * Set when the node is declared decorative (see `ContrastExemption`); absent otherwise. The
   * harvest RECORDS the declaration and Node DECIDES what it costs (`summarizeContrast` counts it
   * as `notApplicable` and never evaluates it) — same split as the rect and the clip.
   */
  exempt?: ContrastExemption;
  color: string;
  /**
   * The background LAYERS behind this text, nearest first: the element's own background, then
   * each ancestor's, ending at the document root. A stack rather than a single colour because
   * flattening every translucent panel over an assumed white is how a dark theme gets measured
   * as if it were light — evidence that is wrong in exactly the axis this harness exists for.
   * Which layer is opaque (and therefore where the stack stops mattering) is decided in Node,
   * by `resolveBackdrop`, since only Node can parse a colour.
   */
  backgrounds: string[];
  fontSizePx: number;
  fontWeight: number;
  text: string;
  /**
   * Where the text sits relative to the viewport — the fact `clipSamplesToViewport` decides on.
   * Harvested rather than judged in the page for the reason the header states: the browser
   * collects, Node decides, and only what Node decides can be unit-tested.
   */
  rect: SampleRect;
}

/** sRGB, gamma-encoded, 0-255 per channel, plus alpha 0-1. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** How many text nodes one capture samples before it stops. */
export const DEFAULT_MAX_SAMPLES = 400;

/** How many offenders the manifest keeps per capture — it is read by humans, not by a linter. */
export const DEFAULT_MAX_FAILURES = 10;

/** The DOM declarations that take a node out of the accessibility layer — and out of the measurement. */
export const ARIA_HIDDEN_SELECTOR = '[aria-hidden="true"]';
export const PRESENTATION_ROLE_SELECTOR = '[role="presentation"], [role="none"]';

/**
 * Harvest the colour pairs of every visible text node. BROWSER-SIDE: references nothing but its
 * own argument and the page's globals.
 *
 * 🔴 A NODE DECLARED DECORATIVE IS HARVESTED AND MARKED, NEVER DROPPED. The harvest used to take
 * every text node, so the initials of the kit's avatar — sitting beside the full name, carrying no
 * information a reader needs — were 108 of the 148 contrast failures of one real manifest, and the
 * 40 that mattered were buried under them. Marking the initials `aria-hidden` is the correct fix
 * (it also stops a screen reader announcing the name twice), and the harness kept counting them,
 * so the gate punished the right change. Now `aria-hidden`, `role="presentation"` / `"none"` on the
 * node or any ancestor, and the project's own `excludeSelector`, mark the sample `exempt`; Node
 * files it as `notApplicable` (`summarizeContrast`) — visible in the manifest, so `ui-critic` can
 * see how much text a screen declared out of scope, and not a silent drop that would make hiding
 * text and fixing it look the same.
 */
export function collectContrastSamplesInPage(arg: {
  maxSamples: number;
  /** The project's exclusions, joined into one selector list — or absent when it declared none. */
  excludeSelector?: string;
}): ContrastSample[] {
  const samples: ContrastSample[] = [];
  const root = document.body;
  if (!root) return samples;

  const describe = (element: Element): string => {
    const tag = element.tagName.toLowerCase();
    if (element.id) return `${tag}#${element.id}`;
    const className = typeof element.className === 'string' ? element.className.trim() : '';
    const first = className.split(/\s+/).filter(Boolean)[0];
    return first ? `${tag}.${first}` : tag;
  };

  // Validated ONCE, up front: a selector the browser cannot parse would otherwise throw from
  // inside the loop on the first text node, as a bare SyntaxError naming neither the export nor
  // the offending entry.
  if (arg.excludeSelector) {
    try {
      root.matches(arg.excludeSelector);
    } catch {
      throw new Error(
        `EXCLUDED_CONTRAST_SELECTORS contiene un selector CSS que el navegador no puede leer: ` +
          `'${arg.excludeSelector}'. Corrige la entrada en tests/e2e/visual-evidence.surfaces.ts.`
      );
    }
  }

  const exemptionOf = (element: Element): ContrastSample['exempt'] => {
    if (element.closest('[aria-hidden="true"]')) return 'aria-hidden';
    if (element.closest('[role="presentation"], [role="none"]')) return 'presentation';
    if (arg.excludeSelector && element.closest(arg.excludeSelector)) return 'excluded';
    return undefined;
  };

  const elements = root.querySelectorAll('*');
  for (let index = 0; index < elements.length; index += 1) {
    if (samples.length >= arg.maxSamples) break;
    const element = elements[index];

    let text = '';
    for (let child = 0; child < element.childNodes.length; child += 1) {
      const node = element.childNodes[child];
      if (node.nodeType === 3) text += node.nodeValue ?? '';
    }
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length === 0) continue;

    const box = element.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;

    const style = window.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) === 0) continue;

    const exempt = exemptionOf(element);

    // Every layer from the text's own element up to the root. The browser cannot decide where
    // the stack stops (it would have to parse alpha, and the parser lives in Node), so it hands
    // the whole thing over: `resolveBackdrop` walks it from the bottom opaque layer upward.
    const backgrounds: string[] = [];
    let ancestor: Element | null = element;
    while (ancestor) {
      const ancestorStyle: CSSStyleDeclaration =
        ancestor === element ? style : window.getComputedStyle(ancestor);
      const layer = ancestorStyle.backgroundColor;
      if (layer) backgrounds.push(layer);
      ancestor = ancestor.parentElement;
    }
    const canvas = window.getComputedStyle(document.documentElement).backgroundColor;
    if (canvas && backgrounds[backgrounds.length - 1] !== canvas) backgrounds.push(canvas);

    samples.push({
      selector: describe(element),
      ...(exempt ? { exempt } : {}),
      color: style.color,
      backgrounds,
      fontSizePx: parseFloat(style.fontSize) || 0,
      fontWeight: Number(style.fontWeight) || (style.fontWeight === 'bold' ? 700 : 400),
      text: text.slice(0, 80),
      rect: { top: box.top, left: box.left, width: box.width, height: box.height },
    });
  }

  return samples;
}

/**
 * Does this sample's box overlap the band the camera photographed?
 *
 * Intersection, never containment: a heading cut in half by the fold IS in the picture, and the
 * text a reader can see is the text this measurement is about. A box with no area is out by
 * definition — it cannot be in an image.
 *
 * The band is the browser context's viewport, which is exactly what `page.screenshot()` writes
 * once `fullPage` is off, and the harvest never scrolls — so the rect's own coordinate system
 * (viewport-relative) is already the image's.
 */
export function isRectVisible(rect: SampleRect, viewport: ViewportBox): boolean {
  if (rect.width < 1 || rect.height < 1) return false;
  const overlapsVertically = rect.top < viewport.height && rect.top + rect.height > 0;
  const overlapsHorizontally = rect.left < viewport.width && rect.left + rect.width > 0;
  return overlapsVertically && overlapsHorizontally;
}

/**
 * Keep only the samples the capture actually shows — the reconciliation between the image and
 * the number reported next to it.
 *
 * 🔴 IT NARROWS THE MEASUREMENT, IT MUST NEVER EMPTY IT. A capture that harvested text and clips
 * to zero samples writes a contrast column that proves nothing, and `samples: 0` is the one shape
 * the run's own guard does not catch (it fires on samples > 0 with nothing evaluated — see the
 * spec's assertions and `fx-visual-evidence §2.3`). That is why the geometry is an INTERSECTION
 * with the photographed band rather than any stricter rule: everything the reader of the PNG can
 * see stays in.
 */
export function clipSamplesToViewport(
  samples: readonly ContrastSample[],
  viewport: ViewportBox
): ContrastSample[] {
  return samples.filter((sample) => isRectVisible(sample.rect, viewport));
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Linear-light channel (0-1) → gamma-encoded 0-255. */
function encodeSrgb(channel: number): number {
  const linear = clamp01(channel);
  const encoded = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return Math.round(clamp01(encoded) * 255);
}

/**
 * OKLCH / OKLab → sRGB (Björn Ottosson's matrices). Out-of-gamut values are clamped per channel,
 * which is what a display does anyway and keeps the ratio finite.
 */
function oklabToRgb(L: number, a: number, b: number, alpha: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: encodeSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: encodeSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: encodeSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    a: alpha,
  };
}

/**
 * CIE Lab (D50, the white point CSS Color 4 gives `lab()`/`lch()`) → sRGB.
 *
 * NOT an exotic branch: this is the notation the BUILT stylesheet hands the browser for every
 * token this kit authors in `oklch()` (see the header). Three hops, all from CSS Color 4: Lab →
 * XYZ(D50) → XYZ(D65) via Bradford → linear sRGB. `visual-evidence-contrast.test.ts` pins the
 * result against `oklch()` for real skin tokens, so a transcription slip in any matrix below
 * fails a test instead of quietly moving every ratio.
 */
function labToRgb(L: number, a: number, b: number, alpha: number): Rgb {
  const kappa = 24389 / 27;
  const epsilon = 216 / 24389;

  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const x = fx ** 3 > epsilon ? fx ** 3 : (116 * fx - 16) / kappa;
  const y = L > kappa * epsilon ? fy ** 3 : L / kappa;
  const z = fz ** 3 > epsilon ? fz ** 3 : (116 * fz - 16) / kappa;

  // D50 white point, as CSS Color 4 states it.
  const X = x * (0.3457 / 0.3585);
  const Y = y;
  const Z = z * ((1 - 0.3457 - 0.3585) / 0.3585);

  // D50 → D65 (Bradford-adapted), then XYZ(D65) → linear sRGB.
  const x65 = 0.9554734527042182 * X - 0.023098536874261423 * Y + 0.0632593086610217 * Z;
  const y65 = -0.028369706963208136 * X + 1.0099954580058226 * Y + 0.021041398966943008 * Z;
  const z65 = 0.012314001688319899 * X - 0.020507696433477912 * Y + 1.3303659366080753 * Z;

  return {
    r: encodeSrgb(3.2409699419045226 * x65 - 1.537383177570094 * y65 - 0.4986107602930034 * z65),
    g: encodeSrgb(-0.9692436362808796 * x65 + 1.8759675015077202 * y65 + 0.04155505740717559 * z65),
    b: encodeSrgb(0.05563007969699366 * x65 - 0.20397695888897652 * y65 + 1.0569715142428786 * z65),
    a: alpha,
  };
}

function parseAlpha(raw: string | undefined): number {
  if (raw === undefined) return 1;
  const trimmed = raw.trim();
  if (trimmed.endsWith('%')) return clamp01(parseFloat(trimmed) / 100);
  const value = parseFloat(trimmed);
  return Number.isFinite(value) ? clamp01(value) : 1;
}

/**
 * Parse the colour notations a computed style can hand back: `rgb()` / `rgba()` (legacy and
 * space-separated), `#rgb` / `#rrggbb`, `oklch()` / `oklab()` and `lab()` / `lch()`.
 *
 * 🔴 `lab()` IS THE ONE THAT ACTUALLY ARRIVES from a production build of this kit (header), so
 * it is not a completeness flourish — dropping it empties the contrast column of every capture.
 * Anything else — `color(srgb …)`, a named colour, a gradient — returns `null` and is counted as
 * NOT evaluated rather than guessed at: a wrong ratio is worse than a missing one, and
 * `summarizeContrast` reports `evaluated` next to `samples` precisely so the gap is visible.
 */
export function parseCssColor(value: string | null | undefined): Rgb | null {
  if (!value) return null;
  const input = value.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(input);
  if (hex) {
    const digits = hex[1];
    const expand = (part: string): number => parseInt(part.length === 1 ? part + part : part, 16);
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: expand(digits[0]),
        g: expand(digits[1]),
        b: expand(digits[2]),
        a: digits.length === 4 ? expand(digits[3]) / 255 : 1,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: expand(digits.slice(0, 2)),
        g: expand(digits.slice(2, 4)),
        b: expand(digits.slice(4, 6)),
        a: digits.length === 8 ? expand(digits.slice(6, 8)) / 255 : 1,
      };
    }
    return null;
  }

  const fn = /^([a-z]+)\(([^)]*)\)$/.exec(input);
  if (!fn) return null;
  const name = fn[1];
  const [main, alphaPart] = fn[2].split('/');
  const parts = main
    .replace(/,/g, ' ')
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (name === 'rgb' || name === 'rgba') {
    if (parts.length < 3) return null;
    const channel = (raw: string): number =>
      raw.endsWith('%') ? (parseFloat(raw) / 100) * 255 : parseFloat(raw);
    const [r, g, b] = [channel(parts[0]), channel(parts[1]), channel(parts[2])];
    if (![r, g, b].every(Number.isFinite)) return null;
    return {
      r: Math.round(clamp01(r / 255) * 255),
      g: Math.round(clamp01(g / 255) * 255),
      b: Math.round(clamp01(b / 255) * 255),
      a: parseAlpha(alphaPart ?? parts[3]),
    };
  }

  if (name === 'lab' || name === 'lch') {
    if (parts.length < 3) return null;
    // L is 0-100 here (a `%` means the same number); a/b are ±125 at 100%, C is 150 at 100%.
    const lightness = parseFloat(parts[0]);
    const axis = (raw: string, full: number): number =>
      raw.endsWith('%') ? (parseFloat(raw) / 100) * full : parseFloat(raw);
    const second = axis(parts[1], name === 'lab' ? 125 : 150);
    const third = name === 'lab' ? axis(parts[2], 125) : parseFloat(parts[2]);
    if (![lightness, second, third].every(Number.isFinite)) return null;
    const alpha = parseAlpha(alphaPart ?? parts[3]);
    if (name === 'lab') return labToRgb(lightness, second, third, alpha);
    const angle = (third * Math.PI) / 180;
    return labToRgb(lightness, second * Math.cos(angle), second * Math.sin(angle), alpha);
  }

  if (name === 'oklch' || name === 'oklab') {
    if (parts.length < 3) return null;
    const lightness = parts[0].endsWith('%') ? parseFloat(parts[0]) / 100 : parseFloat(parts[0]);
    const second = parseFloat(parts[1]);
    const third = parseFloat(parts[2]);
    if (![lightness, second, third].every(Number.isFinite)) return null;
    const alpha = parseAlpha(alphaPart ?? parts[3]);
    if (name === 'oklab') return oklabToRgb(lightness, second, third, alpha);
    const hue = (third * Math.PI) / 180;
    return oklabToRgb(lightness, second * Math.cos(hue), second * Math.sin(hue), alpha);
  }

  return null;
}

/** Composite a translucent colour over an opaque backdrop (simple source-over). */
export function flattenOver(color: Rgb, backdrop: Rgb): Rgb {
  if (color.a >= 1) return { ...color, a: 1 };
  const mix = (top: number, bottom: number): number =>
    Math.round(top * color.a + bottom * (1 - color.a));
  return {
    r: mix(color.r, backdrop.r),
    g: mix(color.g, backdrop.g),
    b: mix(color.b, backdrop.b),
    a: 1,
  };
}

/** WCAG relative luminance of a gamma-encoded sRGB colour. */
export function relativeLuminance(color: Rgb): number {
  const linear = (channel: number): number => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
}

/** WCAG contrast ratio — always ≥ 1, order of the arguments is irrelevant. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * WCAG AA threshold for this text: 3.0 for large text (≥24 px, or ≥18.66 px when bold),
 * 4.5 for everything else.
 */
export function requiredRatio(fontSizePx: number, fontWeight: number): number {
  const isLarge = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
  return isLarge ? 3 : 4.5;
}

/**
 * Flatten the layer stack behind a text node into the single opaque colour it actually sits on.
 *
 * 🔴 THERE IS NO ASSUMED BACKDROP, AND THAT IS THE WHOLE POINT. Compositing every translucent
 * panel over white measures a dark theme as if it were light: the ratio comes back describing a
 * screen that does not exist, in the exact axis (multi-theme) this harness was built to prove.
 * So the walk starts at the deepest layer that is genuinely opaque and composites upward from
 * there; when no layer is opaque, or a layer between the text and that backdrop cannot be
 * parsed, it returns `null` and the sample goes UNEVALUATED. Refusing to answer is the honest
 * outcome — the same rule `parseCssColor` follows for a notation it does not know.
 */
export function resolveBackdrop(backgrounds: readonly string[]): Rgb | null {
  const layers = backgrounds.map((layer) => parseCssColor(layer));

  let base = -1;
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (layer && layer.a >= 1) {
      base = index;
      break;
    }
  }
  if (base < 0) return null;

  let backdrop: Rgb = { ...layers[base]!, a: 1 };
  for (let index = base - 1; index >= 0; index -= 1) {
    const layer = layers[index];
    if (!layer) return null;
    backdrop = flattenOver(layer, backdrop);
  }
  return backdrop;
}

/**
 * Turn raw samples into the summary the manifest carries. A sample whose colours cannot be
 * parsed — or whose backdrop cannot be resolved without guessing — is counted (`samples`) but
 * not evaluated (`evaluated`). The two numbers being different is itself information: a capture
 * where nothing evaluated is a capture whose contrast column proves nothing, and it says so
 * instead of reporting a cheerful `pass: true`.
 *
 * 🔴 A SAMPLE DECLARED DECORATIVE IS A THIRD ANSWER, NOT A PASS AND NOT A GAP. It is counted in
 * `notApplicable` (with its declaration in `exemptions`), left out of `samples`, and never
 * evaluated: WCAG does not require decorative text to be readable, so measuring it reports a
 * defect the standard does not recognise. But it is a DECLARATION the author made, not a fact the
 * harness verified — which is why it is reported next to the measured numbers rather than removed
 * from them. A screen that "cleans up" by exempting most of its text shows that in this field, and
 * `ui-critic` reads it.
 */
export function summarizeContrast(
  samples: readonly ContrastSample[],
  options: { maxFailures?: number } = {}
): ContrastSummary {
  const maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
  const failures: ContrastFailure[] = [];
  const exemptions: ContrastExemptions = { ariaHidden: 0, presentation: 0, excluded: 0 };
  let measurable = 0;
  let evaluated = 0;
  let failing = 0;
  let min: number | null = null;

  for (const sample of samples) {
    if (sample.exempt === 'aria-hidden') {
      exemptions.ariaHidden += 1;
      continue;
    }
    if (sample.exempt === 'presentation') {
      exemptions.presentation += 1;
      continue;
    }
    if (sample.exempt === 'excluded') {
      exemptions.excluded += 1;
      continue;
    }
    measurable += 1;

    const foreground = parseCssColor(sample.color);
    const background = resolveBackdrop(sample.backgrounds);
    if (!foreground || !background) continue;

    const ratio =
      Math.round(contrastRatio(flattenOver(foreground, background), background) * 100) / 100;
    evaluated += 1;
    if (min === null || ratio < min) min = ratio;

    const required = requiredRatio(sample.fontSizePx, sample.fontWeight);
    if (ratio < required) {
      failing += 1;
      if (failures.length < maxFailures) {
        failures.push({ selector: sample.selector, ratio, required, text: sample.text });
      }
    }
  }

  return {
    samples: measurable,
    evaluated,
    min,
    failing,
    failures,
    notApplicable: exemptions.ariaHidden + exemptions.presentation + exemptions.excluded,
    exemptions,
    pass: evaluated > 0 && failing === 0,
  };
}
