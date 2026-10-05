import { pool } from '../db/pool.js'

// ExifTool gives "2026:06:08 05:34:35.00Z"; Postgres needs dashes in the date part
const toTimestamp = (t) => (t ? t.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : null)

// Saves a video and its GPS points. If this exact file was saved before, nothing is added.
// Returns { videoId, duplicate }, or null when the video has no GPS.
export async function saveTrip(name, fileHash, points) {
  if (points.length === 0) return null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query(
      `INSERT INTO videos (name, file_hash) VALUES ($1, $2)
       ON CONFLICT (file_hash) DO NOTHING
       RETURNING id`,
      [name, fileHash]
    )

    if (rows.length === 0) {
      // same file already saved
      await client.query('ROLLBACK')
      const existing = await client.query('SELECT id FROM videos WHERE file_hash = $1', [fileHash])
      return { videoId: existing.rows[0].id, duplicate: true }
    }

    const videoId = rows[0].id
    await client.query(
      `INSERT INTO gps_points (video_id, seq, recorded_at, lat, lng)
       SELECT $1::int, * FROM unnest($2::int[], $3::timestamptz[], $4::float8[], $5::float8[])`,
      [
        videoId,
        points.map((_, i) => i),
        points.map((p) => toTimestamp(p.time)),
        points.map((p) => p.lat),
        points.map((p) => p.lng),
      ]
    )

    await client.query('COMMIT')
    return { videoId, duplicate: false }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// Frame i is taken i seconds into the video, so it gets GPS point i (about 1 point per second)
export async function saveFrames(videoId, files, points) {
  const at = (i) => points[Math.min(i, points.length - 1)]

  await pool.query(
    `INSERT INTO frames (video_id, seq, image_path, lat, lng)
     SELECT $1::int, * FROM unnest($2::int[], $3::text[], $4::float8[], $5::float8[])`,
    [
      videoId,
      files.map((_, i) => i),
      files.map((f) => `${videoId}/${f}`),
      files.map((_, i) => at(i).lat),
      files.map((_, i) => at(i).lng),
    ]
  )
}

// Every trip as { id, name, created_at, positions: [[lat, lng], ...] }, ready for Leaflet
export async function getTrips() {
  const { rows } = await pool.query(`
    SELECT v.id, v.name, v.created_at,
           json_agg(json_build_array(p.lat, p.lng) ORDER BY p.seq) AS positions
    FROM videos v
    JOIN gps_points p ON p.video_id = v.id
    GROUP BY v.id
    ORDER BY v.created_at DESC
  `)
  return rows
}

export async function getFrames(videoId) {
  const { rows } = await pool.query(
    'SELECT seq, image_path, lat, lng FROM frames WHERE video_id = $1 ORDER BY seq',
    [videoId]
  )
  return rows.map((r) => ({ seq: r.seq, url: `/frames/${r.image_path}`, lat: r.lat, lng: r.lng }))
}