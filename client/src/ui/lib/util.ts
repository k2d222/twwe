import type { SendMap, SendImage } from '../../server/protocol'
import { server } from '../global'
import { showInfo, clearDialog } from './dialog'
import { Map } from '../../twmap/map'
import { Image } from '../../twmap/image'

export async function uploadFile(file: File) {
  return new Promise<void>((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async () => {
      const data = reader.result as ArrayBuffer
      try {
        await server.uploadFile(data, (progress) => {
          showInfo("Uploading file " + Math.round(progress / data.byteLength * 100) + "% …", 'none')
        })
        clearDialog()
        resolve()
      }
      catch (e) {
        clearDialog()
        reject(e)
      }
    }
    reader.onerror = (e) => {
      clearDialog()
      reject(e)
    }
    reader.onprogress = (e) => {
      showInfo("Loading file " + Math.round(e.loaded / e.total * 100) + "% …", 'none')
    }
    reader.readAsArrayBuffer(file)
  })
}

export async function decodePng(file: File): Promise<ImageData> {
  return new Promise<ImageData>((resolve, reject) => {
    const img = document.createElement('img')
    img.src = URL.createObjectURL(file)
    
    img.onerror = (e) => {
      reject(e)
    }
  
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      resolve(data)
    }
  })
}

export async function queryMap(sendMap: SendMap): Promise<Map> {
  let data: ArrayBuffer
  const listener = (d: ArrayBuffer) => data = d
  server.binaryListeners.push(listener)
  await server.query('sendmap', sendMap)
  let index = server.binaryListeners.indexOf(listener)
  server.binaryListeners.splice(index, 1)
  const map = new Map(sendMap.name, data)
  return map
}

export async function queryImage(sendImage: SendImage): Promise<Image> {
  let data: ArrayBuffer
  const listener = (d: ArrayBuffer) => data = d
  server.binaryListeners.push(listener)
  const imageInfo = await server.query('sendimage', sendImage)
  let index = server.binaryListeners.indexOf(listener)
  server.binaryListeners.splice(index, 1)
  const image = new ImageData(new Uint8ClampedArray(data), imageInfo.width, imageInfo.height)
  const img = new Image()
  img.loadEmbedded(image)
  img.name = imageInfo.name
  return img
}
