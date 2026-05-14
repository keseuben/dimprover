"use client"

type PhotoAttachment = {
  id: number
  title: string
  description: string
  date: string
  location: string
  image: string
}

type Props = {
  photo: PhotoAttachment
  onClose: () => void
}

export default function PhotoEditModal({ photo, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-6">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <h3 className="text-2xl font-bold text-slate-900">
              Fotómelléklet szerkesztése
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              A mezők a jegyzőkönyv végén lévő fotómellékletben jelennek meg.
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Bezárás
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[240px_1fr]">
          <img
            src={photo.image}
            alt={photo.title}
            className="h-56 w-full rounded-2xl object-cover"
          />

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fotó neve / címe
              </label>

              <input
                defaultValue={photo.title}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Leírás
              </label>

              <textarea
                defaultValue={photo.description}
                className="min-h-[110px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Dátum
                </label>

                <input
                  defaultValue={photo.date}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Helyszín / érintett munkarész
                </label>

                <input
                  defaultValue={photo.location}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-5">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-medium hover:bg-slate-50"
          >
            Mégsem
          </button>

          <button
            onClick={onClose}
            className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Mentés
          </button>
        </div>
      </div>
    </div>
  )
}