export const metadata = {
  title: "Adatvédelmi tájékoztató | DIMPRO",
  description: "A DIMPRO Értekezleti Kísérő adatvédelmi tájékoztatója.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#eef5f3] px-4 py-10 text-slate-800 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-3xl border border-teal-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,118,110,0.12)] sm:p-10">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-teal-700">DIMPRO</div>
        <h1 className="mt-3 text-3xl font-black text-slate-950">Adatvédelmi tájékoztató</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          Ez a tájékoztató a DIMPRO Értekezleti Kísérő teszt- és fejlesztési verziójára vonatkozik.
          A szolgáltatás értekezlethez kapcsolódó adatokat, például napirendi pontokat, jegyzeteket,
          feladatokat, döntéseket és feltöltött mellékleteket kezelhet.
        </p>

        <section className="mt-8 space-y-5 text-sm leading-7">
          <div>
            <h2 className="text-lg font-black text-slate-950">Kezelt adatok</h2>
            <p className="mt-2 text-slate-600">
              A rendszer a működéshez szükséges felhasználói és értekezleti adatokat, továbbá a felhasználók
              által megadott vagy feltöltött tartalmakat kezelheti. A tesztverzióban csak szükséges mértékű
              adatot célszerű használni, érzékeny vagy különleges adat feltöltése nem javasolt.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">Adatkezelés célja</h2>
            <p className="mt-2 text-slate-600">
              Az adatkezelés célja az értekezleti együttműködés, a dokumentálás, a feladat- és döntéskövetés,
              valamint a DIMPRO Teams-integráció működésének tesztelése és fejlesztése.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">Adattovábbítás és hozzáférés</h2>
            <p className="mt-2 text-slate-600">
              Az értekezleti tartalmakhoz kizárólag az adott tesztkörnyezetben engedélyezett felhasználók és
              szolgáltatások férhetnek hozzá. AI-funkció csak külön felhasználói indítással és jóváhagyással fut.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">Megőrzés és törlés</h2>
            <p className="mt-2 text-slate-600">
              A tesztadatok a fejlesztési és ellenőrzési célhoz szükséges ideig őrizhetők meg, majd törölhetők.
              Az alkalmazás éles használata előtt részletes adatmegőrzési, jogosultsági és törlési szabályzat készül.
            </p>
          </div>
        </section>

        <div className="mt-10 border-t border-slate-200 pt-5 text-xs leading-6 text-slate-500">
          Utolsó frissítés: 2026. július 19. · Kapcsolat: DIMPRO – https://dimpro.hu
        </div>
      </article>
    </main>
  );
}
