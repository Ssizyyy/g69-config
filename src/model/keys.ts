// 4-byte key records in the key (0x12/0x22) and Fn (0x16/0x26) blocks, at offset 4*pos.
// Encoding from driveall's getUpdateKeyData:
//   [0,0,0,0]          firmware default
//   [2, mods, hid, 0]  keyboard key (mods = HID modifier bitmask)
//   [3, lo, hi, 0]     consumer/media usage
//   [1, kind, val, 0]  mouse: kind 1 = buttons bitmask, kind 3 = wheel (1 up / 255 down)
//   7..13              macro / DKS / MT / TGL / SOCD / RS / combo (shown read-only here)

export type KeyAction =
  | { type: 'default' }
  | { type: 'key'; hid: number; mods: number }
  | { type: 'media'; usage: number }
  | { type: 'mouse'; kind: number; value: number }
  | { type: 'other'; raw: number[] }

export function decodeKey(b: Uint8Array, pos: number): KeyAction {
  const r = Array.from(b.subarray(4 * pos, 4 * pos + 4))
  switch (r[0]) {
    case 0:
      return r.every((v) => v === 0) ? { type: 'default' } : { type: 'other', raw: r }
    case 1:
      return { type: 'mouse', kind: r[1], value: r[2] }
    case 2:
      return { type: 'key', mods: r[1], hid: r[2] }
    case 3:
      return { type: 'media', usage: r[1] | (r[2] << 8) }
    default:
      return { type: 'other', raw: r }
  }
}

export function encodeKey(a: KeyAction): number[] {
  switch (a.type) {
    case 'default':
      return [0, 0, 0, 0]
    case 'key':
      return [2, a.mods, a.hid, 0]
    case 'media':
      return [3, a.usage & 0xff, a.usage >> 8, 0]
    case 'mouse':
      return [1, a.kind, a.value, 0]
    case 'other':
      return a.raw
  }
}

export function withKey(block: Uint8Array, pos: number, a: KeyAction) {
  const out = block.slice()
  out.set(encodeKey(a), 4 * pos)
  return out
}

export type PickItem = { label: string; action: KeyAction }
const key = (label: string, hid: number): PickItem => ({ label, action: { type: 'key', hid, mods: 0 } })

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c, i) => key(c, 4 + i))
const digits = '1234567890'.split('').map((c, i) => key(c, 30 + i))
const symbols: PickItem[] = [
  key('-', 45), key('=', 46), key('[', 47), key(']', 48), key('\\', 49), key(';', 51), key("'", 52), key('`', 53), key(',', 54), key('.', 55), key('/', 56),
]
const fkeys = Array.from({ length: 24 }, (_, i) => key(`F${i + 1}`, i < 12 ? 58 + i : 104 + i - 12))
const editing: PickItem[] = [
  key('Esc', 41), key('Tab', 43), key('Caps', 57), key('Backspace', 42), key('Enter', 40), key('Space', 44),
  key('Ins', 73), key('Del', 76), key('Home', 74), key('End', 77), key('PgUp', 75), key('PgDn', 78),
  key('↑', 82), key('↓', 81), key('←', 80), key('→', 79),
  key('PrtSc', 70), key('ScrLk', 71), key('Pause', 72), key('Menu', 101),
]
const modifiers: PickItem[] = [
  key('L-Ctrl', 224), key('L-Shift', 225), key('L-Alt', 226), key('L-Win', 227),
  key('R-Ctrl', 228), key('R-Shift', 229), key('R-Alt', 230), key('R-Win', 231),
]
const numpad: PickItem[] = [
  key('NumLk', 83), key('Num /', 84), key('Num *', 85), key('Num -', 86), key('Num +', 87), key('Num Enter', 88),
  ...'1234567890'.split('').map((c, i) => key(`Num ${c}`, 89 + i)), key('Num .', 99),
]
const media = (label: string, usage: number): PickItem => ({ label, action: { type: 'media', usage } })
const mouse = (label: string, kind: number, value: number): PickItem => ({ label, action: { type: 'mouse', kind, value } })

export const PICKER: { group: string; items: PickItem[] }[] = [
  { group: 'Letters & numbers', items: [...letters, ...digits, ...symbols] },
  { group: 'Editing & navigation', items: [...editing, ...modifiers] },
  { group: 'Function & numpad', items: [...fkeys, ...numpad] },
  {
    group: 'Media',
    items: [
      media('Play/Pause', 205), media('Stop', 183), media('Prev track', 182), media('Next track', 181),
      media('Volume +', 233), media('Volume -', 234), media('Mute', 226),
      media('My Computer', 404), media('Calculator', 402), media('Email', 394), media('Media player', 387),
      media('Browser home', 547), media('Refresh', 551), media('Forward', 549), media('Back', 548), media('Favorites', 554), media('Search', 545),
    ],
  },
  {
    group: 'Mouse',
    items: [
      mouse('Left click', 1, 1), mouse('Right click', 1, 2), mouse('Middle click', 1, 4), mouse('Mouse back', 1, 8), mouse('Mouse forward', 1, 16),
      mouse('Wheel up', 3, 1), mouse('Wheel down', 3, 255),
    ],
  },
  { group: 'Other', items: [{ label: 'Disable key', action: { type: 'key', hid: 0, mods: 0 } }] },
]

const hidNames = new Map<number, string>()
for (const g of PICKER) for (const it of g.items) if (it.action.type === 'key' && it.action.hid) hidNames.set(it.action.hid, it.label)
const mediaNames = new Map<number, string>()
for (const it of PICKER[3].items) if (it.action.type === 'media') mediaNames.set(it.action.usage, it.label)

const OTHER_NAMES: Record<number, string> = { 7: 'Macro', 8: 'DKS', 9: 'Mod-Tap', 10: 'Toggle', 11: 'SOCD', 12: 'RS', 13: 'Combo' }

/** Short label for a key record, or null when it is the firmware default. */
export function actionLabel(a: KeyAction): string | null {
  switch (a.type) {
    case 'default':
      return null
    case 'key': {
      if (!a.hid && !a.mods) return 'Off'
      const mods = ['Ctrl', 'Shift', 'Alt', 'Win', 'RCtrl', 'RShift', 'RAlt', 'RWin'].filter((_, i) => a.mods & (1 << i))
      return [...mods, a.hid ? hidNames.get(a.hid) ?? `0x${a.hid.toString(16)}` : ''].filter(Boolean).join('+')
    }
    case 'media':
      return mediaNames.get(a.usage) ?? `Media ${a.usage}`
    case 'mouse':
      return PICKER[4].items.find((i) => i.action.type === 'mouse' && i.action.kind === a.kind && i.action.value === a.value)?.label ?? 'Mouse'
    case 'other':
      return OTHER_NAMES[a.raw[0]] ?? `[${a.raw.join(',')}]`
  }
}

export const sameAction = (a: KeyAction, b: KeyAction) => encodeKey(a).join() === encodeKey(b).join()
