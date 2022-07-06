import { server } from '../global'
import { showInfo, clearDialog } from './dialog'


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
