import { Router } from 'express'
import { uploadVideo } from '../middleware/upload.js'
import { processVideo } from '../controllers/video.controller.js'

const router = Router()

// POST /api/video/process  (multipart/form-data, field "video")
router.post('/process', uploadVideo.single('video'), processVideo)

export default router