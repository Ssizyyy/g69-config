// Onikuma G69 (SONiX 0C45:80B8) vendor protocol, as used by onikua.driveall.cn.
// Packet: [0]=0xAA [1]=cmd [2]=len [3..4]=offset LE [5]=0 [6]=last-chunk flag [7]=0, data from byte 8.
// Large blocks are sent in (packLen - 8)-byte chunks; the keyboard answers every chunk.

export const VID = 0x0c45
export const PID = 0x80b8
export const USAGE_PAGE = 0xff68
export const USAGE = 0x61

export const BLOCKS = {
  device: { read: 0x10, size: 32 },
  board: { read: 0x11, size: 32 },
  keys: { read: 0x12, write: 0x22, size: 512 },
  led: { read: 0x13, write: 0x23, size: 16 },
  color: { read: 0x14, write: 0x24, size: 512 },
  macro: { read: 0x15, write: 0x25, size: 1024 },
  fn: { read: 0x16, write: 0x26, size: 512 },
  rt: { read: 0x17, write: 0x27, size: 1024 },
  dks: { read: 0x18, write: 0x28, size: 1024 },
} as const

export type BlockName = keyof typeof BLOCKS
export type WritableBlock = { [K in BlockName]: (typeof BLOCKS)[K] extends { write: number } ? K : never }[BlockName]

/** Blocks a profile stores and writes back, in driveall's order. */
export const PROFILE_BLOCKS: WritableBlock[] = ['keys', 'led', 'color', 'macro', 'fn', 'rt', 'dks']

/** Commit/end-of-sequence command driveall sends after every read or write batch. */
export const CMD_COMMIT = 0x00

/** Only these commands may ever reach the keyboard. Calibration (0x64-0x67), reset (0x0F),
 *  flash/firmware (0x41/0x42), screen (0x50), report rate (0x21) etc. are not on the list. */
export const ALLOWED_CMDS = new Set<number>([
  CMD_COMMIT,
  ...Object.values(BLOCKS).map((b) => b.read),
  ...Object.values(BLOCKS).flatMap((b) => ('write' in b ? [b.write] : [])),
])

export function buildPacket(cmd: number, len: number, offset: number, data: ArrayLike<number>, packLen: number, last: boolean): Uint8Array<ArrayBuffer> {
  const p = new Uint8Array(packLen)
  p[0] = 0xaa
  p[1] = cmd
  p[2] = len
  p[3] = offset & 0xff
  p[4] = offset >> 8
  p[6] = last ? 1 : 0
  p.set(Array.from(data).slice(0, packLen - 8), 8)
  return p
}

/** Splits a block into packets exactly like driveall's sendReportSuper. */
export function chunkPackets(cmd: number, data: Uint8Array, packLen: number) {
  const r = packLen - 8
  const rem = data.length % r
  const count = Math.ceil(data.length / r) || 1
  const out: Uint8Array<ArrayBuffer>[] = []
  for (let l = 0; l < count; l++) {
    const len = l === count - 1 && l !== 0 && rem !== 0 ? rem : r
    out.push(buildPacket(cmd, len, l * r, data.subarray(l * r, l * r + r), packLen, l === count - 1))
  }
  return out
}

export const hex = (b: ArrayLike<number>) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join(' ')
export const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
export const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
