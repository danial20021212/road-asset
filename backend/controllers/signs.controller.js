import { detectSigns } from '../services/signs.service.js'

const MAX_IMAGES = 5 // frames sent in parallel per request

// POST { images: ["data:image/jpeg;base64,...", ...] }  ->  { outputs: [ <raw output per image> ] }
export async function detectSignsBatch(req, res) {
  const { images } = req.body

  if (
    !Array.isArray(images) ||
    images.length < 1 ||
    images.length > MAX_IMAGES ||
    images.some((image) => typeof image !== 'string' || !image.length)
  ) {
    return res.status(400).json({ error: `Provide an "images" array of 1–${MAX_IMAGES} base64 images.` })
  }

  try {
    const outputs = await Promise.all(images.map((image) => detectSigns(image)))
    res.json({ outputs })
  } catch (err) {
    console.error(err)
    res.status(502).json({ error: 'Sign detection failed', details: err.message })
  }
}