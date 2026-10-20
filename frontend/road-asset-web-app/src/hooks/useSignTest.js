import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE, formatTime } from '../utils/inspection'
import { fetchFrames } from '../utils/trips'
import { SIGN_BATCH_SIZE, detectSignFrames } from '../utils/signs'

// Frames only: saved boxes are deliberately not loaded in the test tab
const toViewerFrame = (f) => ({
  id: f.id,
  dataUrl: `${API_BASE}${f.url}`,
  label: formatTime(f.seq),
  width: 1280,
  height: 720,
  boxes: [],
  detected: false,
  edited: false,
})

// Frames of one saved video with the open-prompt sign detector. Nothing is saved to the database.
export function useSignTest(videoId) {
  const [frames, setFrames] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [inspectingIndex, setInspectingIndex] = useState(null)
  const [detecting, setDetecting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const framesRef = useRef([])
  framesRef.current = frames

  useEffect(() => {
    if (videoId == null) return
    let cancelled = false
    setFrames([])
    setStatus('loading')

    fetchFrames(videoId)
      .then((data) => {
        if (cancelled) return
        setFrames(data.map(toViewerFrame))
        setStatus('done')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [videoId])

  // Inspect ONE frame (from the popup)
  const inspectFrame = async (i) => {
    const frame = framesRef.current[i]
    if (!frame || inspectingIndex !== null || detecting) return
    if (
      frame.edited &&
      !window.confirm('This frame has manual edits. Inspecting again will replace them. Continue?')
    ) {
      return
    }

    setInspectingIndex(i)
    const [updated] = await detectSignFrames([frame])
    setFrames((prev) => prev.map((f, k) => (k === i ? updated : f)))
    setInspectingIndex(null)
  }

  // Inspect ALL frames (frames with manual edits are kept as they are)
  const inspectAll = async () => {
    const current = framesRef.current
    const targets = current.map((_, i) => i).filter((i) => !current[i].edited)
    if (targets.length === 0 || detecting || inspectingIndex !== null) return

    setDetecting(true)
    setProgress({ done: 0, total: targets.length })

    for (let start = 0; start < targets.length; start += SIGN_BATCH_SIZE) {
      const idxs = targets.slice(start, start + SIGN_BATCH_SIZE)
      const updated = await detectSignFrames(idxs.map((i) => framesRef.current[i]))

      setFrames((prev) => {
        const next = [...prev]
        idxs.forEach((frameIdx, j) => {
          next[frameIdx] = updated[j]
        })
        return next
      })
      setProgress({ done: Math.min(start + SIGN_BATCH_SIZE, targets.length), total: targets.length })
    }

    setDetecting(false)
  }

  // Manual edits from the popup (kept in memory only)
  const updateFrameBoxes = useCallback((i, boxes) => {
    setFrames((prev) => prev.map((f, k) => (k === i ? { ...f, boxes, edited: true } : f)))
  }, [])

  return {
    frames,
    setFrames,
    status,
    inspectingIndex,
    detecting,
    progress,
    inspectFrame,
    inspectAll,
    updateFrameBoxes,
  }
}