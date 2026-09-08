import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).with_name("local-backup-retention-v1.py")
spec = importlib.util.spec_from_file_location("local_retention", MODULE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class RetentionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.items = [{"path": str(self.root / str(i)), "commit": str(i) * 40, "buildId": str(i), "time": i * 100000.0} for i in range(1, 5)]
        self.ancestry = patch.object(m, "ancestor", return_value=True)
        self.ancestry.start()
        self.addCleanup(self.ancestry.stop)
    def select(self, **kwargs):
        return m.select_entries(kwargs.get("entries", self.items), kwargs.get("keep", 2), kwargs.get("age", 1), kwargs.get("now", 500000), kwargs.get("commits", set()), kwargs.get("builds", set()), kwargs.get("paths", set()), "source")
    def test_newest_two_retained(self):
        self.assertEqual([x["buildId"] for x in self.select()], ["2", "1"])
    def test_no_newer_snapshot(self):
        self.assertEqual(self.select(entries=self.items[-1:]), [])
    def test_age_threshold(self):
        self.assertEqual(self.select(age=120), [])
    def test_age_time_cannot_be_bypassed(self):
        items = [dict(x) for x in self.items]
        items[0]["ageTime"] = 499999
        self.assertEqual([x["buildId"] for x in self.select(entries=items)], ["2"])
    def test_protected_commit(self):
        self.assertEqual([x["buildId"] for x in self.select(commits={self.items[0]["commit"]})], ["2"])
    def test_protected_build(self):
        self.assertEqual([x["buildId"] for x in self.select(builds={"2"})], ["1"])
    def test_active_path(self):
        self.assertEqual([x["buildId"] for x in self.select(paths={Path(self.items[0]["path"])})], ["2"])
    def test_divergent_history(self):
        with patch.object(m, "ancestor", return_value=False):
            self.assertEqual(self.select(), [])
    def test_invalid_commit(self):
        self.assertFalse(m.valid_release({"gitCommit": "bad", "gitBranch": "a", "buildId": "b"}, "a"))
    def test_legacy_branch_allowlist(self):
        v = {"gitCommit": "a" * 40, "gitBranch": "old", "buildId": "b"}
        self.assertTrue(m.valid_release(v, ["old", "new"]))
        self.assertFalse(m.valid_release(v, ["new"]))
    def test_symlink_root_denied(self):
        (self.root / "target").mkdir()
        (self.root / "link").symlink_to(self.root / "target", target_is_directory=True)
        self.assertFalse(m.tree_safe(self.root / "link", True))
    def test_runtime_symlink_safe_no_follow(self):
        (self.root / "target").mkdir()
        (self.root / "target" / "link").symlink_to(self.root)
        self.assertFalse(m.tree_safe(self.root / "target"))
        self.assertTrue(m.tree_safe(self.root / "target", True))
    def test_bad_archive_checksum(self):
        (self.root / "a.zip").write_bytes(b"test")
        self.assertFalse(m.verify_archive_file(self.root, {"file": "a.zip", "bytes": 4, "sha256": "0" * 64}))
    def test_archive_path_traversal(self):
        self.assertFalse(m.verify_archive_file(self.root, {"file": "../a.zip", "bytes": 4, "sha256": "0" * 64}))
    def test_missing_metadata_skipped(self):
        p = self.root / "empty"
        p.mkdir()
        self.assertIsNone(m.inspect_entry(p, {"kind": "runtime", "branch": "a", "source": str(self.root), "id": "test"}))

if __name__ == "__main__":
    unittest.main(verbosity=2)
