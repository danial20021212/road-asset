import { pool } from '../db/pool.js'

// ExifTool gives "2026:06:08 05:34:35.00Z"; Postgres needs dashes in the date part
const toTimestamp = (t) => (t ? t.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : null)

// Saves a video and its GPS points. If this exact file was saved before, nothing is added.
// A video without GPS is saved too (with no points). Returns { videoId, duplicate }.
export async function saveTrip(name, fileHash, points) {
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

    if (points.length > 0) {
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
    }

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
  const at = (i) => points[Math.min(i, points.length - 1)] ?? null

  await pool.query(
    `INSERT INTO frames (video_id, seq, image_path, lat, lng)
     SELECT $1::int, * FROM unnest($2::int[], $3::text[], $4::float8[], $5::float8[])`,
    [
      videoId,
      files.map((_, i) => i),
      files.map((f) => `${videoId}/${f}`),
      files.map((_, i) => at(i)?.lat ?? null),
      files.map((_, i) => at(i)?.lng ?? null),
    ]
  )
}

// Every trip that has GPS, as { id, name, created_at, positions: [[lat, lng], ...] }
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

// One video by id (positions is [] when the video has no GPS), or null if it doesn't exist
export async function getTrip(videoId) {
  const { rows } = await pool.query(
    `SELECT v.id, v.name, v.created_at,
            COALESCE(
              json_agg(json_build_array(p.lat, p.lng) ORDER BY p.seq) FILTER (WHERE p.id IS NOT NULL),
              '[]'::json
            ) AS positions
     FROM videos v
     LEFT JOIN gps_points p ON p.video_id = v.id
     WHERE v.id = $1
     GROUP BY v.id`,
    [videoId]
  )
  return rows[0] ?? null
}

export async function getFrames(videoId) {
  const { rows } = await pool.query(
    `SELECT f.id, f.seq, f.image_path, f.lat, f.lng, f.inspected_at, f.edited,
            COALESCE(
              (SELECT json_agg(
                        json_build_object('label', d.label, 'box_2d', json_build_array(d.box_ymin, d.box_xmin, d.box_ymax, d.box_xmax))
                        ORDER BY d.id)
               FROM detections d WHERE d.frame_id = f.id),
              '[]'::json
            ) AS boxes
     FROM frames f
     WHERE f.video_id = $1
     ORDER BY f.seq`,
    [videoId]
  )

  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    url: `/frames/${r.image_path}`,
    lat: r.lat,
    lng: r.lng,
    inspected: r.inspected_at !== null,
    edited: r.edited,
    boxes: r.boxes, // [{ label, box_2d: [ymin, xmin, ymax, xmax] }]
  }))
}

// Replaces ALL boxes of one frame with the given list (same way the viewer works)
export async function saveDetections(frameId, boxes, edited) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rowCount } = await client.query(
      'UPDATE frames SET inspected_at = now(), edited = $2 WHERE id = $1',
      [frameId, edited]
    )
    if (rowCount === 0) {
      await client.query('ROLLBACK')
      return false // no such frame
    }

    await client.query('DELETE FROM detections WHERE frame_id = $1', [frameId])

    if (boxes.length > 0) {
      await client.query(
        `INSERT INTO detections (frame_id, label, box_ymin, box_xmin, box_ymax, box_xmax)
         SELECT $1::bigint, * FROM unnest($2::text[], $3::real[], $4::real[], $5::real[], $6::real[])`,
        [
          frameId,
          boxes.map((b) => b.label),
          boxes.map((b) => b.box_2d[0]), // box_ymin
          boxes.map((b) => b.box_2d[1]), // box_xmin
          boxes.map((b) => b.box_2d[2]), // box_ymax
          boxes.map((b) => b.box_2d[3]), // box_xmax
        ]
      )
    }

    await client.query('COMMIT')
    return true
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// One summary row per video, newest first (for the AI Inspection history list)
export async function getVideoSummaries() {
  const { rows } = await pool.query(`
    SELECT v.id, v.name, v.created_at,
      (SELECT count(*) FROM gps_points p WHERE p.video_id = v.id)::int AS gps_count,
      (SELECT count(*) FROM frames f WHERE f.video_id = v.id)::int AS frame_count,
      (SELECT count(*) FROM frames f
         WHERE f.video_id = v.id AND f.inspected_at IS NOT NULL)::int AS inspected_count,
      (SELECT count(*) FROM detections d
         JOIN frames f ON f.id = d.frame_id
         WHERE f.video_id = v.id)::int AS object_count
    FROM videos v
    ORDER BY v.created_at DESC
  `)
  return rows
}