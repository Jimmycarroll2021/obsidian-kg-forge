#!/usr/bin/env python3
"""Snapshot the whole worktree and run the frozen task evaluator once."""
import argparse
import hashlib
import json
import platform
import shutil
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RECORDS = ROOT / 'docs/experiments/graph-quality'
STORE = Path('/tmp/forge-quality-series-az4j9d34')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def record(run, returncode):
    source = run / 'source'
    manifest = json.loads((run / 'manifest.json').read_text())
    result_path = source / 'quality-result.json'
    metrics_path = source / 'projection-metrics.json'
    result = json.loads(result_path.read_text()) if result_path.exists() else {}
    metrics = json.loads(metrics_path.read_text()) if metrics_path.exists() else None
    assertions = [a for suite in result.get('testResults', []) for a in suite.get('assertionResults', [])]
    valid = len(assertions) == 8 and metrics is not None and returncode in (0, 1)
    row = {
        'runId': manifest['runId'], 'series': 1, 'sourceCommit': manifest.get('sourceCommit'),
        'sourceDigest': manifest.get('sourceDigest'), 'hypothesis': manifest['hypothesis'],
        'evaluatorSha256': manifest['evaluatorSha256'], 'contractSha256': manifest['contractSha256'],
        'valid': valid, 'passed': result.get('numPassedTests') if valid else None,
        'total': len(assertions) if valid else None,
        'tasks': {a['title']: a['status'] for a in assertions}, 'projection': metrics,
        'exitCode': returncode, 'elapsedSeconds': time.time() - manifest['startedUnix'],
        'artifactDirectory': str(run), 'decision': 'baseline' if run.name == 'baseline' else 'pending',
    }
    (run / 'summary.json').write_text(json.dumps(row, indent=2) + '\n')
    with (RECORDS / 'results.jsonl').open('a') as f:
        f.write(json.dumps(row, sort_keys=True) + '\n')
    print(json.dumps(row, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('run_id')
    parser.add_argument('--hypothesis')
    parser.add_argument('--collect-baseline', action='store_true')
    parser.add_argument('--product-base', help='Use a prior immutable snapshot for product files')
    parser.add_argument('--override-file', action='append', default=[])
    args = parser.parse_args()
    if args.collect_baseline:
        record(STORE / 'baseline', 1)
        return
    if not args.run_id or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for c in args.run_id):
        raise SystemExit('Use a unique lowercase run ID')
    baseline = json.loads((STORE / 'baseline/manifest.json').read_text())
    for name, path in [('evaluatorSha256', RECORDS / 'quality.test.ts.txt'), ('contractSha256', RECORDS / 'CONTRACT.md')]:
        if digest(path) != baseline[name]:
            raise SystemExit('Frozen comparison input changed; establish a new series')
    run = STORE / args.run_id
    run.mkdir()  # Never overwrite an earlier run.
    source = run / 'source'
    source.mkdir()
    started = time.time()
    names = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT).decode().split('\0')
    product_base = None
    if args.product_base:
        product_base = STORE / args.product_base / 'source'
        previous = json.loads((product_base.parent / 'manifest.json').read_text())
        names = list(previous['sourceHashes']) + [name for name in names if name.startswith('docs/')]
    hashes = {}
    for name in sorted(set(names) - {''}):
        src = (ROOT if product_base is None or name.startswith('docs/') or name in args.override_file else product_base) / name
        if not src.is_file():
            continue
        dst = source / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
        hashes[name] = digest(dst)
    (source / 'node_modules').symlink_to(ROOT / 'node_modules', target_is_directory=True)
    evaluator = source / 'tests/experiments/quality.test.ts'
    evaluator.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(RECORDS / 'quality.test.ts.txt', evaluator)
    manifest = {
        'runId': args.run_id, 'series': 1, 'hypothesis': args.hypothesis,
        'productBase': args.product_base, 'overriddenFiles': args.override_file,
        'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'sourceDigest': hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest(),
        'sourceHashes': hashes, 'evaluatorSha256': digest(evaluator),
        'contractSha256': digest(RECORDS / 'CONTRACT.md'), 'lockfileSha256': digest(source / 'package-lock.json'),
        'startedUnix': started, 'platform': platform.platform(), 'timeoutSeconds': 60,
        'command': 'vitest run tests/experiments/quality.test.ts --reporter=json --outputFile=quality-result.json',
    }
    (run / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    command = [str(ROOT / 'node_modules/.bin/vitest'), 'run', 'tests/experiments/quality.test.ts', '--reporter=json', '--outputFile=quality-result.json']
    with (run / 'evaluator.log').open('w') as log:
        try:
            completed = subprocess.run(command, cwd=source, stdout=log, stderr=subprocess.STDOUT, timeout=60)
            returncode = completed.returncode
        except subprocess.TimeoutExpired:
            returncode = 124
    record(run, returncode)


if __name__ == '__main__':
    main()
