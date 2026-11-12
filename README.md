# claude-clash

用于 **Claude 网络环境优化**：在使用代理时，配置固定出口、域名分流与海外 DNS，减少意外直连和 DNS 旁路。适用于 **Clash Verge Rev / Mihomo**。

提供三部分：[配置模板](skills/claude-clash/templates/Script.js)、[离线检查工具](skills/claude-clash/scripts/check-env.sh)、[Agent Skill](skills/claude-clash/SKILL.md)。

## 快速配置

1. 备份现有全局脚本、扩展配置和个人规则，确认 Claude 客户端、CLI 和网页没有正在进行的请求。
2. 在 [Script.js](skills/claude-clash/templates/Script.js) 的 `main` 函数中填写参数：

   ```js
   const PREFERRED_NODE_KEYWORD = "你的节点完整名称";
   const CUSTOM_DIRECT_SUFFIXES = []; // 保留自己的直连域名
   const CUSTOM_DIRECT_KEYWORDS = [];
   const CUSTOM_NAMESERVER_POLICY = {}; // 保留内网、学校等专用 DNS
   ```

3. 将脚本合并到 Clash Verge 的**全局扩展脚本**。已有脚本先审核合并，保留个人逻辑；从订阅原文生成，避免旧最终配置残留策略。
4. 使用 **rule 模式**，启用 TUN、自动路由及 UDP/TCP DNS 劫持（`any:53`、`tcp://any:53`）。检查后续订阅扩展和应用 DNS/IPv6 覆写，确保没有覆盖本模板。
5. 本地加载并核对最终配置、实际规则和 `🦀 Claude` 当前节点，再由用户手动验收。

脚本不附带订阅或节点。节点名必须完全匹配；未指定时先选 `REJECT`。provider 型订阅可手动选择，默认同样拒绝。复制 Skill 目录到所用 Agent 的技能目录后，按其说明执行即可。

## 核心策略

| 项目 | 行为 |
| --- | --- |
| 固定出口 | `🦀 Claude` 手动组，不自动轮换、不回退 DIRECT |
| 域名 | MetaCubeX Anthropic 规则集 + 本地补充；手动更新，`interval: 0` |
| 关键词 | `claude`、`anthropic`、`datadog`、`sentry`、`sift`，宁可多匹配 |
| 共享服务 | Sentry、Statsig、Segment、Datadog、Intercom 等纳入 Claude 策略 |
| 默认及 Claude DNS | Cloudflare / Google DoH，通过 `#🦀 Claude` 绑定当前固定组 |
| 直连与节点 DNS | 阿里 / 腾讯 DoH；保留个人专用 DNS |
| IPv6 | 关闭内核及 DNS IPv6；管理域名另有 IPv6 拒绝 |
| UDP | 管理域名/IP 拒绝 UDP；六个已知公共 STUN 默认拒绝 UDP |

采用 fake-IP、ARC、关闭 H3；仅两条 Claude IP 兜底保留 `no-resolve`，其他规则的该参数移除。不设置整进程接管或进程内网直连例外。完整域名、DNS 参数及作用范围见 [配置与验收说明](skills/claude-clash/references/design-and-troubleshooting.md)。

**影响范围**：共享服务会影响其他网站对这些服务的访问；默认海外 DNS 影响未匹配专用策略的域名；内核 IPv6 关闭对所有经过它的应用生效。Claude 网络环境优先。

## 离线检查

需要 Node.js 和 Python 3：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
bash tests/run-offline-tests.sh

# 检查完整扩展链执行后的最终 YAML，不执行订阅脚本
bash skills/claude-clash/scripts/check-env.sh --offline --config /path/to/final.yaml --json

# 可选：标出后续扩展挂载，或只读检查相关进程
bash skills/claude-clash/scripts/check-env.sh --offline --config /path/to/final.yaml --profiles /path/to/profiles.yaml
bash skills/claude-clash/scripts/check-env.sh --check-processes
```

工具只检查指定文件；不联网、不自动读取本机配置、不启动客户端、不修改配置。状态/退出码为 `PASS/0`、`FAIL/1`、`UNKNOWN/2`。最终文件通过不等于运行内核已经加载。

## 手动验收

离线检查 → 本地加载状态核对 → 用户自行打开 [ip coffee Claude 检测](https://ip.net.coffee/claude/) 和 [DNS 检测](https://ip.net.coffee/dns/)。

- Claude 出口：与选定的固定代理一致。
- DNS：新一轮检测未出现中国大陆解析器；没有有效样本时不算通过。
- IPv6：未暴露本地公网 IPv6；WebRTC 未暴露本地公网出口。

Agent 默认不启动或请求 Claude，不打开检测页，不自动测试延迟或切换出口。异常先查本地，不连续请求。配置和检测结果均不能保证代理不可识别或账号免于风控。

## 维护与参考

- 核心规则集：[MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat)，社区维护，非 Anthropic 官方清单。首次缺少缓存时客户端会初始化下载，后续通过客户端手动更新 `claude-clash-anthropic`。
- 额外域名、关键词及 DNS：集中在模板的 `CLAUDE_POLICY` 中维护，变更后运行对应离线检查。
- 主要配置参考：[小小东](https://github.com/BeiFfan/xiaoxiaodong-vps)。本项目默认 DNS 改为海外 DoH 并绑定 Claude 组，国内直连/节点 DNS 保留。
- coffee 参考：[分流规则](https://ip.net.coffee/claude/site.html)、[核心配置](https://ip.net.coffee/claude/claudecode.html)。
- 官方文档：[Mihomo DNS](https://wiki.metacubex.one/config/dns/)、[路由规则](https://wiki.metacubex.one/config/rules/)、[TUN](https://wiki.metacubex.one/config/inbound/tun/)、[Clash Verge 扩展](https://www.clashverge.dev/guide/extend.html)。
