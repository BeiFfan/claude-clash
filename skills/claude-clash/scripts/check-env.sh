#!/usr/bin/env bash
# claude-clash 本地环境诊断与 ip.net.coffee/claude 专项自动化检验脚本
# （只读安全脚本，绝不打印任何节点密码、订阅链接等敏感凭据）

set -euo pipefail

echo "=== 0. Claude 运行状态安全检查 (修改网络前必须关闭 Claude) ==="
CLAUDE_PROCS=$(ps -eo comm= 2>/dev/null | grep -iE '(^|/)(Claude|claude)$' || true)
if [[ -n "$CLAUDE_PROCS" ]]; then
  echo "⚠️ CLAUDE_RUNNING=YES"
  echo "检测到本机正在运行 Claude 客户端或 Claude Code CLI 进程！"
  echo "【重要警告】：在修改 Clash 脚本、切换节点或开关 TUN 前，请务必先完全退出 Claude 客户端、停止终端 claude 进程并关闭浏览器中的 claude.ai 标签页，防止会话中途 IP 跳变触发风控！"
else
  echo "CLAUDE_RUNNING=NO (未检测到本地 Claude 进程，仍请确认浏览器已关闭 claude.ai 标签页)"
fi

echo ""
echo "=== 1. Clash Verge Rev 配置目录与节点检查 ==="
if [[ "$(uname -s)" == "Darwin" ]]; then
  CV_DIR="$HOME/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev"
elif [[ "$(uname -s)" == "Linux" ]]; then
  CV_DIR="$HOME/.local/share/io.github.clash-verge-rev.clash-verge-rev"
else
  CV_DIR=""
fi

if [[ -n "$CV_DIR" && -d "$CV_DIR" ]]; then
  echo "FOUND_CONFIG_DIR: $CV_DIR"
  if [[ -f "$CV_DIR/verge.yaml" ]]; then
    grep -E "^(enable_tun_mode|enable_system_proxy|enable_dns_settings|clash_core):" "$CV_DIR/verge.yaml" || true
  fi
  if [[ -f "$CV_DIR/clash-verge.yaml" ]]; then
    echo "--- clash-verge.yaml 核心开关 ---"
    grep -E "^(mode|ipv6|client-fingerprint):" "$CV_DIR/clash-verge.yaml" || true
    grep -E "respect-rules:|fake-ip-range6:" "$CV_DIR/clash-verge.yaml" || true
    echo "--- GEOIP,CN 规则状态 ---"
    grep "GEOIP,CN" "$CV_DIR/clash-verge.yaml" || true
    if command -v python3 >/dev/null 2>&1; then
      echo "--- 订阅可用节点名称列表 (仅展示名称，不含服务器/密码) ---"
      python3 - "$CV_DIR/clash-verge.yaml" <<'PYEOF'
import sys, re

path = sys.argv[1]
names = []
in_proxies = False
with open(path, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        if re.match(r'^proxies:\s*$', line):
            in_proxies = True
            continue
        if in_proxies and re.match(r'^[a-zA-Z0-9_-]+:\s*$', line):
            break
        if in_proxies:
            m = re.search(r'^\s*-\s*\{.*?\bname:\s*([^,}]+)', line)
            if not m:
                m = re.search(r'^\s*-?\s*name:\s*(.+)$', line)
            if m:
                val = m.group(1).strip().strip('"').strip("'")
                if val:
                    names.append(val)

exclude_cn = ['香港', '澳门', '大陆', '俄罗斯', '白俄', '朝鲜', '伊朗', '叙利亚', '古巴', '剩余流量', '到期', '官网', '套餐']
exclude_code_re = re.compile(r'(^|[^A-Za-z])(HK|MO|CN|RU|BY|KP|IR|SY|CU|HONG KONG|MACAU|RUSSIA|BELARUS)([^A-Za-z]|$)', re.I)
valid = [n for n in names if not any(w in n for w in exclude_cn) and not exclude_code_re.search(n)]
res = [n for n in valid if re.search(r'家宽|住宅|residential|isp|原生', n, re.I)]
other = [n for n in valid if n not in res]

print(f"检测到可用非禁区节点共 {len(valid)} 个：")
if res:
    print("  [推荐-家宽/原生节点]:")
    for n in res:
        print(f"    - {n}")
if other:
    print("  [其他可用节点 (前25个)]:")
    for n in other[:25]:
        print(f"    - {n}")
PYEOF
    fi
  fi
else
  echo "CONFIG_DIR_NOT_FOUND"
fi

echo ""
echo "=== 2. 本机公网 IPv6 环境检查 ==="
if command -v ifconfig >/dev/null 2>&1; then
  IPV6_OUT=$(ifconfig | awk '/^[a-z]/{i=$1} $1=="inet6" && i!~/^(utun|lo|bridge|awdl|llw|gif|stf|anpi|ap|docker|veth)/ && $2!~/^(fe80|fd|fc|::1|2001:0:|2002:)/ {print i, $2}')
elif command -v ip >/dev/null 2>&1; then
  IPV6_OUT=$(ip -6 addr show scope global | awk '/inet6/{print $2}')
else
  IPV6_OUT=""
fi

if [[ -n "$IPV6_OUT" ]]; then
  echo "PUBLIC_IPV6=YES (${IPV6_OUT})"
  echo "提示：本机存在公网 IPv6，Clash Verge「设置 → Clash 设置 → IPv6」应保持【开启】以便 TUN 接管 IPv6 流量；Script.js 已设置 dns.ipv6: false 仅解析 IPv4 A 记录。"
else
  echo "PUBLIC_IPV6=NO"
  echo "提示：本机无公网 IPv6，Script.js 已默认设置 dns.ipv6: false 强制仅解析 IPv4，防止双栈泄漏与超时卡顿。"
fi

echo ""
echo "=== 3. ip.net.coffee/claude 专项全套自动化检验 ==="
if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PYEOF'
import json, os, random, re, socket, ssl, string, struct, subprocess, time, urllib.request

def http_get(url, timeout=8):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*"
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="ignore")

# 3.1 三出口 IP 分流对比
cn_ip = "FAILED"
for cn_url in ["https://2026.ip138.com/", "https://my.ip.cn/"]:
    try:
        html = http_get(cn_url, timeout=5)
        m = re.search(r'(\d+\.\d+\.\d+\.\d+)', html)
        if m:
            cn_ip = m.group(1)
            break
    except Exception:
        pass

cf_ip = "FAILED"
try:
    txt = http_get("https://1.1.1.1/cdn-cgi/trace", timeout=6)
    m = re.search(r'ip=([^\n]+)', txt)
    if m:
        cf_ip = m.group(1).strip()
except Exception:
    pass

claude_ip = "FAILED"
claude_loc = ""
try:
    txt = http_get("https://claude.ai/cdn-cgi/trace", timeout=8)
    for line in txt.splitlines():
        if line.startswith("ip="):
            claude_ip = line.split("=", 1)[1].strip()
        elif line.startswith("loc="):
            claude_loc = line.split("=", 1)[1].strip()
except Exception:
    pass

print(f"[三出口分流对比]")
print(f"  1) 中国出口 IPv4     : {cn_ip}")
print(f"  2) Cloudflare 出口 IP: {cf_ip}")
print(f"  3) Claude AI 出口 IP : {claude_ip} ({claude_loc})")

# 3.2 调用 ip.net.coffee 评估 Claude 出口 IP 纯净度与安全属性
if claude_ip != "FAILED":
    try:
        risk_raw = http_get(f"https://ip.net.coffee/api/iprisk/{claude_ip}", timeout=10)
        risk = json.loads(risk_raw)
        score = risk.get("trust_score", "N/A")
        is_res = risk.get("isResidential")
        country = risk.get("country", "")
        cc = (risk.get("countryCode") or claude_loc or "").upper()
        city = risk.get("city", "")
        asn = risk.get("asn", "")
        org = risk.get("asOrganization", "")
        vpn = risk.get("is_vpn", risk.get("isVpn", False))
        proxy = risk.get("is_proxy", risk.get("isProxy", False))
        tor = risk.get("is_tor", risk.get("isTor", False))
        crawler = risk.get("is_crawler", risk.get("isCrawler", False))
        abuse = risk.get("is_abuser", risk.get("isAbuse", False))
        abuser_score = risk.get("abuser_score", "")

        restricted_cc = {'CN', 'HK', 'MO', 'RU', 'KP', 'IR', 'BY', 'SY', 'CU'}
        region_ok = "正常 (受支持地区)" if cc not in restricted_cc else f"❌ 受限地区 ({cc})"
        ip_type = "家庭住宅IP (ISP) ✅" if is_res else "数据中心/机房IP (Hosting) ⚠️"

        print(f"\n[ip.net.coffee Claude 出口纯净度评分]")
        print(f"  - 信任评分 (Trust Score): {score} / 100")
        print(f"  - Claude 支持地区       : {region_ok}")
        print(f"  - 归属地与城市          : {country} {city} ({cc})")
        print(f"  - IP 属性               : {ip_type}")
        print(f"  - ASN / 运营商          : AS{asn} ({org})")
        print(f"  - 安全检测 (越少越好)   : VPN={vpn} | Proxy={proxy} | Tor={tor} | Crawler={crawler} | Abuse={abuse}" + (f" ({abuser_score})" if abuser_score else ""))
    except Exception as e:
        print(f"\n[ip.net.coffee Claude 出口纯净度评分]: 获取失败 ({e})")

# 3.3 调用 ip.net.coffee 动态子域名权威 DNS 泄露检测
print(f"\n[ip.net.coffee 动态子域名 DNS 泄露检测]")
try:
    token = ''.join(random.choices(string.ascii_lowercase + string.digits, k=22))
    for i in (1, 2):
        try:
            http_get(f"https://{token}-{i}.d.ip.net.coffee/pixel.gif?_={int(time.time()*1000)}", timeout=3)
        except Exception:
            pass
    time.sleep(1.5)
    dns_res = json.loads(http_get(f"https://ip.net.coffee/api/dns/result/{token}", timeout=5))
    dns_servers = dns_res.get("dns_servers") or []
    if not dns_servers:
        print("  - 状态: 未暴露递归 DNS 或已加密 ✅")
    else:
        leaked = False
        for dip in dns_servers[:3]:
            try:
                g = json.loads(http_get(f"https://ip.net.coffee/api/geoip/{dip}", timeout=4))
                dcc = (g.get("country_code") or "").upper()
                disp = g.get("isp") or g.get("country") or ""
                if dcc == "CN":
                    leaked = True
                print(f"  - DNS 出口: {dip} ({dcc} - {disp})")
            except Exception:
                print(f"  - DNS 出口: {dip}")
        print("  - 结论: " + ("❌ 检测到中国大陆 DNS 泄露！" if leaked else "未检测到 DNS 泄露 ✅"))
except Exception as e:
    print(f"  - DNS 检测未完成: {e}")

# 3.4 WebRTC / STUN UDP 出口检测与一致性核对
print(f"\n[WebRTC STUN UDP 出口检测]")
stun_ip = None
try:
    tid = os.urandom(12)
    req = struct.pack('!HHI', 1, 0, 0x2112A442) + tid
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(3)
    s.sendto(req, ('stun.l.google.com', 19302))
    r = s.recv(2048)
    i = 20
    while i + 4 <= len(r):
        t, l = struct.unpack('!HH', r[i:i + 4])
        if t == 0x20 and r[i + 5] == 1:
            stun_ip = '.'.join(str(b ^ m) for b, m in zip(r[i + 8:i + 12], b'\x21\x12\xa4\x42'))
            break
        i += 4 + l + (-l % 4)
except Exception:
    stun_ip = None

if stun_ip is None:
    print("  - STUN UDP 状态: 已在网络层阻断 (STUN_MODE=REJECT) -> ip.net.coffee 显示「WebRTC 已禁用或无泄露」✅")
elif stun_ip == claude_ip:
    print(f"  - STUN UDP 出口: {stun_ip} (与 Claude TCP 出口 IP 完全一致) ✅")
else:
    print(f"  - STUN UDP 出口: {stun_ip} ⚠️ 与 Claude TCP 出口 ({claude_ip}) 不一致！")
    print("    原因说明: 当前节点为「机场链式落地节点」（TCP 走家宽，UDP 落回前置机房），建议在 Script.js 中将 STUN_MODE 设为 \"REJECT\"。")
PYEOF
fi
