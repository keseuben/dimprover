export default function HibajegyzekTemplate() {
  return (
    <>
      <section>
        <h2 className="mb-4 text-2xl font-bold">
          1. Hibák és hiányosságok
        </h2>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-3 py-2 text-left">
                Sorszám
              </th>

              <th className="border border-slate-300 px-3 py-2 text-left">
                Hiba leírása
              </th>

              <th className="border border-slate-300 px-3 py-2 text-left">
                Helyszín
              </th>

              <th className="border border-slate-300 px-3 py-2 text-left">
                Felelős
              </th>

              <th className="border border-slate-300 px-3 py-2 text-left">
                Határidő
              </th>

              <th className="border border-slate-300 px-3 py-2 text-left">
                Állapot
              </th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td className="border border-slate-300 px-3 py-2">
                1.
              </td>

              <td className="border border-slate-300 px-3 py-2">
                Homlokzati vakolat repedés javítása
              </td>

              <td className="border border-slate-300 px-3 py-2">
                Déli homlokzat
              </td>

              <td className="border border-slate-300 px-3 py-2">
                Kivitelező
              </td>

              <td className="border border-slate-300 px-3 py-2">
                2026.05.14.
              </td>

              <td className="border border-slate-300 px-3 py-2">
                Nyitott
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </>
  )
}