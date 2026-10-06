import { getTrips, getTrip, getFrames, saveDetections, getVideoSummaries } from '../services/trips.service.js'

export async function listTrips(req, res) {
  try {
    res.json({ trips: await getTrips() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load trips', details: err.message })
  }
}

export async function getTripById(req, res) {
  const videoId = Number(req.params.id)
  if (!Number.isInteger(videoId)) {
    return res.status(400).json({ error: 'Invalid trip id.' })
  }

  try {
    const trip = await getTrip(videoId)
    if (!trip) return res.status(404).json({ error: 'Trip not found.' })
    res.json({ trip })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load trip', details: err.message })
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

const isValidBox = (b) =>
  typeof b?.label === 'string' &&
  Array.isArray(b.box_2d) &&
  b.box_2d.length === 4 &&
  b.box_2d.every(Number.isFinite)

// PUT /api/frames/:id/detections   body: { boxes: [{ label, box_2d }], edited: boolean }
export async function putDetections(req, res) {
  const { id } = req.params
  const { boxes, edited } = req.body

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid frame id.' })
  }
  if (!Array.isArray(boxes) || !boxes.every(isValidBox)) {
    return res.status(400).json({ error: 'Provide "boxes" as [{ label, box_2d: [ymin, xmin, ymax, xmax] }].' })
  }

  try {
    const found = await saveDetections(id, boxes, !!edited)
    if (!found) return res.status(404).json({ error: 'Frame not found.' })
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save boxes', details: err.message })
  }
}


export async function listVideoSummaries(req, res) {
  try {
    res.json({ videos: await getVideoSummaries() })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to load videos', details: err.message })
  }
}