#!/usr/bin/env bash
# claude-clash 本地环境只读诊断脚本（不打印任何节点密码、订阅链接等敏感信息）

set -euo pipefail

echo "=== 1. Clash Verge Rev 配置目录检查 ==="
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
    grep -E "^(mode|ipv6):" "$CV_DIR/clash-verge.yaml" || true
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

exclude_kw = ['香港', 'HK', 'HONG KONG', '澳门', 'MO', 'MACAU', '俄罗斯', 'RU', '白俄罗斯', 'BY', '剩余流量', '到期', '官网', '套餐']
valid = [n for n in names if not any(k in n.upper() for k in exclude_kw)]
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
echo "=== 2. 本机公网 IPv6 地址检查 ==="
if command -v ifconfig >/dev/null 2>&1; then
  IPV6_OUT=$(ifconfig | awk '/^[a-z]/{i=$1} $1=="inet6" && i!~/^(utun|lo|bridge|awdl|llw|gif|stf|anpi|ap|docker|veth)/ && $2!~/^(fe80|fd|fc|::1|2001:0:|2002:)/ {print i, $2}')
elif command -v ip >/dev/null 2>&1; then
  IPV6_OUT=$(ip -6 addr show scope global | awk '/inet6/{print $2}')
else
  IPV6_OUT=""
fi

if [[ -n "$IPV6_OUT" ]]; then
  echo "PUBLIC_IPV6=YES ($IPV6_OUT)"
  echo "建议：当前网络有公网 IPv6，Clash Verge「IPv6」开关应【打开】以防绕过 TUN 泄露。"
else
  echo "PUBLIC_IPV6=NO"
  echo "建议：当前网络无公网 IPv6，Clash Verge「IPv6」开关应【关闭】以防返回虚拟 IPv6 导致微信发图卡顿。"
fi

echo ""
echo "=== 3. 命令行無代理直连检测 (验证 TUN 是否真正生效) ==="
HTTP_IP=$(curl --noproxy '*' -s --max-time 8 https://ipinfo.io/ip || echo "FAILED")
HTTP_COUNTRY=$(curl --noproxy '*' -s --max-time 8 https://ipinfo.io/country || echo "FAILED")
echo "TUN_EXIT_IP=$HTTP_IP"
echo "TUN_EXIT_COUNTRY=$HTTP_COUNTRY"

echo ""
echo "=== 4. WebRTC / STUN UDP 出口检测 ==="
if command -v python3 >/dev/null 2>&1; then
  python3 - <<'EOF'
import os, socket, struct
try:
    tid = os.urandom(12)
    req = struct.pack('!HHI', 1, 0, 0x2112A442) + tid
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(6)
    s.sendto(req, ('stun.l.google.com', 19302))
    r = s.recv(2048)
    i = 20
    ip = None
    while i + 4 <= len(r):
        t, l = struct.unpack('!HH', r[i:i + 4])
        if t == 0x20 and r[i + 5] == 1:
            ip = '.'.join(str(b ^ m) for b, m in zip(r[i + 8:i + 12], b'\x21\x12\xa4\x42'))
            break
        i += 4 + l + (-l % 4)
    print('STUN_EXIT_IP=' + (ip or 'PARSE_FAILED'))
except Exception as e:
    print('STUN_EXIT_IP=FAILED (%s)' % e)
EOF
else
  echo "STUN_EXIT_IP=SKIPPED (python3 not found)"
fi
