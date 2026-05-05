importScripts('config.js')

function cacheStorageKey(url, mode) {
  const combined = `${url}\n${mode || 'full'}`
  const encoded = btoa(unescape(encodeURIComponent(combined)))
  return 'cache_' + encoded.replace(/[^a-z0-9]/gi, '').slice(0, 40)
}

async function getCached(url, mode) {
  const key = cacheStorageKey(url, mode)
  const result = await chrome.storage.local.get(key)
  const cached = result[key]
  if (!cached) return null
  if (Date.now() - cached.timestamp > 3600000) return null
  return cached.data
}

async function setCache(url, mode, data) {
  const key = cacheStorageKey(url, mode)
  await chrome.storage.local.set({
    [key]: { data, timestamp: Date.now(), mode }
  })
}

function getProxyUrl() {
  const u =
    typeof self !== 'undefined' && self.GLANCE_PROXY_URL
      ? self.GLANCE_PROXY_URL
      : ''
  if (!u || typeof u !== 'string') {
    throw new Error('NO_PROXY_URL')
  }
  return u.trim()
}

async function handleSummarize(content, title, url, mode, bypassCache) {
  const modeKey = mode || 'full'

  if (!bypassCache) {
    const cached = await getCached(url, modeKey)
    if (cached) return cached
  }

  const proxyUrl = getProxyUrl()

  let response
  try {
    response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        title: title || '',
        mode: modeKey
      })
    })
  } catch {
    throw new Error('NETWORK_ERROR')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    const code = body.error
    if (response.status === 503 || code === 'SERVICE_MISCONFIGURED') {
      throw new Error('PROXY_MISCONFIGURED')
    }
    if (response.status === 401 || code === 'INVALID_API_KEY') {
      throw new Error('INVALID_API_KEY')
    }
    if (response.status === 429 || code === 'RATE_LIMITED') {
      throw new Error('RATE_LIMITED')
    }
    if (response.status === 422) {
      if (code === 'JSON_PARSE_ERROR') throw new Error('JSON_PARSE_ERROR')
      if (code === 'NO_CANDIDATES') throw new Error('NO_CANDIDATES')
      throw new Error('JSON_PARSE_ERROR')
    }
    throw new Error(body.message || body.error || 'API_ERROR')
  }

  const result = await response.json()
  if (!result || typeof result !== 'object') {
    throw new Error('JSON_PARSE_ERROR')
  }

  await setCache(url, modeKey, result)
  return result
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SUMMARIZE') {
    handleSummarize(
      request.content,
      request.title,
      request.url,
      request.mode,
      Boolean(request.bypassCache)
    )
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  }

  if (request.type === 'CLEAR_CACHE') {
    chrome.storage.local.get(null, (items) => {
      const keys = Object.keys(items || {}).filter((k) =>
        k.startsWith('cache_')
      )
      if (keys.length === 0) {
        sendResponse({ success: true })
        return
      }
      chrome.storage.local.remove(keys, () =>
        sendResponse({ success: true })
      )
    })
    return true
  }
})
