import { RealtimeVision } from '@overshoot/sdk'

console.log('Overshoot SDK loaded')

document.querySelector('#app').innerHTML = `
  <div style="padding:16px; font-family: system-ui;">
    <h3>Overshoot Video Test</h3>

    <input id="file" type="file" accept="video/*" />
    <br /><br />

    <button id="start">Start Overshoot</button>
    <button id="stop" disabled>Stop</button>
  </div>
`

const fileInput = document.getElementById('file')
const startBtn = document.getElementById('start')
const stopBtn = document.getElementById('stop')

let videoFile = null
let vision = null

fileInput.addEventListener('change', () => {
  videoFile = fileInput.files[0]
  console.log('Video selected:', videoFile?.name)
})

startBtn.addEventListener('click', async () => {
  if (!videoFile) {
    console.warn('No video selected')
    return
  }

  vision = new RealtimeVision({
    apiUrl: import.meta.env.VITE_OVERSHOOT_API_URL,
    apiKey: import.meta.env.VITE_OVERSHOOT_API_KEY,

    prompt: `
You are analyzing a screen recording of a computer display.

Your task:
Detect ONLY error messages, warnings, or failures visible anywhere on the screen.

An error includes:
- Stack traces
- Console errors
- Runtime exceptions
- Red error text
- Messages containing words like:
  error, exception, failed, traceback, warning, undefined, null, rejected, cannot, invalid

If an error message is visible:
- Extract the error text EXACTLY as shown on the screen.
- Preserve line breaks.
- Do NOT add explanations or commentary.

If NO error or warning is visible:
Return exactly this string:
NO_ERROR

`,

    source: {
      type: 'video',
      file: videoFile,
    },

    onResult: (result) => {
      console.log('Overshoot output:', result.result)
    },
  })

  console.log('Starting Overshoot…')
  await vision.start()

  startBtn.disabled = true
  stopBtn.disabled = false
})

stopBtn.addEventListener('click', async () => {
  if (!vision) return

  await vision.stop()
  console.log('Overshoot stopped')

  vision = null
  startBtn.disabled = false
  stopBtn.disabled = true
})
