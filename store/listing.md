# Chrome Web Store listing

Paste-ready copy for the developer dashboard. Every claim here is true of the
code in this repo — if a feature changes, this file is the copy that is wrong.

Brave needs no second submission: it installs from this listing.

---

## Upload

`wordglide-<version>.zip`, from `npm run package`. Not `dist/`, not a folder.

## Name

    WordGlide

## Short description  (from manifest.json, 86 chars, cap is 132)

    Find your reading rhythm. A gentle word-by-word guide for articles and GitHub READMEs.

## Category

Productivity → Workflow & Planning

## Detailed description

    WordGlide moves a guide through the words of the page you are already on,
    at a pace you set. Nothing is extracted and nothing is re-rendered: the
    layout, the images, the links and the code stay exactly where the author
    put them. Only your attention moves.

    Click the toolbar button on any article or GitHub README, pick a word to
    start from, and press Space.

    THREE GUIDE STYLES
    · Cursor — a marker under the line, sweeping the whole word and the gap
      after it
    · Highlight — the word lit behind, one to four words at a time
    · Outline — the word ringed, for dense or technical text

    THE CURSOR, YOUR WAY
    Hand, dot or arrow. Size and stroke to taste. The dot leaves a short
    fading trail so a fast pace still reads as one motion.

    COLOUR THAT READS
    Auto senses the article's own background and picks a dark or a pale green
    to suit it, so the guide stays visible on a light page and on a dark one.
    Or choose green, blue, purple, red, orange or black yourself.

    PACE
    60 to 1000 words per minute. Natural pauses give a comma a longer beat
    than a word, a sentence longer than a comma, and a paragraph break longest
    of all — so it reads like reading rather than a metronome. Auto-scroll
    keeps the line you are on in a comfortable band and stops the moment you
    scroll yourself.

    YOU CHOOSE THE PASSAGE
    Start at the top, or click any word. Set an end. If it grabs the wrong
    block, point it at the right one. Space plays and pauses, Esc pauses, and
    the arrow keys step a word at a time.

    IT GETS OUT OF THE WAY
    The on-page panel collapses to a small circle you can drag anywhere, or
    hide entirely while the guide keeps running.

    A WALKTHROUGH ON A REAL PAGE
    The first time you open it, the tutorial runs on the page you are actually
    on rather than a mock-up. It waits for you to pick a word, change the
    speed and press Space — and the speed you set during it is a real setting,
    not a rehearsal.

    PRIVACY
    No account, no tracking, no analytics, no reading history. Article text is
    never sent anywhere, because there is nowhere for it to be sent. Your
    settings are stored in your own browser.

    It asks for exactly three things: temporary access to the current tab when
    you click the button, permission to inject its script, and local storage
    for your settings. It requests no standing access to any site.

    WHERE IT WON'T WORK
    Desktop Chromium browsers, on left-to-right pages. It cannot run where
    extensions are not allowed to: the browser's own pages, the extension
    store, the built-in PDF viewer, text drawn into a canvas, embedded frames
    and closed shadow roots.

## Single purpose

    A reading guide: it moves a visual marker through the words of the page
    you are on, at a pace you set, so your eye can follow a line without
    losing its place.

## Permission justifications

activeTab

    The guide is drawn into the page you are reading. activeTab grants that
    access only for the tab you are on and only because you clicked the
    toolbar button — the extension holds no standing access to any site.

scripting

    The guide's code is injected into the current tab on that click
    (chrome.scripting.executeScript in background.ts). The extension declares
    no content_scripts and no host permissions, so nothing runs anywhere until
    you ask for it.

storage

    Your settings — speed, guide style, cursor shape, size, colour, natural
    pauses, auto-scroll, panel position, and whether you have seen the
    introduction — are kept in the browser so they survive a restart. Session
    storage briefly holds one tab ID when you open the example article.

## Data usage

Tick nothing collected, and certify:

    This extension does not collect or transmit any user data. It makes no
    network requests. The only outbound action in the codebase is
    chrome.tabs.create opening the walkthrough's example article in a new
    tab, and only when you press that button.

## Screenshots  (1280×800, `store/screenshots/`, from `npm run shots`)

Upload in this order. The first is the listing thumbnail, so it carries both
halves of the pitch: the guide on the words, and the controls you can reach.

1. `1-reading.png`          the guide under a line, panel open
2. `2-dot-trail.png`        the dot at 550 wpm with its trail behind it
3. `3-highlight-group.png`  highlight mode over three words at once
4. `4-dark-article.png`     the same guide picking its own colour on a dark page
5. `5-walkthrough.png`      the tutorial, running on the article itself

NOT the shots in `test-results/`. Those come from the browser tests, whose
fixture exists to prove the extension *excludes* things — it contains a
paragraph reading "Never read this navigation", a block reading "excluded
code", and one sentence repeated twenty-eight times. Right for a test, and it
looks like a broken draft in a listing.

## Privacy policy URL

Not required while nothing is collected. If the form asks, the product page
carries the same statement:

    https://speedreader-app.vercel.app/wordglide

---

## When it is live

`public/wordglide.html` in the rsvp-reader repo has TWO `<span
class="btn--store is-pending">` blocks. Both become `<a href="THE_LISTING_URL">`,
minus `is-pending` and the "Coming soon" text beside them.
`test/wordglide.mjs` fails if only one of them is changed.
