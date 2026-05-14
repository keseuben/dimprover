"use client";

interface Props {
  children: React.ReactNode;
}

export default function ScheduleViewport({ children }: Props) {
  return (
    <div className="max-h-[calc(100vh-320px)] overflow-auto">
      {children}
    </div>
  );
}