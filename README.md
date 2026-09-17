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

On first opening (or via **?**), choose **Use this page** for a top-centered on-page walkthrough. It follows your actual actions: pick a word, change WPM, and use **Space to start, pause, and resume**. Esc remains an optional pause/cancel shortcut, not a required tutorial step. Tutorial speed changes are real settings. You can exit or start over anytime.

**Open example blog** opens the linked Substack article only when you choose it. On that new tab, click WordGlide → **Use this page** to grant temporary page access and begin. No extra site permissions are requested. A small offline practice passage remains available under **Practise here instead**; it does not change page settings. Subscription dialogs or inaccessible content must be handled by the user; the tutorial does not bypass them.

## Read a passage

- **Start reading** reads the detected article from its beginning. Selecting text before activating uses that selection as the passage when it belongs to the detected article.
- **Set start word** lets you click any eligible word. **Set end word** chooses the inclusive final word. Without an explicit end, reading continues to the end of the article.
- **Choose a different reading area** highlights the prose container under your mouse; click to choose it, then select your first word.
- Choose **Cursor**, **Highlight**, or **Outline**. This is a visual guide; your real mouse remains available.
- In Cursor mode, choose a **Hand** (default), **Dot**, or **Arrow**. Dot size is **1–30 px** (actual visible diameter); hand/arrow size is **12–40 px**. **Stroke** adjusts the hand/arrow or word outline.
- **Hand, Dot, and Arrow** glide continuously across each word and the gap to the next. The dot adds a short fading trail. Cursor tips stay close to the text at every size. Highlight and outline ease into each word/group. Line returns reposition directly without a diagonal trail. System reduced-motion preferences disable travel and trails.
- **Auto** (the default for unset preferences) uses dark green on light article backgrounds and pale green on dark backgrounds. Or choose **green, blue, purple, red, orange, or black**. Saved colors from older versions are preserved; select Auto to enable adaptation. Background images/gradients may need a manual color.
- In Highlight mode, select **1–4 words per highlight**. Groups stop at line/paragraph boundaries and your selected end word. Each group receives the combined reading time of its words, so 250 WPM is still 250 words per minute, not 250 groups.
- Adjust speed between **60 and 1,000 WPM**. Natural pauses add time at punctuation and paragraph ends. Scrolling and browser slowdowns can extend elapsed reading time; words are never deliberately skipped to catch up.
- The toolbar collapses to a translucent circular WordGlide logo during playback. Click it to pause and expand; drag either the circle or the panel's dotted top bar to reposition it. Transparency uses simple opacity, not background blur. **Set start**, **Set end**, and **Area** choose the passage; **?** reopens the tutorial.
- Turn off **Show page controls** in the extension popup to hide the panel and logo without stopping the reading guide. Restore them with the same switch. The tutorial temporarily shows controls when needed.
- New lines get a **120 ms settling pause** before reading continues, without a diagonal sweep. This adds a little time beyond the base WPM.
- **Pause** saves your place. **Stop** returns to the selected start. **×** removes the guide and ends the session.

With a reading session active, **Space** plays/pauses, **Escape** pauses or cancels selection, and **Alt+Left / Alt+Right** steps through words. Inputs and editable fields retain their normal typing behavior.

Auto-scroll accelerates and decelerates gently over 450–1,800ms depending on distance. System reduced-motion preferences still use immediate repositioning. The guide pauses when you interact with or manually scroll the page, switch tabs, or open a modal/fullscreen surface. Resume explicitly. If a page edit removes your selected text, select your passage again.

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

They run at **1280×800**, which is a Chrome Web Store screenshot size, so the shots in `test-results/` are the shots the store listing uses. `reader.png`, `dot-trail.png`, `group-highlight.png`, `auto-color.png` and `on-page-tour.png` show the product doing the thing it is for.

## The toolbar mark

`npm run icons` redraws `icons/` from `scripts/icons.mjs`. It is the guide's dot and the trail it leaves, drawn still — an extension icon is a static PNG, so the motion is depicted rather than played, and in this product the trail *is* the motion.

Every value in it comes from the extension rather than from a decision made for the icon: `#DC2626` is `core.ts` `palette.red`, and the trail marks are the dot's diameter × 12/32, the ratio `guide.ts` drops them at. The ground is dark because red measures 3.88:1 on it and **1.28:1 on the extension's own green** — the obvious brand-green tile is unreadable, which is why this is not that.

## Publishing

Brave is not a second submission. Brave installs from the Chrome Web Store, so one listing covers both.

```sh
npm run package      # release build, no source maps, then the zip
```

That writes `wordglide-<version>.zip` with `manifest.json` at the archive root, and refuses to write one that is missing a declared icon or that carries a source map — the two mistakes that get an upload rejected without saying which it was.

Then, at the [developer dashboard](https://chrome.google.com/webstore/devconsole) (one-time $5 registration):

1. Upload the zip.
2. Screenshots: 1280×800 or 640×400. Take them from `test-results/`.
3. Single purpose: a reading guide that moves a marker through the words of the page you are on, at a pace you set.
4. Permission justifications — `activeTab` and `scripting`: the guide is injected into the current tab only when you click the toolbar button (`chrome.scripting.executeScript` in `background.ts`). There are no `content_scripts` and no host permissions. `storage`: your settings stay in the browser.
5. Data usage: nothing is collected. The only outbound request in the codebase is `chrome.tabs.create` opening the walkthrough article, on an explicit button press.

When the listing is live, the marketing site has two `<span class="btn--store is-pending">` blocks in `public/wordglide.html` (in the [rsvp-reader](https://github.com/6D-pixel/rsvp-reader) repo) that become `<a href>`. Its test fails if only one of them is changed.

## Privacy

The extension runs locally on pages where you activate it. It requests temporary access to the current tab, script injection, and local preference storage. It stores speed, guide mode, cursor appearance, pause/scroll preferences, toolbar position, and whether you dismissed the introduction. An opt-in example tutorial temporarily stores its tab ID in browser-session storage. It does not send article text to a server, record reading history, or use analytics. Opening the external example blog makes a normal browser request to Substack.
