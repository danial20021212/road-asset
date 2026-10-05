import { getTrips, getFrames } from '../services/trips.service.js'

export async function listTrips(req, res) {
  try {
    res.json({ trips: await getTrips() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load trips', details: err.message })
  }
}

export async function listFrames(req, res) {
  const videoId = Number(req.params.id)
  if (!Number.isInteger(videoId)) {
    return res.status(400).json({ error: 'Invalid trip id.' })
  }

  try {
    res.json({ frames: await getFrames(videoId) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load frames', details: err.message })
  }
}