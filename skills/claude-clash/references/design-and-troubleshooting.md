# 配置与验收说明

## 域名与策略

| 来源 | 内容 |
| --- | --- |
| 核心域名 | MetaCubeX `anthropic.yaml` 在线规则集；首次无缓存需下载，之后手动更新 |
| 本地后缀 | hcaptcha.com、sentry.io、statsig.com、statsigapi.net、segment.io、featuregates.org、featureassets.org、datadoghq.com、intercom.io、intercomcdn.com |
| 精确主机 | anthropic.com.cdn.cloudflare.net、anthropic.auth0.com、anthropic-com.ghost.io、cdn.usefathom.com、challenges.cloudflare.com、browser-intake-us5-datadoghq.com |
| 关键词 | claude、anthropic、datadog、sentry、sift；域名分流和 DNS 一起覆盖 |
| IP 兜底 | 160.79.104.0/21 走 Claude；2607:6bc0::/32 拒绝 |

管理域名的 TCP 走 `🦀 Claude`，UDP/IPv6 拒绝。hCaptcha 包括根域名及全部子域名，如 newassets.hcaptcha.com、api.hcaptcha.com，DNS 同样绑定 Claude 组。共享服务按域名整体接管，不区分浏览器标签页。

策略组手动选择，无自动轮换或 DIRECT 回退；首选节点之后追加所有名称含台湾/台灣/Taiwan/TW 及家宽/家寬/住宅/Residential 的本地节点，重复成员去重。未指定首选时先 REJECT；关闭 INCLUDE_TAIWAN_RESIDENTIAL 可仅保留明确首选。名称仅是候选标签，provider 动态成员与真实出口需另行核对。

六个已知公共 STUN：stun.l.google.com、stun1 至 stun4.l.google.com、stun.cloudflare.com，默认拒绝 UDP；这不覆盖所有 WebRTC 服务。

## DNS

- 默认及管理域名：`https://1.1.1.1/dns-query#🦀 Claude`、`https://8.8.8.8/dns-query#🦀 Claude`。
- 直连与节点解析器：`https://dns.alidns.com/dns-query`、`https://doh.pub/dns-query`；引导地址为 `223.5.5.5`、`119.29.29.29`。
- 保留个人 nameserver-policy、fallback 和节点专用策略；这些可能改变解析路径，应用时一并审核。学校/内网等专用 DNS 由用户提供，不附带任何个人地址。
- fake-IP、ARC、respect-rules、direct-nameserver-follow-policy；关闭 H3 与 DNS IPv6。池为 `198.18.0.1/16`，blacklist 四项为 `*.lan`、`+.local`、`+.msftconnecttest.com`、`+.msftncsi.com`。

默认海外 DoH 绑定 Claude 组是相对小小东国内默认 DNS 的调整。它也影响其他未匹配域名；国内直连和节点引导仍可使用国内 DNS，不能描述为所有 DNS 都走海外。

fake-IP 和 53 端口劫持不能证明浏览器独立 DoH 或代理服务端解析已受控。代理可能接收域名后自行解析；手动检测出现中国 DNS 时应结合本地 DNS/连接证据定位。不要只给检测域名增加规则、盲目删系统 DNS 或反复清缓存。

## 应用与核对

常见配置目录：macOS `~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/`；Linux `~/.local/share/io.github.clash-verge-rev.clash-verge-rev/`；Windows `%APPDATA%\io.github.clash-verge-rev.clash-verge-rev\`。

完整链路为订阅原文 → 应用设置 → 全局 Merge/Script → 订阅扩展配置/脚本 → 应用回写。备份后合并个人逻辑，从原订阅生成；检查全局脚本之外的规则、代理、策略组和 DNS/IPv6 覆写。最终文件与已加载状态分别核对；可使用已有本地只读 API 或客户端界面，不额外开放控制接口。

运行核对关注 rule 模式、实际已加载规则、规则集、Selector 当前选择及代理链。`/delay`、`/healthcheck`、`/dns/query` 会产生主动流量，不用于只读核对。配置完成后由用户手动检测，工具不提供联网探针。

`no-resolve` 仅控制 IP 规则是否主动触发解析，不是关闭 DNS。当前只在两条 Claude IP 兜底保留，其他已有规则与子规则的该参数会移除，可能改变它们触发解析的时机。

## 参考

主要方案：[小小东](https://github.com/BeiFfan/xiaoxiaodong-vps)；规则集：[MetaCubeX](https://github.com/MetaCubeX/meta-rules-dat)。

coffee：[检测入口](https://ip.net.coffee/claude/)、[DNS 检测](https://ip.net.coffee/dns/)、[分流清单](https://ip.net.coffee/claude/site.html)、[核心配置](https://ip.net.coffee/claude/claudecode.html)。

官方：[DNS](https://wiki.metacubex.one/config/dns/)、[路由规则](https://wiki.metacubex.one/config/rules/)、[TUN](https://wiki.metacubex.one/config/inbound/tun/)、[API](https://wiki.metacubex.one/api/)、[Verge 扩展](https://www.clashverge.dev/guide/extend.html)。
