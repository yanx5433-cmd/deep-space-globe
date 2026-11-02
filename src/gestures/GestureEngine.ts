import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { analyze, mirrorPts, type GestureKind, type Landmark } from './classify'
import { beginDrag, endDrag, inputRotate, inputZoomDelta, setPinchZoom, controls, ZOOM_MAX, ZOOM_MIN } from '../state/controls'
import { clamp } from '../lib/mathf'
import { telemetry } from '../state/telemetry'
import { useStore } from '../state/store'
import { updateCrosshair, uiRegistry } from '../state/uiRegistry'
import { CITIES } from '../data/cities'

/**
 * MediaPipe HandLandmarker 手势引擎。
 * - 推理节流 ~30 FPS（setInterval + 视频帧变化检测）
 * - 最近 7 帧投票 + 手势切换冷却 260ms
 * - EMA 平滑（手掌中心 / 捏合距离 / 指尖）
 * - 死区、速度上限、低通滤波与惯性
 * - 丢帧保护：连续丢帧冻结状态，静置后自动旋转恢复
 */

/** 部署基路径（GitHub Pages 子路径 / 本地根路径均可用） */
const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`

const LOCAL_WASM = `${BASE}mediapipe/wasm`
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const LOCAL_MODEL = `${BASE}models/hand_landmarker.task`
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const VOTE_LEN = 4
const VOTE_NEED = 2
const SWITCH_COOLDOWN_MS = 90
const MIN_PALM = 0.03
/** 握拳持续缩小速度（每秒缩放对数） */
const FIST_ZOOM_SPEED = 0.62
/** 握拳保持该时长后重置视角 */
const FIST_RESET_MS = 2000
const DWELL_MS = 500
const DWELL_RADIUS = 46
const SELECT_COOLDOWN_MS = 1300

/**
 * 灵敏度档位：
 * - deltaAlpha：手掌位移滤波强度（越大越跟手）
 * - rotK/tiltK：手掌位移 → 旋转弧度
 * - maxStep：单帧旋转上限（防止快速甩手跳变）
 * - pinchGain/pinchEma：捏合缩放灵敏度
 * - openZoomRate：张开手掌保持不动时的放大速率（缩放对数/秒）
 * - stillMove：判定"手停住"的单帧位移阈值
 * - smoothK：相机/地球阻尼倍率
 */
const PROFILES = {
  low: { deltaAlpha: 0.5, rotK: 5.5, tiltK: 5.0, maxStep: 0.10, pinchGain: 6.5, pinchEma: 0.32, openZoomRate: 0.28, stillMove: 0.0022, smoothK: 0.7 },
  standard: { deltaAlpha: 0.66, rotK: 7.5, tiltK: 6.4, maxStep: 0.16, pinchGain: 9.0, pinchEma: 0.5, openZoomRate: 0.42, stillMove: 0.003, smoothK: 1 },
  high: { deltaAlpha: 0.82, rotK: 9.5, tiltK: 8.0, maxStep: 0.24, pinchGain: 12.0, pinchEma: 0.65, openZoomRate: 0.6, stillMove: 0.004, smoothK: 1.3 },
} as const

type Profile = (typeof PROFILES)[keyof typeof PROFILES]

export type CameraFailStatus = 'denied' | 'missing' | 'busy' | 'insecure' | 'error'

export class GestureError extends Error {
  status: CameraFailStatus
  constructor(message: string, status: CameraFailStatus = 'error') {
    super(message)
    this.status = status
  }
}

type EnableResult = { ok: true } | { ok: false; reason: string; status: CameraFailStatus }

export class GestureEngine {
  private video: HTMLVideoElement | null = null
  private stream: MediaStream | null = null
  private landmarker: HandLandmarker | null = null
  private timer: number | null = null
  private running = false

  private pts: Landmark[] = []
  private vote: GestureKind[] = []
  private stable: GestureKind = 'none'
  private lastSwitchAt = 0
  private profile: Profile = PROFILES.high
  private unsubscribe: (() => void) | null = null
  private frameHandle: number | null = null
  private lastFrameAt = 0

  /** 手掌运动：原始上一帧位置 + 低通滤波后的位移（保留幅度，滤除抖动） */
  private palmRaw = { x: 0.5, y: 0.5 }
  private palmDelta = { x: 0, y: 0 }
  private palmInit = false
  /** 手掌位移速度 EMA：用于判定"手停住"（张开手掌停住 → 放大） */
  private moveEma = 0
  private pinchEma = 0
  private pinchBaseDist = 0
  private pinchBaseZoom = 0
  private pinchCalibrated = false
  private tipEma = { x: 0, y: 0 }
  private tipInit = false

  private dwellIdx = -1
  private dwellMs = 0
  private dwellArmed = true
  private lastSelectAt = 0
  private fistMs = 0
  private fistFired = false
  /** 最近一次稳定处于"张开手掌"的时间戳：用于阻止张开→握拳过渡被误判为捏合缩放 */
  private lastOpenStableAt = -1e9
  private lostFrames = 99
  private lastVideoTime = -1
  private lastT = 0
  private debugCtx: CanvasRenderingContext2D | null = null

  get active(): boolean {
    return this.running
  }

  /** 供调试面板复用的摄像头流 */
  get streamForDebug(): MediaStream | null {
    return this.stream
  }

  async enable(): Promise<EnableResult> {
    if (this.running) return { ok: true }
    const store = useStore.getState()
    store.setBootError(null)
    store.setEngineStatus('loading')
    store.setCameraStatus('requesting')

    try {
      await this.openCamera()
    } catch (e) {
      const status = e instanceof GestureError ? e.status : 'error'
      const msg = e instanceof Error ? e.message : '摄像头启动失败，已切换为鼠标模式'
      useStore.getState().setCameraStatus(status)
      useStore.getState().setEngineStatus('error')
      return { ok: false, reason: msg, status }
    }

    try {
      await this.loadModel()
    } catch (e) {
      this.stopCamera()
      const msg = '手势模型加载失败（检查网络），已切换为鼠标模式'
      useStore.getState().setCameraStatus('off')
      useStore.getState().setEngineStatus('error')
      return { ok: false, reason: msg, status: 'error' }
    }

    useStore.getState().setCameraStatus('online')
    useStore.getState().setEngineStatus('ready')
    useStore.getState().setTracking(false)
    this.applySensitivity(useStore.getState().settings.sensitivity)
    this.unsubscribe = useStore.subscribe((s, prev) => {
      if (s.settings.sensitivity !== prev.settings.sensitivity) {
        this.applySensitivity(s.settings.sensitivity)
      }
    })
    this.running = true
    this.lastT = performance.now()
    this.startLoop()
    return { ok: true }
  }

  private applySensitivity(level: keyof typeof PROFILES): void {
    this.profile = PROFILES[level] ?? PROFILES.standard
    controls.smoothK = this.profile.smoothK
  }

  /**
   * 逐帧推理：优先使用 requestVideoFrameCallback（摄像头每出一帧就处理，
   * 没有轮询漂移，延迟最低）；不支持时退回 30fps 定时器。
   */
  private startLoop(): void {
    const video = this.video as (HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number
    }) | null
    if (!video) return

    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFrame = () => {
        if (!this.running) return
        this.tick()
        if (this.running) this.frameHandle = video.requestVideoFrameCallback!(onFrame)
      }
      this.frameHandle = video.requestVideoFrameCallback(onFrame)
    } else {
      const loop = () => {
        if (!this.running) return
        this.tick()
        this.timer = window.setTimeout(loop, 28)
      }
      this.timer = window.setTimeout(loop, 28)
    }
  }

  private stopLoop(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      window.clearInterval(this.timer)
      this.timer = null
    }
    const video = this.video as (HTMLVideoElement & {
      cancelVideoFrameCallback?: (h: number) => void
    }) | null
    if (video && this.frameHandle !== null && typeof video.cancelVideoFrameCallback === 'function') {
      video.cancelVideoFrameCallback(this.frameHandle)
    }
    this.frameHandle = null
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  private mapStatus(s: string): CameraFailStatus {
    switch (s) {
      case 'denied':
      case 'missing':
      case 'busy':
      case 'insecure':
        return s
      default:
        return 'error'
    }
  }

  private async openCamera(): Promise<void> {
    if (!window.isSecureContext) {
      throw new GestureError('需要 HTTPS 或 localhost 环境才能使用摄像头，已切换为鼠标模式', 'insecure')
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new GestureError('当前浏览器不支持摄像头访问，已切换为鼠标模式', 'missing')
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      })
    } catch (e) {
      const name = (e as DOMException)?.name
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new GestureError('摄像头权限被拒绝，已切换为鼠标模式。可在浏览器地址栏重新授权', 'denied')
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        throw new GestureError('未检测到可用摄像头设备，已切换为鼠标模式', 'missing')
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        throw new GestureError('摄像头被其他应用占用，已切换为鼠标模式', 'busy')
      }
      throw new GestureError('摄像头启动失败，已切换为鼠标模式')
    }
    this.stream = stream

    const video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.style.cssText =
      'position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;transform:scaleX(-1);'
    document.body.appendChild(video)
    video.srcObject = stream
    await new Promise<void>((resolve, reject) => {
      const to = window.setTimeout(() => reject(new GestureError('摄像头画面超时，已切换为鼠标模式')), 8000)
      video.onloadedmetadata = () => {
        window.clearTimeout(to)
        resolve()
      }
      video.onerror = () => {
        window.clearTimeout(to)
        reject(new GestureError('摄像头画面异常，已切换为鼠标模式'))
      }
    })
    try {
      await video.play()
    } catch {
      /* 部分浏览器已自动播放 */
    }
    this.video = video
  }

  private async loadModel(): Promise<void> {
    const wasmBases = [LOCAL_WASM, CDN_WASM]
    const modelUrls = [LOCAL_MODEL, CDN_MODEL]
    let lastErr: unknown = null
    for (const base of wasmBases) {
      for (const model of modelUrls) {
        try {
          const fileset = await FilesetResolver.forVisionTasks(base)
          try {
            this.landmarker = await HandLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: model, delegate: 'GPU' },
              runningMode: 'VIDEO',
              numHands: 1,
              minHandDetectionConfidence: 0.4,
              minHandPresenceConfidence: 0.4,
              minTrackingConfidence: 0.45,
            })
            return
          } catch (gpuErr) {
            // GPU 委托失败，回退 CPU
            this.landmarker = await HandLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: model, delegate: 'CPU' },
              runningMode: 'VIDEO',
              numHands: 1,
            })
            return
          }
        } catch (e) {
          lastErr = e
        }
      }
    }
    throw lastErr ?? new Error('model load failed')
  }

  disable(): void {
    this.running = false
    this.stopLoop()
    controls.smoothK = 1
    this.stopCamera()
    try {
      this.landmarker?.close()
    } catch {
      /* noop */
    }
    this.landmarker = null
    const store = useStore.getState()
    store.setCameraStatus('off')
    store.setEngineStatus('off')
    store.setGesture('none')
    store.setTracking(false)
    updateCrosshair(0, 0, false, 0, '', false)
  }

  private stopCamera(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    if (this.video) {
      this.video.srcObject = null
      this.video.remove()
      this.video = null
    }
  }

  private tick(): void {
    const video = this.video
    if (!video || !this.landmarker || video.readyState < 2) return
    if (video.currentTime === this.lastVideoTime) return
    this.lastVideoTime = video.currentTime

    let result: HandLandmarkerResult
    try {
      result = this.landmarker.detectForVideo(video, performance.now())
    } catch {
      this.onLost()
      return
    }
    const t = performance.now()
    const dtMs = Math.min(Math.max(t - this.lastT, 4), 120)
    this.lastT = t

    const lms = result?.landmarks
    if (!lms || lms.length === 0) {
      this.onLost()
      return
    }
    const lm = mirrorPts(lms[0], this.pts)
    const a = analyze(lm, this.stable)
    if (a.palmSize < MIN_PALM) {
      // 手太远，视为不可靠帧
      this.onLost()
      return
    }
    this.lostFrames = 0
    if (!useStore.getState().tracking) useStore.getState().setTracking(true)
    this.drawDebug(lm)
    this.processGesture(a, dtMs, t)
  }
  private onLost(): void {
    this.lostFrames++
    if (this.lostFrames === 3) {
      useStore.getState().setTracking(false)
      useStore.getState().setGesture('none')
      endDrag()
      updateCrosshair(0, 0, false, 0, '', false)
      this.dwellIdx = -1
      this.dwellMs = 0
    }
  }

  private processGesture(a: ReturnType<typeof analyze>, dtMs: number, t: number): void {
    // --- 投票（含捏合意图门控） ---
    let kind = a.kind
    if (kind === 'pinch' && this.stable !== 'pinch') {
      // 刚从"张开手掌"收拢手的 500ms 内：只有食指明显伸直且捏得很紧
      // （明确的捏合起始动作）才允许进入缩放，否则视为向握拳过渡，不动作。
      const sinceOpen = t - this.lastOpenStableAt
      if (sinceOpen < 500 && !(a.pinchDist < 0.45 && a.indexRatio > 1.28)) {
        kind = 'none'
      }
    }
    this.vote.push(kind)
    if (this.vote.length > VOTE_LEN) this.vote.shift()
    const counts = new Map<GestureKind, number>()
    for (const k of this.vote) counts.set(k, (counts.get(k) ?? 0) + 1)
    let top: GestureKind = 'none'
    let topN = 0
    for (const [k, n] of counts) {
      if (n > topN) {
        top = k
        topN = n
      }
    }
    if (topN >= VOTE_NEED && top !== this.stable && t - this.lastSwitchAt > SWITCH_COOLDOWN_MS) {
      const prev = this.stable
      this.stable = top
      this.lastSwitchAt = t
      this.onGestureChange(prev, top)
    }
    const g = this.stable
    useStore.getState().setGesture(g)
    if (g === 'open') this.lastOpenStableAt = t

    switch (g) {
      case 'open': {
        beginDrag()
        const P = this.profile
        if (!this.palmInit) {
          this.palmRaw.x = a.palm.x
          this.palmRaw.y = a.palm.y
          this.palmDelta.x = 0
          this.palmDelta.y = 0
          this.moveEma = 0
          this.palmInit = true
          break
        }
        // 原始位移 → 低通滤波：保留主要幅度（跟手），滤除手部抖动
        const rawDx = a.palm.x - this.palmRaw.x
        const rawDy = a.palm.y - this.palmRaw.y
        this.palmRaw.x = a.palm.x
        this.palmRaw.y = a.palm.y
        this.palmDelta.x += (rawDx - this.palmDelta.x) * P.deltaAlpha
        this.palmDelta.y += (rawDy - this.palmDelta.y) * P.deltaAlpha
        // 手部移动速度（用于区分"旋转"和"停住放大"）
        const moveMag = Math.hypot(rawDx, rawDy)
        this.moveEma += (moveMag - this.moveEma) * 0.4

        let dx = this.palmDelta.x * P.rotK
        let dy = this.palmDelta.y * P.tiltK
        // 死区
        if (Math.abs(this.palmDelta.x) < 0.0022) dx = 0
        if (Math.abs(this.palmDelta.y) < 0.0022) dy = 0
        // 单帧上限，避免甩手跳变
        const mag = Math.hypot(dx, dy)
        if (mag > P.maxStep) {
          dx = (dx / mag) * P.maxStep
          dy = (dy / mag) * P.maxStep
        }
        if (dx !== 0 || dy !== 0) inputRotate(dx, dy, dtMs / 1000)

        // 张开手掌且手停住 → 持续放大（张开手掌 = 放大）
        if (this.moveEma < P.stillMove) {
          inputZoomDelta(-P.openZoomRate * (dtMs / 1000))
        }
        break
      }
      case 'pinch': {
        endDrag()
        if (!this.pinchCalibrated) {
          // 进入手势的首帧标定基准，避免识别误差导致缩放跳变
          this.pinchEma = a.pinchDist
          this.pinchBaseDist = a.pinchDist
          this.pinchBaseZoom = controls.zoomTarget
          this.pinchCalibrated = true
          break
        }
        this.pinchEma += (a.pinchDist - this.pinchEma) * this.profile.pinchEma
        // 以进入手势时的距离为基准做相对连续缩放
        const zoom = this.pinchBaseZoom + (this.pinchBaseDist - this.pinchEma) * this.profile.pinchGain
        setPinchZoom(clamp(zoom, ZOOM_MIN, ZOOM_MAX))
        break
      }
      case 'point': {
        endDrag()
        if (!this.tipInit) {
          this.tipEma.x = a.tip.x
          this.tipEma.y = a.tip.y
          this.tipInit = true
        }
        this.tipEma.x += (a.tip.x - this.tipEma.x) * 0.35
        this.tipEma.y += (a.tip.y - this.tipEma.y) * 0.35
        const sx = this.tipEma.x * window.innerWidth
        const sy = this.tipEma.y * window.innerHeight
        this.updateDwell(sx, sy, dtMs, t)
        break
      }
      case 'fist': {
        endDrag()
        this.fistMs += dtMs
        // 握拳：持续缩小（拉远）
        inputZoomDelta(FIST_ZOOM_SPEED * (dtMs / 1000))
        // 保持 2 秒：重置为全球视角并清除选中
        if (this.fistMs >= FIST_RESET_MS && !this.fistFired) {
          this.fistFired = true
          useStore.getState().selectCity(null)
        }
        break
      }
      default:
        endDrag()
        break
    }
  }

  private onGestureChange(prev: GestureKind, next: GestureKind): void {
    if (prev !== 'open') {
      this.palmInit = false
      this.moveEma = 0
    }
    if (next === 'open') {
      // 重新进入张开手势时，先重置位移基准，避免切换瞬间跳变
      this.palmInit = false
      this.palmDelta.x = 0
      this.palmDelta.y = 0
    }
    if (next === 'pinch') {
      this.pinchCalibrated = false
    }
    if (prev === 'point') {
      this.tipInit = false
      this.dwellIdx = -1
      this.dwellMs = 0
      updateCrosshair(0, 0, false, 0, '', false)
    }
    if (next !== 'fist') {
      // 离开握拳手势时复位保持计时
      this.fistMs = 0
      this.fistFired = false
    }
  }

  private updateDwell(sx: number, sy: number, dtMs: number, t: number): void {
    let best = -1
    let bestD = DWELL_RADIUS * DWELL_RADIUS
    for (let i = 0; i < CITIES.length; i++) {
      if (!telemetry.cityVisible[i]) continue
      const dx = telemetry.cityScreen[i * 2] - sx
      const dy = telemetry.cityScreen[i * 2 + 1] - sy
      const d2 = dx * dx + dy * dy
      if (d2 < bestD) {
        bestD = d2
        best = i
      }
    }
    if (best >= 0 && best !== this.dwellIdx) {
      this.dwellIdx = best
      this.dwellMs = 0
    } else if (best < 0) {
      this.dwellIdx = -1
      this.dwellMs = 0
      this.dwellArmed = true
    }

    let progress = 0
    if (this.dwellIdx >= 0 && this.dwellArmed && t - this.lastSelectAt > SELECT_COOLDOWN_MS) {
      this.dwellMs += dtMs
      progress = this.dwellMs / DWELL_MS
      if (this.dwellMs >= DWELL_MS) {
        this.lastSelectAt = t
        this.dwellArmed = false
        this.dwellMs = 0
        useStore.getState().selectCity(CITIES[this.dwellIdx].id)
      }
    } else if (this.dwellIdx >= 0) {
      progress = this.dwellMs / DWELL_MS
    }

    const label = this.dwellIdx >= 0 ? CITIES[this.dwellIdx].zh : ''
    updateCrosshair(sx, sy, true, progress, label, this.dwellIdx >= 0)
  }

  private drawDebug(lm: Landmark[]): void {
    const canvas = uiRegistry.debugCanvas
    if (!canvas || !canvas.isConnected) return
    if (!this.debugCtx || this.debugCtx.canvas !== canvas) this.debugCtx = canvas.getContext('2d')
    const ctx = this.debugCtx
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const CONN = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ]
    ctx.strokeStyle = 'rgba(127, 208, 255, 0.85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (const [a, b] of CONN) {
      ctx.moveTo(lm[a].x * w, lm[a].y * h)
      ctx.lineTo(lm[b].x * w, lm[b].y * h)
    }
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 210, 138, 0.95)'
    for (const p of lm) {
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

let engine: GestureEngine | null = null

export function getGestureEngine(): GestureEngine {
  if (!engine) engine = new GestureEngine()
  return engine
}

// 仅开发模式：暴露分类器供合成手势样本的自动化测试
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__globeClassify = analyze
}
