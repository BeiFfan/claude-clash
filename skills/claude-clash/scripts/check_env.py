#!/usr/bin/env python3
"""Offline configuration diagnostics. Reads explicit files; optional read-only process inspection."""
import argparse
import json
from pathlib import Path
import re
import shlex
import subprocess
import sys

HERE = Path(__file__).resolve().parent


def finding(name, status, message, **details):
    return dict(name=name, status=status, message=message, **details)


def aggregate(checks):
    states = [c['status'] for c in checks]
    if 'FAIL' in states:
        return 'FAIL'
    if 'UNKNOWN' in states or not any(s == 'PASS' for s in states):
        return 'UNKNOWN'
    return 'PASS'


def exit_code(status):
    return {'PASS': 0, 'FAIL': 1, 'UNKNOWN': 2}[status]


def load_yaml(path):
    # Never replace a YAML parser with regex; never print YAML errors containing secrets.
    try:
        import yaml
    except ImportError:
        raise ValueError('缺少 PyYAML；请在项目虚拟环境安装 requirements.txt') from None

    class UniqueLoader(yaml.SafeLoader):
        pass

    def mapping(loader, node, deep=False):
        seen = set()
        for key_node, _ in node.value:
            if key_node.tag == 'tag:yaml.org,2002:merge':
                continue
            key = loader.construct_object(key_node, deep=deep)
            if key in seen:
                raise ValueError('YAML 含重复键')
            seen.add(key)
        return yaml.SafeLoader.construct_mapping(loader, node, deep=deep)

    UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, mapping)
    try:
        with Path(path).open(encoding='utf-8') as stream:
            data = yaml.load(stream, Loader=UniqueLoader)
    except (OSError, yaml.YAMLError, TypeError):
        raise ValueError('无法读取/解析 YAML（未输出配置内容）') from None
    if not isinstance(data, dict):
        raise ValueError('YAML 顶层须为对象')
    return data


def scan_nodes(config):
    proxies = config.get('proxies') or []
    if not isinstance(proxies, list) or any(not isinstance(p, dict) or not isinstance(p.get('name'), str) for p in proxies):
        raise ValueError('节点列表格式错误')
    # Names only. These are labels, not proofs of availability, geography or ISP type.
    return [p['name'] for p in proxies]


def inspect_config(config, run=None):
    runner = run or subprocess.run
    try:
        proc = runner(['node', str(HERE / 'config-tool.js')], input=json.dumps(config),
                      capture_output=True, text=True, timeout=15, check=False)
        if proc.returncode != 0:
            raise ValueError()
        data = json.loads(proc.stdout)
        if not isinstance(data.get('checks'), list):
            raise ValueError()
        return data['checks']
    except (OSError, subprocess.SubprocessError, ValueError, TypeError):
        return [finding('config_validator', 'UNKNOWN', '离线配置校验器未完成；需要 Node.js，未输出配置内容')]


def inspect_extensions(profiles):
    items = profiles.get('items') or []
    current = profiles.get('current')
    if not isinstance(items, list):
        return finding('downstream_extensions', 'UNKNOWN', 'profiles 元数据格式无法识别')
    active = next((p for p in items if isinstance(p, dict) and p.get('uid') == current), None)
    if not active:
        return finding('downstream_extensions', 'UNKNOWN', '无法定位当前订阅；须检查完整扩展链路')
    options = active.get('option') or {}
    if not isinstance(options, dict):
        return finding('downstream_extensions', 'UNKNOWN', '订阅 option 格式无法识别')
    mounted = [key for key in ('merge', 'script', 'rules', 'proxies', 'groups') if options.get(key)]
    return finding('downstream_extensions', 'UNKNOWN' if mounted else 'PASS',
                   '检测到后续扩展；须同时审核扩展配置与脚本，并重验最终生成快照' if mounted else '当前订阅未声明后续扩展；仍须核对应用设置回写',
                   mounted=mounted)


def check_processes(run=None):
    runner = run or subprocess.run
    try:
        proc = runner(['ps', '-eo', 'comm=,args='], capture_output=True, text=True, timeout=5, check=False)
        if proc.returncode != 0 or not proc.stdout.strip():
            return finding('claude_processes', 'UNKNOWN', '无法读取进程列表', running=None)
        for line in proc.stdout.splitlines():
            # ps does not shell-quote argv. A Node CLI path may contain spaces.
            executable = line.strip().split(None, 1)[0] if line.strip() else ''
            if Path(executable).name.lower() in ('node', 'node.exe', 'bun', 'bun.exe') and re.search(
                    r'[/\\]@anthropic-ai[/\\]claude-code[/\\](cli|index)\.(js|mjs)(?=\s|$)', line, re.I):
                return finding('claude_processes', 'FAIL', '检测到相关进程；修改网络前先关闭', running=True)
            try:
                parts = shlex.split(line)
            except ValueError:
                return finding('claude_processes', 'UNKNOWN', '进程列表无法完整解析', running=None)
            # Do not print args: they may contain credentials. Match executable/helper or Node CLI path.
            candidates = parts[:3]
            if any(re.search(r'(^|[/\\])(claude(?:\.exe)?|Claude Helper(?: \([^)]*\))?)$', s, re.I) or
                   re.search(r'[/\\]@anthropic-ai[/\\]claude-code[/\\](cli|index)\.(js|mjs)$', s, re.I)
                   for s in candidates):
                return finding('claude_processes', 'FAIL', '检测到相关进程；修改网络前先关闭', running=True)
        return finding('claude_processes', 'PASS', '所读列表未发现相关进程；浏览器标签页须另行确认', running=False)
    except (OSError, subprocess.SubprocessError):
        return finding('claude_processes', 'UNKNOWN', '进程检查未完成', running=None)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true', help='只检查指定的本地文件（默认行为）')
    parser.add_argument('--config', type=Path, help='待检查的最终生成 YAML 快照；不自动读取本机配置')
    parser.add_argument('--profiles', type=Path, help='profiles.yaml，用于排查后续扩展挂载')
    parser.add_argument('--check-processes', action='store_true', help='显式执行只读 ps；无法确认浏览器页面状态')
    parser.add_argument('--json', action='store_true')
    args = parser.parse_args(argv)
    checks, nodes = [], []
    if args.config:
        try:
            config = load_yaml(args.config)
            nodes = scan_nodes(config)
            checks.extend(inspect_config(config))
        except ValueError as exc:
            checks.append(finding('config_file', 'UNKNOWN', str(exc)))
    if args.profiles:
        try:
            checks.append(inspect_extensions(load_yaml(args.profiles)))
        except ValueError as exc:
            checks.append(finding('profiles_file', 'UNKNOWN', str(exc)))
    if args.check_processes:
        checks.append(check_processes())
    if not checks:
        checks.append(finding('input', 'UNKNOWN', '未提供配置快照；默认不联网，不检查本机进程'))
    status = aggregate(checks)
    report = dict(scope='provided-files-only',
                  status=status, runtime_status='UNKNOWN', checks=checks, node_labels=nodes,
                  limitations=['运行中的内核配置、当前选中节点、浏览器页面和真实网络路径须另行核对'])
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"SCOPE={report['scope']} STATUS={status} RUNTIME=UNKNOWN")
        for row in checks:
            print(f"[{row['status']}] {row['name']}: {row['message']}")
        if nodes:
            print('节点名称（标签，未证明地区/可用性/住宅属性）：')
            for name in nodes:
                print('  ' + json.dumps(name, ensure_ascii=False))
        for item in report['limitations']:
            print('范围说明：' + item)
    return exit_code(status)


if __name__ == '__main__':
    sys.exit(main())
