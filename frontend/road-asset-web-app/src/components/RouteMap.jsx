import React, { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

// Zooms the map to fit the whole route whenever the points change
const FitRoute = ({ positions }) => {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions, { padding: [30, 30] })
  }, [positions, map])
  return null
}

const RouteMap = ({ points, height = 420 }) => {
  const positions = useMemo(() => points.map((p) => [p.lat, p.lng]), [points])
  if (positions.length === 0) return null

  const start = positions[0]
  const end = positions[positions.length - 1]

  return (
    <div className="isolate overflow-hidden rounded-lg border border-slate-200" style={{ height }}>
      <MapContainer center={start} zoom={16} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        <Polyline positions={positions} pathOptions={{ color: '#2563eb', weight: 5 }} />
        <CircleMarker center={start} radius={8} pathOptions={{ color: '#fff', fillColor: '#16a34a', fillOpacity: 1, weight: 2 }}>
          <Tooltip>Start</Tooltip>
        </CircleMarker>
        <CircleMarker center={end} radius={8} pathOptions={{ color: '#fff', fillColor: '#dc2626', fillOpacity: 1, weight: 2 }}>
          <Tooltip>End</Tooltip>
        </CircleMarker>
        <FitRoute positions={positions} />
      </MapContainer>
    </div>
  )
}

export default RouteMap