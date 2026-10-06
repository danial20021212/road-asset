import React, { useCallback, useEffect, useState } from 'react'
import FrameViewer from '../components/FrameViewer'
import { processVideo } from '../utils/inspection'
import { fetchVideos } from '../utils/trips'
import { useTripFrames } from '../hooks/useTripFrames'

const formatDate = (iso) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

// Reads one image file into a frame: { dataUrl, label, width, height, boxes, detected, edited }
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
  const [videos, setVideos] = useState([]) // history: every saved video
  const [videosStatus, setVideosStatus] = useState('loading') // loading | done | error
  const [selectedId, setSelectedId] = useState(null) // the video currently loaded
  const [imageCount, setImageCount] = useState(null) // set when the frames come from picked images
  const [imageProgress, setImageProgress] = useState(null) // { done, total } while images are read
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [viewerOpen, setViewerOpen] = useState(false)

  const {
    frames,
    setFrames,
    status: framesStatus,
    inspectingIndex,
    detecting,
    progress,
    saveStatus,
    inspectFrame,
    inspectAll,
    updateFrameBoxes,
  } = useTripFrames(selectedId)

  const loadVideos = useCallback(async () => {
    try {
      setVideos(await fetchVideos())
      setVideosStatus('done')
    } catch (err) {
      console.error(err)
      setVideosStatus('error')
    }
  }, [])

  useEffect(() => {
    loadVideos()
  }, [loadVideos])

  // Load a video from the history. Clearing the frames in the same update avoids showing the old ones.
  const selectVideo = (id) => {
    setError('')
    setNotice('')
    if (id !== selectedId) {
      setFrames([])
      setImageCount(null)
      setSelectedId(id)
    }
    setViewerOpen(true) // the viewer appears as soon as the frames have loaded
  }

  const uploadVideo = async (file) => {
    setUploading(true)
    setViewerOpen(false)
    try {
      const { videoId, duplicate } = await processVideo(file)
      await loadVideos()
      if (videoId !== selectedId) {
        setFrames([])
        setImageCount(null)
        setSelectedId(videoId)
      }
      if (duplicate) {
        setNotice('This video was already uploaded, so its saved frames and results are shown.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  // Images are only kept in memory: they aren't part of a saved video
  const loadImages = async (files) => {
    setSelectedId(null)
    setFrames([])
    setViewerOpen(false)
    setImageCount(files.length)
    setImageProgress({ done: 0, total: files.length })

    const loaded = []
    for (let i = 0; i < files.length; i++) {
      try {
        loaded.push(await readImageFile(files[i]))
      } catch (err) {
        loaded.push({
          dataUrl: '',
          label: files[i].name,
          width: 0,
          height: 0,
          boxes: [],
          detected: false,
          edited: false,
          detectError: err.message,
        })
      }
      setImageProgress({ done: i + 1, total: files.length })
    }
    setFrames(loaded)
    setImageProgress(null)
  }

  const handleFile = async (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = '' // allow re-selecting the same file(s) later
    if (picked.length === 0) return

    setError('')
    setNotice('')

    const picks = {
      videos: picked.filter((f) => f.type.startsWith('video/')),
      images: picked.filter((f) => f.type.startsWith('image/')),
    }

    if (picks.videos.length > 0 && picks.images.length > 0) {
      setError('Please select either one video or one or more images, not both.')
    } else if (picks.videos.length > 1) {
      setError('Please select a single video at a time.')
    } else if (picks.videos.length === 1) {
      await uploadVideo(picks.videos[0])
    } else if (picks.images.length > 0) {
      await loadImages(picks.images)
    } else {
      setError('That file type is not supported. Choose a video or one or more images.')
    }
  }

  const busy = uploading || imageProgress !== null || framesStatus === 'loading' || detecting || inspectingIndex !== null
  const hasFrames = frames.length > 0
  const reviewedFrames = frames.filter((f) => f.detected || f.edited)
  const totalObjects = reviewedFrames.reduce((n, f) => n + f.boxes.length, 0)
  const bar = imageProgress ?? (detecting ? progress : null)

  const selectedVideo = videos.find((v) => v.id === selectedId)
  const currentName = selectedVideo?.name ?? (imageCount ? `${imageCount} image${imageCount !== 1 ? 's' : ''}` : '')

  // Counts for the open video are taken from the frames on screen, so they update as you edit
  const liveStats =
    selectedId !== null && framesStatus === 'done'
      ? { frame_count: frames.length, inspected_count: reviewedFrames.length, object_count: totalObjects }
      : null

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold text-slate-900">AI inspection</h1>
      <p className="mt-1 text-slate-600">
        Upload a dashcam video or images, review the frames, run detection and correct the results. Every
        uploaded video is kept in the history below.
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

        <button
          onClick={inspectAll}
          disabled={!hasFrames || busy}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {detecting ? 'Detecting…' : reviewedFrames.length > 0 ? 'Run inspection again' : 'Run inspection'}
        </button>
      </div>

      {uploading && (
        <p className="mt-4 text-sm text-slate-600">Uploading and preparing video… this can take a minute.</p>
      )}
      {framesStatus === 'loading' && <p className="mt-4 text-sm text-slate-600">Loading frames…</p>}

      {bar && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${(bar.done / (bar.total || 1)) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {imageProgress
              ? `Loading image ${bar.done} of ${bar.total}`
              : `Detecting in frame ${bar.done} of ${bar.total}`}
          </p>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {notice && <p className="mt-2 text-sm text-amber-600">{notice}</p>}
      {framesStatus === 'error' && <p className="mt-2 text-sm text-red-600">Could not load the saved frames.</p>}
      {saveStatus === 'error' && (
        <p className="mt-2 text-sm text-red-600">Your last change could not be saved. Check the server.</p>
      )}

      {/* The video (or images) currently loaded */}
      {hasFrames && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div>
            <p className="font-medium text-slate-900">{currentName}</p>
            <p className="text-sm text-slate-600">
              {frames.length} frame{frames.length !== 1 && 's'}
              {reviewedFrames.length > 0 &&
                ` · ${totalObjects} object${totalObjects !== 1 ? 's' : ''} in ${reviewedFrames.length} reviewed frame${reviewedFrames.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setViewerOpen(true)}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            View frames
          </button>
        </div>
      )}

      {/* History */}
      <h2 className="mt-8 text-lg font-semibold text-slate-900">Uploaded videos</h2>

      {videosStatus === 'loading' && <p className="mt-2 text-sm text-slate-500">Loading videos…</p>}
      {videosStatus === 'error' && (
        <p className="mt-2 text-sm text-red-600">Could not load the video history. Check the server and database.</p>
      )}
      {videosStatus === 'done' && videos.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">No videos uploaded yet. Choose a video to get started.</p>
      )}

      {videos.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {videos.map((v) => {
            const s = v.id === selectedId && liveStats ? { ...v, ...liveStats } : v
            return (
              <li key={v.id}>
                <button
                  onClick={() => selectVideo(v.id)}
                  disabled={busy}
                  className={`flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${
                    v.id === selectedId ? 'bg-blue-50' : ''
                  }`}
                >
                  <div>
                    <p className="font-medium text-slate-900">{v.name}</p>
                    <p className="text-xs text-slate-500">
                      Uploaded {formatDate(v.created_at)} ·{' '}
                      {v.gps_count > 0 ? `${v.gps_count} GPS points` : 'no GPS'}
                    </p>
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <p>{s.frame_count} frames</p>
                    <p>
                      {s.inspected_count} inspected · {s.object_count} object{s.object_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {viewerOpen && hasFrames && (
        <FrameViewer
          frames={frames}
          fileName={currentName}
          onClose={() => setViewerOpen(false)}
          onInspect={inspectFrame}
          onBoxesChange={updateFrameBoxes}
          inspectingIndex={inspectingIndex}
          inspectDisabled={detecting}
          saveStatus={selectedId !== null ? saveStatus : undefined}
        />
      )}
    </div>
  )
}

export default AIInspection