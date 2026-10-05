import fs from 'fs/promises'
import { extractGps } from '../services/gps.service.js'

export async function getGpsFromVideo(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Upload a video in the "video" field.' })
  }

  try {
    const points = await extractGps(req.file.path)
    res.json({ count: points.length, points })
  } catch (err) {
    console.error(err)
    const notInstalled = err.code === 'ENOENT'
    res.status(500).json({
      error: notInstalled
        ? 'ExifTool not found. Install it or set EXIFTOOL_PATH in .env.'
        : 'Failed to read GPS data',
      details: err.message,
    })
  } finally {
    fs.unlink(req.file.path).catch(() => {}) // always clean up the temp file
  }
}