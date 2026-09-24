import { CHARACTERS } from './characters.js';
import { EQUIPMENT } from './equipment.js';

export { CHARACTERS, EQUIPMENT };

export const ITEMS = new Map([...CHARACTERS, ...EQUIPMENT].map((item) => [item.id, item]));

export const SLOTS = ['weapon', 'armor', 'accessory'];

export const BANNERS = [
  {
    id: 'character',
    kind: 'character',
    name: 'Starfall Wish',
    desc: 'Summon new companions to fight (and click) by your side.',
    cost: 300,
    featured: ['akane', 'sera'],
  },
  {
    id: 'weapon',
    kind: 'weapon',
    name: 'Forge of Blades',
    desc: 'Weapons sharpen your clicks and your critical strikes.',
    cost: 150,
    featured: ['homura'],
  },
  {
    id: 'armor',
    kind: 'armor',
    name: "Tailor's Loom",
    desc: 'Armor keeps the gold flowing while you rest.',
    cost: 150,
    featured: ['starlight_dress'],
  },
  {
    id: 'accessory',
    kind: 'accessory',
    name: 'Charm Lantern',
    desc: 'Accessories bring luck: more gold, more crits.',
    cost: 150,
    featured: ['kitsune_mask'],
  },
];

export const BANNER_MAP = new Map(BANNERS.map((b) => [b.id, b]));

// Pool of item ids per banner, grouped by rarity.
export const BANNER_POOLS = new Map(
  BANNERS.map((b) => {
    const pool = { 3: [], 4: [], 5: [] };
    for (const item of ITEMS.values()) if (item.kind === b.kind) pool[item.rarity].push(item.id);
    return [b.id, pool];
  })
);
