# 来源与适配

唯一策略参考：[小小东 clash-template.yaml](https://github.com/BeiFfan/xiaoxiaodong-vps/blob/main/skills/xiaoxiaodong-vps/scripts/server/files/clash-template.yaml)。快照 blob SHA：6ce02e8423432990bc94a8eef00aa6097b6d8172。

采用原文局域网直连、Google 公共认证块、Claude 规则集及连续 Claude 分流段，其他 AI/影音业务不导入。不增加 REJECT、UDP/IPv6 守卫、STUN 策略，或源内没有的 hCaptcha、Intercom、共享根域名和遥测关键词。

DNS 基础字段照原值，仅提取上述域名在源内已有的 nameserver-policy，不自行补齐其他域名。默认/直连/节点为阿里、腾讯 DoH，指定域名为 1.1.1.1/8.8.8.8 DoH；无强制出口后缀或额外记录过滤。原监听/hosts 开关和个人专用 DNS 保留。

## 必要适配

- 源 AI-人工智能改为现有 Claude 手动组，保留首选节点与台湾家宽候选，不插入 REJECT 成员或 empty-fallback。
- 源 Claude 规则集改名 claude-clash-anthropic，复用缓存。私人 VPS 地址不能直接使用，采用其 [rule-sources.json](https://github.com/BeiFfan/xiaoxiaodong-vps/blob/main/skills/xiaoxiaodong-vps/scripts/server/files/rule-sources.json) 指定的同一 MetaCubeX 上游；保留 interval=0 手动更新。
- 保留个人直连/专用 DNS、原订阅其他规则及 no-resolve，不增加中国出口 IPv4 路由。
- 从原订阅生成，避免旧拒绝规则和 DNS 后缀残留；审核后续扩展和应用覆写。

## 验收

离线核对原文规则、DNS、引用和依赖。本地通过已有只读接口或界面核对实际加载与节点，不调用 delay、healthcheck 或 dns/query。

国内默认 DNS 可能在通用检测显示国内解析器。验证码和登录是否通过由用户实际确认，配置不能保证代理不可识别或账号免于风控。
