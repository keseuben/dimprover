#!/usr/bin/env python3
import hashlib
import json
import pathlib
import subprocess
import tempfile

SCRIPT = pathlib.Path(__file__).with_name("dimpro-dev-artifact-cache-retirement-v1.py").resolve()
passed = 0

def check(label, condition, detail=""):
    global passed
    if not condition:
        raise AssertionError(label + (" :: " + detail if detail else ""))
    passed += 1
    print("PASS " + str(passed).zfill(2) + " " + label)

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def run(args, cwd=None):
    return subprocess.run(args, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

with tempfile.TemporaryDirectory(prefix="dimpro-artifact-cache-contract-") as td:
    root = pathlib.Path(td)
    dev = root / "dev"
    worktrees = dev / "worktrees"
    artifacts = dev / "artifacts" / "benjadmin-developer-grid"
    coordination = dev / "coordination"
    wt = worktrees / "release-v1"
    art = artifacts / "v1-deadbee"
    skill = dev / "skills" / "SKILL.md"
    directive = coordination / "SAFE_DELETE_SKILL_REQUIRED.md"
    state = coordination / "developer-grid" / "state.json"

    wt.mkdir(parents=True)
    art.mkdir(parents=True)
    state.parent.mkdir(parents=True)
    skill.parent.mkdir(parents=True)

    subprocess.run(["git","init"],cwd=wt,check=True,stdout=subprocess.DEVNULL)
    subprocess.run(["git","config","user.name","DIMPRO Test"],cwd=wt,check=True)
    subprocess.run(["git","config","user.email","test@dimpro.local"],cwd=wt,check=True)
    (wt/"source.txt").write_text("source\n")
    (wt/"package-lock.json").write_text("{}\n")
    (wt/".gitignore").write_text(".next*\nnode_modules/\ndist/\ndist-dev/\n")
    subprocess.run(["git","add","."],cwd=wt,check=True)
    subprocess.run(["git","commit","-m","fixture"],cwd=wt,check=True,stdout=subprocess.DEVNULL)
    head = subprocess.check_output(["git","rev-parse","HEAD"],cwd=wt,text=True).strip()

    (wt/".next").mkdir()
    (wt/".next"/"cache.bin").write_bytes(b"x"*4096)
    (wt/"node_modules").mkdir()
    (wt/"node_modules"/"dep.bin").write_bytes(b"y"*4096)

    exe = art/"fixture.exe"
    zipf = art/"fixture.zip"
    exe.write_bytes(b"exe-fixture")
    zipf.write_bytes(b"zip-fixture")
    manifest = art/"ARTIFACT_MANIFEST_v1.json"
    manifest_obj = {
        "schemaVersion":1,
        "product":"BENJADMIN Developer Grid",
        "version":"1 DEV",
        "gitCommit":head,
        "gitBranch":"fixture",
        "buildId":"fixture-build",
        "environment":"DEV",
        "productionAccess":"DENY",
        "releaseMetadata":"VERIFIED",
        "standalone":"VERIFIED",
        "windowsArtifactProvenance":"VERIFIED",
        "packageSessionProvenance":"VERIFIED",
        "exe":{"file":exe.name,"sha256":sha(exe),"bytes":exe.stat().st_size},
        "devZip":{"file":zipf.name,"sha256":sha(zipf),"bytes":zipf.stat().st_size},
    }
    manifest.write_text(json.dumps(manifest_obj,indent=2)+"\n")
    pathlib.Path(str(manifest)+".sha256").write_text(sha(manifest)+"  "+manifest.name+"\n")

    state.write_text(json.dumps({"sessions":[]})+"\n")
    skill.write_text("# fixture Safe Delete skill\n")
    directive.parent.mkdir(parents=True,exist_ok=True)
    directive.write_text(
        "# directive\n\nRequired SHA-256:\n"+sha(skill)+
        "\n\nArtifact-cache retirement script SHA-256:\n"+sha(SCRIPT)+"\n"
    )

    plan = coordination/"plan.json"
    plan.write_text(json.dumps({
        "schemaVersion":1,
        "environment":"DEV",
        "productionAccess":"DENY",
        "entries":[{
            "id":"fixture",
            "worktree":str(wt),
            "expectedHead":head,
            "manifest":str(manifest),
        }]
    },indent=2)+"\n")

    report = coordination/"dry.json"
    args = [
        "python3",str(SCRIPT),
        "--plan="+str(plan),
        "--report-file="+str(report),
        "--dev-root="+str(dev),
        "--worktrees-root="+str(worktrees),
        "--artifacts-root="+str(artifacts),
        "--coordination-root="+str(coordination),
        "--skill="+str(skill),
        "--directive="+str(directive),
    ]
    p = run(args)
    check("fixture dry-run exits 0", p.returncode == 0, p.stderr)
    data = json.loads(report.read_text())
    check("fixture entry eligible", data["allEligible"] is True, str(data["entries"][0]["reasons"]))
    check("fixture finds .next and node_modules", sorted(x["relativePath"] for x in data["entries"][0]["caches"]) == [".next","node_modules"])
    check("dry-run deletes nothing", data["actions"]["deletedCount"] == 0 and (wt/".next").exists() and (wt/"node_modules").exists())
    check("artifact manifest SHA verified", data["entries"][0]["artifact"]["manifestSha256"] == sha(manifest))
    check("immutable EXE hash verified", data["entries"][0]["artifact"]["files"]["exe"]["sha256"] == sha(exe))
    check("immutable ZIP hash verified", data["entries"][0]["artifact"]["files"]["devZip"]["sha256"] == sha(zipf))

    (wt/"dirty.txt").write_text("dirty\n")
    dirty_report = coordination/"dirty.json"
    p = run([x if not x.startswith("--report-file=") else "--report-file="+str(dirty_report) for x in args])
    check("dirty dry-run still reports safely", p.returncode == 0, p.stderr)
    dirty = json.loads(dirty_report.read_text())
    check("dirty worktree is not eligible", dirty["allEligible"] is False)
    check("dirty worktree reason recorded", "dirty-worktree" in dirty["entries"][0]["reasons"])

    apply_report = coordination/"apply.json"
    apply_args = [x if not x.startswith("--report-file=") else "--report-file="+str(apply_report) for x in args] + ["--apply"]
    p = run(apply_args)
    check("apply outside canonical DEV fails closed", p.returncode != 0 and "apply allowed only on canonical DEV root" in p.stderr)
    check("failed apply leaves caches intact", (wt/".next").exists() and (wt/"node_modules").exists())

print(json.dumps({"ok":True,"passed":passed,"contract":"DIMPRO artifact-backed release cache retirement V1"}))
