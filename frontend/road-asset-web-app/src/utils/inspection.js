// Everything the AI inspection page needs that isn't a React component:
// settings, small helpers, and turning model output into boxes.

// ===========================================================================
// Settings
// ===========================================================================
export const MAX_FRAMES = 300 // safety cap so the browser tab doesn't run out of memory
export const API_BASE = 'http://192.168.0.31:3001' // or 'http://localhost:3001'
export const BATCH_ENDPOINT = `${API_BASE}/api/detect-chevrons`
export const BATCH_SIZE = 5 // must match MAX_IMAGES on the server / the model's Max Concurrent Requests

export const CLASS_OPTIONS = ['chevron sign', 'traffic light']

const CLASS_STYLES = {
  'chevron sign': { border: 'border-orange-400', bg: 'bg-orange-400/15', tag: 'bg-orange-400' },
  'traffic light': { border: 'border-cyan-400', bg: 'bg-cyan-400/15', tag: 'bg-cyan-400' },
}
const DEFAULT_STYLE = { border: 'border-fuchsia-400', bg: 'bg-fuchsia-400/15', tag: 'bg-fuchsia-400' }
export const styleFor = (label) => CLASS_STYLES[label] || DEFAULT_STYLE

export const MIN_SIZE = 6 // smallest box (in 0-1000 units) when resizing
export const MIN_DRAW = 5 // drawn boxes smaller than this in either direction are discarded

// Boxes are stored on a 0-1000 scale, so every coordinate is clamped to that range
export const clamp = (v) => Math.max(0, Math.min(1000, v))


// ===========================================================================
// Small helpers
// ===========================================================================
// Seek a video to a time and wait until that frame is ready to draw
export const seekTo = (video, time) =>
  new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('Could not read a frame from this video.'))
    }
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = Math.max(time, 0.001)
  })

export const formatTime = (s) => {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}


// ===========================================================================
// Model output -> boxes
// ===========================================================================
// ---------------------------------------------------------------------------
// Turning the model output into editable boxes.
// Every box is stored as { id, box_2d: [ymin, xmin, ymax, xmax], label }
// with coordinates normalised to 0-1000 (so they scale with any image size).
// ---------------------------------------------------------------------------

let boxCounter = 0
export const newId = () => `box-${++boxCounter}`

const parseMaybeJson = (v) => {
  if (typeof v !== 'string') return v
  const t = v.trim()
  if (!(t.startsWith('[') || t.startsWith('{') || t.startsWith('```'))) return v
  const stripped = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    return JSON.parse(stripped)
  } catch {
    return v
  }
}

// Walk the workflow output looking for an array of { box_2d, label } objects.
// The array may be nested anywhere, or be a JSON string (optionally in a ```json fence).
const findBoxArray = (node, depth = 0) => {
  if (depth > 8) return null
  node = parseMaybeJson(node)
  if (Array.isArray(node)) {
    if (node.length > 0 && node.every((it) => it && Array.isArray(it.box_2d) && it.box_2d.length === 4)) {
      return node
    }
    for (const item of node) {
      const found = findBoxArray(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) {
      const found = findBoxArray(value, depth + 1)
      if (found) return found
    }
  }
  return null
}

export const extractBoxes = (output, fallbackDims) => {
  // 1) Preferred: Roboflow's parsed predictions (pixel x/y center + width/height).
  const preds = output?.model?.predictions?.predictions
  if (Array.isArray(preds)) {
    const rawBoxes = findBoxArray(output)
    if (preds.length === 0 && rawBoxes) {
      console.warn('No parsed predictions but raw box_2d found — ignoring raw boxes', rawBoxes)
    }
    const dims = output?.model?.predictions?.image || fallbackDims
    return preds.map((p) => ({
      id: newId(),
      box_2d: [
        clamp(((p.y - p.height / 2) / dims.height) * 1000),
        clamp(((p.x - p.width / 2) / dims.width) * 1000),
        clamp(((p.y + p.height / 2) / dims.height) * 1000),
        clamp(((p.x + p.width / 2) / dims.width) * 1000),
      ],
      label: p.class || CLASS_OPTIONS[0],
    }))
  }

  // 2) Fallback only: raw [{ box_2d, label }] list (axis order can't be trusted)
  const modelBoxes = findBoxArray(output)
  if (modelBoxes) {
    return modelBoxes.map((b) => ({
      id: newId(),
      box_2d: b.box_2d.map((n) => clamp(Number(n))),
      label: b.label || b.class || CLASS_OPTIONS[0],
    }))
  }

  console.warn('No boxes found in workflow output (unrecognised shape):', output)
  return []
}

// Uploads a video once. Returns its GPS points and a URL to a browser-playable (H.264) copy.
export const processVideo = async (file, signal) => {
  const form = new FormData()
  form.append('video', file)

  const res = await fetch(`${API_BASE}/api/video/process`, { method: 'POST', body: form, signal })
  if (!res.ok) {
    let message = `Video processing failed (status ${res.status})`
    try {
      const body = await res.json()
      if (body.error) message = body.error
    } catch {
      // not JSON; keep the default message
    }
    throw new Error(message)
  }

  const { points, previewUrl, duplicate } = await res.json()
  return {
    points: Array.isArray(points) ? points : [],
    previewUrl: `${API_BASE}${previewUrl}`,
    duplicate: !!duplicate,
  }
}


// Frames from the server are plain URLs; the detector needs base64
const toDataUrl = async (src) => {
  if (src.startsWith('data:')) return src

  const res = await fetch(src)
  if (!res.ok) throw new Error(`Could not load frame (status ${res.status})`)
  const blob = await res.blob()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read frame image.'))
    reader.readAsDataURL(blob)
  })
}

// Sends 1..BATCH_SIZE frames to the backend in one request and returns the same
// frames with fresh boxes. The server matches outputs[i] back to images[i].
export const detectFrames = async (chunk) => {
  const clean = chunk.map((f) => ({
    ...f,
    boxes: [],
    detected: false,
    edited: false,
    detectError: undefined,
  }))
  try {
    const images = await Promise.all(clean.map((f) => toDataUrl(f.dataUrl)))

    const res = await fetch(BATCH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    })
    if (!res.ok) throw new Error(`Batch request failed (status ${res.status})`)
    const result = await res.json()
    const outputs = Array.isArray(result.outputs) ? result.outputs : []

    if (outputs.length !== clean.length) {
      console.warn(
        `Batch mismatch: sent ${clean.length} frames, got ${outputs.length} outputs. Marking this batch as failed.`
      )
      return clean.map((f) => ({
        ...f,
        detectError: `Batch returned ${outputs.length} results for ${clean.length} frames`,
      }))
    }

    return clean.map((f, j) => ({
      ...f,
      boxes: extractBoxes(outputs[j], { width: f.width, height: f.height }),
      detected: true,
    }))
  } catch (err) {
    return clean.map((f) => ({ ...f, detectError: err.message }))
  }
}