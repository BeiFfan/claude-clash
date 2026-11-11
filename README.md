# claude-clash

专为 **Clash Verge Rev（Mihomo 内核）** 设计的 **Claude / Claude Code 防风控分流、11 项关键网络配置、DNS 防泄露、WebRTC UDP 防护与 `ip.net.coffee` 闭环检验** 方案及 AI Agent Skill。

适用于使用第三方订阅（机场）或自建节点的用户：通过 Clash Verge Rev 的 **「全局扩展脚本 (`Script.js`)」**，在不破坏原订阅节点与用户自定义规则的前提下，自动建立独立的 `🦀 Claude` 策略组，完整落地 [Claude Code 域名分流规则大全](https://ip.net.coffee/claude/site.html) 与 [Claude Code 稳定使用 11 项关键配置](https://ip.net.coffee/claude/claudecode.html)，并内置基于 [Claude AI IP 风险检测专页 (`ip.net.coffee/claude`)](https://ip.net.coffee/claude/) 的全套自动化体检脚本。

> [!IMPORTANT]
> **最高安全铁律：在修改 Clash 配置、保存扩展脚本、切换节点或开关虚拟网卡（TUN）之前，请务必确保本机所有 Claude 客户端（`Claude.app`）、终端 `claude` (Claude Code CLI) 进程以及浏览器中的 `claude.ai` 标签页处于【完全关闭】状态！**
> 切勿在 Claude 运行中途切换网络，否则长连接与遥测心跳会在同一会话内出现出口 IP 跳变，极易触发风控。

---

## 核心特性（提炼自 `ip.net.coffee/claude` 标准）

1. **独立的 `🦀 Claude` 手动固定策略组（订阅更新不丢失）**
   - 自动筛选高质量节点（优先识别家宽/住宅/原生 ISP 节点），自动排除香港、澳门、中国大陆、俄罗斯、白俄罗斯等 Anthropic 受限地区；
   - 严格采用 `select` 手动固定模式（禁用 `url-test` 自动跳 IP），遵循 **「家宽 IP 最优、机房 IP 绝不频繁跳变」** 原则。
2. **全量五层分流规则置顶（源自 [`site.html`](https://ip.net.coffee/claude/site.html)）**
   - **核心域名**：`anthropic.com`、`claude.ai`、`claude.com`、`clau.de`、`claude.dev`、`claude.app`、`claudeusercontent.com`、`claudemcpclient.com`、`claudemcpcontent.com`
   - **CDN 与边缘节点**：`servd-anthropic-website.b-cdn.net`、`anthropic.com.cdn.cloudflare.net`
   - **认证与内容服务**：`anthropic.auth0.com`（Auth0 登录）、`anthropic-com.ghost.io`、`challenges.cloudflare.com`（Turnstile 验证）
   - **监控、A/B 测试与风控遥测**：`sentry.io`、`statsig.com`、`statsigapi.net`、`featuregates.org`、`featureassets.org`、`segment.io`、`datadoghq.com`、`browser-intake-us5-datadoghq.com`（独立连字符根域名精确匹配），以及关键词兜底 `datadog` / `sentry` / `sift`（Sift 反欺诈）
   - **官方 ASN / IP 段兜底**：Anthropic `AS399358` 全量 IPv4（`160.79.104.0/21`）与 IPv6（`2607:6bc0::/32`）网段（均带 `no-resolve`），并自动剔除原订阅广告拦截组误杀 `api.statsig.com` / `sentry.io` 的冲突规则。
3. **11 项关键网络防风控加固（源自 [`claudecode.html`](https://ip.net.coffee/claude/claudecode.html)）**
   - **强制 TCP，远离 UDP / 阻断链式家宽 STUN 泄露**：许多机场的「家宽节点」采用「前置机房中转 + 家宽链式落地」（TCP 走家宽，UDP 落回前置机房）。脚本默认在 Clash 网络层按域名拦截 STUN UDP 探测（`STUN_MODE = "REJECT"`，不全局封禁端口以免误伤腾讯会议/Zoom），无需禁用浏览器 WebRTC API 即可彻底消除 UDP 出口 IP 不一致警告；
   - **DNS 仅返回 IPv4（`dns.ipv6: false`）**：让应用拿不到 AAAA 记录、强制只走 IPv4，消除双栈出口分裂及 Happy Eyeballs 首次请求超时卡顿；
   - **DNS 强制走代理 + 封堵 `GEOIP,CN` 泄露**：所有 Claude 及关联遥测域名通过 `#🦀 Claude` 绑定海外加密 DoH（`1.1.1.1` / `8.8.8.8`），开启 `respect-rules: true`，并为末尾 `GEOIP,CN` 自动补齐 `,no-resolve`。
4. **内置 `ip.net.coffee/claude` 自动化体检脚本（[`check-env.sh`](skills/claude-clash/scripts/check-env.sh)）**
   - 一键在终端检测：Claude 进程安全状态、三出口 IP 分流对比、**Claude 出口 Trust Score 信任评分（0~100）**、**是否家庭住宅 IP (ISP)**、5 项黑名单记录、动态子域名权威 DNS 泄露实测及 STUN UDP 状态。

---

## 方式一：让 AI 助手全自动引导你配置与体检（推荐）

本项目内置了标准 **Agent Skill**（位于 [`skills/claude-clash/SKILL.md`](skills/claude-clash/SKILL.md)），支持 **Claude Code、Codex、Antigravity、Cursor** 等 AI 工具。

> **AI 引导流程**：
> 1. **安全检查与扫描**：先检查 Claude 是否已关闭，扫描你的 Clash 配置与订阅中的可用节点；
> 2. **由你选择节点**：向你列出筛选出的「家宽/原生节点」与「其他非禁区节点」，由你指定放入 `🦀 Claude` 策略组的首选节点；
> 3. **自动注入配置**：保留你原有的自定义直连规则，自动写入全量分流规则、DNS 防泄露、IPv6 封堵与 WebRTC 防护；
> 4. **一键体检**：自动调用 `ip.net.coffee/claude` 接口输出信任评分与防泄露验收报告。

把下面这段话发给你的 AI 助手即可：

```text
请按 claude-clash 方案帮我检查并配置本机的 Clash Verge Rev（Claude 分流规则、11 项关键配置、DNS 防泄露、WebRTC 防护及 ip.net.coffee 检验）。
项目地址：https://github.com/BeiFfan/claude-clash
请先将该项目克隆或读取到本机，完整阅读 skills/claude-clash/SKILL.md，
先扫描列出我订阅里的可用节点让我选择，保留我原有的自定义直连规则，完成全局扩展脚本配置并运行 check-env.sh 验收。
```

---

## 方式二：手动复制全局扩展脚本

如果你不需要 AI 自动配置，可以直接复制 [`skills/claude-clash/templates/Script.js`](skills/claude-clash/templates/Script.js) 的内容：

1. **先完全关闭本机的 Claude 客户端、终端 `claude` 进程及浏览器中的 `claude.ai` 标签页**；
2. 打开 **Clash Verge Rev** → 点击左侧 **「订阅」** → 找到顶部的 **「全局扩展脚本 (`Script.js`)」**，右键选择 **「编辑」**；
3. 粘贴 [`skills/claude-clash/templates/Script.js`](skills/claude-clash/templates/Script.js) 中的代码（可在顶部配置区填写 `PREFERRED_NODE_KEYWORD` 和 `CUSTOM_DIRECT_SUFFIXES`），点击 **「保存」**；
4. 在左侧 **「代理」** 页面找到 **`🦀 Claude`** 策略组，手动选择你固定使用的纯净节点；
5. 在左侧 **「设置」** 中确认开启 **「虚拟网卡模式 (TUN)」**，并保持 **「DNS 覆写」关闭**。

---

## 闭环检验方法（终端 + 网页双重验证）

### 1. 终端一键检验
运行仓库内置的诊断脚本：
```bash
bash skills/claude-clash/scripts/check-env.sh
```

### 2. 网页全指标可视化检验
打开 **<https://ip.net.coffee/claude/>**，确认以下核心指标全绿：
- **三出口 IP 分流**：中国出口 IPv4（国内直连） / Cloudflare 出口 IP（普通代理） / Claude AI 出口 IP（`🦀 Claude` 专线节点）分流清晰；
- **Claude AI 信任评分 (Trust Score)**：优先使用 **95~100 分（极度纯净）** 的 **家庭住宅 IP (`ISP`)**；
- **DNS 泄露检测**：状态为绿色 **「未检测到泄露」**；
- **WebRTC UDP 泄露检测**：状态为绿色 **「WebRTC 已禁用或无泄露」**（或 UDP 出口与 Claude 出口完全一致）。

---

## 目录结构

```text
claude-clash/
├── README.md
└── skills/
    └── claude-clash/
        ├── SKILL.md                                   # AI 助手执行蓝图（含安全锁、节点交互选择、配置注入与验收）
        ├── templates/
        │   └── Script.js                              # Clash Verge Rev 全局扩展脚本通用模板
        ├── scripts/
        │   └── check-env.sh                           # 本机环境、Claude 进程锁与 ip.net.coffee/claude 自动化检验脚本
        └── references/
            └── design-and-troubleshooting.md          # 分流规则详解、11 项关键配置与常见故障排查手册
```

---

## 参考资料与致谢

- [Claude AI IP 风险检测专页 (`ip.net.coffee/claude`)](https://ip.net.coffee/claude/)
- [Claude Code 域名分流规则大全 (`ip.net.coffee/claude/site.html`)](https://ip.net.coffee/claude/site.html)
- [Claude Code 稳定使用指南：11 项关键配置 (`ip.net.coffee/claude/claudecode.html`)](https://ip.net.coffee/claude/claudecode.html)
- [为什么不建议用 IPv6 访问 Claude Code (`ip.net.coffee/claude/ipv6.html`)](https://ip.net.coffee/claude/ipv6.html)
- [nevertoday/xiaoxiaodong-vps](https://github.com/nevertoday/xiaoxiaodong-vps)
