import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const output = '../artifacts/real-device/png-model-trial'
await mkdir(output, { recursive:true })
const source = await readFile('public/media/models/heluo-bronze-ding-v5.5-mobile.glb')
const jsonLength=source.readUInt32LE(12), doc=JSON.parse(source.subarray(20,20+jsonLength).toString())
const binStart=28+jsonLength, bin=source.subarray(binStart,binStart+source.readUInt32LE(20+jsonLength))
const parts=[bin], report=[]
let offset=bin.length
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage()
 for(const image of doc.images) {
  if(image.mimeType!=='image/webp') continue
  const view=doc.bufferViews[image.bufferView]
  const base64=bin.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength).toString('base64')
  const converted=await page.evaluate(async base64=>{
   const img=new Image(); img.src='data:image/webp;base64,'+base64; await img.decode()
   const canvas=document.createElement('canvas'); canvas.width=img.width; canvas.height=img.height
   const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0)
   const original=ctx.getImageData(0,0,img.width,img.height).data
   const png=canvas.toDataURL('image/png'), check=new Image();check.src=png;await check.decode()
   ctx.clearRect(0,0,img.width,img.height);ctx.drawImage(check,0,0)
   const decoded=ctx.getImageData(0,0,img.width,img.height).data
   let binary=''; for(let i=0;i<original.length;i+=32768)binary+=String.fromCharCode(...original.subarray(i,i+32768))
   return {rgba:btoa(binary),png:png.split(',')[1],width:img.width,height:img.height,equal:original.every((v,i)=>v===decoded[i])}
  },base64)
  assert(converted.equal,'PNG must preserve decoded pixels')
  await writeFile(output+`/image-${doc.images.indexOf(image)}.rgba`,Buffer.from(converted.rgba,'base64'))
  const padding=Buffer.alloc((4-offset%4)%4);parts.push(padding);offset+=padding.length
  const bytes=Buffer.from(converted.png,'base64')
  image.bufferView=doc.bufferViews.length;image.mimeType='image/png'
  doc.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length})
  parts.push(bytes);offset+=bytes.length
  report.push({width:converted.width,height:converted.height,pixelsEqual:converted.equal,pngBytes:bytes.length})
 }
 for(const texture of doc.textures||[]) if(texture.extensions?.EXT_texture_webp){texture.source=texture.extensions.EXT_texture_webp.source;delete texture.extensions.EXT_texture_webp;if(!Object.keys(texture.extensions).length)delete texture.extensions}
 for(const key of ['extensionsUsed','extensionsRequired'])if(doc[key])doc[key]=doc[key].filter(x=>x!=='EXT_texture_webp')
 doc.buffers[0].byteLength=offset
 const raw=Buffer.from(JSON.stringify(doc)), json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)])
 const binary=Buffer.concat([...parts,Buffer.alloc((4-offset%4)%4)])
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16)
 const bh=Buffer.alloc(8);bh.writeUInt32LE(binary.length);bh.writeUInt32LE(0x004e4942,4)
 await writeFile(output+'/model.glb',Buffer.concat([header,json,bh,binary]))
 await writeFile(output+'/conversion.json',JSON.stringify({scope:'Diagnostic only; original model unchanged; desktop decoded RGBA preserved',report},null,2))
 console.log(JSON.stringify({output,report}))
} finally {await browser.close()}
