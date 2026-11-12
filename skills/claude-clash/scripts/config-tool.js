#!/usr/bin/env node
// 仅检查传入 JSON；不联网、不写配置。
const fs=require('node:fs');
const {policy:p,managedRules,dnsPreset,dnsDomainProviders,domainProviderDefinition,splitRule,ruleTargetIndex,proxyDependencies,resolverProxy}=require('../templates/Script.js');
const result=(name,status,message)=>({name,status,message});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function aggregate(checks){return checks.some(c=>c.status==='FAIL')?'FAIL':checks.some(c=>c.status==='UNKNOWN')?'UNKNOWN':'PASS';}
function inspect(config){
  if(!config||typeof config!=='object'||Array.isArray(config))return[result('schema','FAIL','配置须为对象')];
  const checks=[],proxies=config.proxies||[],groups=config['proxy-groups']||[];
  if(!Array.isArray(proxies)||!Array.isArray(groups)||[...proxies,...groups].some(n=>!n||typeof n.name!=='string'))return[result('schema','FAIL','节点或策略组格式无效')];
  const names=new Set(['DIRECT','REJECT','REJECT-DROP','PASS','COMPATIBLE','GLOBAL',...[...proxies,...groups].map(n=>n.name)]);
  let invalid=names.size!==6+proxies.length+groups.length;
  const lists=[config.rules||[],...Object.values(config['sub-rules']||{})];
  try{
    for(const list of lists)for(const rule of list){
      const parts=splitRule(rule),i=ruleTargetIndex(parts);
      if(i>0&&!names.has(parts[i]))invalid=true;
      if(parts[0]==='RULE-SET'&&!Object.hasOwn(config['rule-providers']||{},parts[1]))invalid=true;
      if(i<0&&!Object.hasOwn(config['sub-rules']||{},parts[2]))invalid=true;
    }
    const deps=proxyDependencies(config);invalid=invalid||!!deps.dangling||deps.cycle;
  }catch{invalid=true;}
  checks.push(result('references',invalid?'FAIL':'PASS','检查策略/规则集引用与代理依赖环'));
  const group=groups.find(g=>g.name===p.group),local=new Map(proxies.map(x=>[x.name,x]));
  const members=group?.proxies||[];
  const groupOK=group?.type==='select'&&Array.isArray(members)&&members.every(n=>local.has(n)&&!['direct','reject','pass','compatible'].includes(String(local.get(n).type).toLowerCase()))&&
    (members.length>0||(group.use||[]).length>0)&&!members.includes('REJECT')&&!members.includes('DIRECT')&&group['empty-fallback']===undefined;
  checks.push(result('claude_group',groupOK?'PASS':'FAIL','台湾家宽手动候选；不插入自定 REJECT 成员或空组回退'));
  const rules=config.rules||[],required=managedRules();
  const prefixOK=Array.isArray(rules)&&same(rules.slice(0,required.length),required);
  const oldReject=Array.isArray(rules)&&rules.some(r=>
    /^AND,/.test(r)&&/,REJECT$/.test(r)&&/(?:claude|anthropic|hcaptcha|sentry|statsig|segment|feature|datadog|intercom|stun|160\.79\.104|2607:6bc0)/i.test(r)||
    /^IP-CIDR6,2607:6bc0::\/32,REJECT/.test(r));
  checks.push(result('source_rules',prefixOK&&!oldReject?'PASS':'FAIL','小小东基础规则及用户明确补充清单；无额外 UDP/IPv6/STUN 拒绝'));
  const provider=config['rule-providers']?.[p.domainRuleSet],expected=domainProviderDefinition();
  checks.push(result('anthropic_rule_set',provider&&Object.entries(expected).every(([k,v])=>same(provider[k],v))&&!config['rule-providers']?.['claude-clash-strong-keywords']?'PASS':'FAIL','使用与小小东相同的 Anthropic 上游；保留手动更新和缓存适配'));
  const dns=config.dns||{},dnsProviders=dnsDomainProviders(config),dnsGroup=resolverProxy(dns.nameserver?.[0]||''),
    preset=dnsPreset(dnsGroup,!!dnsProviders['claude-clash-direct-dns']);
  const common=Object.entries(preset).filter(([k])=>k!=='nameserver-policy');
  const dnsOK=groups.some(g=>g.name===dnsGroup)&&common.every(([k,v])=>same(dns[k],v))&&Object.entries(preset['nameserver-policy']).every(([k,v])=>same(dns['nameserver-policy']?.[k],v))&&
    Object.entries(dnsProviders).every(([k,v])=>same(config['rule-providers']?.[k],v))&&
    !dns['nameserver-policy']?.['rule-set:claude-clash-strong-keywords']&&dns.fallback===undefined&&dns['fallback-filter']===undefined&&dns['fake-ip-range6']===undefined;
  checks.push(result('dns_paths',dnsOK?'PASS':'FAIL','国内直连/专用 DNS、Claude 组海外 DoH、日常代理组海外 DoH；节点解析独立'));
  checks.push(result('ipv6_settings',config.ipv6===false&&dns.ipv6===false?'PASS':'FAIL','沿用源配置的内核/DNS IPv6=false'));
  checks.push(result('rule_mode',config.mode==='rule'?'PASS':config.mode?'FAIL':'UNKNOWN','运行模式应为 rule'));
  const tun=config.tun||{},h=tun['dns-hijack']||[];
  checks.push(result('tun_settings',tun.enable===true&&tun['auto-route']===true&&h.includes('any:53')&&h.includes('tcp://any:53')?'PASS':'UNKNOWN','核对现有 TUN、自动路由与 UDP/TCP 53 劫持；不修改系统'));
  const excludes=['route-exclude-address','route-exclude-address-set','include-interface','exclude-interface','include-uid','exclude-uid','include-package','exclude-package'];
  checks.push(result('tun_exclusions',excludes.some(k=>tun[k]?.length)?'UNKNOWN':'PASS','非空排除项需现场核对'));
  return checks;
}
if(require.main===module){
  try{const checks=inspect(JSON.parse(fs.readFileSync(0,'utf8')));console.log(JSON.stringify({scope:'provided-config-snapshot',status:aggregate(checks),runtime_status:'UNKNOWN',checks}));}
  catch{console.log(JSON.stringify({scope:'provided-config-snapshot',status:'FAIL',checks:[result('schema','FAIL','配置无法解析；敏感内容未输出')]}));process.exitCode=1;}
}
module.exports={inspect,aggregate};
