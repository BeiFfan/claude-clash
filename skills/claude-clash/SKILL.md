---
name: claude-clash
description: 为本机 Clash Verge Rev（Mihomo 内核）自动配置并验收 Claude 专属防风控分流规则、DNS 防泄露与 WebRTC 出口对齐。保留用户原有自定义规则，通过全局扩展脚本（Script.js）建立独立 Claude 策略组，覆盖 Claude 核心域名、Cloudflare Turnstile 验证、Statsig/Segment 遥测、Anthropic 官方 IP 段及 STUN 出口，并检查 TUN 模式与本机公网 IPv6 状态。当用户要求配置或检查 Clash 的 Claude 分流规则、修复 DNS 泄露或 WebRTC 泄露时使用。
---

# Claude-Clash 自动配置与验收指南

你的任务是帮助用户检查并完善本机 **Clash Verge Rev（Mihomo 内核）** 的配置，使 **Claude 分流规则、DNS 防泄露、WebRTC 出口对齐** 达到最佳防风控状态，同时**完整保留用户已有的自定义直连/代理规则**。

详细设计原理与故障排查请参考 [references/design-and-troubleshooting.md](references/design-and-troubleshooting.md)，通用全局脚本模板位于 [templates/Script.js](templates/Script.js)。

---

## 必须遵守的安全与操作原则

1. **绝不泄露或打印用户隐私信息**：
   - 在对话中**严禁**输出用户订阅文件中的机场订阅链接（`url`）、节点服务器域名（`server`）、密码（`password`）、UUID 或 API Token。
   - 读取 `profiles.yaml` 或 `clash-verge.yaml` 时，只关注策略组名称、节点显示名称（如地区/家宽标识）、`dns` 配置段与 `rules` 规则段。
2. **保留用户已有的自定义规则**：
   - 修改全局扩展脚本 `Script.js` 前，必须先读取用户现有的 `Script.js` 及当前激活订阅挂载的专属 `script` 文件，提取用户自己写的直连规则（如学校内网、论文数据库、国内网站、专用 DNS `nameserver-policy`），合并到新脚本中，**绝不能直接暴力覆盖清空用户的个人规则**。
3. **坚持使用全局扩展脚本（`Script.js`）**：
   - 用户的第三方订阅会定期自动更新并覆盖订阅原文件。所有规则与 DNS 修改必须写入全局 `Script.js`。
   - 如果当前激活的订阅还挂载了单独的订阅级脚本（`profiles.yaml` 中该订阅条目的 `option.script`），检查其是否会覆盖 `config.rules` 或 `config.dns`。若有冲突，将其逻辑合并入全局 `Script.js`，并将该订阅级脚本改为透传（`function main(config) { return config; }`），防止订阅级脚本在全局脚本之后运行并删掉新增规则。
4. **不要禁用浏览器 WebRTC**：
   - 目标是通过开启 Clash Verge Rev 的「虚拟网卡模式（TUN）」并将海外 STUN 流量对齐到 Claude 策略组，让 WebRTC 保持正常可用且出口显示为代理节点 IP。不要让用户安装限制 WebRTC 的浏览器插件或修改 `about:config`。

---

## 第一步：定位配置目录与环境体检

### 1.1 各系统 Clash Verge Rev 配置目录路径

- **macOS**：`~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/`
- **Windows**：`%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\`
- **Linux**：`~/.local/share/io.github.clash-verge-rev.clash-verge-rev/`

### 1.2 运行环境诊断脚本（macOS / Linux）

在可以执行命令的环境中，运行本 Skill 自带的只读诊断脚本（不打印任何敏感凭据）：

```bash
bash "<本SKILL所在目录>/scripts/check-env.sh"
```

如果是 Windows 或无法直接运行脚本，请手动读取以下文件：
1. `verge.yaml`：检查 `enable_tun_mode`（是否开启虚拟网卡模式）、`enable_dns_settings`（DNS 覆写是否关闭）。
2. `profiles.yaml`：找到 `current` 指向的当前激活订阅 UID，查看其 `selected`（用户当前选中的节点）以及 `option.script`（是否有订阅级脚本）。
3. `profiles/Script.js` 及订阅级脚本 `profiles/<script_uid>.js`：查看现有脚本逻辑。
4. `clash-verge.yaml`：查看最终生效的 `tun`、`dns`、`proxy-groups` 和 `rules`（首尾部分）。

---

## 第二步：向用户展示可用节点并让用户选择（交互确认）

1. 根据第一步检测到的订阅节点列表（已自动排除香港 `HK`、澳门 `MO`、俄罗斯 `RU` 等 Anthropic 不支持地区），向用户清晰列出：
   - **推荐的家宽/住宅/原生节点**（如果订阅中包含此类节点）；
   - **其他支持地区的代表性节点**（如台湾、日本、美国、新加坡等）。
2. **询问并等待用户选择**：
   - 询问用户希望将哪个节点设为 `🦀 Claude` 策略组的默认首选节点（以及策略组内是「仅放入家宽节点」还是「放入全部非禁区节点供手动切换」）。
   - 如果用户在提问时已经明确指定了节点名称，或要求保留现有 `🦀 Claude` 策略组的选择，则直接采用用户的指定，无需重复追问。

---

## 第三步：写入全局扩展脚本（`profiles/Script.js`）

以 [templates/Script.js](templates/Script.js) 为基准，结合用户在原 `Script.js` 中的自定义直连规则和自定义 `nameserver-policy`，更新 `profiles/Script.js`。

核心配置要求（均已内置于模板中）：

1. **策略组 `🦀 Claude`**：
   - 自动筛选符合条件（如包含 `家宽`/`住宅`/`Residential` 或全部可用节点，且排除港澳等地区）的节点，将用户指定的首选节点置顶。
2. **DNS 防污染与防泄露（`config.dns`）**：
   - `enable: true`、`enhanced-mode: "fake-ip"`、`prefer-h3: false`、`respect-rules: true`。
   - `nameserver`、`direct-nameserver`、`proxy-server-nameserver` 设为国内高可用 DoH（`https://223.5.5.5/dns-query`、`https://doh.pub/dns-query`），开启 `direct-nameserver-follow-policy: true`（同时修复部分机场将 `proxy-server-nameserver` 设为 `127.0.0.1:7874` 自环的错误）。
   - 从 `fake-ip-filter` 中移除 `stun.*.*` 和 `stun.*.*.*`，防止 STUN 请求被强制用国内 DoH 解析真实 IP。
   - 在 `nameserver-policy` 中将 Claude 核心域名、验证/遥测域名及海外 STUN 域名绑定到 `https://1.1.1.1/dns-query#🦀 Claude` 和 `https://8.8.8.8/dns-query#🦀 Claude`。
3. **Claude 前置分流与订阅规则清理（`config.rules`）**：
   - 将以下规则置于 `config.rules` 最前端：
     - **核心后缀（`DOMAIN-SUFFIX`）**：`anthropic.com`, `clau.de`, `claude.ai`, `claude.com`, `claude.dev`, `claude.app`, `claudemcpclient.com`, `claudemcpcontent.com`, `claudeusercontent.com`
     - **风控与特性开关后缀（`DOMAIN-SUFFIX`）**：`statsig.com`, `statsigapi.net`, `featuregates.org`, `featureassets.org`, `segment.io`, `intercom.io`, `intercomcdn.com`
     - **精确域名（`DOMAIN`）**：`servd-anthropic-website.b-cdn.net`, `cdn.usefathom.com`, `challenges.cloudflare.com`
     - **WebRTC STUN 对齐（`DOMAIN`）**：`stun.l.google.com`, `stun1.l.google.com` ~ `stun4.l.google.com`, `stun.cloudflare.com`
     - **关键词兜底（`DOMAIN-KEYWORD`）**：`claude`, `anthropic`
     - **官方 IP 段（`IP-CIDR` / `IP-CIDR6`）**：`160.79.104.0/23`, `2607:6bc0::/48`, `2607:6bc0:11::/48`（均带 `no-resolve`）
   - 紧随其后放入用户的自定义直连规则（`CUSTOM_DIRECT_RULES`）。
   - 过滤原订阅规则：移除已被上述规则接管的同键冲突项（包括原订阅广告过滤组中的 `DOMAIN,api.statsig.com`）。
   - **为所有 `GEOIP,CN` 规则强制补上 `,no-resolve`**：防止未知海外域名触发国内 DoH 解析造成 DNS 泄露。
4. **语法校验**：
   - 写入后运行 `node -c "<Script.js路径>"` 校验 JavaScript 语法无误。

---

## 第四步：检查客户端设置与激活生效

1. **检查 TUN 模式与 DNS 覆写**：
   - 如果 `verge.yaml` 中 `enable_tun_mode` 为 `false`，提醒用户在 Clash Verge Rev 左侧「设置 → 系统设置」中打开 **「虚拟网卡模式」**（Windows 额外在虚拟网卡齿轮设置中打开「严格路由」）。
   - 如果 `enable_dns_settings` 为 `true`，提醒用户关闭 **「DNS 覆写」**，避免覆盖脚本写入的 DNS 策略。
2. **检查本机公网 IPv6 与 Clash Verge「IPv6」开关**：
   - 根据 `check-env.sh` 的 `PUBLIC_IPV6` 输出（或见 [references/design-and-troubleshooting.md](references/design-and-troubleshooting.md)）：
     - **本机无公网 IPv6**：建议在 Clash Verge「设置 → Clash 设置」中**关闭「IPv6」**（防止返回 `fake-ip-range6` 导致微信发不出图片或连接卡顿）。
     - **本机有公网 IPv6**：必须在「Clash 设置」中**打开「IPv6」**（防止本机 IPv6 流量绕过虚拟网卡直接泄露）。
3. **触发配置重新生成并核对**：
   - 请用户在 Clash Verge Rev 的「全局扩展脚本」窗口点击 **「保存」**，或在「订阅」页右键当前订阅点击 **「使用」**。
   - 重新读取生成的 `clash-verge.yaml`，核对：
     - `dns.nameserver-policy` 中已包含 `#🦀 Claude` 条目，`respect-rules: true` 已生效；
     - `rules:` 顶部已是 `🦀 Claude` 规则；
     - `rules:` 末尾的 `GEOIP,CN` 已带上 `,no-resolve`。
4. **告知用户最终验证方式**：
   - 打开 <https://ip.net.coffee/claude/> 和 <https://browserleaks.com/webrtc> 确认 IP、DNS 出口与 WebRTC UDP 出口一致。
