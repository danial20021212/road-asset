import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  Tooltip,
  useMap,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

import FrameViewer from '../components/FrameViewer'
import { API_BASE, detectFrames, formatTime } from '../utils/inspection'
import { roads } from '../data/roads'
import { fetchTrips, fetchFrames } from '../utils/trips'
import { isRoadCovered } from '../utils/coverage'

const TRAVELED = { color: '#2563eb', weight: 5 }
const SELECTED = { color: '#f97316', weight: 6 }
const UNCHARTED = {
  color: '#ef4444',
  weight: 4,
  dashArray: '6 8',
  opacity: 0.85,
}

const dot = (fill) => ({
  color: '#fff',
  fillColor: fill,
  fillOpacity: 1,
  weight: 2,
})

// Turns a saved frame into the same shape the AI Inspection tab uses
const toViewerFrame = (f) => ({
  dataUrl: `${API_BASE}${f.url}`,
  label: formatTime(f.seq),
  width: 1280,
  height: 720,
  boxes: [],
  detected: false,
  edited: false,
  lat: f.lat,
  lng: f.lng,
})

const FitAll = ({ positions }) => {
  const map = useMap()

  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [40, 40] })
    }
  }, [positions, map])

  return null
}

const Map = () => {
  const [trips, setTrips] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [frames, setFrames] = useState([])
  const [framesStatus, setFramesStatus] = useState('idle')
  const [viewerOpen, setViewerOpen] = useState(false)
  const [inspectingIndex, setInspectingIndex] = useState(null)

  useEffect(() => {
    let cancelled = false

    fetchTrips()
      .then((data) => {
        if (cancelled) return

        setTrips(data)
        setStatus('done')
      })
      .catch((err) => {
        if (cancelled) return

        setError(err.message)
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Load the frames of the clicked trip
  useEffect(() => {
    if (selectedId === null) return

    let cancelled = false

    setFrames([])
    setFramesStatus('loading')

    fetchFrames(selectedId)
      .then((data) => {
        if (cancelled) return

        setFrames(data.map(toViewerFrame))
        setFramesStatus('done')
      })
      .catch(() => {
        if (!cancelled) {
          setFramesStatus('error')
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedId])

  const handleRouteClick = (tripId) => {
    setSelectedId(tripId)
    setViewerOpen(true)
  }

  const inspectFrame = async (i) => {
    if (inspectingIndex !== null || !frames[i]) return

    if (
      frames[i].edited &&
      !window.confirm(
        'This frame has manual edits. Inspecting again will replace them. Continue?'
      )
    ) {
      return
    }

    setInspectingIndex(i)

    try {
      const [updated] = await detectFrames([frames[i]])

      setFrames((prev) =>
        prev.map((frame, index) =>
          index === i ? updated : frame
        )
      )
    } finally {
      setInspectingIndex(null)
    }
  }

  const updateFrameBoxes = useCallback((i, boxes) => {
    setFrames((prev) =>
      prev.map((frame, index) =>
        index === i
          ? {
              ...frame,
              boxes,
              edited: true,
            }
          : frame
      )
    )
  }, [])

  const uncharted = useMemo(() => {
    const tripPoints = trips.flatMap((trip) => trip.positions)

    return roads.filter(
      (road) => !isRoadCovered(road, tripPoints)
    )
  }, [trips])

  const fitPositions = useMemo(
    () => [
      ...trips.flatMap((trip) => trip.positions),
      ...roads.flatMap((road) => road.positions),
    ],
    [trips]
  )

  const selectedTrip = trips.find(
    (trip) => trip.id === selectedId
  )

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold text-slate-900">
        Map
      </h1>

      <p className="mt-1 text-slate-600">
        Blue lines are routes already driven (click one to review its frames).
        Red dashed roads have not been surveyed yet.
      </p>

      {status === 'loading' && (
        <p className="mt-4 text-sm text-slate-500">
          Loading trips…
        </p>
      )}

      {status === 'error' && (
        <p className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}

      {status === 'done' && (
        <p className="mt-4 text-sm text-slate-600">
          {trips.length} trip
          {trips.length !== 1 && 's'} ·{' '}
          {uncharted.length} uncharted road
          {uncharted.length !== 1 && 's'}
        </p>
      )}

      {framesStatus === 'loading' && (
        <p className="mt-2 text-sm text-slate-500">
          Loading frames…
        </p>
      )}

      {framesStatus === 'error' && (
        <p className="mt-2 text-sm text-red-600">
          Could not load frames for this trip.
        </p>
      )}

      {framesStatus === 'done' && frames.length === 0 && (
        <p className="mt-2 text-sm text-slate-500">
          No frames saved for this trip.
        </p>
      )}

      <div className="isolate mt-3 h-[560px] overflow-hidden rounded-xl border border-slate-200">
        <MapContainer
          center={[1.5535, 110.3593]}
          zoom={13}
          className="h-full w-full"
        >
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />

          <FitAll positions={fitPositions} />

          {trips.map((trip) => {
            const start = trip.positions[0]
            const end =
              trip.positions[trip.positions.length - 1]

            return (
              <Fragment key={trip.id}>
                <Polyline
                  positions={trip.positions}
                  pathOptions={
                    trip.id === selectedId
                      ? SELECTED
                      : TRAVELED
                  }
                  interactive={false}
                />

                <Polyline
                  positions={trip.positions}
                  pathOptions={{
                    weight: 24,
                    opacity: 0,
                  }}
                  eventHandlers={{
                    click: () => handleRouteClick(trip.id),
                  }}
                >
                  <Tooltip sticky>
                    {trip.name}
                  </Tooltip>
                </Polyline>

                <CircleMarker
                  center={start}
                  radius={7}
                  pathOptions={dot('#16a34a')}
                  interactive={false}
                />

                <CircleMarker
                  center={end}
                  radius={7}
                  pathOptions={dot('#dc2626')}
                  interactive={false}
                />
              </Fragment>
            )
          })}

          {uncharted.map((road) => (
            <Fragment key={road.id}>
              <Polyline
                positions={road.positions}
                pathOptions={UNCHARTED}
                interactive={false}
              />

              <Polyline
                positions={road.positions}
                pathOptions={{
                  weight: 24,
                  opacity: 0,
                }}
              >
                <Popup>
                  <p className="font-semibold">
                    {road.name}
                  </p>

                  <p>Status: uncharted</p>
                </Popup>
              </Polyline>
            </Fragment>
          ))}
        </MapContainer>
      </div>

      {viewerOpen && frames.length > 0 && (
        <FrameViewer
          frames={frames}
          fileName={selectedTrip?.name}
          onClose={() => setViewerOpen(false)}
          onInspect={inspectFrame}
          onBoxesChange={updateFrameBoxes}
          inspectingIndex={inspectingIndex}
          inspectDisabled={false}
        />
      )}
    </div>
  )
}

export default Map