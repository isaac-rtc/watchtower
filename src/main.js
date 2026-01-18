import { RealtimeVision } from '@overshoot/sdk'
import './style.css'

const ERROR_LENGTH_THRESHOLD = 120 // tune this if needed

document.querySelector('#app').innerHTML = `
  <div class="app-grid">
    <!-- LEFT: Watch Tower -->
    <div class="container">
      <h3 class="title">Watch Tower</h3>

      <div class="controls">
        <input id="file" type="file" accept="video/*" />
        <button id="start">Start</button>
        <button id="stop" disabled>Stop</button>
      </div>


      <h4>Error Stream</h4>
    <div class="output-slot">
      <pre id="output">Waiting for output…</pre>
    </div>

    </div>

    <!-- RIGHT: Token Company -->
    <div class="container secondary">
      <h3 class="title">Token Compression</h3>

      <h4>Captured Error</h4>
      <pre id="final-output">No error captured yet.</pre>

      <button id="compress" disabled>
        Compress Error
      </button>
    </div>
  </div>

  <!-- Popup -->
  <div id="done-modal" class="modal hidden">
    <div class="modal-content">
      <h3>ERROR STREAM CAUGHT</h3>
      <p>A full error has been detected and locked.</p>
      <button id="close-modal">Continue</button>
    </div>
  </div>
`

const fileInput = document.getElementById('file')
const startBtn = document.getElementById('start')
const stopBtn = document.getElementById('stop')
const compressBtn = document.getElementById('compress')

const outputEl = document.getElementById('output')
const finalOutputEl = document.getElementById('final-output')

const modal = document.getElementById('done-modal')
const closeModalBtn = document.getElementById('close-modal')

let videoFile = null
let vision = null
let finalized = false
let bestOutput = ''

fileInput.addEventListener('change', () => {
  videoFile = fileInput.files[0]
})

function showPopup() {
  modal.classList.remove('hidden')
}

closeModalBtn.addEventListener('click', () => {
  modal.classList.add('hidden')
})

function finalizeError(errorText) {
  if (finalized) return
  finalized = true

  bestOutput = errorText
  outputEl.textContent = errorText
  finalOutputEl.textContent = errorText

  compressBtn.disabled = false

  if (vision) {
    vision.stop()
    vision = null
  }

  startBtn.disabled = false
  stopBtn.disabled = true

  showPopup()
}

startBtn.addEventListener('click', async () => {
  if (!videoFile) return

  finalized = false
  bestOutput = ''
  outputEl.textContent = 'Analyzing…'
  finalOutputEl.textContent = 'No error captured yet.'
  compressBtn.disabled = true
  modal.classList.add('hidden')

  vision = new RealtimeVision({
    apiUrl: import.meta.env.VITE_OVERSHOOT_API_URL,
    apiKey: import.meta.env.VITE_OVERSHOOT_API_KEY,

    prompt: `
You are analyzing a screen recording of a computer display.

Detect and extract any visible error messages from the screen.

Errors may include:
- Console errors
- Runtime exceptions
- Stack traces
- Any text indicating failure or invalid behavior

Output rules:
- If an error is visible, extract the FULL error text exactly as shown.
- Preserve formatting and line breaks.
- Do NOT explain or summarize.
- Do NOT add extra text.

If no error is visible, output exactly:
NO_ERROR
    `,

    source: {
      type: 'video',
      file: videoFile,
    },

    processing: {
      clip_length_seconds: 1.5,
      delay_seconds: 1.5,
      fps: 30,
      sampling_ratio: 0.75,
    },

    onResult: (result) => {
      if (finalized || !result?.result) return

      const text = result.result.trim()

      if (text === 'NO_ERROR') return

      outputEl.textContent = text

      if (text.length >= ERROR_LENGTH_THRESHOLD) {
        finalizeError(text)
      }
    },
  })

  await vision.start()
  startBtn.disabled = true
  stopBtn.disabled = false
})

stopBtn.addEventListener('click', () => {
  if (bestOutput.length > 0) {
    finalizeError(bestOutput)
  } else {
    finalized = true
    if (vision) vision.stop()
    vision = null
    startBtn.disabled = false
    stopBtn.disabled = true
  }
})

compressBtn.addEventListener('click', () => {
  // Placeholder for token company integration
  console.log('Sending to token company:', bestOutput)
})
