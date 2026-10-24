# Developer Grid 0.1.101 – cell isolation

The four restored ChatGPT cells must not replay historical user commands at application startup or when navigating to an old conversation. Auto-start now requires a new observed USER turn matching an actual send gesture in that same cell. New-chat first messages are supported by an in-document submission observer. Machine packets, assistant output, drafts and delayed history hydration do not authorize a new task.

Central Core launch/resume requires an explicit selected worker and exact task/session identity; an unrelated global active task is not a fallback. Ambiguous sessions and conversation drift fail closed. The button names its target worker.

Launch Packets preserve developmentContext.sourcePrompt, including read-only restrictions. Composer verification compares the full normalized prompt and rejects a different packet sharing only the protocol marker. Prepare failures retain their diagnostic reason.

Version 0.1.101 is a new package/application version. All delivery metadata must be generated from the exact clean source commit and its BUILD01 result. This document records source behavior; physical Windows chat launch/BOOT ACK/handoff is still pending until separately verified.

Dependencies: fast-uri 3.1.9, undici 7.30.1 and nested undici 6.29.1. Installed package versions are verified against the lockfile because npm's hidden lock previously reported refreshed versions while old package contents remained installed.

DEV only. PROD DENY. No active API deployment, no task/session retirement and no historical draft submission are part of this patch.
