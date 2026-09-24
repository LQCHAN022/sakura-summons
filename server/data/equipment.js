import { art } from './art.js';

// signature: equipping this on the named character boosts the item's stats (see SIGNATURE_BONUS)

export const EQUIPMENT = [
  // ---------------------------------------------------------------- weapons
  {
    id: 'wooden_sword',
    kind: 'weapon',
    name: 'Wooden Sword',
    rarity: 3,
    stats: { click: 2 },
    signature: 'kenta',
    desc: 'A practice bokken, worn smooth from ten thousand swings.',
    art: art(String.raw`
       /\
      |  |
      |  |
      |  |
      |  |
   ___|  |___
  '---.  .---'
      |##|
      |##|
      (__)
`),
    color: '#d4a373',
    glyphs: { '#': '#8b5e34' },
  },
  {
    id: 'kunai',
    kind: 'weapon',
    name: 'Twin Kunai',
    rarity: 3,
    stats: { click: 1, critChance: 0.05 },
    desc: 'Light, sharp and easy to lose. Keep one spare.',
    art: art(String.raw`
  .           .
  |\         /|
   \\       //
    \\     //
     \\   //
      \\ //
       XXX
      // \\
   [==]   [==]
   (O)     (O)
`),
    color: '#c9d1e0',
    glyphs: { '=': '#6c757d', 'O': '#e63946', 'X': '#6c757d' },
  },
  {
    id: 'crescent_staff',
    kind: 'weapon',
    name: 'Crescent Staff',
    rarity: 4,
    stats: { click: 6, goldMult: 0.05 },
    signature: 'luna',
    desc: 'The moon on its tip never quite sets.',
    art: art(String.raw`
       _.-.
     .'  .'   *
    /   /  .
   |   |      *
    \   \_.-'
     '._||_.'
        ||
        ||
        ||
       /__\
`),
    color: '#b8a1ff',
    paint: [[0, 6, 0, 20, '#fff3b0'], [6, 10, 0, 20, '#8d6e63']],
    glyphs: { '*': '#ffffff' },
  },
  {
    id: 'moonlit_katana',
    kind: 'weapon',
    name: 'Moonlit Katana',
    rarity: 4,
    stats: { click: 8, critChance: 0.08 },
    desc: 'Its blade reflects a moon even at noon.',
    art: art(String.raw`
              /|
             / /
            / /
           / /
          / /
         / /
    ____/ /____
    '--/ /----'
      /#/
     /#/
    (_/
`),
    color: '#dfe6f0',
    paint: [[6, 8, 0, 20, '#ffd166'], [8, 11, 0, 20, '#4a4e69']],
    glyphs: { '#': '#9a8c98' },
  },
  {
    id: 'homura',
    kind: 'weapon',
    name: 'Homura, the Crimson Edge',
    rarity: 5,
    stats: { click: 25, critMult: 1.5 },
    signature: 'akane',
    desc: 'A blade forged in a volcano. It is still warm.',
    art: art(String.raw`
    ) (   /\   ) (
   ( ) ) /  \ ( ( )
    ( ( |    | ) )
       )|    |(
        |    |
        |    |
     ___|    |___
    [____    ____]
        |####|
        |####|
        '----'
`),
    color: '#ffb4a2',
    paint: [[0, 4, 0, 20, '#ff7b00'], [6, 8, 0, 20, '#ffd166'], [8, 11, 0, 20, '#9d0208']],
    glyphs: { '|': '#ffe5d9', '/': '#ffe5d9', '\\': '#ffe5d9' },
  },
  // ---------------------------------------------------------------- armor
  {
    id: 'traveler_haori',
    kind: 'armor',
    name: "Traveler's Haori",
    rarity: 3,
    stats: { idle: 1 },
    desc: 'Smells faintly of campfires and rice balls.',
    art: art(String.raw`
    ___      ___
   /   \____/   \
  /  |  \  /  |  \
 /___|   \/   |___\
     |   ||   |
     |   ||   |
     | o || o |
     |___||___|
`),
    color: '#90be6d',
    glyphs: { 'o': '#f9c74f' },
  },
  {
    id: 'leather_guard',
    kind: 'armor',
    name: 'Leather Guard',
    rarity: 3,
    stats: { idle: 0.5, click: 1 },
    desc: 'Scuffed, patched, dependable.',
    art: art(String.raw`
   .-.      .-.
  /   '----'   \
 |  .--------.  |
 |  | o    o |  |
  \ |  ----  | /
   \|  ----  |/
    |  ----  |
    '--------'
`),
    color: '#bc8a5f',
    glyphs: { 'o': '#e9c46a' },
  },
  {
    id: 'shrine_robes',
    kind: 'armor',
    name: 'Shrine Robes',
    rarity: 4,
    stats: { idle: 5, offlineHours: 2 },
    signature: 'rei',
    desc: 'Blessed thread. Offerings seem to find their way to the wearer.',
    art: art(String.raw`
    ____    ____
  .'    \  /    '.
 /  /\   \/   /\  \
|  /  \  ||  /  \  |
|_/    | || |    \_|
       |=||=|
       | || |
      /  ||  \
     /___||___\
`),
    color: '#f8f9fa',
    paint: [[5, 9, 5, 15, '#e63946']],
    glyphs: { '=': '#ffd166' },
  },
  {
    id: 'shinobi_garb',
    kind: 'armor',
    name: 'Shinobi Garb',
    rarity: 4,
    stats: { idle: 2, critChance: 0.07 },
    signature: 'kaito',
    desc: 'Dyed the exact colour of a moonless night.',
    art: art(String.raw`
   _.--------._
  /  \ ~~~~ /  \
 |    \    /    |
 |  |==\  /==|  |
 |  |   \/   |  |
  \_|   ||   |_/
    |###||###|
    |   ||   |
    |___/\___|
`),
    color: '#8d8fb8',
    glyphs: { '~': '#e63946', '#': '#4a4e69', '=': '#c9d1e0' },
  },
  {
    id: 'starlight_dress',
    kind: 'armor',
    name: 'Starlight Stage Dress',
    rarity: 5,
    stats: { idle: 20, goldMult: 0.1 },
    signature: 'sera',
    desc: 'Sewn from the last encore of a falling star.',
    art: art(String.raw`
      .-*-.
     /  |  \
  *  \  |  /  *
      \ | /
    .-'-+-'-.
   /  * | *  \
  /  *  |  *  \
 /  *   |   *  \
'--*----+----*--'
`),
    color: '#ff8fcf',
    glyphs: { '*': '#fff3b0', '+': '#8ee3ff' },
  },
  // ---------------------------------------------------------------- accessories
  {
    id: 'lucky_coin',
    kind: 'accessory',
    name: 'Lucky Coin',
    rarity: 3,
    stats: { goldMult: 0.05 },
    signature: 'hana',
    desc: 'A holed coin on a red string. Money attracts money.',
    art: art(String.raw`
    .-""""-.
  .' .----. '.
 /  /      \  \
|  |   []   |  |
 \  \      /  /
  '. '----' .'
    '-....-'
`),
    color: '#e9c46a',
    glyphs: { '[': '#e63946', ']': '#e63946' },
  },
  {
    id: 'cat_bell',
    kind: 'accessory',
    name: 'Cat Bell',
    rarity: 3,
    stats: { idle: 0.5, offlineHours: 1 },
    signature: 'mimi',
    desc: 'Jingles softly. Somehow makes naps more productive.',
    art: art(String.raw`
     _||_
    ( __ )
   /      \
  |   ()   |
  |  ----  |
   \__/\__/
      ||
`),
    color: '#ffd166',
    paint: [[0, 2, 0, 12, '#e05a6d']],
    glyphs: {},
  },
  {
    id: 'omamori',
    kind: 'accessory',
    name: 'Omamori Charm',
    rarity: 4,
    stats: { goldMult: 0.12 },
    desc: 'A shrine charm for prosperity. Do not open it.',
    art: art(String.raw`
     ,--.
    (    )
   .-'  '-.
   | .--. |
   | |**| |
   | '--' |
   | ~~~~ |
   | ~~~~ |
   '------'
`),
    color: '#e63946',
    paint: [[0, 2, 0, 12, '#ffd166']],
    glyphs: { '*': '#ffd166', '~': '#ffd166' },
  },
  {
    id: 'moon_pendant',
    kind: 'accessory',
    name: 'Moon Pendant',
    rarity: 4,
    stats: { critChance: 0.06, critMult: 0.5 },
    desc: 'Glows brighter just before a lucky strike.',
    art: art(String.raw`
  \          /
   \        /
    \      /
     \    /
      .--.
    .'  .'
   |   (   *
    '.  '.
      '--'
`),
    color: '#fff3b0',
    paint: [[0, 4, 0, 16, '#c9d1e0']],
    glyphs: { '*': '#ffffff' },
  },
  {
    id: 'kitsune_mask',
    kind: 'accessory',
    name: 'Kitsune Mask',
    rarity: 5,
    stats: { goldMult: 0.3, critChance: 0.1 },
    desc: 'Worn by the fox spirit of the mountain shrine. It grins back.',
    art: art(String.raw`
  /\            /\
 /  \.--------./  \
|  / '        ' \  |
| |  \\      //  | |
 \ \  '==  =='  / /
  \   ~~    ~~   /
   '.    /\    .'
     '. (  ) .'
       '-..-'
`),
    color: '#f8f9fa',
    paint: [[0, 3, 0, 20, '#ff6b6b'], [7, 9, 0, 20, '#ff6b6b']],
    glyphs: { '=': '#e63946', '~': '#e63946' },
  },
];
