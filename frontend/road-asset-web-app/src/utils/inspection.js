// Everything the inspection pages need that isn't a React component:
// settings, class lists and colors, small helpers, and talking to the detection endpoint.

// ===========================================================================
// Settings
// ===========================================================================
export const API_BASE = 'http://localhost:3001' // or 'http://localhost:3001'
export const DETECT_ENDPOINT = `${API_BASE}/api/detect`
export const BATCH_SIZE = 5 // frames per detection request; must not exceed MAX_IMAGES in detect.controller.js

// ===========================================================================
// Classes
// ===========================================================================
// The model gives every traffic sign one of these categories
export const SIGN_CATEGORIES = [
  'regulatory_prohibitive',
  'regulatory_mandatory',
  'warning',
  'informative',
  'construction_temporary',
  'unknown',
]

// Everything else the model can label (anything that is not a traffic sign)
export const OBJECT_CLASSES = [
  'expressway sign',
  'traffic light',
  'left turn arrow road marking',
  'right turn arrow road marking',
  'straight arrow road marking',
  'left and straight arrow road marking',
  'right and straight arrow road marking',
  'left and u-turn arrow road marking',
  'right and u-turn arrow road marking',
  'u-turn arrow road marking',
  'yellow box junction',
  'feeder pillar',
  'bus stop',
  'traffic island',
]

// What the viewer shows and its dropdowns offer. A traffic sign appears as its category.
export const CLASS_OPTIONS = [...SIGN_CATEGORIES, ...OBJECT_CLASSES]

// Full class names are written out so Tailwind can find them
const CLASS_STYLES = {
  // traffic sign categories
  regulatory_prohibitive: { border: 'border-red-500', bg: 'bg-red-500/15', tag: 'bg-red-500' },
  regulatory_mandatory: { border: 'border-blue-600', bg: 'bg-blue-600/15', tag: 'bg-blue-600' },
  warning: { border: 'border-yellow-400', bg: 'bg-yellow-400/15', tag: 'bg-yellow-400' },
  informative: { border: 'border-sky-400', bg: 'bg-sky-400/15', tag: 'bg-sky-400' },
  construction_temporary: { border: 'border-orange-500', bg: 'bg-orange-500/15', tag: 'bg-orange-500' },
  unknown: { border: 'border-slate-400', bg: 'bg-slate-400/15', tag: 'bg-slate-400' },

  // other objects
  'expressway sign': { border: 'border-emerald-600', bg: 'bg-emerald-600/15', tag: 'bg-emerald-600' },
  'traffic light': { border: 'border-cyan-400', bg: 'bg-cyan-400/15', tag: 'bg-cyan-400' },
  'left turn arrow road marking': { border: 'border-blue-400', bg: 'bg-blue-400/15', tag: 'bg-blue-400' },
  'right turn arrow road marking': { border: 'border-violet-400', bg: 'bg-violet-400/15', tag: 'bg-violet-400' },
  'straight arrow road marking': { border: 'border-green-400', bg: 'bg-green-400/15', tag: 'bg-green-400' },
  'left and straight arrow road marking': { border: 'border-lime-400', bg: 'bg-lime-400/15', tag: 'bg-lime-400' },
  'right and straight arrow road marking': { border: 'border-teal-400', bg: 'bg-teal-400/15', tag: 'bg-teal-400' },
  'left and u-turn arrow road marking': { border: 'border-pink-400', bg: 'bg-pink-400/15', tag: 'bg-pink-400' },
  'right and u-turn arrow road marking': { border: 'border-rose-400', bg: 'bg-rose-400/15', tag: 'bg-rose-400' },
  'u-turn arrow road marking': { border: 'border-purple-400', bg: 'bg-purple-400/15', tag: 'bg-purple-400' },
  'yellow box junction': { border: 'border-amber-500', bg: 'bg-amber-500/15', tag: 'bg-amber-500' },
  'feeder pillar': { border: 'border-indigo-400', bg: 'bg-indigo-400/15', tag: 'bg-indigo-400' },
  'bus stop': { border: 'border-stone-400', bg: 'bg-stone-400/15', tag: 'bg-stone-400' },
  'traffic island': { border: 'border-purple-600', bg: 'bg-purple-600/15', tag: 'bg-purple-600' },
}

// A label that isn't in the table (for example one the model invented) gets this color
const DEFAULT_STYLE = { border: 'border-fuchsia-400', bg: 'bg-fuchsia-400/15', tag: 'bg-fuchsia-400' }
export const styleFor = (label) => CLASS_STYLES[label] || DEFAULT_STYLE

export const MIN_SIZE = 6 // smallest box (in 0-1000 units) when resizing
export const MIN_DRAW = 5 // drawn boxes smaller than this in either direction are discarded

// Boxes are stored on a 0-1000 scale, so every coordinate is clamped to that range
export const clamp = (v) => Math.max(0, Math.min(1000, v))

// ===========================================================================
// Small helpers
// ===========================================================================
export const formatTime = (s) => {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}

let boxCounter = 0
export const newId = () => `box-${++boxCounter}`

// ===========================================================================
// Box conversion
// A viewer box:  { id, box_2d: [ymin, xmin, ymax, xmax], label, shape?, main_color?, confidence? }
//   where label is the category for a traffic sign, otherwise the object's own label.
// An API box (what the server stores and returns): the same, but with label + category separate.
// ===========================================================================
export const toViewerBox = (b) => ({
  id: newId(),
  box_2d: b.box_2d,
  label: b.label === 'traffic sign' ? b.category || 'unknown' : b.label,
  shape: b.shape ?? null,
  main_color: b.main_color ?? null,
  confidence: b.confidence ?? null,
})

export const toApiBox = (b) => {
  const isSignCategory = SIGN_CATEGORIES.includes(b.label)
  return {
    label: isSignCategory ? 'traffic sign' : b.label,
    category: isSignCategory ? b.label : null,
    shape: b.shape ?? null,
    main_color: b.main_color ?? null,
    confidence: b.confidence ?? null,
    box_2d: b.box_2d,
  }
}

// ===========================================================================
// Talking to the server
// ===========================================================================
// Uploads a video once. The server reads its GPS, cuts one frame per second and saves everything.
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

  const { videoId, duplicate } = await res.json()
  if (!videoId) {
    throw new Error('The video was processed but could not be saved. Check that the database is running.')
  }
  return { videoId, duplicate: !!duplicate }
}

// Frames from the server are plain URLs; the detector needs base64
export const toDataUrl = async (src) => {
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

// Sends 1..BATCH_SIZE frames to /api/detect and returns the same frames with fresh boxes.
// results[i] from the server belongs to chunk[i]. A frame that fails keeps its previous boxes.
export const detectFrames = async (chunk) => {
  try {
    const images = await Promise.all(chunk.map((f) => toDataUrl(f.dataUrl)))

    const res = await fetch(DETECT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    })
    if (!res.ok) throw new Error(`Detection request failed (status ${res.status})`)

    const { results } = await res.json()
    if (!Array.isArray(results) || results.length !== chunk.length) {
      throw new Error('The server returned the wrong number of results')
    }

    return chunk.map((f, j) => {
      const r = results[j]
      if (r.error) return { ...f, detectError: r.error }
      return { ...f, boxes: r.detections.map(toViewerBox), detected: true, edited: false, detectError: undefined }
    })
  } catch (err) {
    console.error(err)
    return chunk.map((f) => ({ ...f, detectError: err.message }))
  }
}