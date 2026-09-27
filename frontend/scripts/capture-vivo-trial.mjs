import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
const directory = '../artifacts/real-device/vivo-trial'
await mkdir(directory,{recursive:true})
const path = `${directory}/screen-${Date.now()}.png`
await writeFile(path,execFileSync('adb',['-s','10AE641DSN000HE','exec-out','screencap','-p'],{maxBuffer:24*1024*1024}))
console.log(path)
