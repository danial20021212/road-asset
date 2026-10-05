import React, { useCallback, useEffect, useState } from 'react'
import BoxEditor from './BoxEditor'
import { CLASS_OPTIONS } from '../utils/inspection'

const selectCls = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700'

// The "box editing" row of the popup: draw a new box, or edit the selected one.
const BoxToolbar = ({
  drawMode,
  onToggleDraw,
  newLabel,
  onNewLabelChange,
  selectedBox,
  onChangeSelectedLabel,
  onDeleteSelected,
}) => {
  // If a box has a class that isn't in CLASS_OPTIONS, keep it selectable so the dropdown isn't blank
  const selectedLabelOptions =
    selectedBox && !CLASS_OPTIONS.includes(selectedBox.label)
      ? [...CLASS_OPTIONS, selectedBox.label]
      : CLASS_OPTIONS

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleDraw}
          className={`rounded-md px-3 py-1 text-sm font-medium ${
            drawMode ? 'bg-amber-400 text-black' : 'bg-slate-900 text-white hover:bg-slate-700'
          }`}
        >
          {drawMode ? 'Drag on image to draw…' : '+ Draw box (W)'}
        </button>
        <select
          value={newLabel}
          onChange={(e) => {
            onNewLabelChange(e.target.value)
            e.target.blur() // so the A / D shortcuts keep working
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

      <div className="flex items-center gap-2 text-sm text-slate-600">
        {selectedBox ? (
          <>
            <span>Selected box:</span>
            <select
              value={selectedBox.label}
              onChange={(e) => {
                onChangeSelectedLabel(e.target.value)
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
              onClick={onDeleteSelected}
              className="rounded-md border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </>
        ) : (
          <span className="text-slate-500">Click a box to move, resize, relabel or delete it.</span>
        )}
      </div>
    </div>
  )
}

// Popup viewer: one frame at a time, with box editing.
// Keys: A/D or arrows = prev/next, W = draw box, Delete = remove box, Esc = close.
const FrameViewer = ({
  frames,
  startIndex = 0,
  onClose,
  fileName,
  onInspect,
  onBoxesChange,
  inspectingIndex,
  inspectDisabled,
}) => {
  const [index, setIndex] = useState(startIndex)
  const [selectedId, setSelectedId] = useState(null)
  const [drawMode, setDrawMode] = useState(false)
  const [newLabel, setNewLabel] = useState(CLASS_OPTIONS[0])

  const total = frames.length
  const frame = frames[index]
  const boxes = frame?.boxes ?? []
  const selectedBox = boxes.find((b) => b.id === selectedId)

  const goNext = useCallback(() => setIndex((i) => Math.min(i + 1, total - 1)), [total])
  const goPrev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), [])

  // Selection and draw mode belong to one frame; reset when moving to another
  useEffect(() => {
    setSelectedId(null)
    setDrawMode(false)
  }, [index])

  // Lock page scroll while the popup is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const key = e.key.toLowerCase()
      if (key === 'd' || key === 'arrowright') {
        e.preventDefault()
        goNext()
      } else if (key === 'a' || key === 'arrowleft') {
        e.preventDefault()
        goPrev()
      } else if (key === 'w') {
        e.preventDefault()
        setDrawMode((v) => !v)
      } else if ((key === 'delete' || key === 'backspace') && selectedId) {
        e.preventDefault()
        onBoxesChange(index, boxes.filter((b) => b.id !== selectedId))
        setSelectedId(null)
      } else if (key === 'escape') {
        if (drawMode) setDrawMode(false)
        else if (selectedId) setSelectedId(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, onClose, onBoxesChange, index, boxes, selectedId, drawMode])

  if (!frame) return null

  const updateBoxes = (next) => onBoxesChange(index, next)
  const changeSelectedLabel = (label) =>
    updateBoxes(boxes.map((b) => (b.id === selectedId ? { ...b, label } : b)))
  const deleteSelected = () => {
    updateBoxes(boxes.filter((b) => b.id !== selectedId))
    setSelectedId(null)
  }

  const reviewed = frame.detected || frame.edited
  const statusText =
    frame.detectError && !frame.edited
      ? 'Detection failed for this frame'
      : reviewed
        ? `${boxes.length} object${boxes.length !== 1 ? 's' : ''}${frame.edited ? ' · edited' : ''}`
        : 'Not inspected'

  const btn =
    'rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-full w-full max-w-5xl flex-col rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            Inspection frames
            {fileName && <span className="ml-2 text-sm font-normal text-slate-500">{fileName}</span>}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 text-2xl leading-none text-slate-500 hover:text-slate-900"
          >
            ×
          </button>
        </div>

        {/* Toolbar row 1: navigation + frame inspection */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700">
              {index + 1} / {total}
            </span>
            <button className={btn} onClick={goPrev} disabled={index === 0}>
              ‹ Prev
            </button>
            <button className={btn} onClick={goNext} disabled={index === total - 1}>
              Next ›
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">
              {statusText} · {frame.label}
            </span>
            <button
              onClick={() => onInspect(index)}
              disabled={inspectDisabled || inspectingIndex !== null}
              className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {inspectingIndex === index ? 'Inspecting…' : frame.detected ? 'Inspect again' : 'Inspect this frame'}
            </button>
          </div>
        </div>

        {/* Toolbar row 2: box editing */}
        <BoxToolbar
          drawMode={drawMode}
          onToggleDraw={() => setDrawMode((v) => !v)}
          newLabel={newLabel}
          onNewLabelChange={setNewLabel}
          selectedBox={selectedBox}
          onChangeSelectedLabel={changeSelectedLabel}
          onDeleteSelected={deleteSelected}
        />

        {/* Image + editable boxes */}
        <div className="relative mt-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-neutral-900 p-2">
          <div className="relative inline-block max-h-full max-w-full select-none">
            <img
              src={frame.dataUrl}
              alt={`Frame: ${frame.label}`}
              draggable={false}
              className="block max-h-[60vh] max-w-full object-contain"
            />
            <BoxEditor
              boxes={boxes}
              onChange={updateBoxes}
              selectedId={selectedId}
              onSelect={setSelectedId}
              drawMode={drawMode}
              newLabel={newLabel}
              onDrawEnd={(id) => {
                setDrawMode(false)
                setSelectedId(id)
              }}
            />
          </div>
        </div>

        {/* Position slider */}
        <input
          type="range"
          min={0}
          max={Math.max(total - 1, 0)}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          className="mt-3 w-full accent-blue-600"
          aria-label="Frame position"
        />

        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
          <span>A / ← prev · D / → next · W draw box · Delete remove box · Esc close</span>
          <a
            href={frame.dataUrl}
            download={`frame_${String(index + 1).padStart(6, '0')}.jpg`}
            className="text-blue-600 hover:underline"
          >
            Download this frame
          </a>
        </div>
      </div>
    </div>
  )
}

export default FrameViewer