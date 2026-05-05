/** Shared summarization prompt + result shaping (mirrors extension expectations). */

function buildPrompt(content, title, mode) {
  const baseInstructions = `You are a webpage summarizer. Analyze this page content and respond with ONLY valid JSON, no markdown, no code blocks, just raw JSON.

Page title: ${title}

Page content:
${content}

`

  if (mode === 'brief') {
    return (
      baseInstructions +
      `Respond with exactly this JSON structure:
{
  "summary": "",
  "bullets": [
    "Key point one",
    "Key point two",
    "Key point three"
  ],
  "insights": [],
  "readingTime": 3,
  "sentiment": "neutral"
}

Rules:
- brief mode: respond with only 3 bullet points. Leave summary as empty string. Leave insights as empty array.
- bullets: exactly 3 items, each a single clear sentence
- readingTime: integer minutes (estimate from word count)
- sentiment: one of "positive", "negative", "neutral", "mixed"`
    )
  }

  if (mode === 'eli5') {
    return (
      baseInstructions +
      `Explain this like I'm 10 years old: simple language, one short paragraph in summary.
Respond with exactly this JSON structure:
{
  "summary": "One friendly paragraph explaining the page in very simple terms",
  "bullets": [],
  "insights": [],
  "readingTime": 3,
  "sentiment": "neutral"
}

Rules:
- summary: one paragraph only, very simple words
- bullets and insights: empty arrays
- readingTime: integer minutes (estimate from word count)
- sentiment: one of "positive", "negative", "neutral", "mixed"`
    )
  }

  return (
    baseInstructions +
    `Respond with exactly this JSON structure:
{
  "summary": "3-5 sentence overview of what this page is about",
  "bullets": [
    "Key point one",
    "Key point two",
    "Key point three",
    "Key point four (optional)",
    "Key point five (optional)"
  ],
  "insights": [
    "One non-obvious insight or implication",
    "Another insight"
  ],
  "readingTime": 3,
  "sentiment": "neutral"
}

Rules:
- bullets: 3-5 items, each a single clear sentence
- insights: 2-3 items, must be genuinely insightful not just repetitions
- readingTime: integer minutes (estimate from word count)
- sentiment: one of "positive", "negative", "neutral", "mixed"`
  )
}

function normalizeResult(parsed, mode) {
  const out = {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map(String) : [],
    insights: Array.isArray(parsed.insights) ? parsed.insights.map(String) : [],
    readingTime:
      typeof parsed.readingTime === 'number' && Number.isFinite(parsed.readingTime)
        ? Math.max(1, Math.round(parsed.readingTime))
        : 3,
    sentiment:
      typeof parsed.sentiment === 'string' ? parsed.sentiment : 'neutral'
  }
  if (mode === 'brief') {
    out.summary = ''
    out.insights = []
    out.bullets = out.bullets.slice(0, 3)
  }
  if (mode === 'eli5') {
    out.bullets = []
    out.insights = []
  }
  return out
}

module.exports = { buildPrompt, normalizeResult }
