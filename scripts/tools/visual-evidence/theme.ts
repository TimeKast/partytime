/**
 * Visual evidence — forcing a theme, and PROVING it took before the shutter opens.
 *
 * Trap 2 of the four this harness canonizes, and the one that is most expensive to get wrong:
 * a capture taken right after triggering a theme change photographs the PREVIOUS theme. Nothing
 * about the image says so — the run is green, the manifest has three files per surface, and
 * "multi-theme coverage" is demonstrated in false. DS4 then passes on evidence that is wrong
 * rather than missing, which is worse than having no evidence at all.
 *
 * 🔴 THE `*InPage` FUNCTIONS RUN INSIDE THE BROWSER, so they are written self-contained: they
 * reference nothing but their own arguments and the page's globals. Playwright serializes the
 * function's source to `page.evaluate`, and a closure over module scope would arrive as
 * `x is not defined` at runtime. That constraint is what makes them unit-testable here too —
 * a jsdom document plus a stubbed `getComputedStyle` is a complete environment for them.
 *
 * The theme mechanism is `next-themes` with `attribute="class"` (`src/components/providers/Providers.tsx`):
 * the theme is a CLASS on `<html>` and the preference lives in `localStorage`. Which themes
 * exist is NOT hardcoded here — it comes from the active skin's registry (`src/config/skins.ts`,
 * `sk-skins`), so a skin that ships two themes captures two and one that ships three captures
 * three, instead of the harness insisting on a `midnight` its skin never defined.
 */

/** `next-themes`' default storage key. */
export const THEME_STORAGE_KEY = 'theme';

/**
 * The CSS custom property read back as proof the skin's tokens resolved under this theme.
 * Every skin defines it per theme (`sk-tokens-neomorphism` / `sk-skins` §4) — a class that is
 * present while this comes back empty means the class was set but no theme block matched it.
 */
export const THEME_PROBE_VAR = '--background';

/** What the page reports about the theme it is actually rendering. */
export interface ThemeProbe {
  /** Every class on `<html>`. */
  classes: string[];
  /** Of those, the ones that are declared themes — the answer to "which theme is live". */
  appliedThemes: string[];
  /** The custom property that was read. */
  probeVar: string;
  /** Its computed value. Empty ⇒ the class is on but the skin defined no tokens for it. */
  probeValue: string;
  /** What `localStorage` holds, i.e. what the app will pick on the next load. */
  storedTheme: string | null;
}

/**
 * Write the preference the way the app itself writes it. Called BEFORE a reload so
 * `next-themes`' own pre-hydration script applies the class before first paint — no flash, and
 * no race with React attaching.
 */
export function setThemePreferenceInPage(arg: { storageKey: string; theme: string }): void {
  window.localStorage.setItem(arg.storageKey, arg.theme);
}

/**
 * Force the class on `<html>` directly, removing every other declared theme first.
 *
 * Belt and braces on top of the reload above: the reload is the faithful path (the app decides),
 * this is the deterministic one. Neither is trusted — `readThemeInPage` + `assertThemeApplied`
 * are what decide whether the capture happens.
 */
export function applyThemeInPage(arg: {
  storageKey: string;
  theme: string;
  themes: string[];
}): void {
  const root = document.documentElement;
  for (const name of arg.themes) root.classList.remove(name);
  root.classList.add(arg.theme);
  window.localStorage.setItem(arg.storageKey, arg.theme);
}

/** Read back what the page is really rendering. */
export function readThemeInPage(arg: {
  storageKey: string;
  themes: string[];
  probeVar: string;
}): ThemeProbe {
  const root = document.documentElement;
  const classes = Array.from(root.classList);
  const computed = window.getComputedStyle(root);
  return {
    classes,
    appliedThemes: classes.filter((name) => arg.themes.indexOf(name) !== -1),
    probeVar: arg.probeVar,
    probeValue: (computed.getPropertyValue(arg.probeVar) || '').trim(),
    storedTheme: window.localStorage.getItem(arg.storageKey),
  };
}

/**
 * The gate before the shutter. Throws — the run fails loudly rather than filing a photograph of
 * the wrong theme under the right name.
 *
 * Three ways it refuses, and each one is a different lie the manifest would otherwise tell:
 *   1. no declared theme class at all — the app never applied one;
 *   2. a class that is not the one asked for (or more than one) — the previous theme survived;
 *   3. the class is right but the skin's token is empty — the theme exists in name only.
 */
export function assertThemeApplied(expected: string, probe: ThemeProbe, context: string): void {
  const applied = probe.appliedThemes;

  if (applied.length !== 1 || applied[0] !== expected) {
    throw new Error(
      `[visual-evidence] ${context}: se pidió el tema '${expected}' y el DOM reporta ` +
        `${applied.length === 0 ? 'ninguno' : `'${applied.join("', '")}'`} ` +
        `(clases en <html>: '${probe.classes.join("', '") || '—'}'). No se captura: una imagen con el ` +
        'tema anterior demuestra cobertura multi-tema en falso.'
    );
  }

  if (probe.probeValue.length === 0) {
    throw new Error(
      `[visual-evidence] ${context}: la clase '${expected}' está aplicada pero ${probe.probeVar} ` +
        'resuelve vacío — el skin activo no define tokens para ese tema. La captura saldría con los ' +
        'tokens del fallback, no con los del tema pedido.'
    );
  }
}
