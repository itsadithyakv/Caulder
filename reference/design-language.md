# Design language

Flat and bordered, in the manner of MongoDB's LeafyGreen system, in both themes,
on a token system with one source of truth.

## The governing rules

1. **`src/styles/tokens.css` is the only place a colour is defined.** Nothing
   else declares a `:root` colour token. A value a module needs becomes a scale
   step, never a literal. Enforced by `src/styles/tokens.test.ts`.
2. **Surfaces are quiet; the data carries the contrast.** A section is a
   sheet with a hairline, a control has a darker edge, and colour is spent
   on what means something: the accent on the one primary action, the
   semantic colours on status. The margin's rose rule and the stuck-on
   notes are the exceptions (see "The face").
3. **Only what floats has a shadow.** Menus, dialogs and a card being dragged.
   Elevation never encodes meaning; status is carried by colour *and* label,
   always both.
4. **A feature stylesheet may position a shared surface; it may not restyle
   one.** Layout only — colour, radius, spacing and type come from tokens.
5. **Semantic colour is never derived from the brand.** Won, lost, overdue and
   warning must stay readable whatever accent a company picks.

## Import order

`src/styles/globals.css` is an ordered import list, and the order *is* the
contract:

```
tokens → base → motion → primitives → shell → workspace → leads → import → today → pipeline → money → email → day → personal → brain → … → sketch
```

`sketch.css` is last on purpose: it is the face's hand-made layer, and every
rule in it is scoped to `[data-face="notebook"]`, so it restyles blocks other
files own without restating their roots (`blocks.test.ts`).

Later layers may adjust layout. They may not redefine colour, radius, spacing
or type.

## How the look works

The complaint that produced this section was that the app looked unclean, and
the screenshots bore it out: every card, input, tab and row was lifted off or
pressed into a grey canvas by a pair of shadows, so every element on the
screen had two soft edges, and a screen of forty controls was eighty blurred
lines competing with the text. It was replaced by the approach MongoDB's
design system takes, which does the same separating with one sharp line.

- **The base tokens below are the flat white look this began as**: a white
  page, the chrome on the faintest grey, navy-black ink. The face the app
  wears, the notebook, overrides every neutral (see "The face"); what follows
  about lines, halos and squareness holds in both.
- **Three weights of line.** `--border` for a card's edge, `--border-strong`
  for a control's, and `--border-input` for a field you type into, which is the
  darkest because the edge is the affordance that says *type here*.
- **Hover and focus draw a halo, and nothing moves.** A button under the
  pointer gains a three-pixel ring in `--border` outside its edge; a focused
  field swaps its edge for the accent and a ring in `--accent-halo`. Nothing
  translates or changes size, so a row of buttons never jiggles as the pointer
  crosses it.
- **Square enough to look like a tool.** Six pixels on a control, eight on a
  row, twelve on a card.
- **Bold is as heavy as the type goes.** The page titles were set in Gilroy
  Heavy, which read as a poster; they are Bold now, a step smaller.

### Surfaces, edges and halos

| Token | Used for |
| --- | --- |
| `--bg`, `--surface` | The page and every card on it: white in light, `#001e2b` and `#112733` in dark |
| `--bg-subtle`, `--surface-sunken` | The chrome, board columns, figure tiles, table headers, disabled controls |
| `--hover` | A wash over whatever is underneath, for rows, nav items and ghost buttons |
| `--shadow-xs` | A card, a hair off the page |
| `--shadow-sm / md / lg` | A board card under the pointer, a dragged block |
| `--shadow-float` | Menus, popovers and dialogs |
| `--shadow-inset-sm / md` | Kept as names and transparent, so a rule that still asks for one gets nothing rather than a broken declaration |

**Tabs come in two shapes.** The default `.tabs` is a segmented control, for a
small choice about how to show one thing: Day or Week, the theme. `.tabs--line`
is a row of underlined tabs, for sections of a screen: Invoices, Quotes and
Spend, and the kinds of entry in a contact's history.

**Rows are ruled lines.** A task, an invoice, a template or a page in a list
has a faint line under it and a wash on hover, not a box of its own. They
were grey tiles pressed into the card once, then white boxes inside a white
card; both put a second shape behind every line of text.

## The table

- **The table sits in one bordered frame**, not N boxed rows.
- Rows separate with a hairline (`--soft-line`) and **tint on hover** rather
  than lifting.
- **Every row is exactly `--row-h` tall**, and cells truncate rather than wrap.
  This is the rule the first version broke: cells were allowed to grow, so a
  lead with a contact, an email and a phone was three lines and one with none
  was one. Nothing lined up across rows, and a table whose rows are different
  heights stops reading as a table at all — you go down it instead of scanning
  a column.
- **Column headings are buttons**, and the sort arrow is always present at zero
  opacity so a column does not change width when you click it.
- The board is the one place a lift is right, because a card really is an
  object you pick up and put down.

## Accessibility floor

- Body text at **4.5:1** against its own surface, in both themes.
- **Focus is always visible.** A field swaps its edge for the accent and a
  halo; everything else gets a solid 2px accent outline with an offset.
- **Validation gets a solid border and text**, never a glow.
- **Disabled takes the grey ground *and* the tertiary ink**, so it is
  distinguishable without relying on the edge alone.
- Interactive targets at least 30px, most 36px.

## Themes

Light is the base; **dark is written twice**, and a colour goes in both copies
or in neither. `tokens.test.ts` fails the build when the two drift, which is
the bug that otherwise shows up as a light patch in dark mode.

```css
:root                                          { /* light */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"])              { /* dark   */ }
}
:root[data-theme="dark"]                       { /* dark   */ }
```

The choice is stored in `localStorage` as Match system / Light / Dark and
stamped on `<html>` as `data-theme`. "Match system" stamps nothing.

Dark follows MongoDB's own: a `#001e2b` page, `#112733` cards, light grey ink,
and borders a step above the card rather than below it, so an edge still reads
where a shadow would have vanished.

## The face: the notebook

The app is **a notebook**: an off-white page, faintly ruled in blue, with
white sheets laid on it, espresso ink and the coffee accent; in dark, the
same notebook by lamplight. Gilroy throughout (decided 5 October) - the
notebook is in the paper, not in a typeface.

- **The page is ruled.** The body carries a fine grain (`--paper-grain`) and
  blue ruling a hair's breadth wide every `--rule-gap` (`--rule-line`, at
  about a tenth of its strength - felt more than seen). The frame and the
  scrolling pane are clear over it, so the sheet stays still while the work
  scrolls across it.
- **A section is a sheet laid on the page.** `.card` is `--surface`, a shade
  whiter than the page, with a hairline edge, so its text never sits on a
  line and the ruling shows in the gaps between sheets. Rows inside a sheet
  are separated by a faint line (`--soft-line`), not boxed.
- **The sidebar is the margin**: grain but no ruling, so what is written in
  it never sits on a line, set off by the notebook's double rule in faint
  rose (`--margin-rule`), drawn in a pen that wanders and carried up through
  the title bar so it runs the window's full height. It is the one line drawn
  for its look rather than its meaning, and never a status colour.
- **What floats** - a dialog, the palette, the tour, the first run - is
  `.card--float`: a sheet with `--shadow-float`.
- **Text written straight on the page never has a line through it.** A
  screen's title, Today's hello, the offers under the line, a tab row, a
  group's heading in Settings each lie on a patch of the page itself - its
  colour and grain, without the ruling - feathered at the edges by a mask, so
  the lines fade out under the words. A glow on the letters (`text-shadow`)
  was tried first and was too weak; a blur smoothed away the grain and left
  a paler smudge. Brain's own list is a sheet. The list of what needs a patch
  was found by walking every screen for text with nothing painted between it
  and the page; a new piece of loose text goes on it in `sketch.css`.

It replaced the coffee face on 14 October 2026, a cafe-au-lait ground with
rounded cards, which the owner did not love: every part of the screen was a
box, and the line to type in was a box inside a box. Five other looks were
tried on the real app first and the notebook chosen. Its first version had
no boxes at all - sections were a ruled line and a heading - and the owner
then asked for containers back, "so that text is still visible and the lines
in the background still exist". `data-face="notebook"` and
`data-accent="coffee"` are set on `<html>` in `index.html`.

### Things stuck on

`src/styles/sketch.css`, scoped to `[data-face="notebook"]`:

- **Sticky notes and paper**, each tilted by a degree or less: the sample
  notice is a yellow note with tape; *Right now* is a blue strip; the month's
  figures on Money are four notes; Today's side panels are notes pinned up; a
  contact's *Next steps* is a note; the calendar's unplanned tasks are small
  notes waiting for an hour; the company in brief is a ruled index card; a
  paid invoice is stamped PAID; deals are cards taped to a kraft board.
- **A few drawn touches**: the tab you are on is underlined with a scribble,
  where you are in the sidebar is run over with a highlighter (`--highlight`),
  buttons and fields have corners a pen would make (`--radius-hand`,
  `--radius-hand-sm`), the box to tick is a drawn ring (`--radius-blob`). The
  doodles are masks (`--doodle-*`) painted in a token.
- **What you work in stays square.** A board card squares up under the
  pointer and while its menu is open - a tilted card is a layer of its own,
  and its Move menu was caught under the card below until it did - and the
  Next steps note squares up while you type in it. Dialogs carry no tape:
  they scroll, and it would be cut off.
- **Every colour is a token**: the notes (`--note-yellow`, `-blue`, `-green`,
  `-pink`), `--kraft`, `--tape`, `--index-card`, `--rule-line`. ink-3 holds
  4.6:1 or better on every note in light and dark.
- **Handwritten type was tried and taken out** the same day: Ink Free read as
  cursive, Segoe Print and then a bundled Patrick Hand were readable but the
  owner asked for "normal fonts, not handwritten ones". Nothing of them is
  left - no font file, no licence, no token.

An earlier lesson still holds: **a face changes every neutral together or it
does not read as a choice.** A warm wash over a cold palette, the attempt
before coffee, read as muddy, and it borrowed `--warn` as decoration.

The face blocks sit after the theme blocks at the same specificity, so a
token the light block sets and a dark one forgets would *win* in dark mode.
`tokens.test.ts` asserts every themed token is redeclared in both dark face
blocks, that those two agree, and that nothing in them reaches for a status
colour.

Contrast on `--surface`, the sheets: ink 17:1, ink-2 9.9:1, ink-3 6.2:1 in
light; in dark the sheet is a step lighter than the page and ink-3 holds
5.9:1. On the page itself ink-3 is 5.8:1, and on the sunken tint 5.5:1; a
field's edge, `--border-input`, is 3.8:1 on a sheet.

## Accents

Six ids — blue, teal, violet, amber, rose, coffee — each with a light and a dark
pair, both contrast-checked by `src/styles/accents.test.ts`. Coffee is the
app's own. The rest are a company's colours.

**A company stores the id, never a hex.** A free colour picker cannot promise
4.5:1 against the canvas or under white button text, and a hex in the database
is a colour literal living outside the token file.

**A company's colour is its mark, not the window.** Its accent is stamped as
`data-accent` on the mark in the sidebar's company heading and on its dot in
the switcher, so which company the company screens show is visible without
reading - and the rest of the app stays coffee.

## Scales

| | |
| --- | --- |
| Radius | `xs` 4, `sm` 6, `md` 8, `lg` 12, `xl` 16, `pill` |
| Space | `1`–`8`, on a 4pt grid |
| Type | `xs` `sm` `base` `md` `lg` `xl` `2xl` |
| Motion | `--dur-fast` `--dur` `--dur-slow`, one `--ease` |

Semantic colour: `--ok`, `--warn`, `--danger`, `--info`, each with a `-soft`
pair for badge backgrounds. Ink: `--ink`, `--ink-2`, `--ink-3`,
`--ink-on-accent`.

**The type scale was raised one step across the board.** It read as a web app
seen from a laptop's distance; this is a desktop application looked at all day
on a monitor at arm's length. `--text-base` is 15px, `--text-lg` 22, `--text-xl`
28, and `--row-h` (46), `--titlebar-h` (40) and `--sidebar-w` (256) came up with
it so the chrome stayed in proportion rather than tightening around larger
text. Buttons and tabs are a step smaller than body text, at `--text-sm`, so a
row of actions does not outweigh what it acts on.

## The funnel ramp

The board's columns are neutral grey lanes. Progress along the funnel is
carried by `--stage-1-edge` through `--stage-6-edge`, a ramp mixed from
`--accent` that deepens with each stage, drawn as a `.column__dot` beside the
column's name. Won and lost take the faintest wash of `--ok` and `--danger` as
well, because they are not further along the funnel: they are out of it.

Two rules keep it from becoming decoration:

- **Columns are not tinted.** They were, at 7% to 37% of the accent, which put
  colour behind every card on the board. The dot says *further along* faster
  than reading does, and the lane stays out of the way of the cards in it.
- **Nothing is encoded by the ramp alone.** The column is named, counted and
  ordered; the colour says nothing that is not also written down.

The dot replaced a band across the top of each column, which read as a stray
line against a rounded corner rather than as a marker.

## Filling the window

The complaint that produced this section was "the app looks so empty", and the
measurement bore it out: Leads used 62% of the height available to it and
Settings ran to 2426px of scroll on a window with 1400px of unused width beside
it. A screen that fits in the top two thirds of the pane and leaves the rest
blank is a page that does not know how tall it is.

The rules that came out of it:

- **A screen whose subject is one list or table fills the pane.**
  `min-height: calc(100vh - 190px)` on the screen, the list wrapper at
  `flex: 1`. Leads and Email both do this. The 190px is the title bar, the
  heading and the padding under it.
- **An empty state centres in what it was given** rather than sitting at the
  top of a tall card. It is still the small empty state — filling the height
  is not licence to inflate the padding.
- **Cards of unequal height go in columns, not a grid.** A grid aligns the tops
  of a row, so a four-line card beside a nine-row one leaves a hole the height
  of the difference. Settings is `column-width: 420px` multicol with
  `break-inside: avoid`, which packs each column independently and falls back
  to one column on a narrow window without a media query. It halved the page:
  2426px of scroll to 1183px.
  Note that multicol does not apply to a flex container, so `.settings` has to
  restate `display: block` over the `.stack` it also carries — without it the
  columns are ignored silently.
- **The board fits without sideways scrolling.** Open stages are
  `grid-auto-flow: column` with `minmax(190px, 1fr)` columns and fill the
  viewport height; won and lost sit in a band beneath it, sized to their
  contents. Cards inside that band lay out across it rather than stacking, so a
  single won deal is the width of a card and not the width of half the window.
- **Empty is the exception.** A board with nothing on it drops to 200px
  columns, because tall columns are right when there is something to hold and
  somewhere to drop it, and five columns of blank otherwise.

## Hierarchy

The complaint that produced this section was that the app was cluttered, and
the audit bore it out: twelve peer rows in the sidebar, a forecast pinned
under them on every screen, a subtitle sentence under every title, and a
paragraph of reasoning under most headings. None of it was wrong. All of it
was competing with the data.

The rules that came out of it:

- **The sidebar is grouped, and short.** *Plan* and *Sell*, with Settings on
  its own at the foot. A screen that is a reading of another screen is a tab
  inside it (Day and Week on the calendar; Invoices, Quotes and Spend on
  Money), and a thing done to a list a handful of times is a button on that
  list (Import). Six rows, not twelve. A row is a claim about frequency.
- **Nothing lives in the sidebar's foot.** The one-line forecast that used to
  fill the empty column followed the reader onto Notes and Focus. Empty space
  under a navigation is not a bug to fill.
- **A heading stands alone.** No kicker above it, and no subtitle under it
  either: the twelve one-sentence subtitles said nothing the label and the
  screen did not.
- **A card says what it holds in one line. Why it works that way is one click
  away.** The `Explain` component is a native `details`, closed by default,
  at the foot of a card. It holds the reasoning that the first version put
  under every heading. The rule for what goes where: if the sentence would
  still be useful on the fortieth visit, it is the hint; if it was useful on
  the first, it is the explanation.
- **Settings is grouped.** Four groups with a rail to jump between them, and
  the cards pour into columns *within* a group. Twelve cards in one pour had
  the stage editor beside the tray key.
- **Reference data sits under facts; work sits on the right.** On a lead, the
  fields you invented and the files you attached are under the details, as
  flat sections separated by a hairline, not as cards inside a card. Next
  steps, email and history stay on the right, in that order.
- **First run asks two things.** A name and what the workspace is for. The
  looks are folded away under one disclosure.

## The primitives

Four small components in `src/components/`, and one hook, so that a section of
a screen is built the same way on every screen:

| | |
| --- | --- |
| `Card` | `section.card` with a title, an optional one-line hint, and an optional control on the right of the title. |
| `EmptyState` | The fact, then the next action. Icon optional, exclamation marks forbidden. |
| `Explain` | The reasoning, closed by default. See above. |
| `ErrorLine` | One `p.field__error` with `role="alert"`, or nothing when there is nothing to say. |
| `useResource` | A screen's data: fetched on mount, refetched after every change, with its error shown rather than swallowed. Replaces the `useState` / `useEffect` / `load` / `act` quartet each screen used to write for itself. |

They are not yet everywhere. Today, Settings and the lead's extras use them;
the rest of the app still builds the same shapes by hand, and the rule going
forward is that a new section uses the primitive and a touched one is moved
onto it. `messageOf` from `src/lib/errors.ts` is the one way to turn a caught
error into text, and the forty-three hand-written copies of it are gone.

Three states that were styled nowhere now are: a `.tab` selected by
`aria-pressed` or by the `.tab--on` modifier (the Day/Week tabs and both
weekday pickers had no visible selection), and `.scrim`, which is `.modal`
under the name two forms were written against.

## Written pages

A brain page's text is the one place a person writes at length, so it has its
own reading styles (`.prose` in `brain.css`): a measure of about 76
characters, headings a level below the page title and never larger than
`--text-lg`, tick boxes that are the app's own `.tickbox`, and code and tables
on the sunken surface. The editor is the same text in `--font-mono`, because
the markup is part of what is being written.

Secrets are shown in `--font-mono` too - `•••• 4821` - so the four characters
line up with the ones on a bank statement. The progress ring on Brain home is
the accent on the border colour, with its count written beside it in words for
anyone not reading the ring; at nought it draws no arc at all.

## The Map

Six dot colours, one per kind of thing, in `tokens.css` as `--map-page`,
`--map-contact`, `--map-product`, `--map-person`, `--map-document` and
`--map-decision`. They were chosen by search in OKLCH - six hues spread round
the wheel, lightness set per theme - and `map.test.ts` holds them to two
gates: every pair at least 15 apart in OKLab, and 3:1
against every surface a dot can sit on, in both themes. None borrows the
accent, which changes with the workspace.

Colour never means anything alone. The filter chips above the Map are the
legend, a colour and a word each; a link in a page is a chip in its target's
colour with the target's name in it; the list view says every dot's kind in
words. Dots are sized by how linked they are, lines are the border colour and
turn the accent when lit, and faded things drop to about a fifth of their
opacity rather than disappearing, so the shape of the company stays visible.

## Voice

- No exclamation marks in the working UI. No emoji in product copy.
- **An error says what happened and the way out.** "There is already a stage
  called *Contacted*." — not "Invalid input".
- **An empty state states the fact and names the next action.** "No leads yet.
  Import a spreadsheet to bring in a list, or add one by hand."
- A heading stands alone: no kicker or eyebrow label above it.
- Say what a thing is rather than what it is called internally. The UI never
  says SQLite, IPC or migration.

## Motion

`src/styles/motion.css`, imported between base and primitives so no feature
invents an entrance of its own. Entrances and exits only — hover and press
states live with the component they describe.

**Four rules:**

1. **Motion explains, it does not decorate.** A menu grows from its top edge,
   which is the edge nearest the control that opened it. A completed task
   leaves to the right, the side the tick is on. A movement that says nothing
   about where something came from or went should not happen.
2. **Nothing travels more than 10px.** The surfaces sit flat on the page, and
   a long slide would give them a weight they do not have.
3. **Duration comes from the tokens, never a literal.** The reduced-motion
   block zeroes `--dur-fast`, `--dur` and `--dur-slow`; a hardcoded `300ms`
   would not hear it.
4. **Data does not animate as it settles.** A container may fade in. Two
   hundred table rows may not arrive one at a time — by the time the last one
   lands, the wait is on an animation rather than on data.

| Class | Used for |
| --- | --- |
| `.anim-page` | A screen arriving. Keyed on the route, so every screen animates, not just the first |
| `.anim-modal` | The dialogs (shortcuts, Ctrl + K search) and the first-run card — the longest travel in the file |
| `.anim-menu` | The company switcher and the board's Move menu |
| `.anim-mark` | The mark on first run, slower and from further back |
| `.anim-pop` | The overdue badge, keyed on the number |
| `.anim-leave` | A completed task |
| `.anim-stagger > *` | Children arriving in order, 45ms apart, capped at eight |
| `.anim-spring` | The brain: a view, a page's title, the edit form, the Ctrl + K search |
| `.anim-spring-pop` | A checklist item's tick landing |
| `.anim-ring` | The progress ring drawing itself up to where it stands |

The link list that opens on `[[` arrives on the spring too, and a link chip
lifts a pixel on hover and squeezes when pressed.

**The brain moves on a spring.** It is the one place a founder wanders
rather than works through a list, and it is meant to feel alive. Two curves in
`tokens.css`, both real damped springs sampled into CSS `linear()` rather than
guessed: `--ease-spring` goes about 8% past where it lands and settles, for
views and rows; `--ease-bounce` goes about 23% past, for small things landing -
a tick, an icon nudged on hover. They have their own durations,
`--dur-spring` and `--dur-bounce`, because a spring takes longer than a curve
to settle, and the reduced-motion block zeroes both. The travel is still the
same 8px as a screen arriving: the spring is in the timing, not the distance.
The rail's highlight is one pill that springs from the section you left to
the one you opened, so the rail shows a movement rather than one box
disappearing and another appearing. Rows lift two pixels on hover and squeeze
when pressed; a step ticked on a page lands with a bounce.

**Stagger is only used where the order means something.** Today's sections are
ranked by how much they need attention and the board's columns are the funnel
left to right, so revealing them in sequence says something a simultaneous fade
does not. Everywhere else it would be decoration.

**Only one thing animates on a value changing: the overdue badge.** A number
that pulses every time it recounts is a distraction on every screen; that one
is the app's alarm, and a silent increment is how a late call stays late.

**Reduced motion turns it off, not down.** A transform completing in 0ms is a
jump rather than a stillness, and the boot pulse loops, so it would never stop.
The one place this has teeth: a completed task is held on screen while it
leaves, and that hold is a plain timer rather than an `animationend` listener —
under reduced motion there is no animation and therefore no event, and the tick
would silently never complete. `e2e/motion.spec.ts` asserts exactly that.

**Boot shows the mark breathing**, not a spinner. This is the app starting
rather than a request in flight, and the distinction is worth the pixel.

## Choosing: chips or the picker

There is no native `<select>` left in the app. The closed one could be styled;
the open one is drawn by Windows — a grey box with a black border and a solid
blue bar — and nothing reaches it. So two controls replace it:

- **Chips** when every option fits on screen at once: task kind, block
  kind, length and priority, the goal period. A list you have to open to read is
  one you read every time; a row of chips is learnt once and then hit without
  looking.
- **The picker** (`components/Select.tsx`) when the list is long, open-ended or
  data-driven: leads, stages, templates, calendars. It is the ARIA combobox
  pattern — focus stays on the button and `aria-activedescendant` names the
  active row — and it answers every key a native select does, including a
  letter to jump. The list is portalled onto `body`, because every animated
  panel ends its entrance holding a transform, and a transformed ancestor
  would trap and clip a fixed-position list.

A focused picker counts as typing for the single-letter shortcuts, or pressing
D to reach "Deep work" would leave for the Day screen.

## One edge, all the way round

**No container has one edge coloured or thicker than the rest.** No bar down
the left of a card, a row or a callout, drawn as a border or as an inset
shadow. It is the look of something generated, and it says nothing that the
same thin edge in the accent, or a tint behind, does not say more quietly.
A chosen row takes the accent on its whole edge and the accent's tint; a
part that matters takes a tinted edge. `tokens.test.ts` fails on a thick
border on one side or an inset bar in any stylesheet. Two exceptions: a
quotation in written text, whose bar is how a quotation is set, and the
notebook's margin, which is the page's margin rather than any container's
edge.

## What the AI is doing, said where it is done

**A switch that sends something off the computer looks on when it is on.**
The mark at the start of the quick line is AI mode: quiet until pressed, and
then the accent on its whole edge with the accent's tint behind - the same
"chosen" every chip has. The line under the reading says who will read it
before Enter, and who did and what went after. A draft from the AI is a
draft on the screen - a box that can be typed in, or the page beside the
page - with **Keep** and **Throw it away**, and under it one sentence of
what was sent to make it. Nothing the AI wrote is ever shown as though it
were already kept.

## Asked once, in one place

**What is not set up is offered in one place: Finish setting up, on
Today.** Your name, a copy elsewhere, Google, an AI. Not again on Brain home,
on a contact's page, or in a card that exists only to say what it would do
once something is connected - such a card is left out until it has
something to show. A screen whose empty state is a paragraph about the app
is a screen explaining itself.

**One colour.** A new company is coffee, the app's own, until somebody
picks another. The filled button is the one main action on a screen; an
action repeated down a list - Call, Mark paid - is a plain button.

**Dates in a sentence keep their capitals.** "On Wed, 21 Oct", never "on
wed, 21 oct": only today, tomorrow and yesterday are written in lower case
inside a sentence (`inSentence` in `src/lib/format.ts`). A timezone is the
place, "Kolkata", never "Asia/Calcutta".

## A block's kind

Five, each with its own fill on the Calendar: Deep work takes the accent,
Meeting the information blue, Call the amber, Admin a grey, Away the green
(`--block-focus`, `--block-meeting`, `--block-call`, `--block-admin`,
`--block-away` in `tokens.css`). A kind typed by hand, and a block with none,
is the lighter grey of `--block-unsorted`. The colour is never alone: the kind
is on the block's form and in the day's totals by name.

A task had an area once - college, company, personal, health - drawn as a
dot of one of four fixed hues beside its word. It went on 11 October 2026
(PLAN.md, phase 32) with its tokens and the test that held them apart.

## The mark

A cauldron with an orange flame, from `assets/caulderLogo.png` — the source of
truth. Everything else is derived from it by `scripts/logo.py`, so replacing
that one file and re-running the script updates the app, the installer and the
executable together.

| Derived | Used as |
| --- | --- |
| `src/assets/logo-light.png` | `--logo-mark`, light |
| `src/assets/logo-dark.png` | `--logo-mark`, both dark blocks |
| `resources/icon.png` | The app icon, which electron-builder turns into the `.ico` |

**The mark is ink-dependent, so it is a token like any other colour.** The
cauldron is near-black on transparency; left as drawn on the dark canvas it
disappears and only the flame survives. The dark copy lifts the cauldron to
`--ink` and keeps the flame. Both files are named by `--logo-mark`, declared in
all three theme blocks, so `.brandmark` never has to know which theme is on.

The recolour is generated rather than hand-drawn. Every pixel that is neither
black nor orange is anti-aliasing between the two, so a threshold recolour
leaves an orange fringe along the flame; the script projects each pixel onto
the black-to-orange line and rebuilds it from the same position against the new
ink.

**The flame does not follow the company accent.** It is the app's mark, not the
workspace's, and it reads the same in all five accents.

Where it appears: the title bar, beside the wordmark, and the first-run screen.
Not on **Add a company** — that is a form, not a welcome. It is decorative in
both places, because the word *Caulder* or a heading naming the app always sits
beside it, so it is `aria-hidden` and carries no alt text.

**The app icon is the mark on transparency, like every other copy of it** -
no tile, no square behind it. The one place that costs something is a dark
Windows taskbar, where the near-black cauldron is faint and the flame carries
it. The tray and notifications follow Windows' own colours, so on dark they
switch to the copy with the ink lifted, the same one the dark theme uses in
the window.

## Type

**Gilroy**, self-hosted. Five weights (300/400/500/700/900) as woff2 in
`resources/fonts/`, declared with `@font-face` at the top of `tokens.css` and
bundled by Vite. Medium (500) is the working weight for controls and Bold (700)
the heaviest in use; Heavy is still declared and used nowhere. No external font host, so the app has no network dependency at
all. It is the house face across the sibling projects.
