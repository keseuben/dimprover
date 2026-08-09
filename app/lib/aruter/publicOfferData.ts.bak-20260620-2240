export type AruterPublicProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  price: number;
  unit: string;
  stockStatus: "in_stock" | "limited" | "out_of_stock";
  imageTone: "flower" | "evergreen" | "soil" | "mulch" | "lavender" | "pot";
};

export type AruterPickupSlot = {
  id: string;
  label: string;
  available: boolean;
};

export type AruterBusinessProfile = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  publicUrl: string;
  address: string;
  phone: string;
  email: string;
  openingHours: Array<{ label: string; value: string }>;
  categories: string[];
  pickupSlots: AruterPickupSlot[];
  products: AruterPublicProduct[];
};

export const aruterDemoBusiness: AruterBusinessProfile = {
  id: "business-kovacs-kerteszet",
  slug: "kovacs-kerteszet",
  name: "Kovács Kertészet",
  tagline: "Minőségi növények szeretettel.",
  description: "Saját digitális ajánlatoldal online foglalással, előkészítéssel és személyes átvétellel.",
  publicUrl: "aruter.hu/kovacskerteszet",
  address: "6723 Szeged, Kertész utca 12.",
  phone: "+36 30 123 4567",
  email: "info@kovacskerteszet.hu",
  openingHours: [
    { label: "Hétfő–Péntek", value: "07:00 – 18:00" },
    { label: "Szombat", value: "08:00 – 14:00" },
    { label: "Vasárnap", value: "Zárva" },
  ],
  categories: ["Virágok", "Örökzöldek", "Föld és mulcs", "Akciók"],
  pickupSlots: [
    { id: "slot-0900", label: "09:00", available: true },
    { id: "slot-1100", label: "11:00", available: true },
    { id: "slot-1330", label: "13:30", available: true },
    { id: "slot-1500", label: "15:00", available: true },
  ],
  products: [
    { id: "offer-001", slug: "muskatli", name: "Muskátli", description: "Piros, álló", category: "Virágok", price: 990, unit: "db", stockStatus: "in_stock", imageTone: "flower" },
    { id: "offer-002", slug: "leylandi-ciprus", name: "Leylandi ciprus", description: "120–140 cm", category: "Örökzöldek", price: 2490, unit: "db", stockStatus: "in_stock", imageTone: "evergreen" },
    { id: "offer-003", slug: "viragfold", name: "Virágföld", description: "50 liter", category: "Föld és mulcs", price: 1590, unit: "zsák", stockStatus: "in_stock", imageTone: "soil" },
    { id: "offer-004", slug: "mulcs", name: "Mulcs", description: "60 liter", category: "Föld és mulcs", price: 1190, unit: "zsák", stockStatus: "in_stock", imageTone: "mulch" },
    { id: "offer-005", slug: "levendula", name: "Levendula", description: "14 cm-es cserép", category: "Virágok", price: 1290, unit: "db", stockStatus: "in_stock", imageTone: "lavender" },
    { id: "offer-006", slug: "kaspo", name: "Kaspó", description: "Kerámia, bézs", category: "Akciók", price: 2190, unit: "db", stockStatus: "limited", imageTone: "pot" },
  ],
};

export const aruterTodayPreparations = [
  { id: "prep-001", customerName: "Nagy Anna", itemCount: 2, pickupTime: "09:00", status: "Előkészítés alatt" },
  { id: "prep-002", customerName: "Tóth Péter", itemCount: 3, pickupTime: "11:00", status: "Előkészítés alatt" },
  { id: "prep-003", customerName: "Kiss Éva", itemCount: 1, pickupTime: "13:30", status: "Előkészítés alatt" },
];
