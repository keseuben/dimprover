export default function KooperaciosTemplate() {
  return (
    <>
      <section>
        <h2 className="mb-4 text-2xl font-bold">1. Napirendi pontok</h2>
        <ol className="list-decimal space-y-2 pl-6">
          <li>Előző heti feladatok áttekintése</li>
          <li>Aktuális kivitelezési állapot</li>
          <li>Határidők és felelősök egyeztetése</li>
          <li>Következő heti munkák</li>
        </ol>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">2. Kooperáció összefoglaló</h2>
        <p>
          A heti kooperáció során a résztvevők áttekintették az aktuális
          kivitelezési állapotot, a nyitott műszaki kérdéseket, valamint a
          következő időszak feladatait és határidőit.
        </p>
      </section>
    </>
  )
}