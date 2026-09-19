/**
 * 从 world-atlas（Natural Earth 110m 陆地 TopoJSON）栅格化出 720×360（0.5°）陆地掩码，
 * 位打包后以 base64 写入 src/data/landMask.ts。运行时零外部依赖、零网络请求。
 *
 *   用法：先 npm install，再 `npm run generate:landmask`
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const topo = JSON.parse(readFileSync(resolve(root, 'node_modules/world-atlas/land-110m.json'), 'utf8'))

const W = 720
const H = 360
const STEP = 0.5

function decodeArcs(t) {
  const [sx, sy] = t.transform.scale
  const [tx, ty] = t.transform.translate
  return t.arcs.map((arc) => {
    let x = 0
    let y = 0
    return arc.map((p) => {
      x += p[0]
      y += p[1]
      return [x * sx + tx, y * sy + ty]
    })
  })
}

function collectRings(t) {
  const arcs = decodeArcs(t)
  const rings = []
  const obj = t.objects.land
  const geoms = obj.type === 'GeometryCollection' ? obj.geometries : [obj]
  for (const g of geoms) {
    if (!g) continue
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : []
    for (const poly of polys) {
      for (const ringIdx of poly) {
        const pts = []
        for (let k = 0; k < ringIdx.length; k++) {
          const idx = ringIdx[k]
          let seg = idx < 0 ? [...arcs[~idx]].reverse() : [...arcs[idx]]
          if (pts.length) seg = seg.slice(1)
          pts.push(...seg)
        }
        if (pts.length > 3) rings.push(pts)
      }
    }
  }
  return rings
}

const rings = collectRings(topo)
console.log('rings:', rings.length)

const bits = new Uint8Array(Math.ceil((W * H) / 8))
const setBit = (i) => {
  bits[i >> 3] |= 1 << (i & 7)
}

let oddRows = 0
for (let j = 0; j < H; j++) {
  const lat = 90 - (j + 0.5) * STEP
  const xs = []
  for (const ring of rings) {
    const n = ring.length
    for (let i = 0; i < n; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % n]
      const al = a[1]
      const bl = b[1]
      if (al > lat === bl > lat) continue
      let dl = b[0] - a[0]
      if (dl > 180) dl -= 360
      else if (dl < -180) dl += 360
      const t = (lat - al) / (bl - al)
      xs.push(a[0] + t * dl)
    }
  }
  if (xs.length % 2 !== 0) {
    oddRows++
    continue
  }
  xs.sort((p, q) => p - q)
  for (let k = 0; k < xs.length; k += 2) {
    const x0 = xs[k]
    const x1 = xs[k + 1]
    for (let ci = 0; ci < W; ci++) {
      const lon = -180 + (ci + 0.5) * STEP
      if (
        (lon >= x0 && lon <= x1) ||
        (lon + 360 >= x0 && lon + 360 <= x1) ||
        (lon - 360 >= x0 && lon - 360 <= x1)
      ) {
        setBit(j * W + ci)
      }
    }
  }
}

let landCount = 0
for (let i = 0; i < W * H; i++) if (bits[i >> 3] & (1 << (i & 7))) landCount++

const b64 = Buffer.from(bits).toString('base64')
const chunked = (b64.match(/.{1,96}/g) ?? []).map((s) => '  "' + s + '",').join('\n')

const out = `// 本文件由 scripts/generate-land-mask.mjs 自动生成：Natural Earth 110m 陆地轮廓，
// ${W}×${H} 网格（0.5°/格），每格 1 bit（1 = 陆地）。行主序，row 0 为北纬 +89.75°，LSB 在前。
// 重新生成：npm run generate:landmask（需要 devDependencies 中的 world-atlas）
export const MASK_W = ${W}
export const MASK_H = ${H}
export const LAND_CELLS = ${landCount}
export const LAND_BITS_B64 = [
${chunked}
].join('')
`

writeFileSync(resolve(root, 'src/data/landMask.ts'), out)
console.log('land cells:', landCount, `(${((landCount / (W * H)) * 100).toFixed(1)}%)`)
console.log('odd rows skipped:', oddRows)
console.log('base64 length:', b64.length)
