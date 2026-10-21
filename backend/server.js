import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initDb } from './db/pool.js'
import { PREVIEW_DIR } from './services/transcode.service.js'
import { FRAMES_DIR } from './services/frames.service.js'
import gpsRoutes from './routes/gps.routes.js'
import videoRoutes from './routes/video.routes.js'
import tripsRoutes from './routes/trips.routes.js'
import framesRoutes from './routes/frames.routes.js'
import detectRoutes from './routes/detect.routes.js'

const app = express()

app.use(cors()) // allows your Vite dev server to call this
app.use(express.json({ limit: '75mb' })) // batches of frames sent as base64 can be large

app.use('/previews', express.static(PREVIEW_DIR))
app.use('/frames', express.static(FRAMES_DIR))

app.use('/api/gps', gpsRoutes)
app.use('/api/video', videoRoutes)
app.use('/api/trips', tripsRoutes)
app.use('/api/frames', framesRoutes)
app.use('/api/detect', detectRoutes)

initDb().catch((err) => console.error('Database not ready:', err.message))

const PORT = process.env.PORT || 3001
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://localhost:${PORT}`))