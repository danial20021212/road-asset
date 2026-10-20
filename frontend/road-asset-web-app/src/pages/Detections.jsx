import React, { useEffect, useMemo, useRef, useState } from 'react'
import BoxEditor from '../components/BoxEditor'
import { CLASS_OPTIONS, clamp, styleFor } from '../utils/inspection'
import { fetchVideos } from '../utils/trips'
import { useTripFrames } from '../hooks/useTripFrames'
import { groupDetections } from '../utils/groupDetections'

const boxStyle = ([ymin, xmin, ymax, xmax]) => ({
  top: `${ymin / 10}%`,
  left: `${xmin / 10}%`,
  width: `${(xmax - xmin) / 10}%`,
  height: `${(ymax - ymin) / 10}%`,
})
const areaOf = (b) => (b.box_2d[2] - b.box_2d[0]) * (b.box_2d[3] - b.box_2d[1])

const selectCls = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700'

// A frame image with ONE box outlined on it (used for list rows and the sightings strip)
const Thumb = ({ sighting, className = '' }) => (
  <div className={`relative aspect-video overflow-hidden rounded bg-slate-600 ${className}`}>
    <img src={sighting.frame.dataUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
    <div
      className={`absolute border-2 ${styleFor(sighting.box.label).border}`}
      style={boxStyle(sighting.box.box_2d)}
    />
  </div>
)

const rangeText = (obj) =>
  obj.first === obj.last ? obj.first.label : `${obj.first.label} – ${obj.last.label}`

// "Select to delete": click boxes to mark them red (click again to unmark). The Delete button removes all marked boxes.
const PickLayer = ({ boxes, marked, onToggle }) => {
  const ref = useRef(null)
  const [hoverId, setHoverId] = useState(null)

  const point = (e) => {
    const r = ref.current.getBoundingClientRect()
    return {
      x: clamp(((e.clientX - r.left) / r.width) * 1000),
      y: clamp(((e.clientY - r.top) / r.height) * 1000),
    }
  }
  const boxAt = (p) =>
    boxes
      .filter(({ box_2d: [y0, x0, y1, x1] }) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)
      .sort((a, b) => areaOf(a) - areaOf(b))[0] // smallest box wins when boxes overlap

  return (
    <div
      ref={ref}
      onPointerDown={(e) => {
        e.preventDefault()
        const b = boxAt(point(e))
        if (b) onToggle(b.id)
      }}
      onPointerMove={(e) => setHoverId(boxAt(point(e))?.id ?? null)}
      onPointerLeave={() => setHoverId(null)}
      className="absolute inset-0 z-10 cursor-pointer touch-none"
    >
      {boxes.map((b) => {
        const on = marked.has(b.id)
        if (!on && b.id !== hoverId) return null
        return (
          <div
            key={b.id}
            className={`pointer-events-none absolute border-2 ${
              on ? 'border-red-500 bg-red-500/40' : 'border-white bg-white/10'
            }`}
            style={boxStyle(b.box_2d)}
          >
            {on && (
              <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                ✓
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

const Detections = () => {
  const [videos, setVideos] = useState([])
  const [videosStatus, setVideosStatus] = useState('loading')
  const [videoId, setVideoId] = useState(null)
  const [grouping, setGrouping] = useState(true) // false = every detection is its own row
  const [maxGap, setMaxGap] = useState(2) // seconds between sightings that can still be one object
  const [openLabels, setOpenLabels] = useState(() => new Set())
  const [selectedBoxId, setSelectedBoxId] = useState(null) // the box being viewed / edited
  const [drawMode, setDrawMode] = useState(false)
  const [pickMode, setPickMode] = useState(false) // "select boxes to delete" mode
  const [marked, setMarked] = useState(() => new Set()) // box ids marked for deletion
  const [newLabel, setNewLabel] = useState(CLASS_OPTIONS[0])
  const [history, setHistory] = useState([]) // undo stack: { entries: [{ frameIdx, before }], desc, focusId }
  const [toast, setToast] = useState(null) // { text, undoable }
  const toastTimer = useRef(null)
  const gestureRef = useRef({ recorded: false }) // one undo step per mouse gesture (a drag fires many changes)
  const beforeDrawRef = useRef(null) // selection to go back to if a drawn box is cancelled

  const { frames, status: framesStatus, saveStatus, updateFrameBoxes } = useTripFrames(videoId)

  // Load the video list; start on the newest video that has detections
  useEffect(() => {
    fetchVideos()
      .then((list) => {
        setVideos(list)
        setVideosStatus('done')
        const first = list.find((v) => v.object_count > 0) || list[0]
        if (first) setVideoId(first.id)
      })
      .catch(() => setVideosStatus('error'))
  }, [])

  // New video -> clear selection, modes and undo history
  useEffect(() => {
    setSelectedBoxId(null)
    setOpenLabels(new Set())
    setDrawMode(false)
    setPickMode(false)
    setMarked(new Set())
    setHistory([])
    setToast(null)
  }, [videoId])

  // A new mouse press starts a new undo step
  useEffect(() => {
    const reset = () => {
      gestureRef.current.recorded = false
    }
    window.addEventListener('pointerdown', reset, true)
    return () => window.removeEventListener('pointerdown', reset, true)
  }, [])

  useEffect(() => {
    if (drawMode) beforeDrawRef.current = selectedBoxId
  }, [drawMode]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(
    () => groupDetections(frames, grouping ? maxGap : 0),
    [frames, maxGap, grouping]
  )

  const labels = useMemo(
    () => [...CLASS_OPTIONS, ...Object.keys(groups).filter((l) => !CLASS_OPTIONS.includes(l))],
    [groups]
  )

  // Find the object + sighting for the selected box (survives re-grouping and edits)
  const selected = useMemo(() => {
    for (const label of labels) {
      for (const obj of groups[label] || []) {
        const sIdx = obj.sightings.findIndex((s) => s.box.id === selectedBoxId)
        if (sIdx !== -1) return { obj, sIdx }
      }
    }
    return null
  }, [groups, labels, selectedBoxId])

  // Nothing (valid) selected -> select the first object of the first non-empty class
  useEffect(() => {
    if (selected) return
    const label = labels.find((l) => groups[l]?.length > 0)
    if (!label) return
    const obj = groups[label][0]
    setSelectedBoxId(obj.sightings[obj.bestIdx].box.id)
    setOpenLabels((prev) => new Set(prev).add(label))
  }, [groups, labels, selected])

  // Make sure the selected object's class dropdown is open (also after a relabel)
  const selectedLabel = selected?.obj.label
  useEffect(() => {
    if (selectedLabel) setOpenLabels((prev) => (prev.has(selectedLabel) ? prev : new Set(prev).add(selectedLabel)))
  }, [selectedBoxId, selectedLabel])

  // Objects in the order they are shown on screen (open classes only)
  const visibleObjs = useMemo(
    () => labels.filter((l) => openLabels.has(l)).flatMap((l) => groups[l] || []),
    [labels, groups, openLabels]
  )

  const sighting = selected ? selected.obj.sightings[selected.sIdx] : null
  const total = labels.reduce((n, l) => n + (groups[l]?.length || 0), 0)

  // marks only count for the frame on screen
  const frameBoxes = sighting ? sighting.frame.boxes : []
  const markedIds = frameBoxes.filter((b) => marked.has(b.id)).map((b) => b.id)
  useEffect(() => {
    setMarked(new Set())
  }, [sighting?.frameIdx])

  const toggleLabel = (label) =>
    setOpenLabels((prev) => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  const selectSighting = (obj, sIdx) => setSelectedBoxId(obj.sightings[sIdx].box.id)
  const toggleDraw = () => {
    setDrawMode((v) => !v)
    setPickMode(false)
  }
  const togglePick = () => {
    setPickMode((v) => !v)
    setDrawMode(false)
    setMarked(new Set())
  }
  const toggleMarked = (id) =>
    setMarked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  // ---------- deleting (with undo) ----------

  // Where the view should go after the selected box is deleted
  const pickNextSelection = (ids) => {
    if (!selected || !ids.has(selectedBoxId)) return selectedBoxId
    const { obj } = selected
    const left = obj.sightings.filter((s) => !ids.has(s.box.id))
    if (left.length > 0) {
      // same object, closest other sighting in time
      return left.reduce((a, b) =>
        Math.abs(b.frameIdx - sighting.frameIdx) < Math.abs(a.frameIdx - sighting.frameIdx) ? b : a
      ).box.id
    }
    const survivors = (o) => o.sightings.filter((s) => !ids.has(s.box.id))
    const pos = visibleObjs.findIndex((o) => o.id === obj.id)
    const target =
      visibleObjs.slice(pos + 1).find((o) => survivors(o).length > 0) ||
      visibleObjs.slice(0, Math.max(pos, 0)).reverse().find((o) => survivors(o).length > 0)
    if (!target) return null
    return survivors(target).reduce((a, b) => (b.area > a.area ? b : a)).box.id
  }

  const pushHistory = (entries, desc, focusId = null) =>
    setHistory((h) => [...h.slice(-49), { entries, desc, focusId }])

  const flashToast = (text, undoable, ms) => {
    setToast({ text, undoable })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), ms)
  }

  // Edits coming from BoxEditor (move / resize / draw). Dragging fires many changes,
  // so only the FIRST change of each mouse gesture is recorded for undo.
  const editBoxes = (frameIdx, next) => {
    if (!gestureRef.current.recorded) {
      const before = frames[frameIdx].boxes
      pushHistory(
        [{ frameIdx, before }],
        next.length > before.length ? 'drawing a box' : 'moving or resizing a box'
      )
      gestureRef.current.recorded = true
    }
    updateFrameBoxes(frameIdx, next)
  }

  // Deletes boxes by id (can span several frames). Saved immediately by the hook; undoable.
  const removeBoxes = (idList) => {
    const ids = new Set(idList)
    const entries = []
    frames.forEach((f, frameIdx) => {
      if (f.boxes.some((b) => ids.has(b.id))) entries.push({ frameIdx, before: f.boxes })
    })
    if (entries.length === 0) return

    const next = pickNextSelection(ids)
    const count = entries.reduce((n, { before }) => n + before.filter((b) => ids.has(b.id)).length, 0)
    entries.forEach(({ frameIdx, before }) =>
      updateFrameBoxes(frameIdx, before.filter((b) => !ids.has(b.id)))
    )
    setSelectedBoxId(next)
    setMarked(new Set())

    const what = `${count} ${count === 1 ? 'box' : 'boxes'}`
    pushHistory(entries, `deleting ${what}`, entries[0].before.find((b) => ids.has(b.id)).id)
    flashToast(`Deleted ${what}`, true, 7000)
  }

  // Ctrl+Z: undoes the last edit (delete, move/resize, new box, class change), newest first
  const undo = () => {
    const last = history[history.length - 1]
    if (!last) {
      flashToast('Nothing to undo', false, 1500)
      return
    }
    last.entries.forEach(({ frameIdx, before }) => updateFrameBoxes(frameIdx, before))
    setHistory((h) => h.slice(0, -1))
    const { before } = last.entries[0]
    setSelectedBoxId(last.focusId ?? before.find((b) => b.id === selectedBoxId)?.id ?? before[0]?.id ?? null)
    setMarked(new Set())
    flashToast(`Undid ${last.desc}`, false, 2500)
  }

  const changeSelectedLabel = (label) => {
    const before = sighting.frame.boxes
    pushHistory([{ frameIdx: sighting.frameIdx, before }], 'changing a class')
    updateFrameBoxes(
      sighting.frameIdx,
      before.map((b) => (b.id === selectedBoxId ? { ...b, label } : b))
    )
  }

  // ---------- keyboard ----------
  // The handler is rebuilt every render; a ref lets one window listener always call the latest one.
  const onKey = (e) => {
    const tag = e.target?.tagName
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return
    const key = e.key.toLowerCase()

    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault()
      undo()
      return
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return

    if (key === 'arrowdown' || key === 'arrowup') {
      if (visibleObjs.length === 0) return
      e.preventDefault() // don't scroll the page
      const cur = selected ? visibleObjs.findIndex((o) => o.id === selected.obj.id) : -1
      const next =
        cur === -1 ? 0 : Math.max(0, Math.min(visibleObjs.length - 1, cur + (key === 'arrowdown' ? 1 : -1)))
      const obj = visibleObjs[next]
      setSelectedBoxId(obj.sightings[obj.bestIdx].box.id)
    } else if (key === 'w') {
      e.preventDefault()
      toggleDraw()
    } else if (key === 'x') {
      e.preventDefault()
      togglePick()
    } else if (key === 'delete' || key === 'backspace' || (pickMode && key === 'enter')) {
      if (pickMode) {
        if (markedIds.length > 0) {
          e.preventDefault()
          removeBoxes(markedIds)
        }
      } else if (sighting) {
        e.preventDefault()
        removeBoxes([selectedBoxId])
      }
    } else if (key === 'escape') {
      if (drawMode) setDrawMode(false)
      else if (pickMode) togglePick()
    }
  }
  
  const onKeyRef = useRef(onKey)
  onKeyRef.current = onKey
  useEffect(() => {
    const h = (e) => onKeyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // Keep the selected row visible when moving with the keyboard
  const selectedRowRef = useRef(null)
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected?.obj.id, openLabels])

  const selectedLabelOptions =
    sighting && !CLASS_OPTIONS.includes(sighting.box.label) ? [...CLASS_OPTIONS, sighting.box.label] : CLASS_OPTIONS

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-800">Detections</h1>
            {saveStatus === 'saving' && <span className="text-sm text-slate-500">Saving…</span>}
            {saveStatus === 'saved' && <span className="text-sm text-green-600">Saved ✓</span>}
            {saveStatus === 'error' && <span className="text-sm text-red-600">Save failed, try again</span>}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {grouping
              ? 'Each row is one real-world object, merged from the frames it appears in. Pick one to review its sightings.'
              : 'Each row is a single detection in a single frame.'}{' '}
            Use ↑ ↓ to change object.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5 text-sm text-slate-700">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={grouping}
              onChange={(e) => {
                setGrouping(e.target.checked)
                e.target.blur() // so the keyboard shortcuts keep working
              }}
              className="h-4 w-4 accent-amber-500"
            />
            Group same object across frames
          </label>

          <div className={`flex items-center gap-2 ${grouping ? '' : 'pointer-events-none opacity-40'}`}>
            <span>within</span>
            <div className="flex overflow-hidden rounded-lg border border-slate-300">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setMaxGap(n)}
                  disabled={!grouping}
                  className={`px-3 py-1.5 ${maxGap === n ? 'bg-amber-400 font-semibold text-black' : 'bg-white hover:bg-slate-50'}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <span>s</span>
          </div>

          <label className="flex items-center gap-2">
            Video
            <select
              value={videoId ?? ''}
              onChange={(e) => setVideoId(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5"
            >
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.object_count} detections
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {videosStatus === 'loading' && <p className="mt-4 text-sm text-slate-500">Loading videos…</p>}
      {videosStatus === 'error' && <p className="mt-4 text-sm text-red-600">Could not load videos. Is the server running?</p>}
      {videosStatus === 'done' && videos.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No videos yet. Upload one on the AI Inspection page.</p>
      )}
      {framesStatus === 'loading' && <p className="mt-4 text-sm text-slate-500">Loading detections…</p>}
      {framesStatus === 'error' && <p className="mt-4 text-sm text-red-600">Could not load this video's frames.</p>}
      {framesStatus === 'done' && total === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          No detections left for this video.
          {history.length > 0 && ' Press Ctrl+Z to undo.'}
        </p>
      )}

      {total > 0 && (
        <div className="mt-6 flex flex-wrap items-start gap-6">
          {/* LEFT: one dropdown per class */}
          <section className="flex w-[400px] max-w-full flex-none flex-col gap-2">
            {labels.map((label) => {
              const objs = groups[label] || []
              const open = openLabels.has(label) && objs.length > 0
              return (
                <div key={label}>
                  <button
                    onClick={() => objs.length > 0 && toggleLabel(label)}
                    disabled={objs.length === 0}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left text-sm font-semibold text-slate-800 enabled:hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className={`text-xs text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${styleFor(label).tag}`} />
                    <span className="flex-1">{label}</span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                      {objs.length} {objs.length === 1 ? 'object' : 'objects'}
                    </span>
                  </button>

                  {open && (
                    <div className="mt-1.5 flex max-h-[420px] flex-col gap-1.5 overflow-y-auto pl-3">
                      {objs.map((obj) => {
                        const isSel = selected?.obj.id === obj.id
                        const best = obj.sightings[obj.bestIdx]
                        const n = obj.sightings.length
                        return (
                          <div key={obj.id} ref={isSel ? selectedRowRef : null} className="group relative">
                            <button
                              onClick={() => selectSighting(obj, obj.bestIdx)}
                              className={`flex w-full items-center gap-3 rounded-lg p-2 pr-9 text-left text-xs text-slate-600 ${
                                isSel ? 'border-2 border-amber-400 bg-amber-50' : 'border border-slate-200 bg-white hover:bg-slate-50'
                              }`}
                            >
                              <Thumb sighting={best} className="w-16 flex-none" />
                              <span>
                                <b className="text-sm text-slate-800">
                                  #{obj.number} · {rangeText(obj)}
                                </b>
                                <br />
                                {n} {n === 1 ? 'sighting' : 'sightings'}
                                {best.frame.lat != null && ` · ${best.frame.lat.toFixed(4)}, ${best.frame.lng.toFixed(4)}`}
                              </span>
                            </button>
                            <button
                              onClick={() => removeBoxes(obj.sightings.map((s) => s.box.id))}
                              title={n > 1 ? `Delete this object (all ${n} sightings)` : 'Delete this detection'}
                              aria-label="Delete this object"
                              className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded p-1.5 text-sm leading-none text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover:block"
                            >
                              ✕
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </section>

          {/* RIGHT: the frame of the selected sighting, editable */}
          <section className="min-w-[420px] flex-1 rounded-xl border border-slate-200 bg-white p-4">
            {!sighting ? (
              <p className="text-sm text-slate-500">Pick an object on the left to see its frame.</p>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-800">
                    {sighting.box.label} #{selected.obj.number}{' '}
                    <span className="font-normal text-slate-500">
                      · sighting {selected.sIdx + 1} of {selected.obj.sightings.length} · frame {sighting.frame.label}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={selected.sIdx === 0}
                      onClick={() => selectSighting(selected.obj, selected.sIdx - 1)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 enabled:hover:bg-slate-50 disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <button
                      disabled={selected.sIdx === selected.obj.sightings.length - 1}
                      onClick={() => selectSighting(selected.obj, selected.sIdx + 1)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 enabled:hover:bg-slate-50 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>

                {/* editing toolbar */}
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleDraw}
                      className={`rounded-md px-3 py-1 font-medium ${
                        drawMode ? 'bg-amber-400 text-black' : 'bg-slate-900 text-white hover:bg-slate-700'
                      }`}
                    >
                      {drawMode ? 'Drag on image to draw…' : '+ Draw box (W)'}
                    </button>
                    <select
                      value={newLabel}
                      onChange={(e) => {
                        setNewLabel(e.target.value)
                        e.target.blur()
                      }}
                      className={selectCls}
                      aria-label="Class for new boxes"
                    >
                      {CLASS_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={togglePick}
                    className={`rounded-md border px-3 py-1 font-medium ${
                      pickMode
                        ? 'border-red-500 bg-red-500 text-white'
                        : 'border-red-300 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {pickMode ? 'Selecting… (Esc to stop)' : '☑ Select to delete (X)'}
                  </button>

                  <div className="flex items-center gap-2 text-slate-600">
                    <span>Selected:</span>
                    <select
                      value={sighting.box.label}
                      onChange={(e) => {
                        changeSelectedLabel(e.target.value)
                        e.target.blur()
                      }}
                      className={selectCls}
                      aria-label="Class of selected box"
                    >
                      {selectedLabelOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeBoxes([selectedBoxId])}
                      className="rounded-md border border-red-300 px-3 py-1 text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>

                </div>
                {pickMode && (
                  <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <span>Click the boxes you want to delete.</span>
                    <button
                      onClick={() => removeBoxes(markedIds)}
                      disabled={markedIds.length === 0}
                      className="rounded-md bg-red-600 px-3 py-1 font-medium text-white enabled:hover:bg-red-500 disabled:opacity-40"
                    >
                      {markedIds.length > 0 ? `Delete ${markedIds.length} selected` : 'Delete selected'}
                    </button>
                    <button
                      onClick={() => setMarked(new Set(frameBoxes.map((b) => b.id)))}
                      className="hover:underline"
                    >
                      Select all ({frameBoxes.length})
                    </button>
                    <button
                      onClick={() => setMarked(new Set())}
                      disabled={markedIds.length === 0}
                      className="hover:underline disabled:opacity-40"
                    >
                      Deselect all
                    </button>
                  </div>
                )}

                {/* image + editable boxes */}
                <div className="rounded-lg bg-neutral-900 p-2">
                  <div className="relative aspect-video select-none">
                    <img
                      src={sighting.frame.dataUrl}
                      alt={`Frame ${sighting.frame.label}`}
                      draggable={false}
                      className="block h-full w-full"
                    />
                    <BoxEditor
                      boxes={sighting.frame.boxes}
                      onChange={(next) => editBoxes(sighting.frameIdx, next)}
                      selectedId={selectedBoxId}
                      onSelect={(id) => id && setSelectedBoxId(id)} // clicking empty space keeps the current selection
                      drawMode={drawMode}
                      newLabel={newLabel}
                      onDrawEnd={(id) => {
                        setDrawMode(false)
                        if (id == null && gestureRef.current.recorded) setHistory((h) => h.slice(0, -1)) // discarded drawing
                        setSelectedBoxId(id ?? beforeDrawRef.current)
                      }}
                    />
                    {pickMode && <PickLayer boxes={sighting.frame.boxes} marked={marked} onToggle={toggleMarked} />}
                  </div>
                </div>

                {/* every sighting of this object */}
                <div className="mt-3 flex flex-wrap gap-2.5">
                  {selected.obj.sightings.map((s, k) => (
                    <button key={s.box.id} onClick={() => selectSighting(selected.obj, k)} className="w-28 text-left">
                      <Thumb
                        sighting={s}
                        className={k === selected.sIdx ? 'ring-[3px] ring-amber-400' : 'ring-1 ring-slate-300'}
                      />
                      <div className="mt-1 text-xs text-slate-700">
                        {s.frame.label}
                        {k === selected.obj.bestIdx && ' · best view'}
                      </div>
                    </button>
                  ))}
                </div>

                <p className="mt-3 text-xs text-slate-500">
                  {sighting.frame.lat != null && `GPS ${sighting.frame.lat.toFixed(4)}, ${sighting.frame.lng.toFixed(4)} · `}
                  {sighting.frame.boxes.length} {sighting.frame.boxes.length === 1 ? 'box' : 'boxes'} in this frame · ↑ ↓ object ·
                  W draw · X select several to delete · Delete remove box · Ctrl+Z undo · edits save automatically
                </p>
              </>
            )}
          </section>
        </div>
      )}

      {/* toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-lg bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          <span>{toast.text}</span>
          {toast.undoable && (
            <button onClick={undo} className="font-semibold text-amber-300 hover:text-amber-200">
              Undo (Ctrl+Z)
            </button>
          )}
          <button onClick={() => setToast(null)} aria-label="Dismiss" className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

export default Detections