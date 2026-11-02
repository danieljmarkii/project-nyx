# Bake-off verifier exhibits

Byte-identical copies of the inputs in `docs/vet-report-v3-discovery/bakeoff/`, plus `expected.json`, the report the real `verify.py` printed for each (facts, summary) pair; `../verifyCore.test.ts` asserts the Deno port matches every one. To regenerate, run this from the repo root as `python3 -I <this script>`:

```python
import json, os, re, subprocess, sys
B = "docs/vet-report-v3-discovery/bakeoff"
E = "supabase/functions/generate-report/aiLead/exhibits"
pairs = {}
for sub in ("out", "examples"):
    for f in sorted(os.listdir(os.path.join(E, sub))):
        m = re.match(r"(?:[A-Z]\d?-)?(cooper|mira|nyx)-", f) if sub == "out" else re.match(r"(cooper|mira|nyx)-", f)
        if m:
            pairs[sub + "/" + f] = "facts-%s.json" % m.group(1)
pairs["examples/prompt-example-output.json"] = "examples/prompt-example-facts.json"
expected = {}
for summ, facts in sorted(pairs.items()):
    r = subprocess.run(["python3", "-I", B + "/verify.py", os.path.join(E, facts), os.path.join(E, summ), "--quiet"],
                       capture_output=True, text=True)
    if r.returncode not in (0, 1):
        sys.exit("bad input: %s %s" % (summ, r.stdout + r.stderr))
    expected[summ] = json.loads(r.stdout)
with open(os.path.join(E, "expected.json"), "w", encoding="utf-8") as fh:
    json.dump(expected, fh, indent=1, ensure_ascii=False)
    fh.write("\n")
print(len(expected), "exhibits")
```
