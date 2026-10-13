import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, session, shell, Tray } from 'electron'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const VID = 0x0c45
const PID = 0x80b8

const isDev = !!process.env.ELECTRON_RENDERER_URL
const resDir = app.isPackaged ? process.resourcesPath : join(__dirname, '../..')
const iconPath = join(app.isPackaged ? process.resourcesPath : join(resDir, 'resources'), 'icon.png')
const driveallDir = app.isPackaged ? join(process.resourcesPath, 'driveall') : join(resDir, 'vendor/driveall')

const dataDir = app.getPath('userData')
const profilesDir = join(dataDir, 'profiles')
const backupsDir = join(dataDir, 'backups')
const configFile = join(dataDir, 'config.json')
for (const d of [profilesDir, backupsDir]) mkdirSync(d, { recursive: true })

let win: BrowserWindow | null = null
let original: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

// ---------- config ----------
type Config = { rules: { exe: string; profile: string }[]; autoSwitch: boolean; dryRun: boolean; activeProfile?: string }
const defaultConfig: Config = { rules: [], autoSwitch: true, dryRun: false }
function readConfig(): Config {
  try { return { ...defaultConfig, ...JSON.parse(readFileSync(configFile, 'utf8')) } } catch { return { ...defaultConfig } }
}
function writeConfig(c: Config) {
  writeFileSync(configFile, JSON.stringify(c, null, 2))
  buildTrayMenu()
}

// ---------- profiles / backups (JSON files) ----------
const safeName = (n: string) => n.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim() || 'profile'
const listJson = (dir: string) =>
  readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5))

ipcMain.handle('profiles:list', () => listJson(profilesDir).sort((a, b) => (a === 'Default' ? -1 : b === 'Default' ? 1 : a.localeCompare(b))))
ipcMain.handle('profiles:read', (_e, name: string) => JSON.parse(readFileSync(join(profilesDir, safeName(name) + '.json'), 'utf8')))
ipcMain.handle('profiles:write', (_e, name: string, data: unknown) => {
  writeFileSync(join(profilesDir, safeName(name) + '.json'), JSON.stringify(data, null, 1))
  buildTrayMenu()
})
ipcMain.handle('profiles:delete', (_e, name: string) => {
  rmSync(join(profilesDir, safeName(name) + '.json'), { force: true })
  buildTrayMenu()
})
ipcMain.handle('profiles:rename', (_e, from: string, to: string) => {
  const data = readFileSync(join(profilesDir, safeName(from) + '.json'), 'utf8')
  writeFileSync(join(profilesDir, safeName(to) + '.json'), data)
  rmSync(join(profilesDir, safeName(from) + '.json'), { force: true })
  const c = readConfig()
  c.rules = c.rules.map((r) => (r.profile === from ? { ...r, profile: to } : r))
  if (c.activeProfile === from) c.activeProfile = to
  writeConfig(c)
})
ipcMain.handle('profiles:export', async (_e, name: string, data: unknown) => {
  const r = await dialog.showSaveDialog(win!, { defaultPath: safeName(name) + '.json', filters: [{ name: 'Profile', extensions: ['json'] }] })
  if (!r.canceled && r.filePath) writeFileSync(r.filePath, JSON.stringify(data, null, 1))
})
ipcMain.handle('profiles:import', async () => {
  const r = await dialog.showOpenDialog(win!, { filters: [{ name: 'Profile', extensions: ['json'] }], properties: ['openFile'] })
  if (r.canceled || !r.filePaths[0]) return null
  return { name: basename(r.filePaths[0], '.json'), data: JSON.parse(readFileSync(r.filePaths[0], 'utf8')) }
})

ipcMain.handle('backups:write', (_e, data: unknown) => {
  const name = new Date().toISOString().replace(/[:.]/g, '-')
  writeFileSync(join(backupsDir, name + '.json'), JSON.stringify(data, null, 1))
  return name
})
ipcMain.handle('backups:list', () => listJson(backupsDir).sort().reverse())
ipcMain.handle('backups:read', (_e, name: string) => JSON.parse(readFileSync(join(backupsDir, safeName(name) + '.json'), 'utf8')))
ipcMain.handle('backups:open', () => shell.openPath(backupsDir))

ipcMain.handle('config:get', () => readConfig())
ipcMain.handle('config:set', (_e, patch: Partial<Config>) => {
  const c = { ...readConfig(), ...patch }
  writeConfig(c)
  return c
})

// ---------- autostart ----------
const exePath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
ipcMain.handle('autostart:get', () => app.getLoginItemSettings({ path: exePath(), args: ['--hidden'] }).openAtLogin)
ipcMain.handle('autostart:set', (_e, on: boolean) => {
  app.setLoginItemSettings({ openAtLogin: on, path: exePath(), args: ['--hidden'] })
  return on
})

// ---------- processes for the rule picker ----------
ipcMain.handle('processes:list', () =>
  new Promise<string[]>((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-Command', 'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty ProcessName'],
      { windowsHide: true },
      (_err, out) => resolve([...new Set(String(out).split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean))].sort()),
    )
  }),
)
ipcMain.handle('dialog:pickExe', async () => {
  const r = await dialog.showOpenDialog(win!, { filters: [{ name: 'Programs', extensions: ['exe'] }], properties: ['openFile'] })
  return r.canceled || !r.filePaths[0] ? null : basename(r.filePaths[0], '.exe').toLowerCase()
})

// ---------- foreground app watcher ----------
// One persistent PowerShell prints the foreground process name whenever it changes.
const fgScript = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class FG {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
}
"@
$last = $null
while ($true) {
  $p = 0; [void][FG]::GetWindowThreadProcessId([FG]::GetForegroundWindow(), [ref]$p)
  try { $n = (Get-Process -Id $p -ErrorAction Stop).ProcessName } catch { $n = "" }
  if ($n -ne $last) { [Console]::Out.WriteLine($n); [Console]::Out.Flush(); $last = $n }
  Start-Sleep -Milliseconds 400
}`
let fgProc: ChildProcess | null = null
let fgTimer: NodeJS.Timeout | null = null
const ownNames = new Set(['electron', basename(process.execPath, '.exe').toLowerCase(), 'g69 config'])
function startForegroundWatcher() {
  fgProc = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(fgScript, 'utf16le').toString('base64')], { windowsHide: true })
  let buf = ''
  fgProc.stdout?.on('data', (d: Buffer) => {
    buf += d.toString()
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ''
    const name = lines.at(-1)?.trim().toLowerCase()
    if (name === undefined || ownNames.has(name)) return
    if (fgTimer) clearTimeout(fgTimer)
    // Debounce: only report an app that stays focused for 2 s.
    fgTimer = setTimeout(() => win?.webContents.send('foreground', name), 2000)
  })
  fgProc.on('exit', () => { if (!quitting) setTimeout(startForegroundWatcher, 3000) })
}

// ---------- tray ----------
function buildTrayMenu() {
  if (!tray) return
  const c = readConfig()
  const profiles = listJson(profilesDir)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open G69 Config', click: showMain },
      { type: 'separator' },
      ...profiles.map((p) => ({ label: p, type: 'radio' as const, checked: c.activeProfile === p, click: () => win?.webContents.send('tray:apply', p) })),
      { type: 'separator' },
      { label: 'Auto-switch by app', type: 'checkbox', checked: c.autoSwitch, click: (m) => writeConfig({ ...readConfig(), autoSwitch: m.checked }) },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit() } },
    ]),
  )
  tray.setToolTip(`G69 Config${c.activeProfile ? ' — ' + c.activeProfile : ''}`)
}
function showMain() {
  if (!win) return
  win.show()
  win.focus()
}

// ---------- HID permissions ----------
function allowHid(ses: Electron.Session) {
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'hid')
  ses.setDevicePermissionHandler((d) => d.deviceType === 'hid' && (d.device as { vendorId: number }).vendorId === VID && (d.device as { productId: number }).productId === PID)
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault()
    const dev = details.deviceList.find((d) => d.vendorId === VID && d.productId === PID)
    callback(dev?.deviceId)
  })
}

// ---------- original (driveall) offline window ----------
protocol.registerSchemesAsPrivileged([
  { scheme: 'driveall', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])
function setupOriginalSession() {
  const ses = session.fromPartition('persist:original')
  allowHid(ses)
  ses.protocol.handle('driveall', (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html'
    const file = join(driveallDir, p)
    if (!file.startsWith(driveallDir) || !existsSync(file)) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  // No network: remote assets are served from the local mirror when present, everything else is blocked.
  ses.webRequest.onBeforeRequest((details, cb) => {
    const u = new URL(details.url)
    if (u.protocol === 'driveall:' || u.protocol === 'devtools:' || u.protocol === 'data:' || u.protocol === 'blob:') return cb({})
    const local = join('remote', u.hostname, u.pathname)
    if (existsSync(join(driveallDir, local))) return cb({ redirectURL: 'driveall://app/' + local.replace(/\\/g, '/') })
    cb({ cancel: true })
  })
}
function openOriginal() {
  if (original) return original.focus()
  win?.webContents.send('original', true) // renderer releases the device first
  original = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'G69 — Original configurator (offline)',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: { partition: 'persist:original' },
  })
  original.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  original.loadURL('driveall://app/index.html')
  // The site picks its language from localStorage; pin it to English.
  original.webContents.on('did-finish-load', () =>
    original?.webContents.executeJavaScript(`localStorage.getItem('lang') === 'en' || (localStorage.setItem('lang', 'en'), location.reload())`),
  )
  original.on('closed', () => {
    original = null
    win?.webContents.send('original', false)
  })
}
ipcMain.handle('original:open', () => openOriginal())

// ---------- main window ----------
function createWindow(hidden: boolean) {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    show: !hidden,
    title: 'G69 Config',
    icon: iconPath,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, '../preload/preload.js'), backgroundThrottling: false },
  })
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
  if (isDev) win.loadURL(process.env.ELECTRON_RENDERER_URL!)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', showMain)
  app.whenReady().then(() => {
    allowHid(session.defaultSession)
    setupOriginalSession()
    createWindow(process.argv.includes('--hidden'))
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }))
    tray.on('click', showMain)
    buildTrayMenu()
    startForegroundWatcher()
  })
  app.on('before-quit', () => {
    quitting = true
    fgProc?.kill()
  })
  app.on('window-all-closed', () => {})
}
