const VIEWS = ['view-ready', 'view-loading', 'view-result', 'view-error']

let selectedMode = 'full'
let loadingSubTimer = null
let lastExtract = null
let lastPageTitle = ''
let lastResult = null
let lastActiveTabId = null

function showView(id) {
  VIEWS.forEach((vid) => {
    const el = document.getElementById(vid)
    if (!el) return
    el.classList.toggle('hidden', vid !== id)
  })
}

function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError
      if (err) {
        resolve({ __error: err.message })
        return
      }
      resolve(response)
    })
  })
}

function mapErrorMessage(code) {
  switch (code) {
    case 'NO_PROXY_URL':
      return 'Extension is missing proxy URL. Edit config.js and reload the extension.'
    case 'PROXY_MISCONFIGURED':
      return 'Summarize service is not ready. Set GROQ_API_KEY on the server and restart the proxy.'
    case 'NETWORK_ERROR':
      return 'Cannot reach the summarize server. Start the proxy (npm start in server/) or check config.js URL.'
    case 'INVALID_API_KEY':
      return 'The Groq API key on the server is invalid. Update server .env and restart.'
    case 'RATE_LIMITED':
      return "You've hit the API rate limit. Wait a moment and try again."
    case 'JSON_PARSE_ERROR':
      return 'The AI returned an unexpected response. Try again.'
    case 'NO_CANDIDATES':
      return 'The model returned no text. Try again or shorten the page.'
    case 'CONTENT_BLOCKED':
      return 'This content could not be summarized. Try another page.'
    default:
      return null
  }
}

function setLoadingSubMessages() {
  const el = document.getElementById('loading-sub')
  const steps = [
    'Extracting content...',
    'Analyzing...',
    'Generating summary...'
  ]
  let i = 0
  if (loadingSubTimer) clearInterval(loadingSubTimer)
  el.textContent = steps[0]
  loadingSubTimer = setInterval(() => {
    i = (i + 1) % steps.length
    el.textContent = steps[i]
  }, 1500)
}

function clearLoadingTimers() {
  if (loadingSubTimer) clearInterval(loadingSubTimer)
  loadingSubTimer = null
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function populateResult(pageTitleText, data) {
  document.getElementById('result-title').textContent =
    pageTitleText || '(Untitled)'
  document.getElementById('badge-time').textContent = `${data.readingTime} min read`
  document.getElementById('badge-sentiment').textContent = data.sentiment || 'neutral'

  const summaryEl = document.getElementById('summary-text')
  const secSum = document.getElementById('section-summary')
  if ((data.summary || '').trim()) {
    summaryEl.textContent = data.summary.trim()
    secSum.classList.remove('hidden-section')
  } else {
    summaryEl.textContent = ''
    secSum.classList.add('hidden-section')
  }

  const bullets = document.getElementById('bullets-list')
  bullets.textContent = ''
  const secBul = document.getElementById('section-bullets')
  if ((data.bullets || []).length) {
    data.bullets.forEach((item) => {
      const li = document.createElement('li')
      li.innerHTML = escapeHtml(item)
      bullets.appendChild(li)
    })
    secBul.classList.remove('hidden-section')
  } else {
    secBul.classList.add('hidden-section')
  }

  const insights = document.getElementById('insights-list')
  insights.textContent = ''
  const secIns = document.getElementById('section-insights')
  if ((data.insights || []).length) {
    data.insights.forEach((item) => {
      const li = document.createElement('li')
      li.innerHTML = escapeHtml(item)
      insights.appendChild(li)
    })
    secIns.classList.remove('hidden-section')
  } else {
    secIns.classList.add('hidden-section')
  }
}

function plainTextSummary(data, pageTitleText) {
  const lines = []
  lines.push(`Title: ${pageTitleText}`)
  lines.push('')
  if ((data.summary || '').trim()) {
    lines.push('Summary')
    lines.push(data.summary.trim())
    lines.push('')
  }
  if ((data.bullets || []).length) {
    lines.push('Key points')
    data.bullets.forEach((b, i) => lines.push(`${i + 1}. ${b}`))
    lines.push('')
  }
  if ((data.insights || []).length) {
    lines.push('Insights')
    data.insights.forEach((b, i) => lines.push(`${i + 1}. ${b}`))
  }
  return lines.join('\n').trim()
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0])
    })
  })
}

async function hydrateReadyView() {
  const tab = await getActiveTab()
  if (!tab) return
  lastActiveTabId = tab.id
  document.getElementById('page-title').textContent = tab.title || '(Untitled)'

  if (tab.id == null) return
  chrome.tabs.sendMessage(
    tab.id,
    { type: 'EXTRACT_CONTENT' },
    (response) => {
      const err = chrome.runtime.lastError
      if (err || !response) {
        document.getElementById('page-meta').textContent =
          'Estimated words: unavailable on this tab'
        return
      }
      document.getElementById('page-meta').textContent = `Estimated ${response.wordCount} words`
      lastExtract = response
      lastPageTitle = response.title || tab.title || ''
    }
  )
}

async function runSummarize(bypassCache) {
  clearLoadingTimers()
  showView('view-loading')
  setLoadingSubMessages()

  const tab = await getActiveTab()
  if (!tab || tab.id == null) {
    clearLoadingTimers()
    showError('No active tab')
    return
  }
  lastActiveTabId = tab.id

  chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_CONTENT' }, (extracted) => {
    const chromeErr = chrome.runtime.lastError
    if (chromeErr || !extracted) {
      clearLoadingTimers()
      showError("This page can't be summarized. Try refreshing the page.")
      lastExtract = null
      return
    }

    lastExtract = extracted
    lastPageTitle = extracted.title || tab.title || ''

    sendToBackground({
      type: 'SUMMARIZE',
      content: extracted.content,
      title: extracted.title || tab.title || '',
      url: extracted.url || tab.url || '',
      mode: selectedMode,
      bypassCache: Boolean(bypassCache)
    }).then((res) => {
      clearLoadingTimers()
      if (!res || res.__error) {
        showError(chrome.runtime.lastError?.message || res.__error || 'Unknown error')
        return
      }
      if (!res.success) {
        const msg = mapErrorMessage(res.error)
        showError(msg || res.error || 'Something went wrong')
        return
      }
      lastResult = res.data
      populateResult(lastPageTitle, res.data)
      showView('view-result')
    })
  })
}

function showError(message) {
  document.getElementById('error-message').textContent = message || 'Unknown error'
  showView('view-error')
}

function wireChips(root) {
  root.querySelectorAll('.option-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.option-chip').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      selectedMode = btn.getAttribute('data-mode') || 'full'
    })
  })
}

document.addEventListener('DOMContentLoaded', () => {
  wireChips(document)

  document.getElementById('clear-cache-btn').addEventListener('click', async () => {
    await sendToBackground({ type: 'CLEAR_CACHE' })
  })

  showView('view-ready')
  hydrateReadyView()

  document.getElementById('summarize-btn').addEventListener('click', () => {
    runSummarize(false)
  })

  document.getElementById('retry-btn').addEventListener('click', () => {
    runSummarize(false)
  })

  document.getElementById('copy-btn').addEventListener('click', async () => {
    const label = document.getElementById('copy-btn-label')
    if (!lastResult) return
    const txt = plainTextSummary(lastResult, lastPageTitle)
    try {
      await navigator.clipboard.writeText(txt)
      const prev = label.textContent
      label.textContent = 'Copied!'
      setTimeout(() => {
        label.textContent = prev
      }, 2000)
    } catch {
      showError('Clipboard access failed.')
      showView('view-error')
    }
  })

  document.getElementById('highlight-btn').addEventListener('click', async () => {
    if (!lastResult || !lastResult.bullets || !lastActiveTabId) return
    chrome.tabs.sendMessage(
      lastActiveTabId,
      { type: 'HIGHLIGHT', bullets: lastResult.bullets },
      () => {
        void chrome.runtime.lastError
      }
    )
  })

  document.getElementById('new-summary-btn').addEventListener('click', () => {
    runSummarize(true)
  })
})
