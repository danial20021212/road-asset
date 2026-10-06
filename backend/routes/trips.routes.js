import { Router } from 'express'
import { listTrips, listVideoSummaries, getTripById, listFrames } from '../controllers/trips.controller.js'

const router = Router()

router.get('/', listTrips) // GET /api/trips
router.get('/summary', listVideoSummaries) // GET /api/trips/summary   (must stay above /:id)
router.get('/:id', getTripById) // GET /api/trips/12
router.get('/:id/frames', listFrames) // GET /api/trips/12/frames

export default router