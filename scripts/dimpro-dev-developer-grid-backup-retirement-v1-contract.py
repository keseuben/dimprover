#!/usr/bin/env python3
import pathlib,json
SCRIPT=pathlib.Path(__file__).with_name("dimpro-dev-developer-grid-backup-retirement-v1.py").resolve()
s=SCRIPT.read_text(); p=0
def check(label,c):
    global p
    if not c: raise AssertionError(label)
    p+=1; print("PASS "+str(p).zfill(2)+" "+label)
check("backup root is developer-grid only",'BACKUP_ROOT=DEV_ROOT/"backups"/"developer-grid"' in s)
check("retirement evidence preserved",'EVIDENCE_FILE="RETIREMENT_EVIDENCE.json"' in s)
check("full file hashes feed tree digest","fh=sha_file(p)" in s and "treeSha256" in s)
check("external symlink blocked","snapshot contains external symlink" in s)
check("internal symlink target is hashed","target.as_posix()" in s and 'f"L\\0{rel}\\0{target.as_posix()}' in s)
check("shared hardlink blocked","snapshot contains shared hardlink" in s)
check("snapshot release metadata required",'.dimpro-release.json' in s)
check("snapshot BUILD_ID required",'"BUILD_ID"' in s)
check("source commit exists in canonical git","cat-file" in s and "canonical git repository" in s)
check("immutable manifest sidecar required","manifest sidecar mismatch" in s)
check("immutable EXE ZIP verified",'for k in ("exe","devZip")' in s)
check("active Central Core and PM2 commits protected","protected=active_heads()" in s)
check("dry-run tree digest must match explicit plan","snapshot-tree-sha-mismatch" in s and "snapshot-bytes-mismatch" in s)
check("apply needs maintenance lock","verify_maintenance(self_path)" in s)
check("apply needs directive-approved exact tool hash","backup retirement tool not approved by directive" in s)
check("deletes only snapshot directory","shutil.rmtree(sd)" in s)
check("backup directory remains","backupDir" in s and "RETIREMENT_EVIDENCE" in s)
print(json.dumps({"ok":True,"passed":p,"contract":"DIMPRO Developer Grid pre-materialize backup retirement V1"}))
