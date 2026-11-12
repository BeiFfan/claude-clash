/**
 * 小小东规则适配到 Clash Verge：保留台湾家宽手动组与个人配置。
 * 仅变换配置，不启动程序、不发请求。必须以原订阅为输入。
 */
const CLAUDE_POLICY = {
  "group": "🦀 Claude",
  "domainRuleSet": "claude-clash-anthropic",
  "domainRuleUrl": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/anthropic.yaml",
  "sourceRules": [
    "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
    "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,169.254.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,100.64.0.0/10,DIRECT,no-resolve",
    "IP-CIDR6,::1/128,DIRECT,no-resolve",
    "IP-CIDR6,fc00::/7,DIRECT,no-resolve",
    "IP-CIDR6,fe80::/10,DIRECT,no-resolve",
    "DOMAIN-SUFFIX,accounts.google.com,AI-人工智能",
    "DOMAIN,apis.google.com,AI-人工智能",
    "DOMAIN,ogs.google.com,AI-人工智能",
    "DOMAIN-SUFFIX,gstatic.com,AI-人工智能",
    "DOMAIN-SUFFIX,googleusercontent.com,AI-人工智能",
    "DOMAIN,oauth2.googleapis.com,AI-人工智能",
    "DOMAIN,securetoken.googleapis.com,AI-人工智能",
    "DOMAIN,identitytoolkit.googleapis.com,AI-人工智能",
    "RULE-SET,Claude,AI-人工智能",
    "DOMAIN-SUFFIX,anthropic.com,AI-人工智能",
    "DOMAIN-SUFFIX,claude.ai,AI-人工智能",
    "DOMAIN-SUFFIX,claude.com,AI-人工智能",
    "DOMAIN-SUFFIX,clau.de,AI-人工智能",
    "DOMAIN-SUFFIX,claudeusercontent.com,AI-人工智能",
    "DOMAIN-SUFFIX,claudemcpclient.com,AI-人工智能",
    "DOMAIN-SUFFIX,claudemcpcontent.com,AI-人工智能",
    "DOMAIN,servd-anthropic-website.b-cdn.net,AI-人工智能",
    "DOMAIN,cdn.usefathom.com,AI-人工智能",
    "DOMAIN,challenges.cloudflare.com,AI-人工智能",
    "DOMAIN-SUFFIX,statsig.com,AI-人工智能",
    "DOMAIN-SUFFIX,statsigapi.net,AI-人工智能",
    "DOMAIN-SUFFIX,segment.io,AI-人工智能",
    "DOMAIN-SUFFIX,featuregates.org,AI-人工智能",
    "DOMAIN-SUFFIX,featureassets.org,AI-人工智能",
    "DOMAIN-KEYWORD,claude,AI-人工智能",
    "DOMAIN-KEYWORD,anthropic,AI-人工智能"
  ],
  "userRules": [
    "DOMAIN,anthropic.com.cdn.cloudflare.net",
    "DOMAIN,anthropic.auth0.com",
    "DOMAIN,anthropic-com.ghost.io",
    "DOMAIN-SUFFIX,sentry.io",
    "DOMAIN,browser-intake-us5-datadoghq.com",
    "DOMAIN-KEYWORD,datadog",
    "DOMAIN-KEYWORD,sift",
    "DOMAIN-SUFFIX,intercom.io",
    "DOMAIN-SUFFIX,intercomcdn.com",
    "IP-CIDR,160.79.104.0/21,no-resolve",
    "IP-CIDR6,2607:6bc0::/32,no-resolve",
    "IP-ASN,399358,no-resolve"
  ],
  "sourceDns": {
    "cache-algorithm": "arc",
    "default-nameserver": [
      "223.5.5.5",
      "119.29.29.29"
    ],
    "direct-nameserver": [
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query"
    ],
    "direct-nameserver-follow-policy": true,
    "enable": true,
    "enhanced-mode": "fake-ip",
    "fake-ip-filter": [
      "*.lan",
      "+.local",
      "+.msftconnecttest.com",
      "+.msftncsi.com"
    ],
    "fake-ip-range": "198.18.0.1/16",
    "ipv6": false,
    "nameserver": [
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query"
    ],
    "nameserver-policy": {
      "+.accounts.google.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "+.anthropic.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "+.clau.de": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "+.claude.ai": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "+.claude.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "+.claudeusercontent.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "+.googleusercontent.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "+.gstatic.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "accounts.google.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "apis.google.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "challenges.cloudflare.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "identitytoolkit.googleapis.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "oauth2.googleapis.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "ogs.google.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "rule-set:Claude": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ],
      "securetoken.googleapis.com": [
        "https://1.1.1.1/dns-query",
        "https://8.8.8.8/dns-query"
      ]
    },
    "prefer-h3": false,
    "proxy-server-nameserver": [
      "https://dns.alidns.com/dns-query",
      "https://doh.pub/dns-query"
    ],
    "respect-rules": true
  }
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

function managedRules() {
  const source=CLAUDE_POLICY.sourceRules.map(rule => rule
    .replace("RULE-SET,Claude,", "RULE-SET,"+CLAUDE_POLICY.domainRuleSet+",")
    .replace(/,AI-人工智能$/, ","+CLAUDE_POLICY.group));
  const extra=CLAUDE_POLICY.userRules.map(rule=>{
    const parts=rule.split(",");parts.splice(2,0,CLAUDE_POLICY.group);return parts.join(",");
  });
  return source.concat(extra);
}
function dnsPreset() {
  const dns = JSON.parse(JSON.stringify(CLAUDE_POLICY.sourceDns));
  dns["nameserver-policy"]["rule-set:"+CLAUDE_POLICY.domainRuleSet] = dns["nameserver-policy"]["rule-set:Claude"];
  delete dns["nameserver-policy"]["rule-set:Claude"];
  return dns;
}
function domainProviderDefinition() {
  // 使用小小东 rule-sources.json 中同一上游；沿用用户要求的手动更新和现有缓存。
  return {type:"http",behavior:"domain",format:"yaml",url:CLAUDE_POLICY.domainRuleUrl,
    path:"./rule-providers/claude-clash-anthropic.yaml",interval:0,proxy:CLAUDE_POLICY.group};
}
function migrateRule(rule, legacy) {
  const parts=splitRule(rule), i=ruleTargetIndex(parts);
  if (legacy && i>0 && parts[i]==="Claude") parts[i]=CLAUDE_POLICY.group;
  return parts.join(",");
}
function main(input, profileName, overrides) {
  const PREFERRED_NODE_KEYWORD = "";
  const INCLUDE_TAIWAN_RESIDENTIAL = true;
  const CUSTOM_DIRECT_SUFFIXES = [];
  const CUSTOM_DIRECT_KEYWORDS = [];
  const CUSTOM_NAMESERVER_POLICY = {};
  const options=Object.assign({preferred:PREFERRED_NODE_KEYWORD,includeTaiwanResidential:INCLUDE_TAIWAN_RESIDENTIAL,
    directSuffixes:CUSTOM_DIRECT_SUFFIXES,directKeywords:CUSTOM_DIRECT_KEYWORDS,nameserverPolicy:CUSTOM_NAMESERVER_POLICY},overrides||{});
  if (!input || typeof input!=="object" || Array.isArray(input)) throw new Error("CONFIG_INVALID");
  const config=JSON.parse(JSON.stringify(input));
  const proxies=config.proxies||[], groups=config["proxy-groups"]||[];
  if (!Array.isArray(proxies)||!Array.isArray(groups)) throw new Error("PROXY_SCHEMA_INVALID");
  const names=[...proxies,...groups].map(p=>p.name);
  if (names.some(n=>typeof n!=="string") || new Set(names).size!==names.length) throw new Error("PROXY_NAMES_INVALID");
  if (proxies.some(p=>p.name===CLAUDE_POLICY.group)) throw new Error("CLAUDE_GROUP_NAME_COLLISION");
  const supported=proxies.filter(p=>!["direct","reject","pass","compatible"].includes(String(p.type||"").toLowerCase())).map(p=>p.name);
  const providers=Object.keys(config["proxy-providers"]||{});
  const preferred=options.preferred?supported.filter(n=>n===options.preferred):[];
  if (options.preferred&&!preferred.length&&!providers.length) throw new Error("PREFERRED_NODE_NOT_FOUND");
  if (!supported.length&&!providers.length) throw new Error("NO_ELIGIBLE_PROXY");
  const extra=options.includeTaiwanResidential?supported.filter(n=>
    /(?:台湾|台灣|\b(?:Taiwan|TW)\b)/i.test(n)&&/(?:家宽|家寬|住宅|Residential)/i.test(n)):[];
  const ordered=[...new Set([...(options.preferred?preferred:supported),...extra])];
  const group={name:CLAUDE_POLICY.group,type:"select",proxies:ordered};
  if (ordered.length) group["default-selected"]=preferred[0]||ordered[0];
  if (providers.length&&!preferred.length) group.use=providers;
  const legacy=groups.some(g=>g.name==="Claude");
  config["proxy-groups"]=[group,...groups.filter(g=>g.name!=="Claude"&&g.name!==group.name).map(g=>{
    const copy=Object.assign({},g,g.proxies?{proxies:g.proxies.map(n=>legacy&&n==="Claude"?group.name:n)}:{});
    if (legacy&&copy["default-selected"]==="Claude") copy["default-selected"]=group.name;
    return copy;
  })];
  if (!config["rule-providers"]) config["rule-providers"]={};
  const key=CLAUDE_POLICY.domainRuleSet, expected=domainProviderDefinition(), existing=config["rule-providers"][key];
  if (existing&&existing.url!==expected.url) throw new Error("DOMAIN_PROVIDER_NAME_COLLISION");
  config["rule-providers"][key]=Object.assign({},existing,expected);
  const personal=[...options.directKeywords.map(k=>"DOMAIN-KEYWORD,"+k+",DIRECT"),
    ...options.directSuffixes.map(s=>"DOMAIN-SUFFIX,"+s+",DIRECT")];
  if (config.rules!==undefined&&!Array.isArray(config.rules)) throw new Error("RULES_INVALID");
  config.rules=[...new Set([...managedRules(),...personal,...(config.rules||[]).map(r=>migrateRule(r,legacy))])];
  if (config["sub-rules"]) for (const k of Object.keys(config["sub-rules"])) config["sub-rules"][k]=config["sub-rules"][k].map(r=>migrateRule(r,legacy));
  const oldDns=config.dns||{}, dns=dnsPreset();
  for (const k of ["listen","use-hosts","use-system-hosts"]) if (oldDns[k]!==undefined) dns[k]=oldDns[k];
  dns["nameserver-policy"]=Object.assign({},oldDns["nameserver-policy"]||{},options.nameserverPolicy||{},dns["nameserver-policy"]);
  config.dns=dns;config.ipv6=false;config.mode="rule";
  if (legacy) migrateOtherReferences(config);
  const deps=proxyDependencies(config);
  if (deps.dangling) throw new Error("PROXY_DEPENDENCY_REFERENCE_INVALID");
  if (deps.cycle) throw new Error("PROXY_DEPENDENCY_CYCLE");
  return config;
}
if (typeof module!=="undefined"&&module.exports) module.exports={
  main,policy:CLAUDE_POLICY,managedRules,dnsPreset,domainProviderDefinition,
  splitRule,ruleTargetIndex,proxyDependencies,mapResolvers,resolverProxy
};
