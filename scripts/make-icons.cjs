// Renders the app/tray icon from the Material "timer" glyph using Electron's own Chromium.
// Usage: npm run icons   (writes build/icon.png 512px and resources/icon.png 256px)
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const glyph = fs
  .readFileSync(path.join(root, 'node_modules/@material-design-icons/svg/filled/timer.svg'), 'utf8')
  .match(/<path d="([^"]+)"/)[1]
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="16" y="16" width="480" height="480" rx="96" fill="#311b92"/>
  <g transform="translate(76 76) scale(15)" fill="#ffffff"><path d="${glyph}"/></g>
</svg>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  fs.mkdirSync(path.join(root, 'build'), { recursive: true })
  fs.mkdirSync(path.join(root, 'resources'), { recursive: true })
  fs.writeFileSync(path.join(root, 'build/icon.svg'), svg)
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  const full = img.resize({ width: 512, height: 512 })
  fs.writeFileSync(path.join(root, 'build/icon.png'), full.toPNG())
  fs.writeFileSync(path.join(root, 'resources/icon.png'), full.resize({ width: 256, height: 256, quality: 'best' }).toPNG())
  console.log('icons written')
  app.quit()
})
