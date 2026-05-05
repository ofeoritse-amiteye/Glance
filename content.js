function extractPageContent() {
  let raw = ''

  const article = document.querySelector('article')
  if (
    article &&
    article.innerText &&
    article.innerText.trim().length > 200
  ) {
    raw = article.innerText
  } else {
    const candidates = []
    const selectors = [
      '[role="main"]',
      '#main',
      '#content',
      '[class*="article"]',
      '[class*="post"]',
      '[class*="content"]',
      '[class*="entry"]'
    ]
    for (let i = 0; i < selectors.length; i++) {
      const nodes = document.querySelectorAll(selectors[i])
      nodes.forEach((el) => {
        const t = (el.innerText || '').trim()
        if (t.length > 0) candidates.push(el)
      })
    }
    if (candidates.length) {
      candidates.sort(
        (a, b) => (b.innerText || '').length - (a.innerText || '').length
      )
      raw = candidates[0].innerText || ''
    } else {
      const cluster = findLargestParagraphClusterParent()
      raw = cluster ? cluster.innerText || '' : document.body.innerText || ''
    }
  }

  return postProcessExtracted(raw)
}

function findLargestParagraphClusterParent() {
  const paras = document.querySelectorAll('p')
  const scores = new Map()
  paras.forEach((p) => {
    let el = p.parentElement
    while (el && el !== document.documentElement) {
      scores.set(el, (scores.get(el) || 0) + 1)
      el = el.parentElement
    }
  })
  let best = null
  let max = 0
  scores.forEach((count, el) => {
    if (count > max) {
      max = count
      best = el
    }
  })
  return best
}

function isMostlyNumbersOrSpecial(line) {
  const alpha = (line.match(/[a-zA-Z]/g) || []).length
  if (alpha < 5) return true
  const special = (line.match(/[^a-zA-Z0-9\s]/g) || []).length
  return special > line.length * 0.5
}

function postProcessExtracted(text) {
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  const kept = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.length < 20) continue
    if (isMostlyNumbersOrSpecial(trimmed)) continue
    kept.push(trimmed)
  }
  let out = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  if (out.length <= 8000) return out
  return truncateAtLastSentenceBoundary(out, 8000)
}

function truncateAtLastSentenceBoundary(s, limit) {
  const slice = s.slice(0, limit)
  const boundaryCandidates = ['. ', '! ', '? ', '.\n', '!\n', '?\n']
  let best = -1
  for (let i = 0; i < boundaryCandidates.length; i++) {
    const idx = slice.lastIndexOf(boundaryCandidates[i])
    if (idx > best) best = idx
  }
  if (best > limit * 0.45) return slice.slice(0, best + 1).trim()
  return slice.trim()
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightKeyPoints(bullets) {
  document.querySelectorAll('.glance-highlight').forEach((el) => {
    const parent = el.parentNode
    if (!parent) return
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  })

  ;(bullets || []).forEach((bullet) => {
    const keywords = bullet
      .split(/\s+/)
      .filter((w) => w.length > 5)
      .slice(0, 3)
      .map((w) => w.replace(/[^a-zA-Z]/g, ''))
      .filter(Boolean)

    keywords.forEach((word) => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      )
      const re = new RegExp('\\b' + escapeRegExp(word) + '\\b', 'i')
      let node
      while ((node = walker.nextNode())) {
        if (!node.parentElement) continue
        if (node.parentElement.closest('script,style,noscript')) continue
        if (node.parentElement.closest('.glance-highlight')) continue
        if (!node.textContent.trim()) continue
        const full = node.textContent
        const m = full.match(re)
        if (!m || m.index == null) continue
        const idx = m.index
        const before = full.slice(0, idx)
        const matched = full.slice(idx, idx + m[0].length)
        const after = full.slice(idx + m[0].length)
        const parentNode = node.parentNode
        if (!parentNode) break
        const mark = document.createElement('mark')
        mark.className = 'glance-highlight'
        mark.style.cssText =
          'background: rgba(99,102,241,0.25); border-radius: 2px; padding: 0 1px;'
        mark.textContent = matched
        const beforeTxt = document.createTextNode(before)
        const afterTxt = document.createTextNode(after)
        parentNode.replaceChild(afterTxt, node)
        parentNode.insertBefore(mark, afterTxt)
        parentNode.insertBefore(beforeTxt, mark)
        break
      }
    })
  })
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'EXTRACT_CONTENT') {
    const content = extractPageContent()
    sendResponse({
      content,
      title: document.title,
      url: window.location.href,
      wordCount: content.split(/\s+/).filter(Boolean).length
    })
    return true
  }

  if (request.type === 'HIGHLIGHT') {
    highlightKeyPoints(request.bullets)
    sendResponse({ success: true })
    return true
  }
})
