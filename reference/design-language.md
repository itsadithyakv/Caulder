# Design language

Neumorphism, in both themes, on a token system with one source of truth.

## The governing rules

1. **`src/styles/tokens.css` is the only place a colour is defined.** Nothing
   else declares a `:root` colour token. A value a module needs becomes a scale
   step, never a literal. Enforced by `src/styles/tokens.test.ts`.
2. **Neumorphism is for chrome, not content.** Sidebar, cards, buttons, inputs,
   toggles, tabs and section containers get the paired-shadow treatment. Table
   rows, lead names, numbers and status text stay flat and high-contrast.
3. **Elevation never encodes meaning.** Status is carried by colour *and*
   label, always both. A raised card and a flat one differ in depth, not in
   what they mean.
4. **A feature stylesheet may position a shared surface; it may not restyle
   one.** Layout only — colour, radius, spacing and type come from tokens.
5. **Semantic colour is never derived from the brand.** Won, lost, overdue and
   warning must stay readable whatever accent a company picks.

## Import order

`src/styles/globals.css` is an ordered import list, and the order *is* the
contract:

```
tokens → base → motion → primitives → shell → workspace → leads → import → today → pipeline → email
```

Later layers may adjust layout. They may not redefine colour, radius, spacing
or type.

## How the neumorphism works

Relief comes from **paired** shadows: a dark one down-right and a light one
up-left. The page sits a shade *below* the surfaces, so borders nearly vanish.

Light:

```css
--shadow-sm: 5px 5px 12px rgba(ink 9%), -5px -5px 12px rgba(255,255,255,0.9);
--shadow-md: 9px 9px 22px rgba(ink 11%), -9px -9px 22px rgba(255,255,255,0.85);
```

Dark, where the highlight collapses to 3–4% white and the shade carries the
whole effect:

```css
--shadow-sm: 5px 5px 12px rgba(0,0,0,0.55), -5px -5px 12px rgba(255,255,255,0.03);
```

**The canvas cannot be near-white.** At the original `#fcfdff` the white half
of each pair was invisible and the whole thing collapsed into flat Material.
Light mode sits on `#e8ecf3`.

### Raised, sunken and flat

| Token | Used for |
| --- | --- |
| `--shadow-xs / sm / md / lg` | Raised: cards, buttons at rest, board cards |
| `--shadow-inset-sm / md` | Sunken: inputs, tabs, wells, task rows |
| `--shadow-float` | Menus and popovers |

**Inputs are sunken.** A raised input reads as a button and invites a click
rather than typing; the inset is the affordance that says *type here*.

**Buttons press.** Rest is raised, hover lifts, active goes inset with a 1px
translate. That press is the whole point of a neumorphic control.

## Where neumorphism stops

The leads table is the case the style handles worst — two hundred soft,
low-contrast, extruded rows is unreadable. So:

- **The table sits in one sunken well**, not N raised cards.
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
- **Focus rings break neumorphism deliberately**: a solid 2px accent outline
  with an offset, never a soft glow.
- **Validation gets a solid border and text**, never a glow.
- **Disabled loses its relief *and* drops to tertiary ink**, so it is
  distinguishable without relying on shadow alone.
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

**The dark-mode trap**: the light block derives `--bg` from the company accent,
so the dark block must restore its own canvas explicitly or a light page leaks
into dark mode.

## Accents

Five ids — blue, teal, violet, amber, rose — each with a light and a dark pair,
both contrast-checked by `src/styles/accents.test.ts`.

**A company stores the id, never a hex.** A free colour picker cannot promise
4.5:1 against the canvas or under white button text, and a hex in the database
is a colour literal living outside the token file.

The active company's accent is stamped as `data-accent` on `<html>`, so the
whole app re-tints and which workspace you are in is visible without reading.

## Scales

| | |
| --- | --- |
| Radius | `xs` 10, `sm` 14, `md` 18, `lg` 22, `xl` 28, `pill` |
| Space | `1`–`8`, on a 4pt grid |
| Type | `xs` `sm` `base` `md` `lg` `xl` `2xl` |
| Motion | `--dur-fast` `--dur` `--dur-slow`, one `--ease` |

Semantic colour: `--ok`, `--warn`, `--danger`, `--info`, each with a `-soft`
pair for badge backgrounds. Ink: `--ink`, `--ink-2`, `--ink-3`,
`--ink-on-accent`.

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
2. **Nothing travels more than 10px.** Neumorphic relief is shallow; a long
   slide reads as a flatter, more Material design language.
3. **Duration comes from the tokens, never a literal.** The reduced-motion
   block zeroes `--dur-fast`, `--dur` and `--dur-slow`; a hardcoded `300ms`
   would not hear it.
4. **Data does not animate as it settles.** A container may fade in. Two
   hundred table rows may not arrive one at a time — by the time the last one
   lands, the wait is on an animation rather than on data.

| Class | Used for |
| --- | --- |
| `.anim-page` | A screen arriving. Keyed on the route, so every screen animates, not just the first |
| `.anim-modal` | The dialog and the first-run card — the longest travel in the file |
| `.anim-menu` | The company switcher and the board's Move menu |
| `.anim-mark` | The mark on first run, slower and from further back |
| `.anim-pop` | The overdue badge, keyed on the number |
| `.anim-leave` | A completed task |
| `.anim-stagger > *` | Children arriving in order, 45ms apart, capped at eight |

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

**The app icon gets a tile the mark itself does not.** A black-on-transparent
mark is invisible against a dark Windows taskbar, so the icon sits on a rounded
square in `--surface`, which reads on a taskbar of either polarity.

## Type

**Gilroy**, self-hosted. Five weights (300/400/500/700/900) as woff2 in
`resources/fonts/`, declared with `@font-face` at the top of `tokens.css` and
bundled by Vite. No external font host, so the app has no network dependency at
all. It is the house face across the sibling projects.
