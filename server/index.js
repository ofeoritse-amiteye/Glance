const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

const express = require('express')
const cors = require('cors')
const { buildPrompt, normalizeResult } = require('./prompt')

const PORT = Number(process.env.PORT) || 3000
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant'

const system ='You are a webpage summarizer. Always respond with valid JSON only. No markdown, no code blocks, no explanation — just raw JSON.'

async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey || !apiKey.trim()) {
    const err = new Error('Server is missing GROQ_API_KEY')
    err.code = 'NO_SERVER_KEY'
    throw err
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ]
    })
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const e = new Error(err.error?.message || `Groq HTTP ${response.status}`)
    e.status = response.status
    throw e
  }

  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content
  if (typeof raw !== 'string' || !raw.trim()) {
    const e = new Error('Model returned empty content')
    e.code = 'NO_CANDIDATES'
    throw e
  }
  const clean = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  let parsed
  try {
    parsed = JSON.parse(clean)
  } catch {
    const e = new Error('Model returned invalid JSON')
    e.code = 'JSON_PARSE_ERROR'
    throw e
  }

  return parsed
}

const app = express()
app.use(
  cors({
    origin: true,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
  })
)
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.post('/api/summarize', async (req, res) => {
  try {
    const { content, title, mode } = req.body || {}
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'content is required' })
    }
    const t = typeof title === 'string' ? title : ''
    const modeKey = typeof mode === 'string' ? mode : 'full'
    const prompt = buildPrompt(content, t, modeKey)
    const parsed = await callGroq(prompt)
    const result = normalizeResult(parsed, modeKey)
    res.json(result)
  } catch (e) {
    if (e.code === 'NO_SERVER_KEY') {
      return res.status(503).json({ error: 'SERVICE_MISCONFIGURED', message: e.message })
    }
    if (e.code === 'JSON_PARSE_ERROR' || e.code === 'NO_CANDIDATES') {
      return res.status(422).json({ error: e.code, message: e.message })
    }
    const status = e.status
    if (status === 401) {
      return res.status(401).json({ error: 'INVALID_API_KEY', message: 'Groq rejected the server key' })
    }
    if (status === 429) {
      return res.status(429).json({ error: 'RATE_LIMITED', message: e.message || 'Rate limited' })
    }
    console.error(e)
    res.status(500).json({
      error: 'API_ERROR',
      message: e.message || 'Summarization failed'
    })
  }
})

app.listen(PORT, () => {
  console.log(`Glance proxy listening on http://127.0.0.1:${PORT}`)
  console.log('POST /api/summarize  (expects GROQ_API_KEY in environment)')
})
