# WordGlide

A word-by-word reading guide for articles and GitHub READMEs. The page stays in its original layout while a visual cursor, highlight, or outline moves through the passage at your chosen pace.

## Install in Chrome or Brave

The ready-to-load extension is in `dist/` after building.

1. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
2. Enable **Developer mode**.
3. Click **Load unpacked**, then select this project's **dist** folder.
4. Pin WordGlide using the browser's Extensions menu.
5. Open an article or a GitHub README, then click the extension icon.

After rebuilding, click **Reload** on the extension card. Reload an already-open article if its old controls are still present; reactivating the extension also removes the old overlay.

On first opening, a short walkthrough explains how to choose a word, set your pace, and use the controls. Click **?** beside WordGlide to read it again. Your existing speed preferences are preserved when updating.

## Read a passage

- **Start reading** reads the detected article from its beginning. Selecting text before activating uses that selection as the passage when it belongs to the detected article.
- **Set start word** lets you click any eligible word. **Set end word** chooses the inclusive final word. Without an explicit end, reading continues to the end of the article.
- **Choose a different reading area** highlights the prose container under your mouse; click to choose it, then select your first word.
- Choose **Cursor**, **Highlight**, or **Outline**. This is a visual guide; your real mouse remains available.
- In Cursor mode, choose a **Hand** (default), **Dot**, or **Arrow**. Adjust **Size** from 12–40 px. **Stroke thickness** adjusts the hand/arrow or word outline; the dot uses the size control.
- All three modes ease smoothly between words on the same line. Line returns jump directly to the next line so the guide does not sweep diagonally across the paragraph. System reduced-motion preferences disable the animation.
- Adjust speed between **60 and 1,000 WPM**. Natural pauses add time at punctuation and paragraph ends. Scrolling and browser slowdowns can extend elapsed reading time; words are never deliberately skipped to catch up.
- The floating toolbar collapses during playback. Click its handle to pause and expand it. Drag the dotted top bar to move it.
- **Pause** saves your place. **Stop** returns to the selected start. **×** removes the guide and ends the session.

With a reading session active, **Space** plays/pauses, **Escape** pauses or cancels selection, and **Alt+Left / Alt+Right** steps through words. Inputs and editable fields retain their normal typing behavior.

The guide pauses when you interact with or manually scroll the page, switch tabs, or open a modal/fullscreen surface. Resume explicitly. If a page edit removes your selected text, select your passage again.

## Supported content

Desktop Chromium browsers, ordinary left-to-right HTML articles, and rendered GitHub README prose. Includes headings, paragraphs, lists, quotations, links, and inline code. Skips navigation, hidden content, controls, fenced code blocks, and tables.

Browser-internal pages, the extension store, built-in PDF viewers, canvas text, embedded frames, and closed shadow roots are not supported. Very unusual layouts and text that has not been rendered may require scrolling into view or selecting a smaller reading area. No claim is made about increased comprehension or a universally comfortable reading speed.

## Development

Requires Node.js 22.18+ (or a recent Node version with TypeScript type stripping).

```sh
npm install
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The implementation was checked in Playwright Chromium and an isolated local Brave profile. To repeat the Brave run on macOS after building:

```sh
WORDGLIDE_BROWSER='/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' npx playwright test
```

The build uses TypeScript and esbuild, with no runtime UI framework. The popup and floating toolbar share their controls and styling. See [ARCHITECTURE.md](ARCHITECTURE.md) for ownership, timing, and DOM handling.

Browser tests load a temporary extension copy with host permission **only for the local test server** to allow automation to inject. The shipping manifest keeps only `activeTab`, `scripting`, and `storage`. Tests exercise the real extension content runtime and messaging, but browser-toolbar permission gestures still need a manual install smoke test.

## Privacy

The extension runs locally on pages where you activate it. It requests temporary access to the current tab, script injection, and local preference storage. It stores speed, guide mode, cursor appearance, pause/scroll preferences, toolbar position, and whether you dismissed the introduction. It does not send article text to a server, record reading history, or use analytics.
