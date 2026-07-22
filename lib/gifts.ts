const SUPABASE_URL = "https://xfmzqphclvakfhezmdie.supabase.co";

export const GIFTS = {
  lion:     { name: "Lion",     price: 500,  file: "lion.mp4" },
  car:      { name: "Car",      price: 1000, file: "car.mp4" },
  dragon:   { name: "Dragon",   price: 800,  file: "dragon.mp4" },
  universe: { name: "Universe", price: 1000, file: "universe.mp4" },
  crown:    { name: "Crown",    price: 200,  file: "crown.gif" },
  heart:    { name: "Heart",    price: 50,   file: "heart.gif" },
  kiss:     { name: "Kiss",     price: 50,   file: "kiss.gif" },
  star:     { name: "Star",     price: 100,  file: "star.gif" },
} as const;

export function getGiftUrl(file: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/gift-animations/${file}`;
}
