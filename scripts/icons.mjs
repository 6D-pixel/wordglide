/* =========================================================================
   The toolbar mark: the extension, doing its job, at 128 pixels.

   It is not a logo with a dot next to it. It is the product's own geometry —
   a word, and the guide gliding underneath it with its trail behind — where
   the word happens to be WG. Anyone who has used the extension recognises the
   picture before they read the letters, because it is the picture they have
   been watching all the way down an article.

   An extension icon is a static PNG; Chrome does not animate them. That is
   fine here, because in this product the trail IS the motion, so one frame of
   it says the thing moves without a frame of animation.

   Every value comes out of the extension rather than out of a decision made
   for the icon:

     ground   #F9EDCA   guide.ts paints .fragment #edc961 at alpha 55/255 —
                        composite that over white and you get this exactly.
                        The tile is the colour the extension leaves on a word
                        it has lit.
     dot      #DC2626   core.ts palette.red, the colour the demo runs
     mark     dot diameter * 12/32, the ratio guide.ts drops its trail at,
              fading in opacity only, because the real trail does not taper
     the dot sits UNDER the letters, the way guide.ts anchors it: top edge
     just below the text, never on the baseline

   Contrast on that ground: red 4.14:1, ink 14.49:1. The extension's own green
   was the obvious tile and is unusable — red measures 1.28:1 on #386c46.

   Detail comes off as the canvas shrinks. Four trail marks at 128px is a
   comet; at 16px it is four grey pixels, and two letters are mush, so the
   smallest size keeps the thing that is still legible there: the dot.

   Reproducible from this file — the letterforms come from the woff2 beside it
   rather than from whatever the rendering machine has installed. That file is
   build-time only; the extension ships the PNGs, not the font.

     npm run icons
   ========================================================================= */

import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';

const GROUND = '#F9EDCA';
const INK = '#241B14';
const DOT = '#DC2626';

/* Fractions of the tile, so every size is described the same way.
   dot/mark are radii; gap is the centre-to-centre step back along the trail;
   base is the letters' baseline; drop is the clearance under it before the
   dot's top edge, which is guide.ts's `r.bottom + 1` scaled to the tile. */
const SIZES = [
  { px: 128, word: true, type: 0.40, base: 0.50, drop: 0.045, dot: 0.100, mark: 0.038, gap: 0.088, marks: 4, x: 0.60 },
  { px: 48, word: true, type: 0.42, base: 0.51, drop: 0.050, dot: 0.105, mark: 0.042, gap: 0.098, marks: 3, x: 0.60 },
  { px: 32, word: true, type: 0.44, base: 0.52, drop: 0.055, dot: 0.115, mark: 0.048, gap: 0.115, marks: 2, x: 0.58 },
  // 16px: the letters would be four grey pixels. The dot is what survives.
  { px: 16, word: false, dot: 0.290, mark: 0.120, gap: 0.235, marks: 1, x: 0.62 },
];

/* guide.ts holds a trail mark at 30% and lets it fall to nothing, over a page
   that is usually light. This tile is light too, so the product's own shape of
   fade works here as it stands. */
const FADE = [0.62, 0.42, 0.27, 0.16];

function svg({ px, word, type, base, drop, dot, mark, gap, marks, x }) {
  const r = px * dot;
  // The dot hangs under the letters, not beside them: top edge below the
  // baseline, exactly as the guide hangs under a line of text.
  const cy = word ? px * base + px * drop + r : px / 2;
  const cx = px * x;
  const trail = Array.from({ length: marks }, (_, i) =>
    `<circle cx="${(cx - px * gap * (i + 1)).toFixed(2)}" cy="${cy.toFixed(2)}" `
    + `r="${(px * mark).toFixed(2)}" fill="${DOT}" opacity="${FADE[i]}"/>`).join('');
  const letters = word
    ? `<text x="${(px / 2).toFixed(2)}" y="${(px * base).toFixed(2)}" fill="${INK}" `
      + `font-family="Plex Sans" font-weight="600" font-size="${(px * type).toFixed(2)}" `
      + `letter-spacing="${(px * -0.012).toFixed(2)}" text-anchor="middle">WG</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" `
    + `viewBox="0 0 ${px} ${px}">`
    + `<rect width="${px}" height="${px}" rx="${(px * 0.22).toFixed(2)}" fill="${GROUND}"/>`
    + letters + trail
    + `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="${DOT}"/>`
    + `</svg>`;
}

const face = (await readFile(new URL('plex-sans-600.woff2', import.meta.url))).toString('base64');
const style = `<style>
  @font-face { font-family: "Plex Sans"; font-weight: 600; font-style: normal;
    src: url(data:font/woff2;base64,${face}) format("woff2"); }
  html, body { margin: 0; padding: 0; background: transparent }
  svg { display: block }
</style>`;

await mkdir('icons', { recursive: true });
const browser = await chromium.launch();
for (const size of SIZES) {
  const page = await browser.newPage({
    viewport: { width: size.px, height: size.px },
    deviceScaleFactor: 1,
  });
  await page.setContent(style + svg(size));
  // Without this the text can paint in the fallback face on a cold cache.
  await page.evaluate(() => document.fonts.ready);
  // omitBackground keeps the rounded corners transparent, so the tile sits on
  // a light or a dark toolbar without a square of the wrong colour around it.
  await page.screenshot({ path: `icons/icon-${size.px}.png`, omitBackground: true });
  await page.close();
  console.log(`icons/icon-${size.px}.png`);
}
await browser.close();
