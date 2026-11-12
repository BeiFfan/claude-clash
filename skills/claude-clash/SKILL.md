---
name: claude-clash
description: 按小小东源模板适配 Clash Verge Rev / Mihomo 的 Claude 分流与 DNS，保留台湾家宽手动组和个人配置，离线核对后应用。
---

# 按小小东原文配置

使用[模板](templates/Script.js)和[离线工具](scripts/check-env.sh)，参考[来源说明](references/design-and-troubleshooting.md)。

## 原则

- 采用原文局域网、Google 公共认证和 Claude 分流段及对应 DNS，不增加自定 UDP/IPv6/STUN 拒绝、IP 兜底、coffee 域名或验证码补充。
- DNS 按原值：国内默认/直连/节点 DoH，指定域名海外 DoH，无强制出口后缀；内核/DNS IPv6=false。
- 保留原订阅其他规则和 no-resolve，不把原有广告拒绝规则当成本项目新增规则。
- 保留台湾家宽候选、当前选择和个人直连/专用 DNS；节点名称仅为标签。
- 保留用户授权和限制，不启动或请求 Claude，不打开登录/检测页，不探测 DNS/节点，不切出口。
- 不输出订阅 URL、服务器、密码、UUID、Token 或敏感原始错误。

## 工作流

1. 读取原订阅、全局 Script/Merge、订阅扩展与应用设置，审核合并个人逻辑，不执行不可信订阅脚本。
2. 备份后从原订阅生成候选，保留完整首选节点名和个人参数；禁止使用历史最终配置，以免残留旧策略。
3. 对照上游快照核对规则与 DNS，适配仅涉及策略组/规则集名称、同源规则集地址、手动更新及个人配置，保留 TUN/监听设置。
4. 运行相称的离线检查，不反复检测：

       bash tests/run-offline-tests.sh
       bash skills/claude-clash/scripts/check-env.sh --offline --config /path/to/final.yaml --json

5. 已获部署授权时，应用并核对最终文件、实际规则与当前节点，失败恢复备份；不切节点、不刷新延迟。
6. 网络和登录由用户自行验收，区分离线、加载与真实结果，不把配置通过当作账号验证成功。

报告 PASS/FAIL/UNKNOWN，缺失证据记 UNKNOWN。个人部署和账号记录只留本地，不上传仓库。
