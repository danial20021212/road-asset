import pg from 'pg'

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS file_hash TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS videos_file_hash_idx ON videos (file_hash);

    CREATE TABLE IF NOT EXISTS gps_points (
      id BIGSERIAL PRIMARY KEY,
      video_id INT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      seq INT NOT NULL,
      recorded_at TIMESTAMPTZ,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL
    );
    CREATE INDEX IF NOT EXISTS gps_points_video_idx ON gps_points (video_id, seq);

    CREATE TABLE IF NOT EXISTS frames (
      id BIGSERIAL PRIMARY KEY,
      video_id INT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      seq INT NOT NULL,
      image_path TEXT NOT NULL,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      UNIQUE (video_id, seq)
    );
    ALTER TABLE frames ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ; -- null = nobody has looked at it yet
    ALTER TABLE frames ADD COLUMN IF NOT EXISTS edited BOOLEAN NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS detections (
      id BIGSERIAL PRIMARY KEY,
      frame_id BIGINT NOT NULL REFERENCES frames(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      box_ymin REAL NOT NULL, -- box coordinates on the 0-1000 scale the viewer uses
      box_xmin REAL NOT NULL,
      box_ymax REAL NOT NULL,
      box_xmax REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS detections_frame_idx ON detections (frame_id);
  `)
}