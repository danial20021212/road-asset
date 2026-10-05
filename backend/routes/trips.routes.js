import { Router } from 'express'
import { listTrips, listFrames } from '../controllers/trips.controller.js'

const router = Router()

router.get('/', listTrips) // GET /api/trips
router.get('/:id/frames', listFrames) // GET /api/trips/12/frames

export default router