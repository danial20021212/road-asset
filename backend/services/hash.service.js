import { createHash } from 'crypto'
import { createReadStream } from 'fs'

// SHA-256 of the file's contents, streamed so a large video doesn't fill memory
export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}