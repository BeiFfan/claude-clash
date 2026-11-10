# 设计原理与常见故障排查

本文档说明 `claude-clash` 为什么这样设计分流规则、DNS 与 WebRTC 策略，以及遇到问题时如何排查。

---

## 一、为什么只配 `claude.ai` 域名还不够？

在使用第三方订阅（机场）时，常见配置往往只把 `claude.ai` 和 `anthropic.com` 分流到指定节点，而把其他流量留在默认代理组（如「自动选择」或「香港/新加坡机房节点」）。这会导致以下 **4 类出口分裂**：

1. **人机验证（Cloudflare Turnstile）出口分裂**
   - 当访问 Claude 触发 Cloudflare 验证框时，请求发往 `challenges.cloudflare.com`。如果该域名落在默认代理组（例如香港机房节点），Anthropic 后端会看到主站请求来自「节点 A」，而验证 Token 签发自「节点 B」，极易触发二次验证或封号。
2. **特性开关与风控遥测（Statsig / Segment / Fathom）出口分裂或被广告规则误杀**
   - Claude 网页端与客户端在启动和对话期间会高频请求 `api.statsig.com`、`events.statsigapi.net`、`featuregates.org`、`featureassets.org`、`segment.io`、`cdn.usefathom.com`。
   - 许多机场自带的去广告规则集会将 `DOMAIN,api.statsig.com` 归入 `🛑 广告过滤 (REJECT)`，或者归入通用 AI 组，导致页面功能残缺或出口 IP 不一致。
3. **Anthropic 官方自有 IP 段（AS399358）未覆盖**
   - Anthropic 拥有独立 IPv4 段 `160.79.104.0/23` 及 IPv6 段 `2607:6bc0::/48`、`2607:6bc0:11::/48`。将其显式加入 `🦀 Claude` 并附带 `no-resolve` 可确保直接 IP 连接不走错通道。
4. **浏览器 WebRTC UDP 出口分裂**
   - 即使开了虚拟网卡（TUN）模式，浏览器向 `stun.l.google.com:19302` 发起的 UDP 探测默认会命中 Google 规则或漏网之鱼规则（走默认组），导致网页检测到的 WebRTC IP 与 Claude 的 HTTPS IP 不一致。
   - 同时，许多订阅在 `fake-ip-filter` 中加入了 `stun.*.*`，这会让 Mihomo 先用国内 DoH 去解析 STUN 域名得到真实 IP，再按纯 IP 规则路由。移除 `fake-ip-filter` 中的 `stun.*.*` 并将常用海外 STUN 域名显式分流至 `🦀 Claude`，即可让 WebRTC UDP 出口与 Claude TCP 出口完全对齐。

---

## 二、为什么 DNS 这样配置能防污染与防泄露？

1. **DoH 绑定策略组（`#🦀 Claude`）+ `respect-rules: true`**
   - 在 `nameserver-policy` 中，为所有 Claude 及关联域名指定：
     ```yaml
     - https://1.1.1.1/dns-query#🦀 Claude
     - https://8.8.8.8/dns-query#🦀 Claude
     ```
   - 这样查询这些域名时，不仅使用海外无污染的 Cloudflare / Google DoH，而且 DoH 请求本身强制通过 `🦀 Claude` 节点发出，既不会泄漏给本地运营商，也不会从其他代理节点发出。
2. **`GEOIP,CN` 强制加上 `no-resolve`（最容易被忽视的 DNS 泄露点）**
   - 很多机场订阅的倒数第二条规则是 `- GEOIP,CN,🎯 绕过代理`（没有 `no-resolve`）。
   - 当浏览器访问任何未在前面域名白名单中列出的海外域名（包括 `https://ip.net.coffee/claude/` 或各类 DNS 泄露测试网站动态生成的随机子域名）时，匹配到 `GEOIP,CN` 会迫使 Mihomo 先用默认 `nameserver`（国内阿里 `223.5.5.5` / 腾讯 `doh.pub`）在本地解析一次该域名的 IP，以判断它是否属于 `CN`。
   - 这会导致海外测试网站的权威 DNS 直接收到来自中国大陆阿里云/腾讯云的递归查询，从而判定 **DNS 泄露（DNS 出口在中国）**。
   - 加上 `,no-resolve` 后，未知域名不再为了匹配 `GEOIP,CN` 而在本地做 DNS 解析，直接落入末尾的 `MATCH` 规则，由代理服务器在远端完成解析。

---

## 三、常见故障排查对照表

| 现象 | 原因 | 解决方法 |
| --- | --- | --- |
| 修改了全局扩展脚本 `Script.js`，但生成的 `clash-verge.yaml` 里没有新加的规则 | 当前订阅还挂载了一个订阅专属脚本（`profiles.yaml` 中的 `option.script`），它在全局脚本之后运行并过滤掉了新规则 | 将订阅专属脚本改为 `function main(config) { return config; }`，所有逻辑统一放在全局 `Script.js` 中 |
| 检测网站提示「WebRTC 泄露」，显示国内 IP | Clash Verge Rev 只开了「系统代理」，未开「虚拟网卡模式（TUN）」；系统代理只接管 TCP，不接管 WebRTC 的 UDP | 在 Clash Verge Rev「设置 → 系统设置」中安装服务并打开 **「虚拟网卡模式」**（Windows 同时打开「严格路由」），然后完全退出浏览器重开 |
| `browserleaks.com/webrtc` 显示 `RTCPeerConnection: ✘` 或检测不到公网 IP | 浏览器安装了限制 WebRTC 的扩展，或在 `uBlock Origin` / `about:config` 中禁用了 WebRTC | 移除 WebRTC 限制扩展，取消 uBlock Origin 中「防止 WebRTC 泄露本地 IP 地址」勾选，保持 WebRTC 正常开启并由 TUN 接管 |
| 开启 TUN 模式后，微信文字能发，但图片/文件发不出去 | 本地网络没有公网 IPv6，但 Clash Verge 的「IPv6」开关开着，给微信返回了 `fake-ip-range6` (`2001:2::/64`) 假 IPv6 地址 | 运行 `check-env.sh` 确认无公网 IPv6 后，在 Clash Verge「设置 → Clash 设置」中关闭 **「IPv6」**，并完全退出微信重开 |
| DNS 策略未生效，`clash-verge.yaml` 的 `dns` 被替换成了别的配置 | Clash Verge 开启了「DNS 覆写」 | 在 Clash Verge「设置 → Clash 设置」中关闭 **「DNS 覆写」** |
