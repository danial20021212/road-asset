import { API_BASE } from './inspection'

export const fetchTrips = async () => {
  const res = await fetch(`${API_BASE}/api/trips`)
  if (!res.ok) throw new Error(`Could not load trips (status ${res.status})`)
  const { trips } = await res.json()
  return trips // [{ id, name, positions: [[lat, lng], ...] }]
}

export const fetchFrames = async (tripId) => {
  const res = await fetch(`${API_BASE}/api/trips/${tripId}/frames`)
  if (!res.ok) throw new Error(`Could not load frames (status ${res.status})`)
  const { frames } = await res.json()
  return frames // [{ seq, url, lat, lng }]
}