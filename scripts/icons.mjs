/* =========================================================================
   The toolbar mark: the guide's dot, and the trail it leaves behind it.

   An extension icon is a static PNG — Chrome does not animate them — so the
   motion is drawn rather than played. That turns out to be the honest version
   of the mark anyway: in the product the trail IS the motion, and a single
   frame of it says "this thing moves" without a frame of animation.

   Everything here is a real number out of the extension rather than a
   decision made for the icon:

     ground   #0E1310   the dark reading ground the site uses
     dot      #DC2626   core.ts palette.red — the guide, as the demo runs it
     mark     dot diameter * 12/32, the ratio guide.ts drops its trail at,
              fading in opacity only — the real trail does not taper

   The ground is dark on purpose. Red measures 3.88:1 on it and only 1.28:1
   on the extension's own green, which is why the obvious "brand green tile"
   is not what this is. In a light toolbar it reads as a dark tile with a red
   comet on it; in a dark toolbar the tile melts into the chrome and the comet
   is left floating, which is still the mark. Both are good outcomes; an ivory
   tile would have done the reverse and glared in light mode.

   Sizes are tuned per size, not scaled from one drawing: four trail marks at
   128px is a comet, and at 16px it is four grey pixels. Detail comes off as
   the canvas shrinks and the dot grows to compensate.

   Rendered through the Chromium that ships for the browser tests, so the PNGs
   are reproducible from this file: npm run icons
   ========================================================================= */

import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const GROUND = '#0E1310';
const DOT = '#DC2626';

/* Fractions of the tile, so every size is described the same way.
   dot/mark are radii; gap is the centre-to-centre step back along the trail. */
const SIZES = [
  { px: 128, dot: 0.205, mark: 0.077, gap: 0.145, marks: 4, x: 0.68 },
  { px: 48, dot: 0.220, mark: 0.083, gap: 0.155, marks: 3, x: 0.68 },
  { px: 32, dot: 0.245, mark: 0.095, gap: 0.185, marks: 2, x: 0.66 },
  { px: 16, dot: 0.290, mark: 0.120, gap: 0.235, marks: 1, x: 0.62 },
];

/* guide.ts holds a trail mark at 30% and lets it fall to nothing, over a page
   that is usually light. On a near-black tile those same values go to mud —
   a fading red has nowhere to fade to but the ground. The shape of the fade is
   the product's; the values are lifted so the streak stays red the whole way
   down instead of turning into three dark blobs. */
const FADE = [0.95, 0.78, 0.55, 0.32];

function svg({ px, dot, mark, gap, marks, x }) {
  const cx = px * x;
  const cy = px / 2;
  const trail = Array.from({ length: marks }, (_, i) =>
    `<circle cx="${(cx - px * gap * (i + 1)).toFixed(2)}" cy="${cy}" `
    + `r="${(px * mark).toFixed(2)}" fill="${DOT}" opacity="${FADE[i]}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" `
    + `viewBox="0 0 ${px} ${px}">`
    + `<rect width="${px}" height="${px}" rx="${(px * 0.22).toFixed(2)}" fill="${GROUND}"/>`
    + trail
    + `<circle cx="${cx.toFixed(2)}" cy="${cy}" r="${(px * dot).toFixed(2)}" fill="${DOT}"/>`
    + `</svg>`;
}

await mkdir('icons', { recursive: true });
const browser = await chromium.launch();
for (const size of SIZES) {
  const page = await browser.newPage({
    viewport: { width: size.px, height: size.px },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>`
    + svg(size));
  // omitBackground keeps the rounded corners transparent, so the tile sits on
  // a light or a dark toolbar without a square of the wrong colour around it.
  await page.screenshot({ path: `icons/icon-${size.px}.png`, omitBackground: true });
  await page.close();
  console.log(`icons/icon-${size.px}.png`);
}
await browser.close();
