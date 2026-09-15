// Read the article's surface rather than assuming the browser's theme matches
// the website. Composite translucent ancestor backgrounds over the page canvas.
export function surfaceColor(element: Element): string {
  const layers: number[][] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    const css = getComputedStyle(node).backgroundColor;
    if (!css.startsWith('rgb')) continue;
    const channels = css.match(/[\d.]+/g)?.map(Number);
    if (!channels || channels.length < 3) continue;
    const alpha = channels[3] ?? 1;
    if (alpha > 0) layers.push([...channels.slice(0, 3), alpha]);
    if (alpha >= 1) break;
  }
  const scheme = getComputedStyle(document.documentElement).colorScheme;
  const darkCanvas = scheme === 'dark' || (scheme.includes('dark') && matchMedia('(prefers-color-scheme: dark)').matches);
  let rgb = darkCanvas ? [0, 0, 0] : [255, 255, 255];
  for (const layer of layers.reverse()) rgb = rgb.map((v, i) => layer[i] * layer[3] + v * (1 - layer[3]));
  const brightness = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  return brightness < 145 ? '#b7f58b' : '#386c46';
}
