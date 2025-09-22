const tabs = document.querySelectorAll('.bottom-nav .tab')
const views = document.querySelectorAll('.view')
const ringProgress = document.querySelector('.ring-progress')
const countdownEl = document.querySelector('.countdown')
const sessionLabel = document.querySelector('.session-label')
const startBtn = document.querySelector('[data-action="start"]')
let pauseBtn = null
let resetBtn = null

// ======== Stats =========
const list = document.getElementById('stats-list')
let stats = JSON.parse(localStorage.getItem('tiking-stats')) || []

function saveStats() {
  localStorage.setItem('tiking-stats', JSON.stringify(stats))
}

function renderStats() {
  if (!list) return
  if (stats.length === 0) {
    list.innerHTML = `<p class="muted">No data yet. Start a session!</p>`
    return
  }
  list.innerHTML = stats.map(s => {
    const minutes = Math.round(s.duration / 60)
    const date = new Date(s.date).toLocaleString([], { 
      weekday: 'short', hour: '2-digit', minute: '2-digit' 
    })
    return `
      <li class="glass stats-item">
        <div>${s.type === "focus" ? "🔥 Focus" : "☕ Break"} — ${minutes} min</div>
        <span>${date}</span>
      </li>
    `
  }).join("")
}
renderStats()

// ======== Tab navigation =========
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.getAttribute('data-tab')
    tabs.forEach((t) => t.classList.toggle('active', t === tab))
    views.forEach((v) => v.setAttribute('aria-hidden', String(v.getAttribute('data-view') !== target)))
  })
})

// ======== Timer =========
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
  sessionLabel.classList.toggle('break', isBreak)
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
    playing = false
    applyButtonState()

    // Add to stats
    stats.unshift({ type: isBreak ? 'break' : 'focus', duration: seconds, date: Date.now() })
    if (stats.length > 50) stats.pop() // keep last 50 sessions
    saveStats()
    renderStats()

    // end chime
    if (!isBreak) {
      const url = (document.getElementById('focus-sound-url') || {}).value
      if (url && /^https?:\/\//i.test(url)) playExternal(url)
      else playChime('focusEnd')
    } else {
      playChime('breakEnd')
    }

    // Auto-switch sessions
    if (!isBreak) {
      isBreak = true
      seconds = (Number(localStorage.getItem('tiking-break-minutes')) || breakMinutes) * 60
      elapsed = 0
      playChime('breakStart')
      playing = true
      applyButtonState()
      rafId = requestAnimationFrame(tick)
    } else {
      isBreak = false
      // reset focus duration
      seconds = Number(localStorage.getItem('tiking-focus-minutes')) || Math.round(seconds / 60) * 60
      elapsed = 0
      render()
      applyButtonState()
    }
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
    if (!isBreak && elapsed === 0) playChime('focusStart')
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

// ======== Wheel pickers =========
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
      localStorage.setItem('tiking-focus-minutes', minutes)
      reset()
      document.getElementById('focus-value').textContent = `${minutes} min`
    } else if (el.id === 'break-wheel') {
      localStorage.setItem('tiking-break-minutes', String(minutes))
      document.getElementById('break-value').textContent = `${minutes} min`
    }
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

  items.forEach((node, i) => {
    node.style.cursor = 'pointer'
    node.addEventListener('click', () => {
      applySelection(i)
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
  buildWheel(focusWheel, 5, 60, 5, Number(localStorage.getItem('tiking-focus-minutes')) || 25)
  buildWheel(breakWheel, 5, 30, 5, [5,10,15,20,25,30].includes(savedBreak) ? savedBreak : 5)

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

// ======== Audio =========
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
  master.gain.value = 0.05
  master.connect(ctx.destination)

  const sequences = {
    focusStart: [ { f: 880, t: 0, d: 0.08 }, { f: 1320, t: 0.08, d: 0.12 } ],
    focusEnd:   [ { f: 1320, t: 0, d: 0.08 }, { f: 880,  t: 0.08, d: 0.12 } ],
    breakStart: [ { f: 740, t: 0, d: 0.12 } ],
    breakEnd:   [ { f: 660, t: 0, d: 0.12 } ]
  }
  const seq = sequences[type] || sequences.focusStart

  master.gain.setValueAtTime(0.05, now)
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
// Fetch stats from localStorage or start empty
let stats = JSON.parse(localStorage.getItem('tiking-stats') || '[]');

const list = document.getElementById('stats-list');
const emptyMsg = document.querySelector('.stats-empty');

function renderStats() {
  list.innerHTML = stats.map(s => {
    const minutes = Math.round(s.duration / 60);
    const date = new Date(s.date).toLocaleString([], { 
      weekday: 'short', hour: '2-digit', minute: '2-digit' 
    });
    return `
      <li class="glass">
        <div>${s.type === "focus" ? "🔥 Focus" : "☕ Break"} — ${minutes} min</div>
        <span>${date}</span>
      </li>
    `;
  }).join("");

  emptyMsg.style.display = stats.length ? 'none' : 'grid';
}

// Call initially
renderStats();

// Push new session after timer finishes
function addSession(type, duration) {
  stats.push({ type, duration, date: Date.now() });
  localStorage.setItem('tiking-stats', JSON.stringify(stats));
  renderStats();
}

// Hook into your existing timer logic
// Replace the "Session finished" part in app.js with:
if (elapsed >= seconds && playing) {
  playing = false;
  applyButtonState();

  // Play end chime
  if (!isBreak) {
    const url = (document.getElementById('focus-sound-url') || {}).value;
    if (url && /^https?:\/\//i.test(url)) playExternal(url);
    else playChime('focusEnd');

    // Add focus session to stats
    addSession('focus', seconds);
  } else {
    playChime('breakEnd');

    // Add break session to stats
    addSession('break', seconds);
  }

  // Auto-switch to break if just finished focus
  if (!isBreak) {
    isBreak = true;
    seconds = (Number(localStorage.getItem('tiking-break-minutes')) || breakMinutes) * 60;
    elapsed = 0;
    playChime('breakStart');
    playing = true;
    applyButtonState();
    rafId = requestAnimationFrame(tick);
  } else {
    // After break, go back to focus
    isBreak = false;
  }
  render();
}

let externalAudio
function playExternal(url) {
  try {
    if (!externalAudio) externalAudio = new Audio()
    externalAudio.src = url
    externalAudio.currentTime = 0
    externalAudio.play().catch(() => {})
  } catch {}
}

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
