# Developer Grid 0.1.102 – Central Core selection and recovery

The live Windows 0.1.101 test confirmed that startup creates no new tasks. Existing drafts remain untouched. Selecting Benjamin exposed a separate issue: pre-BOOT-ACK sessions are not necessarily in the backend's live engine-pair list, so the Central Core could hide resume while memory remained on the global Armin task.

The desktop now exposes exact session identities from allActiveSessions as RECOVERY_REQUIRED selection candidates. This is a display/recovery projection only; it never grants live launch authority, supplies acceptance or bypasses source proof. Resume must recover the exact task/session/worker through the existing backend, then validate the returned authoritative context before sending. Manual send re-fetches the exact live pair and also checks preservation of the original source instructions.

Memory, evidence, review, build actions and launch now resolve the same selected worker/task/session. Worker changes clear old cards and request the newly selected context. Late async responses from an earlier selection are discarded.

The 0.1.101 cell-start and full prompt verification guards remain. New application/package version: 0.1.102. This document is source evidence, not a claim that physical Windows BOOT ACK/handoff E2E has passed.
