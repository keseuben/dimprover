"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  FolderKanban,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Mic,
  MicOff,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import DropPublicHexUploader, { DROP_QUICK_SEND_WORKFLOW_STEPS } from "./DropPublicHexUploader";
import DropUploadRulesDialog, { DropRulesButton } from "./DropUploadRulesDialog";
import { clearDropQueuePackage } from "./dropOfflineQueueStore";
import { requestDropMicrophonePermission } from "./dropVoicePermission";
import { DimproBrowserVoiceSession, dimproBrowserVoiceSupported } from "./dropBrowserVoiceSession";
import {
  formatDropSendCode,
  isCompleteDropSendCode,
  normalizeDropSendCode,
} from "@/app/lib/drop/public/dropSendCodeFormat";
import type { DropPublicRecipient, DropSendRecipientMode } from "@/app/lib/drop/public/dropPublicTypes";
import { DROP_UPLOAD_RULES_VERSION } from "@/app/lib/drop/dropUploadRules";

type Recipient = { id: string; name: string; email: string; company?: string; label?: string; projectRole?: string };
type Gate = {
  id: string;
  slug: string;
  type: "personal" | "project" | "organization";
  title: string;
  description: string;
  recipients: Recipient[];
  projectName?: string | null;
  targetFolder?: string | null;
  limits: { maxFileCount: number; maxFileSizeBytes: number; maxTotalSizeBytes: number };
  retentionDays: number;
  requireSenderEmail: boolean;
  allowPackageComment: boolean;
  allowFileComments: boolean;
  downloadProtection: "link" | "link_pin";
  expiresAt: string;
};
type WorkflowResult = {
  workflowType: "send" | "submission_gate";
  requireDownloadPin: boolean;
  recipientCount: number;
  allowFileComments: boolean;
  allowImageGroups?: boolean;
  uploaderName?: string;
  quickImageSend?: boolean;
  dimproSendEntitlementId?: string | null;
  notificationStatus?: string;
  allowQuickVoiceNote?: boolean;
  quickVoiceSecondsPerNote?: number;
};
type Created = {
  package: {
    id: string;
    publicCode: string;
    title: string;
    expiresAt: string;
    maxFileCount: number;
    maxFileSizeBytes: number;
    maxTotalSizeBytes: number;
    currentFileCount?: number;
    currentTotalSizeBytes?: number;
    status?: string;
    mode?: "image" | "file" | "zip" | "mixed";
  };
  uploadToken: string;
  workflow: WorkflowResult;
};
type ResumePayload = {
  package: Created["package"];
  uploadToken: string | null;
  resumable: boolean;
  delivered: boolean;
  workflow: WorkflowResult;
  security: { sessionCookieOnly: boolean; rawCredentialsPersisted: boolean; capabilityReissued: boolean };
};
type SendRecipient = { id: string; name: string; email: string; company: string };
type IdentityRecipient = {
  id: string;
  name: string;
  email: string;
  organizationName?: string | null;
  label?: string | null;
  locked?: boolean;
};
type SendUser = {
  id: string;
  publicCode: string;
  fullName: string;
  email: string;
  organizationName: string | null;
};
type SendEntitlement = {
  id: string;
  recipientMode: DropSendRecipientMode;
  canUseStandardSend: boolean;
  canUseQuickImageSend: boolean;
  canUseImageGroups: boolean;
  canUseFileComments: boolean;
  canUseProjectDrop: boolean;
  canUseQuickVoiceNote: boolean;
  maxQuickVoiceSecondsPerNote: number;
  maxRecipients: number;
  maxSavedContacts: number;
  uploadRulesAcceptanceCount: number;
  uploadRulesVersion: string | null;
  uploadRulesLastAcceptedAt: string | null;
  maxPackageSizeBytes: number;
  monthlySendLimit: number | null;
  currentMonthSendCount: number;
};
type SendProject = { id: string; publicCode: string; name: string; canUploadToDrop?: boolean };
type ProjectVerification = {
  project: SendProject;
  destination: {
    type: "project_drop_inbox";
    label: string;
    driveFolderId: string | null;
    preserveGroups: boolean;
    requireVirusScan: boolean;
    notifyProjectAdmins: boolean;
  };
};
type IdentityVerifyPayload = {
  ok?: boolean;
  error?: string;
  user?: SendUser;
  entitlement?: SendEntitlement;
  defaultRecipient?: IdentityRecipient | null;
  approvedRecipients?: IdentityRecipient[];
  projects?: SendProject[];
  sendSession?: { token: string; expiresAt: string; entitlementId: string };
};
type DropSessionPayload = {
  error?: string;
  session?: { maxRecipients: number; defaultRetentionDays: number; identityCore?: boolean };
};
type Props = { mode: "send" | "submission_gate"; slug?: string };

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100";

function MessageVoiceDictation({ enabled, maxSeconds, onTranscript }: { enabled: boolean; maxSeconds: number; onTranscript: (text: string) => void }) {
  const sessionRef = useRef<DimproBrowserVoiceSession | null>(null);
  const timerRef = useRef<number | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.max(10, Math.min(60, maxSeconds)));
  const [preview, setPreview] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "recording" | "processing" | "ready" | "error" | "cancelled"; text: string }>({ kind: "idle", text: "" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupported(dimproBrowserVoiceSupported());
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      sessionRef.current?.abort();
      sessionRef.current = null;
    };
  }, []);

  function cleanup() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    sessionRef.current = null;
    setActive(false);
    setProcessing(false);
    setSecondsLeft(Math.max(10, Math.min(60, maxSeconds)));
    setPreview("");
  }

  function finish(text: string, commit: boolean) {
    cleanup();
    if (!commit) {
      setStatus({ kind: "cancelled", text: "A diktálás megszakítva; az üzenet nem változott." });
      return;
    }
    if (!text) {
      setStatus({ kind: "error", text: "A diktálás lezárult, de nem érkezett felismerhető szöveg. Próbálja újra." });
      return;
    }
    onTranscript(text);
    setStatus({ kind: "ready", text: "Átirat elkészült és bekerült az üzenetbe. Küldés előtt szerkeszthető." });
  }

  function stop(commit = true) {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (commit) {
      setProcessing(true);
      setStatus({ kind: "processing", text: "Diktálás lezárása · az átirat véglegesítése folyamatban…" });
    }
    const session = sessionRef.current;
    if (!session) {
      finish("", commit);
      return;
    }
    session.stop(commit);
  }

  async function start() {
    if (!enabled || processing || active || typeof window === "undefined") return;
    if (!dimproBrowserVoiceSupported()) {
      setSupported(false);
      setStatus({ kind: "error", text: "Ezen a böngészőn nincs támogatott közvetlen beszédfelismerés. Használja a telefon billentyűzetének mikrofonját." });
      return;
    }
    setProcessing(true);
    setStatus({ kind: "processing", text: "Mikrofonengedély ellenőrzése…" });
    try {
      await requestDropMicrophonePermission();
    } catch (error) {
      setProcessing(false);
      setActive(false);
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "A mikrofonengedély ellenőrzése sikertelen." });
      return;
    }

    const maximum = Math.max(10, Math.min(60, maxSeconds));
    const session = new DimproBrowserVoiceSession({
      language: "hu-HU",
      onTranscript: (text) => setPreview(text),
      onState: (state, detail) => {
        if (state === "error") setStatus({ kind: "error", text: detail });
        else setStatus({ kind: "recording", text: detail });
      },
      onEnd: ({ text, commit }) => finish(text, commit),
    });
    sessionRef.current = session;
    setActive(true);
    setProcessing(false);
    setSecondsLeft(maximum);
    setPreview("");
    setSupported(true);
    setStatus({ kind: "recording", text: "Hallgatom… Ha a mobil böngésző megszakítja a felismerést, a DIMPRO automatikusan folytatja." });
    try {
      session.start();
    } catch (error) {
      sessionRef.current = null;
      setActive(false);
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "A beszédfelismerés nem indítható el." });
      return;
    }

    timerRef.current = window.setInterval(() => {
      setSecondsLeft((current) => {
        const next = Math.max(0, current - 1);
        if (next === 0) window.setTimeout(() => stop(true), 0);
        return next;
      });
    }, 1000);
  }

  if (!enabled) return null;
  const statusClass = status.kind === "error" ? "border-rose-300 bg-rose-50 text-rose-900" : status.kind === "ready" ? "border-emerald-300 bg-emerald-50 text-emerald-900" : status.kind === "processing" ? "border-amber-300 bg-amber-50 text-amber-900" : status.kind === "cancelled" ? "border-slate-300 bg-slate-50 text-slate-700" : "border-cyan-200 bg-cyan-50 text-cyan-900";
  return <div className="mt-2">
    <button type="button" onClick={() => active ? stop(true) : void start()} disabled={processing || supported === false} className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-black ${active ? "border-rose-300 bg-rose-50 text-rose-800" : "border-cyan-200 bg-cyan-50 text-cyan-800"} disabled:opacity-50`}>{active ? <MicOff size={15}/> : <Mic size={15}/>} {active ? `Leállítás · 00:${String(secondsLeft).padStart(2, "0")}` : processing ? "Átirat készül…" : "Üzenet diktálása"}</button>
    {(active || status.text) ? <div className={`mt-2 rounded-lg border px-3 py-2 text-xs font-semibold ${statusClass}`}>{active ? <strong className="block">DIMPRO diktálás · hátralévő idő: 00:{String(secondsLeft).padStart(2, "0")}</strong> : null}{preview ? <span className="mt-1 block">Élő átirat: {preview}</span> : null}{status.text ? <span className="mt-1 block">{status.text}</span> : null}</div> : null}
  </div>;
}

const textareaClass = `${inputClass} min-h-28 resize-y`;
const newRecipient = (): SendRecipient => ({ id: `recipient_${Date.now()}_${Math.random().toString(16).slice(2)}`, name: "", email: "", company: "" });
const DROP_SEND_CODE_STORAGE_KEY = "dimpro.drop.sendCode.v1";


function mapIdentityRecipient(item: IdentityRecipient): DropPublicRecipient {
  return {
    id: item.id,
    name: item.name,
    email: item.email,
    company: item.organizationName || undefined,
    label: item.label || undefined,
  };
}
function formatProjectCodeInput(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^PRJ/, "").slice(0, 8);
  const year = compact.slice(0, 2);
  const first = compact.slice(2, 5);
  const second = compact.slice(5, 8);
  return ["PRJ", year, first, second].filter((part, index) => index === 0 || part.length > 0).join("-");
}
function completeProjectCode(value: string) {
  return /^PRJ-[0-9]{2}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{3}$/.test(value);
}
function formatMb(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

export default function DropPublicTransferClient({ mode, slug }: Props) {
  const sessionStarted = useRef(false);
  const sendCodeCheckingRef = useRef(false);
  const autoSavedCodeAttemptedRef = useRef(false);
  const projectCheckingRef = useRef("");
  const [sendCode, setSendCode] = useState("");
  const [rememberSendCode, setRememberSendCode] = useState(true);
  const [savedSendCodePresent, setSavedSendCodePresent] = useState(false);
  const [identitySessionToken, setIdentitySessionToken] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [loading, setLoading] = useState(mode === "submission_gate");
  const [gate, setGate] = useState<Gate | null>(null);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [maxRecipients, setMaxRecipients] = useState(10);
  const [defaultRetention, setDefaultRetention] = useState(5);
  const [sendMode, setSendMode] = useState<"standard" | "quick_image">("standard");
  const [sendUser, setSendUser] = useState<SendUser | null>(null);
  const [entitlement, setEntitlement] = useState<SendEntitlement | null>(null);
  const [defaultRecipient, setDefaultRecipient] = useState<DropPublicRecipient | null>(null);
  const [approvedRecipients, setApprovedRecipients] = useState<DropPublicRecipient[]>([]);
  const [selectedApprovedIds, setSelectedApprovedIds] = useState<string[]>([]);
  const [projects, setProjects] = useState<SendProject[]>([]);
  const [projectCode, setProjectCode] = useState("");
  const [verifiedProject, setVerifiedProject] = useState<ProjectVerification | null>(null);
  const [projectChecking, setProjectChecking] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [senderMessage, setSenderMessage] = useState("");
  const [packageNote, setPackageNote] = useState("");
  const [showRecipientsOnDownload, setShowRecipientsOnDownload] = useState(true);
  const [retentionDays, setRetentionDays] = useState(5);
  const [downloadProtection, setDownloadProtection] = useState<"link" | "link_pin">("link_pin");
  const [recipients, setRecipients] = useState<SendRecipient[]>([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [rulesDialogOpen, setRulesDialogOpen] = useState(false);
  const [rulesAcceptanceRequired, setRulesAcceptanceRequired] = useState(mode !== "send");
  const [created, setCreated] = useState<Created | null>(null);
  const [creating, setCreating] = useState(false);
  const [resumeChecked, setResumeChecked] = useState(false);
  const [resumeMessage, setResumeMessage] = useState("");
  const [deliveredResume, setDeliveredResume] = useState<ResumePayload | null>(null);

  useEffect(() => {
    if (mode !== "send" || autoSavedCodeAttemptedRef.current || typeof window === "undefined") return;
    autoSavedCodeAttemptedRef.current = true;
    const saved = normalizeDropSendCode(window.localStorage.getItem(DROP_SEND_CODE_STORAGE_KEY) || "");
    if (!isCompleteDropSendCode(saved)) {
      window.localStorage.removeItem(DROP_SEND_CODE_STORAGE_KEY);
      setSavedSendCodePresent(false);
      return;
    }
    setSendCode(saved);
    setSavedSendCodePresent(true);
    window.setTimeout(() => void startSendSession(saved), 120);
  // startSendSession szándékosan stabil felhasználói műveletként van használva; az első mounton egyszer fut.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode === "send") {
      // Send esetén csak a központi Send-kód sikeres azonosítása után szabad
      // publikus csomagot visszaállítani, különben egy régi csomag és egy új
      // session-cookie szétcsúszhat.
      setResumeChecked(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const resumeQuery = new URLSearchParams({ workflowType: mode });
        if (slug) resumeQuery.set("gateSlug", slug);
        const response = await fetch(`/api/drop/public/packages/resume?${resumeQuery.toString()}`, { cache: "no-store", credentials: "same-origin" });
        const payload = await response.json().catch(() => null) as { resume?: ResumePayload | null; error?: string } | null;
        if (cancelled) return;
        if (response.ok && payload?.resume) {
          const resume = payload.resume;
          if (resume.delivered) {
            await clearDropQueuePackage(resume.package.id).catch(() => undefined);
            setDeliveredResume(resume);
            setResumeMessage("A korábbi küldemény kézbesítése már befejeződött.");
          } else if (resume.resumable && resume.uploadToken) {
            setCreated({ package: resume.package, uploadToken: resume.uploadToken, workflow: resume.workflow });
            setResumeMessage("A korábbi feltöltési munkamenet és a helyi fájlsor helyreállítása folyamatban van.");
          }
        }
      } catch {
        // Új munkamenet indítható.
      } finally {
        if (!cancelled) setResumeChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, slug]);

  useEffect(() => {
    if (!resumeChecked || created || deliveredResume || mode !== "submission_gate" || !slug || sessionStarted.current) return;
    sessionStarted.current = true;
    void (async () => {
      setLoading(true); setMessage("");
      try {
        const info = await fetch(`/api/drop/public/gates/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const infoPayload = await info.json() as { gate?: Gate; error?: string };
        if (!info.ok || !infoPayload.gate) throw new Error(infoPayload.error || "A Beküldőkapu nem tölthető be.");
        const response = await fetch(`/api/drop/public/gates/${encodeURIComponent(slug)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ website }) });
        const payload = await response.json() as { gate?: Gate; error?: string };
        if (!response.ok || !payload.gate) throw new Error(payload.error || "A Beküldőkapu munkamenete nem indítható.");
        const value = payload.gate;
        setGate(value); setSubject(value.title); setRetentionDays(value.retentionDays); setDownloadProtection(value.downloadProtection);
        setSelectedRecipientIds(value.type === "organization" ? [] : value.recipients.map((item) => item.id));
        setSessionReady(true);
      } catch (error) { setMessage(error instanceof Error ? error.message : "A Beküldőkapu nem érhető el."); }
      finally { setLoading(false); }
    })();
  }, [created, deliveredResume, mode, resumeChecked, slug, website]);

  async function startSendSession(code = sendCode, forceNew = false) {
    const normalized = normalizeDropSendCode(code);
    if (!isCompleteDropSendCode(normalized) || loading || sendCodeCheckingRef.current) return;
    sendCodeCheckingRef.current = true; setLoading(true); setMessage("");
    try {
      const identityResponse = await fetch("/api/dimpro-identity/send/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: normalized, website }),
      });
      const identityPayload = await identityResponse.json() as IdentityVerifyPayload;
      if (!identityResponse.ok || !identityPayload.ok || !identityPayload.user || !identityPayload.entitlement || !identityPayload.sendSession?.token) {
        throw new Error(identityPayload.error || "A központi DIMPRO Send-jogosultság ellenőrzése sikertelen.");
      }

      const token = identityPayload.sendSession.token;
      const projectResponse = await fetch("/api/dimpro-identity/send/projects", {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const projectPayload = await projectResponse.json() as { projects?: SendProject[]; error?: string };
      if (!projectResponse.ok) throw new Error(projectPayload.error || "Az engedélyezett projektlista nem tölthető be.");

      // Először megpróbáljuk ugyanennek az entitlementnek a korábbi, cookie-hoz
      // kötött csomagját helyreállítani. Csak egyező entitlement és ténylegesen
      // folytatható / már kézbesített csomag fogadható el.
      let matchingResume: ResumePayload | null = null;
      try {
        if (forceNew) throw new Error("force-new-session");
        const resumeResponse = await fetch("/api/drop/public/packages/resume?workflowType=send", { cache: "no-store", credentials: "same-origin" });
        const resumePayload = await resumeResponse.json().catch(() => null) as { resume?: ResumePayload | null } | null;
        const candidate = resumeResponse.ok ? resumePayload?.resume || null : null;
        if (candidate?.workflow.dimproSendEntitlementId === identityPayload.entitlement.id && (candidate.delivered || (candidate.resumable && candidate.uploadToken))) {
          matchingResume = candidate;
        }
      } catch {
        matchingResume = null;
      }

      let bridgePayload: DropSessionPayload | null = null;
      if (!matchingResume) {
        const bridgeResponse = await fetch("/api/drop/public/send/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sendSessionToken: token, website }),
        });
        bridgePayload = await bridgeResponse.json() as DropSessionPayload;
        if (!bridgeResponse.ok || !bridgePayload.session) {
          throw new Error(bridgePayload.error || "A Drop Send munkamenet nem indítható.");
        }
      }

      const mappedRecipients = (identityPayload.approvedRecipients || []).map(mapIdentityRecipient);
      const mappedDefault = identityPayload.defaultRecipient ? mapIdentityRecipient(identityPayload.defaultRecipient) : null;
      setIdentitySessionToken(token);
      const sessionMaxRecipients = bridgePayload?.session?.maxRecipients ?? identityPayload.entitlement.maxRecipients;
      const sessionRetentionDays = bridgePayload?.session?.defaultRetentionDays ?? 5;
      setMaxRecipients(sessionMaxRecipients);
      setDefaultRetention(sessionRetentionDays);
      setRetentionDays(sessionRetentionDays);
      setSendUser(identityPayload.user);
      setEntitlement(identityPayload.entitlement);
      const rulesRequired = identityPayload.entitlement.uploadRulesVersion !== DROP_UPLOAD_RULES_VERSION || identityPayload.entitlement.uploadRulesAcceptanceCount < 3;
      setRulesAcceptanceRequired(rulesRequired);
      setRulesAccepted(!rulesRequired);
      setDefaultRecipient(mappedDefault);
      setApprovedRecipients(mappedRecipients);
      setSelectedApprovedIds([]);
      setSenderName(identityPayload.user.fullName);
      setSenderEmail(identityPayload.user.email);
      setProjects(projectPayload.projects || identityPayload.projects || []);
      setProjectCode("");
      setVerifiedProject(null);
      if (rememberSendCode && typeof window !== "undefined") {
        window.localStorage.setItem(DROP_SEND_CODE_STORAGE_KEY, normalized);
        setSavedSendCodePresent(true);
      } else if (typeof window !== "undefined") {
        window.localStorage.removeItem(DROP_SEND_CODE_STORAGE_KEY);
        setSavedSendCodePresent(false);
      }
      if (!identityPayload.entitlement.canUseStandardSend && identityPayload.entitlement.canUseQuickImageSend) setSendMode("quick_image");
      setCreated(null);
      setDeliveredResume(null);
      setResumeMessage("");
      if (matchingResume) {
        if (matchingResume.delivered) {
          await clearDropQueuePackage(matchingResume.package.id).catch(() => undefined);
          setDeliveredResume(matchingResume);
          setResumeMessage("A korábbi, ehhez a Send-jogosultsághoz tartozó küldemény már kézbesítve lett.");
        } else if (matchingResume.uploadToken) {
          setCreated({ package: matchingResume.package, uploadToken: matchingResume.uploadToken, workflow: matchingResume.workflow });
          setResumeMessage("A korábbi, ehhez a Send-jogosultsághoz tartozó feltöltési munkamenet helyreállítva.");
        }
      }
      setSessionReady(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A küldési jogosultság ellenőrzése sikertelen.");
    } finally {
      sendCodeCheckingRef.current = false; setLoading(false);
    }
  }

  async function verifyProject(code: string) {
    const formatted = formatProjectCodeInput(code);
    setProjectCode(formatted);
    setVerifiedProject(null);
    if (!formatted || !identitySessionToken || !completeProjectCode(formatted)) return;
    if (projectCheckingRef.current === formatted) return;
    projectCheckingRef.current = formatted;
    setProjectChecking(true);
    setMessage("");
    try {
      const response = await fetch("/api/dimpro-identity/projects/verify-code", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${identitySessionToken}`,
        },
        body: JSON.stringify({ projectCode: formatted }),
      });
      const payload = await response.json() as ({ ok?: boolean; error?: string } & Partial<ProjectVerification>);
      if (!response.ok || !payload.ok || !payload.project || !payload.destination) {
        throw new Error(payload.error || "A projektkód nem használható.");
      }
      setVerifiedProject({ project: payload.project, destination: payload.destination });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A projektkód nem használható.");
    } finally {
      projectCheckingRef.current = "";
      setProjectChecking(false);
    }
  }

  function changeSendCode(value: string) {
    const normalized = normalizeDropSendCode(value);
    setSendCode(normalized);
    if (isCompleteDropSendCode(normalized)) window.setTimeout(() => void startSendSession(normalized), 0);
  }
  function clearRememberedSendCode() {
    if (typeof window !== "undefined") window.localStorage.removeItem(DROP_SEND_CODE_STORAGE_KEY);
    setSavedSendCodePresent(false);
    if (!sessionReady) setSendCode("");
  }
  function changeRememberSendCode(checked: boolean) {
    setRememberSendCode(checked);
    if (!checked) clearRememberedSendCode();
  }
  function addRecipient() { if (recipients.length < maxRecipients) setRecipients((items) => [...items, newRecipient()]); }
  function updateRecipient(id: string, patch: Partial<SendRecipient>) { setRecipients((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item)); }
  function toggleGateRecipient(id: string) { setSelectedRecipientIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); }
  function toggleApprovedRecipient(id: string) { setSelectedApprovedIds((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]); }
  const emailReady = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const effectiveRecipientMode = entitlement?.recipientMode || "free_entry";
  const normalRecipients = useMemo(() => {
    if (mode !== "send") return [];
    if (effectiveRecipientMode === "locked_default") return defaultRecipient ? [defaultRecipient] : [];
    if (effectiveRecipientMode === "approved_list") return approvedRecipients.filter((item) => selectedApprovedIds.includes(item.id));
    return recipients.filter((item) => item.name.trim() && emailReady(item.email));
  }, [approvedRecipients, defaultRecipient, effectiveRecipientMode, mode, recipients, selectedApprovedIds]);
  const destinationReady = mode === "send" ? normalRecipients.length > 0 : Boolean(gate && (gate.type !== "organization" || selectedRecipientIds.length));
  const identityReady = Boolean(sendUser) || (senderName.trim().length >= 2 && emailReady(senderEmail));
  const projectReady = !projectCode || Boolean(verifiedProject?.project.publicCode === projectCode);
  const rulesReady = !rulesAcceptanceRequired || rulesAccepted;
  const standardFormReady = identityReady && subject.trim().length >= 2 && destinationReady && rulesReady && projectReady;
  const quickRecipients = useMemo(() => {
    if (mode !== "send" || !sendUser || !emailReady(sendUser.email)) return [] as DropPublicRecipient[];
    const selfRecipient: DropPublicRecipient = {
      id: `identity-self-${sendUser.id}`,
      name: sendUser.fullName,
      email: sendUser.email.toLowerCase(),
    };
    let extras: DropPublicRecipient[] = [];
    if (effectiveRecipientMode === "approved_list") {
      extras = approvedRecipients.filter((item) => selectedApprovedIds.includes(item.id));
    } else {
      extras = recipients
        .filter((item) => item.name.trim() && emailReady(item.email))
        .map((item) => ({ id: item.id, name: item.name.trim(), email: item.email.trim().toLowerCase(), company: item.company.trim() || undefined }));
      if (effectiveRecipientMode === "locked_default" && defaultRecipient) extras.unshift(defaultRecipient);
    }
    return [selfRecipient, ...extras]
      .filter((item, index, all) => all.findIndex((candidate) => candidate.email.toLowerCase() === item.email.toLowerCase()) === index)
      .slice(0, maxRecipients);
  }, [approvedRecipients, defaultRecipient, effectiveRecipientMode, maxRecipients, mode, recipients, selectedApprovedIds, sendUser]);
  const quickDestinationReady = Boolean(sendUser && emailReady(sendUser.email));
  const formReady = mode === "send" && sendMode === "quick_image"
    ? identityReady && quickDestinationReady && rulesReady && projectReady
    : standardFormReady;

  function resetForNewTransfer() {
    setCreated(null);
    setDeliveredResume(null);
    const required = mode !== "send" || !entitlement || entitlement.uploadRulesVersion !== DROP_UPLOAD_RULES_VERSION || entitlement.uploadRulesAcceptanceCount < 3;
    setRulesAcceptanceRequired(required);
    setRulesAccepted(!required);
    setSenderMessage("");
    setPackageNote("");
    setSubject("");
    setRecipients([]);
    setSelectedApprovedIds([]);
    setProjectCode("");
    setVerifiedProject(null);
    setMessage("");
    if (mode === "send") window.setTimeout(() => void startSendSession(sendCode, true), 0);
  }

  function closeTransfer() {
    if (typeof window === "undefined") return;
    if (window.opener) window.close();
    else window.location.assign("/");
  }

  async function createPackage() {
    if (!formReady || creating) return;
    setCreating(true); setMessage("");
    try {
      const projectValue = mode === "send" ? verifiedProject?.project.publicCode || undefined : undefined;
      const body = mode === "send" && sendMode === "quick_image"
        ? {
            workflowType: mode,
            quickImageSend: true,
            quickRecipientEmail: quickRecipients[0]?.email || "",
            recipients: quickRecipients,
            senderName,
            senderEmail,
            senderMessage,
            showRecipientsOnDownload,
            retentionDays,
            downloadProtection: "link",
            projectCode: projectValue,
            rulesAccepted: rulesReady,
            rulesVersion: DROP_UPLOAD_RULES_VERSION,
          }
        : {
            workflowType: mode,
            senderName,
            senderEmail,
            subject,
            senderMessage,
            packageNote,
            showRecipientsOnDownload,
            retentionDays,
            downloadProtection,
            recipients: mode === "send" ? normalRecipients : undefined,
            selectedRecipientIds: mode === "submission_gate" ? selectedRecipientIds : undefined,
            projectCode: projectValue,
            rulesAccepted: rulesReady,
            rulesVersion: DROP_UPLOAD_RULES_VERSION,
          };
      const response = await fetch("/api/drop/public/packages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { created?: Created; error?: string };
      if (!response.ok || !payload.created) throw new Error(payload.error || "A küldemény nem hozható létre.");
      setCreated(payload.created); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "A küldemény létrehozása sikertelen."); }
    finally { setCreating(false); }
  }

  if (!resumeChecked) return <LoadingShell mode={mode} text="Korábbi mobil feltöltési munkamenet ellenőrzése…"/>;
  if (deliveredResume) return <main className="min-h-screen bg-[#f4f9fa] px-4 py-8 sm:px-6"><div className="mx-auto max-w-5xl"><Header mode={mode}/><div className="mt-8 rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-6 text-emerald-950"><CheckCircle2 size={24}/><h2 className="mt-3 text-xl font-black">A küldemény már kézbesítve</h2><p className="mt-2 text-sm font-semibold">{deliveredResume.package.title} · {deliveredResume.package.publicCode}</p><p className="mt-2 text-sm">A küldés befejeződött. Válassza ki a következő műveletet.</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={resetForNewTransfer} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Új képfeltöltés / Send</button><button type="button" onClick={closeTransfer} className="rounded-xl border border-emerald-300 bg-white px-5 py-3 text-sm font-black text-emerald-900">Bezárás / kezdőlap</button></div></div></div></main>;
  if (created) return <main className="min-h-screen bg-[#f4f9fa] px-4 py-8 sm:px-6"><div className="mx-auto max-w-6xl"><Header mode={mode}/><div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-950"><CheckCircle2 size={18} className="mr-2 inline"/>{resumeMessage || "A küldemény előkészítve"} · {created.package.publicCode} · legfeljebb {formatMb(created.package.maxTotalSizeBytes)}</div><DropPublicHexUploader packageInfo={created.package} uploadToken={created.uploadToken} allowFileComments={created.workflow.allowFileComments} allowImageGroups={created.workflow.allowImageGroups} allowQuickVoiceNote={Boolean(created.workflow.allowQuickVoiceNote)} quickVoiceSecondsPerNote={created.workflow.quickVoiceSecondsPerNote || 60} uploaderName={created.workflow.uploaderName} imageOnly={Boolean(created.workflow.quickImageSend)} defaultImageSizePreset={created.workflow.quickImageSend ? "small" : "medium"} remindGalleryCleanup={Boolean(created.workflow.quickImageSend)} initialWorkflowStep={created.workflow.quickImageSend ? 1 : 0} onStartNewTransfer={resetForNewTransfer} onClose={closeTransfer}/></div></main>;

  return <main className="min-h-screen overflow-x-hidden bg-[#f4f9fa] px-4 py-8 sm:px-6"><div className="mx-auto max-w-5xl"><Header mode={mode}/>
    <div className="pointer-events-none absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true"><label>Weboldal<input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1}/></label></div>

    {mode === "send" && !sessionReady ? <section className="mx-auto mt-8 max-w-xl rounded-[1.75rem] border border-cyan-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex items-start gap-3"><KeyRound className="mt-1 text-cyan-800"/><div><p className="text-xs font-black uppercase tracking-[.18em] text-cyan-700">Központi küldési jogosultság</p><h2 className="mt-2 text-2xl font-black text-slate-950">DIMPRO Send-kód</h2><p className="mt-2 text-sm leading-6 text-slate-600">A kódot a központi DIMPRO felhasználói, licenc- és jogosultsági rendszer ellenőrzi. A kötőjelek automatikusan megjelennek, az ellenőrzés az utolsó karakter után indul.</p></div></div>
      <label className="mt-6 block"><span className="mb-2 block text-xs font-black uppercase tracking-[.1em] text-slate-600">Küldési jogosultságkód</span><input value={formatDropSendCode(sendCode)} onChange={(event) => changeSendCode(event.target.value)} disabled={loading} autoFocus autoComplete="one-time-code" spellCheck={false} className={`${inputClass} h-16 text-center font-mono text-xl uppercase tracking-[.16em]`} placeholder="ABCD-123-456"/></label>
      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><label className="flex cursor-pointer items-start gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={rememberSendCode} onChange={(event) => changeRememberSendCode(event.target.checked)} className="mt-0.5 accent-cyan-700"/><span><strong className="block text-slate-900">Kód megjegyzése ezen az eszközön</strong><span className="mt-0.5 block font-medium leading-5 text-slate-500">A kód csak ennek a böngészőnek a helyi tárhelyén marad meg, és legközelebb automatikusan betöltődik.</span></span></label>{savedSendCodePresent ? <SwipeDeleteSendCodeControl onConfirm={clearRememberedSendCode} compact/> : null}</div>
      <button type="button" onClick={() => void startSendSession()} disabled={loading || !isCompleteDropSendCode(sendCode)} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">{loading ? <LoaderCircle size={17} className="animate-spin"/> : <KeyRound size={17}/>} {loading ? "Jogosultság ellenőrzése…" : "Belépés"}</button>
      <p className="mt-4 text-xs font-semibold leading-5 text-slate-500">Küldési jogosultság igénylése vagy technikai segítség: <strong>admin@dimpro.hu</strong></p>
      {message ? <Message text={message}/> : null}
    </section> : null}

    {mode === "submission_gate" && loading ? <div className="mt-10 flex items-center justify-center gap-3 text-sm font-bold text-slate-700"><LoaderCircle className="animate-spin"/>Beküldőkapu betöltése…</div> : null}

    {sessionReady ? <section className="mt-8 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      {sendUser ? <section className="mb-6 rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-cyan-300"><UserRound size={20}/></span><div><p className="text-[10px] font-black uppercase tracking-[.14em] text-cyan-800">Központilag azonosított küldő</p><h2 className="mt-1 text-lg font-black text-slate-950">{sendUser.fullName}</h2><p className="mt-1 text-sm font-semibold text-slate-700">{sendUser.email}</p>{sendUser.organizationName ? <p className="mt-1 text-xs text-slate-600">{sendUser.organizationName}</p> : null}</div><span className="ml-auto rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[9px] font-black uppercase text-emerald-800">Identity Core</span></div><p className="mt-3 text-xs leading-5 text-slate-600">A feladói név és e-mail-cím a központi felhasználói rekordból érkezik, ezen a felületen nem módosítható. DIMPRO azonosító: <strong>{sendUser.publicCode}</strong></p>{savedSendCodePresent ? <div className="mt-3"><SwipeDeleteSendCodeControl onConfirm={clearRememberedSendCode}/></div> : null}</section> : null}

      {gate ? <div className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 p-4"><p className="text-xs font-black uppercase tracking-[.16em] text-teal-800">{gate.type === "personal" ? "Személyes Beküldőkapu" : gate.type === "project" ? "Projekt Beküldőkapu" : "Szervezeti Beküldőkapu"}</p><h2 className="mt-2 text-xl font-black text-slate-950">{gate.title}</h2>{gate.description ? <p className="mt-2 text-sm leading-6 text-slate-700">{gate.description}</p> : null}<div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-700">{gate.projectName ? <span className="rounded-full bg-white px-3 py-1.5">Projekt: {gate.projectName}</span> : null}{gate.targetFolder ? <span className="rounded-full bg-white px-3 py-1.5">Célmappa: {gate.targetFolder}</span> : null}<span className="rounded-full bg-white px-3 py-1.5">Keret: 250 MB</span></div></div> : null}

      {mode === "send" ? <div className="mb-6 grid gap-3 md:grid-cols-2">
        <button type="button" onClick={() => entitlement?.canUseStandardSend !== false && setSendMode("standard")} disabled={entitlement?.canUseStandardSend === false} className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${sendMode === "standard" ? "border-cyan-500 bg-cyan-50 shadow-sm" : "border-slate-200 bg-slate-50"}`}><span className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-cyan-300"><Send size={20}/></span><span><strong className="block text-sm text-slate-950">Normál DIMPRO Send</strong><span className="mt-1 block text-xs leading-5 text-slate-600">Fájlok, dokumentumok és képek továbbítása üzenettel és opcionális letöltési PIN-nel.</span></span></span></button>
        <button type="button" onClick={() => entitlement?.canUseQuickImageSend !== false && setSendMode("quick_image")} disabled={entitlement?.canUseQuickImageSend === false} className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${sendMode === "quick_image" ? "border-teal-500 bg-teal-50 shadow-sm" : "border-slate-200 bg-slate-50"}`}><span className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-700 text-white"><Camera size={20}/></span><span><span className="flex flex-wrap items-center gap-2"><strong className="text-sm text-slate-950">Gyors KépSend</strong><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-800">Mobilra ajánlott</span></span><span className="mt-1 block text-xs leading-5 text-slate-600">Helyszíni képek méretcsökkentéssel, logikai képcsoportokkal és képenkénti megjegyzésekkel.</span></span></span></button>
      </div> : null}

      {mode === "send" && sendMode === "quick_image" ? <nav data-drop-quick-send-precreate-stepper className="sticky top-2 z-[70] mb-6 rounded-2xl border border-cyan-200 bg-white/95 p-2 shadow-lg backdrop-blur" aria-label="GyorsSend lépések">
        <div className="grid grid-cols-6 gap-1">
          {DROP_QUICK_SEND_WORKFLOW_STEPS.map((label, index) => <button key={label} type="button" disabled={index > 0} aria-label={`${index + 1}. lépés: ${label}`} aria-current={index === 0 ? "step" : undefined} className={`grid min-h-11 place-items-center rounded-xl px-1 py-2 text-xs font-black sm:flex sm:gap-2 sm:px-3 ${index === 0 ? "bg-cyan-800 text-white shadow" : "bg-slate-50 text-slate-500"}`}><span className={`grid h-7 w-7 place-items-center rounded-full text-[10px] ${index === 0 ? "bg-white text-cyan-900" : "bg-slate-200 text-slate-600"}`}>{index + 1}</span><span className="hidden sm:inline">{label}</span></button>)}
        </div>
        <p className="mt-1.5 text-center text-[11px] font-black text-slate-600 sm:hidden">1/{DROP_QUICK_SEND_WORKFLOW_STEPS.length} · {DROP_QUICK_SEND_WORKFLOW_STEPS[0]}</p>
      </nav> : null}

      {mode === "send" ? <ProjectConnectionPanel entitlement={entitlement} projects={projects} projectCode={projectCode} verifiedProject={verifiedProject} checking={projectChecking} onProjectCode={(value) => void verifyProject(value)} onNoProject={() => { setProjectCode(""); setVerifiedProject(null); setMessage(""); }}/> : null}

      {mode === "send" && sendMode === "quick_image" ? <>
        <QuickRecipientPanel sendUser={sendUser} recipientMode={effectiveRecipientMode} defaultRecipient={defaultRecipient} approvedRecipients={approvedRecipients} selectedApprovedIds={selectedApprovedIds} onToggleApproved={toggleApprovedRecipient} recipients={recipients} maxRecipients={maxRecipients} maxSavedContacts={entitlement?.maxSavedContacts ?? 10} identitySessionToken={identitySessionToken} onContactsChanged={setApprovedRecipients} onAdd={addRecipient} onUpdate={updateRecipient} onRemove={(id) => setRecipients((items) => items.filter((item) => item.id !== id))} onUseContact={(contact) => setRecipients((items) => items.some((item) => item.email.toLowerCase() === contact.email.toLowerCase()) || items.length >= Math.min(5, Math.max(0, maxRecipients - 1)) ? items : [...items, { id: `recipient_${Date.now()}_${Math.random().toString(16).slice(2)}`, name: contact.name, email: contact.email, company: contact.company || "" }])}/>
        <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Üzenet a képek mellé · opcionális"><textarea value={senderMessage} onChange={(event) => setSenderMessage(event.target.value.slice(0, 2000))} className={textareaClass} placeholder="Pl. A mai helyszíni bejáráson készült fotók."/><MessageVoiceDictation enabled={Boolean(entitlement?.canUseQuickVoiceNote)} maxSeconds={entitlement?.maxQuickVoiceSecondsPerNote || 60} onTranscript={(text) => setSenderMessage((current) => [current.trim(), text].filter(Boolean).join(current.trim() ? " " : "").slice(0, 2000))}/></Field><label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><input type="checkbox" checked={showRecipientsOnDownload} onChange={(event) => setShowRecipientsOnDownload(event.target.checked)} className="mt-1 accent-cyan-700"/><span><strong className="block text-sm text-cyan-950">Címzettek megjelenítése a letöltőoldalon</strong><span className="mt-1 block text-xs leading-5 text-cyan-900">Alapból bekapcsolva. A címzettek látják, hogy rajtuk kívül kik kapták meg ugyanazt a letöltési linket.</span></span></label></div>
      </> : <>
        {!sendUser ? <div className="grid gap-4 md:grid-cols-2"><Field label="Feladó neve"><input value={senderName} onChange={(event) => setSenderName(event.target.value.slice(0, 120))} className={inputClass}/></Field><Field label="Feladó e-mail-címe"><input type="email" value={senderEmail} onChange={(event) => setSenderEmail(event.target.value.slice(0, 254))} className={inputClass}/></Field></div> : null}
        <div className={sendUser ? "" : "mt-4"}><Field label="Tárgy"><input value={subject} onChange={(event) => setSubject(event.target.value.slice(0, 160))} className={inputClass}/></Field></div>
      </>}

      {mode === "send" && sendMode === "standard" ? <RecipientPanel recipientMode={effectiveRecipientMode} defaultRecipient={defaultRecipient} approvedRecipients={approvedRecipients} selectedApprovedIds={selectedApprovedIds} onToggleApproved={toggleApprovedRecipient} recipients={recipients} maxRecipients={maxRecipients} onAdd={addRecipient} onUpdate={updateRecipient} onRemove={(id) => setRecipients((items) => items.filter((item) => item.id !== id))}/> : null}

      {gate ? <div className="mt-6"><p className="text-xs font-black uppercase tracking-[.14em] text-teal-800">Kinek küldi?</p><p className="mt-1 text-xs text-slate-500">A címzetteket a kapu gazdája előre engedélyezte. Szabad e-mail-cím nem adható meg.</p><div className="mt-3 grid gap-3 md:grid-cols-2">{gate.recipients.map((recipient) => <label key={recipient.id} className={`flex items-start gap-3 rounded-2xl border p-4 ${selectedRecipientIds.includes(recipient.id) ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-slate-50"}`}><input type={gate.type === "organization" ? "checkbox" : "radio"} checked={selectedRecipientIds.includes(recipient.id)} onChange={() => gate.type === "organization" ? toggleGateRecipient(recipient.id) : setSelectedRecipientIds([recipient.id])} className="mt-1 accent-teal-700"/><span><strong className="block text-sm text-slate-950">{recipient.name}</strong><span className="mt-1 block text-xs text-slate-600">{recipient.label || recipient.projectRole || recipient.email}</span></span></label>)}</div></div> : null}

      {!(mode === "send" && sendMode === "quick_image") ? <div className="mt-6 grid gap-4 md:grid-cols-2"><Field label="Rövid üzenet a címzetteknek"><textarea value={senderMessage} onChange={(event) => setSenderMessage(event.target.value.slice(0, 2000))} className={textareaClass} placeholder="Az e-mailben is megjelenik."/><MessageVoiceDictation enabled={Boolean(entitlement?.canUseQuickVoiceNote)} maxSeconds={entitlement?.maxQuickVoiceSecondsPerNote || 60} onTranscript={(text) => setSenderMessage((current) => [current.trim(), text].filter(Boolean).join(current.trim() ? " " : "").slice(0, 2000))}/></Field><Field label="Csomagmegjegyzés"><textarea value={packageNote} onChange={(event) => setPackageNote(event.target.value.slice(0, 10000))} className={textareaClass} placeholder="A letöltési oldalon és az e-mailben is megjelenik."/></Field></div> : null}
      {mode === "send" && sendMode === "standard" ? <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><input type="checkbox" checked={showRecipientsOnDownload} onChange={(event) => setShowRecipientsOnDownload(event.target.checked)} className="mt-1 accent-cyan-700"/><span><strong className="block text-sm text-cyan-950">Címzettek megjelenítése a letöltőoldalon</strong><span className="mt-1 block text-xs leading-5 text-cyan-900">Alapból bekapcsolva; kikapcsolható, ha a címzettek ne lássák egymást.</span></span></label> : null}

      {mode === "send" && sendMode === "standard" ? <div className="mt-6 grid gap-4 md:grid-cols-2"><Field label="Megőrzési idő"><select value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))} className={inputClass}>{[1, 3, 5, 7].map((day) => <option key={day} value={day}>{day} nap{day === defaultRetention ? " · alapérték" : ""}</option>)}</select></Field><Field label="Letöltési védelem"><select value={downloadProtection} onChange={(event) => setDownloadProtection(event.target.value as "link" | "link_pin")} className={inputClass}><option value="link_pin">Link + hatjegyű kód</option><option value="link">Csak biztonságos link</option></select></Field></div> : null}

      {entitlement ? <div className="mt-6 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600"><span className="rounded-full bg-slate-100 px-3 py-1.5">Csomagkeret: {formatMb(entitlement.maxPackageSizeBytes)}</span><span className="rounded-full bg-slate-100 px-3 py-1.5">Max. címzett: {entitlement.maxRecipients}</span><span className="rounded-full bg-slate-100 px-3 py-1.5">Címjegyzék: {entitlement.maxSavedContacts}</span>{entitlement.monthlySendLimit ? <span className="rounded-full bg-slate-100 px-3 py-1.5">Havi használat: {entitlement.currentMonthSendCount}/{entitlement.monthlySendLimit}</span> : null}</div> : null}

      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><strong className="block text-sm text-amber-950">Feltöltési és adatkezelési szabályok</strong><span className="mt-1 block text-xs leading-5 text-amber-900">{rulesAcceptanceRequired ? `Az aktuális szabályzatot az első 3 használatkor el kell fogadni. Eddigi elfogadás: ${entitlement?.uploadRulesAcceptanceCount ?? 0}/3.` : "Az első három kötelező elfogadás teljesült. A szabályzat bármikor újra megnyitható."}</span></div><DropRulesButton accepted={rulesAccepted || !rulesAcceptanceRequired} onClick={() => setRulesDialogOpen(true)} label="Szabályok megtekintése"/></div>{rulesAcceptanceRequired ? <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-amber-300 bg-white p-3"><input type="checkbox" checked={rulesAccepted} onChange={(event) => setRulesAccepted(event.target.checked)} className="mt-1 accent-amber-700"/><span className="text-xs font-bold leading-5 text-amber-950">Elfogadom az aktuális feltöltési szabályokat.</span></label> : null}</div>
      <DropUploadRulesDialog open={rulesDialogOpen} onClose={() => setRulesDialogOpen(false)} accepted={rulesAccepted || !rulesAcceptanceRequired} onAcceptedChange={(value) => rulesAcceptanceRequired && setRulesAccepted(value)} resumableEnabled scannerAvailable publicDownloadReady/>
      <button type="button" onClick={() => void createPackage()} disabled={!formReady || creating || projectChecking} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-slate-950 px-6 py-3 text-sm font-black text-white disabled:bg-slate-300">{creating ? <LoaderCircle size={17} className="animate-spin"/> : <Send size={17}/>} {creating ? "Küldemény előkészítése…" : sendMode === "quick_image" && mode === "send" ? "Tovább a Galéria / Kamera választáshoz" : "Tovább a fájlokhoz"}</button>
      {message ? <Message text={message}/> : null}
    </section> : null}
    {!sessionReady && !loading && message && mode === "submission_gate" ? <Message text={message}/> : null}
  </div></main>;
}

function ProjectConnectionPanel({ entitlement, projects, projectCode, verifiedProject, checking, onProjectCode, onNoProject }: {
  entitlement: SendEntitlement | null;
  projects: SendProject[];
  projectCode: string;
  verifiedProject: ProjectVerification | null;
  checking: boolean;
  onProjectCode: (value: string) => void;
  onNoProject: () => void;
}) {
  if (!entitlement?.canUseProjectDrop) {
    return <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start gap-3"><FolderKanban size={21} className="mt-0.5 shrink-0 text-slate-600"/><div><p className="text-xs font-black uppercase tracking-[.14em] text-slate-700">Projektkapcsolat</p><h3 className="mt-1 text-base font-black text-slate-950">Nincs projekt Drop-jogosultság</h3><p className="mt-1 text-xs leading-5 text-slate-600">A küldemény normál, időkorlátos DIMPRO Send-fájlátadásként működik.</p></div></div></section>;
  }
  return <section className="mb-6 rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><div className="flex items-start gap-3"><FolderKanban size={21} className="mt-0.5 shrink-0 text-cyan-800"/><div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-900">Projektkapcsolat</p><span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-900">Identity Core</span></div><h3 className="mt-1 text-base font-black text-slate-950">Projekt kiválasztása</h3><p className="mt-1 text-xs leading-5 text-slate-700">Érvényes projekt esetén a küldemény a projekt <strong>Beérkező Drop</strong> céljához kapcsolódik. Projekt nélkül hagyományos, időkorlátos Send marad.</p></div></div>
    <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-cyan-200 bg-white p-3 text-sm font-bold text-slate-700"><input type="radio" name="drop-project-choice" checked={!projectCode} onChange={onNoProject} className="accent-cyan-700"/> Nincs projektkapcsolat</label>
    {projects.length ? <div className="mt-3"><Field label="Engedélyezett projekt"><select value={verifiedProject?.project.publicCode || ""} onChange={(event) => event.target.value ? onProjectCode(event.target.value) : onNoProject()} disabled={checking} className={inputClass}><option value="">Válasszon projektet</option>{projects.map((project) => <option key={project.id} value={project.publicCode}>{project.name} · {project.publicCode}</option>)}</select></Field></div> : <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Ehhez a jogosultsághoz jelenleg nincs automatikusan listázható projekt. Szükség esetén adja meg a projektkódot.</p>}
    <label className="mt-3 block"><span className="mb-2 block text-[10px] font-black uppercase tracking-[.1em] text-slate-600">Projektkód · opcionális kézi megadás</span><div className="relative"><input value={projectCode} onChange={(event) => onProjectCode(event.target.value)} placeholder="PRJ-26-K7M-4Q9" className={`${inputClass} pr-12 font-mono uppercase tracking-[.12em]`}/>{checking ? <LoaderCircle size={17} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-cyan-800"/> : null}</div></label>
    {verifiedProject ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950"><div className="flex items-center gap-2 font-black"><CheckCircle2 size={16}/> Megfelelő projektkód</div><p className="mt-1 font-semibold">{verifiedProject.project.name} · {verifiedProject.project.publicCode}</p><p className="mt-1">Cél: <strong>{verifiedProject.destination.label}</strong>{verifiedProject.destination.preserveGroups ? " · képcsoportok megőrzésével" : ""}</p></div> : projectCode && completeProjectCode(projectCode) && !checking ? <p className="mt-2 text-xs font-semibold text-amber-800">A projektkód még nincs jóváhagyva.</p> : null}
  </section>;
}

function QuickRecipientPanel({ sendUser, recipientMode, defaultRecipient: _defaultRecipient, approvedRecipients, selectedApprovedIds, onToggleApproved, recipients, maxRecipients, maxSavedContacts, identitySessionToken, onContactsChanged, onAdd, onUpdate, onRemove, onUseContact }: {
  sendUser: SendUser | null;
  recipientMode: DropSendRecipientMode;
  defaultRecipient: DropPublicRecipient | null;
  approvedRecipients: DropPublicRecipient[];
  selectedApprovedIds: string[];
  onToggleApproved: (id: string) => void;
  recipients: SendRecipient[];
  maxRecipients: number;
  maxSavedContacts: number;
  identitySessionToken: string;
  onContactsChanged: (contacts: DropPublicRecipient[]) => void;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<SendRecipient>) => void;
  onRemove: (id: string) => void;
  onUseContact: (contact: DropPublicRecipient) => void;
}) {
  void _defaultRecipient;
  const selfEmail = sendUser?.email.toLowerCase() || "";
  const extraLimit = Math.min(5, Math.max(0, maxRecipients - (sendUser ? 1 : 0)));
  const [bookOpen, setBookOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactCompany, setContactCompany] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const refreshContacts = async () => {
    if (!identitySessionToken) return;
    const response = await fetch("/api/dimpro-identity/send/contacts", { cache: "no-store", headers: { Authorization: `Bearer ${identitySessionToken}` } });
    const payload = await response.json() as { contacts?: IdentityRecipient[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "A címjegyzék nem tölthető be.");
    onContactsChanged((payload.contacts || []).map(mapIdentityRecipient));
  };
  const saveContact = async () => {
    if (!identitySessionToken || !contactName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) return;
    setContactBusy(true); setContactMessage("");
    try {
      const response = await fetch("/api/dimpro-identity/send/contacts", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${identitySessionToken}` }, body: JSON.stringify({ contactId: contactId || null, name: contactName, email: contactEmail, organizationName: contactCompany }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A címjegyzék-bejegyzés nem menthető.");
      await refreshContacts(); setContactId(""); setContactName(""); setContactEmail(""); setContactCompany(""); setContactMessage("A címjegyzék mentve.");
    } catch (error) { setContactMessage(error instanceof Error ? error.message : "A címjegyzék mentése sikertelen."); }
    finally { setContactBusy(false); }
  };
  const removeContact = async (id: string) => {
    if (!identitySessionToken) return;
    setContactBusy(true); setContactMessage("");
    try {
      const response = await fetch("/api/dimpro-identity/send/contacts", { method: "DELETE", headers: { "content-type": "application/json", Authorization: `Bearer ${identitySessionToken}` }, body: JSON.stringify({ contactId: id }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A címjegyzék-bejegyzés nem törölhető.");
      await refreshContacts(); setContactMessage("A címjegyzék-bejegyzés törölve.");
    } catch (error) { setContactMessage(error instanceof Error ? error.message : "A címjegyzék módosítása sikertelen."); }
    finally { setContactBusy(false); }
  };
  return <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
    <p className="text-xs font-black uppercase tracking-[.14em] text-teal-800">Címzettek · Gyors KépSend</p>
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-[10px] font-black uppercase tracking-[.1em] text-emerald-800">Automatikus alapcímzett</p><p className="mt-1 text-sm font-black text-slate-950">{sendUser?.fullName || "Központi felhasználó"}</p><p className="text-xs font-semibold text-slate-600">{sendUser?.email || "–"}</p><p className="mt-1 text-[11px] text-emerald-900">Alapból Ön kapja meg a küldeményt. Ezt a címet nem kell külön megadni.</p></div>
    {recipientMode === "approved_list" ? <div className="mt-4"><p className="text-xs font-black uppercase tracking-[.1em] text-slate-700">Kinek küldené még el? · opcionális</p><p className="mt-1 text-xs text-slate-500">Legfeljebb {extraLimit} központilag jóváhagyott címzett választható.</p><div className="mt-3 grid gap-2 md:grid-cols-2">{approvedRecipients.filter((recipient) => recipient.email.toLowerCase() !== selfEmail).map((recipient) => <label key={recipient.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${selectedApprovedIds.includes(recipient.id) ? "border-teal-400 bg-white" : "border-teal-100 bg-teal-50/40"}`}><input type="checkbox" checked={selectedApprovedIds.includes(recipient.id)} onChange={() => onToggleApproved(recipient.id)} disabled={!selectedApprovedIds.includes(recipient.id) && selectedApprovedIds.length >= extraLimit} className="mt-1 accent-teal-700"/><span><strong className="block text-sm text-slate-950">{recipient.name}</strong><span className="mt-1 block text-xs text-slate-600">{recipient.email}</span></span></label>)}</div></div> : extraLimit > 0 ? <div className="mt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.1em] text-slate-700">Kinek küldené még el? · opcionális</p><p className="mt-1 text-xs text-slate-500">Legfeljebb {extraLimit} további címzett rögzíthető.</p></div><div className="flex gap-2"><button type="button" onClick={() => setBookOpen((value) => !value)} className="rounded-xl border border-teal-300 bg-white px-3 py-2 text-xs font-black text-teal-900">Címjegyzék · {approvedRecipients.length}/{maxSavedContacts}</button><button type="button" onClick={onAdd} disabled={recipients.length >= extraLimit} className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-3 py-2 text-xs font-black text-white disabled:bg-slate-300"><Plus size={15}/> Címzett</button></div></div>
      {approvedRecipients.length ? <div className="mt-3 flex flex-wrap gap-2">{approvedRecipients.filter((contact) => contact.email.toLowerCase() !== selfEmail).map((contact) => <button key={contact.id} type="button" onClick={() => onUseContact(contact)} className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-[11px] font-bold text-teal-900">+ {contact.name} · {contact.email}</button>)}</div> : null}
      <div className="mt-3 space-y-2">{recipients.slice(0, extraLimit).map((recipient, index) => <div key={recipient.id} className="grid gap-2 rounded-xl border border-teal-100 bg-white p-3 md:grid-cols-[1fr_1.2fr_1fr_auto]"><input value={recipient.name} onChange={(event) => onUpdate(recipient.id, { name: event.target.value.slice(0,120) })} placeholder={`További címzett ${index+1} neve`} className={inputClass}/><input type="email" value={recipient.email} onChange={(event) => onUpdate(recipient.id, { email: event.target.value.slice(0,254) })} placeholder="E-mail-cím · opcionális" className={inputClass}/><input value={recipient.company} onChange={(event) => onUpdate(recipient.id, { company: event.target.value.slice(0,160) })} placeholder="Cég (opcionális)" className={inputClass}/><button type="button" onClick={() => onRemove(recipient.id)} className="grid h-12 w-12 place-items-center rounded-xl border border-slate-300 bg-white text-slate-500" aria-label="További címzett eltávolítása"><Trash2 size={16}/></button></div>)}</div>
      {bookOpen ? <div className="mt-4 rounded-xl border border-teal-200 bg-white p-3"><div className="flex items-center justify-between"><div><strong className="text-xs text-slate-950">Saját DIMPRO címjegyzék</strong><p className="mt-1 text-[11px] text-slate-500">A bejegyzéseket Ön bármikor módosíthatja. A licenckeret jelenleg {maxSavedContacts} kontakt.</p></div></div><div className="mt-3 grid gap-2 md:grid-cols-3"><input value={contactName} onChange={(e)=>setContactName(e.target.value.slice(0,160))} placeholder="Név" className={inputClass}/><input type="email" value={contactEmail} onChange={(e)=>setContactEmail(e.target.value.slice(0,254))} placeholder="E-mail-cím" className={inputClass}/><input value={contactCompany} onChange={(e)=>setContactCompany(e.target.value.slice(0,160))} placeholder="Szervezet · opcionális" className={inputClass}/></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={contactBusy || !contactName.trim() || !contactEmail.trim()} onClick={() => void saveContact()} className="rounded-xl bg-teal-800 px-3 py-2 text-xs font-black text-white disabled:bg-slate-300">{contactId ? "Módosítás mentése" : "Mentés a címjegyzékbe"}</button>{contactId ? <button type="button" onClick={()=>{setContactId("");setContactName("");setContactEmail("");setContactCompany("");}} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black">Mégse</button>:null}</div>{approvedRecipients.length ? <div className="mt-3 divide-y divide-slate-100">{approvedRecipients.map((contact)=><div key={contact.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"><span><strong>{contact.name}</strong> · {contact.email}{contact.company ? ` · ${contact.company}` : ""}</span><span className="flex gap-2"><button type="button" onClick={()=>{setContactId(contact.id);setContactName(contact.name);setContactEmail(contact.email);setContactCompany(contact.company||"");}} className="font-black text-cyan-800">Szerkesztés</button><button type="button" disabled={contactBusy} onClick={()=>void removeContact(contact.id)} className="font-black text-rose-700">Törlés</button></span></div>)}</div>:null}{contactMessage ? <p className="mt-2 text-xs font-bold text-slate-600">{contactMessage}</p>:null}</div> : null}
    </div> : <p className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold text-slate-700">A jelenlegi licenckeretben további címzett nem adható meg.</p>}
  </section>;
}

function RecipientPanel({ recipientMode, defaultRecipient, approvedRecipients, selectedApprovedIds, onToggleApproved, recipients, maxRecipients, onAdd, onUpdate, onRemove }: { recipientMode: DropSendRecipientMode; defaultRecipient: DropPublicRecipient | null; approvedRecipients: DropPublicRecipient[]; selectedApprovedIds: string[]; onToggleApproved: (id: string) => void; recipients: SendRecipient[]; maxRecipients: number; onAdd: () => void; onUpdate: (id: string, patch: Partial<SendRecipient>) => void; onRemove: (id: string) => void }) {
  if (recipientMode === "locked_default" && defaultRecipient) return <section className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50 p-4"><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-800">Zárolt címzett</p><div className="mt-3 flex items-start gap-3"><LockKeyhole size={20} className="text-cyan-800"/><div><strong className="text-sm text-slate-950">{defaultRecipient.name}</strong><p className="mt-1 text-xs font-semibold text-slate-600">{defaultRecipient.email}</p>{defaultRecipient.company ? <p className="mt-1 text-xs text-slate-500">{defaultRecipient.company}</p> : null}</div></div></section>;
  if (recipientMode === "approved_list") return <section className="mt-6"><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">Jóváhagyott címzettek</p><p className="mt-1 text-xs text-slate-500">Csak a központi DIMPRO Send-jogosultság engedélyezett címzettjei választhatók.</p><div className="mt-3 grid gap-3 md:grid-cols-2">{approvedRecipients.map((recipient) => <label key={recipient.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 ${selectedApprovedIds.includes(recipient.id) ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}><input type="checkbox" checked={selectedApprovedIds.includes(recipient.id)} onChange={() => onToggleApproved(recipient.id)} className="mt-1 accent-cyan-700"/><span><strong className="block text-sm text-slate-950">{recipient.name}</strong><span className="mt-1 block text-xs text-slate-600">{recipient.email}</span></span></label>)}</div></section>;
  return <section className="mt-6"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.14em] text-cyan-700">Címzettek</p><p className="mt-1 text-xs text-slate-500">Legfeljebb {maxRecipients} címzett. Minden címzett külön e-mailt kap.</p></div><button type="button" onClick={onAdd} disabled={recipients.length >= maxRecipients} className="inline-flex items-center gap-2 rounded-xl bg-cyan-800 px-3 py-2 text-xs font-black text-white disabled:bg-slate-300"><Plus size={15}/> Címzett</button></div><div className="mt-3 space-y-3">{recipients.map((recipient, index) => <div key={recipient.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-[1fr_1.2fr_1fr_auto]"><input value={recipient.name} onChange={(event) => onUpdate(recipient.id, { name: event.target.value.slice(0, 120) })} placeholder={`Címzett ${index + 1} neve`} className={inputClass}/><input type="email" value={recipient.email} onChange={(event) => onUpdate(recipient.id, { email: event.target.value.slice(0, 254) })} placeholder="E-mail-cím" className={inputClass}/><input value={recipient.company} onChange={(event) => onUpdate(recipient.id, { company: event.target.value.slice(0, 160) })} placeholder="Cég (opcionális)" className={inputClass}/><button type="button" onClick={() => onRemove(recipient.id)} disabled={recipients.length === 1} className="grid h-12 w-12 place-items-center rounded-xl border border-slate-300 bg-white text-slate-500 disabled:opacity-40"><Trash2 size={16}/></button></div>)}</div></section>;
}

function LoadingShell({ mode, text }: { mode: Props["mode"]; text: string }) { return <main className="min-h-screen bg-[#f4f9fa] px-4 py-8 sm:px-6"><div className="mx-auto max-w-5xl"><Header mode={mode}/><div className="mt-10 flex items-center justify-center gap-3 rounded-2xl border border-cyan-200 bg-white p-6 text-sm font-bold text-slate-700"><LoaderCircle className="animate-spin"/>{text}</div></div></main>; }
function Header({ mode }: { mode: Props["mode"] }) { return <header className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><Link href="/" className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[.14em] text-cyan-800"><ArrowLeft size={15}/> DIMPRO Drop</Link><div className="mt-4 flex items-start gap-4"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-slate-950 text-cyan-300">{mode === "send" ? <Send size={25}/> : <UsersRound size={25}/>}</span><div><p className="text-xs font-black uppercase tracking-[.2em] text-cyan-700">DROP 1.2.12</p><h1 className="mt-2 text-3xl font-black text-slate-950">{mode === "send" ? "DIMPRO Send" : "DIMPRO Beküldőkapu"}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{mode === "send" ? "Központi Identity Core jogosultsággal küldhet fájlokat, képeket és projektkapcsolt csomagokat.": "Küldjön fájlokat előre meghatározott személynek, projekthez vagy szervezeti címzettnek 250 MB-ig."}</p></div></div><div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-700"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-800"><ShieldCheck size={14}/> Robotvédelem</span><span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1.5 text-cyan-800"><Mail size={14}/> E-mailes kézbesítés</span><span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-teal-800"><UserRound size={14}/> Központi azonosítás</span></div></header>; }

function SwipeDeleteSendCodeControl({ onConfirm, compact = false }: { onConfirm: () => void; compact?: boolean }) {
  const [offset, setOffset] = useState(0);
  const startRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });
  const threshold = -72;
  const maxTravel = -96;

  const reset = () => {
    startRef.current.active = false;
    setOffset(0);
  };
  const start = (event: React.PointerEvent<HTMLButtonElement>) => {
    startRef.current = { x: event.clientX, y: event.clientY, active: true };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!startRef.current.active) return;
    const rawX = event.clientX - startRef.current.x;
    const rawY = event.clientY - startRef.current.y;
    if (Math.abs(rawY) > Math.abs(rawX) || Math.abs(rawX) < 8) return;
    setOffset(Math.max(maxTravel, Math.min(0, rawX)));
  };
  const finish = () => {
    if (!startRef.current.active) return;
    const shouldDelete = offset <= threshold;
    reset();
    if (shouldDelete) onConfirm();
  };

  return <div data-drop-send-code-swipe-delete className={`relative overflow-hidden rounded-xl border border-rose-300 bg-rose-100 ${compact ? "min-w-[15rem]" : "max-w-md"}`}>
    <div aria-hidden="true" className="absolute inset-0 flex items-center justify-end bg-rose-100 px-4 text-xs font-black text-rose-900">
      <span className={`inline-flex items-center gap-2 transition-opacity ${offset < -12 ? "opacity-100" : "opacity-60"}`}><Trash2 size={15}/> Törlés</span>
    </div>
    <button
      type="button"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={reset}
      onKeyDown={(event) => {
        if (event.key === "Delete") {
          event.preventDefault();
          onConfirm();
        }
      }}
      className="relative flex min-h-11 w-full touch-pan-y select-none items-center gap-2 bg-white px-3 py-2 text-left text-xs font-black text-rose-800 transition-transform"
      style={{ transform: `translateX(${offset}px)` }}
      aria-label="Mentett Send-kód törlése. Húzza balra, vagy használja a Törlés gombot."
    >
      <Trash2 size={14}/>
      <span className="min-w-0 flex-1">Húzza balra a mentett kód törléséhez</span>
      <ArrowLeft size={15} className="shrink-0"/>
    </button>
    <div className="relative border-t border-rose-200 bg-white px-2 py-1.5 text-right">
      <button type="button" onClick={onConfirm} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black text-rose-800">
        Kód törlése
      </button>
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[.1em] text-slate-600">{label}</span>{children}</label>; }
function Message({ text }: { text: string }) { return <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">{text}</div>; }
