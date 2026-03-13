import { Context, Schema } from 'koishi'
import type { Session } from 'koishi'

export const name = 'aka-ibkr-agent'
export const inject = ['http'] as const

type ResponseMode = 'brief' | 'full' | 'push'

interface AnalyzeRequest {
  message: string
  mode: 'chat' | 'command'
  response_mode: ResponseMode
  account_scope: 'primary'
  allow_execution: boolean
}

interface AnalyzeResponse {
  status: 'ok'
  intent: string
  decision_level: string
  generation_source: string
  context_source: string
  context_error?: string | null
  upstream_status?: number | null
  upstream_error_code?: string | null
  upstream_error_message?: string | null
  executed: boolean
  text: string
  summary: string
  reason: string
  next_action: string
  action_id?: string | null
  requires_confirmation?: boolean
  expires_at?: string | null
  blockers?: string[]
}

type SessionLike = Session & {
  stripped?: {
    content?: string
  }
  user?: {
    authority?: number
  }
}

export interface Config {
  baseUrl: string
  timeout: number
  authToken: string
  defaultResponseMode: ResponseMode
  showDiagnostics: boolean
  minAuthority: number
  allowedUsers: string[]
  chatCommandName: string
  commandAliases: string[]
  enableMiddleware: boolean
  middlewarePrefixes: string[]
  middlewareResponseMode: ResponseMode
  allowDirectChat: boolean
  ignoreSelf: boolean
  privateOnly: boolean
  platforms: string[]
  channelWhitelist: string[]
}

const responseModeSchema: Schema<ResponseMode> = Schema.union([
  Schema.const('brief').description('适合常规聊天'),
  Schema.const('full').description('返回更完整文本'),
  Schema.const('push').description('适合转发和推送'),
]).role('radio')

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    baseUrl: Schema.string().default('http://127.0.0.1:8000').description('ibkr 服务基础地址'),
    timeout: Schema.number().min(1000).max(120000).default(30000).description('请求超时，单位毫秒'),
    authToken: Schema.string().role('secret').default('').description('可选 Bearer Token'),
    defaultResponseMode: responseModeSchema.default('brief').description('默认输出模式'),
    showDiagnostics: Schema.boolean().default(false).description('附加上游来源和错误信息'),
    minAuthority: Schema.number().min(0).max(5).default(4).description('最小 authority，默认仅管理员可用'),
    allowedUsers: Schema.array(String).role('table').default([]).description('额外允许的用户列表，支持 userId 或 platform:userId'),
  }).description('服务设置'),
  Schema.object({
    chatCommandName: Schema.string().default('ib').description('主聊天命令名'),
    commandAliases: Schema.array(String).role('table').default(['ibchat', 'ibkr']).description('兼容命令别名'),
  }).description('命令入口'),
  Schema.object({
    enableMiddleware: Schema.boolean().default(false).description('启用聊天式转发'),
    middlewarePrefixes: Schema.array(String).role('table').default(['ib ', 'ibkr ']).description('聊天触发前缀'),
    middlewareResponseMode: responseModeSchema.default('brief').description('聊天入口输出模式'),
    allowDirectChat: Schema.boolean().default(false).description('私聊允许不带前缀直接转发'),
    ignoreSelf: Schema.boolean().default(true).description('忽略机器人自身消息'),
    privateOnly: Schema.boolean().default(false).description('仅在私聊触发聊天转发'),
    platforms: Schema.array(String).role('table').default([]).description('允许触发的平台白名单，为空表示不限'),
    channelWhitelist: Schema.array(String).role('table').default([]).description('允许触发的频道白名单，格式 platform:channelId'),
  }).description('聊天入口'),
])

const RESPONSE_MODES = new Set<ResponseMode>(['brief', 'full', 'push'])

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger(name)
  const client = new IbkrClient(ctx, config)
  const commandNames = [config.chatCommandName, ...config.commandAliases].filter(Boolean)

  const chatCommand = ctx.command(`${config.chatCommandName} [message:text]`, '将自然语言请求转发给 ibkr 分析服务')
    .userFields(['authority'])
    .option('mode', '-m <mode:string> 指定输出模式 brief/full/push')
    .option('full', '-f 使用 full 输出')
    .option('push', '-p 使用 push 输出')
    .option('allowExecution', '-e 允许上游尝试进入执行分支')
    .option('diagnostics', '-d 本次显示诊断信息')
    .action(async ({ options, session }, message) => {
      const resolvedOptions = options ?? {}
      const permissionError = getPermissionError(session as SessionLike, config)
      if (permissionError) {
        return permissionError
      }

      const content = message?.trim()
      if (!content) {
        return '请输入要转发给 ibkr 的内容。'
      }

      const responseMode = resolveResponseMode(
        resolvedOptions.mode,
        resolvedOptions.full,
        resolvedOptions.push,
        config.defaultResponseMode,
      )
      const result = await client.analyze({
        message: content,
        mode: 'command',
        response_mode: responseMode,
        account_scope: 'primary',
        allow_execution: Boolean(resolvedOptions.allowExecution),
      })

      if (!result.ok) {
        return result.message
      }

      return renderResponse(result.data, shouldShowDiagnostics(config, resolvedOptions.diagnostics), session)
    })

  for (const alias of config.commandAliases) {
    chatCommand.alias(alias)
  }

  const healthCommand = ctx.command(`${config.chatCommandName}.health`, '检查 ibkr 服务健康状态')
    .userFields(['authority'])
    .action(async ({ session }) => {
      const permissionError = getPermissionError(session as SessionLike, config)
      if (permissionError) {
        return permissionError
      }

      const result = await client.health()
      if (!result.ok) {
        return result.message
      }
      return `ibkr 服务正常，状态：${result.data.status}`
    })

  for (const alias of config.commandAliases) {
    healthCommand.alias(`${alias}.health`)
  }

  if (!config.enableMiddleware) {
    logger.info('enabled, baseUrl=%s, middleware=off', normalizeBaseUrl(config.baseUrl))
    return
  }

  ctx.middleware(async (session, next) => {
    if (shouldSkipSession(session as SessionLike, config)) {
      return next()
    }

    const permissionError = getPermissionError(session as SessionLike, config)
    if (permissionError) {
      return next()
    }

    if (looksLikeCommandInvocation(session.content || '', commandNames)) {
      return next()
    }

    const message = extractMiddlewareMessage(session as SessionLike, config)
    if (!message) {
      return next()
    }

    const result = await client.analyze({
      message,
      mode: 'chat',
      response_mode: config.middlewareResponseMode,
      account_scope: 'primary',
      allow_execution: false,
    })

    if (!result.ok) {
      await session.send(result.message)
      return
    }

    await session.send(renderResponse(result.data, config.showDiagnostics, session))
  })

  logger.info('enabled, baseUrl=%s, middleware=on', normalizeBaseUrl(config.baseUrl))
}

class IbkrClient {
  constructor(
    private readonly ctx: Context,
    private readonly config: Config,
  ) {}

  async analyze(payload: AnalyzeRequest): Promise<{ ok: true, data: AnalyzeResponse } | { ok: false, message: string }> {
    try {
      const response = await this.ctx.http.post(this.buildUrl('/api/v1/analyze'), payload, {
        headers: this.buildHeaders(),
        timeout: this.config.timeout,
      }) as AnalyzeResponse

      if (!isAnalyzeResponse(response)) {
        return { ok: false, message: 'ibkr 返回了无法识别的响应结构。' }
      }

      return { ok: true, data: response }
    } catch (error) {
      return {
        ok: false,
        message: formatHttpError('调用 ibkr 分析接口失败', error),
      }
    }
  }

  async health(): Promise<{ ok: true, data: { status: string } } | { ok: false, message: string }> {
    try {
      const response = await this.ctx.http.get(this.buildUrl('/health'), {
        headers: this.buildHeaders(),
        timeout: this.config.timeout,
      }) as { status?: string }

      if (!response || typeof response.status !== 'string') {
        return { ok: false, message: 'ibkr /health 返回了无法识别的响应结构。' }
      }

      return { ok: true, data: { status: response.status } }
    } catch (error) {
      return {
        ok: false,
        message: formatHttpError('调用 ibkr health 接口失败', error),
      }
    }
  }

  private buildUrl(path: string) {
    return `${normalizeBaseUrl(this.config.baseUrl)}${path}`
  }

  private buildHeaders() {
    if (!this.config.authToken) {
      return undefined
    }

    return {
      authorization: `Bearer ${this.config.authToken}`,
    }
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '')
}

function resolveResponseMode(
  requestedMode: string | undefined,
  useFull: boolean | undefined,
  usePush: boolean | undefined,
  fallback: ResponseMode,
): ResponseMode {
  if (usePush) {
    return 'push'
  }

  if (useFull) {
    return 'full'
  }

  if (requestedMode && RESPONSE_MODES.has(requestedMode as ResponseMode)) {
    return requestedMode as ResponseMode
  }

  return fallback
}

function renderResponse(response: AnalyzeResponse, showDiagnostics: boolean, session?: Session) {
  const lines = [response.text.trim()]

  if (showDiagnostics) {
    lines.push(
      '',
      `intent=${response.intent}`,
      `decision_level=${response.decision_level}`,
      `generation_source=${response.generation_source}`,
      `context_source=${response.context_source}`,
    )

    if (response.context_error) {
      lines.push(`context_error=${response.context_error}`)
    }

    if (response.upstream_status) {
      lines.push(`upstream_status=${response.upstream_status}`)
    }

    if (response.upstream_error_code) {
      lines.push(`upstream_error_code=${response.upstream_error_code}`)
    }

    if (response.upstream_error_message) {
      lines.push(`upstream_error_message=${response.upstream_error_message}`)
    }
  }

  if (response.requires_confirmation && response.action_id && session) {
    lines.push('', `待确认动作：${response.action_id}`)
  }

  return lines.join('\n').trim()
}

function shouldShowDiagnostics(config: Config, perCall: boolean | undefined) {
  return config.showDiagnostics || Boolean(perCall)
}

function getPermissionError(session: SessionLike, config: Config) {
  if (isAllowedUser(session, config.allowedUsers)) {
    return ''
  }

  const authority = getAuthority(session)
  if (authority >= config.minAuthority) {
    return ''
  }

  return '权限不足，仅管理员或授权用户可使用此功能。'
}

function shouldSkipSession(session: SessionLike, config: Config) {
  if (config.ignoreSelf && session.userId && session.selfId && session.userId === session.selfId) {
    return true
  }

  const content = getSessionContent(session)
  if (!content) {
    return true
  }

  if (config.privateOnly && !isDirectSession(session)) {
    return true
  }

  if (config.platforms.length > 0 && !config.platforms.includes(session.platform)) {
    return true
  }

  if (config.channelWhitelist.length > 0) {
    const channelKey = buildChannelKey(session)
    if (!config.channelWhitelist.includes(channelKey)) {
      return true
    }
  }

  return false
}

function extractMiddlewareMessage(session: SessionLike, config: Config) {
  const content = getSessionContent(session)
  if (!content) {
    return ''
  }

  const prefixed = stripPrefix(content, config.middlewarePrefixes)
  if (prefixed !== null) {
    return prefixed
  }

  if (config.allowDirectChat && isDirectSession(session)) {
    return content
  }

  return ''
}

function getSessionContent(session: SessionLike) {
  return (session.stripped?.content || session.content || '').trim()
}

function stripPrefix(content: string, prefixes: string[]) {
  for (const prefix of prefixes) {
    if (content.startsWith(prefix)) {
      return content.slice(prefix.length).trim()
    }
  }

  return null
}

function looksLikeCommandInvocation(content: string, commandNames: string[]) {
  const normalized = content.trim()
  return commandNames.some((commandName) => (
    normalized === commandName
      || normalized.startsWith(`${commandName} `)
      || normalized.startsWith(`${commandName}.`)
  ))
}

function isDirectSession(session: SessionLike) {
  return !session.guildId
}

function getAuthority(session: SessionLike) {
  return typeof session.user?.authority === 'number' ? session.user.authority : -1
}

function isAllowedUser(session: SessionLike, allowedUsers: string[]) {
  if (!session.userId) {
    return false
  }

  const candidates = new Set([
    session.userId,
    `${session.platform}:${session.userId}`,
  ])

  return allowedUsers.some(user => candidates.has(user))
}

function buildChannelKey(session: SessionLike) {
  return `${session.platform}:${session.channelId || session.userId || 'unknown'}`
}

function isAnalyzeResponse(value: unknown): value is AnalyzeResponse {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<AnalyzeResponse>
  return candidate.status === 'ok'
    && typeof candidate.intent === 'string'
    && typeof candidate.decision_level === 'string'
    && typeof candidate.generation_source === 'string'
    && typeof candidate.context_source === 'string'
    && typeof candidate.text === 'string'
    && typeof candidate.summary === 'string'
    && typeof candidate.reason === 'string'
    && typeof candidate.next_action === 'string'
}

function formatHttpError(prefix: string, error: unknown) {
  if (error && typeof error === 'object') {
    const candidate = error as { message?: string, response?: { data?: unknown, status?: number } }
    const parts = [prefix]

    if (candidate.response?.status) {
      parts.push(`status=${candidate.response.status}`)
    }

    if (candidate.message) {
      parts.push(candidate.message)
    }

    if (candidate.response?.data && typeof candidate.response.data === 'object') {
      const data = candidate.response.data as { detail?: string, message?: string }
      if (typeof data.detail === 'string') {
        parts.push(data.detail)
      } else if (typeof data.message === 'string') {
        parts.push(data.message)
      }
    }

    return parts.join('，')
  }

  if (typeof error === 'string') {
    return `${prefix}，${error}`
  }

  return prefix
}
