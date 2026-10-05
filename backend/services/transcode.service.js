import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg'

// Converted copies live here and are served at /previews
export const PREVIEW_DIR = path.join(os.tmpdir(), 'roadasset-previews')
fs.mkdirSync(PREVIEW_DIR, { recursive: true })

// HEVC -> H.264 at 1080p, video only, so any browser can decode it
export function transcodeToH264(input, output) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(FFMPEG_PATH, [
      '-y',
      '-i', input,
      '-map', '0:v:0',
      '-an',
      '-vf', 'scale=1920:-2',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      output,
    ])

    let log = ''
    ffmpeg.stderr.on('data', (chunk) => {
      log = (log + chunk).slice(-2000) // keep only the tail, for error messages
    })
    ffmpeg.on('error', reject) // e.g. ffmpeg isn't installed
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(log))))
  })
}