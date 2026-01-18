import { RealtimeVision } from '@overshoot/sdk'
import './style.css'

const ERROR_LENGTH_THRESHOLD = 250

document.querySelector('#app').innerHTML = `
  <!-- 1. Navbar -->
  <header class="navbar">
    <div class="brand">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
      Watch Tower
    </div>
    <div class="status-badge" id="status-badge">
      <div class="status-dot"></div>
      <span id="status-text">Idle</span>
    </div>
  </header>

  <!-- 2. Workspace -->
  <div class="workspace">
    <!-- Left: Live Session -->
    <div class="panel-left">
      <video id="preview" autoplay muted playsinline></video>
      
      <!-- Action Overlay -->
      <div class="action-overlay">
        <button id="start-btn" class="btn-primary">Start Session</button>
        <button id="stop-btn" class="btn-primary btn-danger hidden" style="display:none">Stop Session</button>
      </div>
    </div>

    <!-- Right: Intelligence -->
    <div class="panel-right">
      <!-- Tabs -->
      <div class="tabs">
        <button class="tab-btn active" data-tab="stream">Live Stream</button>
        <button class="tab-btn" data-tab="compression">Compression</button>
      </div>

      <!-- Tab: Live Stream -->
      <div id="tab-stream" class="tab-content active">
        <div class="log-container">
            <div id="output">Waiting for session start...</div>
        </div>
      </div>

      <!-- Tab: Compression -->
      <div id="tab-compression" class="tab-content">
        <div class="compression-view">
           <div id="token-stats" class="token-stats hidden">
              <!-- Injected via JS -->
           </div>
           
           <div class="prompt-area" id="final-output">No data captured yet.</div>
           
           <div class="copy-feedback" id="copy-feedback"></div>
           
           <button id="compress-btn" class="btn-block" disabled>Compress & Copy Prompt</button>
        </div>
      </div>
    </div>
  </div>
`

// --- DOM CONSTANTS ---
const startBtn = document.getElementById('start-btn')
const stopBtn = document.getElementById('stop-btn')
const compressBtn = document.getElementById('compress-btn')

const outputEl = document.getElementById('output') // Log container
const finalOutputEl = document.getElementById('final-output') // Compression result area
const previewEl = document.getElementById('preview')

const statusBadge = document.getElementById('status-badge')
const statusText = document.getElementById('status-text')
const tokenStatsEl = document.getElementById('token-stats')
const copyFeedbackEl = document.getElementById('copy-feedback')

let vision = null
let finalized = false
let bestOutput = ''
let compressedOutput = ''
let lastDetectedText = ''

// Tab Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // 1. Remove active class from all buttons and contents
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'))

    // 2. Activate clicked
    btn.classList.add('active')
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active')
  })
})


async function compressWithTokenCompany(text) {
  console.log('Attemping compression with key:', import.meta.env.VITE_TOKENCOMPANY_API_KEY ? 'FOUND' : 'MISSING')

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

  tokenStatsEl.innerHTML = `
    <div class="stat-row">
      <span>Original Tokens</span>
      <span class="stat-value">${original_input_tokens}</span>
    </div>
    <div class="stat-row">
      <span>Compressed</span>
      <span class="stat-value">${output_tokens}</span>
    </div>
    <div class="stat-row" style="color:var(--status-green)">
      <span>Reduction</span>
      <span class="stat-value">${reductionPercent}%</span>
    </div>

    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width: ${reductionPercent}%"></div>
    </div>
  `
  tokenStatsEl.classList.remove('hidden')
}



startBtn.addEventListener('click', async () => {
  try {
    // 1. Get Screen Stream (Constrained to 1080p to ensure readable text size/bandwidth)
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920, max: 1920 },
        height: { ideal: 1080, max: 1080 },
        frameRate: { ideal: 24, max: 30 },
        cursor: "always"
      },
      audio: false
    })

    // Show preview
    previewEl.srcObject = stream

    // DIAGNOSTICS: Check what we are actually sending
    const track = stream.getVideoTracks()[0]
    const settings = track.getSettings()
    const diagMsg = `[System] Stream Active: ${settings.width}x${settings.height} @ ${settings.frameRate?.toFixed(1) || '?'} fps`
    console.log(diagMsg)
    outputEl.textContent = `${diagMsg}\nWaiting for AI response...`

    // Handle user stopping stream via browser UI
    track.onended = () => {
      stopBtn.click()
    }

    finalized = false
    bestOutput = ''
    lastDetectedText = ''
    compressedOutput = ''

    outputEl.textContent = 'Watching screen…'
    finalOutputEl.textContent = 'No error captured yet.'

    compressBtn.disabled = true

    // 2. Intercept getUserMedia - Return the raw screen stream directly
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async () => {
      // The SDK expects a stream, so we give it our screen stream.
      return stream
    }

    // 3. Init Vision
    vision = new RealtimeVision({
      apiUrl: import.meta.env.VITE_OVERSHOOT_API_URL,
      apiKey: import.meta.env.VITE_OVERSHOOT_API_KEY,

      prompt: "EXTRACT ALL VISIBLE ERROR TEXT, STACK TRACES, AND LOGS. COPY THEM EXACTLY. DO NOT SUMMARIZE.",

      source: {
        type: 'camera',
        cameraFacing: 'environment',
      },

      debug: true,

      processing: {
        clip_length_seconds: 2,
        delay_seconds: 1,
        fps: 5,
        sampling_ratio: 1,
      },

      onResult: (result) => {
        console.log('[Overshoot] result:', result)
        if (finalized || !result?.result) return

        const text = result.result.trim()

        // IGNORE negative phrases
        const ignoredPhrases = [
          'NO_ERROR',
          'Still parsing!',
          'No visible error',
          'No visible error text'
        ]
        const isIgnored = ignoredPhrases.some(phrase => text.includes(phrase))

        // DEBUG LOG always to console, but update UI smartly
        if (!isIgnored) {
          // LIVE UPDATE: Show the user whatever we see right now
          outputEl.textContent = text

          // Keep the longest/"best" capture for the compression button
          if (text.length > bestOutput.length) {
            bestOutput = text
            console.log('New best output saved:', bestOutput.length)
          }
          lastDetectedText = text
        } else {
          // SHOW ALIVENESS: If we ignore the text, at least tell the user we are scanning
          // But don't overwrite if we already have good text?
          // Actually, if it goes from "Error" to "No Error", we might want to keep the error visible?
          // The user wants "Live" feeling. 

          // If we haven't found anything good yet, say Scanning.
          if (bestOutput.length === 0) {
            outputEl.textContent = `Scanning... [${new Date().toLocaleTimeString()}]\n(No error detected yet)`
          }
        }
      },
    })

    // 4. Start Vision (this calls the hijacked getUserMedia)
    await vision.start()

    // 5. Restore original getUserMedia
    navigator.mediaDevices.getUserMedia = originalGetUserMedia

    console.log('[Overshoot] started watching screen stream')

    // UI Updates
    startBtn.style.display = 'none'
    stopBtn.style.display = 'block'
    stopBtn.disabled = false
    stopBtn.classList.remove('hidden')

    previewEl.classList.add('active')
    statusBadge.classList.add('active')
    statusText.textContent = 'Recording'

  } catch (err) {
    console.error('Failed to start screen share:', err)
    outputEl.textContent = `Failed to start: ${err.message || err}`
  }
})

stopBtn.addEventListener('click', () => {
  if (finalized) return

  finalized = true
  if (vision) vision.stop()
  vision = null

  startBtn.style.display = 'block'
  startBtn.disabled = false

  stopBtn.style.display = 'none'
  stopBtn.disabled = true

  statusBadge.classList.remove('active')
  statusText.textContent = 'Error Captured'
  previewEl.classList.remove('active')

  // Decide what to put in "Captured Error" slot
  // Prefer Best (Longest) Output, fallback to Last Seen
  const textToCapture = bestOutput || lastDetectedText || "No error detected."

  outputEl.textContent = textToCapture  // Keep log visible
  finalOutputEl.textContent = textToCapture // Prep compression input

  if (textToCapture.length > 10 && textToCapture !== "No error detected.") {
    compressBtn.disabled = false
    // Auto-switch tab to highlight next step? Maybe
    document.querySelector('[data-tab="compression"]').click()
  }
})

// Helper to lock in the error state
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

  // Clear preview
  previewEl.srcObject = null

  startBtn.style.display = 'block'
  startBtn.disabled = false

  stopBtn.style.display = 'none'
  stopBtn.disabled = true

  statusBadge.classList.remove('active')
  statusText.textContent = 'Error Captured'
  previewEl.classList.remove('active')

  // Auto-switch tab to highlight next step
  document.querySelector('[data-tab="compression"]').click()
}

compressBtn.addEventListener('click', async () => {
  compressBtn.disabled = true
  finalOutputEl.textContent = 'Compressing…'

  try {
    const result = await compressWithTokenCompany(bestOutput)

    const compressedLog = result.output // The raw compressed text

    // Construct the final prompt for the user
    compressedOutput = `I am debugging an issue in my application. Here is the compressed error log and stack trace. Please analyze it and identify the root cause:\n\n${compressedLog}`

    finalOutputEl.textContent = compressedOutput

    renderTokenMeta(result)


    await navigator.clipboard.writeText(compressedOutput)

    compressBtn.textContent = 'Copied to Clipboard!'
    compressBtn.disabled = false
    copyFeedbackEl.textContent = 'Prompt ready for LLM.'

    setTimeout(() => {
      compressBtn.textContent = 'Compress & Copy Prompt'
      copyFeedbackEl.textContent = ''
    }, 3000)

  } catch (err) {
    finalOutputEl.textContent = 'Compression failed.'
    console.error(err)
    compressBtn.disabled = false
    compressBtn.textContent = 'Retry Compression'
  }
})
