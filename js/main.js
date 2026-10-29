'use strict';
// ============================================================
// 入口：画布缩放、主循环、输入
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let viewScale = 1;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const s = Math.min(w / GAME_W, h / GAME_H);
  const cssW = Math.floor(GAME_W * s), cssH = Math.floor(GAME_H * s);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  viewScale = canvas.width / GAME_W;
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// ===== 输入：按下→移动（面板滚动）→抬起（未拖拽则视为点击） =====
const pointer = { down: false, x: 0, y: 0, startX: 0, startY: 0, dragged: false, thumbKey: null, thumbGrab: 0 };

function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) / r.width * GAME_W,
    y: (e.clientY - r.top) / r.height * GAME_H,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const p = toLogical(e);
  // 自动采集/自动制作进行中：按下任意处即停止，本次交互只做停止
  if (autoGather.enabled || autoCraft.recipe) {
    stopAllAuto();
    pointer.down = false;
    pointer.downTag = null;
    return;
  }
  pointer.down = true;
  pointer.dragged = false;
  pointer.x = pointer.startX = p.x;
  pointer.y = pointer.startY = p.y;
  pointer.downAt = performance.now();
  // 按在滚动条滑块上：进入滑块拖动模式（不走内容滑动逻辑）；弹窗打开时不启用
  pointer.thumbKey = !modalOpen() ? scrollThumbAt(p.x, p.y) : null;
  pointer.thumbGrab = pointer.thumbKey ? p.y - PANEL_SCROLL_META[pointer.thumbKey].barY : 0;
  // 按在采集节点上：常驻自动采集中则先取消（这次点击不采集），否则进入长按计时
  const gNode = typeof gatherNodeAt === 'function' ? gatherNodeAt(p.x, p.y) : null;
  if (gNode) {
    if (autoGather.enabled) cancelAutoGather();
    else startHoldGather(gNode.k);
  }
  // 按在制作按钮上：记录，长按 3 秒开启自动制作
  pointer.downTag = null;
  for (let i = hits.length - 1; i >= 0; i--) {
    if (hits[i].tag && inRect(p.x, p.y, hits[i])) { pointer.downTag = hits[i].tag; break; }
  }
});

canvas.addEventListener('pointermove', (e) => {
  if (!pointer.down) return;
  const p = toLogical(e);
  const dx = p.x - pointer.x, dy = p.y - pointer.y;
  pointer.x = p.x; pointer.y = p.y;
  if (!pointer.dragged && Math.hypot(p.x - pointer.startX, p.y - pointer.startY) > 10) {
    pointer.dragged = true;
  }
  if (pointer.dragged) {
    stopHoldGather(); // 拖拽取消长按
    pointer.downTag = null;
    if (pointer.thumbKey) {
      // 拖滚动条滑块：滑块行程与内容滚动按比例映射（拖到底=滚到底，拇指位置=当前视口）
      const m = PANEL_SCROLL_META[pointer.thumbKey];
      if (m && m.max > 0 && m.trackH > m.barH) {
        const by = Math.max(m.trackTop, Math.min(m.trackTop + m.trackH - m.barH, p.y - pointer.thumbGrab));
        PANEL_SCROLLS[pointer.thumbKey] = Math.max(0, Math.min(m.max, (by - m.trackTop) * m.max / (m.trackH - m.barH)));
      }
    } else if (!modalOpen()) {
      const scrollKey = panelScrollAt(pointer.startX, pointer.startY);
      if (scrollKey) scrollPanelBy(scrollKey, -dy); // 弹窗打开时吞掉拖动，不穿透滚动底层面板
    }
    // 战斗页快捷装备行横向滑动
    if (battle.active && battle.phase !== 'fight') {
      battle.quickX = Math.max(0, Math.min(battle.quickMax || 0, (battle.quickX || 0) - dx));
    }
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (!pointer.down) return;
  pointer.down = false;
  pointer.thumbKey = null; // 滑块拖动结束，恢复常规输入
  const wasAutoGather = autoGather.enabled; // 长按已开启自动采集：松手不算点击，也不取消
  stopHoldGather();
  const held = performance.now() - (pointer.downAt || 0);
  const tag = pointer.downTag;
  pointer.downTag = null;
  if (pointer.dragged) return; // 拖拽结束不算点击
  if (wasAutoGather) return;
  if (tag && held >= AUTO_CRAFT.holdToStart * 1000) return; // 长按已开启自动制作，吞掉抬起
  const p = toLogical(e);
  onTap(p.x, p.y);
});
canvas.addEventListener('pointercancel', () => { pointer.down = false; pointer.thumbKey = null; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// 桌面端滚轮：滚动鼠标所在的弹窗/面板内容区（移动端走拖拽滚动）
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const p = toLogical(e);
  const scrollKey = panelScrollAt(p.x, p.y);
  if (scrollKey) scrollPanelBy(scrollKey, e.deltaY);
}, { passive: false });

// ===== 点击命中：后注册者优先；点面板外关闭面板；对话中推进对话 =====
function onTap(x, y) {
  if (cancelAutoCraft()) return;  // 点击任意处停止自动制作（吞掉本次点击）
  if (cancelAutoGather()) return; // 点击任意处关闭常驻自动采集（吞掉本次点击）
  for (let i = hits.length - 1; i >= 0; i--) {
    if (inRect(x, y, hits[i])) {
      hits[i].cb();
      return;
    }
  }
  if (dialog.active) {
    advanceDialog();
    return;
  }
  if (panelOpen) {
    if (!inRect(x, y, PANEL)) closePanel(); // 连「选择/仓库/地图」弹窗一起关干净
  }
}

// 桌面端：空格 / 回车推进对话
window.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && dialog.active) {
    e.preventDefault();
    advanceDialog();
  }
});

// ===== 经济时间结算：支持后台挂机 =====
// 渲染帧（requestAnimationFrame）在后台会被浏览器暂停，所以采集/制作/建筑/摇杆
// 不吃渲染帧，而是按“真实流逝时间”结算：前台每帧结算一小段，后台由 setInterval
// 每秒兜底结算，切后台瞬间也结算一次。结算按 0.5 秒切片推进，等价于逐帧模拟。
const ECON_SLICE = 0.5;            // 结算切片（秒）
const ECON_MAX_OFFLINE = 8 * 3600; // 单次结算上限 8 小时（防极端时间跳变）
let lastEcon = performance.now();

function economyTick(dt) {
  if (!state || scene !== 'game') return; // 主菜单/剧情里时间流逝不产出
  autoPinTick(); // 钉选自动勾选（未满 10 个时跟随存货）
  factoryTick(dt);
  autoGatherTick(dt);
  autoCraftTick(dt);
}

function economyConsume(now) {
  let elapsed = (now - lastEcon) / 1000;
  lastEcon = now;
  if (elapsed <= 0) return;
  elapsed = Math.min(elapsed, ECON_MAX_OFFLINE);
  let remaining = elapsed, guard = 0;
  while (remaining > 0 && guard++ < 100000) {
    const step = Math.min(ECON_SLICE, remaining);
    remaining -= step;
    economyTick(step);
  }
}

// ===== 主循环 =====
let last = performance.now();
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;
  economyConsume(t); // 前台：每帧结算真实流逝的经济时间
  // 长按打造按钮 3 秒 → 开启自动制作
  if (pointer.down && pointer.downTag && !autoCraft.recipe
      && t - (pointer.downAt || 0) >= AUTO_CRAFT.holdToStart * 1000) {
    autoCraftStart(pointer.downTag);
  }
  update(dt);
  renderFrame();
  if (dirty && t - lastSaveAt > 700) saveState();
  requestAnimationFrame(loop);
}

// 后台兜底：rAF 暂停后由定时器驱动（浏览器后台约 1 次/秒，重度限流时每次
// 结算多掉的整段时间），顺便把脏存档落盘
setInterval(() => {
  const now = performance.now();
  economyConsume(now);
  if (state && dirty && now - lastSaveAt > 2000) saveState();
}, 1000);

function renderFrame() {
  beginUiFrame(); // 滚动区每帧重注册（panelScrollAt 只认本帧画过的区域）
  hits = [];
  ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
  ctx.clearRect(0, 0, GAME_W, GAME_H);
  if (scene === 'menu') renderMenu();
  else if (scene === 'story') renderStory();
  else if (scene === 'game' && state) renderGame();
  drawToasts();
}

// 离开页面时兜底存档
document.addEventListener('visibilitychange', () => {
  if (!state) return;
  economyConsume(performance.now()); // 离开/回到页面：先把流逝的经济时间结算掉
  if (document.hidden) saveState();
});
window.addEventListener('pagehide', () => { if (state) saveState(); });

// 测试用钩子（不影响正常玩法）
window.__tap = onTap;
window.__state = () => state;
window.__hits = () => hits.map(h => ({ x: h.x, y: h.y, w: h.w, h: h.h }));

// ===== 启动 =====
settings = loadSettings();
setLang(settings.lang);
resize();
requestAnimationFrame(loop);
