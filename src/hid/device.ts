import { ALLOWED_CMDS, BLOCKS, CMD_COMMIT, LED_WRITE_ONLY, PID, PROFILE_BLOCKS, USAGE_PAGE, VID, chunkPackets, hex, type BlockName, type WritableBlock } from './protocol'

export type Snapshot = Partial<Record<BlockName, Uint8Array>>
export type LogEntry = { t: number; dir: 'out' | 'in' | 'dry' | 'err'; text: string }

const RESPONSE_TIMEOUT = 1000

// driveall always writes LED byte 4 = 0xFF and bytes 14..15 = AA 55; the keyboard reads them back as 0.
const withLedMarkers = (d: Uint8Array) => {
  const o = d.slice()
  o[4] = 0xff
  o[14] = 0xaa
  o[15] = 0x55
  return o
}
const VERIFY_SKIP: Partial<Record<WritableBlock, Set<number>>> = { led: new Set([4, 14, 15, ...LED_WRITE_ONLY]) }

/** Single connection to the G69 over WebHID. All transfers are serialised. */
class G69 {
  device: HIDDevice | null = null
  packLen = 64
  dryRun = false
  log: LogEntry[] = []
  private listeners = new Set<() => void>()
  private waiter: ((r: Uint8Array) => void) | null = null
  private queue: Promise<unknown> = Promise.resolve()

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  private emit() {
    this.listeners.forEach((f) => f())
  }
  private addLog(dir: LogEntry['dir'], text: string) {
    this.log = [...this.log.slice(-499), { t: Date.now(), dir, text }]
    this.emit()
  }

  get connected() {
    return !!this.device?.opened
  }

  private static pick(list: HIDDevice[]) {
    return list.find((d) => d.vendorId === VID && d.productId === PID && d.collections.some((c) => c.usagePage === USAGE_PAGE))
  }

  /** Opens the keyboard. Silent when permission already exists; `interactive` shows the picker (auto-selected by main). */
  async connect(interactive = false) {
    if (this.connected) return true
    let dev = G69.pick(await navigator.hid.getDevices())
    if (!dev && interactive) dev = G69.pick(await navigator.hid.requestDevice({ filters: [{ vendorId: VID, productId: PID, usagePage: USAGE_PAGE, usage: 0x61 }] }))
    if (!dev) return false
    if (!dev.opened) await dev.open()
    const col = dev.collections.find((c) => c.usagePage === USAGE_PAGE)
    this.packLen = col?.outputReports?.[0]?.items?.[0]?.reportCount || 32
    dev.addEventListener('inputreport', this.onInput)
    this.device = dev
    this.addLog('in', `connected ${dev.productName} packLen=${this.packLen}`)
    return true
  }

  async disconnect() {
    const d = this.device
    this.device = null
    if (d) {
      d.removeEventListener('inputreport', this.onInput)
      if (d.opened) await d.close()
    }
    this.emit()
  }

  private onInput = (e: HIDInputReportEvent) => {
    const r = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength)
    if (r[1] === 0x37) return // unsolicited status packet, driveall ignores it too
    this.addLog('in', hex(r.subarray(0, 24)))
    const w = this.waiter
    this.waiter = null
    w?.(r)
  }

  private async exchange(packet: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
    if (!this.device) throw new Error('Keyboard not connected')
    if (!ALLOWED_CMDS.has(packet[1])) throw new Error(`Blocked command 0x${packet[1].toString(16)}`)
    for (let attempt = 0; attempt < 2; attempt++) {
      const reply = new Promise<Uint8Array | null>((resolve) => {
        const t = setTimeout(() => resolve(null), RESPONSE_TIMEOUT)
        this.waiter = (r) => (clearTimeout(t), resolve(r))
      })
      this.addLog('out', hex(packet.subarray(0, 24)))
      await this.device.sendReport(0, packet)
      const r = await reply
      if (r) return r
    }
    this.waiter = null
    this.addLog('err', `no reply to cmd 0x${packet[1].toString(16)}`)
    throw new Error(`Keyboard did not answer command 0x${packet[1].toString(16)}`)
  }

  private run<T>(job: () => Promise<T>): Promise<T> {
    const p = this.queue.then(job, job)
    this.queue = p.catch(() => {})
    return p
  }

  readBlock(name: BlockName) {
    return this.run(async () => {
      const { read, size } = BLOCKS[name]
      const out = new Uint8Array(size)
      for (const pkt of chunkPackets(read, out, this.packLen)) {
        const r = await this.exchange(pkt)
        // Small blocks still come back as a full 56-byte chunk, so clamp to the block size.
        const off = r[3] | (r[4] << 8)
        const len = Math.min(r[2], size - off, r.length - 8)
        if (r[1] === read && len > 0) out.set(r.subarray(8, 8 + len), off)
      }
      return out
    })
  }

  commit() {
    return this.run(async () => {
      const pkt = chunkPackets(CMD_COMMIT, new Uint8Array(4), this.packLen)[0]
      if (this.dryRun) return this.addLog('dry', hex(pkt.subarray(0, 24)))
      await this.exchange(pkt).catch(() => {}) // driveall never waits on this one either
    })
  }

  writeBlock(name: WritableBlock, data: Uint8Array) {
    return this.run(async () => {
      const { write, size } = BLOCKS[name]
      if (data.length !== size) throw new Error(`${name}: expected ${size} bytes, got ${data.length}`)
      if (name === 'led') data = withLedMarkers(data)
      for (const pkt of chunkPackets(write, data, this.packLen)) {
        if (this.dryRun) this.addLog('dry', hex(pkt.subarray(0, 24)))
        else await this.exchange(pkt)
      }
    })
  }

  /** Writes blocks, commits, then reads each back and compares. Returns names that did not match. */
  async writeVerified(blocks: Partial<Record<WritableBlock, Uint8Array>>) {
    const names = PROFILE_BLOCKS.filter((n) => blocks[n])
    for (const n of names) await this.writeBlock(n, blocks[n]!)
    await this.commit()
    if (this.dryRun) return []
    const bad: string[] = []
    for (const n of names) {
      const back = await this.readBlock(n)
      const skip = VERIFY_SKIP[n]
      if (back.some((v, i) => !skip?.has(i) && v !== blocks[n]![i])) bad.push(n)
    }
    if (bad.length) this.addLog('err', `verify mismatch: ${bad.join(', ')}`)
    return bad
  }

  async readAll(): Promise<Snapshot> {
    const s: Snapshot = {}
    for (const n of ['device', 'board', ...PROFILE_BLOCKS] as BlockName[]) s[n] = await this.readBlock(n)
    await this.commit()
    return s
  }
}

export const g69 = new G69()

// Exposed for inspection from DevTools.
;(window as unknown as { g69: G69 }).g69 = g69
