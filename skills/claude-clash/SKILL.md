---
name: claude-clash
description: 为本机 Clash Verge Rev（Mihomo 内核）自动配置并验收 Claude / Claude Code 专属防风控分流规则、DNS 防泄露、IPv6 封堵与 WebRTC UDP 防泄露，并使用 ip.net.coffee/claude 进行全套纯净度与防泄漏检验。严格遵循「修改网络前必须先关闭 Claude」的安全铁律。当用户要求配置或检查 Clash 的 Claude 分流规则、修复 DNS/WebRTC 泄露或进行 Claude 网络环境检测时使用。
---

# Claude-Clash 自动配置与 `ip.net.coffee` 闭环验收指南

你的任务是帮助用户检查并完善本机 **Clash Verge Rev（Mihomo 内核）** 的配置，使 **Claude / Claude Code 分流规则、DNS 防泄露、WebRTC UDP 防护、IPv6 封堵及系统时区** 达到最佳防风控状态，同时**完整保留用户已有的自定义直连/代理规则**，并通过 `ip.net.coffee/claude/` 完成全套指标验收。

- **技术参考标准**：
  - Claude AI IP 风险检测专页：<https://ip.net.coffee/claude/>
  - Claude Code 域名分流规则大全：<https://ip.net.coffee/claude/site.html>
  - Claude Code 稳定使用指南（11 项关键配置）：<https://ip.net.coffee/claude/claudecode.html>
- **仓库内置文件**：
  - 详细设计原理与故障排查手册：[references/design-and-troubleshooting.md](references/design-and-troubleshooting.md)
  - 通用全局扩展脚本模板：[templates/Script.js](templates/Script.js)
  - 环境检测与 `ip.net.coffee` 自动化检验脚本：[scripts/check-env.sh](scripts/check-env.sh)

---

## ⚠️ 最高安全铁律（必须严格遵守）

1. **【第一铁律】修改网络设置或切换节点前，必须确保 Claude 处于完全关闭状态！**
   - 在让用户保存/重载 Clash 脚本、切换代理节点、开关 TUN 虚拟网卡之前，**必须先检查并提醒用户完全关闭所有 Claude 相关进程与页面**（包括：Claude 桌面客户端 `Claude.app`、终端里的 `claude` / Claude Code CLI 进程、以及浏览器中打开的 `claude.ai` / `console.anthropic.com` 标签页）。
   - **原因**：Claude 与 Sentry/Statsig/Datadog 存在长连接（SSE / Keep-Alive）与持续遥测上报；若在 Claude 运行中途切换网络或重载规则，会导致同一会话内出口 IP 瞬间跳变或短暂直连暴露，极易立即触发风控封号。
2. **绝不泄露或打印用户隐私信息**：
   - 在对话中**严禁**输出用户订阅文件中的机场订阅链接（`url`）、节点服务器地址（`server`）、密码（`password`）、UUID 或 Token。
   - 只关注策略组名称、节点显示名称、`dns` 配置段与 `rules` 规则段。
3. **完整保留用户已有的自定义规则**：
   - 修改全局扩展脚本 `Script.js` 前，必须先读取用户现有的 `Script.js` 及当前订阅挂载的局部 `script` 文件，提取用户自己写的直连规则（如校园网、学术论文数据库、国内网站、专用 `nameserver-policy`），合并到新脚本中，**绝不能直接暴力覆盖清空用户的个人规则**。
4. **坚持使用全局扩展脚本（`Script.js`）并消除局部脚本冲突**：
   - 第三方订阅会定期自动更新覆盖原文件，因此所有规则与 DNS 修改必须写入全局 `profiles/Script.js`。
   - 检查 `profiles.yaml` 中当前激活订阅是否挂载了局部 `option.script`。由于局部脚本在全局 `Script.js` **之后**执行，若局部脚本会覆盖 `config.rules` 或 `config.dns`，必须将其自定义内容合并进全局 `Script.js`，并将局部脚本改为透传（`function main(config) { return config; }`）。

---

## 第一步：运行环境体检与 Claude 进程安全检查

### 1.1 各系统 Clash Verge Rev 配置目录路径

- **macOS**：`~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/`
- **Windows**：`%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\`
- **Linux**：`~/.local/share/io.github.clash-verge-rev.clash-verge-rev/`

### 1.2 执行只读诊断与 `ip.net.coffee` 检测脚本

在终端运行本 Skill 自带的只读诊断脚本：

```bash
bash "<本SKILL所在目录>/scripts/check-env.sh"
```

该脚本会自动完成：
0. 检查本机是否有正在运行的 `Claude` 客户端或 `claude` CLI 进程（输出 `CLAUDE_RUNNING`）；
1. 检查 Clash Verge Rev 配置目录、`verge.yaml`（`enable_tun_mode` / `enable_dns_settings`）、`clash-verge.yaml`，并提取当前订阅中所有可用非禁区节点名称（自动按「推荐-家宽/原生节点」与「其他可用节点」分类）；
2. 检查本机系统时区是否为 `Asia/Shanghai`（中国大陆时区警告）及公网 IPv6 状态；
3. 自动调用 `ip.net.coffee/claude/` 同款接口检测当前的三出口 IP、Claude 出口 **Trust Score 信任评分（0~100）**、**是否家庭住宅 IP (ISP)**、**DNS 泄露结果** 以及 **WebRTC STUN UDP 出口是否与 TCP 出口一致**。

---

## 第二步：向用户展示可用节点并让用户选择（交互确认）

1. 根据第一步扫描出的节点列表（已自动排除香港 `HK`、澳门 `MO`、中国大陆 `CN`、俄罗斯 `RU`、白俄罗斯 `BY` 等 Anthropic 不支持地区），向用户清晰列出：
   - **推荐的家宽/住宅/原生 ISP 节点**（若订阅中包含此类节点，优先推荐）；
   - **其他支持地区的代表性节点**（如台湾、日本、美西、新加坡等，遵循「亚洲→亚洲 > 亚洲→美西」短路径原则）。
2. **询问并等待用户选择**：
   - 询问用户希望将哪个节点作为 `🦀 Claude` 策略组的默认首选节点（以及策略组内是「仅放入家宽节点」还是「放入全部非禁区节点供手动切换」）。
   - 同时提醒用户：**确认已经关闭 Claude 客户端、终端 `claude` 进程及浏览器 `claude.ai` 页面**后再进入下一步写入与生效。
   - （若用户在提问时已明确指定了节点名称，则直接采用用户的指定）。

---

## 第三步：提炼写入全局扩展脚本（`profiles/Script.js`）

以 [templates/Script.js](templates/Script.js) 为基准，融合 `site.html`（全量分流规则）与 `claudecode.html`（11 项关键配置），并保留用户在原脚本中的自定义直连规则，更新 `profiles/Script.js`。

### 核心配置提炼清单（均已内置于 `templates/Script.js`）：

1. **全局防风控基础参数（对应 `claudecode.html` 关键配置 #4, #6）**：
   - **模拟浏览器 TLS 指纹**：`config["client-fingerprint"] = "chrome"`；
   - **严格禁用 IPv6**：`config.ipv6 = false` 且 `config.dns.ipv6 = false`（防止 IPv6 绕过代理直连、避免双栈 IP 分裂及 Happy Eyeballs 首次请求超时卡顿）。
2. **独立的 `🦀 Claude` 手动选择策略组（对应关键配置 #1, #2, #7）**：
   - 类型固定为 `select`（手动固定节点，严禁使用 `url-test` 或 `load-balance` 导致会话中途频繁跳 IP）；
   - 自动排除 `CN/HK/MO/RU/BY/KP/IR/SY/CU` 等受限地区节点，将用户选定的家宽/原生节点置顶。
3. **全量 Claude & 遥测前置分流规则（参考 `site.html` + 关键配置 #8 规则置顶）**：
   - **核心域名（`DOMAIN-SUFFIX`）**：`anthropic.com`, `claude.ai`, `claude.com`, `clau.de`, `claude.dev`, `claude.app`, `claudemcpclient.com`, `claudemcpcontent.com`, `claudeusercontent.com`
   - **CDN 与基础设施（`DOMAIN`）**：`servd-anthropic-website.b-cdn.net`, `anthropic.com.cdn.cloudflare.net`
   - **认证与内容系统（`DOMAIN`）**：`anthropic.auth0.com`, `anthropic-com.ghost.io`, `challenges.cloudflare.com`
   - **监控、A/B 测试与性能遥测（`DOMAIN-SUFFIX` / `DOMAIN`）**：`sentry.io`, `statsig.com`, `statsigapi.net`, `featuregates.org`, `featureassets.org`, `segment.io`, `datadoghq.com`, `browser-intake-us5-datadoghq.com`（注意：该域名含连字符，后缀 `datadoghq.com` 无法匹配，必须精确匹配）
   - **客服与统计组件（`DOMAIN-SUFFIX` / `DOMAIN`）**：`intercom.io`, `intercomcdn.com`, `cdn.usefathom.com`
   - **关键词兜底（`DOMAIN-KEYWORD`）**：`claude`, `anthropic`, `datadog`（覆盖 us3/eu1/ap1 节点）, `sentry`, `sift`（Sift 反欺诈检测）
   - **官方 IP 段兜底（`IP-CIDR` / `IP-CIDR6`，带 `no-resolve`）**：`160.79.104.0/21`（覆盖 AS399358 全量 2048 个 IPv4）、`2607:6bc0::/32`（全量 IPv6）
   - **冲突清理**：自动剔除原订阅中将 `api.statsig.com`、`sentry.io`、`datadoghq.com` 分流至广告拦截组或其他代理组的冲突规则。
4. **强制 TCP 与 WebRTC STUN 防泄露（对应关键配置 #3）**：
   - 许多机场的「家宽节点」采用**「前置机房中转 + 家宽链式落地」**架构：TCP 走家宽 IP，但 UDP 直接从前置机房出站，导致 `ip.net.coffee/claude/` 报 `WebRTC UDP 出口异常`。
   - 默认将 `STUN_MODE` 设为 `"REJECT"`：从 `fake-ip-filter` 中移除 `stun.*`，并在规则中将 `stun.l.google.com`、`stun1~4.l.google.com`、`stun.cloudflare.com` 及端口 `3478`、`19302` 设为 `REJECT`。既不禁用浏览器 `RTCPeerConnection` API（不破坏浏览器指纹），又在网络层彻底阻断不一致的 UDP 机房 IP 泄露。
5. **DNS 必须走代理且防国内泄露（对应关键配置 #5）**：
   - 开启 `respect-rules: true`、`prefer-h3: false`、`enhanced-mode: "fake-ip"`；
   - 将上述所有 Claude 核心、认证、CDN、遥测域名在 `nameserver-policy` 中绑定到 `https://1.1.1.1/dns-query#🦀 Claude` 和 `https://8.8.8.8/dns-query#🦀 Claude`；
   - 为订阅末尾所有 `GEOIP,CN` 规则自动追加 `,no-resolve`，封堵动态子域名 DNS 泄露。
6. **语法校验**：
   - 写入后运行 `node -c "<Script.js路径>"` 确认语法无误。

---

## 第四步：客户端设置检查与系统时区优化

1. **确认 Claude 已关闭后触发配置生效**：
   - 再次确认 Claude 客户端、CLI 与网页已关闭；
   - 请用户在 Clash Verge Rev 的「全局扩展脚本」点击 **「保存」**（或在「订阅」页右键当前订阅点击 **「使用」**）。
2. **检查 TUN 模式与 DNS 覆写**：
   - `verge.yaml` 中 `enable_tun_mode` 必须为 `true`（开启「虚拟网卡模式」），`enable_dns_settings` 必须为 `false`（关闭「DNS 覆写」以免覆盖脚本的 `nameserver-policy`）。
3. **系统时区优化建议（解决 `ip.net.coffee/claude/` 的大陆时区黄标警告与 Claude Code 隐写标记）**：
   - 若 `check-env.sh` 检测到系统时区为 `Asia/Shanghai`：
   - 告知用户：Claude Code (2.1.91+) 及网页端会读取系统 IANA 时区名称；可将系统时区改为同样是 **UTC+8（东八区，电脑显示时间分秒不差）** 的 **`Asia/Taipei`（台北）** 或 **`Asia/Singapore`（新加坡）**：
     - macOS 一键修改命令：`sudo systemsetup -settimezone Asia/Taipei`（或在「系统设置 → 通用 → 日期与时间」中将最近城市改为台北/新加坡）。

---

## 第五步：使用 `ip.net.coffee/claude/` 进行最终闭环检验

1. **再次运行 `check-env.sh` 自动化检验**：
   ```bash
   bash "<本SKILL所在目录>/scripts/check-env.sh"
   ```
   核对终端输出的 `[ip.net.coffee Claude 出口纯净度评分]`、`<token>.d.ip.net.coffee` DNS 泄露测试、以及 STUN UDP 状态。
2. **引导用户在浏览器打开 <https://ip.net.coffee/claude/> 核对全绿指标**：
   - **三出口 IP**：中国出口 IPv4（国内直连） / Cloudflare 出口 IP（常规代理） / Claude AI 出口 IP（`🦀 Claude` 专线节点）分流清晰；
   - **Claude AI 信任评分 (Trust Score)**：优先选择 **95~100 分（极度纯净）** 的家庭住宅 IP (`ISP`)；
   - **DNS 泄露检测**：显示绿色 **「未检测到泄露」**；
   - **WebRTC UDP 泄露检测**：显示绿色 **「WebRTC 已禁用或无泄露」**（或 UDP 出口与 Claude 出口完全一致）；
   - **用户设备信息**：时区无大陆时区黄标警告。
