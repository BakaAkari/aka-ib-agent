const baseUrl = (process.env.TRADER_AGENT_BASE_URL || process.env.IBKR_AGENT_BASE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '')
const authToken = process.env.TRADER_AGENT_AUTH_TOKEN || process.env.IBKR_AGENT_AUTH_TOKEN || ''
const timeout = Number(process.env.TRADER_AGENT_TIMEOUT || process.env.IBKR_AGENT_TIMEOUT || 30000)
const message = process.env.TRADER_AGENT_MESSAGE || process.env.IBKR_AGENT_MESSAGE || '帮我看看今晚持仓风险'

const headers = {
  'content-type': 'application/json',
}

if (authToken) {
  headers.authorization = `Bearer ${authToken}`
}

async function withTimeout(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function printJson(label, value) {
  console.log(`${label}:`)
  console.log(JSON.stringify(value, null, 2))
}

async function main() {
  console.log(`smoke target: ${baseUrl}`)

  const healthResponse = await withTimeout(`${baseUrl}/health`)
  const health = await healthResponse.json()
  assert(healthResponse.ok, `/health failed with status ${healthResponse.status}`)
  assert(typeof health?.status === 'string', '/health missing status')
  printJson('health', health)

  const analyzeResponse = await withTimeout(`${baseUrl}/api/v1/analyze`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      mode: 'chat',
      response_mode: 'brief',
      account_scope: 'primary',
      allow_execution: false,
    }),
  })
  const analyze = await analyzeResponse.json()
  assert(analyzeResponse.ok, `/api/v1/analyze failed with status ${analyzeResponse.status}`)
  assert(analyze?.status === 'ok', 'analyze response missing status=ok')
  assert(typeof analyze?.intent === 'string', 'analyze response missing intent')
  assert(typeof analyze?.decision_level === 'string', 'analyze response missing decision_level')
  assert(typeof analyze?.text === 'string', 'analyze response missing text')
  assert(typeof analyze?.context_source === 'string', 'analyze response missing context_source')
  assert(typeof analyze?.generation_source === 'string', 'analyze response missing generation_source')
  printJson('analyze', {
    intent: analyze.intent,
    decision_level: analyze.decision_level,
    context_source: analyze.context_source,
    generation_source: analyze.generation_source,
    text: analyze.text,
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
