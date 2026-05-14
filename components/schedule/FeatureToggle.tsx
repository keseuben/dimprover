import React from "react";

type FeatureToggleProps = {
  label: string;
  checked: boolean;
  onChange: () => void;
};

export default function FeatureToggle({
  label,
  checked,
  onChange,
}: FeatureToggleProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
        checked
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      }`}
    >
      <span
        className={`h-3 w-3 rounded-full border ${
          checked ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
        }`}
      />
      {label}
    </button>
  );
}