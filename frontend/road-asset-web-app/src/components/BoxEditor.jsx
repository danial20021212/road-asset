import React, { useRef } from 'react'
import { MIN_DRAW, MIN_SIZE, clamp, styleFor, newId } from '../utils/inspection'

// Draws the boxes over an image and handles move / resize / draw.
// Boxes are { id, box_2d: [ymin, xmin, ymax, xmax] (0-1000), label }.

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const CURSOR_FOR = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
}
const handleStyle = (h) => {
  const style = { position: 'absolute', width: 7, height: 7, cursor: CURSOR_FOR[h] }
  if (h.includes('n')) style.top = -4
  else if (h.includes('s')) style.bottom = -4
  else {
    style.top = '50%'
    style.marginTop = -4
  }
  if (h.includes('w')) style.left = -4
  else if (h.includes('e')) style.right = -4
  else {
    style.left = '50%'
    style.marginLeft = -4
  }
  return style
}

const BoxEditor = ({ boxes, onChange, selectedId, onSelect, drawMode, newLabel, onDrawEnd }) => {
  const overlayRef = useRef(null)
  // Refs always hold the latest values so window-level drag listeners never go stale.
  const boxesRef = useRef(boxes)
  boxesRef.current = boxes
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const commit = (next) => {
    boxesRef.current = next
    onChangeRef.current(next)
  }

  const startDrag = (e, drag) => {
    const rect = overlayRef.current.getBoundingClientRect()
    let last = drag.orig

    const move = (ev) => {
      const dx = ((ev.clientX - drag.startX) / rect.width) * 1000
      const dy = ((ev.clientY - drag.startY) / rect.height) * 1000
      let [ymin, xmin, ymax, xmax] = drag.orig
      const w = xmax - xmin
      const h = ymax - ymin

      if (drag.type === 'move') {
        xmin = clamp(drag.orig[1] + dx)
        ymin = clamp(drag.orig[0] + dy)
        xmax = xmin + w
        ymax = ymin + h
        if (xmax > 1000) {
          xmax = 1000
          xmin = 1000 - w
        }
        if (ymax > 1000) {
          ymax = 1000
          ymin = 1000 - h
        }
      } else if (drag.type === 'resize') {
        if (drag.handle.includes('n')) ymin = clamp(drag.orig[0] + dy)
        if (drag.handle.includes('s')) ymax = clamp(drag.orig[2] + dy)
        if (drag.handle.includes('w')) xmin = clamp(drag.orig[1] + dx)
        if (drag.handle.includes('e')) xmax = clamp(drag.orig[3] + dx)
        if (xmax - xmin < MIN_SIZE) {
          if (drag.handle.includes('w')) xmin = xmax - MIN_SIZE
          else xmax = xmin + MIN_SIZE
        }
        if (ymax - ymin < MIN_SIZE) {
          if (drag.handle.includes('n')) ymin = ymax - MIN_SIZE
          else ymax = ymin + MIN_SIZE
        }
      } else if (drag.type === 'draw') {
        const cx = clamp(drag.orig[1] + dx)
        const cy = clamp(drag.orig[0] + dy)
        xmin = Math.min(drag.orig[1], cx)
        xmax = Math.max(drag.orig[1], cx)
        ymin = Math.min(drag.orig[0], cy)
        ymax = Math.max(drag.orig[0], cy)
      }

      last = [ymin, xmin, ymax, xmax]
      commit(boxesRef.current.map((b) => (b.id === drag.id ? { ...b, box_2d: last } : b)))
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      if (drag.type === 'draw') {
        const [ymin, xmin, ymax, xmax] = last
        if (xmax - xmin < MIN_DRAW || ymax - ymin < MIN_DRAW) {
          commit(boxesRef.current.filter((b) => b.id !== drag.id))
          onDrawEnd(null)
        } else {
          onDrawEnd(drag.id)
        }
      }
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const onOverlayPointerDown = (e) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    if (!drawMode) {
      onSelect(null)
      return
    }
    const rect = overlayRef.current.getBoundingClientRect()
    const x = clamp(((e.clientX - rect.left) / rect.width) * 1000)
    const y = clamp(((e.clientY - rect.top) / rect.height) * 1000)
    const id = newId()
    commit([...boxesRef.current, { id, box_2d: [y, x, y, x], label: newLabel }])
    onSelect(id)
    startDrag(e, { type: 'draw', id, startX: e.clientX, startY: e.clientY, orig: [y, x, y, x] })
  }

  const startMove = (e, box) => {
    if (drawMode) return
    e.stopPropagation()
    e.preventDefault()
    onSelect(box.id)
    startDrag(e, { type: 'move', id: box.id, startX: e.clientX, startY: e.clientY, orig: box.box_2d.slice() })
  }

  const startResize = (e, box, handle) => {
    e.stopPropagation()
    e.preventDefault()
    startDrag(e, {
      type: 'resize',
      id: box.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      orig: box.box_2d.slice(),
    })
  }

  return (
    <div
      ref={overlayRef}
      onPointerDown={onOverlayPointerDown}
      className="absolute inset-0 touch-none"
      style={{ cursor: drawMode ? 'crosshair' : 'default' }}
    >
      {boxes.map((b) => {
        const [ymin, xmin, ymax, xmax] = b.box_2d
        const selected = b.id === selectedId
        const s = styleFor(b.label)
        return (
          <div
            key={b.id}
            onPointerDown={(e) => startMove(e, b)}
            className={`absolute border-2 ${s.border} ${s.bg} ${selected ? 'ring-2 ring-white' : ''} ${
              drawMode ? 'pointer-events-none' : 'cursor-move'
            }`}
            style={{
              left: `${xmin / 10}%`,
              top: `${ymin / 10}%`,
              width: `${(xmax - xmin) / 10}%`,
              height: `${(ymax - ymin) / 10}%`,
            }}
          >
            <span
              className={`absolute left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-semibold text-black ${s.tag} ${
                ymin < 60 ? 'top-full' : '-top-6'
              }`}
            >
              {b.label}
            </span>
            {selected &&
              HANDLES.map((h) => (
                <div
                  key={h}
                  onPointerDown={(e) => startResize(e, b, h)}
                  className="rounded-sm border border-neutral-900 bg-white"
                  style={handleStyle(h)}
                />
              ))}
          </div>
        )
      })}
    </div>
  )
}

export default BoxEditor