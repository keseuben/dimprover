import { EventPanel } from "./EventShell";
import type { EventBringItem, EventGuest, EventMessageItem, EventVoteGroup } from "./types";

type EventAdminSummaryProps = {
  guests: EventGuest[];
  bringItems?: EventBringItem[];
  messages?: EventMessageItem[];
  votes?: EventVoteGroup[];
};

function statusText(status: EventGuest["status"]) {
  if (status === "jovunk") return "Jön";
  if (status === "nem") return "Nem jön";
  return "Kérdéses";
}

function preferenceText(preference: EventGuest["eventPreference"]) {
  if (preference === "mama") return "Csak Mama";
  if (preference === "apu") return "Csak Apu";
  if (preference === "egyik_sem") return "Egyik sem";
  return "Közös / mindkettő";
}

function voterNames(items: string[]) {
  return items.map((item) => item.includes("|") ? item.split("|").slice(1).join("|") : item);
}

function isSeparatePlanningVote(title: string) {
  return title.toLocaleLowerCase("hu-HU").includes("ha külön lesz");
}

export default function EventAdminSummary({ guests, bringItems = [], messages = [], votes = [] }: EventAdminSummaryProps) {
  return (
    <EventPanel title="6. lépés – Összesítő táblázatok" description="Átlátható nézet a válaszokról, szavazásokról, felajánlásokról és üzenetekről.">
      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <SummaryBox label="Válasz" value={guests.length} />
        <SummaryBox label="Szavazás" value={votes.length} />
        <SummaryBox label="Felajánlás" value={bringItems.length} />
        <SummaryBox label="Üzenet" value={messages.length} />
      </div>

      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-lg font-black text-slate-800">Vendégválaszok</h3>
          <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
            <div className="grid min-w-[960px] grid-cols-[1.45fr_0.75fr_0.45fr_0.95fr_1.25fr_1fr] bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
              <Cell>Név / csoport</Cell><Cell>Státusz</Cell><Cell>Fő</Cell><Cell>Esemény</Cell><Cell>Elérhetőség</Cell><Cell>Megjegyzés</Cell>
            </div>
            {guests.length === 0 && <p className="p-4 text-sm text-slate-500">Még nincs rögzített válasz.</p>}
            {guests.map((guest) => (
              <div key={guest.id} className="grid min-w-[960px] grid-cols-[1.45fr_0.75fr_0.45fr_0.95fr_1.25fr_1fr] border-t border-slate-100 text-sm text-slate-700">
                <Cell><strong>{guest.groupName ? `${guest.groupName} – ` : ""}{guest.fullName || guest.name}</strong>{guest.nickname ? ` (${guest.nickname})` : ""}</Cell>
                <Cell>{statusText(guest.status)}</Cell>
                <Cell>{guest.count || "-"}</Cell>
                <Cell>{preferenceText(guest.eventPreference)}</Cell>
                <Cell>{guest.email || "-"}<br />{guest.phone || "-"}</Cell>
                <Cell>{guest.note || guest.allergy || "-"}</Cell>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-lg font-black text-slate-800">Szavazások állása</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {votes.map((vote, voteIndex) => (
              <div key={`${vote.title}-${voteIndex}`} className={`rounded-2xl border p-4 shadow-sm ${isSeparatePlanningVote(vote.title) ? "border-sky-200 bg-sky-50/70" : "border-slate-100 bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <h4 className="font-black text-slate-800">{vote.title}</h4>
                  {isSeparatePlanningVote(vote.title) && <span className="rounded-full bg-sky-500 px-3 py-1 text-xs font-black text-white">külön esemény esetére</span>}
                </div>
                <div className="mt-3 space-y-2">
                  {vote.options.map((option, optionIndex) => {
                    const voters = voterNames(vote.voters?.[optionIndex] ?? []);
                    return (
                      <div key={`${option}-${optionIndex}`} className="rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="flex justify-between gap-3 font-bold text-slate-700"><span>{option}</span><span>{voters.length}</span></div>
                        {voters.length > 0 && <p className="mt-1 text-xs text-slate-500">{voters.join(", ")}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <MiniTable title="Ki mit hoz?" empty="Még nincs felajánlás." items={bringItems.map((item) => ({ owner: `${item.ownerGroupName ? `${item.ownerGroupName} – ` : ""}${item.ownerFullName || item.owner}${item.ownerNickname ? ` (${item.ownerNickname})` : ""}`, text: item.text }))} />
          <MiniTable title="Üzenetek" empty="Még nincs üzenet." items={messages.map((item) => ({ owner: `${item.ownerGroupName ? `${item.ownerGroupName} – ` : ""}${item.ownerFullName || item.owner}${item.ownerNickname ? ` (${item.ownerNickname})` : ""}`, text: item.text }))} />
        </section>
      </div>
    </EventPanel>
  );
}

function SummaryBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-400">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-800">{value}</p>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="border-r border-slate-100 p-3 last:border-r-0">{children}</div>;
}

function MiniTable({ title, empty, items }: { title: string; empty: string; items: { owner: string; text: string }[] }) {
  return (
    <div>
      <h3 className="mb-3 text-lg font-black text-slate-800">{title}</h3>
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="grid grid-cols-[0.9fr_1.1fr] bg-slate-50 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          <Cell>Név / csoport</Cell><Cell>Tartalom</Cell>
        </div>
        {items.length === 0 && <p className="p-4 text-sm text-slate-500">{empty}</p>}
        {items.map((item, index) => (
          <div key={`${item.owner}-${index}`} className="grid grid-cols-[0.9fr_1.1fr] border-t border-slate-100 text-sm text-slate-700">
            <Cell><strong>{item.owner}</strong></Cell><Cell>{item.text}</Cell>
          </div>
        ))}
      </div>
    </div>
  );
}