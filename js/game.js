/* Kiwi Story — 게임 본체: 엔티티, 상태, 루프, 렌더링 */
(() => {
  const VERSION = 'v4';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ── 화면 스케일 ──
  const LOGICAL_MIN = 416; // 짧은 축에 보이는 논리 픽셀(13타일)
  let scale = 1, viewW = 0, viewH = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    scale = (Math.min(canvas.width, canvas.height) / LOGICAL_MIN);
    viewW = canvas.width / scale;
    viewH = canvas.height / scale;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── 게임 상태 ──
  const G = {
    state: 'title', // title | play | clear | gameover | ending
    levelIndex: 0,
    score: 0,
    lives: 3,
    timer: 0,
    level: null,
    rescued: false,
  };

  const cam = new Camera();
  let player, walkers, flyers, balloons, arrows, particles, coins, cageRect;

  function loadLevel(i) {
    G.level = parseLevel(LEVEL_MAPS[i]);
    G.rescued = false;
    coins = G.level.coins.map((c) => ({ ...c }));
    walkers = [];
    flyers = [];
    balloons = [];
    arrows = [];
    particles = [];
    for (const e of G.level.enemies) {
      if (e.type === 'walker') walkers.push({ x: e.x, y: e.y, w: 26, h: 24, vx: -60, vy: 0, anim: 0 });
      else flyers.push({ baseX: e.x, baseY: e.y, x: e.x, y: e.y, w: 24, h: 22, phase: Math.random() * 6.28, alive: true, falling: false, vy: 0 });
    }
    const c = G.level.cage;
    cageRect = c ? { x: c.x - 4, y: c.y - 8, w: 40, h: 40 } : null;
    spawnPlayer();
    cam.x = player.x - viewW / 2;
    cam.y = player.y - viewH / 2;
  }

  function spawnPlayer() {
    const s = G.level.playerStart;
    player = {
      x: s.x, y: s.y, w: 22, h: 26, vx: 0, vy: 0,
      onGround: false, facing: 1, riding: null, canAirJump: true,
      invuln: 2, shootCd: 0, boardCd: 0, anim: 0,
    };
  }

  function hurtPlayer() {
    if (player.invuln > 0) return;
    Sfx.hurt();
    burst(player.x + 11, player.y + 13, '#fff');
    G.lives--;
    if (G.lives <= 0) {
      G.state = 'gameover';
      G.timer = 0;
    } else {
      if (player.riding) { player.riding.popped = true; }
      spawnPlayer();
    }
  }

  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = 60 + Math.random() * 160;
      particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.5 + Math.random() * 0.3, color });
    }
  }

  function popBalloon(b) {
    b.popped = true;
    Sfx.pop();
    burst(b.x + b.w / 2, b.y + b.h / 2, '#ff6b81', 14);
    if (player.riding === b) { player.riding = null; player.canAirJump = true; }
  }

  // ── 업데이트 ──
  function update(dt) {
    if (G.state === 'title' || G.state === 'gameover' || G.state === 'ending') {
      G.timer += dt;
      if (G.timer > 0.6 && Input.consumeAnyPress()) {
        G.levelIndex = 0; G.score = 0; G.lives = 3;
        loadLevel(0);
        G.state = 'play';
      }
      return;
    }
    if (G.state === 'clear') {
      G.timer += dt;
      updateParticles(dt);
      if (G.timer > 2.5) {
        G.levelIndex++;
        if (G.levelIndex >= LEVEL_MAPS.length) { G.state = 'ending'; G.timer = 0; }
        else { loadLevel(G.levelIndex); G.state = 'play'; }
      }
      return;
    }

    const inp = Input.state;
    const L = G.level;
    player.anim += dt;
    player.invuln = Math.max(0, player.invuln - dt);
    player.shootCd = Math.max(0, player.shootCd - dt);
    player.boardCd = Math.max(0, player.boardCd - dt);

    // ── 플레이어 이동 ──
    if (player.riding && !player.riding.popped) {
      // 풍선 비행: 부력 + 점프 버튼으로 상승
      const b = player.riding;
      b.vy += (inp.jump ? -750 : 320) * dt;
      b.vy = Math.max(-190, Math.min(150, b.vy));
      const ax = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      b.vx += ax * 480 * dt;
      b.vx *= Math.pow(0.25, dt); // 공기 저항
      b.vx = Math.max(-160, Math.min(160, b.vx));
      if (ax) player.facing = ax;
      physicsStep(L, b, dt, { gravity: 0, oneWay: false });
      if (b.y < -TILE) { b.y = -TILE; b.vy = Math.max(0, b.vy); }
      // 플레이어는 풍선에 매달림
      player.x = b.x + b.w / 2 - player.w / 2;
      player.y = b.y + b.h + 4;
      player.vx = b.vx; player.vy = b.vy;
      b.rideTime = (b.rideTime || 0) + dt;
      if (touchesTile(L, b, '^', 6) || b.rideTime > 14) popBalloon(b);
      if (inp.down) { b.homeY = b.y; player.riding = null; player.vy = 40; player.boardCd = 0.6; player.canAirJump = true; } // 키보드: 내려서 하차
    } else {
      player.riding = null;
      const ax = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (ax) player.facing = ax;
      const target = ax * 200;
      const accel = player.onGround ? 1800 : 1100;
      if (player.vx < target) player.vx = Math.min(target, player.vx + accel * dt);
      else if (player.vx > target) player.vx = Math.max(target, player.vx - accel * dt);

      if (Input.justPressed('jump')) {
        if (player.onGround) {
          player.vy = -520;
          Sfx.jump();
        } else if (player.canAirJump) {
          // 2단 점프: 공중에서 한 번만, 착지해야 다시 충전
          player.vy = -500;
          player.canAirJump = false;
          Sfx.airJump();
          burst(player.x + player.w / 2, player.y + player.h, '#ffffff', 6);
        }
      }
      // 가변 점프: 상승 중 버튼 유지 시 중력 감소 (원작의 "누른 만큼 점프")
      const g = (inp.jump && player.vy < 0) ? GRAVITY * 0.52 : GRAVITY;
      physicsStep(L, player, dt, { gravity: g });
      if (player.onGround) player.canAirJump = true;

      // 자유 풍선 탑승
      for (const b of balloons) {
        if (player.boardCd <= 0 && !b.popped && aabbOverlap(player, b)) {
          player.riding = b;
          b.vy = -40; b.rideTime = 0;
          Sfx.board();
          break;
        }
      }
    }

    // ── 발사 ──
    if (Input.justPressed('shoot') && player.shootCd <= 0) {
      player.shootCd = 0.34;
      Sfx.shoot();
      arrows.push({
        x: player.x + player.w / 2 + player.facing * 10, y: player.y + 9,
        w: 16, h: 5, vx: player.facing * 520, life: 1.2,
      });
    }

    // ── 화살 ──
    for (const a of arrows) {
      a.x += a.vx * dt;
      a.life -= dt;
      const tipX = a.vx > 0 ? a.x + a.w : a.x;
      if (isSolid(tileAt(L, Math.floor(tipX / TILE), Math.floor((a.y + 2) / TILE)))) a.life = 0;
      for (const w of walkers) {
        if (w.dead) continue;
        if (aabbOverlap(a, w)) {
          w.dead = true; a.life = 0; G.score += 100;
          Sfx.hit(); burst(w.x + 13, w.y + 12, '#7ed17e');
        }
      }
      for (const f of flyers) {
        if (!f.alive || f.falling) continue;
        const hit = { x: f.x, y: f.y - 26, w: f.w, h: f.h + 26 }; // 풍선 포함 판정
        if (aabbOverlap(a, hit)) {
          a.life = 0; G.score += 100;
          f.falling = true; f.vy = -80;
          Sfx.hit();
          // 적이 떨어지고 빈 풍선이 그 자리에 남는다
          balloons.push({ x: f.x - 1, y: f.y - 30, w: 26, h: 28, vx: 0, vy: -20,
                          homeY: f.y - 44, phase: Math.random() * 6.28, popped: false });
        }
      }
    }
    arrows = arrows.filter((a) => a.life > 0);

    // ── 순찰 적 ──
    for (const w of walkers) {
      if (w.dead) continue;
      w.anim += dt;
      w.hitWall = false;
      physicsStep(L, w, dt);
      // 벽 또는 낭떠러지에서 방향 전환
      const aheadX = w.vx > 0 ? w.x + w.w + 2 : w.x - 2;
      const footTile = tileAt(L, Math.floor(aheadX / TILE), Math.floor((w.y + w.h + 4) / TILE));
      const bodyTile = tileAt(L, Math.floor(aheadX / TILE), Math.floor((w.y + w.h - 6) / TILE));
      if (w.hitWall || bodyTile === '^' ||
          (w.onGround && !isSolid(footTile) && footTile !== '=')) {
        w.vx = -Math.sign(w.vx || 1) * 60;
      }
      if (player.invuln <= 0 && !player.riding && aabbOverlap(player, w)) hurtPlayer();
    }

    // ── 풍선 적 ──
    for (const f of flyers) {
      if (!f.alive) {
        // 잠시 후 제자리에서 리스폰 (풍선 공급이 끊기지 않도록)
        f.respawn -= dt;
        if (f.respawn <= 0) { f.alive = true; f.falling = false; f.phase = 0; f.x = f.baseX; f.y = f.baseY; }
        continue;
      }
      if (f.falling) {
        f.vy += GRAVITY * dt;
        f.y += f.vy * dt;
        if (f.y > L.pixelH + 100) { f.alive = false; f.respawn = 7; }
      } else {
        f.phase += dt;
        f.x = f.baseX + Math.sin(f.phase * 0.8) * 52;
        f.y = f.baseY + Math.sin(f.phase * 1.3) * 20;
        const hit = { x: f.x, y: f.y - 24, w: f.w, h: f.h + 24 };
        if (player.invuln <= 0 && aabbOverlap(player.riding ? player.riding : player, hit)) {
          if (player.riding) popBalloon(player.riding);
          else hurtPlayer();
        }
      }
    }

    // ── 자유 풍선 ──
    for (const b of balloons) {
      if (b.popped || player.riding === b) continue;
      b.phase += dt;
      // 격추 지점 높이(homeY) 근처에서 둥둥 떠 있기
      b.vy = Math.max(-50, Math.min(50, (b.homeY - b.y) * 2)) + Math.sin(b.phase * 1.6) * 12;
      b.vx = Math.sin(b.phase * 0.9) * 14;
      physicsStep(L, b, dt, { gravity: 0, oneWay: false });
      if (b.y < 0) b.y = 0;
      if (touchesTile(L, b, '^', 6)) popBalloon(b);
    }
    balloons = balloons.filter((b) => !b.popped);

    // ── 가시 / 낙사 ──
    if (!player.riding) {
      if (player.invuln <= 0 && touchesTile(L, player, '^', 5)) hurtPlayer();
    }
    if (player.y > L.pixelH + 80) { player.invuln = 0; hurtPlayer(); }

    // ── 코인 ──
    for (const c of coins) {
      if (c.taken) continue;
      const cr = { x: c.x - 10, y: c.y - 10, w: 20, h: 20 };
      if (aabbOverlap(player, cr)) {
        c.taken = true; G.score += 50; Sfx.coin();
        burst(c.x, c.y, '#ffd24a', 6);
      }
    }

    // ── 구출(목표) ──
    if (cageRect && aabbOverlap(player, cageRect)) {
      G.rescued = true;
      G.score += 1000;
      Sfx.rescue();
      burst(cageRect.x + 20, cageRect.y + 20, '#ffe08a', 20);
      G.state = 'clear';
      G.timer = 0;
    }

    updateParticles(dt);

    const focus = player.riding || player;
    cam.follow(focus, L, viewW, viewH, dt);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  // ── 그리기 ──
  function draw() {
    const cw = canvas.width, chh = canvas.height;

    // 하늘 배경
    const sky = ctx.createLinearGradient(0, 0, 0, chh);
    sky.addColorStop(0, '#57b8ec');
    sky.addColorStop(0.7, '#a8dcf5');
    sky.addColorStop(1, '#d8f0fb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cw, chh);

    if (G.level) {
      drawSun();
      drawClouds();
      ctx.save();
      ctx.scale(scale, scale);
      ctx.translate(-cam.x, -cam.y);
      drawHills();
      drawTiles();
      drawHints();
      drawCage();
      for (const c of coins) if (!c.taken) drawCoin(c);
      for (const w of walkers) if (!w.dead) drawWalker(w);
      for (const f of flyers) if (f.alive) drawFlyer(f);
      for (const b of balloons) if (b !== player.riding) drawBalloon(b.x, b.y, b.w, b.h);
      drawPlayer();
      for (const a of arrows) drawArrow(a);
      for (const p of particles) {
        ctx.globalAlpha = Math.min(1, p.life * 2.5);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    drawHUD();
  }

  function drawSun() {
    ctx.save();
    ctx.scale(scale, scale);
    const sx = viewW - 84, sy = 88;
    ctx.fillStyle = 'rgba(255,236,150,.35)';
    ctx.beginPath(); ctx.arc(sx, sy, 58, 0, 6.29); ctx.fill();
    ctx.fillStyle = 'rgba(255,236,150,.5)';
    ctx.beginPath(); ctx.arc(sx, sy, 44, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#ffe89a';
    ctx.beginPath(); ctx.arc(sx, sy, 32, 0, 6.29); ctx.fill();
    ctx.restore();
  }

  function drawHills() {
    // 레벨 바닥선에 맞춰 그려지는 멀리 있는 언덕
    const L = G.level;
    const baseY = L.pixelH + 70;
    if (baseY - cam.y > viewH + 260 || baseY - cam.y < -40) return;
    const cols = ['rgba(140,205,125,.55)', 'rgba(110,185,110,.45)'];
    for (let k = -1; k < Math.ceil(L.pixelW / 260) + 1; k++) {
      const hx = k * 260 + ((k % 2) ? 90 : 0);
      ctx.fillStyle = cols[Math.abs(k) % 2];
      ctx.beginPath();
      ctx.ellipse(hx, baseY, 190, (k % 2) ? 130 : 170, 0, 0, 6.29);
      ctx.fill();
    }
  }

  function drawClouds() {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    const par = 0.35;
    for (let i = 0; i < 8; i++) {
      const cx = ((i * 460 + 130 - cam.x * par) % (viewW + 300)) - 150 + (i % 2) * 60;
      const cy = 50 + (i % 4) * 85 - cam.y * 0.15;
      ctx.beginPath(); ctx.ellipse(cx, cy, 52, 18, 0, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx + 30, cy - 10, 34, 15, 0, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.ellipse(cx - 32, cy - 6, 28, 12, 0, 0, 6.29); ctx.fill();
    }
    ctx.restore();
  }

  function drawTiles() {
    const L = G.level;
    const tx0 = Math.max(0, Math.floor(cam.x / TILE));
    const tx1 = Math.min(L.width - 1, Math.ceil((cam.x + viewW) / TILE));
    const ty0 = Math.max(0, Math.floor(cam.y / TILE));
    const ty1 = Math.min(L.height - 1, Math.ceil((cam.y + viewH) / TILE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ch = L.tiles[ty][tx];
        const x = tx * TILE, y = ty * TILE;
        if (ch === '#') {
          ctx.fillStyle = '#c68a53';
          ctx.fillRect(x, y, TILE, TILE);
          // 흙 알갱이 점무늬 (타일 좌표 기반 고정 패턴)
          ctx.fillStyle = '#b3763f';
          const h = (tx * 53 + ty * 31) % 4;
          ctx.beginPath(); ctx.arc(x + 8 + h * 3, y + 12, 2.5, 0, 6.29); ctx.fill();
          ctx.beginPath(); ctx.arc(x + 22 - h * 2, y + 24, 2, 0, 6.29); ctx.fill();
          if (tileAt(L, tx, ty - 1) !== '#') { // 윗면 잔디
            ctx.fillStyle = '#6ecf5a';
            ctx.fillRect(x, y, TILE, 9);
            ctx.fillStyle = '#8ce878';
            ctx.fillRect(x, y, TILE, 4);
            // 장식: 꽃 / 풀잎 (위 칸이 비어 있을 때만)
            const d = (tx * 37 + ty * 17) % 8;
            const airAbove = tileAt(L, tx, ty - 1) === ' ';
            if (airAbove && d < 2) { // 꽃
              const fx = x + 10 + (d ? 12 : 0);
              ctx.strokeStyle = '#4aa53c'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(fx, y + 2); ctx.lineTo(fx, y - 8); ctx.stroke();
              ctx.fillStyle = d ? '#ffd24a' : '#ff9ec5';
              ctx.beginPath(); ctx.arc(fx, y - 11, 4.5, 0, 6.29); ctx.fill();
              ctx.fillStyle = '#fff';
              ctx.beginPath(); ctx.arc(fx, y - 11, 1.8, 0, 6.29); ctx.fill();
            } else if (airAbove && d === 2) { // 풀잎
              ctx.strokeStyle = '#4aa53c'; ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(x + 12, y + 2); ctx.lineTo(x + 9, y - 7);
              ctx.moveTo(x + 17, y + 2); ctx.lineTo(x + 17, y - 9);
              ctx.moveTo(x + 22, y + 2); ctx.lineTo(x + 25, y - 6);
              ctx.stroke();
            }
          }
        } else if (ch === '=') {
          ctx.fillStyle = '#e2a55e';
          ctx.beginPath(); ctx.roundRect(x, y + 2, TILE, 11, 5); ctx.fill();
          ctx.fillStyle = '#f4c286';
          ctx.beginPath(); ctx.roundRect(x, y + 2, TILE, 5, 4); ctx.fill();
          ctx.fillStyle = '#bd8342';
          ctx.beginPath(); ctx.arc(x + 9, y + 9, 1.8, 0, 6.29); ctx.arc(x + 24, y + 9, 1.8, 0, 6.29); ctx.fill();
        } else if (ch === '^') {
          ctx.fillStyle = '#c3c9d6';
          ctx.beginPath();
          ctx.moveTo(x, y + TILE);
          ctx.lineTo(x + 8, y + 6);
          ctx.lineTo(x + 16, y + TILE);
          ctx.lineTo(x + 24, y + 6);
          ctx.lineTo(x + TILE, y + TILE);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x + 8, y + 8, 1.6, 0, 6.29); ctx.arc(x + 24, y + 8, 1.6, 0, 6.29); ctx.fill();
        }
      }
    }
  }

  function drawHints() {
    if (G.levelIndex !== 0 || G.state !== 'play') return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(30,60,90,.55)';
    ctx.fillStyle = '#fff';
    const line = (text, x, y) => { ctx.strokeText(text, x, y); ctx.fillText(text, x, y); };
    line('◀▶ 이동 · A 점프 (공중에서 한 번 더!)', 250, 360);
    line('B 발사', 250, 382);
    line('풍선 탄 적을 B로 쏘면 빈 풍선이 남아요', 1030, 150);
    line('빈 풍선에 닿으면 탑승! A로 상승 🎈', 1030, 172);
    ctx.restore();
  }

  function drawKiwiBody(x, y, facing, hop, isFriend) {
    // x,y = 중심 하단 기준
    ctx.save();
    ctx.translate(x, y - hop);
    ctx.scale(facing, 1);
    // 발
    ctx.fillStyle = '#f5a623';
    ctx.fillRect(-7, -3, 5, 4);
    ctx.fillRect(2, -3, 5, 4);
    // 몸통
    ctx.fillStyle = isFriend ? '#b9855c' : '#8b5a2b';
    ctx.beginPath();
    ctx.ellipse(0, -14, 11, 12, 0, 0, 6.29);
    ctx.fill();
    // 배
    ctx.fillStyle = isFriend ? '#e8cba8' : '#d9b27c';
    ctx.beginPath();
    ctx.ellipse(2, -11, 6, 7, 0, 0, 6.29);
    ctx.fill();
    // 부리 (키위의 긴 부리)
    ctx.fillStyle = '#f5a623';
    ctx.beginPath();
    ctx.moveTo(8, -20);
    ctx.lineTo(22, -16);
    ctx.lineTo(8, -15);
    ctx.closePath();
    ctx.fill();
    // 눈
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(5, -21, 3.8, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(6, -21, 2, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(6.8, -21.8, 0.8, 0, 6.29); ctx.fill();
    // 볼터치
    ctx.fillStyle = 'rgba(255,120,145,.4)';
    ctx.beginPath(); ctx.arc(2, -16.5, 2.6, 0, 6.29); ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    if (player.invuln > 0 && Math.floor(player.anim * 12) % 2 === 0 && G.state === 'play') return;
    const hop = player.onGround && Math.abs(player.vx) > 20 ? Math.abs(Math.sin(player.anim * 14)) * 3 : 0;
    if (player.riding) drawBalloon(player.riding.x, player.riding.y, player.riding.w, player.riding.h, true);
    drawKiwiBody(player.x + player.w / 2, player.y + player.h, player.facing, hop, false);
  }

  function drawBalloon(x, y, w, h, ridden = false) {
    const cx = x + w / 2, cy = y + h / 2 - 4;
    ctx.strokeStyle = 'rgba(80,60,40,.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 10);
    ctx.lineTo(cx, y + h + (ridden ? 8 : 4));
    ctx.stroke();
    ctx.fillStyle = '#ff5d73';
    ctx.beginPath();
    ctx.ellipse(cx, cy, w / 2, h / 2 - 2, 0, 0, 6.29);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy - 5, 4, 6, -0.5, 0, 6.29);
    ctx.fill();
    // 매듭
    ctx.fillStyle = '#e0475e';
    ctx.beginPath();
    ctx.moveTo(cx - 4, y + h - 6);
    ctx.lineTo(cx + 4, y + h - 6);
    ctx.lineTo(cx, y + h - 11);
    ctx.closePath();
    ctx.fill();
  }

  function drawWalker(w) {
    const cx = w.x + w.w / 2, by = w.y + w.h;
    const squash = 1 + Math.sin(w.anim * 10) * 0.06;
    ctx.save();
    ctx.translate(cx, by);
    ctx.scale(Math.sign(w.vx) || 1, 1);
    ctx.fillStyle = '#4f86c6';
    ctx.beginPath();
    ctx.ellipse(0, -11 * squash, 13, 11 * squash, 0, 0, 6.29);
    ctx.fill();
    ctx.fillStyle = '#3a6ca8';
    ctx.beginPath();
    ctx.ellipse(-9, -6, 5, 4, 0.6, 0, 6.29); // 꼬리지느러미
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(6, -14, 3.4, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(7, -14, 1.7, 0, 6.29); ctx.fill();
    // 수염
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, -10); ctx.lineTo(15, -11);
    ctx.moveTo(10, -8); ctx.lineTo(15, -8);
    ctx.stroke();
    // 볼터치
    ctx.fillStyle = 'rgba(255,140,160,.45)';
    ctx.beginPath(); ctx.arc(3, -9, 2.4, 0, 6.29); ctx.fill();
    ctx.restore();
  }

  function drawFlyer(f) {
    if (!f.falling) drawBalloon(f.x - 1, f.y - 28, 26, 26);
    const cx = f.x + f.w / 2, by = f.y + f.h;
    ctx.save();
    ctx.translate(cx, by);
    ctx.fillStyle = '#9b6fc9';
    ctx.beginPath();
    ctx.ellipse(0, -10, 11, 10, 0, 0, 6.29);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-4, -12, 3, 0, 6.29); ctx.arc(4, -12, 3, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-3, -12, 1.5, 0, 6.29); ctx.arc(5, -12, 1.5, 0, 6.29); ctx.fill();
    // 볼터치와 작은 발
    ctx.fillStyle = 'rgba(255,150,170,.5)';
    ctx.beginPath(); ctx.arc(-7, -8, 2, 0, 6.29); ctx.arc(9, -8, 2, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#f5a623';
    ctx.fillRect(-6, -2, 4, 3);
    ctx.fillRect(2, -2, 4, 3);
    ctx.restore();
  }

  function drawArrow(a) {
    ctx.save();
    ctx.translate(a.x, a.y + 2);
    ctx.scale(Math.sign(a.vx), 1);
    ctx.fillStyle = '#7a4a1e';
    ctx.fillRect(0, -1.5, 13, 3);
    ctx.fillStyle = '#dfe3e8';
    ctx.beginPath();
    ctx.moveTo(13, -4); ctx.lineTo(19, 0); ctx.lineTo(13, 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawCoin(c) {
    const t = performance.now() / 1000;
    const sx = Math.abs(Math.sin(t * 4 + c.x));
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(Math.max(0.15, sx), 1);
    ctx.fillStyle = '#ffd24a';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#e0a92b';
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, 6.29); ctx.fill();
    ctx.restore();
    // 반짝임
    const tw = (Math.sin(t * 5 + c.y) + 1) / 2;
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + tw * 0.55})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(c.x + 8, c.y - 12); ctx.lineTo(c.x + 8, c.y - 6);
    ctx.moveTo(c.x + 5, c.y - 9); ctx.lineTo(c.x + 11, c.y - 9);
    ctx.stroke();
  }

  function drawCage() {
    if (!cageRect) return;
    const { x, y } = cageRect;
    if (!G.rescued) {
      ctx.fillStyle = 'rgba(60,50,40,.25)';
      ctx.fillRect(x + 2, y + 2, 36, 36);
      drawKiwiBody(x + 20, y + 37, 1, 0, true);
      ctx.strokeStyle = '#6b5a45';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, y + 2, 36, 36);
      ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x + 2 + i * 9, y + 2);
        ctx.lineTo(x + 2 + i * 9, y + 38);
        ctx.stroke();
      }
    } else {
      const t = performance.now() / 1000;
      drawKiwiBody(x + 20, y + 37, 1, Math.abs(Math.sin(t * 6)) * 8, true);
    }
  }

  // ── HUD / 화면 ──
  function drawHUD() {
    const cw = canvas.width, chh = canvas.height;
    const u = Math.max(1, scale); // HUD 스케일
    ctx.save();
    ctx.textBaseline = 'top';

    if (G.state === 'title') {
      overlay('rgba(20,40,70,.55)');
      centerText('KIWI STORY', chh * 0.3, 52 * u, '#ffe08a', true);
      centerText('~ 뉴질랜드 스토리 오마주 ~', chh * 0.3 + 62 * u, 16 * u, '#fff');
      centerText('화살로 적을 쏘고, 풍선을 빼앗아 날아올라', chh * 0.52, 14 * u, '#cde8ff');
      centerText('갇힌 키위 친구들을 구출하세요!', chh * 0.52 + 22 * u, 14 * u, '#cde8ff');
      centerText('이동 ◀▶ · 점프 A(공중에서 한 번 더!) · 발사 B', chh * 0.66, 13 * u, '#9fc9ee');
      if (Math.floor(performance.now() / 500) % 2 === 0)
        centerText('탭 또는 아무 키나 눌러 시작', chh * 0.78, 18 * u, '#ffe08a');
      centerText(VERSION, chh - 26 * u, 11 * u, 'rgba(255,255,255,.55)');
      ctx.restore();
      return;
    }

    // 인게임 HUD
    ctx.font = `bold ${16 * u}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(0, 0, cw, 30 * u);
    ctx.fillStyle = '#fff';
    ctx.fillText(`SCORE ${G.score}`, 12 * u, 7 * u);
    const lvText = `ROUND ${G.levelIndex + 1}`;
    ctx.fillText(lvText, cw / 2 - ctx.measureText(lvText).width / 2, 7 * u);
    ctx.fillStyle = '#ff6b81';
    let hearts = '';
    for (let i = 0; i < G.lives; i++) hearts += '♥ ';
    ctx.fillText(hearts, cw - ctx.measureText(hearts).width - 12 * u, 7 * u);

    if (G.state === 'clear') {
      centerText('친구를 구했다!', chh * 0.4, 34 * u, '#ffe08a', true);
      centerText('+1000', chh * 0.4 + 44 * u, 20 * u, '#fff');
    } else if (G.state === 'gameover') {
      overlay('rgba(40,10,10,.6)');
      centerText('GAME OVER', chh * 0.4, 44 * u, '#ff8a8a', true);
      centerText(`SCORE ${G.score}`, chh * 0.4 + 54 * u, 20 * u, '#fff');
      if (G.timer > 0.6) centerText('탭하여 다시 시작', chh * 0.62, 16 * u, '#ffd');
    } else if (G.state === 'ending') {
      overlay('rgba(20,50,90,.6)');
      centerText('모든 친구를 구했다!', chh * 0.35, 36 * u, '#ffe08a', true);
      centerText('키위들은 다시 평화롭게 살았답니다 🎈', chh * 0.35 + 48 * u, 16 * u, '#fff');
      centerText(`FINAL SCORE ${G.score}`, chh * 0.52, 24 * u, '#fff');
      if (G.timer > 0.6) centerText('탭하여 처음부터', chh * 0.66, 16 * u, '#ffd');
    }
    ctx.restore();
  }

  function overlay(color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function centerText(text, y, size, color, stroke = false) {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    const x = canvas.width / 2 - ctx.measureText(text).width / 2;
    if (stroke) {
      ctx.strokeStyle = 'rgba(0,0,0,.5)';
      ctx.lineWidth = size / 8;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // ── 메인 루프 ──
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    Input.endFrame();
    requestAnimationFrame(frame);
  }

  loadLevel(0); // 타이틀 뒤 배경용으로 미리 로드
  requestAnimationFrame(frame);

  // 테스트/디버그 훅 (프로덕션 동작에는 영향 없음)
  window.__kiwi = {
    G,
    get player() { return player; },
    get arrows() { return arrows; },
    get balloons() { return balloons; },
    get walkers() { return walkers; },
    get flyers() { return flyers; },
    get cageRect() { return cageRect; },
    step(dt) { update(dt); Input.endFrame(); },
    draw,
    loadLevel,
  };
})();
