import { RealtimeVision } from '@overshoot/sdk'
import './style.css'

const ERROR_LENGTH_THRESHOLD = 250

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

  <div class="controls">
    <button id="compress" disabled>Compress</button>
    <button id="copy" disabled>Copy</button>
  </div>

  <h4>Captured Error</h4>

  <div id="token-meta" class="token-meta hidden"></div>

  <div class="output-slot">
    <pre id="final-output">No error captured yet.</pre>
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
const copyBtn = document.getElementById('copy')

const outputEl = document.getElementById('output')
const finalOutputEl = document.getElementById('final-output')

const modal = document.getElementById('done-modal')
const closeModalBtn = document.getElementById('close-modal')

let videoFile = null
let vision = null
let finalized = false
let bestOutput = ''
let compressedOutput = ''

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
  copyBtn.disabled = true

  if (vision) {
    vision.stop()
    vision = null
  }

  startBtn.disabled = false
  stopBtn.disabled = true

  showPopup()
}

async function compressWithTokenCompany(text) {
  const response = await fetch('https://api.thetokencompany.com/v1/compress', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_TOKENCOMPANY_API_KEY}`
    },
    body: JSON.stringify({
      model: 'bear-1',
      compression_settings: {
        aggressiveness: 0.85,
        max_output_tokens: null,
        min_output_tokens: null
      },
      input: text
    })
  })

  if (!response.ok) {
    throw new Error('Token Company compression failed')
  }

  return response.json()
}

function renderTokenMeta(meta) {
  const {
    original_input_tokens,
    output_tokens,
    compression_time,
  } = meta

  const reductionPercent = Math.round(
    ((original_input_tokens - output_tokens) / original_input_tokens) * 100
  )

  const metaEl = document.getElementById('token-meta')

  metaEl.innerHTML = `
    <div class="token-row">
      <span>Tokens</span>
      <span>${original_input_tokens} → ${output_tokens}</span>
    </div>

    <div class="token-row">
      <span>Reduction</span>
      <span>${reductionPercent}%</span>
    </div>

    <div class="token-bar">
      <div class="token-bar-fill" style="width: ${reductionPercent}%"></div>
    </div>

    <div class="token-hint">
      Compression time: ${compression_time.toFixed(2)}s
    </div>
  `

  metaEl.classList.remove('hidden')
}


startBtn.addEventListener('click', async () => {
  if (!videoFile) return

  finalized = false
  bestOutput = ''
  compressedOutput = ''

  outputEl.textContent = 'Analyzing…'
  finalOutputEl.textContent = 'No error captured yet.'

  compressBtn.disabled = true
  copyBtn.disabled = true
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
- If an error is visible, extract the FULL error text.
- Preserve formatting.
- Do NOT explain or summarize.
- Do NOT add extra text.

If no error is visible, output exactly:
Still parsing!
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
      console.log('[Overshoot] frame window processed')
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
  console.log('[Overshoot] started watching video frames')
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

compressBtn.addEventListener('click', async () => {
  compressBtn.disabled = true
  finalOutputEl.textContent = 'Compressing…'

  try {
    const result = await compressWithTokenCompany(bestOutput)

    compressedOutput = result.output
    finalOutputEl.textContent = compressedOutput

    renderTokenMeta(result)


    await navigator.clipboard.writeText(compressedOutput)
    copyBtn.disabled = false
    copyBtn.textContent = 'Copied'

  } catch (err) {
    finalOutputEl.textContent = 'Compression failed.'
    console.error(err)
  }
})

copyBtn.addEventListener('click', async () => {
  if (!compressedOutput) return
  await navigator.clipboard.writeText(compressedOutput)
  copyBtn.textContent = 'Copied'
})
