import { create } from 'zustand'
import { flyToCity, flyToOverview, controls } from './controls'
import { playSelectBlip } from '../lib/audio'

export type CameraStatus = 'off' | 'requesting' | 'online' | 'denied' | 'missing' | 'busy' | 'insecure' | 'error'
export type EngineStatus = 'off' | 'loading' | 'ready' | 'error'
export type GestureKind = 'none' | 'open' | 'pinch' | 'point' | 'fist'

export type Sensitivity = 'low' | 'standard' | 'high'

export interface Settings {
  debugVideo: boolean
  sound: boolean
  autoRotate: boolean
  sensitivity: Sensitivity
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error'
}

interface AppState {
  overlayOpen: boolean
  bootError: string | null
  cameraStatus: CameraStatus
  engineStatus: EngineStatus
  gesture: GestureKind
  tracking: boolean
  settings: Settings
  selectedCityId: string | null
  hoverCityId: string | null
  reducedMotion: boolean
  toasts: Toast[]
  setOverlayOpen: (open: boolean) => void
  setBootError: (msg: string | null) => void
  setCameraStatus: (s: CameraStatus) => void
  setEngineStatus: (s: EngineStatus) => void
  setGesture: (g: GestureKind) => void
  setTracking: (v: boolean) => void
  patchSettings: (p: Partial<Settings>) => void
  selectCity: (id: string | null) => void
  setHover: (id: string | null) => void
  setReducedMotion: (v: boolean) => void
  pushToast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void
}

let toastSeq = 1

export const useStore = create<AppState>()((set, get) => ({
  overlayOpen: true,
  bootError: null,
  cameraStatus: 'off',
  engineStatus: 'off',
  gesture: 'none',
  tracking: false,
  settings: { debugVideo: false, sound: false, autoRotate: true, sensitivity: 'high' },
  selectedCityId: null,
  hoverCityId: null,
  reducedMotion: false,
  toasts: [],

  setOverlayOpen: (open) => set({ overlayOpen: open, bootError: open ? get().bootError : null }),
  setBootError: (msg) => set({ bootError: msg }),
  setCameraStatus: (s) => set({ cameraStatus: s }),
  setEngineStatus: (s) => set({ engineStatus: s }),
  setGesture: (g) => set({ gesture: g }),
  setTracking: (v) => set({ tracking: v }),

  patchSettings: (p) => set({ settings: { ...get().settings, ...p } }),

  selectCity: (id) => {
    if (get().selectedCityId === id && id === null) return
    set({ selectedCityId: id })
    controls.selectedCityId = id
    if (id) {
      flyToCity(id)
      playSelectBlip()
    } else {
      flyToOverview()
    }
  },

  setHover: (id) => {
    if (get().hoverCityId !== id) set({ hoverCityId: id })
  },

  setReducedMotion: (v) => {
    set({ reducedMotion: v })
    controls.reduced = v
  },

  pushToast: (text, tone = 'info') => {
    const id = toastSeq++
    set({ toasts: [...get().toasts.slice(-3), { id, text, tone }] })
    window.setTimeout(() => get().dismissToast(id), 4400)
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))
