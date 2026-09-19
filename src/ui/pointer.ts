import { useEffect, type RefObject } from 'react'
import * as THREE from 'three'
import { CITIES } from '../data/cities'
import { clamp } from '../lib/mathf'
import { inputRotate, inputZoomDelta, beginDrag, endDrag, controls, ZOOM_MAX, ZOOM_MIN } from '../state/controls'
import { telemetry } from '../state/telemetry'
import { useStore } from '../state/store'

/**
 * 鼠标与触控降级方案：
 * 拖拽旋转（含惯性）/ 滚轮缩放 / 点击聚焦城市 / 双击空白复位 / 双指缩放。
 */
export function pickCityAt(x: number, y: number, radius: number): number {
  let best = -1
  let bestD = radius * radius
  for (let i = 0; i < CITIES.length; i++) {
    if (!telemetry.cityVisible[i]) continue
    const dx = telemetry.cityScreen[i * 2] - x
    const dy = telemetry.cityScreen[i * 2 + 1] - y
    const d2 = dx * dx + dy * dy
    if (d2 < bestD) {
      bestD = d2
      best = i
    }
  }
  return best
}

export function usePointerControls(holderRef: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const el = holderRef.current
    if (!el) return

    const pointers = new Map<number, { x: number; y: number }>()
    let dragging = false
    let lastX = 0
    let lastY = 0
    let lastT = 0
    let moved = 0
    let pinchDist0 = 1
    let pinchZoom0 = 4.6

    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* noop */
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pointers.size === 1) {
        dragging = true
        moved = 0
        lastX = e.clientX
        lastY = e.clientY
        lastT = performance.now()
        beginDrag()
        el.style.cursor = 'grabbing'
      } else if (pointers.size === 2) {
        dragging = false
        endDrag()
        moved = 999 // 捏合后不算点击
        const [a, b] = [...pointers.values()]
        pinchDist0 = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1)
        pinchZoom0 = controls.zoomTarget
      }
    }

    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && pointers.size === 0) {
        telemetry.mouse.active = true
        telemetry.mouse.x = e.clientX
        telemetry.mouse.y = e.clientY
        // 孤儿拖拽保护：down 状态已丢失但 dragging 仍为 true 时复位
        if (dragging) {
          dragging = false
          endDrag()
          el.style.cursor = 'grab'
        }
        return
      }
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()]
        const d = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1)
        controls.zoomTarget = clamp((pinchZoom0 * pinchDist0) / d, ZOOM_MIN, ZOOM_MAX)
        controls.lastInputAt = performance.now()
        return
      }

      if (!dragging) return
      const nowT = performance.now()
      const dt = Math.max((nowT - lastT) / 1000, 0.008)
      const dx = ((e.clientX - lastX) / el.clientHeight) * 4.4
      const dy = ((e.clientY - lastY) / el.clientHeight) * 4.0
      moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY)
      inputRotate(dx, dy, dt)
      lastX = e.clientX
      lastY = e.clientY
      lastT = nowT
    }

    const up = (e: PointerEvent) => {
      const wasPinching = pointers.size >= 2
      pointers.delete(e.pointerId)
      if (pointers.size === 0) {
        if (dragging) {
          dragging = false
          endDrag()
          el.style.cursor = 'grab'
          if (moved < 7 && !wasPinching) {
            const idx = pickCityAt(e.clientX, e.clientY, e.pointerType === 'mouse' ? 30 : 44)
            if (idx >= 0) useStore.getState().selectCity(CITIES[idx].id)
          }
        }
      } else if (pointers.size === 1) {
        // 捏合结束回到单指拖拽
        const [p] = [...pointers.values()]
        dragging = true
        moved = 999
        lastX = p.x
        lastY = p.y
        lastT = performance.now()
        beginDrag()
      }
    }

    const cancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size === 0 && dragging) {
        dragging = false
        endDrag()
        el.style.cursor = 'grab'
      }
    }

    const dbl = (e: MouseEvent) => {
      const idx = pickCityAt(e.clientX, e.clientY, 30)
      if (idx < 0) useStore.getState().selectCity(null)
    }

    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      inputZoomDelta(clamp(e.deltaY, -240, 240) * 0.0012)
    }

    const ctxMenu = (e: Event) => e.preventDefault()
    const leave = () => {
      telemetry.mouse.active = false
    }
    const blur = () => {
      // 窗口失焦时清除所有指针状态，防止拖拽卡死
      pointers.clear()
      if (dragging) {
        dragging = false
        endDrag()
        el.style.cursor = 'grab'
      }
    }
    const enter = () => {
      telemetry.mouse.active = true
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', cancel)
    el.addEventListener('dblclick', dbl)
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('contextmenu', ctxMenu)
    el.addEventListener('pointerleave', leave)
    el.addEventListener('pointerenter', enter)
    window.addEventListener('blur', blur)

    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', cancel)
      el.removeEventListener('dblclick', dbl)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('contextmenu', ctxMenu)
      el.removeEventListener('pointerleave', leave)
      el.removeEventListener('pointerenter', enter)
      window.removeEventListener('blur', blur)
    }
  }, [holderRef])
}

// three 引用保持（类型辅助）
void THREE
