// G69 68-key layout (driveall "getLooting68"). `pos` is the matrix index used by the
// key/fn blocks (4 bytes per key) and the RT block (8 bytes per key). `hid` is the stock keycode.

export type LayoutKey = { pos: number; label: string; hid: number; w?: number }

const k = (pos: number, label: string, hid: number, w?: number): LayoutKey => ({ pos, label, hid, w })

export const LAYOUT: LayoutKey[][] = [
  [k(0, 'Esc', 41), k(17, '1', 30), k(18, '2', 31), k(19, '3', 32), k(20, '4', 33), k(21, '5', 34), k(22, '6', 35), k(23, '7', 36), k(24, '8', 37), k(25, '9', 38), k(26, '0', 39), k(27, '-', 45), k(28, '=', 46), k(92, 'Backspace', 42, 2), k(104, 'Home', 74)],
  [k(32, 'Tab', 43, 1.5), k(33, 'Q', 20), k(34, 'W', 26), k(35, 'E', 8), k(36, 'R', 21), k(37, 'T', 23), k(38, 'Y', 28), k(39, 'U', 24), k(40, 'I', 12), k(41, 'O', 18), k(42, 'P', 19), k(43, '[', 47), k(44, ']', 48), k(60, '\\', 49, 1.5), k(106, 'Del', 76)],
  [k(48, 'Caps', 57, 1.75), k(49, 'A', 4), k(50, 'S', 22), k(51, 'D', 7), k(52, 'F', 9), k(53, 'G', 10), k(54, 'H', 11), k(55, 'J', 13), k(56, 'K', 14), k(57, 'L', 15), k(58, ';', 51), k(59, "'", 52), k(76, 'Enter', 40, 2.25), k(105, 'PgUp', 75)],
  [k(64, 'Shift', 225, 2.25), k(65, 'Z', 29), k(66, 'X', 27), k(67, 'C', 6), k(68, 'V', 25), k(69, 'B', 5), k(70, 'N', 17), k(71, 'M', 16), k(72, ',', 54), k(73, '.', 55), k(74, '/', 56), k(75, 'Shift', 229, 1.75), k(90, '↑', 82), k(108, 'PgDn', 78)],
  [k(80, 'Ctrl', 224, 1.25), k(81, 'Win', 227, 1.25), k(82, 'Alt', 226, 1.25), k(83, 'Space', 44, 6.25), k(84, 'Alt', 230), k(85, 'Fn', 0), k(87, 'Ctrl', 228), k(88, '←', 80), k(89, '↓', 81), k(91, '→', 79)],
]

export const ALL_KEYS = LAYOUT.flat()
export const keyByPos = new Map(ALL_KEYS.map((x) => [x.pos, x]))

const byLabel = (...labels: string[]) => ALL_KEYS.filter((x) => labels.includes(x.label)).map((x) => x.pos)
export const PRESETS = {
  All: ALL_KEYS.filter((x) => x.label !== 'Fn').map((x) => x.pos),
  WASD: byLabel('W', 'A', 'S', 'D'),
  Numbers: byLabel('1', '2', '3', '4', '5', '6', '7', '8', '9', '0'),
  Arrows: byLabel('↑', '↓', '←', '→'),
}
