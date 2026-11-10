# claude-clash

专为 **Clash Verge Rev（Mihomo 内核）** 设计的 **Claude 防风控分流、DNS 防泄露与 WebRTC 出口对齐** 方案及 AI Agent Skill。

适用于使用第三方订阅（机场）或自建节点的用户：通过 Clash Verge Rev 的 **「全局扩展脚本 (`Script.js`)」**，在不破坏原订阅节点与自带规则的前提下，自动建立独立的 `🦀 Claude` 策略组，并将 Claude 核心服务、人机验证（Cloudflare Turnstile）、特性开关与遥测（Statsig / Segment / Fathom）、官方 AS399358 IP 段以及浏览器 WebRTC STUN 探测全部锁定在同一纯净出口。

---

## 核心特性

1. **独立的 `🦀 Claude` 策略组（订阅更新不丢失）**
   - 自动筛选高质量节点（如家宽/住宅节点，或全部可用节点），自动排除香港、澳门、俄罗斯等 Anthropic 不支持的地区节点，防止误触导致账号风控。
2. **四层全覆盖分流规则（消除主站与验证组件 IP 分裂）**
   - **核心域名**：`anthropic.com`、`claude.ai`、`claude.com`、`clau.de`、`claude.dev`、`claude.app`、`claudeusercontent.com`、`claudemcpclient.com`、`claudemcpcontent.com`、`servd-anthropic-website.b-cdn.net`
   - **人机验证与风控遥测**：`challenges.cloudflare.com`（Turnstile 验证）、`statsig.com`、`statsigapi.net`、`featuregates.org`、`featureassets.org`、`segment.io`、`cdn.usefathom.com`、`intercom.io`、`intercomcdn.com`
   - **关键词兜底与官方 IP 段**：`DOMAIN-KEYWORD,claude/anthropic` + Anthropic 官方 IP 段（`160.79.104.0/23`、`2607:6bc0::/48`、`2607:6bc0:11::/48`）
   - **自动冲突清理**：自动剔除原订阅中将上述域名分流至其他策略组或广告拦截组（如 `api.statsig.com` 被误杀）的冲突规则。
3. **DNS 防污染与防国内泄露**
   - **绑定策略组 DoH**：通过 Mihomo 的 `#🦀 Claude` 语法，强制 Claude 及关联域名的 DNS 解析使用 Cloudflare (`1.1.1.1`) / Google (`8.8.8.8`) DoH 且走 `🦀 Claude` 代理通道，同时开启 `respect-rules: true`。
   - **封堵 `GEOIP,CN` 泄露漏洞**：自动为订阅末尾的 `GEOIP,CN` 规则补齐 `,no-resolve`，防止访问未知海外域名（如 DNS 泄露检测站的随机子域名）时触发本地运营商/阿里/腾讯 DoH 解析而暴露国内位置。
4. **WebRTC UDP 出口对齐（不禁用 WebRTC）**
   - 移除订阅 `fake-ip-filter` 中的 `stun.*.*`，并将常用海外 STUN 服务器（`stun.l.google.com`、`stun.cloudflare.com` 等）分流至 `🦀 Claude` 组。
   - 配合虚拟网卡（TUN）模式，确保网页语音/视频正常可用的同时，WebRTC UDP 出口 IP 与 Claude HTTPS 出口 IP 完全一致。

---

## 方式一：让 AI 助手全自动帮你配置与体检（推荐）

本项目内置了标准 **Agent Skill**（位于 [`skills/claude-clash/SKILL.md`](skills/claude-clash/SKILL.md)），支持 **Claude Code、Codex、Antigravity、Cursor** 等具备本地命令执行能力的 AI 工具。

把下面这段话发给你的 AI 助手即可：

```text
请按 claude-clash 方案帮我检查并配置本机的 Clash Verge Rev（Claude 分流规则、DNS 防泄露、WebRTC 出口对齐）。
项目地址：https://github.com/BeiFfan/claude-clash
请先将该项目克隆或读取到本机，完整阅读 skills/claude-clash/SKILL.md，
保留我原有的自定义直连/分流规则，完成全局扩展脚本配置与本地环境验收。
我希望能优先用于 Claude 的节点关键词是：（例如：台湾家宽 / 美国 / 日本，不确定可留空让我选）
```

---

## 方式二：手动复制全局扩展脚本

如果你不需要 AI 自动配置，可以直接复制 [`skills/claude-clash/templates/Script.js`](skills/claude-clash/templates/Script.js) 的内容：

1. 打开 **Clash Verge Rev** → 点击左侧 **「订阅」**；
2. 找到顶部的 **「全局扩展脚本 (`Script.js`)」**，右键选择 **「编辑」**；
3. 粘贴 [`skills/claude-clash/templates/Script.js`](skills/claude-clash/templates/Script.js) 中的代码（可在代码顶部修改 `PREFERRED_NODE_KEYWORD` 和 `CUSTOM_DIRECT_SUFFIXES`），点击 **「保存」**；
4. 在左侧 **「代理」** 页面找到 **`🦀 Claude`** 策略组，手动选择你固定使用的纯净节点；
5. 在左侧 **「设置」** 中确认开启 **「虚拟网卡模式 (TUN)」**，并保持 **「DNS 覆写」关闭**。

---

## 验证方法

配置完成后，在浏览器中依次打开以下两个页面进行验证：

1. **Claude 环境与信任评分检测**：<https://ip.net.coffee/claude/>
   - 确认显示的 **IP 地址**、**DNS 出口**、**WebRTC 出口** 均为你为 `🦀 Claude` 选择的节点 IP，且 DNS 出口不在中国境内。
2. **WebRTC 泄露检测**：<https://browserleaks.com/webrtc>
   - 确认 `RTCPeerConnection` 为 `✔`（未禁用），且 `Public IP Address` 显示为你选择的代理节点 IP。

---

## 目录结构

```text
claude-clash/
├── README.md
└── skills/
    └── claude-clash/
        ├── SKILL.md                                   # AI 助手执行蓝图与操作规范
        ├── templates/
        │   └── Script.js                              # Clash Verge Rev 全局扩展脚本通用模板
        ├── scripts/
        │   └── check-env.sh                           # 本机配置、IPv6、TUN 与 STUN 出口诊断脚本
        └── references/
            └── design-and-troubleshooting.md          # 规则设计原理与常见故障排查手册
```

---

## 致谢与参考

- 部分 DNS 防泄露（`GEOIP,CN,no-resolve`）与客户端 WebRTC / IPv6 排查思路参考自 [nevertoday/xiaoxiaodong-vps](https://github.com/nevertoday/xiaoxiaodong-vps)。
