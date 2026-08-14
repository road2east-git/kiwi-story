/* 키보드 + 터치 버튼 통합 입력 */
const Input = (() => {
  const state = { left: false, right: false, jump: false, shoot: false, down: false };
  const pressed = { jump: false, shoot: false }; // 이번 프레임 눌림(에지)
  let anyPress = false; // 화면 전환용

  const keyMap = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyZ: 'jump', ArrowUp: 'jump', KeyW: 'jump',
    KeyX: 'shoot', KeyK: 'shoot',
  };

  window.addEventListener('keydown', (e) => {
    const a = keyMap[e.code];
    if (!a) return;
    e.preventDefault();
    if (!state[a] && (a === 'jump' || a === 'shoot')) pressed[a] = true;
    state[a] = true;
    anyPress = true;
    Sfx.unlock();
  });

  window.addEventListener('keyup', (e) => {
    const a = keyMap[e.code];
    if (a) state[a] = false;
  });

  function bindButton(id, action) {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e) => {
      e.preventDefault();
      if (!state[action] && (action === 'jump' || action === 'shoot')) pressed[action] = true;
      state[action] = true;
      anyPress = true;
      el.classList.add('held');
      Sfx.unlock();
    };
    const off = (e) => {
      e.preventDefault();
      state[action] = false;
      el.classList.remove('held');
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  window.addEventListener('DOMContentLoaded', () => {
    bindButton('btn-left', 'left');
    bindButton('btn-right', 'right');
    bindButton('btn-jump', 'jump');
    bindButton('btn-shoot', 'shoot');
  });

  return {
    state,
    justPressed(a) { return pressed[a]; },
    consumeAnyPress() { const v = anyPress; anyPress = false; return v; },
    endFrame() { pressed.jump = false; pressed.shoot = false; anyPress = false; },
  };
})();
