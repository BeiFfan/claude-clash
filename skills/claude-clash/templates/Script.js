/**
 * claude-clash — Clash Verge Rev (Mihomo) 全局扩展脚本通用模板
 *
 * 参考标准：
 * - Claude AI IP 风险检测：https://ip.net.coffee/claude/
 * - Claude Code 域名分流规则大全：https://ip.net.coffee/claude/site.html
 * - Claude Code 稳定使用指南（11 项关键配置）：https://ip.net.coffee/claude/claudecode.html
 *
 * ⚠️ 重要安全准则：
 * 在保存/启用本脚本、切换节点或开关 TUN 模式前，请务必确保 Claude（桌面客户端、
 * 终端 Claude Code CLI、浏览器 claude.ai 标签页）处于【完全关闭】状态，防止会话中途 IP 跳变触发风控！
 */

function main(config, profileName) {
  // ==========================================
  // 用户可自定义参数区
  // ==========================================
  const CLAUDE_GROUP = "🦀 Claude";

  // 首选节点匹配关键词（留空 "" 则不特定置顶；可填如 "台湾家宽"、"美国"、"日本" 等）
  const PREFERRED_NODE_KEYWORD = "";

  // 是否优先仅筛选名称中带「家宽 / 住宅 / Residential / ISP / 原生」的节点进入 Claude 策略组
  // 若设为 true 但订阅中没有此类节点，会自动回退为所有非禁区节点
  const PREFER_RESIDENTIAL_ONLY = true;

  // 排除 Anthropic 不支持的地区关键词（CN/HK/MO/RU/BY/KP/IR/SY/CU）
  const EXCLUDE_REGION_KEYWORDS = [
    "香港", "HK", "Hong Kong",
    "澳门", "MO", "Macau",
    "中国", "CN", "China",
    "俄罗斯", "RU", "Russia",
    "白俄罗斯", "BY", "Belarus",
    "朝鲜", "KP", "伊朗", "IR", "叙利亚", "SY", "古巴", "CU"
  ];

  // WebRTC STUN 处理模式（对应 11 项关键配置之「强制 TCP，远离 UDP」）：
  // - "REJECT"（默认推荐）：在 Clash 网络层拦截 STUN UDP 探测与 QUIC，不改浏览器设置即可防止
  //   机场「链式家宽节点」（TCP 走家宽、UDP 落回前置机房）暴露不一致的机房 UDP IP。
  // - "PROXY"：将 STUN 流量路由至 🦀 Claude 策略组（仅适用于 TCP 与 UDP 出口 IP 完全一致的单跳原生节点）。
  const STUN_MODE = "REJECT";

  // 是否强制关闭 IPv6（对应 11 项关键配置之「禁用 IPv6」，防止双栈分流泄露与 Happy Eyeballs 超时卡顿）
  const DISABLE_IPV6 = true;

  // 自定义直连域名后缀（例如学校内网、论文数据库、常用国内网站等，订阅更新后自动保留）
  const CUSTOM_DIRECT_SUFFIXES = [
    // 默认放行 ip.net.coffee 用于检测「中国出口 IPv4」的国内测速源，确保三出口分流对比准确
    "ip138.com",
    "ip.cn"
  ];

  // 自定义直连域名关键词
  const CUSTOM_DIRECT_KEYWORDS = [
    // "example"
  ];

  // 自定义专用 DNS 映射（例如校园网内网 DNS，格式: { "+.example.edu.cn": "202.x.x.x" }）
  const CUSTOM_NAMESERVER_POLICY = {};

  // ==========================================
  // 0. 全局基础防风控参数（TLS 指纹伪装 & 禁用 IPv6）
  // ==========================================
  // 关键配置 #4：TLS 指纹模拟 Chrome 浏览器，避免代理客户端裸握手特征
  config["client-fingerprint"] = config["client-fingerprint"] || "chrome";

  // 关键配置 #6：严格禁用 IPv6，消除 IPv6 绕过代理直连或双栈出口分裂
  if (DISABLE_IPV6) {
    config.ipv6 = false;
  }

  // ==========================================
  // 1. 构建独立的「🦀 Claude」手动选择策略组（关键配置 #2 & #7）
  //    固定使用 select 类型，严禁使用 url-test 自动跳变 IP
  // ==========================================
  const allProxies = (config.proxies || []).map(p => p.name);
  const supportedProxies = allProxies.filter(
    name => !EXCLUDE_REGION_KEYWORDS.some(kw => name.toUpperCase().includes(kw.toUpperCase()))
  );
  const basePool = supportedProxies.length ? supportedProxies : allProxies;

  const residentialRegex = /家宽|住宅|residential|isp|原生/i;
  const residentialNodes = PREFER_RESIDENTIAL_ONLY
    ? basePool.filter(name => residentialRegex.test(name))
    : [];
  const candidateNodes = residentialNodes.length ? residentialNodes : basePool;

  if (candidateNodes.length) {
    let ordered = candidateNodes;
    if (PREFERRED_NODE_KEYWORD) {
      const matched = candidateNodes.filter(n => n.includes(PREFERRED_NODE_KEYWORD));
      const rest = candidateNodes.filter(n => !n.includes(PREFERRED_NODE_KEYWORD));
      if (matched.length) {
        ordered = [...matched, ...rest];
      }
    }

    const existingGroups = config["proxy-groups"] || [];
    const otherGroups = existingGroups.filter(
      g => g.name !== CLAUDE_GROUP && g.name !== "Claude"
    );

    config["proxy-groups"] = [
      { name: CLAUDE_GROUP, type: "select", proxies: ordered },
      ...otherGroups
    ];
  }

  // ==========================================
  // 2. 域名清单定义（参考 https://ip.net.coffee/claude/site.html）
  // ==========================================
  // 2.1 后缀匹配域名（覆盖主站、MCP、Sentry 错误监控、Statsig/Segment 遥测、Intercom 客服）
  const claudeSuffixDomains = [
    // 核心域名（已覆盖 *.anthropic.com 如 cdn/mcp/console/workbench.anthropic.com）
    "anthropic.com",
    "claude.ai",
    "claude.com",
    "clau.de",
    "claude.dev",
    "claude.app",
    "claudemcpclient.com",
    "claudemcpcontent.com",
    "claudeusercontent.com",
    // 监控、风控、A/B 测试与遥测上报（必须与主站走同一出口，防止双路径暴露真实 IP）
    "sentry.io",
    "statsig.com",
    "statsigapi.net",
    "featuregates.org",
    "featureassets.org",
    "segment.io",
    "datadoghq.com",
    // 客服与第三方组件
    "intercom.io",
    "intercomcdn.com"
  ];

  // 2.2 精确匹配域名（CDN 边缘域名、Auth0 登录认证、Datadog 独立根域名、Turnstile 验证）
  const claudeExactDomains = [
    // CDN 与静态资源
    "servd-anthropic-website.b-cdn.net",
    "anthropic.com.cdn.cloudflare.net",
    // Auth0 身份认证与官方内容系统
    "anthropic.auth0.com",
    "anthropic-com.ghost.io",
    // Datadog RUM 遥测（根域名含连字符，DOMAIN-SUFFIX,datadoghq.com 无法命中，必须精确匹配）
    "browser-intake-us5-datadoghq.com",
    // 第三方统计与 Cloudflare Turnstile 人机验证
    "cdn.usefathom.com",
    "challenges.cloudflare.com"
  ];

  // 2.3 关键词兜底（覆盖 Datadog 多区域节点 us3/eu1/ap1、Sentry、Sift 反欺诈）
  const claudeKeywordDomains = [
    "claude",
    "anthropic",
    "datadog",
    "sentry",
    "sift"
  ];

  // 2.4 常用海外 WebRTC STUN 域名
  const stunDomains = [
    "stun.l.google.com",
    "stun1.l.google.com",
    "stun2.l.google.com",
    "stun3.l.google.com",
    "stun4.l.google.com",
    "stun.cloudflare.com"
  ];

  // ==========================================
  // 3. DNS 防污染与防泄露配置（关键配置 #5）
  // ==========================================
  config.dns = config.dns || {};
  config.dns.enable = true;
  config.dns["enhanced-mode"] = "fake-ip";
  config.dns["prefer-h3"] = false;
  config.dns["respect-rules"] = true;
  if (DISABLE_IPV6) {
    config.dns.ipv6 = false;
  }

  // 国内与节点服务器解析使用高可用国内 DoH，避免 127.0.0.1:7874 自环或解析死锁
  const cnDoH = [
    "https://223.5.5.5/dns-query",
    "https://doh.pub/dns-query"
  ];
  config.dns.nameserver = cnDoH;
  config.dns["direct-nameserver"] = cnDoH;
  config.dns["direct-nameserver-follow-policy"] = true;
  config.dns["proxy-server-nameserver"] = cnDoH;

  // 从 fake-ip-filter 中移除 stun.*，让 WebRTC STUN 请求走 Fake-IP 并命中分流/拦截规则
  if (Array.isArray(config.dns["fake-ip-filter"])) {
    config.dns["fake-ip-filter"] = config.dns["fake-ip-filter"].filter(
      item => !String(item).includes("stun.")
    );
  }

  config.dns["nameserver-policy"] = config.dns["nameserver-policy"] || {};

  // 合并用户自定义专用 DNS
  for (const [domainKey, dnsVal] of Object.entries(CUSTOM_NAMESERVER_POLICY)) {
    config.dns["nameserver-policy"][domainKey] = dnsVal;
  }

  // Claude 及其关联认证/监控/遥测域名强制使用走 🦀 Claude 策略组的海外加密 DoH
  const claudeResolvers = [
    `https://1.1.1.1/dns-query#${CLAUDE_GROUP}`,
    `https://8.8.8.8/dns-query#${CLAUDE_GROUP}`
  ];

  for (const domain of claudeSuffixDomains) {
    config.dns["nameserver-policy"][`+.${domain}`] = claudeResolvers;
  }
  for (const domain of claudeExactDomains) {
    config.dns["nameserver-policy"][domain] = claudeResolvers;
  }
  if (STUN_MODE === "PROXY") {
    for (const domain of stunDomains) {
      config.dns["nameserver-policy"][domain] = claudeResolvers;
    }
  }

  // ==========================================
  // 4. 构建置顶分流规则（关键配置 #3, #7, #8：规则置顶，不混入智能分流）
  // ==========================================
  const stunTarget = STUN_MODE === "PROXY" ? CLAUDE_GROUP : "REJECT";
  const stunRules = [
    ...stunDomains.map(d => `DOMAIN,${d},${stunTarget}`),
    ...(STUN_MODE === "REJECT"
      ? [
          "DST-PORT,3478,REJECT",
          "DST-PORT,19302,REJECT"
        ]
      : [])
  ];

  const claudeRules = [
    // 后缀域名
    ...claudeSuffixDomains.map(d => `DOMAIN-SUFFIX,${d},${CLAUDE_GROUP}`),
    // 精确域名
    ...claudeExactDomains.map(d => `DOMAIN,${d},${CLAUDE_GROUP}`),
    // 关键词兜底（含 datadog / sentry / sift）
    ...claudeKeywordDomains.map(k => `DOMAIN-KEYWORD,${k},${CLAUDE_GROUP}`),
    // WebRTC STUN 规则（REJECT 阻断 UDP 泄露，或 PROXY 走 Claude 节点）
    ...stunRules,
    // Anthropic 官方 AS399358 IPv4 (/21) 与 IPv6 (/32) 全量网段兜底（带 no-resolve）
    `IP-CIDR,160.79.104.0/21,${CLAUDE_GROUP},no-resolve`,
    `IP-CIDR,160.79.104.0/23,${CLAUDE_GROUP},no-resolve`,
    `IP-CIDR6,2607:6bc0::/32,${CLAUDE_GROUP},no-resolve`
  ];

  const directRules = [
    ...CUSTOM_DIRECT_KEYWORDS.map(k => `DOMAIN-KEYWORD,${k},DIRECT`),
    ...CUSTOM_DIRECT_SUFFIXES.map(s => `DOMAIN-SUFFIX,${s},DIRECT`)
  ];

  // 提取已由前置规则接管的匹配键（类型+目标），用于剔除订阅自带的冲突旧规则
  const managedRuleKeys = new Set(
    [...claudeRules, ...directRules].map(r => r.split(",").slice(0, 2).join(","))
  );

  // ==========================================
  // 5. 整合订阅自带规则并修复 GEOIP,CN DNS 泄露
  // ==========================================
  const originalRules = Array.isArray(config.rules) ? config.rules : [];

  const filteredRules = originalRules
    .filter(rule => {
      if (directRules.includes(rule) || claudeRules.includes(rule)) {
        return false;
      }
      if (rule.endsWith(",Claude") || rule.endsWith(`,${CLAUDE_GROUP}`)) {
        return false;
      }
      const parts = rule.split(",");
      const key = parts.slice(0, 2).join(",");
      // 移除订阅自带的同域名/同IP段冲突规则（含广告拦截组误杀的 api.statsig.com / sentry / datadog）
      if (
        managedRuleKeys.has(key) ||
        key === "IP-CIDR,2607:6bc0::/48" ||
        key === "IP-CIDR6,2607:6bc0::/48" ||
        key === "IP-CIDR,2607:6bc0:11::/48" ||
        key === "IP-CIDR6,2607:6bc0:11::/48" ||
        key === "DOMAIN,api.statsig.com" ||
        key === "DOMAIN-SUFFIX,sentry.io" ||
        key === "DOMAIN-SUFFIX,datadoghq.com"
      ) {
        return false;
      }
      return true;
    })
    .map(rule => {
      // 防 DNS 泄露：给所有 GEOIP,CN 规则强制补上 no-resolve
      if (rule.startsWith("GEOIP,CN,") && !rule.endsWith(",no-resolve")) {
        return `${rule},no-resolve`;
      }
      return rule;
    });

  config.rules = [
    ...claudeRules,
    ...directRules,
    ...filteredRules
  ];

  return config;
}
