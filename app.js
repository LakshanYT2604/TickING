const tabs = document.querySelectorAll('.bottom-nav .tab')
const views = document.querySelectorAll('.view')
const ringProgress = document.querySelector('.ring-progress')
const countdownEl = document.querySelector('.countdown')
const sessionLabel = document.querySelector('.session-label')
const startBtn = document.querySelector('[data-action="start"]')
let pauseBtn = null
let resetBtn = null

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab')
    tabs.forEach((t) => t.classList.toggle('active', t === tab))
    views.forEach((v) => v.setAttribute('aria-hidden', String(v.getAttribute('data-view') !== target)))
  })
})

// Minimal mock progress animation for the ring and countdown label
let seconds = 25 * 60
let elapsed = 0
const r = 120
const circumference = 2 * Math.PI * r
let isBreak = false
let breakMinutes = Number(localStorage.getItem('tiking-break-minutes')) || 5

function render() {
  const remaining = Math.max(0, Math.ceil(seconds - elapsed))
  const minutes = Math.floor(remaining / 60)
  const sec = remaining % 60
  countdownEl.textContent = `${String(minutes).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  const ratio = elapsed / seconds
  const dashoffset = circumference * (1 - Math.max(0, Math.min(1, ratio)))
  ringProgress.style.strokeDasharray = `${circumference} ${circumference}`
  ringProgress.style.strokeDashoffset = `${dashoffset}`
  sessionLabel.textContent = isBreak ? 'Short Break' : 'Focus Session'
}

render()
let playing = false
let rafId
let last = 0

function tick(ts) {
  if (!last) last = ts
  const dt = (ts - last) / 1000
  last = ts
  elapsed = Math.min(seconds, elapsed + dt)
  render()
  if (elapsed < seconds && playing) {
    rafId = requestAnimationFrame(tick)
  } else if (elapsed >= seconds && playing) {
    // Session finished
    playing = false
    applyButtonState()
    // end chime depending on session type
    if (!isBreak) {
      // Try user-provided focus end sound first
      const url = (document.getElementById('focus-sound-url') || {}).value
      if (url && /^https?:\/\//i.test(url)) {
        playExternal(url)
      } else {
        playChime('focusEnd')
      }
    } else {
      playChime('breakEnd')
    }
    // Auto-switch to break if we just finished focus
    if (!isBreak) {
      isBreak = true
      seconds = (Number(localStorage.getItem('tiking-break-minutes')) || breakMinutes) * 60
      elapsed = 0
      // play break start chime
      playChime('breakStart')
      playing = true
      applyButtonState()
      rafId = requestAnimationFrame(tick)
    } else {
      // After break, go back to focus with previous focus duration
      isBreak = false
    }
    render()
  }
}

function applyButtonState() {
  if (playing) {
    startBtn.textContent = 'Pause'
    startBtn.classList.remove('primary')
    startBtn.classList.add('success')
    startBtn.setAttribute('aria-label', 'Pause')
    if (!resetBtn) {
      resetBtn = document.createElement('button')
      resetBtn.className = 'pill ghost'
      resetBtn.dataset.action = 'reset'
      resetBtn.textContent = 'Reset'
      startBtn.parentElement.appendChild(resetBtn)
      resetBtn.addEventListener('click', reset)
    }
  } else {
    startBtn.textContent = 'Start'
    startBtn.classList.remove('success')
    startBtn.classList.add('primary')
    startBtn.setAttribute('aria-label', 'Start')
    if (resetBtn) {
      resetBtn.removeEventListener('click', reset)
      resetBtn.remove()
      resetBtn = null
    }
  }
}

function toggleStartPause() {
  if (!playing) {
    // play start chime only when starting focus session
    if (!isBreak && elapsed === 0) {
      playChime('focusStart')
    }
    playing = true
    last = 0
    rafId = requestAnimationFrame(tick)
  } else {
    playing = false
    cancelAnimationFrame(rafId)
  }
  applyButtonState()
}

function reset() {
  playing = false
  cancelAnimationFrame(rafId)
  elapsed = 0
  render()
  applyButtonState()
}

startBtn.addEventListener('click', toggleStartPause)

applyButtonState()

// Wheel picker logic
function buildWheel(el, min, max, step, value) {
  el.innerHTML = ''
  const indicator = document.createElement('div')
  indicator.className = 'wheel-indicator'
  el.appendChild(indicator)
  for (let i = min; i <= max; i += step) {
    const item = document.createElement('div')
    item.className = 'wheel-item'
    item.textContent = `${i} min`
    item.setAttribute('role', 'option')
    item.setAttribute('aria-selected', i === value ? 'true' : 'false')
    el.appendChild(item)
  }
  const items = Array.from(el.querySelectorAll('.wheel-item'))
  const idx = Math.max(0, items.findIndex((n) => n.textContent.startsWith(String(value))))
  const itemHeight = 36
  el.scrollTop = Math.max(0, idx * itemHeight - (el.clientHeight - itemHeight) / 2)
  let scrollTimeout

  function applySelection(index) {
    const clamped = Math.max(0, Math.min(items.length - 1, index))
    el.scrollTo({ top: clamped * itemHeight - (el.clientHeight - itemHeight) / 2, behavior: 'smooth' })
    items.forEach((n, i) => n.setAttribute('aria-selected', i === clamped ? 'true' : 'false'))
    const minutes = min + clamped * step
    const indicator = el.querySelector('.wheel-indicator')
    if (el.id === 'focus-wheel') {
      seconds = minutes * 60
      reset()
      document.getElementById('focus-value').textContent = `${minutes} min`
    } else if (el.id === 'break-wheel') {
      localStorage.setItem('tiking-break-minutes', String(minutes))
      document.getElementById('break-value').textContent = `${minutes} min`
    }
    // Flash the indicator for feedback
    if (indicator) {
      indicator.classList.remove('flash')
      void indicator.offsetWidth
      indicator.classList.add('flash')
    }
  }

  el.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout)
    scrollTimeout = setTimeout(() => {
      const center = el.scrollTop + el.clientHeight / 2
      const nearestIndex = Math.round(center / itemHeight - 0.5)
      applySelection(nearestIndex)
    }, 120)
  })

  // Click to select
  items.forEach((node, i) => {
    node.style.cursor = 'pointer'
    node.addEventListener('click', () => {
      applySelection(i)
      // auto-collapse after selection
      const wrap = el.closest('.wheel-container')
      if (wrap) {
        const header = wrap.querySelector('.picker-header')
        header && header.setAttribute('aria-expanded', 'false')
        el.classList.remove('open')
      }
    })
  })
}

const focusWheel = document.getElementById('focus-wheel')
const breakWheel = document.getElementById('break-wheel')
if (focusWheel && breakWheel) {
  const savedBreak = Number(localStorage.getItem('tiking-break-minutes')) || 5
  buildWheel(focusWheel, 5, 60, 5, Math.min(60, Math.max(5, Math.round(seconds / 60 / 5) * 5)))
  buildWheel(breakWheel, 5, 30, 5, [5,10,15,20,25,30].includes(savedBreak) ? savedBreak : 5)

  // Collapsible behavior
  document.querySelectorAll('.wheel-container').forEach((wrap) => {
    const header = wrap.querySelector('.picker-header')
    const wheel = wrap.querySelector('.wheel')
    header.addEventListener('click', () => {
      const expanded = header.getAttribute('aria-expanded') === 'true'
      header.setAttribute('aria-expanded', String(!expanded))
      wheel.classList.toggle('open', !expanded)
    })
  })
}

// iPhone-like chimes using WebAudio (no external assets)
let audioCtx
function ensureAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  } catch {}
  return audioCtx
}

function playChime(type) {
  const ctx = ensureAudio()
  if (!ctx) return
  const now = ctx.currentTime
  const master = ctx.createGain()
  master.gain.value = 0.0001
  master.connect(ctx.destination)

  // Define simple chime envelopes and tones
  const sequences = {
    focusStart: [ { f: 880, t: 0, d: 0.08 }, { f: 1320, t: 0.08, d: 0.12 } ],
    focusEnd:   [ { f: 1320, t: 0, d: 0.08 }, { f: 880,  t: 0.08, d: 0.12 } ],
    breakStart: [ { f: 740, t: 0, d: 0.12 } ],
    breakEnd:   [ { f: 660, t: 0, d: 0.12 } ]
  }
  const seq = sequences[type] || sequences.focusStart
  // gentle master fade in/out
  master.gain.setValueAtTime(0.0001, now)
  master.gain.exponentialRampToValueAtTime(0.3, now + 0.02)
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)

  seq.forEach(({ f, t, d }) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f, now + t)
    gain.gain.setValueAtTime(0.0001, now + t)
    gain.gain.exponentialRampToValueAtTime(0.6, now + t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + d)
    osc.connect(gain)
    gain.connect(master)
    osc.start(now + t)
    osc.stop(now + t + d + 0.02)
  })
}

// External MP3 playback helper
let externalAudio
function playExternal(url) {
  try {
    if (!externalAudio) externalAudio = new Audio()
    externalAudio.src = url
    externalAudio.currentTime = 0
    externalAudio.play().catch(() => {})
  } catch {}
}

// Wire test button
const testBtn = document.getElementById('focus-sound-test')
if (testBtn) {
  testBtn.addEventListener('click', () => {
    const url = (document.getElementById('focus-sound-url') || {}).value
    if (url && /^https?:\/\//i.test(url)) playExternal(url)
  })
}

// Spacebar toggles start/pause on Timer view
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === ' ') {
    const timerActive = document.querySelector('.view[data-view="timer"][aria-hidden="false"]')
    if (timerActive) {
      e.preventDefault()
      toggleStartPause()
    }
  }
})


