import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const chromePath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(existsSync)

if (!chromePath) throw new Error('未找到 Chrome。')

const root = dirname(fileURLToPath(import.meta.url))
const htmlUrl = pathToFileURL(resolve(root, 'mockup.html')).href
const names = ['01-moon-jade', '02-ink-gold', '03-stone-blue', '04-cinnabar-editorial', '05-heluo-dusk']

function capture(theme, name) {
  const profile = join(tmpdir(), `heluo-exhibit-concepts-${theme}-${Date.now()}`)
  const output = resolve(root, `${name}.png`)
  const child = spawn(chromePath, [
    '--headless=new',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--force-device-scale-factor=1',
    '--window-size=1600,900',
    '--virtual-time-budget=1800',
    '--run-all-compositor-stages-before-draw',
    '--disable-background-networking',
    '--no-first-run',
    `--user-data-dir=${profile}`,
    `--screenshot=${output}`,
    `${htmlUrl}?theme=${theme}`,
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })

  return new Promise((resolveCapture, rejectCapture) => {
    const timeout = setTimeout(() => {
      child.kill()
      rejectCapture(new Error(`${name} 截图超时。`))
    }, 30_000)
    child.on('error', rejectCapture)
    child.on('close', async (code) => {
      clearTimeout(timeout)
      await rm(profile, { recursive: true, force: true })
      if (code === 0) resolveCapture(output)
      else rejectCapture(new Error(`${name} 截图失败 (${code})：${stderr}`))
    })
  })
}

await mkdir(root, { recursive: true })
for (let index = 0; index < names.length; index += 1) {
  const output = await capture(index + 1, names[index])
  const details = await stat(output)
  if (details.size < 100_000) throw new Error(`${names[index]} 输出异常，仅 ${details.size} bytes。`)
  console.log(`${names[index]}: ${details.size} bytes`)
}

console.log('已生成 5 张 1600x900 数字展厅效果图。')
