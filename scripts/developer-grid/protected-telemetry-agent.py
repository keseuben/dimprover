#!/usr/bin/env python3
"""BENJADMIN protected-node read-only telemetry agent; no command channel."""
import argparse, json, os, socket, time, urllib.request
from pathlib import Path
DEFAULT_ENDPOINT = "https://admin.dev.dimpro.hu/api/dev/grid/protected-telemetry"
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
    a=cpu_snapshot(); time.sleep(.25); b=cpu_snapshot(); idle=b[0]-a[0]; total=b[1]-a[1]; return round(max(0,min(100,(1-idle/total)*100)),1) if total>0 else 0.0
def disk():
    s=os.statvfs("/"); total=s.f_blocks*s.f_frsize; avail=s.f_bavail*s.f_frsize; used=max(0,total-avail); return total,used,avail,round(used/total*100,1) if total else 0.0
def main():
    p=argparse.ArgumentParser(); p.add_argument("--node-id",choices=["prod-vps","db-vps"],required=True); p.add_argument("--key-file",default="/etc/benjadmin/protected-telemetry.key"); p.add_argument("--endpoint",default=DEFAULT_ENDPOINT); a=p.parse_args(); key=Path(a.key_file).read_text().strip()
    if len(key)<32: raise SystemExit("protected telemetry key missing/invalid")
    mt,mu,ma,st,su=meminfo(); dt,du,da,dp=disk(); payload={"schemaVersion":1,"nodeId":a.node_id,"sampledAt":time.strftime("%Y-%m-%dT%H:%M:%SZ",time.gmtime()),"hostname":socket.gethostname(),"metrics":{"cpuPercent":cpu_percent(),"load1m":round(os.getloadavg()[0],2),"cores":os.cpu_count() or 1,"memoryTotalBytes":mt,"memoryUsedBytes":mu,"memoryAvailableBytes":ma,"memoryPercent":round(mu/mt*100,1) if mt else 0,"swapTotalBytes":st,"swapUsedBytes":su,"diskTotalBytes":dt,"diskUsedBytes":du,"diskAvailableBytes":da,"diskPercent":dp,"uptimeSeconds":round(float(Path("/proc/uptime").read_text().split()[0]))}}
    req=urllib.request.Request(a.endpoint,data=json.dumps(payload,separators=(",",":")).encode(),method="POST",headers={"content-type":"application/json","x-benjadmin-protected-telemetry-key":key,"user-agent":"BENJADMIN-Protected-Telemetry/1"})
    with urllib.request.urlopen(req,timeout=12) as r:
        result=json.loads(r.read().decode())
        if r.status!=202 or result.get("ok") is not True: raise SystemExit("telemetry rejected")
        print(f"PROTECTED_TELEMETRY_ACCEPTED node={a.node_id} sampledAt={result['accepted']['sampledAt']}")
if __name__=="__main__": main()
