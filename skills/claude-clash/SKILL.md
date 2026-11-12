---
name: claude-clash
description: 配置 Clash Verge Rev / Mihomo 的 Claude 网络环境优化，维护小小东分流及国内、Claude、日常代理三条 DNS 路径，保留已有节点选择和个人配置。
---

# Claude 网络环境优化

使用[模板](templates/Script.js)和[离线工具](scripts/check-env.sh)，参考[来源说明](references/design-and-troubleshooting.md)。

## 原则

- 采用原文局域网、Google 公共认证和 Claude 分流段，追加模板 userRules 中用户明确提供的域名、关键词及 IPv4/IPv6/ASN 兜底，全部走 Claude 组；不增加自定 UDP/IPv6/STUN 拒绝或清单外域名。
- DNS 三条路径：国内直连使用原国内 DNS，学校/内网保留专用 DNS；Claude 相关域名使用 Cloudflare/Google DoH#Claude组；其他域名默认使用 Cloudflare/Google DoH#日常代理组。节点和 DNS 服务器的引导解析保持独立，禁止以代理解析自身；不设置国内 fallback。内核/DNS IPv6=false 保持。
- DNS 复用既有域名、关键词分流生成内联匹配集合，不添加流量规则。国内域名使用 geosite:cn,private 和既有直连域名；私有 DNS、监听和 hosts 设置保留。DEFAULT_DNS_PROXY_GROUP 指向现有日常代理组，留空沿用原 MATCH 组；不变更组成员和当前选择。
- 保留原订阅其他规则和 no-resolve，不把原有广告拒绝规则当成本项目新增规则。
- 保留台湾家宽候选、当前选择和个人直连/专用 DNS；节点名称仅为标签。
- 保留用户授权和限制，不启动或请求 Claude，不打开登录/检测页，不探测 DNS/节点，不切出口。
- 不输出订阅 URL、服务器、密码、UUID、Token 或敏感原始错误。

## 工作流

1. 读取原订阅、全局 Script/Merge、订阅扩展与应用设置，审核合并个人逻辑，不执行不可信订阅脚本。
2. 备份后从原订阅生成候选，保留完整首选节点名和个人参数；禁止使用历史最终配置，以免残留旧策略。
3. 保留上游基础规则和模板 userRules，应用三条 DNS 路径；适配策略组/规则集名称、同源规则集地址、手动更新及个人配置，保留 TUN/监听设置。
4. 按用户要求决定是否运行离线检查；用户明确要求跳过时不运行测试或离线校验：

       bash tests/run-offline-tests.sh
       bash skills/claude-clash/scripts/check-env.sh --offline --config /path/to/final.yaml --json

5. 已获部署授权时，应用并核对最终文件、实际规则与当前节点，失败恢复备份；不切节点、不刷新延迟。
6. 网络和登录由用户自行验收，区分离线、加载与真实结果，不把配置通过当作账号验证成功。

报告 PASS/FAIL/UNKNOWN，缺失证据记 UNKNOWN。个人部署和账号记录只留本地，不上传仓库。
