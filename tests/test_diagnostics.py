import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'skills/claude-clash/scripts/check_env.py'
spec = importlib.util.spec_from_file_location('diagnostics', SCRIPT)
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


def completed(stdout='', returncode=0):
    return subprocess.CompletedProcess([], returncode, stdout, 'SECRET-STDERR')


class OfflineDiagnosticsTests(unittest.TestCase):
    def setUp(self):
        # A real HTTP or DNS/UDP attempt must fail the test, even if production code catches OSError.
        for name in ('socket.socket', 'socket.getaddrinfo', 'urllib.request.urlopen'):
            guard = patch(name, side_effect=AssertionError('Network forbidden in offline tests'))
            guard.start()
            self.addCleanup(guard.stop)

    def run_main(self, args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = d.main(args + ['--json'])
        return code, json.loads(out.getvalue())

    def test_default_and_offline_never_inspect_processes_or_connect(self):
        with patch.object(d.subprocess, 'run', side_effect=AssertionError('No subprocess in default mode')):
            for args in ([], ['--offline']):
                code, report = self.run_main(args)
                self.assertEqual(code, 2)
                self.assertEqual(report['status'], 'UNKNOWN')
                self.assertEqual(report['runtime_status'], 'UNKNOWN')

    def test_yaml_quoted_flow_names_commas_unicode_and_anchors(self):
        fixtures = [
            ('proxies:\n- {"name": "TW Residential", "type": "socks5"}\n', ['TW Residential']),
            ('proxies:\n- {name: "US, Premium", type: socks5}\n', ['US, Premium']),
            ('defaults: &d {type: socks5}\nproxies:\n- <<: *d\n  name: "日本 原生"\n', ['日本 原生']),
        ]
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'input.yaml'
            for text, expected in fixtures:
                file.write_text(text)
                self.assertEqual(d.scan_nodes(d.load_yaml(file)), expected)

    def test_yaml_duplicate_keys_and_malformed_config_do_not_echo_secrets(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'input.yaml'
            for text in ('password: SECRET-CANARY\npassword: other\n', 'password: [SECRET-CANARY\n'):
                file.write_text(text)
                code, report = self.run_main(['--offline','--config',str(file)])
                self.assertEqual(code,2)
                self.assertNotIn('SECRET-CANARY',json.dumps(report))

    def test_yaml_missing_dependency_has_no_regex_fallback(self):
        with patch.dict(sys.modules, {'yaml': None}):
            with self.assertRaisesRegex(ValueError,'PyYAML'):
                d.load_yaml('not-read.yaml')

    def test_process_failure_permission_error_empty_or_bad_output_is_unknown(self):
        for runner in [lambda *a,**k: completed('',1), lambda *a,**k: completed('',0),
                       lambda *a,**k: completed('"unclosed',0)]:
            result=d.check_processes(runner)
            self.assertEqual(result['status'],'UNKNOWN')
            self.assertIsNone(result['running'])
            self.assertNotIn('SECRET-STDERR',str(result))
        def denied(*a,**k): raise PermissionError()
        self.assertEqual(d.check_processes(denied)['status'],'UNKNOWN')

    def test_process_checks_detect_cli_desktop_and_node_without_printing_args(self):
        for text in ['/Applications/Claude.app/Contents/MacOS/Claude /Applications/Claude.app/Contents/MacOS/Claude',
                     'claude claude --token SECRET-CANARY',
                     'node node /tmp/node_modules/@anthropic-ai/claude-code/cli.js',
                     'node node /Users/test/Library/Application Support/node_modules/@anthropic-ai/claude-code/cli.js']:
            result=d.check_processes(lambda *a,**k: completed(text))
            self.assertEqual(result['status'],'FAIL')
            self.assertNotIn('SECRET-CANARY',str(result))
        self.assertEqual(d.check_processes(lambda *a,**k: completed('python3 python3 unrelated.py'))['status'],'PASS')


    def test_removed_network_flags_are_rejected_before_any_io(self):
        with patch.object(d.subprocess, 'run', side_effect=AssertionError('No process or network')):
            for args in (['--network'], ['--claude-trace'], ['--expected-ip', '192.0.2.30']):
                with contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaises(SystemExit) as stopped:
                        d.main(args)
                self.assertEqual(stopped.exception.code, 2)

    def test_downstream_merge_script_and_other_extensions_require_review(self):
        for field in ('merge','script','rules','proxies','groups'):
            profiles={'current':'active','items':[{'uid':'active','option':{field:'do-not-execute'}}]}
            result=d.inspect_extensions(profiles)
            self.assertEqual(result['status'],'UNKNOWN')
            self.assertEqual(result['mounted'],[field])
        self.assertEqual(d.inspect_extensions({'current':'a','items':[{'uid':'a'}]})['status'],'PASS')
        self.assertEqual(d.inspect_extensions({})['status'],'UNKNOWN')

    def test_config_validator_failure_never_passes(self):
        for runner in (lambda *a,**k: completed('not json'),lambda *a,**k: completed(''),
                       lambda *a,**k: completed('{"checks":[{"status":"PASS"}]}', 1)):
            self.assertEqual(d.inspect_config({},runner)[0]['status'],'UNKNOWN')

    def test_exit_codes_distinguish_pass_fail_and_incomplete(self):
        self.assertEqual([d.exit_code(s) for s in ('PASS','FAIL','UNKNOWN')],[0,1,2])
        self.assertEqual(d.aggregate([d.finding('x','FAIL',''),d.finding('y','UNKNOWN','')]),'FAIL')

    def test_actual_offline_cli_handles_good_bad_and_incomplete_snapshots(self):
        # Only Node/Python/Bash are executed. No live config or provider scripts are loaded.
        generated=subprocess.run(['node','-e',
            'const fs=require("node:fs");const {main}=require("./skills/claude-clash/templates/Script.js");'
            'console.log(JSON.stringify(main(JSON.parse(fs.readFileSync("tests/fixtures/base.json","utf8")))));'],
            cwd=ROOT,check=True,capture_output=True,text=True)
        config=json.loads(generated.stdout)
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'snapshot.json'
            for expected,mutate in [(0,lambda c: None),(1,lambda c: c.update(mode='global')),
                                    (2,lambda c: c['tun'].update({'route-exclude-address':['192.0.2.0/24']}))]:
                changed=json.loads(json.dumps(config)); mutate(changed)
                changed['password']='SECRET-CANARY'
                file.write_text(json.dumps(changed))
                run=subprocess.run(['bash',str(ROOT/'skills/claude-clash/scripts/check-env.sh'),
                                    '--offline','--config',str(file),'--json'],cwd=ROOT,capture_output=True,text=True)
                self.assertEqual(run.returncode,expected,run.stdout+run.stderr)
                report=json.loads(run.stdout)
                self.assertEqual(report['runtime_status'],'UNKNOWN')
                self.assertNotIn('SECRET-CANARY',run.stdout+run.stderr)


if __name__ == '__main__':
    unittest.main()
