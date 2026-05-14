export type PhotoAttachment = {
  id: number
  title: string
  description: string
  date: string
  location: string
  image: string
}

export const photoAttachments: PhotoAttachment[] = [
  {
    id: 1,
    title: "Homlokzati repedés – déli oldal",
    description: "A vakolaton több helyen hajszálrepedések láthatók.",
    date: "2026.05.10.",
    location: "Déli homlokzat",
    image:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1200&auto=format&fit=crop",
  },
  {
    id: 2,
    title: "Burkolat fugahiba – 1. emelet",
    description: "A burkolat fugázása több helyen hiányos.",
    date: "2026.05.10.",
    location: "1. emelet – Folyosó",
    image:
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=1200&auto=format&fit=crop",
  },
]