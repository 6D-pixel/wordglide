# Architecture

## Runtime ownership

`background.ts` handles user-triggered activation and injects `content.js` using `activeTab` and `scripting`. The service worker owns no reading state. The popup uses typed commands and requests a fresh snapshot when opened. Each tab's content runtime owns its own session and effective preferences; saved preference changes become defaults for future sessions.

`ui.ts` provides the same controls to the popup and floating toolbar. The popup is disposable: closing it leaves playback intact. Content snapshots update it without persisting a word index for every animation frame.

The page runtime mounts one fixed overlay host under `documentElement`, with styles inside a shadow root. Visual guide elements ignore pointer events. Only controls accept input. No website words are wrapped or replaced. A build ID and a DOM teardown event let a new injection remove stale controls from an older extension context.

## Text and geometry

`text.ts` detects a rendered GitHub README or scores semantic article containers. A manual container picker is the fallback. It walks eligible text nodes, groups contiguous inline content into blocks, and maps a flat string back to original text-node offsets. Word segmentation runs on each flat block, preserving words split across emphasis and links. `<br>` and `<hr>` break blocks.

Each word retains its original DOM `Range`. `guide.ts` merges same-line fragments caused by inline formatting before animating, while preserving fragments on separate lines. The cursor targets the first visual line; highlighting and outlining draw every visual line. Click-to-word mapping uses the caret API and checks the measured text bounds.

Geometry is cached for the current word and cleared on scrolling, resizing, font/image loads, and relevant page changes. The engine reads geometry before drawing the overlay. Text edits rebuild the index and preserve selected boundaries only when their node offsets and text still match; playback pauses for review.

## Playback and scrolling

One animation-frame loop uses a monotonic clock. Base duration is `60000 / WPM`; natural pacing applies the largest punctuation or paragraph multiplier (1.25, 1.5, or 1.8). Common abbreviations avoid sentence pauses. Strict mode uses an equal duration per word.

`guide.ts` keeps persistent elements and applies browser-managed transform/size transitions once per word. Same-line travel uses the reference reader's follow-along timing: `min(130ms, duration * 0.3)` with `cubic-bezier(.22,.7,.24,1)`. Line returns and genuinely wrapped words reposition without a diagonal animation. The frame loop advances the word clock and only repositions an active guide when layout changes; it does not overwrite the transition every frame. Reduced-motion mode removes travel. Long main-thread stalls extend the schedule rather than skipping unseen words. Pause freezes computed visual coordinates and preserves progress within the word; stop resets to the selected start; finish retains the final word.

All cursor shapes use the reader's animation-frame clock for a linear sweep from the leading word edge to the next word's leading edge (or the last word's trailing edge on a line), rather than ease-and-dwell. Wrapped fragments divide that word's time by rendered width. Shape-specific SVG anchors place the visible tip/edge one pixel below the text range regardless of size. Only the dot emits a maximum of 16 trail particles that fade over 180ms; line returns, pauses, reduced motion, settings changes, and disposal clear them. No second reading clock is created. Shared 280px controls omit decorative prose while retaining recovery messages and accessible labels.

Highlight groups contain 1–4 words and are capped by line/paragraph boundaries and the inclusive end selection. Their duration is the sum of individual word durations, preserving WPM and natural-pause weighting. Playback advances to the word following the active group, while cursor and outline modes remain single-word. Geometry invalidation remeasures active ranges.

Cursor shape, shape-specific size bounds, stroke thickness (1–4), a six-color allowlist, and group size (1–4) are sanitized with defaults when older preferences are loaded. SVG viewBoxes preserve shape proportions. `walkthrough.ts` offers current-page and opt-in example-blog entry points, plus an optional offline practice session. The latter has a demo-only frame loop, stops on dismissal/hidden documents/disposal, and never sends practice settings or playback to the page. Dismissal synchronizes through local storage; the help button reopens the tutorial chooser.

Before advancing onto a word outside the reading band, the engine temporarily suspends advancement and scrolls the document or nearest vertical scrolling ancestor. An owned smoothstep trajectory (`3t² − 2t³`) moves the target near 55% of the visible reading region. Duration scales with distance, clamped to 450–1,800ms; reduced motion skips animation. Edge sticky/fixed headers are considered when measuring that region. At the end of a document, fully visible words remain readable even if recentering is impossible.

`page-tour.ts` observes actual selection, speed changes, and successful keyboard actions. It advances only on the expected action, highlights the speed control, and supports exit/restart without mutating article content. The example link is fixed and only opens after an explicit button click. The worker keeps a pending tutorial tab ID in session storage; injection still waits for extension activation under activeTab, with no added host permissions. Dot size now means visible diameter (1–30px); other cursor shapes remain 12–40px.

Owned scroll position and a short final-event tolerance distinguish extension scrolling from unexplained page movement. Wheel, touch, pointer interaction, and scrolling keys pause immediately. The guide never resumes automatically after a user interruption. Missing geometry pauses with a recovery message instead of guessing a word location.

## Verification and boundaries

Automatic color resolution composites RGB/RGBA ancestor backgrounds at word/layout updates, not on every animation frame. Ancestor theme attributes and system color-scheme changes invalidate the result. Auto is the default for unset colors; previously saved manual colors remain unchanged. Image/gradient backgrounds are not sampled and can require manual selection.

The word clock includes a 120ms hold when successive word ranges change lines. Cursor progress excludes that hold, so the guide settles at the new line before sweeping. Pause/resume retains elapsed hold time. The 40px circular control uses opacity only, and shares thresholded pointer dragging and saved position with the panel. A persisted visibility preference hides only the shell, not the reading guide; an active tutorial temporarily reveals the controls. The tutorial is top-centered and uses five required actions, with Esc retained as an optional shortcut.

Unit tests cover segmentation, offsets, preference migration, natural timing, and travel limits. Browser tests load the extension in an isolated Playwright Chromium profile with a fixture-only host grant; production permissions are unchanged. Tests cover actual content messaging, selection, modes, scrolling, mutation handling, reinjection, appearance settings, introductory guidance, and UI screenshots. Motion tests sample computed positions over multiple frames to distinguish real interpolation from word-to-word jumps, including words split by inline formatting.

V1 is local-only and optimized for left-to-right prose. Reading-order heuristics, page overlays, animated content, and arbitrary site DOM conventions remain compatibility boundaries. The extension does not manipulate the native OS cursor or promise medical/educational outcomes.
