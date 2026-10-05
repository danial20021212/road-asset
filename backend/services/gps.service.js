import { execFile } from 'child_process'

const EXIFTOOL_PATH = process.env.EXIFTOOL_PATH || 'exiftool'

export function extractGps(filePath) {
  return new Promise((resolve, reject) => {
    execFile(
      EXIFTOOL_PATH,
      [
        '-ee', // extract embedded data (the GPS track inside the MP4)
        '-n', // numeric output: signed decimal lat/lng
        '-f', // print "-" for missing tags so every line has 4 columns
        '-p',
        '$GPSDateTime,$GPSLatitude,$GPSLongitude,$GPSSpeed',
        filePath,
      ],
      { maxBuffer: 100 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return reject(err)
        resolve(parseGpsOutput(stdout))
      }
    )
  })
}

function parseGpsOutput(stdout) {
  const seen = new Set()
  const points = []

  for (const line of stdout.split('\n')) {
    const [time, lat, lng, speed] = line.trim().split(',')
    const latitude = parseFloat(lat)
    const longitude = parseFloat(lng)

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) continue
    if (latitude === 0 && longitude === 0) continue // no GPS fix

    // ExifTool can report the same sample more than once; keep the first
    const key = time && time !== '-' ? time : `${latitude},${longitude}`
    if (seen.has(key)) continue
    seen.add(key)

    const parsedSpeed = parseFloat(speed)
    points.push({
      time: time && time !== '-' ? time : null,
      lat: latitude,
      lng: longitude,
      speed: Number.isNaN(parsedSpeed) ? null : parsedSpeed,
    })
  }

  return points
}