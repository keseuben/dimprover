"use client"

export default function EditorToolbar() {
  const tools = [
    "Vissza",
    "Újra",
    "Betűtípus",
    "Méret",
    "B",
    "I",
    "U",
    "S",
    "Szövegszín",
    "Kiemelés",
    "Balra",
    "Közép",
    "Jobbra",
    "Felsorolás",
    "Sorszámozás",
    "Táblázat",
    "Fotó hivatkozás",
  ]

  return (
    <div className="border-b border-slate-200 bg-white px-5 py-4">
      <div className="flex flex-wrap gap-2">
        {tools.map((tool) => (
          <button
            key={tool}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
          >
            {tool}
          </button>
        ))}
      </div>
    </div>
  )
}