import { SIGN_PROMPT } from '../prompts/signs.js'

const API_KEY = process.env.ROBOFLOW_SIGNS_API_KEY || process.env.ROBOFLOW_API_KEY
const WORKFLOW_URL = 'https://serverless.roboflow.com/danial-lja5y/workflows/gemini-4-argon-open-prompt'

// Sends ONE image to the open-prompt workflow and returns its raw output
export async function detectSigns(image) {
  const res = await fetch(WORKFLOW_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      inputs: {
        image: {
          type: 'base64',
          value: image.startsWith('data:') ? image.slice(image.indexOf(',') + 1) : image,
        },
        prompt: SIGN_PROMPT,
      },
    }),
  })

  if (!res.ok) throw new Error(`Roboflow error ${res.status}: ${await res.text()}`)

  const result = await res.json()
  return result.outputs?.[0] ?? result
}