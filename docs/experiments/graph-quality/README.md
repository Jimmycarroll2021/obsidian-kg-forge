# Reproduce the graph quality tasks

Read [CONTRACT.md](CONTRACT.md) before interpreting a result. The eight tasks and fixture workload are frozen in `quality.test.ts.txt`. [results.jsonl](results.jsonl) retains measurements, repair decisions and accounting corrections; a passing suite establishes these tasks, not category leadership.

The original source snapshots, per-run manifests, JSON assertion results and logs are preserved outside the worktree at `/tmp/forge-quality-series-az4j9d34/`. On that workstation, create a unique run with `python3 docs/experiments/graph-quality/run.py <unique-run-id> --hypothesis '<one change>'`. The runner refuses to overwrite an earlier directory and checks the contract/evaluator against the original baseline identities. Do not delete the store or treat a recreated store as continuity of its evidence.

For a fresh checkout or another machine, replay the frozen tasks in a disposable checkout without changing production tests:

```bash
npm ci
quality_dir=$(mktemp -d /tmp/forge-quality-replay-XXXXXXXX)
git archive HEAD | tar -x -C "$quality_dir"
ln -s "$PWD/node_modules" "$quality_dir/node_modules"
mkdir -p "$quality_dir/tests/experiments"
cp docs/experiments/graph-quality/quality.test.ts.txt "$quality_dir/tests/experiments/quality.test.ts"
cd "$quality_dir"
./node_modules/.bin/vitest run tests/experiments/quality.test.ts --reporter=json --outputFile=quality-result.json
```

The evaluator writes `projection-metrics.json` alongside its assertions. Record the source revision, lockfile, evaluator and contract hashes, host, command and output paths before comparing a replay. A replay is a new observation; it does not replace historical results or inherit their elapsed times. The baseline code is revision `c4596bd47bba3051e44ee4e79f9ab6a59161911e`; use that revision in `git archive` while copying the same frozen evaluator to compare the baseline on another machine.

Native verification is separate. Use disposable profiles/vaults and bind the loaded runtime files and input-note hashes to the receipt. The preserved native product baseline at `/tmp/forge-native-product-baseline-wncz1gfy/` contains two reproduced failures and nine immutable input notes. Candidate checks must reuse those notes and the host; additional parser/navigation fixtures belong in a separately labelled extension. Keep the original runner unchanged and identify any new runner rather than silently changing expected assertions.
