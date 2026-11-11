# Claude-Clash 设计原理、11 项关键配置与故障排查手册

本文档提炼自以下核心技术标准与实测经验：
- **Claude AI IP 风险检测专页**：<https://ip.net.coffee/claude/>
- **Claude Code 域名分流规则大全**：<https://ip.net.coffee/claude/site.html>
- **Claude Code 稳定使用指南（11 项关键配置）**：<https://ip.net.coffee/claude/claudecode.html>
- **为什么不建议用 IPv6 访问 Claude Code**：<https://ip.net.coffee/claude/ipv6.html>

---

## 0. 最高安全前提：修改网络前必须关闭 Claude

在执行任何 Clash 配置保存、订阅刷新、节点切换或虚拟网卡（TUN）开关操作之前，**必须确保本机所有 Claude 客户端（`Claude.app`）、终端 `claude` (Claude Code CLI) 进程以及浏览器中的 `claude.ai` / `console.anthropic.com` 标签页均已完全关闭**。

- **技术原因**：Claude Web 与 Claude Code 在运行期间会维持 SSE / HTTP/2 长连接，并周期性向 `sentry.io`、`statsigapi.net`、`browser-intake-us5-datadoghq.com` 发送遥测心跳。若在会话活跃时重载 Clash 或切换节点，会导致**同一 Session ID 在几毫秒内发生跨国/跨机房 IP 跳变**，甚至在 TUN 重建瞬间发生直连泄露，这是触发账号封禁的高危诱因。

---

## 1. 全量域名与 IP 分流体系（源自 `site.html`）

Claude 与 Claude Code 在运行时不仅请求主域名，还会并发请求 CDN、OAuth 认证、错误监控与反欺诈服务。任何一条漏进直连或其他节点，都会造成「主站 IP 与遥测 IP 分裂」。

| 类别 | 域名 / 规则 | 用途与关键说明 |
| :--- | :--- | :--- |
| **核心域名** (`DOMAIN-SUFFIX`) | `anthropic.com`, `claude.ai`, `claude.com`, `clau.de`, `claude.dev`, `claude.app`, `claudemcpclient.com`, `claudemcpcontent.com`, `claudeusercontent.com` | 覆盖主站、API、MCP 通信、用户上传内容及 `cdn/mcp/console/workbench.anthropic.com` 所有子域名 |
| **CDN 与边缘节点** (`DOMAIN`) | `servd-anthropic-website.b-cdn.net`, `anthropic.com.cdn.cloudflare.net` | BunnyCDN 静态资源与 Cloudflare CNAME 边缘域名 |
| **身份认证与内容** (`DOMAIN`) | `anthropic.auth0.com`, `anthropic-com.ghost.io`, `challenges.cloudflare.com` | Auth0 OAuth 登录认证（不受 `anthropic.com` 后缀覆盖，必须单列）、官方博客 CMS、Cloudflare Turnstile 人机验证 |
| **监控、遥测与风控** (`DOMAIN-SUFFIX` & `DOMAIN`) | `sentry.io`, `statsig.com`, `statsigapi.net`, `featuregates.org`, `featureassets.org`, `segment.io`, `datadoghq.com`, `browser-intake-us5-datadoghq.com` | **特别注意**：`browser-intake-us5-datadoghq.com` 根域名带连字符，`DOMAIN-SUFFIX,datadoghq.com` 无法命中，必须精确匹配；同时必须从机场广告拦截组中剔除 `api.statsig.com` |
| **关键词兜底** (`DOMAIN-KEYWORD`) | `claude`, `anthropic`, `datadog`, `sentry`, `sift` | 兜底 Datadog 其他区域节点（us3/eu1/ap1）、Sentry 及 Sift 反欺诈检测 |
| **客服与统计** (`DOMAIN-SUFFIX` & `DOMAIN`) | `intercom.io`, `intercomcdn.com`, `cdn.usefathom.com` | 在线客服组件与 Fathom 统计，保持与主站同出口 |
| **官方 IP 段兜底** (`IP-CIDR` / `IP-CIDR6`) | `160.79.104.0/21,no-resolve`, `2607:6bc0::/32,no-resolve` | 覆盖 Anthropic 官方自治系统 `AS399358` 全量 2048 个 IPv4 地址及 IPv6 地址段，应对加密 DNS / ECH 未命中域名的情况 |

---

## 2. Claude Code 稳定使用 11 项关键配置（源自 `claudecode.html`）

核心原则：**让网络环境表现得尽可能像普通海外家庭宽带用户。**

1. **出口 IP 质量第一**：
   - 优先级：**家庭宽带/住宅 ISP（最优，Trust Score 95~100）** > 高质量原生 VPS IP > 云厂商机房 IP（AWS/GCP/Azure 极易受同段连带风控） > 万人骑共享代理（严禁）。
2. **IP 稳定性策略**：
   - **机房 IP 严禁频繁跳变**；策略组必须使用手动固定选择（`select`），**严禁**对 Claude 使用 `url-test`（自动测速切换）或 `load-balance`（负载均衡）。
3. **强制 TCP，远离 UDP（解决机场链式家宽 UDP 出口分裂）**：
   - Claude 底层为 HTTPS（TCP）。许多机场的「家宽节点」采用**「前置机房中转 + 家宽链式落地」**架构：TCP 流量被转发至中华电信等家宽 IP，但 UDP 流量未进家宽隧道而是直接从前置机房出站。
   - 若放行 WebRTC STUN UDP 请求，浏览器会暴露前置机房的 Datacenter IP，导致在 `ip.net.coffee/claude/` 上报 **「WebRTC UDP 泄露：可能泄露 / UDP 出口异常」**。
   - **解决方案**：在 `Script.js` 中默认设置 `STUN_MODE = "REJECT"`，从 `fake-ip-filter` 中移除 `stun.*`，并将 STUN 域名与端口（`3478`、`19302`）设为 `REJECT`。这样无需禁用浏览器 `RTCPeerConnection` API（不破坏浏览器指纹），即可在网络层阻断不一致的 UDP 出口暴露。
4. **TLS 指纹模拟浏览器**：
   - 在 Mihomo 全局配置中设置 `client-fingerprint: chrome`，避免代理客户端裸握手特征。
5. **DNS 必须走代理且防泄露**：
   - 在 `nameserver-policy` 中将所有 Claude 及关联域名绑定至 `https://1.1.1.1/dns-query#🦀 Claude` 和 `https://8.8.8.8/dns-query#🦀 Claude`，开启 `respect-rules: true`。
   - 为订阅末尾的 `GEOIP,CN` 规则强制加上 `,no-resolve`，防止访问未知海外域名（如 `*.d.ip.net.coffee`）时触发国内 DoH 解析而暴露国内 DNS 出口。
6. **严格禁用 IPv6（`ipv6: false`）**：
   - 双栈环境下存在 Happy Eyeballs 竞争导致首次请求卡顿，且部分客户端仅对 IPv4 分流而让 IPv6 直连泄露。在 `Script.js` 中设置 `config.ipv6 = false` 和 `config.dns.ipv6 = false`，强制仅解析和使用 IPv4。
7. **Claude 单独分流**：
   - 建立独立的 `🦀 Claude` 策略组，与日常浏览网页的通用代理组解耦。
8. **规则置顶，不混入智能分流**：
   - 将 `claudeRules` 置于 `config.rules` 最顶部，高于一切 `GEOSITE` 或通用泛规则。
9. **保持连接复用**：
   - 保持 TCP Keep-Alive 与 HTTP/2 连接复用，避免每次请求重建握手。
10. **控制并发请求**：
    - 单一出口 IP 下并发请求建议控制在 **5 个以内**。
11. **网络路径要短且干净**：
    - 物理距离优先级：**亚洲 → 亚洲（如台湾/日本/新加坡家宽，延迟低）** > 亚洲 → 美西 > 避免跨欧洲绕路。

---

## 3. 常见故障排查表

| 现象 | 原因 | 解决方法 |
| :--- | :--- | :--- |
| 修改 `Script.js` 保存后，`clash-verge.yaml` 里没有新规则 | 当前订阅在 `profiles.yaml` 中还挂载了订阅级局部 `option.script`，其在全局 `Script.js` 之后执行并过滤掉了新增规则 | 将局部脚本中的个人规则合并至全局 `Script.js`，并将局部脚本改为 `function main(config) { return config; }` |
| `ip.net.coffee/claude/` 显示 **WebRTC UDP 出口异常**（IP 与 Claude 出口不一致） | 所选机场节点为「链式落地家宽」（TCP 走家宽 IP，UDP 从前置机房 IP 出站） | 在 `Script.js` 中保持 `STUN_MODE = "REJECT"`，保存重载后刷新网页即变为绿色「WebRTC 已禁用或无泄露」 |
| `ip.net.coffee/claude/` 顶部「中国出口 IPv4」显示成了国外代理 IP | 原订阅规则未将国内测速源 `2026.ip138.com` / `my.ip.cn` 设为直连，落入了末尾 `MATCH` 代理 | `Script.js` 已默认将 `ip138.com` 和 `ip.cn` 加入 `CUSTOM_DIRECT_SUFFIXES` 直连规则 |
| `ip.net.coffee/claude/` 报 **DNS 可能泄露（CN）** | 1. 订阅末尾 `GEOIP,CN` 未带 `no-resolve`；<br>2. Clash Verge 开启了「DNS 覆写」覆盖了脚本设置 | 1. 确保 `Script.js` 已为 `GEOIP,CN` 追加 `,no-resolve`；<br>2. 在「设置 → Clash 设置 → DNS 覆写」中关闭覆写开关 |
| `claude.ai` 卡在白屏或报错 `api.statsig.com` 连接失败 | 机场订阅自带的广告拦截规则包含 `DOMAIN,api.statsig.com,🛑 广告过滤` | `Script.js` 已自动过滤剔除原订阅中的 `api.statsig.com`、`sentry.io`、`datadoghq.com` 冲突规则 |
