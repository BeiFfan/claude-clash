const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {main,policy,managedRules,dnsPreset}=require('../skills/claude-clash/templates/Script.js');
const {inspect,aggregate}=require('../skills/claude-clash/scripts/config-tool.js');
const base=()=>JSON.parse(fs.readFileSync('tests/fixtures/base.json','utf8'));
const source=JSON.parse(fs.readFileSync('tests/fixtures/xiaoxiaodong-claude.json','utf8'));
const group=c=>c['proxy-groups'].find(g=>g.name==='🦀 Claude');
test('standalone Verge script is a pure configuration transformation',()=>{
  const input=base(),before=structuredClone(input),sandbox=vm.createContext({input});
  vm.runInContext(fs.readFileSync('skills/claude-clash/templates/Script.js','utf8'),sandbox);
  assert.equal(vm.runInContext('main(input)',sandbox)['proxy-groups'][0].type,'select');
  assert.deepEqual(input,before);
});
test('routing keeps the upstream snapshot then appends the explicit user list',()=>{
  const expected=source.rules.map(r=>r.replace('RULE-SET,Claude,','RULE-SET,claude-clash-anthropic,').replace(/,AI-人工智能$/,',🦀 Claude'));
  expected.push(...policy.userRules.map(r=>{const p=r.split(',');p.splice(2,0,'🦀 Claude');return p.join(',');}));
  const c=main(base());assert.deepEqual(c.rules.slice(0,expected.length),expected);
  assert.equal(c.rules.some(r=>r.endsWith(',REJECT')),false);
  assert.equal(c.rules.some(r=>/stun|hcaptcha/.test(r)),false);
  assert.deepEqual(c.rules.slice(expected.length),base().rules);
});
test('DNS equals upstream original values without forced routes or extra record filtering',()=>{
  const input=base();input.mode='global';const c=main(input),expected=structuredClone(source.dns);
  expected['nameserver-policy']['rule-set:claude-clash-anthropic']=expected['nameserver-policy']['rule-set:Claude'];delete expected['nameserver-policy']['rule-set:Claude'];
  expected['nameserver-policy']['+.campus.example']='192.0.2.53';
  assert.deepEqual(c.dns,expected);
  assert.equal(c.ipv6,source.ipv6);
  assert.equal(c.mode,'rule');
  assert.equal(JSON.stringify(c.dns).includes('#🦀 Claude'),false);
});
test('all Taiwan residential candidates remain manual and preferred node stays first',()=>{
  const b=base();b.proxies.push({name:'台湾家宽 02',type:'socks5'},{name:'台湾普通',type:'socks5'},{name:'HK 家宽',type:'socks5'});
  const c=main(b,'',{preferred:'US 固定节点'}),g=group(c);
  assert.deepEqual(g.proxies,['US 固定节点','TW 家宽','台湾家宽 02']);assert.equal(g['default-selected'],'US 固定节点');
  assert.ok(!g.proxies.includes('REJECT'));assert.ok(!Object.hasOwn(g,'empty-fallback'));
});
test('personal rules, special DNS, original no-resolve and subrules are preserved',()=>{
  const b=base();b.rules.unshift('IP-ASN,64500,DIRECT,no-resolve');b['sub-rules']={local:['GEOIP,CN,DIRECT,no-resolve']};
  const c=main(b,'',{directSuffixes:['private.example'],nameserverPolicy:{'+.private.example':'192.0.2.54'}});
  assert.ok(c.rules.includes('IP-ASN,64500,DIRECT,no-resolve'));assert.ok(c.rules.includes('DOMAIN-SUFFIX,private.example,DIRECT'));
  assert.deepEqual(c['sub-rules'],b['sub-rules']);assert.equal(c.dns['nameserver-policy']['+.private.example'],'192.0.2.54');
});
test('source rules and DNS override old direct policies without changing other proxy groups',()=>{
  const b=base();b.rules.unshift('DOMAIN-SUFFIX,anthropic.com,DIRECT');b.dns['nameserver-policy']['+.anthropic.com']=['223.5.5.5'];
  const c=main(b);assert.ok(c.rules.indexOf('DOMAIN-SUFFIX,anthropic.com,🦀 Claude')<c.rules.indexOf('DOMAIN-SUFFIX,anthropic.com,DIRECT'));
  assert.deepEqual(c.dns['nameserver-policy']['+.anthropic.com'],['https://1.1.1.1/dns-query','https://8.8.8.8/dns-query']);
  assert.deepEqual(c['proxy-groups'].slice(1),b['proxy-groups']);
});
test('transformation is idempotent',()=>{const c=main(base());assert.deepEqual(main(c),c);assert.equal(aggregate(inspect(c)),'PASS');});
test('missing nodes and wrong exact preferred name do not silently select another node',()=>{
  const b=base();b.proxies=[];assert.throws(()=>main(b),/NO_ELIGIBLE_PROXY/);
  assert.throws(()=>main(base(),'',{preferred:'not-present'}),/PREFERRED_NODE/);
});
test('provider-only group remains usable without inserting a reject policy',()=>{
  const b=base();b.proxies=[];b['proxy-groups']=[];b.rules=['MATCH,DIRECT'];b['proxy-providers']={local:{type:'file',path:'never-read.yaml'}};
  const g=group(main(b));assert.deepEqual(g.proxies,[]);assert.deepEqual(g.use,['local']);assert.ok(!Object.hasOwn(g,'empty-fallback'));
});
test('legacy group references migrate while unrelated modifiers are retained',()=>{
  const b=base();b['proxy-groups'].push({name:'Claude',type:'select',proxies:['TW 家宽']});b.rules.unshift('DOMAIN,private.example,Claude,no-resolve');
  const c=main(b);assert.ok(c.rules.includes('DOMAIN,private.example,🦀 Claude,no-resolve'));
});
test('dependency cycles and provider source collisions stop generation',()=>{
  const b=base();b.proxies[0]['dialer-proxy']='日常';b['proxy-groups'][0].proxies=['TW 家宽'];assert.throws(()=>main(b),/CYCLE/);
  const other=base();other['rule-providers']={'claude-clash-anthropic':{url:'https://rules.example/private.yaml'}};assert.throws(()=>main(other),/COLLISION/);
});
test('validator rejects added reject guards, changed source DNS and overwritten rule order',()=>{
  for(const damage of [
    c=>c.rules.unshift('AND,((NETWORK,udp),(DOMAIN-SUFFIX,hcaptcha.com)),REJECT'),
    c=>c.rules.push('AND,((NETWORK,udp),(DOMAIN-KEYWORD,claude)),REJECT'),
    c=>c.rules.unshift('MATCH,DIRECT'),
    c=>c.dns.nameserver=['https://1.1.1.1/dns-query#🦀 Claude']
  ]){const c=main(base());damage(c);assert.equal(aggregate(inspect(c)),'FAIL');}
});
test('CLI errors never echo sensitive input',()=>{
  const r=spawnSync(process.execPath,['skills/claude-clash/scripts/config-tool.js'],{input:'{"password":"SECRET-CANARY",',encoding:'utf8'});
  assert.equal(r.status,1);assert.ok(!r.stdout.includes('SECRET-CANARY'));assert.ok(!r.stderr.includes('SECRET-CANARY'));
});
