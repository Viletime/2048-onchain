// ─── TECLADO ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  const map = {
    ArrowUp:    0,
    ArrowDown:  1,
    ArrowLeft:  2,
    ArrowRight: 3
  };
  if (map[e.key] !== undefined) {
    e.preventDefault();
    handleMove(map[e.key]);
  }
});

// ─── SWIPE MOBILE ─────────────────────────────────────────────
let touchStart = null;

document.getElementById('board').addEventListener('touchstart', e => {
  touchStart = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY
  };
}, { passive: true });

document.getElementById('board').addEventListener('touchend', e => {
  if (!touchStart) return;

  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;

  // Ignora swipes muito curtos
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;

  if (Math.abs(dx) > Math.abs(dy)) {
    handleMove(dx > 0 ? 3 : 2); // direita : esquerda
  } else {
    handleMove(dy > 0 ? 1 : 0); // baixo : cima
  }

  touchStart = null;
}, { passive: true });
