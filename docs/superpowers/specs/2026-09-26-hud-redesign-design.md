# HUD redesign — "frosted glass" (2026-09-26)

## Goal

Replace the black-box monospace HUD with a modern, minimal interface: translucent blurred pills, Inter,
soft shadows. Remove the on-screen model credit line while keeping CC-BY attribution one click away.

## Scope

Only the HUD layer: `index.html`, `src/style.css`, `src/ui/hud.js`. The `Hud` public API stays the same
(`setMode`, `setStage`, `setCar`, `setCredits`, `showPalette`, `setActiveSwatch`, `setAvailableModes`,
`setLoading`, `toast`, `fatal`, `PALETTE`), so `main.js` and the modes do not change.

## Theme

- Font: Inter (Google Fonts, 400/500/600), tabular numbers for counters.
- Tokens on `:root`, overridden under `body.stage-studio` (dark wind-tunnel/studio stage). They are
  also meant for other HUD panels (the wind-tunnel panel):
  `--hud-font`, `--hud-fg`, `--hud-muted`, `--hud-glass`, `--hud-glass-strong`, `--hud-border`,
  `--hud-shadow`, `--hud-blur`, `--hud-radius` (pills), `--hud-radius-card`, `--hud-edge`.
- `body.stage-studio` keeps being toggled by `Hud.setStage`.
- Motion: 200–300 ms ease-out; none under `prefers-reduced-motion`.

## Layout

| Where | What |
|---|---|
| Top left | Overline "Garage", car name (large), then year and a glass pill `‹ 07 / 07 ›` (prev/next). |
| Top right | Round ⓘ button → glass card with the current car's credit (title link, author, licence link, "modificato"). Closes on outside click, Esc or the button. |
| Bottom centre | Segmented control Kit / Drive / Studio in a glass pill, with a sliding indicator under the active mode. |
| Above it | Hint row: key caps + labels (e.g. `W` `A` `S` `D` Guida · `Spazio` Freno a mano · `R` Raddrizza). Fades out ~6 s after each mode change. |
| Right, centred | Colour palette in a vertical glass pill (Studio only, as today). |
| Left edge | Kept clear from below the title block to above the mode bar (wind-tunnel panel lives there). |

The footer credit line is removed.

## Other surfaces

- Loading: dark background (translucent when switching cars), car name, thin bar, percentage.
- Toast: dark glass pill at the top with a red dot.
- Fatal: full-screen dark message, Inter.
- Joystick: glass base and knob.

## Mobile (< 640 px)

Smaller title; segmented control spans the width minus the edges; hint row hidden (the joystick
explains itself, and the space above the mode bar goes to the wind-tunnel sheet); info card fits the
screen width.

## Accessibility

Real `<button>`s with `aria-label`s, `aria-pressed` on modes, `aria-expanded` on ⓘ, visible focus rings,
Esc closes the card.

## Verification

Browser checks at desktop and phone widths, desk and studio stages, every mode, car switching,
the credits card, loading overlay. Existing unit tests keep passing.
