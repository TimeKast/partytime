# brand/ — maker logo assets (TimeKast)

Vendored TimeKast logo for the **maker layer** (`--maker-*` in `kit.css`), used by
client-facing proposals (`tk-proposal`) where the maker brand co-exists with the
client brand (`--brand-*`).

| File | Use |
| ---- | --- |
| `timekast-light.gif` | Animated, for **light** backgrounds (light/tint editorial sections). |
| `timekast-dark.gif` | Animated, for **dark** backgrounds (`.solid` anchor / close section). |
| `timekast-transparent.gif` | Animated, transparent bg — works over any surface. |
| `timekast-light.png` / `timekast-dark.png` | Static first-frame fallbacks. ⚠️ Their backdrop is **opaque** — they are frames of the animated GIFs, not cut-out logos, so they only work over a background of the matching tone. |
| `timekast-full.png` | Full logotype (icon + wordmark), blue, **transparent background**. The one to use over an arbitrary or light surface — `fx-pdf-export` renders it on the PDF cover, which is white. |

**Source + optimization:** derived from the originals in `~/Timekast/Logos TimeKast/`
(800×450, 100 frames, light ~4.8MB / dark ~10.5MB). Optimized via ImageMagick:
`magick SRC -coalesce -resize x240 -layers Optimize -fuzz 2% -colors 128 OUT`
(resized to 240px tall — logos display at ~64–104px; offline-deterministic, no CDN).

> A consumer (proposal) copies only the needed asset into its `assets/` for a
> self-contained deliverable. Co-brand (client logo alongside TimeKast) lands here
> when the client provides assets.
