const documents = [
  {
    name: "Jelenlegi ütemterv – 2026.05.10.xlsx",
    type: "XLSX",
    size: "245 KB",
  },
  {
    name: "Tervezett ütemterv – v2.pdf",
    type: "PDF",
    size: "1.2 MB",
  },
  {
    name: "Földszinti alaprajz.pdf",
    type: "PDF",
    size: "2.4 MB",
  },
]

export default function DocumentsPanel() {
  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">
          Dokumentum mellékletek
        </h3>

        <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50">
          Dokumentum hozzáadása
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <table className="w-full min-w-[360px] text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">
                Fájlnév
              </th>

              <th className="px-4 py-2 text-left font-semibold">
                Típus
              </th>

              <th className="px-4 py-2 text-left font-semibold">
                Méret
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200 bg-white">
            {documents.map((doc) => (
              <tr key={doc.name}>
                <td className="px-4 py-2 font-medium text-blue-700">
                  {doc.name}
                </td>

                <td className="px-4 py-2 text-slate-600">
                  {doc.type}
                </td>

                <td className="px-4 py-2 text-slate-500">
                  {doc.size}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}