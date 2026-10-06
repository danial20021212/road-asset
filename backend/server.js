import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import gpsRoutes from './routes/gps.routes.js'

import videoRoutes from './routes/video.routes.js'
import { PREVIEW_DIR } from './services/transcode.service.js'
import tripsRoutes from './routes/trips.routes.js'
import { initDb } from './db/pool.js'
import { FRAMES_DIR } from './services/frames.service.js'

import framesRoutes from './routes/frames.routes.js'


const app = express()

app.use(cors()) // allows your Vite dev server (localhost:5173) to call this
app.use(express.json({ limit: '75mb' })) // batches of full-resolution base64 frames can be large
app.use('/api/gps', gpsRoutes)

app.use('/api/video', videoRoutes)
app.use('/previews', express.static(PREVIEW_DIR))

app.use('/api/trips', tripsRoutes)

app.use('/frames', express.static(FRAMES_DIR))
app.use('/api/frames', framesRoutes)

initDb().catch((err) => console.error('Database not ready:', err.message)) // before app.listen

const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY || 'YOUR_API_KEY'
const WORKFLOW_URL = 'https://serverless.roboflow.com/danial-lja5y/workflows/qwen3-8-max-object-detection'
const DETECT_CLASSES = ['chevron sign'] // must match what the model actually returns in "class"

const MAX_IMAGES = 5 // matches the model step's "Max Concurrent Requests" setting



// POST { images: ["data:image/jpeg;base64,...", "..."] }  (1–MAX_IMAGES per request)
// Returns Roboflow's raw response: { outputs: [ <per-image result>, ... ], ... }
// outputs[i] should correspond to images[i], one entry per image sent.
app.post('/api/detect-chevrons', async (req, res) => {
  try {
    const { images } = req.body

    if (
      !Array.isArray(images) ||
      images.length < 1 ||
      images.length > MAX_IMAGES ||
      images.some((image) => typeof image !== 'string' || !image.length)
    ) {
      return res.status(400).json({
        error: `Provide an "images" array of 1–${MAX_IMAGES} base64 images.`,
      })
    }

    const rfResponse = await fetch(WORKFLOW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ROBOFLOW_API_KEY}`,
      },
      body: JSON.stringify({
        inputs: {
          image: images.map((image) => ({
            type: 'base64',
            value: image.startsWith('data:') ? image.slice(image.indexOf(',') + 1) : image,
          })),
          classes: DETECT_CLASSES,
        },
      }),
    })

    if (!rfResponse.ok) {
      return res.status(rfResponse.status).json({
        error: 'Roboflow API error',
        details: await rfResponse.text(),
      })
    }

    const result = await rfResponse.json()

    // Sanity check: warn loudly if the output count doesn't match what we sent,
    // since that would mean frames get matched to the wrong detections.
    if (!Array.isArray(result.outputs) || result.outputs.length !== images.length) {
      console.warn(
        `Expected ${images.length} outputs, got ${result.outputs?.length ?? 'none'}. ` +
          'Batch ordering may not be reliable — check the raw response shape.'
      )
    }

    res.json(result)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error', details: err.message })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`))