export const metadata = {
  title: "Felhasználási feltételek | DIMPRO",
  description: "A DIMPRO Értekezleti Kísérő felhasználási feltételei.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#eef5f3] px-4 py-10 text-slate-800 sm:px-6">
      <article className="mx-auto max-w-3xl rounded-3xl border border-teal-200 bg-white p-6 shadow-[0_24px_70px_rgba(15,118,110,0.12)] sm:p-10">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-teal-700">DIMPRO</div>
        <h1 className="mt-3 text-3xl font-black text-slate-950">Felhasználási feltételek</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          A DIMPRO Értekezleti Kísérő jelenleg teszt- és fejlesztési fázisban lévő alkalmazás. A használat célja
          a Teams-integráció, az értekezleti munkafolyamatok és a kapcsolódó desktop funkciók ellenőrzése.
        </p>

        <section className="mt-8 space-y-5 text-sm leading-7">
          <div>
            <h2 className="text-lg font-black text-slate-950">Engedélyezett használat</h2>
            <p className="mt-2 text-slate-600">
              Az alkalmazás kizárólag az arra jogosult tesztfelhasználók, meghívott résztvevők és szervezők
              számára használható. A hozzáférési adatok, tokenek és belépési információk továbbadása tilos.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">Tesztverzió</h2>
            <p className="mt-2 text-slate-600">
              A funkciók módosulhatnak, átmenetileg nem működhetnek, illetve tesztadatok törölhetők. A jelenlegi
              verzió nem minősül végleges, üzemszerűen garantált szolgáltatásnak.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">Feltöltött tartalmak</h2>
            <p className="mt-2 text-slate-600">
              A felhasználó felel azért, hogy az általa feltöltött dokumentumokhoz és képekhez megfelelő
              jogosultsággal rendelkezzen, és azok ne sértsenek jogszabályt vagy harmadik fél jogát.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">Biztonság</h2>
            <p className="mt-2 text-slate-600">
              Biztonsági vagy működési hiba észlelésekor a hozzáférés korlátozható, a tesztalkalmazás frissíthető
              vagy eltávolítható. Éles bevezetés előtt külön végleges szolgáltatási és támogatási feltételek készülnek.
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
