# 来源与适配

分流参考：[小小东 clash-template.yaml](https://github.com/BeiFfan/xiaoxiaodong-vps/blob/main/skills/xiaoxiaodong-vps/scripts/server/files/clash-template.yaml)。快照 blob SHA：6ce02e8423432990bc94a8eef00aa6097b6d8172。DNS 三条路径为用户明确要求的调整，不声称与源文件 DNS 原值相同。

采用原文局域网直连、Google 公共认证块、Claude 规则集及连续 Claude 分流段，其他 AI/影音业务不导入。在此之后追加用户明确提供的 userRules：CDN/认证主机、Sentry/Intercom、Datadog/Sift 关键词，以及 160.79.104.0/21、2607:6bc0::/32、ASN 399358，全部走 Claude 组。不增加 REJECT、UDP/IPv6 守卫、STUN 策略或清单外域名。

IP/ASN 兜底的 no-resolve 仅表示不为匹配主动触发域名解析；目标 IP 已知时仍会匹配。

DNS 保留源 fake-IP、ARC、IPv6=false、关闭 H3 与过滤表，解析路径如下：

| 查询范围 | 解析器与出口 |
| --- | --- |
| 国内、明确直连、学校/内网 | 国内阿里/腾讯 DoH，或原专用 DNS |
| 既有 Claude 分流域名、关键词与共享服务 | 1.1.1.1 / 8.8.8.8 DoH，显式经 Claude 组 |
| 其他域名默认 | 同上海外 DoH，显式经日常代理组 |

两个 DNS 专用内联规则集从既有分流提取域名、后缀和关键词，不参与流量分流、不下载新清单。国内分类另用现有 geosite:cn,private；仅有 IP 的 GEOIP 规则不能预先判定域名归属，最终 DIRECT 连接使用 direct-nameserver。学校等显式专用解析策略及监听/hosts 设置保留。

default-nameserver 和 proxy-server-nameserver 仍为独立国内解析器，避免节点启动时产生循环依赖。无国内 fallback 并发路径。策略组后缀、专用直连和节点解析含义见 [Mihomo DNS 文档](https://wiki.metacubex.one/config/dns/)。

## 必要适配

- 源 AI-人工智能改为现有 Claude 手动组，保留首选节点与台湾家宽候选，不插入 REJECT 成员或 empty-fallback。
- 源 Claude 规则集改名 claude-clash-anthropic，复用缓存。私人 VPS 地址不能直接使用，采用其 [rule-sources.json](https://github.com/BeiFfan/xiaoxiaodong-vps/blob/main/skills/xiaoxiaodong-vps/scripts/server/files/rule-sources.json) 指定的同一 MetaCubeX 上游；保留 interval=0 手动更新。
- 保留个人直连/专用 DNS、原订阅其他规则及 no-resolve，不增加中国出口 IPv4 路由。
- 从原订阅生成，避免旧拒绝规则和 DNS 后缀残留；审核后续扩展和应用覆写。

## 验收

离线核对原文规则、DNS、引用和依赖。本地通过已有只读接口或界面核对实际加载与节点，不调用 delay、healthcheck 或 dns/query。

国内直连及引导解析有意保留国内 DNS；通用检测需结合命中范围判断。验证码和登录是否通过由用户实际确认，配置不能保证代理不可识别或账号免于风控。
