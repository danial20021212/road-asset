import { Router } from 'express'
import { detectBatch } from '../controllers/detect.controller.js'

const router = Router()

router.post('/', detectBatch) // POST /api/detect

export default router