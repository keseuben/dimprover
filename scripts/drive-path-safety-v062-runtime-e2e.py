#!/usr/bin/env python3
import hashlib
import io
import json
import os
import random
import re
import string
import time
import zipfile
from xml.etree import ElementTree as ET

import requests

BASE_URL = os.getenv("DRIVE_V062_E2E_BASE_URL", "http://127.0.0.1:3298").rstrip("/")
TOKEN_PATH = os.getenv("DRIVE_V062_E2E_TOKEN_PATH")
if not TOKEN_PATH:
    raise SystemExit("DRIVE_V062_E2E_TOKEN_PATH is required")
TOKEN = open(TOKEN_PATH, "r", encoding="utf-8").read().strip()
STAMP = int(time.time() * 1000)
ACTOR = f"qa-drive-v062-{STAMP}"
CLIENT_ID = "benjamin-drive-v062-path-e2e"
PASS = 0

def check(name, condition, detail=""):
    global PASS
    if not condition:
        raise AssertionError(f"{name}{' :: ' + detail if detail else ''}")
    PASS += 1
    print(f"PASS {PASS:02d} {name}{' :: ' + detail if detail else ''}", flush=True)

def headers(json_body=False):
    out = {
        "host": "drive.dev.dimpro.hu",
        "x-dimpro-drive-dev-token": TOKEN,
        "x-dimpro-drive-client-id": CLIENT_ID,
        "x-dimpro-notification-user-id": ACTOR,
        "x-dimpro-notification-user-name": "DIMPRO Drive V0.6.2 Path QA",
    }
    if json_body:
        out["content-type"] = "application/json"
    return out

def api(method, path, body=None, timeout=60):
    payload = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    response = requests.request(method, BASE_URL + path, headers=headers(body is not None), data=payload, timeout=timeout)
    try:
        data = response.json()
    except Exception:
        data = {"raw": response.text}
    return response, data

def create_folder(project_id, parent_id, name):
    response, payload = api("POST", f"/api/projects/{project_id}/drive/folders", {
        "name": name, "originalName": name, "displayName": name, "parentId": parent_id
    })
    check(f"folder {name[:20]}", response.status_code == 201 and payload.get("ok") is True, f"HTTP {response.status_code}")
    folder = payload.get("folder") or {}
    check("folder technical safe", bool(re.fullmatch(r"[A-Za-z0-9_-]+", str(folder.get("name", "")))), str(folder.get("name", "")))
    return folder

def upload_file(project_id, folder_id, file_row, original_relative_path):
    body = file_row["body"]
    sha256 = hashlib.sha256(body).hexdigest()
    response, init = api("POST", f"/api/projects/{project_id}/drive/uploads/init", {
        "folderId": folder_id,
        "documentName": file_row["name"],
        "originalName": file_row["name"],
        "originalRelativePath": original_relative_path,
        "mimeType": file_row["mime"],
        "sizeBytes": len(body),
        "sha256": sha256,
        "revisionCode": "V1",
        "description": "Drive V0.6.2 path runtime E2E",
        "changeNote": "V0.6.2 acceptance",
        "source": "WEB",
    })
    check(f'{file_row["label"]} init', response.status_code == 201 and init.get("signedUpload", {}).get("url") and init.get("completeUrl"), f"HTTP {response.status_code}")
    signed = init["signedUpload"]
    put = requests.put(
        signed["url"],
        headers=signed.get("headers") or {"content-type": file_row["mime"]},
        data=body,
        timeout=60,
    )
    check(f'{file_row["label"]} PUT', put.ok, f"HTTP {put.status_code}")
    done = requests.post(BASE_URL + init["completeUrl"], headers=headers(True), data=b"{}", timeout=90)
    try:
        result = done.json()
    except Exception:
        result = {"raw": done.text}
    check(f'{file_row["label"]} complete', done.status_code == 200 and result.get("ok") is True, f"HTTP {done.status_code}")
    obj = result.get("object") or {}
    check(f'{file_row["label"]} checksum', obj.get("checksumVerified") is True and obj.get("sha256") == sha256)
    scan = ((result.get("securityScan") or {}).get("scan") or {}).get("status")
    check(f'{file_row["label"]} CLEAN', scan == "CLEAN", str(scan))
    normalized_path = "/".join(x for x in original_relative_path.replace("\\", "/").split("/") if x)
    return {"document": result.get("document"), "version": result.get("version"), "originalPath": normalized_path}

def xlsx_shared_strings(archive):
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    out = []
    for si in root.findall("m:si", ns):
        texts = [node.text or "" for node in si.findall(".//m:t", ns)]
        out.append("".join(texts))
    return out

def col_index(ref):
    letters = "".join(ch for ch in ref if ch.isalpha())
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch.upper()) - 64)
    return n - 1

def xlsx_sheet_rows(archive, sheet_no):
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    shared = xlsx_shared_strings(archive)
    root = ET.fromstring(archive.read(f"xl/worksheets/sheet{sheet_no}.xml"))
    rows = []
    for row in root.findall(".//m:sheetData/m:row", ns):
        cells = {}
        for cell in row.findall("m:c", ns):
            ref = cell.attrib.get("r", "A1")
            idx = col_index(ref)
            typ = cell.attrib.get("t")
            value = ""
            if typ == "inlineStr":
                value = "".join((t.text or "") for t in cell.findall(".//m:t", ns))
            else:
                node = cell.find("m:v", ns)
                raw = node.text if node is not None and node.text is not None else ""
                if typ == "s" and raw:
                    try:
                        value = shared[int(raw)]
                    except Exception:
                        value = raw
                else:
                    value = raw
            cells[idx] = value
        width = max(cells.keys(), default=-1) + 1
        rows.append([cells.get(i, "") for i in range(width)])
    return rows

def workbook_sheet_names(archive):
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ET.fromstring(archive.read("xl/workbook.xml"))
    return [x.attrib.get("name", "") for x in root.findall(".//m:sheets/m:sheet", ns)]

def header_row(rows, label):
    for i, row in enumerate(rows):
        if label in row:
            return i
    raise AssertionError(f"missing header: {label}")

response, create = api("POST", "/api/projects", {
    "name": f"Drive V0.6.2 PATH QA {STAMP}",
    "code": f"V062-{str(STAMP)[-6:]}",
    "description": "Long/special Windows path -> safe path -> ZIP -> XLSX -> audit E2E",
    "currentPhase": "DEV QA",
})
check("project create", response.status_code == 201 and create.get("ok") is True, f"HTTP {response.status_code}")
project_id = (create.get("project") or {}).get("id")
check("project id", isinstance(project_id, str) and project_id.startswith("project-"))
print(json.dumps({"projectId": project_id, "driveProvisioning": create.get("driveProvisioning"), "identityProvisioning": create.get("identityProvisioning")}, ensure_ascii=False, indent=2), flush=True)
check("auto provision", (create.get("driveProvisioning") or {}).get("ready") is True)

folder_names = [
    "00 V0.6.2 E2E – Őrült hosszú projektmappa + #2026 (A) – dokumentáció és tervellenőrzés",
    "CON",
    "02 Építészeti tervek – homlokzat, metszet, részletrajzok + jóváhagyásra",
    "03 Gépészet – HMV, légtechnika, csővezetékek és technológiai dokumentáció",
    "04 Villamosság – erősáram, gyengeáram, tűzjelző, automatika + revízió",
    "05 Alvállalkozó – MÉRNÖKI JÓVÁHAGYÁSRA – Revízió 07 – őűáéíóöüŐŰ",
]
folders = []
parent_id = None
for name in folder_names:
    row = create_folder(project_id, parent_id, name)
    folders.append(row)
    parent_id = row["id"]
root_folder = folders[0]
leaf_folder = folders[-1]
con_folder = folders[1]
check("depth 6", len(folders) == 6 and leaf_folder.get("parentId") == folders[-2].get("id"))
check("CON normalized", con_folder.get("originalName") == "CON" and con_folder.get("name") != "CON")

prefix = "\\".join(folder_names)
files = [
    {
        "label": "long unicode TXT",
        "name": "Szekszárd_Őrült_hosszú_tervlapnév_(jóváhagyásra)_#2026_rev07_" + ("A" * 88) + ".txt",
        "mime": "text/plain",
        "body": (f"V062 A {STAMP}\n" + os.urandom(48).hex()).encode(),
    },
    {
        "label": "reserved CON TXT",
        "name": "CON.txt",
        "mime": "text/plain",
        "body": f"V062 CON {STAMP}\n".encode(),
    },
    {
        "label": "special DWG",
        "name": "Gépészet + villamosság – csővezeték [M=1:50] – rev.07 #" + ("B" * 52) + ".dwg",
        "mime": "application/octet-stream",
        "body": b"AC1027-DIMPRO-V062\n" + os.urandom(128),
    },
]
uploaded = []
for file_row in files:
    original_path = prefix + "\\" + file_row["name"]
    check(f'{file_row["label"]} path >180', len(original_path) > 180, f"len={len(original_path)}")
    uploaded.append(upload_file(project_id, leaf_folder["id"], file_row, original_path))

response, tree = api("GET", f"/api/projects/{project_id}/drive/tree")
check("tree 200", response.status_code == 200 and bool(tree.get("tree")))
docs = [d for d in (tree["tree"].get("documents") or []) if d.get("folderId") == leaf_folder["id"]]
check("all originals persist", all(any((d.get("currentVersion") or {}).get("originalName") == f["name"] for d in docs) for f in files))
selected_docs = [d for d in docs if any((d.get("currentVersion") or {}).get("originalName") == f["name"] for f in files)]
check("all technical names safe", all(re.fullmatch(r"[A-Za-z0-9_.-]+", str(d.get("name", ""))) for d in selected_docs))

download = requests.get(
    f"{BASE_URL}/api/projects/{project_id}/drive/folders/{root_folder['id']}/download",
    headers=headers(),
    timeout=120,
)
check("ZIP HTTP 200", download.status_code == 200, f"HTTP {download.status_code}")
check("ZIP files header", int(download.headers.get("x-dimpro-drive-zip-files", "-1")) == len(files))
check("ZIP skipped 0", int(download.headers.get("x-dimpro-drive-zip-skipped", "-1")) == 0)
package_id = download.headers.get("x-dimpro-drive-download-package-id", "")
register_name = download.headers.get("x-dimpro-drive-document-register", "")
check("package id", bool(re.fullmatch(r"DLP-\d{8}-[A-F0-9]{6}", package_id)), package_id)
check("register header", register_name == "DIMPRO_Digitalis_Dokumentaciojegyzek.xlsx")

package_zip = zipfile.ZipFile(io.BytesIO(download.content))
entries = [x.filename for x in package_zip.infolist() if not x.is_dir()]
register_entry = next((x for x in entries if x.endswith("/DIMPRO_Digitalis_Dokumentaciojegyzek.xlsx")), None)
manifest_entry = next((x for x in entries if x.endswith("/DIMPRO_fajllista.txt")), None)
check("register in ZIP", register_entry is not None)
check("manifest in ZIP", manifest_entry is not None)
source_entries = [x for x in entries if x not in {register_entry, manifest_entry}]
check("source count", len(source_entries) == len(files))
check("ZIP paths <=180", all(len(x) <= 180 for x in source_entries), ",".join(str(len(x)) for x in source_entries))
check("ZIP paths ASCII safe", all(re.fullmatch(r"[A-Za-z0-9_./-]+", x) for x in source_entries))

register_bytes = package_zip.read(register_entry)
xlsx = zipfile.ZipFile(io.BytesIO(register_bytes))
sheet_names = workbook_sheet_names(xlsx)
check("3 register sheets", sheet_names == ["Dokumentációjegyzék", "Mappastruktúra", "Csomaginformációk"], ",".join(sheet_names))

doc_rows = xlsx_sheet_rows(xlsx, 1)
hi = header_row(doc_rows, "Eredeti importútvonal")
hdr = doc_rows[hi]
op = hdr.index("Eredeti importútvonal")
sp = hdr.index("DIMPRO biztonságos útvonal")
on = hdr.index("Eredeti fájlnév")
sn = hdr.index("DIMPRO biztonságos fájlnév")
rows = [r for r in doc_rows[hi + 1:] if any(r)]
def cell(row, idx):
    return row[idx] if idx < len(row) else ""
check("register originals", all(any(cell(r, on) == f["name"] for r in rows) for f in files))
check("register original paths", all(any(cell(r, op) == u["originalPath"] for r in rows) for u in uploaded))
relevant = [r for r in rows if any(cell(r, on) == f["name"] for f in files)]
check("register safe paths <=180", all(len(str(cell(r, sp))) <= 180 for r in relevant))
check("register ZIP path exact", all(cell(r, sp) in source_entries for r in relevant))
check("register safe names", all(re.fullmatch(r"[A-Za-z0-9_.-]+", str(cell(r, sn))) for r in relevant))

folder_rows = xlsx_sheet_rows(xlsx, 2)
fhi = header_row(folder_rows, "Eredeti mappanév")
fh = folder_rows[fhi]
of = fh.index("Eredeti mappanév")
tf = fh.index("DIMPRO technikai mappanév")
frows = [r for r in folder_rows[fhi + 1:] if any(r)]
con_row = next((r for r in frows if cell(r, of) == "CON"), None)
check("XLSX original CON", con_row is not None)
check("XLSX technical CON differs", con_row is not None and cell(con_row, tf) != "CON" and re.fullmatch(r"[A-Za-z0-9_-]+", str(cell(con_row, tf))) is not None)

package_rows = xlsx_sheet_rows(xlsx, 3)
package_map = {r[0]: r[1] for r in package_rows if len(r) >= 2 and str(r[1]).strip() != ""}
check("XLSX package id", package_map.get("Csomagazonosító") == package_id)
check("XLSX document count", int(float(package_map.get("Dokumentumok száma", "-1"))) == len(files))
check("XLSX skipped 0", int(float(package_map.get("Kihagyott tételek", "-1"))) == 0)

response, dashboard = api("GET", f"/api/projects/{project_id}/dashboard")
check("dashboard 200", response.status_code == 200 and dashboard.get("ok") is True)
audit = next((e for e in dashboard.get("recentAuditEvents", []) if e.get("eventType") == "DRIVE_DOWNLOAD_PACKAGE_CREATED" and (e.get("metadata") or {}).get("packageId") == package_id), None)
check("package audit", audit is not None)
meta = (audit or {}).get("metadata") or {}
check("audit counts", int(meta.get("fileCount", -1)) == len(files) and int(meta.get("skippedFileCount", -1)) == 0)
check("audit register", meta.get("registerFileName") == register_name)
audit_files = meta.get("files") or []
check("audit exact versions", len(audit_files) == len(files) and all(x.get("documentId") and x.get("versionId") and x.get("zipName") for x in audit_files))

print(json.dumps({
    "ok": True,
    "contract": "DIMPRO Drive V0.6.2 long/special Windows path runtime E2E",
    "pass": PASS,
    "projectId": project_id,
    "rootFolderId": root_folder["id"],
    "leafFolderId": leaf_folder["id"],
    "packageId": package_id,
    "zipBytes": len(download.content),
    "sourceZipEntries": [{"name": x, "length": len(x)} for x in source_entries],
    "originalPathLengths": [len(x["originalPath"]) for x in uploaded],
    "completedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
}, ensure_ascii=False, indent=2))
