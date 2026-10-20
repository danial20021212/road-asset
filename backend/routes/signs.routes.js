import { Router } from 'express'
import { detectSignsBatch } from '../controllers/signs.controller.js'

const router = Router()

router.post('/', detectSignsBatch) // POST /api/detect-signs

export default router