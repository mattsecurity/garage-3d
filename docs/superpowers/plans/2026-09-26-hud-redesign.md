# HUD Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the black-box monospace HUD with the "frosted glass" design in
`docs/superpowers/specs/2026-09-26-hud-redesign-design.md`.

**Architecture:** Markup in `index.html`, theme tokens and layout in `src/style.css`, behaviour in
`src/ui/hud.js`. The `Hud` public API is unchanged, so `main.js` and the modes are untouched.

**Tech Stack:** Vanilla HTML/CSS/JS, Vite, Inter (Google Fonts).

## Global Constraints

- Only `index.html`, `src/style.css`, `src/ui/hud.js` change (another session owns `main.js`, the modes and the wind-tunnel panel).
- Keep element ids used outside the HUD: `webgl`, `curtain`, `joystick` (+ `.joystick-base`, `.joystick-knob`, `.visible`).
- Keep `body.stage-studio` toggled by `Hud.setStage`.
- Tokens: `--hud-font`, `--hud-fg`, `--hud-muted`, `--hud-glass`, `--hud-glass-strong`, `--hud-border`, `--hud-shadow`, `--hud-blur`, `--hud-radius`, `--hud-radius-card`, `--hud-edge`.
- Left edge stays clear between the title block and the mode bar.
- CC-BY attribution stays reachable (ⓘ card).

---

### Task 1: Markup and theme

**Files:** Modify `index.html`, rewrite `src/style.css`.

- [ ] Swap DM Mono for Inter 400/500/600.
- [ ] Header: `.overline` "Garage", `h1#car-name`, `.car-meta` with `#car-year` and a `.stepper` holding `#prev-car`, `#car-count`, `#next-car` (SVG chevrons, `aria-label`s).
- [ ] `#info-btn` (ⓘ, `aria-expanded`, `aria-controls="credits"`) and `section#credits.card[hidden]`.
- [ ] `#hint` row; `nav#modes` with `.mode-indicator` and three `.mode-btn` (text only).
- [ ] Loading: `.loading-name`, `.loading-bar > .loading-fill`, `.loading-pct`.
- [ ] Styles per spec: tokens on `:root` and `body.stage-studio`, glass surfaces, sliding indicator driven by `--active`, key caps, card pop-in, toast with red dot, mobile rules (< 640 px), reduced motion.

### Task 2: Behaviour

**Files:** Modify `src/ui/hud.js`.

- [ ] `HINTS` become item lists `{ keys?: string[], label: string }`; `setMode` renders them, sets `--active` on `#modes`, fades the row after 6 s.
- [ ] `setCar` fills name, year and `NN / TT` (total from `CARS`).
- [ ] `setCredits` renders the card; ⓘ toggles it, outside pointerdown and Esc close it.
- [ ] `setLoading` also writes the percentage.

### Task 3: Verify and ship

- [ ] `npx vitest run` → all pass; `npx vite build` → succeeds.
- [ ] Browser: desk and studio stages, every mode, car switch, ⓘ card open/close, loading overlay, 375 px width.
- [ ] Commit the three files, push (Pages redeploys), confirm the live site.
