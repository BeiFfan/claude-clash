# claude-clash

用于代理环境下的 Claude 网络环境优化，将[小小东源模板](https://github.com/BeiFfan/xiaoxiaodong-vps/blob/main/skills/xiaoxiaodong-vps/scripts/server/files/clash-template.yaml)适配到 Clash Verge Rev / Mihomo，保留已有分流与节点选择。

## 配置范围

- 原文采用局域网直连、Google 公共认证和 Claude 分流段，保持顺序，只适配策略组及规则集名称。
- DNS 分三条路径：国内直连和学校/内网保留国内或专用 DNS；Claude 相关域名（含已有关键词、共享服务）使用经 Claude 组发送的 Cloudflare/Google DoH；其他域名默认使用经日常代理组发送的 Cloudflare/Google DoH。
- 节点域名与 DNS 服务器自身的引导解析保留独立国内解析器，避免依赖代理自身。无国内 fallback 与海外解析器并发查询。
- 沿用源文件 IPv6=false、fake-IP、ARC、关闭 H3 和四项过滤表。
- 在源规则之后、原订阅规则之前，追加用户明确提供的 CDN、认证、遥测/客服域名，以及 IPv4/IPv6/ASN 兜底；全部走 Claude 组。清单集中在模板 userRules，已有规则不重复添加。
- 三条 IP/ASN 兜底保留 no-resolve：匹配时不主动触发域名解析，并非 IP 反查。不增加 UDP/IPv6/STUN 拒绝、进程接管或清单外域名。
- 保留台湾家宽手动候选、当前节点、个人直连/专用 DNS；原订阅其余规则和 no-resolve 保持。
- 规则集使用源 rule-sources.json 指定的同一 MetaCubeX 上游，复用缓存并保留手动更新，避免依赖其私人 VPS 占位地址。

## 使用

1. 备份全局扩展和应用设置。
2. 在 [Script.js](skills/claude-clash/templates/Script.js) 中填写完整首选节点名 PREFERRED_NODE_KEYWORD、日常代理组 DEFAULT_DNS_PROXY_GROUP（留空沿用原订阅 MATCH 组），合并 CUSTOM_DIRECT_SUFFIXES、CUSTOM_DIRECT_KEYWORDS、CUSTOM_NAMESERVER_POLICY。INCLUDE_TAIWAN_RESIDENTIAL=true 追加台湾家宽本地候选。
3. 合并到全局扩展脚本。必须从原订阅生成，不能以历史最终配置为输入。
4. 本地加载后，核对 rule 模式、实际规则和当前节点，保留现有 TUN/监听设置。
5. 网络及登录由用户自行验收，Agent 不启动或请求 Claude，不做联网探测。

离线工具需要 Node.js、Python 3，按需运行；用户要求跳过时不执行：

    python3 -m venv .venv
    .venv/bin/python -m pip install -r requirements.txt
    bash tests/run-offline-tests.sh
    bash skills/claude-clash/scripts/check-env.sh --offline --config /path/to/final.yaml --json

状态及退出码：PASS/0、FAIL/1、UNKNOWN/2。文件通过不代表内核已加载或账号验证成功。

- [Agent Skill](skills/claude-clash/SKILL.md)
- [来源及适配说明](skills/claude-clash/references/design-and-troubleshooting.md)
- [上游规则/DNS 快照](tests/fixtures/xiaoxiaodong-claude.json)

国内直连与节点引导解析有意保留国内 DNS；通用检测结果需结合实际查询域名判断。配置不保证代理不可识别或账号免于风控。
