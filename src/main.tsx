import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// 仅开发模式的帧驱动垫片：无头/遮挡环境下 requestAnimationFrame 与定时器会被浏览器暂停或节流，
// 访问 /?force-frames=1 可用定时器驱动渲染循环（按真实流逝时间补齐虚拟帧），便于自动化验证。正常使用不受影响。
if (import.meta.env.DEV && new URLSearchParams(location.search).has('force-frames')) {
  const w = window as unknown as {
    requestAnimationFrame: (cb: FrameRequestCallback) => number
    cancelAnimationFrame: (h: number) => void
  }
  const cbs = new Map<number, FrameRequestCallback>()
  let seq = 1
  w.requestAnimationFrame = (cb) => {
    const id = seq++
    cbs.set(id, cb)
    return id
  }
  w.cancelAnimationFrame = (h) => {
    cbs.delete(h)
  }
  let last = performance.now()
  let virtual = last
  const ff = (window as unknown as Record<string, unknown>).__ff = { paused: false }
  window.setInterval(() => {
    if ((ff as { paused: boolean }).paused) {
      last = performance.now()
      virtual = last
      return
    }
    const now = performance.now()
    const elapsed = now - last
    last = now
    // 按真实流逝时间补跑虚拟帧（每帧 16ms，单次最多 30 帧），并保证至少跑 1 帧
    const steps = Math.min(Math.max(Math.round(elapsed / 16), 1), 30)
    for (let i = 0; i < steps; i++) {
      virtual += 16
      for (const [id, cb] of [...cbs]) {
        cbs.delete(id)
        cb(virtual)
      }
    }
  }, 60)
}

createRoot(document.getElementById('root')!).render(<App />)
