/**
 * Synthetic stereo impulse response for a ConvolverNode: decorrelated noise that fades out over `seconds` (RT60) and
 * gets darker as it fades, like air and soft surfaces absorbing the highs.
 * @param {BaseAudioContext} ctx
 * @param {{seconds?:number, damping?:number, predelay?:number}} [options] damping: starting low-pass (Hz)
 */
export function impulseResponse(ctx, { seconds = 1, damping = 7000, predelay = 0.01 } = {}) {
  const sr = ctx.sampleRate;
  const start = Math.floor(predelay * sr);
  const n = start + Math.floor(seconds * sr);
  const buffer = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = start; i < n; i++) {
      const t = (i - start) / sr;
      const cutoff = damping * Math.exp((-2.5 * t) / seconds) + 300;
      lp += (1 - Math.exp((-2 * Math.PI * cutoff) / sr)) * (Math.random() * 2 - 1 - lp);
      data[i] = lp * Math.exp((-6.9 * t) / seconds);
    }
  }
  return buffer;
}
