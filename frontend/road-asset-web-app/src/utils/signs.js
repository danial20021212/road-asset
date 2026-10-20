import { API_BASE, SIGN_CATEGORIES, clamp, findBoxArray, newId, toDataUrl } from './inspection'

const SIGN_ENDPOINT = `${API_BASE}/api/detect-signs`
export const SIGN_BATCH_SIZE = 5 // must not exceed MAX_IMAGES in signs.controller.js

// The model returns [{ box_2d: [ymin, xmin, ymax, xmax], category, shape, main_color, confidence }, ...]
// somewhere in the workflow output (possibly as a JSON string). The viewer's label is the category.
const extractSignBoxes = (output) => {
  const items = findBoxArray(output) ?? []
  return items.map((it) => ({
    id: newId(),
    box_2d: it.box_2d.map((n) => clamp(Number(n))),
    label: SIGN_CATEGORIES.includes(it.category) ? it.category : 'unknown',
    // extra details, kept on the box but not shown in the viewer
    shape: it.shape,
    main_color: it.main_color,
    confidence: it.confidence,
  }))
}

// Same idea as detectFrames, but for the open-prompt sign workflow
export const detectSignFrames = async (chunk) => {
  const clean = chunk.map((f) => ({
    ...f,
    boxes: [],
    detected: false,
    edited: false,
    detectError: undefined,
  }))

  try {
    const images = await Promise.all(clean.map((f) => toDataUrl(f.dataUrl)))

    const res = await fetch(SIGN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    })
    if (!res.ok) throw new Error(`Sign detection failed (status ${res.status})`)

    const { outputs } = await res.json()
    if (!Array.isArray(outputs) || outputs.length !== clean.length) {
      throw new Error('The server returned the wrong number of results')
    }

    return clean.map((f, j) => {
      console.debug('Sign test raw output:', outputs[j]) // check this if no boxes appear
      return { ...f, boxes: extractSignBoxes(outputs[j]), detected: true }
    })
  } catch (err) {
    console.error(err)
    return clean.map((f) => ({ ...f, detectError: err.message }))
  }
}