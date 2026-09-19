/**
 * 极简合成音频：默认关闭。环境音为低频正弦叠加，交互音为短促上滑音。
 * AudioContext 在用户点击（设置开关）时创建，满足自动播放策略。
 */
let ctx: AudioContext | null = null
let master: GainNode | null = null
let ambientOn = false
let enabled = false
const ambientNodes: OscillatorNode[] = []

function ensureCtx(): AudioContext | null {
  if (ctx) return ctx
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
  } catch {
    ctx = null
  }
  return ctx
}

function startAmbient(): void {
  const c = ensureCtx()
  if (!c || !master || ambientOn) return
  void c.resume()
  ambientOn = true

  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 260
  filter.connect(master)

  const amb = c.createGain()
  amb.gain.value = 0
  amb.connect(filter)
  amb.gain.linearRampToValueAtTime(0.05, c.currentTime + 2.2)

  const specs: Array<[number, OscillatorType, number]> = [
    [54, 'sine', 0.5],
    [81.5, 'sine', 0.3],
    [162.5, 'triangle', 0.10],
    [108.7, 'sine', 0.14],
  ]
  for (const [freq, type, gain] of specs) {
    const osc = c.createOscillator()
    osc.type = type
    osc.frequency.value = freq
    const g = c.createGain()
    g.gain.value = gain
    osc.connect(g)
    g.connect(amb)
    osc.start()
    ambientNodes.push(osc)
  }

  // 极慢呼吸 LFO，避免死寂
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.05
  const lfoGain = c.createGain()
  lfoGain.gain.value = 0.016
  lfo.connect(lfoGain)
  lfoGain.connect(amb.gain)
  lfo.start()
  ambientNodes.push(lfo)
}

function stopAmbient(): void {
  if (!ctx || !ambientOn) return
  ambientOn = false
  for (const o of ambientNodes) {
    try {
      o.stop(ctx.currentTime + 1)
    } catch {
      /* noop */
    }
  }
  ambientNodes.length = 0
}

export function setSoundEnabled(on: boolean): void {
  enabled = on
  if (on) startAmbient()
  else stopAmbient()
}

/** 城市选中提示音（两段上滑） */
export function playSelectBlip(): void {
  if (!enabled || !ctx || !master) return
  const c = ctx
  const blip = (t0: number, f0: number, f1: number, gain: number) => {
    const osc = c.createOscillator()
    osc.type = 'sine'
    const g = c.createGain()
    osc.frequency.setValueAtTime(f0, t0)
    osc.frequency.exponentialRampToValueAtTime(f1, t0 + 0.11)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32)
    osc.connect(g)
    g.connect(master!)
    osc.start(t0)
    osc.stop(t0 + 0.36)
  }
  const t = c.currentTime
  blip(t, 720, 1240, 0.05)
  blip(t + 0.09, 980, 1560, 0.035)
}
