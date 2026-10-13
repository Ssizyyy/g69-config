// 16-byte LED block (read 0x13 / write 0x23), from driveall's getSendReportAll:
// [0] effect (0 = off) [1..3] RGB [4]=0xFF [5..7] secondary RGB [8] colour mode (kept as read)
// [9] brightness 0-5 [10] speed 0-5 [11] direction [12] gear mode [14..15] = 0xAA 0x55 (added by the HID layer)

export type Effect = { id: number; name: string; speed: boolean; direction: boolean; color: boolean }

const fx = (id: number, name: string, speed = true, direction = false, color = true): Effect => ({ id, name, speed, direction, color })

export const EFFECTS: Effect[] = [
  fx(0x01, 'Static', false),
  fx(0x02, 'Single point on'),
  fx(0x03, 'Single point off'),
  fx(0x04, 'Starry sky'),
  fx(0x05, 'Snowfall'),
  fx(0x06, 'Floral', true, false, false),
  fx(0x07, 'Breathing'),
  fx(0x08, 'Spectrum cycle', true, false, false),
  fx(0x09, 'Color fountain'),
  fx(0x0a, 'Colorful interchange', true, true),
  fx(0x0b, 'Waves', true, true),
  fx(0x0c, 'Turning peaks', true, true),
  fx(0x0d, 'One touch to fire'),
  fx(0x0e, 'Two birds'),
  fx(0x0f, 'Ripples'),
  fx(0x10, 'Endless flow', true, true),
  fx(0x11, 'Layered mountains'),
  fx(0x12, 'Gentle rain', true, true),
  fx(0x13, 'Back and forth'),
  fx(0x80, 'Custom (per-key)', false, false, false),
]

export type Led = { effect: number; r: number; g: number; b: number; brightness: number; speed: number; direction: number }

export function decodeLed(b: Uint8Array): Led {
  return { effect: b[0], r: b[1], g: b[2], b: b[3], brightness: b[9], speed: b[10], direction: b[11] }
}

export function encodeLed(prev: Uint8Array, l: Led) {
  const out = prev.slice()
  out[0] = l.effect
  out[1] = l.r
  out[2] = l.g
  out[3] = l.b
  out[9] = l.brightness
  out[10] = l.speed
  out[11] = l.direction
  return out
}

export const toHex = (l: Led) => '#' + [l.r, l.g, l.b].map((v) => v.toString(16).padStart(2, '0')).join('')
export const fromHex = (h: string) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })
