// RT block (read 0x17 / write 0x27): 8 bytes per key at 8*pos, from driveall's getSenRt:
// [0] switch type (1 Seawood/Smoke Cloud, 2 Magnetic Jade Pro, 3 Magneto Shaft)
// [1] flags: bit0 full-distance rapid trigger, bit1 bottom-out tolerance, bit2 high-precision mode
// [2..3] actuation point, [4..5] RT press sensitivity, [6..7] RT release sensitivity — all u16 LE in 0.01 mm.
// Rapid trigger is "on" when press/release sensitivity are non-zero (driveall's Fast Trigger toggle).

export const SWITCHES = [
  { id: 1, name: 'Smoke Cloud (Seawood)', trip: 3.5 },
  { id: 2, name: 'Magnetic Jade Pro', trip: 3.3 },
  { id: 3, name: 'Magneto Shaft', trip: 3.4 },
]
export const DEFAULT_ACTUATION = 1.2
export const DEFAULT_SENSITIVITY = 0.1
export const MIN_SENSITIVITY = 0.02
export const MIN_ACTUATION = 0.1

export type KeyRT = {
  switchType: number
  actuation: number // mm
  rapidTrigger: boolean
  press: number // mm
  release: number // mm
  fullDistance: boolean
  bottomOut: boolean
}

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const mm = (v: number) => Math.round(v * 100)

export function decodeRT(b: Uint8Array, pos: number): KeyRT {
  const o = 8 * pos
  const press = u16(b, o + 4) / 100
  const release = u16(b, o + 6) / 100
  return {
    switchType: b[o],
    actuation: u16(b, o + 2) / 100,
    rapidTrigger: press > 0 || release > 0,
    press,
    release,
    fullDistance: !!(b[o + 1] & 1),
    bottomOut: !!(b[o + 1] & 2),
  }
}

export function withRT(b: Uint8Array, positions: number[], rt: KeyRT) {
  const out = b.slice()
  for (const pos of positions) {
    const o = 8 * pos
    const press = rt.rapidTrigger ? mm(rt.press) : 0
    const release = rt.rapidTrigger ? mm(rt.release) : 0
    const act = mm(rt.actuation)
    out[o] = rt.switchType
    out[o + 1] = (out[o + 1] & 4) | (rt.rapidTrigger && rt.fullDistance ? 1 : 0) | (rt.rapidTrigger && rt.bottomOut ? 2 : 0)
    out.set([act & 0xff, act >> 8, press & 0xff, press >> 8, release & 0xff, release >> 8], o + 2)
  }
  return out
}
