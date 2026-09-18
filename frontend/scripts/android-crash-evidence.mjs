import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
const adb = (...args) => execFileSync('adb', ['-s','10AE641DSN000HE',...args], {encoding:'utf8',maxBuffer:8*1024*1024})
const selected = (text, pattern) => text.split('\n').filter(line=>pattern.test(line))
const evidence = {
  collectedAt:new Date().toISOString(),
  package:selected(adb('shell','dumpsys','package','com.android.chrome'),/versionName|primaryCpuAbi|secondaryCpuAbi/),
  deviceAbi:adb('shell','getprop','ro.product.cpu.abilist').trim(),
  crash:selected(adb('logcat','-b','crash','-d','-t','140'),/ABI:|Abort message|signal |CrRendererMain/),
  interpretation:'Browser package and crash ABI evidence only; not proof of a unique root cause. Earlier SkBitmap allocation fatal and current SIGTRAP are distinct records.'
}
await mkdir('../artifacts/real-device/browser-crash',{recursive:true})
await writeFile('../artifacts/real-device/browser-crash/summary.json',JSON.stringify(evidence,null,2))
console.log(JSON.stringify(evidence))
