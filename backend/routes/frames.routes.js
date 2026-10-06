import { Router } from 'express'
import { putDetections } from '../controllers/trips.controller.js'

const router = Router()

router.put('/:id/detections', putDetections) // PUT /api/frames/123/detections

export default router