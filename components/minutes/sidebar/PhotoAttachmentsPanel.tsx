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
  photos: PhotoAttachment[]
  onEdit: (photo: PhotoAttachment) => void
}

export default function PhotoAttachmentsPanel({
  photos,
  onEdit,
}: Props) {
  return (
    <div className="border-b border-slate-200 p-6">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">
          Fotómellékletek
        </h3>

        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50">
          Fotó hozzáadása
        </button>
      </div>

      <div className="space-y-3">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
          >
            <div className="flex gap-3">
              <div className="relative shrink-0">
                <img
                  src={photo.image}
                  alt={photo.title}
                  className="h-24 w-32 rounded-xl object-cover"
                />

                <div className="absolute left-2 top-2 rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white">
                  {photo.id}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-sm font-bold text-slate-900">
                  {photo.title}
                </div>

                <dl className="mt-2 space-y-1 text-xs text-slate-600">
                  <div className="grid grid-cols-[72px_1fr] gap-2">
                    <dt className="font-semibold text-slate-500">
                      Leírás:
                    </dt>

                    <dd className="line-clamp-2">
                      {photo.description}
                    </dd>
                  </div>

                  <div className="grid grid-cols-[72px_1fr] gap-2">
                    <dt className="font-semibold text-slate-500">
                      Dátum:
                    </dt>

                    <dd>{photo.date}</dd>
                  </div>

                  <div className="grid grid-cols-[72px_1fr] gap-2">
                    <dt className="font-semibold text-slate-500">
                      Helyszín:
                    </dt>

                    <dd className="line-clamp-1">
                      {photo.location}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => onEdit(photo)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium hover:bg-slate-50"
              >
                Szerkesztés
              </button>

              <button className="rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">
                Törlés
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}