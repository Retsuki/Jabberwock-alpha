/** Reload the development shell after its HTML entry or client bundles change; packaged apps never watch files. */
import { app, type BrowserWindow } from 'electron'
import { readFileSync, watch, watchFile, unwatchFile } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Attach the development shell watcher to this window's lifetime. */
export function installDevelopmentReload(window: BrowserWindow): void {
  if (app.isPackaged || process.env.DSH_DESKTOP_WATCH !== '1') return
  const entry = fileURLToPath(new URL('../../web/dist/index.html', import.meta.url))
  let previous = readFileSync(entry, 'utf8')
  let timer: NodeJS.Timeout | undefined
  let pluginsChanged = false
  const changed = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      let current: string
      try { current = readFileSync(entry, 'utf8') } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
        console.error('desktop development: shell reload failed', error)
        return
      }
      if (current === previous && !pluginsChanged) return
      pluginsChanged = false
      previous = current
      if (!window.isDestroyed()) {
        console.log('desktop development: client bundle changed; refreshing window')
        window.webContents.reload()
      }
    }, 1500)
  }
  watchFile(entry, { interval: 500 }, changed)
  // Service-owning plugins cannot retain old React closures across an in-place swap.
  const packages = fileURLToPath(new URL('../../../packages/', import.meta.url))
  const bundles = watch(packages, { recursive: true }, (_event, filename) => {
    if (filename === null || !/(?:^|[\\/])lib[\\/]client(?:\.[^\\/]+)?\.js$/.test(filename)) return
    pluginsChanged = true
    changed()
  })
  window.once('closed', () => {
    clearTimeout(timer)
    bundles.close()
    unwatchFile(entry, changed)
  })
}
