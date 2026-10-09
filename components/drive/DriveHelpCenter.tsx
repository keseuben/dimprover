"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Box, Download, FileSearch2, FolderKanban, HelpCircle, Search, ShieldCheck, Star, Upload, X } from "lucide-react";
import { DRIVE_HELP_ACTIONS, DRIVE_HELP_TOPICS, DRIVE_ROLE_HELP, driveHelpStatusLabel, type DriveHelpWorkspace } from "./driveHelpData";
import styles from "./DriveHelpCenter.module.css";

type Props = { open:boolean; workspace:"PERSONAL"|"PROJECT"; workspaceName:string; onClose:()=>void };
const TOPIC_ICONS:Record<string,typeof HelpCircle>={start:BookOpen,views:FileSearch2,personal:FolderKanban,project:FolderKanban,permissions:ShieldCheck,"upload-names":Upload,downloads:Download,favorites:Star,boxes:Box,review:ShieldCheck,security:ShieldCheck,viewer:FileSearch2,"button-index":HelpCircle,troubleshooting:HelpCircle};
function matchWorkspace(value:DriveHelpWorkspace,workspace:"PERSONAL"|"PROJECT"){return value==="ALL"||value===workspace}
function normalize(value:string){return value.toLocaleLowerCase("hu-HU").normalize("NFD").replace(/[\u0300-\u036f]/g,"")}

export default function DriveHelpCenter({open,workspace,workspaceName,onClose}:Props){
  const topics=useMemo(()=>DRIVE_HELP_TOPICS.filter((topic)=>matchWorkspace(topic.workspace,workspace)),[workspace]);
  const [selectedId,setSelectedId]=useState("start");
  const [query,setQuery]=useState("");
  const dialogRef=useRef<HTMLElement|null>(null);
  const searchRef=useRef<HTMLInputElement|null>(null);
  const onCloseRef=useRef(onClose);
  useEffect(()=>{onCloseRef.current=onClose},[onClose]);
  useEffect(()=>{if(open&&!topics.some((topic)=>topic.id===selectedId))setSelectedId("start")},[open,selectedId,topics]);
  useEffect(()=>{
    if(!open)return;
    const previousFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const frame=window.requestAnimationFrame(()=>searchRef.current?.focus());
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();onCloseRef.current();return}
      if(event.key!=="Tab")return;
      const dialog=dialogRef.current;
      if(!dialog)return;
      const focusable=Array.from(dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'));
      if(!focusable.length){event.preventDefault();dialog.focus();return}
      const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
      if(event.shiftKey&&(active===first||!dialog.contains(active))){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&active===last){event.preventDefault();first.focus()}
    };
    const old=document.body.style.overflow;
    document.body.style.overflow="hidden";
    window.addEventListener("keydown",onKey);
    return()=>{
      window.cancelAnimationFrame(frame);
      document.body.style.overflow=old;
      window.removeEventListener("keydown",onKey);
      if(previousFocus?.isConnected)previousFocus.focus();
    }
  },[open]);
  const selected=topics.find((topic)=>topic.id===selectedId)||topics[0];
  const q=normalize(query.trim());
  const actions=useMemo(()=>{const scoped=DRIVE_HELP_ACTIONS.filter((action)=>matchWorkspace(action.workspace,workspace));if(q)return scoped.filter((action)=>normalize([action.label,action.location,action.description,action.condition||"",...(action.keywords||[])].join(" ")).includes(q));return selected?.relatedActionIds?.length?scoped.filter((action)=>selected.relatedActionIds?.includes(action.id)):[]},[q,selected,workspace]);
  const filteredTopics=useMemo(()=>!q?topics:topics.filter((topic)=>normalize([topic.title,topic.summary,...topic.body,...(topic.keywords||[])].join(" ")).includes(q)),[q,topics]);
  if(!open||!selected)return null;
  const showRoles=selected.id==="permissions"&&!q&&workspace==="PROJECT";
  return <div className={styles.backdrop} role="presentation" onMouseDown={(event)=>{if(event.currentTarget===event.target)onClose()}}>
    <section ref={dialogRef} tabIndex={-1} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="drive-help-title" aria-describedby="drive-help-context">
      <header className={styles.header}>
        <div className={styles.title}><span className={styles.titleIcon}><HelpCircle size={20}/></span><div className={styles.titleCopy}><small>DIMPRO DRIVE · SÚGÓ</small><strong id="drive-help-title">Kezelési és működési útmutató</strong><span id="drive-help-context">{workspace==="PERSONAL"?"Saját Drive":"Projekt munkatér"} · {workspaceName}</span></div></div>
        <label className={styles.search}><Search size={15}/><input ref={searchRef} aria-label="Keresés a DIMPRO Drive Súgóban" placeholder="Keresés: pl. ZIP, kedvenc, projektvezető, törlés..." value={query} onChange={(event)=>setQuery(event.target.value)}/></label>
        <button type="button" className={styles.close} onClick={onClose} title="Súgó bezárása" aria-label="Súgó bezárása"><X size={18}/></button>
      </header>
      <div className={styles.body}>
        <aside className={styles.sidebar}>
          <div className={styles.context}><small>Aktuális munkatér</small><strong>{workspace==="PERSONAL"?"Saját Drive":"Projekt munkatér"}</strong><span>A tartalom automatikusan ehhez a munkatérhez igazodik.</span></div>
          <div className={styles.topicList}>{filteredTopics.map((topic)=>{const Icon=TOPIC_ICONS[topic.id]||BookOpen;return <button key={topic.id} type="button" className={styles.topicButton} data-active={selected.id===topic.id&&!q} onClick={()=>{setQuery("");setSelectedId(topic.id)}}><span className={styles.topicIcon}><Icon size={14}/></span><span className={styles.topicText}><strong>{topic.title}</strong><span>{topic.summary}</span></span></button>})}</div>
        </aside>
        <main className={styles.content}>
          <div className={styles.contentHeader}><small>{q?`Keresési találatok · ${filteredTopics.length} témakör · ${actions.length} vezérlő`:workspace==="PERSONAL"?"SAJÁT DRIVE":"PROJEKT MUNKATÉR"}</small><h2>{q?`„${query}”`:selected.title}</h2><p>{q?"A találatok a súgótémákban és a vezérlők nevében, helyében, funkciójában és feltételeiben is keresnek.":selected.summary}</p></div>
          {!q?<div className={styles.prose}>{selected.body.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div>:null}
          {q&&filteredTopics.length?<><div className={styles.indexHeader}><strong>Talált súgótémák</strong><span>{filteredTopics.length} témakör</span></div><div className={styles.topicResults}>{filteredTopics.map((topic)=>{const Icon=TOPIC_ICONS[topic.id]||BookOpen;return <button key={topic.id} type="button" className={styles.topicResultCard} onClick={()=>{setQuery("");setSelectedId(topic.id)}}><span className={styles.topicIcon}><Icon size={14}/></span><span><strong>{topic.title}</strong><small>{topic.summary}</small></span></button>})}</div></>:null}
          {showRoles?<><div className={styles.indexHeader}><strong>Projekt-szerepkörök és jogosultságok</strong><span>{DRIVE_ROLE_HELP.length} szerepkör</span></div><div className={styles.roleGrid}>{DRIVE_ROLE_HELP.map((role)=><article key={role.code} className={styles.roleCard}><header><strong>{role.label}</strong><span>{role.code}</span></header><p>{role.summary}</p><div className={styles.permissionChips}>{role.permissions.map((permission)=><span key={permission}>{permission}</span>)}</div></article>)}</div><div className={styles.roleNote}><strong>Fontos:</strong> a projekt-szerepkör a projekt egészére ad alapjogosultságot. A mappaszintű ACL ezt lefelé szűkítheti. A jelszavas mappavédelem csak második védelmi réteg, és nem ad hozzáférést annak, aki projekt-/mappajog alapján nem jogosult.</div></>:null}
          <div className={styles.indexHeader}><strong>{q?"Talált gombok és műveletek":"Kapcsolódó gombok és műveletek"}</strong><span>{actions.length} elem</span></div>
          {actions.length?<div className={styles.cards}>{actions.map((action)=><article className={styles.actionCard} key={action.id}><div className={styles.actionHead}><strong>{action.label}</strong><span className={styles.status} data-status={action.status}>{driveHelpStatusLabel(action.status)}</span></div><div className={styles.actionMeta}>{action.location}</div><p>{action.description}</p>{action.condition?<div className={styles.condition}><strong>Feltétel:</strong> {action.condition}</div>:null}</article>)}</div>:<div className={styles.empty}>{q&&filteredTopics.length?"Vezérlőtalálat nincs; válassz a fenti súgótémák közül.":"Nincs találat ebben a munkatérben. Próbálj rövidebb vagy másik kifejezést."}</div>}
          {!q?<div className={styles.footerHint}>Gyorsbillentyű: <span className={styles.keyboard}>Esc</span> bezárja a Súgót. A Súgó a fejlécből és a bal oldali <strong>?</strong> ikonból ugyanígy megnyitható.</div>:null}
        </main>
      </div>
    </section>
  </div>;
}
