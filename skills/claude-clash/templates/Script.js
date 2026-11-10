/**
 * claude-clash — Clash Verge Rev (Mihomo) 全局扩展脚本通用模板
 *
 * 作用：
 * 1. 自动创建独立的「🦀 Claude」策略组（排除港澳等不支持地区），并将首选节点置顶；
 * 2. 将 Claude 核心域名、Cloudflare Turnstile 验证、Statsig/Segment/Fathom 遥测、
 *    Anthropic 官方 IP 段及海外 WebRTC STUN 域名全部前置分流至「🦀 Claude」；
 * 3. 为上述域名配置绑定「#🦀 Claude」的海外加密 DoH，开启 respect-rules，
 *    并为订阅末尾的 GEOIP,CN 自动补齐 no-resolve，彻底防止国内 DNS 泄露與 WebRTC 出口分裂。
 */

function main(config, profileName) {
  // ==========================================
  // 用户可自定义参数区
  // ==========================================
  const CLAUDE_GROUP = "🦀 Claude";

  // 首选节点匹配关键词（留空 "" 则不特定置顶；可填如 "台湾家宽"、"美国"、"日本" 等）
  const PREFERRED_NODE_KEYWORD = "";

  // 是否仅筛选名称中带「家宽 / 住宅 / Residential / ISP」的节点进入 Claude 策略组
  // 若设为 true 但订阅中没有此类节点，会自动回退为所有非禁区节点
  const PREFER_RESIDENTIAL_ONLY = true;

  // 排除 Anthropic 不支持的地区关键词（设为 [] 则不排除）
  const EXCLUDE_REGION_KEYWORDS = ["香港", "HK", "Hong Kong", "澳门", "MO", "Macau", "俄罗斯", "RU", "白俄罗斯", "BY"];

  // 自定义直连域名后缀（例如学校内网、论文数据库、常用国内网站等，订阅更新后自动保留）
  const CUSTOM_DIRECT_SUFFIXES = [
    // "example.edu.cn",
    // "cnki.net"
  ];

  // 自定义直连域名关键词
  const CUSTOM_DIRECT_KEYWORDS = [
    // "example"
  ];

  // 自定义专用 DNS 映射（例如校园网内网 DNS，格式: { "+.example.edu.cn": "202.x.x.x" }）
  const CUSTOM_NAMESERVER_POLICY = {};

  // ==========================================
  // 0. 构建「🦀 Claude」策略组
  // ==========================================
  const allProxies = (config.proxies || []).map(p => p.name);
  const supportedProxies = allProxies.filter(
    name => !EXCLUDE_REGION_KEYWORDS.some(kw => name.toUpperCase().includes(kw.toUpperCase()))
  );
  const basePool = supportedProxies.length ? supportedProxies : allProxies;

  const residentialRegex = /家宽|住宅|residential|isp/i;
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
  // 1. DNS 防污染与防泄露配置
  // ==========================================
  config.dns = config.dns || {};
  config.dns.enable = true;
  config.dns["enhanced-mode"] = "fake-ip";
  config.dns["prefer-h3"] = false;
  config.dns["respect-rules"] = true;

  // 国内与节点服务器解析使用高可用国内 DoH，避免自环或解析死锁
  const cnDoH = [
    "https://223.5.5.5/dns-query",
    "https://doh.pub/dns-query"
  ];
  config.dns.nameserver = cnDoH;
  config.dns["direct-nameserver"] = cnDoH;
  config.dns["direct-nameserver-follow-policy"] = true;
  config.dns["proxy-server-nameserver"] = cnDoH;

  // 从 fake-ip-filter 中移除 stun.*，让 WebRTC STUN 请求走 Fake-IP 并命中域名分流规则
  if (Array.isArray(config.dns["fake-ip-filter"])) {
    config.dns["fake-ip-filter"] = config.dns["fake-ip-filter"].filter(
      item => item !== "stun.*.*" && item !== "stun.*.*.*"
    );
  }

  config.dns["nameserver-policy"] = config.dns["nameserver-policy"] || {};

  // 合并用户自定义专用 DNS
  for (const [domainKey, dnsVal] of Object.entries(CUSTOM_NAMESERVER_POLICY)) {
    config.dns["nameserver-policy"][domainKey] = dnsVal;
  }

  // Claude 及其关联验证/遥测域名强制使用走 🦀 Claude 策略组的海外 DoH
  const claudeResolvers = [
    `https://1.1.1.1/dns-query#${CLAUDE_GROUP}`,
    `https://8.8.8.8/dns-query#${CLAUDE_GROUP}`
  ];

  const claudeSuffixDomains = [
    "anthropic.com",
    "clau.de",
    "claude.ai",
    "claude.com",
    "claude.dev",
    "claude.app",
    "claudemcpclient.com",
    "claudemcpcontent.com",
    "claudeusercontent.com",
    // 风控、特性开关与遥测域名（确保与主站 DNS 及出口 IP 一致）
    "statsig.com",
    "statsigapi.net",
    "featuregates.org",
    "featureassets.org",
    "segment.io",
    "intercom.io",
    "intercomcdn.com"
  ];

  const claudeExactDomains = [
    "servd-anthropic-website.b-cdn.net",
    "cdn.usefathom.com",
    "challenges.cloudflare.com",
    // 海外常用 WebRTC STUN 域名（对齐 UDP 出口 IP）
    "stun.l.google.com",
    "stun1.l.google.com",
    "stun2.l.google.com",
    "stun3.l.google.com",
    "stun4.l.google.com",
    "stun.cloudflare.com"
  ];

  for (const domain of claudeSuffixDomains) {
    config.dns["nameserver-policy"][`+.${domain}`] = claudeResolvers;
  }
  for (const domain of claudeExactDomains) {
    config.dns["nameserver-policy"][domain] = claudeResolvers;
  }

  // ==========================================
  // 2. 构建前置分流规则（Claude 规则 + 自定义直连规则）
  // ==========================================
  const claudeRules = [
    ...claudeSuffixDomains.map(d => `DOMAIN-SUFFIX,${d},${CLAUDE_GROUP}`),
    ...claudeExactDomains.map(d => `DOMAIN,${d},${CLAUDE_GROUP}`),
    `DOMAIN-KEYWORD,claude,${CLAUDE_GROUP}`,
    `DOMAIN-KEYWORD,anthropic,${CLAUDE_GROUP}`,
    // Anthropic 官方 AS399358 IP 段（带 no-resolve）
    `IP-CIDR,160.79.104.0/23,${CLAUDE_GROUP},no-resolve`,
    `IP-CIDR6,2607:6bc0::/48,${CLAUDE_GROUP},no-resolve`,
    `IP-CIDR6,2607:6bc0:11::/48,${CLAUDE_GROUP},no-resolve`
  ];

  const directRules = [
    ...CUSTOM_DIRECT_KEYWORDS.map(k => `DOMAIN-KEYWORD,${k},DIRECT`),
    ...CUSTOM_DIRECT_SUFFIXES.map(s => `DOMAIN-SUFFIX,${s},DIRECT`)
  ];

  // 提取已由 claudeRules 接管的匹配键（类型+目标），用于剔除订阅自带的冲突旧规则
  const claudeRuleKeys = new Set(
    claudeRules.map(r => r.split(",").slice(0, 2).join(","))
  );

  // ==========================================
  // 3. 整合订阅自带规则并修复 GEOIP,CN DNS 泄露
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
      // 移除订阅自带的同域名/同IP段冲突规则（含广告拦截组误杀的 api.statsig.com）
      if (
        claudeRuleKeys.has(key) ||
        key === "IP-CIDR,2607:6bc0::/48" ||
        key === "IP-CIDR,2607:6bc0:11::/48" ||
        key === "DOMAIN,api.statsig.com"
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
