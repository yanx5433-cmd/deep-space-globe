/**
 * 从 21 个手部关键点分类手势。所有坐标已镜像（x = 1 - 原始 x），
 * 与屏幕镜像显示方向一致。
 *
 * 设计要点：
 * - 伸展/蜷缩用双阈值（>1.10 伸展，<0.95 蜷缩），介于两者之间的过渡姿态
 *   一律返回 'none'（不动作，由投票保持现状），避免张开↔握拳过渡被误判为捏合。
 * - analyze 接收上一个稳定手势 prev：已处于捏合时放宽距离门槛，
 *   保证缩放过程中张开到很大也不会中断。
 */

export interface Landmark {
  x: number
  y: number
  z: number
}

export type GestureKind = 'none' | 'open' | 'pinch' | 'point' | 'fist'

export interface HandAnalysis {
  kind: GestureKind
  /** 手掌中心（0..1 屏幕比例，已镜像） */
  palm: { x: number; y: number }
  /** 食指指尖 */
  tip: { x: number; y: number }
  /** 拇指-食指距离 / 手掌尺寸（无量纲） */
  pinchDist: number
  /** 食指伸展比例（指尖距腕 / 中节距腕），用于意图门控 */
  indexRatio: number
  /** 手掌尺寸（腕→中指根），用于置信度过滤 */
  palmSize: number
}

const WRIST = 0
const THUMB_TIP = 4
const THUMB_MCP = 2
const INDEX_MCP = 5
const MIDDLE_MCP = 9
const INDEX_PIP = 6
const INDEX_TIP = 8
const MIDDLE_PIP = 10
const RING_PIP = 14
const PINKY_PIP = 18

const EXT_RATIO = 1.1
const CURL_RATIO = 0.95

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

function mirrorPts(src: Landmark[], out: Landmark[]): Landmark[] {
  for (let i = 0; i < src.length; i++) {
    const s = src[i]
    const o = out[i] ?? (out[i] = { x: 0, y: 0, z: 0 })
    o.x = 1 - s.x
    o.y = s.y
    o.z = s.z
  }
  return out
}

export { mirrorPts }

export function analyze(lm: Landmark[], prev: GestureKind = 'none'): HandAnalysis {
  const wrist = lm[WRIST]
  const palmSize = Math.max(dist(wrist, lm[MIDDLE_MCP]), 1e-4)

  // 各手指（指尖距腕 / 中节距腕）比例：>1.1 伸展，<0.95 蜷缩
  const ratio = (tip: number, pip: number) =>
    dist(lm[tip], wrist) / Math.max(dist(lm[pip], wrist), 1e-4)
  const rI = ratio(INDEX_TIP, INDEX_PIP)
  const rM = ratio(12, MIDDLE_PIP)
  const rR = ratio(16, RING_PIP)
  const rP = ratio(20, PINKY_PIP)
  const index = rI > EXT_RATIO
  const extended = (index ? 1 : 0) + (rM > EXT_RATIO ? 1 : 0) + (rR > EXT_RATIO ? 1 : 0) + (rP > EXT_RATIO ? 1 : 0)

  const thumbExt = dist(lm[THUMB_TIP], lm[MIDDLE_MCP]) > dist(lm[THUMB_MCP], lm[MIDDLE_MCP]) * 1.05
  const pinchDist = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / palmSize

  // 其余三指蜷缩是"捏合/指向/握拳"的共同特征
  const threeCurled = rM < CURL_RATIO && rR < CURL_RATIO && rP < CURL_RATIO

  let kind: GestureKind
  if (extended >= 3 || (prev === 'open' && extended >= 2 && !threeCurled)) {
    // 张开手掌（≥3 指伸展即可，拇指不计）：旋转，优先级最高。
    // 滞回：已经在旋转时容忍 1 指模糊，避免手部轻微变形就中断旋转。
    kind = 'open'
  } else if (threeCurled && rI < 1.05) {
    // 握拳（其余三指蜷缩且食指不再明显伸出）
    kind = 'fist'
  } else if (index && threeCurled) {
    // 食指单独伸出：拇指张开且食指伸直、两指靠近 → 捏合缩放；否则 → 指向。
    // 门槛收紧（rI>1.2、dist<0.6），确保收拢手的过渡不可能进入缩放。
    if (thumbExt && rI > 1.2 && (pinchDist < 0.6 || prev === 'pinch')) kind = 'pinch'
    else kind = 'point'
  } else {
    // 过渡姿态（半伸半缩）：不产生任何动作
    kind = 'none'
  }

  const palm = {
    x: (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5,
    y: (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5,
  }
  const tip = { x: lm[INDEX_TIP].x, y: lm[INDEX_TIP].y }

  return { kind, palm, tip, pinchDist, indexRatio: rI, palmSize }
}
