/**
 * Clash Verge Rev / Mihomo 全局扩展脚本。
 * 用于代理环境下的 Claude 网络优化：稳定同出口，减少旁路和出口混用。
 * 只变换传入配置；不启动程序、不发请求。保存/重载前关闭相关客户端和网页。
 * Claude 网络环境优先：多层域名兜底、共享服务同出口、关闭内核/DNS IPv6。
 */
const CLAUDE_POLICY = {
  group: "🦀 Claude",
  // 只列在线规则集之外的补充域名，核心域名由 Anthropic 规则集和关键词覆盖。
  suffixes: ["sentry.io", "statsig.com", "statsigapi.net", "segment.io", "featuregates.org",
    "featureassets.org", "datadoghq.com", "intercom.io", "intercomcdn.com"],
  exact: ["anthropic.com.cdn.cloudflare.net", "anthropic.auth0.com", "anthropic-com.ghost.io",
    "cdn.usefathom.com", "challenges.cloudflare.com", "browser-intake-us5-datadoghq.com"],
  // 强标识与关联遥测宁可多匹配，不因缩小其他网站影响而遗漏。
  keywords: ["claude", "anthropic", "datadog", "sentry", "sift"],
  keywordRuleSet: "claude-clash-strong-keywords",
  domainRuleSet: "claude-clash-anthropic",
  domainRuleUrl: "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/anthropic.yaml",
  // 国内直连/节点引导沿用小小东；默认和管理域名 DNS 按用户确认经 Claude 组。
  domesticResolvers: ["https://dns.alidns.com/dns-query", "https://doh.pub/dns-query"],
  overseasResolvers: ["https://1.1.1.1/dns-query", "https://8.8.8.8/dns-query"],
  bootstrapResolvers: ["223.5.5.5", "119.29.29.29"],
  dnsSuffixes: ["anthropic.com", "clau.de", "claude.ai", "claude.com", "claudeusercontent.com"],
  dnsFilter: ["*.lan", "+.local", "+.msftconnecttest.com", "+.msftncsi.com"],
  stun: ["stun.l.google.com", "stun1.l.google.com", "stun2.l.google.com",
    "stun3.l.google.com", "stun4.l.google.com", "stun.cloudflare.com"],
  cidrs: [["IP-CIDR", "160.79.104.0/21"], ["IP-CIDR6", "2607:6bc0::/32"]]
};

function splitRule(rule) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < rule.length; i++) {
    if (rule[i] === "(") depth++;
    if (rule[i] === ")") depth--;
    if (depth < 0) throw new Error("RULE_PARENTHESES_INVALID");
    if (rule[i] === "," && depth === 0) { parts.push(rule.slice(start, i).trim()); start = i + 1; }
  }
  if (depth !== 0) throw new Error("RULE_PARENTHESES_INVALID");
  parts.push(rule.slice(start).trim());
  return parts;
}
function ruleTargetIndex(parts) {
  if (parts[0] === "SUB-RULE") return -1;
  let i = parts.length - 1;
  while (i > 0 && ["no-resolve", "src"].includes(parts[i])) i--;
  return i;
}
function claudeIpFallback(parts) {
  return CLAUDE_POLICY.cidrs.some(([kind, cidr]) => parts[0] === kind && parts[1] === cidr &&
    parts[2] === (kind === "IP-CIDR6" ? "REJECT" : CLAUDE_POLICY.group) && !parts.includes("src"));
}
function migrateRule(rule, migrateLegacy) {
  // 按用户要求，仅 Claude IP 兜底保留 no-resolve，包括子规则中的其他项都移除此参数。
  const parts = splitRule(rule.replace(/,no-resolve(?=[,)]|$)/g, "")), i = ruleTargetIndex(parts);
  if (migrateLegacy && i > 0 && parts[i] === "Claude") parts[i] = CLAUDE_POLICY.group;
  if (claudeIpFallback(parts)) parts.push("no-resolve");
  return parts.join(",");
}
function domainMatchers() {
  const p = CLAUDE_POLICY;
  return [...p.suffixes.map(d => `DOMAIN-SUFFIX,${d}`), ...p.exact.map(d => `DOMAIN,${d}`),
    ...p.keywords.map(d => `DOMAIN-KEYWORD,${d}`), `RULE-SET,${p.domainRuleSet}`];
}
function udpReject(matcher) { return `AND,((NETWORK,udp),(${matcher})),REJECT`; }
function managedRules(stunMode) {
  const p = CLAUDE_POLICY;
  const guards = [...domainMatchers(), ...p.cidrs.map(([t, c]) => `${t},${c}`)]
    .map(udpReject);
  const ipv6Guards = domainMatchers().map(m =>
    `AND,((${m}),(IP-CIDR6,::/0)),REJECT`);
  const stunRules = [];
  for (const host of stunMode === "OFF" ? [] : p.stun) {
    if (stunMode === "PROXY") {
      stunRules.push(`AND,((NETWORK,udp),(DOMAIN,${host})),${p.group}`);
    }
    // UDP 不支持时也不允许继续落入后面的 DIRECT/MATCH。
    stunRules.push(udpReject(`DOMAIN,${host}`));
  }
  return [...guards, ...ipv6Guards, ...stunRules,
    ...domainMatchers().map(m => `${m},${p.group}`),
    ...p.cidrs.map(([t, c]) => `${t},${c},${t === "IP-CIDR6" ? "REJECT" : p.group},no-resolve`)];
}
function managedDnsKey(key) {
  const d = key.toLowerCase().replace(/^[+*.]+/, "");
  if (/^(geosite|rule-set):/.test(d)) return false;
  return [...CLAUDE_POLICY.dnsSuffixes, ...CLAUDE_POLICY.suffixes].some(s => d === s || d.endsWith("." + s)) ||
    CLAUDE_POLICY.exact.includes(d) || CLAUDE_POLICY.keywords.some(k => d.includes(k));
}
function keywordProviderDefinition() {
  return {type: "inline", behavior: "classical", format: "yaml",
    payload: CLAUDE_POLICY.keywords.map(k => `DOMAIN-KEYWORD,${k}`)};
}
function validKeywordProvider(provider) {
  const expected = keywordProviderDefinition();
  return !!provider && provider.type === expected.type && provider.behavior === expected.behavior &&
    provider.format === expected.format && Array.isArray(provider.payload) &&
    provider.payload.length === expected.payload.length && expected.payload.every(r => provider.payload.includes(r));
}
function installKeywordProvider(config) {
  if (config["rule-providers"] !== undefined &&
    (!config["rule-providers"] || typeof config["rule-providers"] !== "object" || Array.isArray(config["rule-providers"]))) {
    throw new Error("RULE_PROVIDERS_INVALID");
  }
  config["rule-providers"] = config["rule-providers"] || {};
  const key = CLAUDE_POLICY.keywordRuleSet;
  if (Object.prototype.hasOwnProperty.call(config["rule-providers"], key)) {
    const provider = config["rule-providers"][key];
    const legacy = provider && provider.type === "inline" && provider.behavior === "classical" &&
      provider.format === "yaml" && Array.isArray(provider.payload) && provider.payload.length === 2 &&
      ["DOMAIN-KEYWORD,claude", "DOMAIN-KEYWORD,anthropic"].every(r => provider.payload.includes(r));
    if (legacy) provider.payload = keywordProviderDefinition().payload;
    else if (!validKeywordProvider(provider)) throw new Error("KEYWORD_PROVIDER_NAME_COLLISION");
  } else config["rule-providers"][key] = keywordProviderDefinition();
}
function domainProviderDefinition() {
  // 0 关闭内核定时刷新；无有效缓存时仍需首次下载，后续由用户手动更新。
  return {type: "http", behavior: "domain", format: "yaml", url: CLAUDE_POLICY.domainRuleUrl,
    path: "./rule-providers/claude-clash-anthropic.yaml", interval: 0, proxy: CLAUDE_POLICY.group};
}
function validDomainProvider(provider) {
  return !!provider && Object.entries(domainProviderDefinition()).every(([key, value]) => provider[key] === value);
}
function installDomainProvider(config) {
  const key = CLAUDE_POLICY.domainRuleSet;
  if (Object.prototype.hasOwnProperty.call(config["rule-providers"], key)) {
    const provider = config["rule-providers"][key];
    // 兼容本项目先前的每日更新定义；同名其他来源仍停止，避免覆盖个人规则。
    if (provider && provider.interval === 86400 && validDomainProvider(Object.assign({}, provider, {interval: 0}))) {
      provider.interval = 0;
    } else if (!validDomainProvider(provider)) throw new Error("DOMAIN_PROVIDER_NAME_COLLISION");
  } else config["rule-providers"][key] = domainProviderDefinition();
}
function claudeResolvers() {
  return CLAUDE_POLICY.overseasResolvers.map(value => `${value}#${CLAUDE_POLICY.group}`);
}
function resolverProxy(value) {
  if (typeof value !== "string" || !value.includes("#")) return null;
  const fragment = value.slice(value.indexOf("#") + 1).split("&")[0];
  if (!fragment || fragment.includes("=")) return null;
  try { return decodeURIComponent(fragment); } catch { return fragment; }
}
function mapResolvers(dns, mapper) {
  const mapValue = value => Array.isArray(value) ? value.map(mapValue) :
    typeof value === "string" ? mapper(value) : value;
  for (const key of ["nameserver", "fallback", "default-nameserver", "proxy-server-nameserver", "direct-nameserver"]) {
    if (dns[key] !== undefined) dns[key] = mapValue(dns[key]);
  }
  for (const key of ["nameserver-policy", "proxy-server-nameserver-policy"]) {
    if (dns[key] && typeof dns[key] === "object" && !Array.isArray(dns[key])) {
      for (const domain of Object.keys(dns[key])) dns[key][domain] = mapValue(dns[key][domain]);
    }
  }
}
function migrateOtherReferences(config) {
  const rename = object => {
    if (object && object["dialer-proxy"] === "Claude") object["dialer-proxy"] = CLAUDE_POLICY.group;
  };
  for (const object of [...(config.proxies || []), ...(config["proxy-groups"] || [])]) rename(object);
  for (const kind of ["proxy-providers", "rule-providers"]) {
    for (const definition of Object.values(config[kind] || {})) {
      rename(definition.override);
      if (definition.proxy === "Claude") definition.proxy = CLAUDE_POLICY.group;
    }
  }
  if (config.dns) mapResolvers(config.dns, value => {
    if (resolverProxy(value) !== "Claude") return value;
    const hash = value.indexOf("#"), suffix = value.indexOf("&", hash);
    return value.slice(0, hash + 1) + CLAUDE_POLICY.group + (suffix < 0 ? "" : value.slice(suffix));
  });
}
function proxyDependencies(config) {
  const proxies = config.proxies || [], groups = config["proxy-groups"] || [], providers = config["proxy-providers"] || {};
  const builtins = ["DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL"];
  const names = new Set([...builtins, ...proxies.map(p => p.name), ...groups.map(g => g.name)]);
  const graph = new Map(); let dangling = 0;
  function edge(key, ref) {
    if (!ref) return;
    if (typeof ref !== "string" || !names.has(ref)) { dangling++; return; }
    if (!builtins.includes(ref)) graph.get(key).push("node:" + ref);
  }
  for (const item of [...proxies, ...groups]) graph.set("node:" + item.name, []);
  for (const provider of Object.keys(providers)) graph.set("provider:" + provider, []);
  for (const item of [...proxies, ...groups]) edge("node:" + item.name, item["dialer-proxy"]);
  for (const g of groups) {
    const key = "node:" + g.name;
    for (const member of g.proxies || []) edge(key, member);
    const use = g["include-all"] || g["include-all-providers"] ? Object.keys(providers) : g.use || [];
    for (const provider of use) {
      if (!Object.prototype.hasOwnProperty.call(providers, provider)) dangling++;
      else graph.get(key).push("provider:" + provider);
    }
    if (g["include-all"] || g["include-all-proxies"]) for (const proxy of proxies) edge(key, proxy.name);
  }
  for (const [name, definition] of Object.entries(providers)) {
    edge("provider:" + name, definition.override && definition.override["dialer-proxy"]);
    edge("provider:" + name, definition.proxy);
  }
  for (const definition of Object.values(config["rule-providers"] || {})) {
    if (definition.proxy && !names.has(definition.proxy)) dangling++;
    if (definition.override && definition.override["dialer-proxy"] && !names.has(definition.override["dialer-proxy"])) dangling++;
  }
  const visiting = new Set(), visited = new Set();
  function visit(key) {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    for (const child of graph.get(key) || []) if (visit(child)) return true;
    visiting.delete(key); visited.add(key); return false;
  }
  return {dangling, cycle: [...graph.keys()].some(visit)};
}
function main(input, profileName, overrides) {
  // 用户参数。第三个参数仅供离线工具/测试使用，Verge 调用只需 main(config)。
  const PREFERRED_NODE_KEYWORD = "";
  // 默认拒绝六个已知公共 STUN 的 UDP；可能影响使用同域名的网页音视频。
  const STUN_MODE = "REJECT";
  // 按需合并用户已有的直连域名。
  const CUSTOM_DIRECT_SUFFIXES = [];
  const CUSTOM_DIRECT_KEYWORDS = [];
  const CUSTOM_NAMESERVER_POLICY = {};
  const options = Object.assign({preferred: PREFERRED_NODE_KEYWORD, stunMode: STUN_MODE,
    directSuffixes: CUSTOM_DIRECT_SUFFIXES, directKeywords: CUSTOM_DIRECT_KEYWORDS,
    nameserverPolicy: CUSTOM_NAMESERVER_POLICY}, overrides || {});
  if (!["OFF", "REJECT", "PROXY"].includes(options.stunMode)) throw new Error("STUN_MODE_INVALID");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("CONFIG_INVALID");
  const config = JSON.parse(JSON.stringify(input));
  installKeywordProvider(config);
  installDomainProvider(config);
  const proxies = config.proxies || [], groups = config["proxy-groups"] || [];
  if (!Array.isArray(proxies) || !Array.isArray(groups)) throw new Error("PROXY_SCHEMA_INVALID");
  const names = [...proxies, ...groups].map(p => p.name);
  if (names.some(n => typeof n !== "string") || new Set(names).size !== names.length) throw new Error("PROXY_NAMES_INVALID");
  if (proxies.some(p => p.name === CLAUDE_POLICY.group)) throw new Error("CLAUDE_GROUP_NAME_COLLISION");
  const supported = proxies.filter(p => !["direct", "reject", "compatible", "pass"]
    .includes(String(p.type || "").toLowerCase())).map(p => p.name);
  const providerConfig = config["proxy-providers"] || {};
  if (typeof providerConfig !== "object" || Array.isArray(providerConfig)) throw new Error("PROVIDERS_INVALID");
  const providers = Object.keys(providerConfig);
  const preferred = options.preferred ? supported.filter(n => n === options.preferred) : [];
  if (options.preferred && !preferred.length && !providers.length) throw new Error("PREFERRED_NODE_NOT_FOUND");
  if (!supported.length && !providers.length) throw new Error("NO_ELIGIBLE_PROXY");
  // 只采用明确选择，不再按地区/家宽等标签猜测；无明确选择时先拒绝，等待手动选择。
  const ordered = options.preferred ? preferred : supported;
  const group = {name: CLAUDE_POLICY.group, type: "select", proxies: [...ordered, "REJECT"],
    "empty-fallback": "REJECT", "default-selected": preferred[0] || "REJECT"};
  if (providers.length && !preferred.length) group.use = providers;
  const legacy = groups.some(g => g.name === "Claude");
  config["proxy-groups"] = [group, ...groups.filter(g => g.name !== "Claude" && g.name !== group.name)
    .map(g => {
      const copied = Object.assign({}, g, g.proxies ? {proxies: g.proxies.map(n => legacy && n === "Claude" ? group.name : n)} : {});
      if (legacy && copied["default-selected"] === "Claude") copied["default-selected"] = group.name;
      return copied;
    })];
  // 若 Claude 是一个真实节点名而不是旧组，保留对该节点的引用。
  const rules = managedRules(options.stunMode);
  const direct = [...options.directKeywords.map(k => `DOMAIN-KEYWORD,${k},DIRECT`),
    ...options.directSuffixes.map(s => `DOMAIN-SUFFIX,${s},DIRECT`)];
  const keys = new Set([...rules, ...direct].map(r => splitRule(r).slice(0, 2).join(",")));
  if (config.rules !== undefined && !Array.isArray(config.rules)) throw new Error("RULES_INVALID");
  const retained = (config.rules || []).map(r => migrateRule(r, legacy)).filter(r =>
    !keys.has(splitRule(r).slice(0, 2).join(",")));
  config.rules = [...new Set([...rules, ...direct, ...retained])];
  if (config["sub-rules"]) {
    for (const key of Object.keys(config["sub-rules"])) {
      config["sub-rules"][key] = config["sub-rules"][key].map(r => migrateRule(r, legacy));
    }
  }
  config.dns = config.dns || {};
  const dns = config.dns;
  if (typeof dns !== "object" || Array.isArray(dns)) throw new Error("DNS_INVALID");
  if (legacy) migrateOtherReferences(config);
  config.ipv6 = false;
  Object.assign(dns, {enable: true, ipv6: false, "enhanced-mode": "fake-ip",
    "cache-algorithm": "arc", "prefer-h3": false, "respect-rules": true,
    "direct-nameserver-follow-policy": true,
    "fake-ip-filter-mode": "blacklist", "fake-ip-filter": [...CLAUDE_POLICY.dnsFilter],
    "fake-ip-range": "198.18.0.1/16",
    "default-nameserver": [...CLAUDE_POLICY.bootstrapResolvers],
    nameserver: claudeResolvers(),
    "direct-nameserver": [...CLAUDE_POLICY.domesticResolvers],
    "proxy-server-nameserver": [...CLAUDE_POLICY.domesticResolvers]});
  delete dns["fake-ip-range6"];
  // 原有 fallback、节点专用解析策略保留，不再无差别清空。
  const resolvers = claudeResolvers(dns["prefer-h3"]);
  if (dns["nameserver-policy"] && (typeof dns["nameserver-policy"] !== "object" || Array.isArray(dns["nameserver-policy"]))) {
    throw new Error("DNS_POLICY_INVALID");
  }
  const oldPolicy = Object.assign(Object.create(null), dns["nameserver-policy"] || {}, options.nameserverPolicy);
  const policy = Object.create(null);
  // DNS 规则集优先于旧精确域名/geosite 策略；默认及管理域名绑定已确认的代理组。
  const keywordPolicyKey = `rule-set:${CLAUDE_POLICY.keywordRuleSet}`;
  const domainPolicyKey = `rule-set:${CLAUDE_POLICY.domainRuleSet}`;
  policy[keywordPolicyKey] = resolvers;
  for (const domain of [...CLAUDE_POLICY.dnsSuffixes, ...CLAUDE_POLICY.suffixes]) policy[`+.${domain}`] = resolvers;
  for (const domain of CLAUDE_POLICY.exact) policy[domain] = resolvers;
  policy[domainPolicyKey] = resolvers;
  for (const key of Object.keys(oldPolicy)) {
    if (key === keywordPolicyKey || key === domainPolicyKey) continue;
    // 字面域名可用逗号合并；只改命中项，避免把同一键中的无关域名一起改成专属 DNS。
    const parts = /^(geosite|rule-set):/i.test(key) ? [key] : key.split(",").map(k => k.trim());
    if (parts.some(managedDnsKey)) {
      for (const domain of parts) policy[domain] = managedDnsKey(domain) ? resolvers : oldPolicy[key];
    } else policy[key] = oldPolicy[key];
  }
  dns["nameserver-policy"] = policy;
  const dependencies = proxyDependencies(config);
  if (dependencies.dangling) throw new Error("PROXY_DEPENDENCY_REFERENCE_INVALID");
  if (dependencies.cycle) throw new Error("PROXY_DEPENDENCY_CYCLE");
  return config;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {main, policy: CLAUDE_POLICY, splitRule, ruleTargetIndex, claudeIpFallback,
    managedRules, managedDnsKey, udpReject, proxyDependencies, mapResolvers, resolverProxy,
    claudeResolvers, domainMatchers, keywordProviderDefinition, validKeywordProvider,
    domainProviderDefinition, validDomainProvider};
}
