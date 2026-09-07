#!/usr/bin/env python3
"""BENJADMIN read-only host metrics. No shell, database or command channel."""
import argparse, getpass, json, os, secrets, socket, time, urllib.error, urllib.request
from pathlib import Path
DEFAULT_ENDPOINT = "https://admin.dev.dimpro.hu/api/dev/grid/protected-telemetry"
DEFAULT_ENROLL_ENDPOINT = DEFAULT_ENDPOINT + "/enroll"
def meminfo():
    values={}
    for line in Path("/proc/meminfo").read_text().splitlines():
        if ":" not in line: continue
        k,v=line.split(":",1); parts=v.strip().split()
        if parts and parts[0].isdigit(): values[k]=int(parts[0])*1024
    total=values.get("MemTotal",0); avail=values.get("MemAvailable",values.get("MemFree",0)); used=max(0,total-avail); st=values.get("SwapTotal",0); sf=values.get("SwapFree",0)
    return total,used,avail,st,max(0,st-sf)
def cpu_snapshot():
    nums=[int(x) for x in Path("/proc/stat").read_text().splitlines()[0].split()[1:]]; idle=(nums[3] if len(nums)>3 else 0)+(nums[4] if len(nums)>4 else 0); return idle,sum(nums)
def cpu_percent():
    a=cpu_snapshot(); time.sleep(.25); b=cpu_snapshot(); idle=b[0]-a[0]; total=b[1]-a[1]; return round(max(0,min(100,(1-idle/total)*100)),1) if total>0 else None
def disk():
    s=os.statvfs("/"); total=s.f_blocks*s.f_frsize; free=s.f_bfree*s.f_frsize; avail=s.f_bavail*s.f_frsize; used=max(0,total-free); visible=used+avail
    return total,used,avail,round(used/visible*100,1) if visible else None
def enrollment_nonce_file(key_file): return Path(str(key_file)+".enroll-nonce")
def ensure_key(node_id,key_file,enroll_endpoint):
    key_path=Path(key_file)
    if key_path.exists():
        key=key_path.read_text().strip()
        if len(key)>=32: return key
        raise SystemExit("Existing telemetry key is invalid; refusing to overwrite it")
    if not os.isatty(0): raise SystemExit("First enrollment requires an interactive trusted console")
    code=getpass.getpass("Paste the one-time BENJADMIN enrollment code: ").strip()
    if not 40<=len(code)<=128: raise SystemExit("Invalid enrollment code")
    key_path.parent.mkdir(parents=True,exist_ok=True)
    nonce_path=enrollment_nonce_file(key_file)
    if nonce_path.exists(): nonce=nonce_path.read_text().strip()
    else:
        nonce=secrets.token_urlsafe(32)
        fd=os.open(nonce_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"w") as f: f.write(nonce+"\n")
    body=json.dumps({"nodeId":node_id,"nonce":nonce,"enrollmentCode":code},separators=(",",":")).encode()
    req=urllib.request.Request(enroll_endpoint,data=body,method="POST",headers={"content-type":"application/json","user-agent":"BENJADMIN-Protected-Telemetry/2"})
    try:
        with urllib.request.urlopen(req,timeout=12) as response:
            status=response.status; result=json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        raise SystemExit("Telemetry enrollment rejected HTTP={}; check the admin enrollment status".format(e.code))
    key=str(result.get("key") or "").strip()
    if status!=201 or result.get("ok") is not True or len(key)<32: raise SystemExit("Telemetry enrollment invalid response")
    fd=os.open(key_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,"w") as f: f.write(key+"\n")
    os.chmod(key_path,0o600)
    nonce_path.unlink(missing_ok=True)
    return key
def main():
    p=argparse.ArgumentParser(); p.add_argument("--node-id",choices=["prod-vps","db-vps"],required=True); p.add_argument("--key-file",default="/etc/benjadmin/protected-telemetry.key"); p.add_argument("--endpoint",default=DEFAULT_ENDPOINT); p.add_argument("--enroll-endpoint",default=DEFAULT_ENROLL_ENDPOINT); a=p.parse_args()
    for endpoint in (a.endpoint,a.enroll_endpoint):
        if endpoint not in (DEFAULT_ENDPOINT,DEFAULT_ENROLL_ENDPOINT): raise SystemExit("Only the pinned DEV HTTPS telemetry endpoint is allowed")
    key=ensure_key(a.node_id,a.key_file,a.enroll_endpoint)
    mt,mu,ma,st,su=meminfo(); dt,du,da,dp=disk(); payload={"schemaVersion":1,"nodeId":a.node_id,"sampledAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"hostname":socket.gethostname(),"metrics":{"cpuPercent":cpu_percent(),"load1m":round(os.getloadavg()[0],2),"cores":os.cpu_count() or 1,"memoryTotalBytes":mt,"memoryUsedBytes":mu,"memoryAvailableBytes":ma,"memoryPercent":round(mu/mt*100,1) if mt else None,"swapTotalBytes":st,"swapUsedBytes":su,"diskTotalBytes":dt,"diskUsedBytes":du,"diskAvailableBytes":da,"diskPercent":dp,"uptimeSeconds":round(float(Path("/proc/uptime").read_text().split()[0]))}}
    req=urllib.request.Request(a.endpoint,data=json.dumps(payload,separators=(",",":")).encode(),method="POST",headers={"content-type":"application/json","x-benjadmin-protected-telemetry-key":key,"user-agent":"BENJADMIN-Protected-Telemetry/2"})
    with urllib.request.urlopen(req,timeout=12) as response:
        result=json.loads(response.read().decode())
        if response.status!=202 or result.get("ok") is not True: raise SystemExit("Telemetry rejected")
        print("PROTECTED_TELEMETRY_ACCEPTED node={} sampledAt={}".format(a.node_id,result["accepted"]["sampledAt"]))
if __name__=="__main__": main()
