# claude-clash

将[小小东源模板](https://github.com/BeiFfan/xiaoxiaodong-vps/blob/main/skills/xiaoxiaodong-vps/scripts/server/files/clash-template.yaml)的 Claude 配置适配到 Clash Verge Rev / Mihomo。

## 配置范围

- 原文采用局域网直连、Google 公共认证和 Claude 分流段，保持顺序，只适配策略组及规则集名称。
- DNS 基础字段与对应域名策略使用原值：默认/直连/节点为阿里、腾讯 DoH，指定域名为 Cloudflare/Google DoH，无策略组后缀。
- 沿用源文件 IPv6=false、fake-IP、ARC、关闭 H3 和四项过滤表。
- 不增加 Claude UDP/IPv6/STUN 拒绝、IP 兜底、进程接管或额外验证码/遥测域名，不使用 coffee 补充。
- 保留台湾家宽手动候选、当前节点、个人直连/专用 DNS；原订阅其余规则和 no-resolve 保持。
- 规则集使用源 rule-sources.json 指定的同一 MetaCubeX 上游，复用缓存并保留手动更新，避免依赖其私人 VPS 占位地址。

## 使用

1. 备份全局扩展和应用设置。
2. 在 [Script.js](skills/claude-clash/templates/Script.js) 中填写完整首选节点名 PREFERRED_NODE_KEYWORD，合并 CUSTOM_DIRECT_SUFFIXES、CUSTOM_DIRECT_KEYWORDS、CUSTOM_NAMESERVER_POLICY。INCLUDE_TAIWAN_RESIDENTIAL=true 追加台湾家宽本地候选。
3. 合并到全局扩展脚本。必须从原订阅生成，不能以历史最终配置为输入。
4. 本地加载后，核对 rule 模式、实际规则和当前节点，保留现有 TUN/监听设置。
5. 网络及登录由用户自行验收，Agent 不启动或请求 Claude，不做联网探测。

需要 Node.js、Python 3：

    python3 -m venv .venv
    .venv/bin/python -m pip install -r requirements.txt
    bash tests/run-offline-tests.sh
    bash skills/claude-clash/scripts/check-env.sh --offline --config /path/to/final.yaml --json

状态及退出码：PASS/0、FAIL/1、UNKNOWN/2。文件通过不代表内核已加载或账号验证成功。

- [Agent Skill](skills/claude-clash/SKILL.md)
- [来源及适配说明](skills/claude-clash/references/design-and-troubleshooting.md)
- [上游规则/DNS 快照](tests/fixtures/xiaoxiaodong-claude.json)

默认 DNS 已恢复源文件的国内解析器，通用检测可能显示国内 DNS。配置不保证代理不可识别或账号免于风控。
