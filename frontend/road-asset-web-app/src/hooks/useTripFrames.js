import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE, BATCH_SIZE, detectFrames, formatTime, newId } from '../utils/inspection'
import { fetchFrames, saveFrameBoxes } from '../utils/trips'

// Turns a saved frame (with its saved boxes) into the shape FrameViewer uses
const toViewerFrame = (f) => ({
  id: f.id, // database id, needed for saving
  dataUrl: `${API_BASE}${f.url}`,
  label: formatTime(f.seq),
  width: 1280, // saved frames are 1280 px wide (16:9)
  height: 720,
  boxes: f.boxes.map((b) => ({ id: newId(), box_2d: b.box_2d, label: b.label })),
  detected: f.inspected,
  edited: f.edited,
  lat: f.lat,
  lng: f.lng,
})

// Frames, boxes and inspection for one saved video. Pass null for "no video".
export function useTripFrames(videoId) {
  const [frames, setFrames] = useState([])
  const [status, setStatus] = useState('idle') // idle | loading | done | error
  const [inspectingIndex, setInspectingIndex] = useState(null) // frame being inspected alone
  const [detecting, setDetecting] = useState(false) // "inspect all frames" is running
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error

  const framesRef = useRef([])
  framesRef.current = frames // lets callbacks read the latest frames
  const saveTimers = useRef({}) // one pending save per frame

  // Load the saved frames and boxes whenever the video changes
  useEffect(() => {
    if (videoId == null) return
    let cancelled = false
    setFrames([])
    setStatus('loading')
    setSaveStatus('idle')

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

  // Saves a frame's boxes 0.8 s after the last change to that frame
  const scheduleSave = useCallback((frame, boxes, edited) => {
    if (frame?.id == null) return // frames from picked images aren't in the database
    clearTimeout(saveTimers.current[frame.id])
    setSaveStatus('saving')
    saveTimers.current[frame.id] = setTimeout(async () => {
      try {
        await saveFrameBoxes(frame.id, boxes, edited)
        setSaveStatus('saved')
      } catch (err) {
        console.error(err)
        setSaveStatus('error')
      }
    }, 800)
  }, [])

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
    const [updated] = await detectFrames([frame])
    setFrames((prev) => prev.map((f, k) => (k === i ? updated : f)))
    // don't save a failed run, it would wipe the boxes already saved
    if (!updated.detectError) scheduleSave(updated, updated.boxes, false)
    setInspectingIndex(null)
  }

  // Inspect ALL frames (frames with manual edits are kept as-is)
  const inspectAll = async () => {
    const current = framesRef.current
    const targets = current.map((_, i) => i).filter((i) => !current[i].edited && current[i].dataUrl)
    if (targets.length === 0 || detecting || inspectingIndex !== null) return

    setDetecting(true)
    setProgress({ done: 0, total: targets.length })

    for (let start = 0; start < targets.length; start += BATCH_SIZE) {
      const idxs = targets.slice(start, start + BATCH_SIZE)
      const updated = await detectFrames(idxs.map((i) => framesRef.current[i]))

      setFrames((prev) => {
        const next = [...prev]
        idxs.forEach((frameIdx, j) => {
          next[frameIdx] = updated[j]
        })
        return next
      })
      updated.forEach((f) => {
        if (!f.detectError) scheduleSave(f, f.boxes, false)
      })
      setProgress({ done: Math.min(start + BATCH_SIZE, targets.length), total: targets.length })
    }

    setDetecting(false)
  }

  // Manual edits from the popup
  const updateFrameBoxes = useCallback(
    (i, boxes) => {
      const frame = framesRef.current[i]
      setFrames((prev) => prev.map((f, k) => (k === i ? { ...f, boxes, edited: true } : f)))
      scheduleSave(frame, boxes, true)
    },
    [scheduleSave]
  )

  return {
    frames,
    setFrames, // used by the AI Inspection page for picked images
    status,
    inspectingIndex,
    detecting,
    progress,
    saveStatus,
    inspectFrame,
    inspectAll,
    updateFrameBoxes,
  }
}