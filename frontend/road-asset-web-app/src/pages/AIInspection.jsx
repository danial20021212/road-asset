import React, { useCallback, useEffect, useState } from 'react'
import FrameViewer from '../components/FrameViewer'
import { MAX_FRAMES, BATCH_SIZE, seekTo, formatTime, processVideo, detectFrames } from '../utils/inspection'

import RouteMap from '../components/RouteMap'



// Reads one image file into a frame: { dataUrl, label, width, height, boxes, detected, edited }
// (mirrors the shape a video frame gets, minus the video-only "time" field)
const readImageFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read "${file.name}".`))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error(`"${file.name}" isn't a readable image.`))
      img.onload = () => {
        resolve({
          dataUrl: reader.result,
          label: file.name,
          width: img.naturalWidth,
          height: img.naturalHeight,
          boxes: [],
          detected: false,
          edited: false,
        })
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })

const AIInspection = () => {
  const [file, setFile] = useState(null) // a single video File, when in video mode
  const [imageFiles, setImageFiles] = useState(null) // one or more image Files, when in image mode
  const [fps, setFps] = useState(1)
  // Each frame: { dataUrl, label, width, height, boxes, detected, edited, detectError? }
  // Each box:   { id, box_2d: [ymin, xmin, ymax, xmax] (0-1000), label }
  const [frames, setFrames] = useState([])
  // idle | extracting | ready | detecting | done
  const [stage, setStage] = useState('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  const [viewerOpen, setViewerOpen] = useState(false)
  const [inspectingIndex, setInspectingIndex] = useState(null) // frame being inspected alone

  const [gpsPoints, setGpsPoints] = useState([]) // [{ time, lat, lng, speed }]
  const [gpsStatus, setGpsStatus] = useState('idle') // idle | loading | done | error
  const [gpsError, setGpsError] = useState('')

  const [previewUrl, setPreviewUrl] = useState(null) // browser-playable copy made by the server
  const [notice, setNotice] = useState('')   // next to the other useState lines

  const handleFile = (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = '' // allow re-selecting the same file(s) later
    if (picked.length === 0) return

    const videos = picked.filter((f) => f.type.startsWith('video/'))
    const images = picked.filter((f) => f.type.startsWith('image/'))

    if (videos.length > 0 && images.length > 0) {
      setError('Please select either one video or one or more images, not both.')
      return
    }
    if (videos.length > 1) {
      setError('Please select a single video at a time.')
      return
    }

    if (videos.length === 1) {
      setImageFiles(null)
      setFile(videos[0])
    } else if (images.length > 0) {
      setFile(null)
      setImageFiles(images)
    } else {
      setError('That file type is not supported. Choose a video or one or more images.')
    }
  }

  // ---- Upload once: server returns the GPS points and an H.264 copy for the browser ----
  useEffect(() => {
    setGpsPoints([])
    setGpsError('')
    setPreviewUrl(null)
    setNotice('')
    if (!file) {
      setGpsStatus('idle')
      return
    }

    const controller = new AbortController()
    setError('')
    setFrames([])
    setViewerOpen(false)
    setGpsStatus('loading')
    setStage('preparing')

    processVideo(file, controller.signal)
      .then(({ points, previewUrl, duplicate }) => {
        console.log(`GPS: ${points.length} points from ${file.name}`)
        setGpsPoints(points)
        setGpsStatus('done')
        if (duplicate) setNotice("This video was already uploaded, so it won't be added to the map again.")
        setPreviewUrl(previewUrl)
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        console.error('Video processing failed:', err)
        setGpsError(err.message)
        setGpsStatus('error')
        setStage('idle')
      })

    return () => controller.abort()
  }, [file])

  // ---- Step 1a: load frames directly when images are picked (no extraction needed) ----
  useEffect(() => {
    if (!imageFiles) return

    let cancelled = false
    setError('')
    setFrames([])
    setViewerOpen(false)
    setStage('extracting') // reuse the same busy state while images are being read
    setProgress({ done: 0, total: imageFiles.length })

    const load = async () => {
      const loaded = []
      for (let i = 0; i < imageFiles.length; i++) {
        if (cancelled) return
        try {
          loaded.push(await readImageFile(imageFiles[i]))
        } catch (err) {
          loaded.push({
            dataUrl: '',
            label: imageFiles[i].name,
            width: 0,
            height: 0,
            boxes: [],
            detected: false,
            edited: false,
            detectError: err.message,
          })
        }
        setProgress({ done: i + 1, total: imageFiles.length })
      }
      if (cancelled) return
      setFrames(loaded)
      setStage('ready')
    }
    load()

    return () => {
      cancelled = true
    }
  }, [imageFiles])


  // ---- Step 1b: extract frames from the server's H.264 copy (runs when it's ready or fps changes) ----
  useEffect(() => {
    if (!previewUrl) return

    let cancelled = false
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous' // needed to draw frames from another origin onto a canvas
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = previewUrl

    setError('')
    setFrames([])
    setViewerOpen(false)
    setStage('extracting')
    setProgress({ done: 0, total: 0 })

    const extract = async () => {
      try {
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve
          video.onerror = () => reject(new Error('Could not load the prepared video.'))
        })
        if (cancelled) return

        const step = 1 / fps
        const total = Math.min(Math.floor(video.duration / step) + 1, MAX_FRAMES)
        setProgress({ done: 0, total })

        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')

        const extracted = []
        for (let i = 0; i < total; i++) {
          if (cancelled) return
          const t = Math.min(i * step, Math.max(video.duration - 0.05, 0))
          await seekTo(video, t)
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          extracted.push({
            dataUrl: canvas.toDataURL('image/jpeg', 0.95),
            label: formatTime(t),
            width: canvas.width,
            height: canvas.height,
            boxes: [],
            detected: false,
            edited: false,
          })
          setProgress({ done: i + 1, total })
        }
        if (cancelled) return

        setFrames(extracted)
        setStage('ready')
      } catch (err) {
        if (cancelled) return
        setError(err.message || 'Something went wrong while extracting frames.')
        setStage('idle')
      }
    }
    extract()

    return () => {
      cancelled = true
    }
  }, [previewUrl, fps])

  // ---- Step 2a: run detection on all frames (frames with manual edits are kept as-is) ----
  const runInspection = async () => {
    if ((stage !== 'ready' && stage !== 'done') || frames.length === 0 || inspectingIndex !== null) return

    const targets = frames.map((_, i) => i).filter((i) => !frames[i].edited)
    if (targets.length === 0) return

    setError('')
    setStage('detecting')
    setProgress({ done: 0, total: targets.length })

    for (let start = 0; start < targets.length; start += BATCH_SIZE) {
      const idxs = targets.slice(start, start + BATCH_SIZE)
      const updated = await detectFrames(idxs.map((i) => frames[i]))
      setFrames((prev) => {
        const next = [...prev]
        idxs.forEach((frameIdx, j) => {
          next[frameIdx] = updated[j]
        })
        return next
      })
      setProgress({ done: Math.min(start + BATCH_SIZE, targets.length), total: targets.length })
    }

    setStage('done')
  }

  // ---- Step 2b: run detection on ONE frame (from the popup) ----
  const inspectFrame = async (i) => {
    if ((stage !== 'ready' && stage !== 'done') || inspectingIndex !== null || !frames[i]) return
    if (
      frames[i].edited &&
      !window.confirm('This frame has manual edits. Inspecting again will replace them. Continue?')
    ) {
      return
    }
    setInspectingIndex(i)
    const [updated] = await detectFrames([frames[i]])
    setFrames((prev) => prev.map((f, k) => (k === i ? updated : f)))
    setInspectingIndex(null)
  }

  // ---- Manual edits from the popup ----
  const updateFrameBoxes = useCallback((i, boxes) => {
    setFrames((prev) => prev.map((f, k) => (k === i ? { ...f, boxes, edited: true } : f)))
  }, [])

  const busy = stage === 'preparing' || stage === 'extracting' || stage === 'detecting' || inspectingIndex !== null
  const hasFrames = frames.length > 0
  const reviewedFrames = frames.filter((f) => f.detected || f.edited)
  const totalObjects = reviewedFrames.reduce((n, f) => n + f.boxes.length, 0)

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold text-slate-900">AI inspection</h1>
      <p className="mt-1 text-slate-600">
        Upload a dashcam video or images to review the frames, then optionally run detection and correct the
        results.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Video or image file
          <input
            type="file"
            accept="video/*,image/*"
            multiple
            onChange={handleFile}
            disabled={busy}
            className="text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-white hover:file:bg-slate-700 disabled:opacity-60"
          />
          <span className="text-xs text-slate-400">A video, or one or more images</span>
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Frames per second
          <select
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
            disabled={busy || !!imageFiles}
            title={imageFiles ? 'Only applies to video uploads' : undefined}
            className="rounded-md border border-slate-300 px-3 py-2 disabled:opacity-50"
          >
            <option value={0.5}>0.5 (1 every 2 s)</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={5}>5</option>
          </select>
        </label>

        <button
          onClick={runInspection}
          disabled={!hasFrames || busy}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {stage === 'detecting' ? 'Detecting…' : stage === 'done' ? 'Run inspection again' : 'Run inspection'}
        </button>
      </div>

      {stage === 'preparing' && (
        <p className="mt-4 text-sm text-slate-600">Uploading and preparing video… this can take a minute.</p>
      )}

      {busy && stage !== 'preparing' && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${(progress.done / (progress.total || 1)) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {stage === 'extracting'
              ? imageFiles
                ? `Loading image ${progress.done} of ${progress.total}`
                : `Extracting frame ${progress.done} of ${progress.total}`
              : stage === 'detecting'
                ? `Detecting in frame ${progress.done} of ${progress.total}`
                : 'Inspecting frame…'}
          </p>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-2 text-sm text-amber-600">{notice}</p>}

      {gpsStatus === 'loading' && <p className="mt-2 text-sm text-slate-500">Reading GPS data…</p>}
      {gpsStatus === 'done' && (
        <p className="mt-2 text-sm text-slate-600">
          {gpsPoints.length > 0
            ? `GPS: ${gpsPoints.length} points found`
            : 'No GPS data found in this video'}
        </p>
      )}
      {gpsStatus === 'error' && <p className="mt-2 text-sm text-red-600">GPS: {gpsError}</p>}

      {!file && !imageFiles && (
        <p className="mt-10 text-center text-slate-500">Choose a video or image(s) to get started.</p>
      )}

      {hasFrames && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            {frames.length} frame{frames.length !== 1 && 's'} extracted
            {reviewedFrames.length > 0 &&
              ` · ${totalObjects} object${totalObjects !== 1 ? 's' : ''} in ${reviewedFrames.length} reviewed frame${reviewedFrames.length !== 1 ? 's' : ''}`}
          </p>
          <button
            onClick={() => setViewerOpen(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            View frames
          </button>
        </div>
      )}

      {viewerOpen && hasFrames && (
        <FrameViewer
          frames={frames}
          fileName={file?.name || (imageFiles ? `${imageFiles.length} image${imageFiles.length !== 1 ? 's' : ''}` : undefined)}
          onClose={() => setViewerOpen(false)}
          onInspect={inspectFrame}
          onBoxesChange={updateFrameBoxes}
          inspectingIndex={inspectingIndex}
          inspectDisabled={stage === 'detecting'}
        />
      )}

      {gpsPoints.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-medium text-slate-700">Route</h2>
          <RouteMap points={gpsPoints} />
        </div>
      )}
    </div>
  )
}

export default AIInspection