import { detectImage } from '../services/detect.service.js'

const MAX_IMAGES = 5 // frames sent to Roboflow in parallel per request

// POST { images: ["data:image/jpeg;base64,...", ...] }
// -> { results: [ { detections: [...] } | { error: "..." }, ... ] }   (results[i] belongs to images[i])
export async function detectBatch(req, res) {
  const { images } = req.body

  if (
    !Array.isArray(images) ||
    images.length < 1 ||
    images.length > MAX_IMAGES ||
    images.some((image) => typeof image !== 'string' || !image.length)
  ) {
    return res.status(400).json({ error: `Provide an "images" array of 1–${MAX_IMAGES} base64 images.` })
  }

  // allSettled: one failing frame doesn't throw away the others
  const settled = await Promise.allSettled(images.map((image) => detectImage(image)))

  const results = settled.map((s) => {
    if (s.status === 'fulfilled') return { detections: s.value }
    console.error(s.reason)
    return { error: s.reason?.message ?? 'Detection failed' }
  })

  res.json({ results })
}