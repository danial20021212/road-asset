import React, { useEffect, useState } from 'react'
import FrameViewer from '../components/FrameViewer'
import { SIGN_CATEGORIES } from '../utils/inspection'
import { fetchVideos } from '../utils/trips'
import { useSignTest } from '../hooks/useSignTest'

const formatDate = (iso) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const SignTest = () => {
  const [videos, setVideos] = useState([])
  const [videosStatus, setVideosStatus] = useState('loading') // loading | done | error
  const [selectedId, setSelectedId] = useState(null)
  const [viewerOpen, setViewerOpen] = useState(false)

  const {
    frames,
    setFrames,
    status,
    inspectingIndex,
    detecting,
    progress,
    inspectFrame,
    inspectAll,
    updateFrameBoxes,
  } = useSignTest(selectedId)

  useEffect(() => {
    let cancelled = false
    fetchVideos()
      .then((data) => {
        if (cancelled) return
        setVideos(data)
        setVideosStatus('done')
      })
      .catch(() => {
        if (!cancelled) setVideosStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Clearing the frames in the same update avoids showing the previous video's frames
  const selectVideo = (id) => {
    if (id !== selectedId) {
      setFrames([])
      setSelectedId(id)
    }
    setViewerOpen(true)
  }

  const busy = status === 'loading' || detecting || inspectingIndex !== null
  const hasFrames = frames.length > 0
  const selectedVideo = videos.find((v) => v.id === selectedId)

  // how many boxes of each category were found
  const counts = {}
  frames.forEach((f) =>
    f.boxes.forEach((b) => {
      counts[b.label] = (counts[b.label] || 0) + 1
    })
  )
  const totalObjects = Object.values(counts).reduce((sum, n) => sum + n, 0)

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Sign test</h1>
      <p className="mt-1 text-slate-600">
        Try the open-prompt sign workflow on a video you have already uploaded. Results here are only a test:
        nothing is saved, and they are gone when you leave this tab.
      </p>

      {status === 'loading' && <p className="mt-4 text-sm text-slate-600">Loading frames…</p>}
      {status === 'error' && <p className="mt-4 text-sm text-red-600">Could not load the frames.</p>}

      {detecting && (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${(progress.done / (progress.total || 1)) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Detecting in frame {progress.done} of {progress.total}
          </p>
        </div>
      )}

      {hasFrames && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div>
            <p className="font-medium text-slate-900">{selectedVideo?.name}</p>
            <p className="text-sm text-slate-600">
              {frames.length} frames · {totalObjects} sign{totalObjects !== 1 && 's'} found
            </p>
            {totalObjects > 0 && (
              <p className="text-sm text-slate-600">
                {Object.entries(counts)
                  .map(([label, n]) => `${label}: ${n}`)
                  .join(' · ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={inspectAll}
              disabled={busy}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {detecting ? 'Detecting…' : 'Run on all frames'}
            </button>
            <button
              onClick={() => setViewerOpen(true)}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              View frames
            </button>
          </div>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold text-slate-900">Pick a video</h2>

      {videosStatus === 'loading' && <p className="mt-2 text-sm text-slate-500">Loading videos…</p>}
      {videosStatus === 'error' && <p className="mt-2 text-sm text-red-600">Could not load the videos.</p>}
      {videosStatus === 'done' && videos.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">No videos yet. Upload one on the AI Inspection tab first.</p>
      )}

      {videos.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {videos.map((v) => (
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
                  <p className="text-xs text-slate-500">Uploaded {formatDate(v.created_at)}</p>
                </div>
                <p className="text-sm text-slate-600">{v.frame_count} frames</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewerOpen && hasFrames && (
        <FrameViewer
          frames={frames}
          fileName={selectedVideo?.name}
          onClose={() => setViewerOpen(false)}
          onInspect={inspectFrame}
          onBoxesChange={updateFrameBoxes}
          inspectingIndex={inspectingIndex}
          inspectDisabled={detecting}
          classOptions={SIGN_CATEGORIES}
        />
      )}
    </div>
  )
}

export default SignTest