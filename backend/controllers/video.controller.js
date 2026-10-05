import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { extractGps } from '../services/gps.service.js'
import { transcodeToH264, PREVIEW_DIR } from '../services/transcode.service.js'
import { hashFile } from '../services/hash.service.js'
import { extractFrames } from '../services/frames.service.js'
import { saveTrip, saveFrames } from '../services/trips.service.js'

export async function processVideo(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Upload a video in the "video" field.' })
  }

  const id = randomUUID()
  const previewPath = path.join(PREVIEW_DIR, `${id}.mp4`)

  try {
    const points = await extractGps(req.file.path) // 1. GPS from the original
    await transcodeToH264(req.file.path, previewPath) // 2. browser-friendly copy

    // 3. Save to Postgres. A database problem shouldn't block the inspection.
    let saved = { videoId: null, duplicate: false }
    try {
      const fileHash = await hashFile(req.file.path)
      saved = (await saveTrip(req.file.originalname, fileHash, points)) ?? saved

      if (saved.videoId && !saved.duplicate) {
        const files = await extractFrames(previewPath, saved.videoId)
        await saveFrames(saved.videoId, files, points)
      }
    } catch (err) {
      console.error('Saving trip failed:', err.message)
    }

    res.json({
      id,
      videoId: saved.videoId,
      duplicate: saved.duplicate,
      points,
      previewUrl: `/previews/${id}.mp4`,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to process video', details: err.message })
  } finally {
    fs.unlink(req.file.path).catch(() => {}) // delete the uploaded original
  }
}