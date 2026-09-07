#!/usr/bin/env python3
"""Offline checks for the protected telemetry agent. No real network calls."""
import importlib.util, os, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location("protected_telemetry_agent",Path(__file__).with_name("protected-telemetry-agent.py"))
agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(agent)
class AgentTests(unittest.TestCase):
    def test_existing_key_does_not_enroll_again(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"key";p.write_text("k"*48)
            with patch.object(agent.urllib.request,"urlopen",side_effect=AssertionError("network forbidden")):
                self.assertEqual(agent.ensure_key("prod-vps",str(p),agent.DEFAULT_ENROLL_ENDPOINT),"k"*48)
    def test_first_enrollment_requires_console(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(agent.os,"isatty",return_value=False),patch.object(agent.urllib.request,"urlopen",side_effect=AssertionError("network forbidden")):
                with self.assertRaises(SystemExit):agent.ensure_key("prod-vps",str(Path(d)/"key"),agent.DEFAULT_ENROLL_ENDPOINT)
    def test_existing_invalid_key_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"key";p.write_text("invalid")
            with self.assertRaises(SystemExit):agent.ensure_key("prod-vps",str(p),agent.DEFAULT_ENROLL_ENDPOINT)
            self.assertEqual(p.read_text(),"invalid")
    def test_disk_reserved_blocks_not_counted_as_used(self):
        class Stats:
            f_blocks=100;f_frsize=1024;f_bfree=40;f_bavail=30
        with patch.object(agent.os,"statvfs",return_value=Stats()):
            self.assertEqual(agent.disk(),(102400,61440,30720,66.7))
    def test_cpu_missing_delta_is_unknown(self):
        with patch.object(agent,"cpu_snapshot",return_value=(100,200)),patch.object(agent.time,"sleep"):
            self.assertIsNone(agent.cpu_percent())
    def test_endpoint_restriction_fails_before_enrollment(self):
        with patch.object(sys,"argv",["agent","--node-id","prod-vps","--endpoint","https://example.invalid/api"]),patch.object(agent,"ensure_key",side_effect=AssertionError("enrollment forbidden")):
            with self.assertRaises(SystemExit):agent.main()
if __name__=="__main__":unittest.main(verbosity=1)
