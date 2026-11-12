---
name: claude-clash
description: 为 Clash Verge Rev / Mihomo 配置 Claude 固定代理出口、域名与关键词分流、海外 DNS 和 IPv6/UDP 策略，使用离线工具检查并完成本地加载核对。
---

# Claude 网络环境优化

目标是在代理环境下优先保证 Claude 的固定出口与 DNS 路径；共享服务、默认 DNS 和内核 IPv6 对其他网站的影响已明确接受。使用 [模板](templates/Script.js) 和 [离线工具](scripts/check-env.sh)，具体策略见 [配置与验收说明](references/design-and-troubleshooting.md)。

## 准备

- 保留用户当前授权、节点选择和禁止启动/请求 Claude 的限制；仅检查时不修改，已授权部署时完成备份、应用和核对。
- 读取订阅原文、全局 Script/Merge、当前订阅挂载的扩展及应用模式/TUN/DNS/IPv6 设置；不要直接覆盖个人脚本或执行不可信订阅脚本。
- 不输出订阅 URL、服务器地址、密码、UUID、Token 或包含敏感内容的原始解析错误。
- 应用前确认 Claude 客户端、CLI 和网页没有进行中的请求。若宿主本身是 Claude Code，准备候选交付用户退出后应用，不自行终止进程。

## 配置

1. 按用户选定的**完整节点名**填写 `PREFERRED_NODE_KEYWORD`，合并已有 `CUSTOM_DIRECT_SUFFIXES`、`CUSTOM_DIRECT_KEYWORDS`、`CUSTOM_NAMESERVER_POLICY`。`INCLUDE_TAIWAN_RESIDENTIAL = true` 按明确要求追加所有标注台湾家宽的本地节点；当前首选仍排第一，不改变已有选择或自动轮换。名称不是实际地区/住宅属性证明；provider 动态成员另行核对。
2. 从订阅原文生成候选，保留个人逻辑。模板是纯配置变换 `main(config, profileName)`；第三参数仅供离线选项和测试。没有明确选择默认 REJECT，不引入 DIRECT 回退。
3. 保留模板核心策略：在线 Anthropic 规则集、claude/anthropic 与共享服务关键词兜底、共享服务同出口、默认及管理域名海外 DoH 绑定 Claude 组、国内直连/节点及专用 DNS、内核/DNS IPv6 关闭、管理域名 UDP 与六个公共 STUN 防护。hCaptcha 根域名及全部子域名纳入相同分流/DNS/UDP/IPv6 策略，覆盖网页登录验证码。
4. 保持规则集 `interval: 0`，手动更新。no-resolve 只在两条 Claude IP 兜底保留。不得增加整进程接管、进程内网直连例外或仅针对检测页的规则。
5. 核对 rule 模式、TUN、自动路由和 UDP/TCP 53 劫持，审核后续覆写；不为取证开放新控制接口或修改无关系统设置。

## 收尾：离线 → 本地核对 → 用户验收

- 离线：使用已有适用证据；代码改动后运行相称检查，不反复审查。YAML 必须用 PyYAML 解析，缺依赖记未完成。

  ```bash
  bash tests/run-offline-tests.sh
  bash skills/claude-clash/scripts/check-env.sh --offline --config /path/to/final.yaml --json
  ```

- 本地：备份扩展和相关设置后应用；核对完整生成文件、客户端已加载规则/模式及组当前节点，沿嵌套组和 dialer-proxy 核对代理链。失败恢复备份；不切出口、不制造真实断网、不刷新延迟。文件和运行状态分开报告，读不到的字段记 UNKNOWN。
- 网络：用户自行在 ip coffee 验收。Agent 不启动 Claude、不请求 Claude 或 DNS/STUN 探针、不打开检测页。复测看新一轮数据；没有 DNS 样本不能判无泄露，异常先查本地。

报告离线、本地加载和用户手动验收的状态；PASS/FAIL/UNKNOWN 退出码为 0/1/2。不把节点标签、第三方评分、fake-IP 或页面绿灯作为免风控保证。
