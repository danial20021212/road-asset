import { DETECT_PROMPT } from '../prompts/detect.js'

const API_KEY = process.env.ROBOFLOW_API_KEY
const WORKFLOW_URL = 'https://serverless.roboflow.com/danial-lja5y/workflows/gemini-4-argon-open-prompt'

const SIGN_CATEGORIES = [
  'regulatory_prohibitive',
  'regulatory_mandatory',
  'warning',
  'informative',
  'construction_temporary',
  'unknown',
]

// ---------------------------------------------------------------------------
// Finding the model's JSON list inside the workflow output.
// It may be nested anywhere, or be a JSON string (optionally in a ```json fence).
// ---------------------------------------------------------------------------
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

const isNum = (n) => n !== null && n !== '' && Number.isFinite(Number(n))
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(isNum)

const findDetectionList = (node, depth = 0) => {
  if (depth > 8) return null
  node = parseMaybeJson(node)

  if (Array.isArray(node)) {
    if (node.length > 0 && node.every((it) => it && isBox(it.box_2d))) return node
    for (const item of node) {
      const found = findDetectionList(item, depth + 1)
      if (found) return found
    }
    return null
  }

  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) {
      const found = findDetectionList(value, depth + 1)
      if (found) return found
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Cleaning one detection so the database and the frontend can trust it
// ---------------------------------------------------------------------------
const clamp = (v) => Math.max(0, Math.min(1000, v))
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null)
const num = (v) => (isNum(v) ? Number(v) : null)

function normalize(item) {
  const label = text(item.label) ?? (item.category ? 'traffic sign' : 'unknown')
  const category = text(item.category)
  const [y1, x1, y2, x2] = item.box_2d.map((n) => clamp(Number(n)))

  return {
    label,
    // only traffic signs have a category
    category: label === 'traffic sign' ? (SIGN_CATEGORIES.includes(category) ? category : 'unknown') : null,
    shape: text(item.shape),
    main_color: text(item.main_color),
    confidence: num(item.confidence),
    // [ymin, xmin, ymax, xmax] on a 0-1000 scale, with the corners in the right order
    box_2d: [Math.min(y1, y2), Math.min(x1, x2), Math.max(y1, y2), Math.max(x1, x2)],
  }
}

// Sends ONE image (base64, with or without the data: prefix) and returns its detections
export async function detectImage(image) {
  const res = await fetch(WORKFLOW_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      inputs: {
        image: {
          type: 'base64',
          value: image.startsWith('data:') ? image.slice(image.indexOf(',') + 1) : image,
        },
        prompt: DETECT_PROMPT,
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Roboflow error ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const result = await res.json()
  const output = result.outputs?.[0] ?? result
  if (process.env.DEBUG_DETECT) console.log('Raw workflow output:', JSON.stringify(output).slice(0, 2000))

  return (findDetectionList(output) ?? []).map(normalize)
}