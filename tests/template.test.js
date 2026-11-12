const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const {main, policy} = require('../skills/claude-clash/templates/Script.js');
const {inspect, aggregate} = require('../skills/claude-clash/scripts/config-tool.js');
const base = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/base.json'), 'utf8'));
const group = c => c['proxy-groups'].find(g => g.name === policy.group);
const check = (c, name) => inspect(c).find(r => r.name === name).status;

// Small packet oracle: verify observable routing, independently of template helpers.
function match(condition, packet) {
  const [kind, value] = condition.split(',');
  const domain = (packet.domain || '').toLowerCase();
  if (kind === 'DOMAIN') return domain === value.toLowerCase();
  if (kind === 'DOMAIN-SUFFIX') return domain === value.toLowerCase() || domain.endsWith('.' + value.toLowerCase());
  if (kind === 'DOMAIN-KEYWORD') return domain.includes(value.toLowerCase());
  if (kind === 'RULE-SET') return (packet.ruleSets?.[value] || []).some(d =>
    d.startsWith('+.') ? domain === d.slice(2) || domain.endsWith('.' + d.slice(2)) : domain === d);
  if (kind === 'PROCESS-NAME') return packet.process === value;
  if (kind === 'PROCESS-PATH-WILDCARD') return /^.*\/Claude\.app\/Contents\/.*$/.test(packet.path || '');
  if (kind === 'NETWORK') return packet.network === value;
  if (kind === 'IP-CIDR') {
    if (!packet.ip || packet.ip.includes(':')) return false;
    const [ip, bits] = value.split('/');
    const numeric = s => s.split('.').reduce((v, n) => (v * 256 + Number(n)) >>> 0, 0);
    const shift = 32 - Number(bits);
    return (numeric(packet.ip) >>> shift) === (numeric(ip) >>> shift);
  }
  if (kind === 'IP-CIDR6') {
    const ip=(packet.ip || '').toLowerCase();
    if (value === '::/0') return ip.includes(':');
    if (value === '::1/128') return ip === '::1';
    if (value === 'fc00::/7') return /^f[cd][0-9a-f]{2}:/.test(ip);
    if (value === 'fe80::/10') return /^fe[89ab][0-9a-f]:/.test(ip);
    return ip.startsWith('2607:6bc0:');
  }
  if (kind === 'MATCH') return true;
  return false;
}
function route(c, packet, supportsUDP = true) {
  for (const rule of c.rules) {
    const logical = /^AND,\(\(([^()]+)\),\(([^()]+)\)\),([^,]+)$/.exec(rule);
    if (logical) {
      if (!match(logical[1], packet) || !match(logical[2], packet)) continue;
      if (packet.network === 'udp' && logical[3] === policy.group && !supportsUDP) continue;
      return logical[3];
    }
    const parts = rule.split(',');
    const target = parts[0] === 'MATCH' ? parts[1] : parts[2];
    if (match(parts.slice(0, 2).join(','), packet)) {
      if (packet.network === 'udp' && target === policy.group && !supportsUDP) continue;
      return target;
    }
  }
}

test('standalone Verge entry point performs only a pure configuration transformation', () => {
  const input = base(), before = structuredClone(input);
  const sandbox = vm.createContext({input});
  vm.runInContext(fs.readFileSync('skills/claude-clash/templates/Script.js','utf8'), sandbox);
  const output = vm.runInContext('main(input)', sandbox);
  assert.equal(group(output).type, 'select');
  assert.deepEqual(input, before);
});

test('empty local input fails without mutation instead of falling back to DIRECT', () => {
  const input=base(); input.proxies=[]; const before=structuredClone(input);
  assert.throws(()=>main(input),/NO_ELIGIBLE_PROXY/); assert.deepEqual(input,before);
});

test('node labels are not guessed and direct adapters are excluded', () => {
  const c=base(); c.proxies.push({name:'HK 香港家宽',type:'socks5'},{name:'US 住宅直连',type:'direct'});
  const g=group(main(c));
  assert.ok(g.proxies.includes('HK 香港家宽'));
  assert.ok(!g.proxies.includes('US 住宅直连'));
  assert.equal(g['default-selected'],'REJECT');
  assert.ok(!Object.hasOwn(g,'filter')); assert.ok(!Object.hasOwn(g,'exclude-filter'));
});

test('provider-only subscription always has a real group with a safe initial choice', () => {
  const c = base(); c.proxies = []; c['proxy-groups'] = [];
  c['proxy-providers'] = {subscription:{type:'file',path:'never-read.yaml'}};
  c.rules = ['MATCH,DIRECT'];
  const output = main(c), g = group(output);
  assert.deepEqual(g.proxies, ['REJECT']);
  assert.equal(g['default-selected'], 'REJECT');
  assert.equal(g['empty-fallback'], 'REJECT');
  assert.deepEqual(g.use, ['subscription']);
  assert.ok(!Object.hasOwn(g,'filter')); assert.ok(!Object.hasOwn(g,'exclude-filter'));
  assert.equal(check(output,'references'), 'PASS');
  assert.equal(check(output,'claude_group'), 'PASS');
});

test('only the explicit exact node is selected without residential heuristics', () => {
  assert.equal(group(main(base(), '', {preferred:'US 固定节点'})).proxies[0], 'US 固定节点');
  assert.throws(() => main(base(), '', {preferred:'missing'}), /PREFERRED_NODE_NOT_FOUND/);
  assert.throws(() => main(base(), '', {preferred:'HK'}), /PREFERRED_NODE/);
});

test('legacy group references and custom rules survive migration, including modifiers and sub-rules', () => {
  const c = base();
  c['proxy-groups'].push({name:'Claude',type:'select',proxies:['TW 家宽']});
  c['proxy-groups'][0].proxies.push('Claude');
  c.rules.unshift('DOMAIN-SUFFIX,private.example,Claude', 'IP-CIDR,192.0.2.0/24,Claude,no-resolve',
    'AND,((NETWORK,tcp),(DOMAIN,private.example)),Claude', 'SUB-RULE,(NETWORK,tcp),custom');
  c['sub-rules'] = {custom:['DOMAIN-SUFFIX,another.example,Claude','MATCH,DIRECT']};
  const output = main(c);
  assert.ok(output['proxy-groups'][1].proxies.includes(policy.group));
  assert.ok(output.rules.includes(`DOMAIN-SUFFIX,private.example,${policy.group}`));
  assert.ok(output.rules.includes(`IP-CIDR,192.0.2.0/24,${policy.group}`));
  assert.ok(output.rules.includes(`AND,((NETWORK,tcp),(DOMAIN,private.example)),${policy.group}`));
  assert.ok(output['sub-rules'].custom.includes(`DOMAIN-SUFFIX,another.example,${policy.group}`));
  assert.equal(check(output, 'references'), 'PASS');
});

test('existing custom rules to the current group and a real node named Claude are preserved', () => {
  const c = base();
  c.proxies.push({name:'Claude',type:'socks5'});
  c.rules.unshift('DOMAIN-SUFFIX,private.example,🦀 Claude','DOMAIN-SUFFIX,node.example,Claude');
  const output = main(c);
  assert.ok(output.rules.includes('DOMAIN-SUFFIX,private.example,🦀 Claude'));
  assert.ok(output.rules.includes('DOMAIN-SUFFIX,node.example,Claude'));
});

test('managed TCP routes to dedicated group and UDP/QUIC cannot fall through to DIRECT', () => {
  const c = base(); c.rules = ['MATCH,DIRECT']; const output = main(c);
  for (const domain of ['claude.ai','api.anthropic.com','cdn.anthropic.com','anthropic.auth0.com','x.claudeusercontent.com']) {
    assert.equal(route(output,{network:'tcp',domain}),policy.group);
    assert.equal(route(output,{network:'udp',domain,port:443},false),'REJECT');
  }
  for (const ip of ['160.79.104.2','2607:6bc0:1::2']) {
    assert.equal(route(output,{network:'udp',ip},false),'REJECT');
  }
  assert.equal(route(output,{network:'udp',domain:'meeting.example',port:3478}),'DIRECT');
});

test('known STUN rejects UDP; proxy mode has an immediate UDP rejection fallback', () => {
  for (const mode of ['REJECT','PROXY']) {
    const c = base(); c.rules = ['MATCH,DIRECT']; const output = main(c,'',{stunMode:mode});
    for (const domain of policy.stun) {
      assert.equal(route(output,{network:'udp',domain},false),'REJECT');
      assert.equal(route(output,{network:'udp',domain}),mode === 'PROXY' ? policy.group : 'REJECT');
    }
  }
});


test('more-specific DNS conflicts rewritten; unrelated local DNS and policy priority preserved', () => {
  const c = base();
  c.dns['nameserver-policy'] = {'rule-set:original':'192.0.2.53', 'api.anthropic.com':'223.5.5.5',
    '*.statsig.com':'223.5.5.5','+.campus.example':'192.0.2.53'};
  const output = main(c), ns = output.dns['nameserver-policy'];
  assert.deepEqual(ns['api.anthropic.com'],ns['rule-set:claude-clash-anthropic']);
  assert.deepEqual(ns['*.statsig.com'],ns['+.statsig.com']);
  assert.deepEqual(ns['+.statsig.com'],ns['rule-set:claude-clash-anthropic']);
  assert.equal(ns['+.campus.example'],'192.0.2.53');
  assert.ok(Object.keys(ns).indexOf('rule-set:claude-clash-anthropic') < Object.keys(ns).indexOf('rule-set:original'));
});

test('default DNS uses the fixed proxy while retaining domestic direct and private DNS', () => {
  const c=base(); c.dns.nameserver=['https://dns.alidns.com/dns-query#DIRECT'];
  c.dns['fake-ip-filter-mode']='rule'; c.dns['fake-ip-filter']=['MATCH,real-ip'];
  c.dns['nameserver-policy']['+.anthropic.com']=['https://1.1.1.1/dns-query#🦀 Claude'];
  const out=main(c), ordinary=main(base());
  assert.deepEqual(out.dns.nameserver,['https://1.1.1.1/dns-query#🦀 Claude','https://8.8.8.8/dns-query#🦀 Claude']);
  for (const key of ['direct-nameserver','proxy-server-nameserver']) {
    assert.deepEqual(out.dns[key],['https://dns.alidns.com/dns-query','https://doh.pub/dns-query']);
  }
  assert.deepEqual(out.dns['default-nameserver'],['223.5.5.5','119.29.29.29']);
  assert.deepEqual(out.dns['nameserver-policy']['+.anthropic.com'],out.dns.nameserver);
  assert.equal(out.dns['nameserver-policy']['+.campus.example'],'192.0.2.53');
  assert.equal(out.dns['fake-ip-filter-mode'],'blacklist');
  assert.deepEqual(out.dns['fake-ip-filter'],['*.lan','+.local','+.msftconnecttest.com','+.msftncsi.com']);
  assert.equal(out.dns['respect-rules'],true); assert.equal(out.dns['direct-nameserver-follow-policy'],true);
  assert.equal(out.dns['prefer-h3'],false); assert.equal(out.dns.ipv6,false);
  assert.deepEqual(out.rules,ordinary.rules); assert.deepEqual(out['proxy-groups'],ordinary['proxy-groups']);
  assert.equal(check(out,'dns_preset'),'PASS');
  for (const replacement of [
    ['https://dns.alidns.com/dns-query'],
    ['https://1.1.1.1/dns-query','https://8.8.8.8/dns-query'],
    ['https://1.1.1.1/dns-query#DIRECT']
  ]) {
    const overwritten=structuredClone(out); overwritten.dns.nameserver=replacement;
    assert.equal(check(overwritten,'dns_preset'),'FAIL');
  }
});

test('transformation is idempotent, preserves personal rules and adds no unrelated direct domains', () => {
  const c = base(), before = structuredClone(c), first = main(c), second = main(first);
  assert.deepEqual(c,before); assert.deepEqual(second,first);
  assert.deepEqual(first.tun,c.tun); assert.equal(first.mode,c.mode); assert.equal(first.ipv6,false);
  assert.ok(first.rules.includes('DOMAIN-SUFFIX,campus.example,DIRECT'));
  const directDomains = rules => rules.filter(r => /^DOMAIN(?:-SUFFIX|-KEYWORD)?,/.test(r) && r.endsWith(',DIRECT'));
  assert.deepEqual(directDomains(first.rules),directDomains(c.rules));
  const custom = main(c,'',{directSuffixes:['personal.example']});
  assert.ok(custom.rules.includes('DOMAIN-SUFFIX,personal.example,DIRECT'));
});

test('post-extension validator detects rule/DNS overwrites and invalid references', () => {
  const output=main(base()); assert.equal(aggregate(inspect(output)),'PASS');
  const rules=structuredClone(output); rules.rules.unshift('MATCH,DIRECT');
  assert.equal(check(rules,'managed_rules_and_udp'),'FAIL');
  const dns=structuredClone(output); dns.dns['nameserver-policy']['api.anthropic.com']='223.5.5.5';
  assert.equal(check(dns,'managed_dns'),'FAIL');
  const refs=structuredClone(output); refs['proxy-groups'][1].proxies.push('removed-group');
  assert.equal(check(refs,'references'),'FAIL');
});

test('mode, TUN exclusions and reenabled IPv6 cannot silently pass', () => {
  const c=main(base()); c.mode='global'; assert.equal(check(c,'rule_mode'),'FAIL');
  c.tun['route-exclude-address']=['192.0.2.0/24']; assert.equal(check(c,'tun_exclusions'),'UNKNOWN');
  c.ipv6=true; assert.equal(check(c,'ipv6_settings'),'FAIL');
  c.tun['dns-hijack']=[]; assert.equal(check(c,'tun_settings'),'UNKNOWN');
});

test('config CLI never echoes credentials on malformed input', () => {
  const r=spawnSync(process.execPath,['skills/claude-clash/scripts/config-tool.js'],{input:'{"password":"SECRET-CANARY",',encoding:'utf8'});
  assert.equal(r.status,1); assert.ok(!r.stdout.includes('SECRET-CANARY')); assert.ok(!r.stderr.includes('SECRET-CANARY'));
});

test('legacy dialer, default selection and DNS resolver fragments migrate without losing parameters', () => {
  const c=base();
  c['proxy-groups'].push({name:'Claude',type:'select',proxies:['TW 家宽']});
  c['proxy-groups'][0]['default-selected']='Claude';
  c['proxy-groups'][0].proxies.push('Claude');
  c.proxies[1]['dialer-proxy']='Claude';
  c.dns['nameserver-policy']['+.private.example']=['https://9.9.9.9/dns-query#Claude&h3=false'];
  c.dns.fallback=['https://9.9.9.9/dns-query#%43laude&ecs=192.0.2.0/24'];
  c.dns['proxy-server-nameserver-policy']={'node.private.example':'https://9.9.9.9/dns-query#Claude'};
  c['rule-providers']={private:{type:'file',path:'never-read.yaml',proxy:'Claude'}};
  const output=main(c,'',{preferred:'TW 家宽'});
  assert.equal(output.proxies[1]['dialer-proxy'],policy.group);
  assert.equal(output['proxy-groups'][1]['default-selected'],policy.group);
  assert.equal(output['rule-providers'].private.proxy,policy.group);
  assert.equal(output.dns['nameserver-policy']['+.private.example'][0],`https://9.9.9.9/dns-query#${policy.group}&h3=false`);
  assert.equal(output.dns.fallback[0],`https://9.9.9.9/dns-query#${policy.group}&ecs=192.0.2.0/24`);
  assert.equal(output.dns['proxy-server-nameserver-policy']['node.private.example'],`https://9.9.9.9/dns-query#${policy.group}`);
  assert.equal(aggregate(inspect(output)),'PASS');
});

test('a newly introduced proxy or provider dependency cycle stops transformation without mutation', () => {
  for (const withProvider of [false,true]) {
    const c=base();
    c['proxy-groups'].push({name:'Claude',type:'select',proxies:['US 固定节点']});
    if (withProvider) c['proxy-providers']={chain:{type:'file',path:'never-read.yaml',override:{'dialer-proxy':'Claude'}}};
    else c.proxies[0]['dialer-proxy']='Claude';
    const before=structuredClone(c);
    assert.throws(() => main(c),/PROXY_DEPENDENCY_CYCLE/);
    assert.deepEqual(c,before);
  }
});

test('validator rejects missing/cyclic dialers and cannot pass an unknown DNS proxy/interface', () => {
  const missing=main(base()); missing.proxies[0]['dialer-proxy']='removed-group';
  assert.equal(check(missing,'proxy_dependencies'),'FAIL');
  const cyclic=main(base()); cyclic.proxies[0]['dialer-proxy']=policy.group;
  assert.equal(check(cyclic,'proxy_dependencies'),'FAIL');
  const provider=main(base()); provider['proxy-providers']={chain:{override:{'dialer-proxy':'removed-group'}}};
  group(provider).use=['chain'];
  assert.equal(check(provider,'proxy_dependencies'),'FAIL');
  const dns=main(base()); dns.dns['nameserver-policy']['+.private.example']=['https://9.9.9.9/dns-query#removed-group&h3=false'];
  assert.equal(check(dns,'dns_proxy_references'),'UNKNOWN');
  assert.equal(aggregate(inspect(dns)),'UNKNOWN');
});



test('core DNS preset preserves extra DNS policies and adds no record filters', () => {
  const c=base(); c.dns.fallback=['https://9.9.9.9/dns-query'];
  c.dns['fallback-filter']={geoip:true,'geoip-code':'CN'};
  c.dns['proxy-server-nameserver-policy']={'node.example':['192.0.2.53']};
  c.hosts={'private.example':'2001:db8::8'}; const before=structuredClone(c), out=main(c);
  for (const key of ['fallback','fallback-filter','proxy-server-nameserver-policy']) assert.deepEqual(out.dns[key],before.dns[key]);
  assert.deepEqual(out.hosts,c.hosts); assert.deepEqual(out.tun,c.tun);
  assert.deepEqual(out.dns['nameserver-policy']['+.campus.example'],c.dns['nameserver-policy']['+.campus.example']);
  assert.deepEqual(out.dns['nameserver-policy']['rule-set:claude-clash-anthropic'],[
    'https://1.1.1.1/dns-query#🦀 Claude','https://8.8.8.8/dns-query#🦀 Claude']);
  assert.equal(check(out,'dns_preset'),'PASS'); assert.deepEqual(c,before);
});


test('xiaoxiaodong fake-IP preset replaces a prior whitelist and keeps private DNS', () => {
  const c=base(); c.dns['enhanced-mode']='redir-host'; c.dns['fake-ip-filter-mode']='whitelist'; c.dns['fake-ip-filter']=['*.campus.example'];
  const out=main(c); assert.equal(out.dns['enhanced-mode'],'fake-ip');
  assert.equal(out.dns['fake-ip-filter-mode'],'blacklist'); assert.deepEqual(out.dns['fake-ip-filter'],policy.dnsFilter);
  assert.equal(out.dns['nameserver-policy']['+.campus.example'],'192.0.2.53');
});

test('IPv6 is disabled globally and valid DNS is supplied even when the baseline DNS is absent or disabled', () => {
  const c=base(); c.dns.ipv6=false;
  const output=main(c);
  assert.equal(output.dns.ipv6,false); assert.equal(output.ipv6,false); assert.deepEqual(output.tun,c.tun);
  const bad=structuredClone(output); bad.dns.ipv6=true; assert.equal(check(bad,'managed_dns'),'FAIL');
  const missing=base(); delete missing.dns.nameserver;
  assert.equal(check(main(missing),'dns_preset'),'PASS');
  const disabled=base(); disabled.dns.enable=false;
  assert.equal(main(disabled).dns.enable,true);
});

test('shared services and STUN protection remain while other IP rules keep ordinary resolution', () => {
  const c=base(); c.rules=['GEOIP,CN,DIRECT','MATCH,DIRECT']; const output=main(c);
  for (const domain of ['sentry.io','api.statsig.com','browser-intake-us5-datadoghq.com','challenges.cloudflare.com',
    'cdn.usefathom.com','x.sift.example','api.featuregates.org','cdn.featureassets.org','api.segment.io','widget.intercom.io']) {
    assert.equal(route(output,{network:'tcp',domain,process:'Chrome'}),policy.group);
    assert.equal(route(output,{network:'udp',domain,process:'Chrome'}),'REJECT');
  }
  for (const domain of policy.stun) assert.equal(route(output,{network:'udp',domain,process:'Chrome'}),'REJECT');
  assert.equal(route(output,{network:'tcp',domain:'ordinary.example',process:'Chrome'}),'DIRECT');
  assert.ok(output.rules.includes('GEOIP,CN,DIRECT'));
  assert.ok(!output.rules.includes('GEOIP,CN,DIRECT,no-resolve'));
});



test('managed DNS binding and hosts bypass are validated without extra qtype requirements', () => {
  const out=main(base()), bad=structuredClone(out);
  bad.dns['nameserver-policy']['rule-set:claude-clash-anthropic']=['https://1.1.1.1/dns-query#DIRECT'];
  assert.equal(check(bad,'managed_dns'),'FAIL');
  out.hosts={'api.anthropic.com':'2001:db8::3'}; assert.equal(check(out,'claude_hosts'),'UNKNOWN');
  out.hosts={'private.example':'2001:db8::3'}; assert.equal(check(out,'claude_hosts'),'PASS');
});



test('global IPv6 disable is checked and stale or invalid fake-IP6 pools are removed', () => {
  const c=base(); delete c.dns['fake-ip-range6']; const output=main(c);
  assert.equal(check(output,'global_dns_ipv6'),'PASS');
  assert.equal(aggregate(inspect(output)),'PASS');
  assert.ok(!Object.hasOwn(output.dns,'fake-ip-range6'));
  for (const invalid of ['', 'not-an-ipv6-pool', 'fd00::/129']) {
    const invalidConfig=base(); invalidConfig.dns['fake-ip-range6']=invalid;
    assert.equal(check(main(invalidConfig),'global_dns_ipv6'),'PASS');
  }
  for (const value of ['https://dns.example/dns-query#disable-ipv6=true','https://dns.example/dns-query#DIRECT&disable-qtype-28=true']) {
    const original=base(); original.dns['enhanced-mode']='redir-host'; original.dns.nameserver=[value];
    const changed=main(original);
    assert.deepEqual(changed.dns.nameserver,['https://1.1.1.1/dns-query#🦀 Claude','https://8.8.8.8/dns-query#🦀 Claude']);
    assert.equal(check(changed,'global_dns_ipv6'),'PASS');
  }
});

test('old shared-service rules are normalized into the now-authorized default coverage', () => {
  const c=base();
  const inherited=['AND,((NETWORK,udp),(DOMAIN-SUFFIX,sentry.io)),REJECT',
    'DOMAIN-SUFFIX,sentry.io,🦀 Claude','DOMAIN-KEYWORD,sift,🦀 Claude'];
  c.rules.unshift(...inherited);
  c.dns['nameserver-policy']['+.sentry.io']=['https://1.1.1.1/dns-query#🦀 Claude'];
  const output=main(c);
  for (const rule of inherited) assert.ok(output.rules.includes(rule));
  assert.deepEqual(output.dns['nameserver-policy']['+.sentry.io'],output.dns['nameserver-policy']['rule-set:claude-clash-anthropic']);
  assert.equal(check(output,'shared_service_scope'),'PASS');
  assert.equal(aggregate(inspect(output)),'PASS');
});

test('global H3 preference is disabled and default DNS shares the Claude proxy binding', () => {
  const c=base(); c.dns['prefer-h3']=true; c.dns['enhanced-mode']='redir-host';
  const output=main(c), values=output.dns['nameserver-policy']['rule-set:claude-clash-anthropic'];
  assert.equal(output.dns['prefer-h3'],false);
  assert.deepEqual(output.dns.nameserver,values);
  assert.ok(values.every(value=>value.startsWith('https://')));
  assert.ok(values.every(value=>value.endsWith('#🦀 Claude')));
  assert.equal(check(output,'managed_dns'),'PASS');
  const noH3=main(base()); assert.ok(noH3.dns['nameserver-policy']['rule-set:claude-clash-anthropic'].every(value=>value.startsWith('https://')));
});

test('strong keywords cover unlisted and intentionally overmatched domains before old DIRECT rules', () => {
  const domains=['api.new-claude-service.example','assets-anthropic.example','notclaude.example','ClAuDe-New.EXAMPLE'];
  const c=base(); c.rules=['DOMAIN-KEYWORD,claude,DIRECT','DOMAIN-KEYWORD,anthropic,DIRECT','MATCH,DIRECT'];
  const output=main(c);
  for (const domain of domains) {
    assert.equal(route(output,{domain,network:'tcp',process:'Chrome'}),policy.group);
    assert.equal(route(output,{domain,network:'udp',process:'Chrome'}),'REJECT');
    assert.equal(route(output,{domain,network:'tcp',ip:'2001:db8::9',process:'Chrome'}),'REJECT');
    assert.equal(route(output,{domain,network:'tcp',ip:'127.0.0.1',process:'Claude'}),policy.group);
  }
  assert.equal(route(output,{domain:'unrelated.example',network:'tcp',process:'Chrome'}),'DIRECT');
  assert.ok(!output.rules.includes('DOMAIN-KEYWORD,claude,DIRECT'));
  assert.ok(!output.rules.includes('DOMAIN-KEYWORD,anthropic,DIRECT'));
  assert.equal(check(output,'managed_rules_and_udp'),'PASS');
});

test('keyword DNS uses an inline provider and beats old exact/default resolver policies', () => {
  const c=base(); c.dns['enhanced-mode']='redir-host';
  c.dns['nameserver-policy']={'geosite:cn':'192.0.2.53','new-claude.example':'192.0.2.54','ordinary.example':'192.0.2.55'};
  const output=main(c), key='rule-set:claude-clash-strong-keywords';
  const provider=output['rule-providers']['claude-clash-strong-keywords'];
  assert.equal(provider.type,'inline'); assert.equal(provider.behavior,'classical');
  assert.deepEqual(provider.payload,['DOMAIN-KEYWORD,claude','DOMAIN-KEYWORD,anthropic',
    'DOMAIN-KEYWORD,datadog','DOMAIN-KEYWORD,sentry','DOMAIN-KEYWORD,sift']);
  assert.ok(!Object.hasOwn(provider,'url')); assert.ok(!Object.hasOwn(provider,'path'));
  assert.equal(Object.keys(output.dns['nameserver-policy'])[0],key);
  assert.deepEqual(output.dns['nameserver-policy']['new-claude.example'],output.dns['nameserver-policy'][key]);
  assert.equal(output.dns['nameserver-policy']['ordinary.example'],'192.0.2.55');
  assert.equal(check(output,'strong_keyword_dns'),'PASS');
  assert.equal(check(output,'managed_dns'),'PASS');
});


test('keyword DNS provider collisions fail without modifying the input; compatible metadata is preserved', () => {
  const c=base();
  c['rule-providers']={'claude-clash-strong-keywords':{type:'file',path:'personal.yaml',behavior:'domain'}};
  const before=structuredClone(c);
  assert.throws(()=>main(c),/KEYWORD_PROVIDER_NAME_COLLISION/);
  assert.deepEqual(c,before);
  const valid=main(base());
  valid['rule-providers']['claude-clash-strong-keywords'].payload.reverse();
  valid['rule-providers']['claude-clash-strong-keywords'].interval=123;
  const again=main(valid);
  assert.equal(again['rule-providers']['claude-clash-strong-keywords'].interval,123);
  assert.equal(check(again,'strong_keyword_dns'),'PASS');
});

test('keyword acceptance fails on missing provider, incomplete payload, wrong priority or DNS filters', () => {
  const original=main(base()), key='rule-set:claude-clash-strong-keywords';
  const badCases=[
    c=>delete c['rule-providers']['claude-clash-strong-keywords'],
    c=>c['rule-providers']['claude-clash-strong-keywords'].payload.pop(),
    c=>c['rule-providers']['claude-clash-strong-keywords'].type='http',
    c=>{ const v=c.dns['nameserver-policy'][key]; delete c.dns['nameserver-policy'][key]; c.dns['nameserver-policy'][key]=v; },
    c=>{ c.dns['nameserver-policy'][key]=['223.5.5.5']; }
  ];
  for (const damage of badCases) {
    const c=structuredClone(original); damage(c);
    assert.equal(check(c,'strong_keyword_dns'),'FAIL');
    assert.equal(aggregate(inspect(c)),'FAIL');
  }
});

test('authorized strong and shared-service keywords pass acceptance and remain idempotent', () => {
  const output=main(base());
  assert.equal(check(output,'shared_service_scope'),'PASS');
  assert.equal(aggregate(inspect(output)),'PASS');
  for (const word of ['sentry','sift','datadog']) {
    const c=structuredClone(output); c.rules.push(`DOMAIN-KEYWORD,${word},${policy.group}`);
    assert.equal(check(c,'shared_service_scope'),'PASS');
  }
  const hosts=structuredClone(output); hosts.hosts={'new-claude.example':'2001:db8::2'};
  assert.equal(check(hosts,'claude_hosts'),'UNKNOWN');
  assert.deepEqual(main(output),output);
});

test('comma-separated DNS keys isolate keyword members while preserving unrelated members', () => {
  const c=base(); c.dns['enhanced-mode']='redir-host';
  c.dns['nameserver-policy']['ordinary.example,new-claude.example']=['192.0.2.55'];
  const output=main(c), ns=output.dns['nameserver-policy'];
  assert.deepEqual(ns['ordinary.example'],['192.0.2.55']);
  assert.deepEqual(ns['new-claude.example'],ns['rule-set:claude-clash-strong-keywords']);
  assert.equal(check(output,'strong_keyword_dns'),'PASS');
});

test('domain rule set covers a future domain consistently in routing, fake-IP and DNS without downloading it', () => {
  const c=base(); c.rules=['MATCH,DIRECT'];
  const output=main(c), key='rule-set:claude-clash-anthropic';
  const provider=output['rule-providers']['claude-clash-anthropic'];
  assert.equal(provider.type,'http'); assert.equal(provider.behavior,'domain');
  assert.equal(provider.url,'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/anthropic.yaml');
  assert.equal(provider.interval,0); assert.equal(provider.proxy,policy.group);
  assert.deepEqual(output.dns['nameserver-policy'][key],output.dns['nameserver-policy']['rule-set:claude-clash-anthropic']);
  // Synthetic contents stand in for a later upstream update; no URL is requested.
  const ruleSets={'claude-clash-anthropic':['+.future-resource.example']};
  output.__offlineRuleSets=ruleSets;
  const domain='cdn.future-resource.example';
  assert.equal(route(output,{domain,ruleSets,network:'tcp'}),policy.group);
  assert.equal(route(output,{domain,ruleSets,network:'udp'},false),'REJECT');
  assert.equal(route(output,{domain,ruleSets,network:'tcp',ip:'2001:db8::2'}),'REJECT');
  assert.equal(check(output,'anthropic_rule_set'),'PASS');
  assert.equal(policy.suffixes.length+policy.exact.length,15);
  assert.ok(!policy.suffixes.includes('anthropic.com')); assert.ok(!policy.exact.includes('servd-anthropic-website.b-cdn.net'));
});

test('reserved domain provider collision fails atomically and damaged provider or DNS is rejected', () => {
  const c=base(); c['rule-providers']={'claude-clash-anthropic':{type:'file',path:'personal.yaml'}};
  const before=structuredClone(c);
  assert.throws(()=>main(c),/DOMAIN_PROVIDER_NAME_COLLISION/); assert.deepEqual(c,before);
  for (const damage of [
    out=>delete out['rule-providers']['claude-clash-anthropic'],
    out=>{ out['rule-providers']['claude-clash-anthropic'].proxy='DIRECT'; },
    out=>{ out['rule-providers']['claude-clash-anthropic'].interval=86400; },
    out=>{ out.dns['nameserver-policy']['rule-set:claude-clash-anthropic']=['223.5.5.5']; }
  ]) {
    const out=main(base()); damage(out); assert.equal(check(out,'anthropic_rule_set'),'FAIL');
  }
});

test('daily domain provider upgrades to manual updates without mutating input or changing its source', () => {
  const c=main(base()), key='claude-clash-anthropic';
  c['rule-providers'][key].interval=86400;
  c['rule-providers'][key].header={'X-Test':['preserve']};
  const before=structuredClone(c), output=main(c);
  assert.deepEqual(structuredClone(c),before);
  assert.deepEqual(output['rule-providers'][key],{...before['rule-providers'][key],interval:0});
  assert.equal(check(output,'anthropic_rule_set'),'PASS');
  assert.equal(aggregate(inspect(output)),'PASS');
  assert.deepEqual(main(output),output);
});

test('older two-keyword inline provider upgrades without losing personal metadata', () => {
  const c=base(); c['rule-providers']={'claude-clash-strong-keywords':{
    type:'inline',behavior:'classical',format:'yaml',interval:123,
    payload:['DOMAIN-KEYWORD,anthropic','DOMAIN-KEYWORD,claude']}};
  const before=structuredClone(c), output=main(c);
  assert.equal(output['rule-providers']['claude-clash-strong-keywords'].payload.length,5);
  assert.equal(output['rule-providers']['claude-clash-strong-keywords'].interval,123);
  assert.equal(check(output,'strong_keyword_dns'),'PASS'); assert.deepEqual(c,before);
});

test('no-resolve remains only in the two Claude IP fallbacks including nested and subrule cleanup', () => {
  const c=base(); c.rules.unshift('IP-CIDR,192.0.2.0/24,DIRECT,no-resolve','IP-ASN,64500,DIRECT,no-resolve',
    'AND,((NETWORK,tcp),(IP-CIDR,192.0.2.0/24,no-resolve)),DIRECT');
  c['sub-rules']={custom:['GEOIP,US,DIRECT,no-resolve','IP-CIDR,10.0.0.0/8,DIRECT,src,no-resolve','MATCH,DIRECT']};
  const out=main(c), flagged=out.rules.filter(r=>r.includes('no-resolve'));
  assert.deepEqual(flagged,[`IP-CIDR,160.79.104.0/21,${policy.group},no-resolve`,'IP-CIDR6,2607:6bc0::/32,REJECT,no-resolve']);
  assert.ok(out.rules.includes('AND,((NETWORK,tcp),(IP-CIDR,192.0.2.0/24)),DIRECT'));
  assert.deepEqual(out['sub-rules'].custom,['GEOIP,US,DIRECT','IP-CIDR,10.0.0.0/8,DIRECT,src','MATCH,DIRECT']);
  assert.equal(check(out,'ip_rule_dns'),'PASS'); out.rules.push('IP-ASN,64501,DIRECT,no-resolve');
  assert.equal(check(out,'ip_rule_dns'),'FAIL');
});

test('post-extension changes to the DNS preset or IPv6 disable are rejected', () => {
  for (const damage of [
    out=>{ out.dns['prefer-h3']=true; }, out=>{ out.dns['respect-rules']=false; },
    out=>{ out.dns['proxy-server-nameserver']=['https://9.9.9.9/dns-query#🦀 Claude']; }
  ]) {
    const out=main(base()); damage(out); assert.equal(check(out,'dns_preset'),'FAIL');
  }
  for (const damage of [
    out=>{ out.ipv6=true; }, out=>{ out.dns.ipv6=true; },
    out=>{ out.dns['fake-ip-range6']='fd00::/64'; }
  ]) {
    const out=main(base()); damage(out); assert.equal(check(out,'global_dns_ipv6'),'FAIL');
  }
});

test('only domain rules capture Claude traffic and no whole-process rules are generated', () => {
  const c=base(); c.rules=['MATCH,DIRECT']; const out=main(c);
  assert.ok(!out.rules.some(r=>r.includes('PROCESS-')));
  assert.equal(route(out,{domain:'unrelated.example',process:'Claude',network:'tcp'}),'DIRECT');
  assert.equal(route(out,{domain:'unrelated.example',process:'Claude',network:'udp'}),'DIRECT');
  assert.equal(route(out,{domain:'api.anthropic.com',process:'Claude',network:'tcp'}),policy.group);
  assert.equal(check(out,'domain_only_scope'),'PASS');
  out.rules.push('PROCESS-NAME,Claude,🦀 Claude'); assert.equal(check(out,'domain_only_scope'),'FAIL');
});
