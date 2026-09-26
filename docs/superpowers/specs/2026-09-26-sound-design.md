# Sound — engines, tyres, impacts, Studio music (2026-09-26)

## Goal

Give every car a realistic engine sound of its own while driving, with tyres and impacts, and play background music
that suits the wind tunnel in Studio. Everything is synthesised in the browser: no audio files, no licences.

## Architecture (`src/audio/`)

| Unit | Job |
|---|---|
| `AudioEngine.js` | One `AudioContext`, unlocked on the first pointer/key gesture, suspended while the tab is hidden or muted. Buses: engine, tyres, impacts, music, tunnel → master compressor → output. Mute persisted in `localStorage`. |
| `engines.js` (pure data) | Engine profile per car id: layout, firing angles, idle/redline, exhaust, turbo, hybrid, gearbox, pops. |
| `drivetrain.js` (pure) | From speed, throttle, drift/wheelspin, contact: rpm, load, gear, ignition cut, turbo spool, whines, one-shot events (upshift crack, downshift blip, blow-off). Starter and shutdown sequences. |
| `dsp/engineSynth.js` (pure) | Per-sample engine + tyre synthesis, run by `engine.worklet.js` (AudioWorklet) and by Node tests. |
| `CarSound.js` | Owns the worklet node, feeds it drivetrain output each frame, pans by the car's screen position, exhaust directivity from the car's heading vs the camera, small room reverb. |
| `impacts.js` | Modal impact sounds per material (metal, plastic, wood, rubber, car body), pre-rendered into buffers. |
| `composer.js` (pure) + `StudioMusic.js` | Generative ambient-electronic music scheduled on the audio clock. |
| `TunnelAmbience.js` | Wind-tunnel fan and airflow following the wind-speed slider. |

## Engine synthesis

Physically informed, per sample:

- Each cylinder fires at its real crank angle (firing order, 720° cycle). The exhaust blowdown pulse has a steep
  front that sharpens with load, plus turbulent noise; amplitude varies cycle to cycle (more at idle).
- Cylinders feed their bank collector through runners of slightly different lengths, then a pipe waveguide with a
  lossy reflection and a muffler low-pass. Radiated sound = derivative of the outlet flow, plus some flow for the low end.
- Intake: suction pulses into an airbox (Helmholtz) resonance plus induction noise with throttle.
- Mechanical: combustion excites block resonances; valve ticks.
- Turbo whistle and whoosh from spool; hybrid (MGU-K) whine from speed and deploy/harvest; straight-cut gear whine.
- Overrun pops and crackles after lifting at high rpm; limiter and shift cuts drop combustion.
- Soft saturation, DC blocker. Exhaust brightness/level follows directivity.

Profiles: Ferrari 458 (flat-plane V8, 9000 rpm), Corvette C8 (cross-plane V8, uneven bank pulses), McLaren P1
(twin-turbo flat-plane V8, hybrid), Huracán EVO (V10, crackles), GT-R R35 (twin-turbo V6, blow-off), McLaren MP4/5
(V10 13000 rpm, manual box), F1-75 and MCL39 (1.6 V6 turbo hybrid), RB22 and VF-26 (2026: louder combustion, stronger
MGU-K), Mini Cooper S (inline 4, straight-cut gear whine).

## Drivetrain

- Driving speed tops out at 11 units/s after ~1.3 s, so each car gets 4–5 "audio gears" spread evenly over the speed
  range. Upshift point rises with throttle; downshifts under braking blip the throttle.
- Launch: clutch slip holds rpm near a launch value. Drift/wheelspin flares rpm. No wheel contact: free revs up to the
  limiter, which bounces. Reverse gear with its own ratio and whine.
- Shift styles: `dct` (short cut + crack at full throttle), `seamless` (F1: tiny cut), `manual` (MP4/5, Mini: lift).
- Enter Drive → starter (motor whine, compression wobble) → catch with a flare → idle. Exit Drive → shutdown.

## Tyres and impacts

- Squeal: tonal voice with wandering pitch and stick-slip roughness plus a noise band, from the wheels' skid values.
  Scrub noise with lateral sliding; rolling noise with speed.
- Impacts: Rapier collision-start events for the car and the desk props, strength from the relative velocity, material
  from the prop's `userData.collider.sound`; rate-limited per body.

## Studio

- Music: ~92 BPM, D minor/dorian. Warm detuned pads, a "telemetry" arpeggio through a ping-pong delay, sub bass,
  soft kick and hats, sparse control-room blips. Sections bring layers in and out; patterns mutate with a seeded RNG.
  Fades in on entering Studio, out on leaving.
- Tunnel: fan blade-pass tone, rumble and airflow that scale with the km/h slider; a faint hall hum at 0 km/h.

## UI

- Round speaker button next to ⓘ: mutes/unmutes everything (remembered).
- "Musica" switch in the wind-tunnel panel.

## Testing

- `drivetrain`: upshifts under throttle, blipped downshifts under braking, idle at rest, limiter bounce with no contact,
  reverse gear, starter → idle.
- `engines`: a valid profile for every car; firing angles in range and evenly spaced where the engine is even-firing.
- `engineSynth` rendered in Node: finite, bounded output; energy at the firing frequency; the cross-plane V8 has more
  half-order energy than the flat-plane V8.
- `composer`: notes stay in key; same seed → same bars.
- Offline renders (WAV + spectrogram) to check shifts and harmonics by eye; browser check that the worklet loads and
  produces signal.
