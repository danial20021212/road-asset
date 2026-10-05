import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'

// Saved frames live here (not the temp folder) and are served at /frames
export const FRAMES_DIR = path.resolve('storage', 'frames')
fs.mkdirSync(FRAMES_DIR, { recursive: true })

// One JPEG per second, 1280px wide. Returns the file names in order: ['0001.jpg', '0002.jpg', ...]
export async function extractFrames(inputPath, videoId) {
  const dir = path.join(FRAMES_DIR, String(videoId))
  await fs.promises.mkdir(dir, { recursive: true })

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, [
      '-y',
      '-i', inputPath,
      '-vf', 'fps=1,scale=1280:-2',
      '-q:v', '3',
      path.join(dir, '%04d.jpg'),
    ])

    let log = ''
    ffmpeg.stderr.on('data', (chunk) => {
      log = (log + chunk).slice(-2000)
    })
    ffmpeg.on('error', reject)
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(log))))
  })

  return (await fs.promises.readdir(dir)).filter((f) => f.endsWith('.jpg')).sort()
}