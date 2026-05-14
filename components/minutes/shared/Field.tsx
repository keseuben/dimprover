type Props = {
  label: string
  value: string
}

export default function Field({
  label,
  value,
}: Props) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800">
        {value}
      </div>
    </div>
  )
}