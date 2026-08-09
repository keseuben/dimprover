export type MaterialCategory = {
  id: string;
  name: string;
  parentId?: string;
  order: number;
  energyRelevant: boolean;
};

export const materialCategories: MaterialCategory[] = [
  { id: "concrete", name: "Betonok és vasbeton", order: 10, energyRelevant: true },
  { id: "masonry", name: "Falazóanyagok", order: 20, energyRelevant: true },
  { id: "aerated-concrete", name: "Pórusbeton", parentId: "masonry", order: 21, energyRelevant: true },
  { id: "calcium-silicate", name: "Mészhomoktégla", parentId: "masonry", order: 22, energyRelevant: true },
  { id: "plaster-mortar", name: "Vakolatok és habarcsok", order: 30, energyRelevant: true },
  { id: "screed", name: "Esztrichek", order: 40, energyRelevant: true },
  { id: "eps", name: "EPS hőszigetelések", order: 50, energyRelevant: true },
  { id: "graphite-eps", name: "Grafitos EPS", parentId: "eps", order: 51, energyRelevant: true },
  { id: "xps", name: "XPS hőszigetelések", order: 60, energyRelevant: true },
  { id: "mineral-wool", name: "Ásványgyapot", order: 70, energyRelevant: true },
  { id: "pir-pur", name: "PIR / PUR", order: 80, energyRelevant: true },
  { id: "wood", name: "Fa és faalapú lapok", order: 90, energyRelevant: true },
  { id: "gypsum", name: "Gipszkarton és gipsztermékek", order: 100, energyRelevant: true },
  { id: "cladding", name: "Burkolatok", order: 110, energyRelevant: true },
  { id: "fill", name: "Feltöltések", order: 120, energyRelevant: true },
  { id: "soil", name: "Talajok", order: 130, energyRelevant: true },
  { id: "air-layer", name: "Légrétegek", order: 140, energyRelevant: true },
  { id: "waterproofing", name: "Vízszigetelések", order: 150, energyRelevant: true },
  { id: "metal", name: "Fémek", order: 160, energyRelevant: true },
  { id: "glass", name: "Üvegek", order: 170, energyRelevant: true },
  { id: "other", name: "Egyéb szerkezeti anyagok", order: 999, energyRelevant: true },
];

export const materialCategoryById = Object.fromEntries(materialCategories.map((category) => [category.id, category]));
