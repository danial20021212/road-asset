import { Router } from 'express'
import { uploadVideo } from '../middleware/upload.js'
import { getGpsFromVideo } from '../controllers/gps.controller.js'

const router = Router()

// POST /api/gps  (multipart/form-data, field name: "video")
router.post('/', uploadVideo.single('video'), getGpsFromVideo)

export default router