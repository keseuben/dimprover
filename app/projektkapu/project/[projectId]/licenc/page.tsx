import Link from "next/link";
import { ArrowLeft, BadgeCheck, Building2 } from "lucide-react";
import ProjectDriveLicensePanel from "@/components/drive/ProjectDriveLicensePanel";
import styles from "@/components/drive/DriveLicenseCenter.module.css";

export const metadata={
  title:"DIMPRO Projektkapu – Licenc és előfizetés",
  description:"A kiválasztott projekt önálló Projektkapu-licencének állapota.",
};
type Props={params:Promise<{projectId:string}>};

export default async function ProjectGateLicensePage({params}:Props){
  const {projectId}=await params;
  return <main className={styles.surface}>
    <header className={styles.topline}>
      <Link className={styles.back} href={"/projektkapu/project/"+encodeURIComponent(projectId)}>
        <ArrowLeft size={16}/> Vissza a Projektkapuba
      </Link>
      <span className={styles.brand}><Building2 size={16}/> DIMPRO Projektkapu</span>
    </header>
    <div className={styles.container}>
      <header className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>Központi licencrendszer · projekt-termék</span>
          <h1><BadgeCheck size={24}/> Projektkapu – licenc és előfizetés</h1>
          <p>Az adott projekt Projektkapu-licence önálló a DIMPRO Drive licencétől. A meglévő projekttagság és mappajogosultság ettől külön kezelendő.</p>
        </div>
      </header>
      <ProjectDriveLicensePanel projectId={projectId} projectName={"Projekt: "+projectId}
        productCode="PROJECT_GATE"/>
      <section className={styles.panel}>
        <h2><Building2 size={18}/> Közös projekt · külön termékek</h2>
        <p className={styles.muted}>A Projektkapu és a Drive ugyanazt a projektet használja, de két külön licenccel és csomaggal rendelkezhet. A licencadatok kizárólag tájékoztató jellegűek a hitelesített licencmotor aktiválásáig.</p>
        <Link className={styles.secondaryLink}
          href={"/drive/licenc?project="+encodeURIComponent(projectId)}>
          DIMPRO Drive projektlicenc megtekintése
        </Link>
      </section>
    </div>
  </main>;
}
