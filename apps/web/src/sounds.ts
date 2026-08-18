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
