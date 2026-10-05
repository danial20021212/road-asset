import multer from 'multer'
import os from 'os'

// Videos are written to the OS temp folder; the controller deletes them after use.
export const uploadVideo = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
})