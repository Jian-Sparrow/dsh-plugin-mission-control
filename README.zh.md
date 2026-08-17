# DeepSeek Harness Mission Control

面向当前 DeepSeek Harness Session 的实时可观测插件。Mission Control 将 Agent 状态、Tool 调用、进程内子代理协作和权威 Token 计数，呈现为 DSH Web 内置的全屏控制面板。

[English](./README.md)

## 能看到什么

- 全局 HUD：连接状态、总 Token、四类 Token、近期 Token 速度、人民币预估费用、Agent 数、运行中 Tool 数和诊断数。
- 以当前 Session 为根的可选择 Agent 拓扑。选择某个 Agent 后，Token 汇总和 Tool 流都会随之过滤。
- Tool 实时流：归属 Agent、耗时、结果状态、有限行数和可选载荷预览。
- 两个原生入口：当前 Session 顶部和 DSH Web 侧边栏底部。

Mission Control **只做实时直播**。进入页面时只打开一条同源 SSE 订阅；重连期间保留最后一次快照；关闭页面、切换 Session、卸载插件或浏览器断开时释放订阅。它不会向模型上下文增加 Tool、提示词或隐藏思考内容。

## 环境要求

- DeepSeek Harness `0.1.0-rc.6`
- DSH Web profile
- Node.js `^22.19.0` 或 `>=24.0.0`
- 通过 Corepack 使用 pnpm

## 安装

把 bundle 安装到 Web profile，检查组合结果，然后启动 DSH Web：

```sh
dsh plugin --profile web add dsh-plugin-mission-control
dsh --profile web --dump-config
dsh --profile web
```

该包会通过 bundle 插入一条 Cordis 配置，等价于：

```yaml
- id: mission-control
  name: dsh-plugin-mission-control
  config:
    previewMode: names-only
    tokenPublishIntervalMs: 250
    velocityWindowMs: 5000
    maxLiveRows: 300
```

如需修改参数，请在 profile 或 home 级 `cordis.patch.yml` 中完整覆盖 `mission-control` 这一行。使用本地源码时可执行 `dsh plugin --profile web add ./dsh-plugin-mission-control`。

## 使用

在 DSH Web 中启动或打开一个 Session，然后点击 Session 顶部的 **Mission Control**，或使用侧边栏“设置”旁的 **◎ Mission Control**。没有选中 Session 时，侧边栏入口会禁用。关闭面板后，焦点会回到原入口；切换 Session 会关闭旧面板，也不会自动为新 Session 打开订阅。

HUD 中的 Token 来自 Harness token-meter 投影：

- **输入**：未命中缓存的输入 Token。
- **输出**：模型生成的输出 Token。
- **缓存读取**：由模型服务缓存提供的输入 Token。
- **缓存写入**：写入模型服务缓存的输入 Token。
- **近期 Token/s**：配置时间窗内权威总量的变化速度；它是活动速度，不是计费估算。

## 费用估算

Mission Control 只对版本化目录中精确匹配的 `deepseek-official` 路由进行离线估算。每个 `turn`/`step` 都按其记录的 provider 和 model 归因，因此切换模型不会重新计算之前的费用。同一步骤的最终 usage 会替换流式阶段的早期 usage，不会重复计数。

当前版本内置的目录于 2026-08-17 对照 [DeepSeek 官方价格页](https://api-docs.deepseek.com/quick_start/pricing)核验：

- `deepseek-v4-flash`：缓存命中 $0.0028/M、缓存未命中 $0.14/M、输出 $0.28/M。
- `deepseek-v4-pro`：缓存命中 $0.003625/M、缓存未命中 $0.435/M、输出 $0.87/M。
- 缓存写入：两个目录路由均按 $0/M；DeepSeek 没有为这些路由公布单独的缓存写入价格。
- 参考换算：1 USD = 6.7894 CNY（2026-07-31），来源为[中国人民银行授权的人民币汇率中间价公告](https://fec.mofcom.gov.cn/article/zyfw/jrfw/jrfwywzn/jrfwwh/hlfxglzy/202607/7208.html)。

每个已计价步骤使用公式：`USD = 未缓存输入 × 缓存未命中单价 + 缓存读取 × 缓存命中单价 + 缓存写入 × 0 + 输出 × 输出单价`，Token 数均除以一百万；未舍入的美元小计再按内置参考汇率换算成人民币。所有已观察步骤都能精确计价时显示完整估算；部分步骤无法计价时显示“部分估算”；没有任何已观察步骤可计价时显示“暂无报价”。未知 provider、模型别名、未知模型和缺少请求路由的步骤不会被当作免费使用。

**仅为估算，不是实际账单。** 金额不包含税费、账户专属条款、促销、提供方舍入规则或账单调整；插件运行时也不会查询账户或计费接口。

## 隐私与预览

`previewMode` 控制 Tool 载荷的可见范围：

- `names-only`（默认）：只显示 Tool 名称、归属、时间和结果状态，不为展示传输参数和结果。
- `redacted`：显示有长度限制的参数与结果摘要，并替换配置的敏感字段和疑似凭据文本。脱敏是尽力而为，**不是安全边界**。
- `full`：在传输限制内显示完整的已记录 Tool 参数和结果，面板会持续显示警告。

面板绝不显示模型隐藏思维链。它只呈现 Harness 已记录的 Session 事实：Agent 状态、Tool 活动、子代理标签、响应状态和 Token 投影。

网络暴露由 DSH Web 负责。Mission Control 使用同源接口，并继承 Web profile 的监听地址、trusted-host 校验、认证、反向代理行为和局域网风险。不要为了查看面板而把 DSH Web 暴露到不可信网络。

## 配置

| 字段 | 默认值 | 有效范围 | 含义 |
| --- | ---: | --- | --- |
| `previewMode` | `names-only` | `names-only`、`redacted`、`full` | Tool 载荷可见范围 |
| `maxPreviewBytes` | `2048` | `128..65536` | 每个预览值的最大字节数 |
| `sensitiveFieldNames` | 常见凭据字段名 | 字符串数组 | redacted 模式下不区分大小写移除的对象键 |
| `tokenPublishIntervalMs` | `250` | `50..5000` | Token 更新合并间隔 |
| `velocityWindowMs` | `5000` | `1000..60000` | 近期 Token 速度的滚动时间窗 |
| `maxLiveRows` | `300` | `50..2000` | 每个观看周期保留的最大 Tool 行数 |
| `maxPendingFrames` | `64` | `8..512` | 每个订阅者最多排队的 SSE 帧数 |

Cordis 插件加载时会校验所有字段，非法配置会直接报错。

## 子代理与限制

进程内、Session-backed 的子代理会作为后代节点出现，并与根 Agent 一样读取权威投影。无法读取的 Session 会保留为“不可用”。没有发布 Harness Session 事件的外部或进程隔离 Agent 是不透明的；Mission Control 不会推断它们的隐藏活动。

当前版本只观察当前 Session 及其 Session-backed 后代，不提供历史回放、跨 Session 汇总、分布式追踪、提供方账单核对或独立 Web 服务。Tool 行数有内存上限；重新打开面板会开始新的观看周期。

## 故障排查

- **看不到入口：**确认 `dsh --profile web --dump-config` 包含 `mission-control` 行，安装 bundle 后重启 DSH Web。
- **侧边栏入口禁用：**先选择一个 Session。
- **页面一直显示“正在重连”：**在浏览器 Network 面板检查 `/plugins/mission-control/events`；保持同源，并检查反向代理的缓冲与超时配置。
- **没有子代理节点：**确认 provider 创建的是进程内、Session-backed 子代理；不透明外部 Agent 无法展开。
- **Token 不变化：**当前组合必须包含 Harness token-meter 和 Session projection 服务；缺少必需服务时插件会加载失败。
- **看不到载荷：**`names-only` 是隐私默认值。完整覆盖 Cordis 行后才能切换模式。

## 开发

```sh
pnpm install
pnpm run verify:release
pnpm pack --dry-run
```

宿主 ESM 入口是 `dsh-plugin-mission-control`；DSH Web 通过浏览器模块加载器读取 `dsh-plugin-mission-control/client`。浏览器 bundle 会外置 React 和 Cordis 提供的运行时。

每次发布前，维护者必须核验两个官方来源；需要时同步更新 `src/pricing.ts` 的数值、revision 和日期；同时更新精确目录测试与中英文 README；并运行 `pnpm run verify:release`。不得引入运行时价格或汇率抓取。

## 许可证

MIT
