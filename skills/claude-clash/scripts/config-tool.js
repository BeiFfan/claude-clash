#!/usr/bin/env node
// JSON in, findings out. No network, subscription execution, or configuration writes.
const fs = require('node:fs');
const {policy: p, splitRule, ruleTargetIndex, managedRules, managedDnsKey,
  proxyDependencies, mapResolvers, resolverProxy, claudeResolvers, domainMatchers, udpReject,
  validKeywordProvider, validDomainProvider, claudeIpFallback} = require('../templates/Script.js');
const result = (name, status, message) => ({name, status, message});
function aggregate(checks) {
  return checks.some(c => c.status === 'FAIL') ? 'FAIL' : checks.some(c => c.status === 'UNKNOWN') ? 'UNKNOWN' : 'PASS';
}
function inspect(config) {
  const checks = [];
  if (!config || typeof config !== 'object' || Array.isArray(config)) return [result('schema', 'FAIL', '配置须为对象')];
  const proxies = config.proxies || [], groups = config['proxy-groups'] || [], providers = config['proxy-providers'] || {};
  if (!Array.isArray(proxies) || !Array.isArray(groups) || typeof providers !== 'object' || Array.isArray(providers)) {
    return [result('schema', 'FAIL', '节点、策略组或 provider 类型错误')];
  }
  const all = [...proxies, ...groups];
  if (all.some(g => !g || typeof g.name !== 'string') || new Set(all.map(g => g.name)).size !== all.length) {
    return [result('schema', 'FAIL', '节点或策略组名称缺失/重复')];
  }
  const names = new Set(['DIRECT', 'REJECT', 'REJECT-DROP', 'PASS', 'COMPATIBLE', 'GLOBAL', ...all.map(g => g.name)]);
  let dangling = 0;
  const ruleLists = [config.rules || [], ...Object.values(config['sub-rules'] || {})];
  for (const g of groups) {
    if (g.proxies && (!Array.isArray(g.proxies) || g.proxies.some(n => !names.has(n)))) dangling++;
    if (g.use && (!Array.isArray(g.use) || g.use.some(n => !Object.hasOwn(providers, n)))) dangling++;
  }
  try {
    for (const list of ruleLists) {
      if (!Array.isArray(list)) throw new Error();
      for (const rule of list) {
        const parts = splitRule(rule);
        const i = ruleTargetIndex(parts);
        if (i > 0 && !names.has(parts[i])) dangling++;
        if (i < 0 && !Object.hasOwn(config['sub-rules'] || {}, parts[2])) dangling++;
        if (parts[0] === 'RULE-SET' && !Object.hasOwn(config['rule-providers'] || {}, parts[1])) dangling++;
      }
    }
  } catch { dangling++; }
  checks.push(result('references', dangling ? 'FAIL' : 'PASS', dangling ? '存在无效策略/规则引用或规则格式错误' : '所给快照的组成员和规则目标引用完整'));
  try {
    const deps = proxyDependencies(config);
    checks.push(result('proxy_dependencies', deps.dangling || deps.cycle ? 'FAIL' : 'PASS',
      deps.cycle ? '存在策略组、代理链或 provider 依赖环' : deps.dangling ? '代理链或 provider 含无效引用' : '静态代理链引用及依赖关系有效'));
  } catch {
    checks.push(result('proxy_dependencies', 'FAIL', '无法检查代理链/provider 结构'));
  }
  const group = groups.find(g => g.name === p.group);
  const localNames = group?.proxies || [];
  const local = new Map(proxies.map(n => [n.name, n]));
  const badMember = !Array.isArray(localNames) || localNames.some(n => n !== 'REJECT' &&
    (!local.has(n) || ['direct','reject','pass','compatible'].includes(String(local.get(n).type).toLowerCase())));
  const safe = group?.type === 'select' && !badMember && localNames.includes('REJECT') &&
    group['empty-fallback'] === 'REJECT' && localNames.includes(group['default-selected']) &&
    group.filter === undefined && group['exclude-filter'] === undefined;
  checks.push(result('claude_group', safe ? 'PASS' : 'FAIL', safe ? '手动组包含拒绝回退；动态 provider 成员及当前选择仍需现场核对' : '专属组缺失、候选不合格或缺少拒绝回退'));
  const rules = config.rules || [];
  const processScope = /(?:^|\()PROCESS-NAME,(?:Claude|claude)(?:\.exe)?(?=[,)])|PROCESS-PATH-WILDCARD,\*\/Claude\.app\/Contents\/\*/;
  checks.push(result('domain_only_scope', Array.isArray(rules) && !rules.some(r => processScope.test(r)) ? 'PASS' : 'FAIL',
    '仅使用域名、关键词、规则集和 IP 兜底，不再整体接管 Claude 进程'));
  let protectedRules = false;
  if (Array.isArray(rules) && rules.every(r => typeof r === 'string')) {
    const proxyStun = rules.some(r => r === `AND,((NETWORK,udp),(DOMAIN,${p.stun[0]})),${p.group}`);
    const rejectStun = rules.includes(udpReject(`DOMAIN,${p.stun[0]}`));
    const required = managedRules(proxyStun ? 'PROXY' : rejectStun ? 'REJECT' : 'OFF');
    const positions = required.map(r => rules.indexOf(r));
    const last = positions[positions.length - 1];
    const allowedPrefix = r => required.includes(r);
    protectedRules = positions.every((n, i) => n >= 0 && (i === 0 || n > positions[i - 1])) &&
      rules.slice(0, last + 1).every(allowedPrefix);
  }
  checks.push(result('managed_rules_and_udp', protectedRules ? 'PASS' : 'FAIL', protectedRules ? '域名、规则集、关键词的 UDP/IPv6 拒绝与同组分流优先' : '规则缺失、顺序被覆盖或缺少拒绝回退'));
  const ipRulesOK = ruleLists.every(list => Array.isArray(list) && list.every(rule => {
    try {
      const parts = splitRule(rule);
      return !rule.includes(',no-resolve') || (claudeIpFallback(parts) && parts.filter(p => p === 'no-resolve').length === 1);
    } catch { return false; }
  }));
  checks.push(result('ip_rule_dns', ipRulesOK ? 'PASS' : 'FAIL', 'no-resolve 仅保留在 Claude 的两条 IP 兜底规则内'));
  const dns = config.dns || {}, ns = dns['nameserver-policy'] || {};
  let unknownResolver = false;
  mapResolvers(JSON.parse(JSON.stringify(dns)), value => {
    const proxy = resolverProxy(value);
    if (proxy && proxy !== 'RULES' && !names.has(proxy)) unknownResolver = true;
    return value;
  });
  checks.push(result('dns_proxy_references', unknownResolver ? 'UNKNOWN' : 'PASS',
    unknownResolver ? 'DNS 存在未确认的代理/接口引用，不能判引用完整' : 'DNS 中显式代理引用可在所给快照定位'));
  const resolvers = claudeResolvers(dns['prefer-h3']);
  const resolverOK = v => Array.isArray(v) && JSON.stringify(v) === JSON.stringify(resolvers);
  const requiredKeys = [...p.dnsSuffixes.map(d => '+.' + d), ...p.suffixes.map(d => '+.' + d), ...p.exact];
  const keywordPolicyKey = `rule-set:${p.keywordRuleSet}`;
  const domainPolicyKey = `rule-set:${p.domainRuleSet}`;
  const keywordOK = validKeywordProvider(config['rule-providers']?.[p.keywordRuleSet]) &&
    Object.keys(ns)[0] === keywordPolicyKey && resolverOK(ns[keywordPolicyKey]);
  checks.push(result('strong_keyword_dns', keywordOK ? 'PASS' : 'FAIL',
    '强标识及遥测关键词由内联规则集优先使用海外 DNS；连接遵循 respect-rules'));
  const domainOK = validDomainProvider(config['rule-providers']?.[p.domainRuleSet]) && resolverOK(ns[domainPolicyKey]);
  checks.push(result('anthropic_rule_set', domainOK ? 'PASS' : 'FAIL',
    'Anthropic 域名规则集同时用于分流和 DNS，定时刷新关闭，手动更新经专属组；缓存新鲜度未现场验证'));
  let firstMatcher = Object.keys(ns).findIndex(k => k !== keywordPolicyKey && k !== domainPolicyKey && /^(geosite|rule-set):/.test(k));
  if (firstMatcher < 0) firstMatcher = Infinity;
  const nsOK = typeof ns === 'object' && !Array.isArray(ns) && Object.keys(ns).indexOf(domainPolicyKey) < firstMatcher &&
    requiredKeys.every(k => resolverOK(ns[k]) && Object.keys(ns).indexOf(k) < firstMatcher) &&
    Object.keys(ns).filter(managedDnsKey).every(k => resolverOK(ns[k]));
  checks.push(result('managed_dns', dns.enable === true && dns.ipv6 === false && nsOK && keywordOK && domainOK &&
    Array.isArray(dns.nameserver) && dns.nameserver.length > 0 ? 'PASS' : 'FAIL',
    'Claude、共享服务及关键词使用经 Claude 组的海外加密 DNS，IPv6 关闭'));
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const presetOK = dns['enhanced-mode'] === 'fake-ip' && dns['prefer-h3'] === false && dns['respect-rules'] === true &&
    dns['cache-algorithm'] === 'arc' && dns['direct-nameserver-follow-policy'] === true &&
    dns['fake-ip-filter-mode'] === 'blacklist' && same(dns['fake-ip-filter'],p.dnsFilter) &&
    dns['fake-ip-range'] === '198.18.0.1/16' &&
    same(dns.nameserver,resolvers) &&
    ['direct-nameserver','proxy-server-nameserver'].every(k => same(dns[k],p.domesticResolvers)) &&
    same(dns['default-nameserver'],p.bootstrapResolvers);
  checks.push(result('dns_preset', presetOK ? 'PASS' : 'FAIL',
    '默认 DNS 经 Claude 组；保留小小东的 fake-IP、四项过滤表、ARC 与国内直连/节点 DNS'));
  checks.push(result('dns_bootstrap', same(dns['proxy-server-nameserver'],p.domesticResolvers) &&
    same(dns['default-nameserver'],p.bootstrapResolvers) ? 'PASS' : 'FAIL',
    '节点解析器与 IP 引导解析器按小小东原值配置；不额外挂 DIRECT 或策略组后缀'));
  const filter = dns['fake-ip-filter'] || [];
  const mode = dns['fake-ip-filter-mode'] || 'blacklist';
  const usesFake = dns['enhanced-mode'] === 'fake-ip';
  const ipv6Off = config.ipv6 === false && dns.ipv6 === false && dns['fake-ip-range6'] === undefined;
  checks.push(result('global_dns_ipv6', ipv6Off ? 'PASS' : 'FAIL',
    '内核/DNS IPv6 关闭并移除 fake-IP6 池；此项有意影响其他网站的 IPv6'));
  const usesStunRules = Array.isArray(rules) && rules.includes(udpReject(`DOMAIN,${p.stun[0]}`));
  const fakeOK = !usesFake || !usesStunRules || (Array.isArray(filter) && (
    mode === 'blacklist' ? !filter.some(x => x.includes('stun.')) :
    mode === 'whitelist' ? p.stun.every(h => filter.includes(h)) :
    mode === 'rule' && p.stun.every((h, i) => filter[i] === `DOMAIN,${h},fake-ip`)));
  checks.push(result('stun_fake_ip', fakeOK ? 'PASS' : 'UNKNOWN',
    '参考四项 fake-IP 过滤不排除 STUN 域名，沿用已有 UDP 拒绝；不强制 Claude real-IP'));
  const hostsConflict = dns['use-hosts'] !== false && Object.keys(config.hosts || {}).some(managedDnsKey);
  checks.push(result('claude_hosts', hostsConflict ? 'UNKNOWN' : 'PASS',
    hostsConflict ? 'Claude 存在 hosts 覆写，可能在解析器过滤之前返回 IPv6，需审核' : '所给配置未发现 Claude hosts 覆写；系统 hosts 和应用缓存仍需现场确认'));
  const sharedOK = Array.isArray(rules) && domainMatchers().every(m => rules.includes(`${m},${p.group}`)) && nsOK;
  checks.push(result('shared_service_scope', sharedOK ? 'PASS' : 'FAIL',
    '共享遥测、验证、客服和关联关键词使用 Claude 分流与海外 DNS 策略'));
  checks.push(result('rule_mode', config.mode === 'rule' ? 'PASS' : config.mode ? 'FAIL' : 'UNKNOWN', '应用设置须采用 rule 模式；本工具不修改应用设置'));
  const tun = config.tun || {}, hijack = tun['dns-hijack'] || [];
  const tunOK = tun.enable === true && tun['auto-route'] === true && Array.isArray(hijack) &&
    (hijack.includes('any:53') || hijack.includes('udp://any:53')) && hijack.includes('tcp://any:53');
  checks.push(result('tun_settings', tunOK ? 'PASS' : 'UNKNOWN', '核验 TUN、自动路由及 UDP/TCP DNS 劫持声明；不能证明系统路由已生效'));
  const excludes = ['route-exclude-address','route-exclude-address-set','include-interface','exclude-interface','include-uid','exclude-uid','include-package','exclude-package'];
  checks.push(result('tun_exclusions', excludes.some(k => tun[k]?.length) ? 'UNKNOWN' : 'PASS', '非空路由/接口/进程排除需逐项确认，不自动删除用户排除项'));
  checks.push(result('ipv6_settings', ipv6Off ? 'PASS' : 'FAIL',
    '检查 Clash/DNS IPv6 关闭声明；未修改系统 IPv6，缓存/浏览器 DoH/服务端解析仍需现场核验'));
  return checks;
}
if (require.main === module) {
  try {
    const checks = inspect(JSON.parse(fs.readFileSync(0, 'utf8')));
    console.log(JSON.stringify({scope:'provided-config-snapshot', status:aggregate(checks), runtime_status:'UNKNOWN', checks}));
  } catch {
    console.log(JSON.stringify({scope:'provided-config-snapshot',status:'FAIL',checks:[result('schema','FAIL','无法解析配置；敏感内容未输出')]}));
    process.exitCode = 1;
  }
}
module.exports = {inspect, aggregate};
