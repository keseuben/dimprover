import DriveShell from "@/components/drive/DriveShell";

export default function DrivePage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var t=localStorage.getItem("dimpro-drive-theme");t=t==="dark"?"dark":"light";document.documentElement.dataset.driveTheme=t;document.documentElement.style.colorScheme=t;}catch(e){document.documentElement.dataset.driveTheme="light";document.documentElement.style.colorScheme="light";}})();`,
        }}
      />
      <DriveShell
        pilotMode={process.env.DRIVE_PILOT_MODE_ENABLED?.trim().toLowerCase() === "true"}
        pilotProjectName={process.env.DRIVE_PILOT_PROJECT_NAME?.trim() || ""}
      />
    </>
  );
}
