/* 레벨 데이터 (ASCII 타일맵)
   기호:  # 벽/땅   = 한방향 발판   ^ 가시   P 시작   C 새장(목표)
          w 순찰 적   b 풍선 적   o 코인   공백 빈 칸
   (짧은 행은 파서가 자동으로 빈 칸 패딩)                         */

const LEVEL_MAPS = [
  // ── Round 1: 언덕 너머 첫 구출 ──
  [
    "",
    "",
    "",
    "",
    "                                                    o o",
    "                                                   =====",
    "",
    "",
    "                  o o           b",
    "                 =====                                          C",
    "                                                              ######",
    "       o o",
    "      =====                                              ##",
    "   P            w    ^^^^          w      ^^^^  w     ##",
    "########################################################################",
    "########################################################################",
  ],

  // ── Round 2: 가시 골짜기 — 풍선을 빼앗아 날아라 ──
  [
    "",
    "",
    "                                  o  o  o",
    "                                 =========                              C",
    "                                                                      ######",
    "                                                                    #",
    "         o                                                     o   #",
    "        ===                                                   === #",
    "                          b                 b",
    "            ==   ==   ==   ==   ==   ==   ==   ==   ==",
    "    P",
    "  ######                                                 ##########",
    "       #                                                #",
    "       #                                                #",
    "       ##^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^##",
    "       ##################################################",
  ],

  // ── Round 3: 가시 벌판과 하늘 요새 ──
  [
    "",
    "",
    "                                                                    o o o",
    "                                                                   =======",
    "                                                                               C",
    "                                                                             ######",
    "         o o   b         o o         b       o o                            #",
    "        =====           =====                =====                         #",
    "                                                                          #",
    "   P         w      w         w    ==  ==  ==  ==       w          w  b  #",
    "########################^^^^####^^^^^^^^^^^^^^^^^^^^##########^^^^######################",
    "########################################################################################",
  ],
];

function parseLevel(map) {
  const height = map.length;
  const width = Math.max(...map.map((r) => r.length));
  const tiles = [];
  const enemies = [];
  const coins = [];
  let playerStart = { x: 64, y: 64 };
  let cage = null;

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const ch = map[y][x] || ' ';
      const px = x * TILE, py = y * TILE;
      switch (ch) {
        case '#': case '=': case '^':
          row.push(ch);
          continue;
        case 'P': playerStart = { x: px + 4, y: py }; break;
        case 'C': cage = { x: px, y: py }; break;
        case 'w': enemies.push({ type: 'walker', x: px, y: py }); break;
        case 'b': enemies.push({ type: 'flyer', x: px, y: py }); break;
        case 'o': coins.push({ x: px + TILE / 2, y: py + TILE / 2, taken: false }); break;
      }
      row.push(' ');
    }
    tiles.push(row);
  }
  return { tiles, width, height, playerStart, cage, enemies, coins,
           pixelW: width * TILE, pixelH: height * TILE };
}
