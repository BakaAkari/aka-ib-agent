# koishi-plugin-aka-ibkr-agent

对接 `ibkr` 分析服务的 Koishi 薄适配层。

这个插件只做三件事：

- 把 Koishi 命令或聊天消息转成 `ibkr` 的 `/api/v1/analyze` 请求
- 把 `ibkr` 返回的文本直接发回会话
- 在 `ibkr` 迭代过程中提供一个低成本 smoke 检查

## 当前边界

- 依赖 `ibkr` 当前的 `GET /health` 和 `POST /api/v1/analyze`
- 默认按只读分析使用
- 不在 Koishi 侧重复实现意图识别和交易逻辑
- 仅在上游真正产出确认字段后，再考虑确认执行流

## 配置

- `baseUrl`: `ibkr` 服务基础地址，默认 `http://127.0.0.1:8000`
- `timeout`: HTTP 超时，默认 `30000`
- `authToken`: 可选 Bearer Token
- `defaultResponseMode`: 命令默认输出模式
- `logLevel`: 插件日志级别，支持 `info` / `debug`
- `showDiagnostics`: 是否附加上游来源和错误信息
- `minAuthority`: 最小 authority，默认 `4`
- `allowedUsers`: 额外允许的用户列表，支持 `userId` 或 `platform:userId`
- `chatCommandName`: 主聊天命令名，默认 `ib`
- `commandAliases`: 兼容命令别名，默认包含 `ibchat`、`ibkr`
- `enableMiddleware`: 是否启用聊天式转发
- `middlewarePrefixes`: 聊天入口前缀，默认 `ib `、`ibkr `
- `middlewareResponseMode`: 聊天入口输出模式
- `allowDirectChat`: 私聊允许不带前缀直接转发
- `ignoreSelf`: 忽略机器人自身消息
- `privateOnly`: 仅在私聊触发聊天转发
- `platforms`: 平台白名单，为空表示不限
- `channelWhitelist`: 频道白名单，格式 `platform:channelId`

## 命令

```text
ib <message>
ib.health
```

默认还兼容：

```text
ibchat <message>
ibchat.health
ibkr <message>
ibkr.health
```

可选参数：

- `-m <mode>`: `brief` / `full` / `push`
- `-f`: 强制 `full`
- `-p`: 强制 `push`
- `-e`: 允许上游尝试进入执行分支
- `-d`: 本次附加诊断信息

## 权限

默认只允许 authority 不低于 `4` 的用户调用。

如果你希望授权固定用户，可以配置：

```yml
aka-ibkr-agent:xxxxxx:
  minAuthority: 4
  allowedUsers:
    - "onebot:123456789"
    - "987654321"
```

权限判断规则：

- 命中 `allowedUsers` 则允许调用
- 否则要求 `session.user.authority >= minAuthority`
- 命令入口和 middleware 都使用同一套权限逻辑

## 日志

可配置：

```yml
aka-ibkr-agent:xxxxxx:
  logLevel: info
```

可选值：

- `info`: 记录关键流程，例如命令调用、health 检查、HTTP 成功或失败
- `debug`: 在 `info` 基础上追加请求参数摘要、middleware 跳过原因、响应摘要等调试信息

当出现 `request timeout` 时，建议先切到 `debug`，再看插件日志里的：

- 实际请求 URL
- 请求模式和超时设置
- 失败时的错误摘要

## 联调

```sh
pnpm typecheck
pnpm build
pnpm run smoke
```

可选环境变量：

```sh
IBKR_AGENT_BASE_URL=http://127.0.0.1:8000
IBKR_AGENT_AUTH_TOKEN=
IBKR_AGENT_TIMEOUT=30000
IBKR_AGENT_MESSAGE=帮我看看今晚持仓风险
```

`smoke` 会检查：

- `/health` 是否可用
- `/api/v1/analyze` 是否仍返回关键字段

这样在 `ibkr` 迭代时，可以第一时间发现接口漂移。
