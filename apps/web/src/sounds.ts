let context: AudioContext | undefined

function audio() {
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

type Tone = {
  freq: number
  duration: number
  type?: OscillatorType
  gain?: number
  delay?: number
}

function tone({ freq, duration, type = 'triangle', gain = 0.05, delay = 0 }: Tone) {
  try {
    const ctx = audio()
    const start = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()

    osc.type = type
    osc.frequency.setValueAtTime(freq, start)
    amp.gain.setValueAtTime(0.0001, start)
    amp.gain.exponentialRampToValueAtTime(gain, start + 0.008)
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    osc.connect(amp).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + duration + 0.02)
  } catch {
    // audio is a nicety; never let it break the app
  }
}

export function playClick() {
  tone({ freq: 300, duration: 0.05, type: 'square', gain: 0.025 })
}

/** progress runs 0 → 1 as the wheel slows down, so the ticks climb in pitch. */
export function playTick(progress: number) {
  tone({ freq: 480 + progress * 280, duration: 0.045, type: 'square', gain: 0.02 })
}

export function playLand() {
  tone({ freq: 523.25, duration: 0.18, gain: 0.05 })
  tone({ freq: 783.99, duration: 0.3, gain: 0.045, delay: 0.09 })
}

/**
 * The last question needs no wheel, so it gets a fanfare instead of a landing:
 * a rising major arpeggio that resolves into a held chord. Deliberately longer
 * and brighter than playLand, so "that's the last one" is audible without
 * reading anything.
 */
export function playFinale() {
  const arpeggio = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  arpeggio.forEach((freq, index) => {
    tone({ freq, duration: 0.16, gain: 0.05, delay: index * 0.085 })
  })
  tone({ freq: 1046.5, duration: 0.75, gain: 0.05, delay: 0.35 }) // C6
  tone({ freq: 1318.51, duration: 0.75, gain: 0.038, delay: 0.39 }) // E6
  tone({ freq: 1567.98, duration: 0.65, gain: 0.028, delay: 0.43 }) // G6
}
