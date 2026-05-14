export default function EmlekeztetoTemplate() {
  return (
    <section>
      <h2 className="mb-4 text-2xl font-bold">
        Emlékeztető
      </h2>

      <div className="space-y-6">
        <div>
          <div className="mb-2 font-semibold text-slate-700">
            Tárgy
          </div>

          <p>
            Homlokzati javítások visszaellenőrzése.
          </p>
        </div>

        <div>
          <div className="mb-2 font-semibold text-slate-700">
            Részletek
          </div>

          <p>
            A kivitelező vállalta a déli homlokzaton található
            vakolati repedések javítását. Az elkészült munkák
            visszaellenőrzése szükséges.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="mb-2 font-semibold text-slate-700">
              Felelős
            </div>

            <p>Kivitelező</p>
          </div>

          <div>
            <div className="mb-2 font-semibold text-slate-700">
              Határidő
            </div>

            <p>2026.05.16.</p>
          </div>
        </div>
      </div>
    </section>
  )
}