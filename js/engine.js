/* 경량 물리 엔진: 중력·속도 적분, 타일 AABB 충돌, 카메라 */
const TILE = 32;
const GRAVITY = 1800;
const MAX_FALL = 720;

function tileAt(level, tx, ty) {
  if (tx < 0 || tx >= level.width) return '#'; // 좌우 경계는 벽 취급
  if (ty < 0 || ty >= level.height) return ' '; // 상하는 뚫림(낙사 판정용)
  return level.tiles[ty][tx];
}

function isSolid(ch) { return ch === '#'; }

/* body: {x, y, w, h, vx, vy, onGround} — 축 분리 AABB 충돌 해소 */
function physicsStep(level, b, dt, { gravity = GRAVITY, oneWay = true, maxFall = MAX_FALL } = {}) {
  b.vy = Math.min(b.vy + gravity * dt, maxFall);
  const prevBottom = b.y + b.h;

  // X축 이동/충돌
  b.x += b.vx * dt;
  let ty0 = Math.floor(b.y / TILE), ty1 = Math.floor((b.y + b.h - 0.01) / TILE);
  if (b.vx > 0) {
    const tx = Math.floor((b.x + b.w) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (isSolid(tileAt(level, tx, ty))) { b.x = tx * TILE - b.w - 0.01; b.vx = 0; b.hitWall = true; break; }
    }
  } else if (b.vx < 0) {
    const tx = Math.floor(b.x / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (isSolid(tileAt(level, tx, ty))) { b.x = (tx + 1) * TILE + 0.01; b.vx = 0; b.hitWall = true; break; }
    }
  }

  // Y축 이동/충돌
  b.y += b.vy * dt;
  b.onGround = false;
  const tx0 = Math.floor(b.x / TILE), tx1 = Math.floor((b.x + b.w - 0.01) / TILE);
  if (b.vy > 0) {
    const ty = Math.floor((b.y + b.h) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      const ch = tileAt(level, tx, ty);
      const top = ty * TILE;
      if (isSolid(ch) || (oneWay && ch === '=' && prevBottom <= top + 1)) {
        b.y = top - b.h - 0.01;
        b.vy = 0;
        b.onGround = true;
        break;
      }
    }
  } else if (b.vy < 0) {
    const ty = Math.floor(b.y / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (isSolid(tileAt(level, tx, ty))) { b.y = (ty + 1) * TILE + 0.01; b.vy = 0; break; }
    }
  }
}

/* body가 겹친 타일 중 문자 ch가 있는지 (가시 판정 등) */
function touchesTile(level, b, ch, inset = 4) {
  const tx0 = Math.floor((b.x + inset) / TILE), tx1 = Math.floor((b.x + b.w - inset) / TILE);
  const ty0 = Math.floor((b.y + inset) / TILE), ty1 = Math.floor((b.y + b.h - inset) / TILE);
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++)
      if (tileAt(level, tx, ty) === ch) return true;
  return false;
}

function aabbOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* 부드럽게 따라오는 카메라 (레벨 경계로 클램프) */
class Camera {
  constructor() { this.x = 0; this.y = 0; }
  follow(target, level, viewW, viewH, dt) {
    const goalX = target.x + target.w / 2 - viewW / 2;
    const goalY = target.y + target.h / 2 - viewH / 2;
    const k = 1 - Math.pow(0.001, dt); // 지수 감쇠 러프
    this.x += (goalX - this.x) * k;
    this.y += (goalY - this.y) * k;
    this.x = Math.max(0, Math.min(this.x, level.pixelW - viewW));
    this.y = Math.max(0, Math.min(this.y, level.pixelH - viewH));
    if (level.pixelH <= viewH) this.y = level.pixelH - viewH;
  }
}
