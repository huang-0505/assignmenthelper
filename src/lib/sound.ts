// Two knocks on a wooden door, synthesized so nothing has to be downloaded. Off unless she turns it on.
let context: AudioContext | null = null;

/** Browsers only start audio after a click; call this from the button that starts the session. */
export function primeKnock() {
  try {
    context ??= new AudioContext();
    void context.resume();
  } catch {
    context = null;
  }
}
export function knock() {
  if (!context || context.state !== "running") return;
  const start = context.currentTime;
  for (const delay of [0, 0.17]) {
    const t = start + delay;
    const osc = context.createOscillator(),
      filter = context.createBiquadFilter(),
      gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.08);
    filter.type = "lowpass";
    filter.frequency.value = 700;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.45, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(filter).connect(gain).connect(context.destination);
    osc.start(t);
    osc.stop(t + 0.14);
  }
}
