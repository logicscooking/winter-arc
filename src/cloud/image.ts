import { CloudError } from './client'

/** Screenshot → JPEG, longest side ≤ 1280px, ~0.7 quality, under 1 MB */
export async function compressImage(file: Blob, max = 1280, quality = 0.7): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    try {
      await img.decode()
    } catch {
      throw new CloudError('bad_image')
    }
    const w0 = img.naturalWidth
    const h0 = img.naturalHeight
    if (!w0 || !h0) throw new CloudError('bad_image')
    const scale = Math.min(1, max / Math.max(w0, h0))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w0 * scale)
    canvas.height = Math.round(h0 * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new CloudError('bad_image')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [quality, 0.55, 0.4]) {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', q))
      if (blob && blob.size < 1_000_000) return blob
    }
    throw new CloudError('too_big')
  } finally {
    URL.revokeObjectURL(url)
  }
}
