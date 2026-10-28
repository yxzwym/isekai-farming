'use strict';
// ============================================================
// 场景：主菜单 / 开场剧情 / 游戏主界面 + 各面板 + 对话框 + 战斗
// ============================================================

const SPEAKER_COLORS = { narrator: '#9fb0b8', you: '#bcd7ff', god: '#ffd479', mystery: '#d8a6ff' };

// 采集/战斗节点（名称见语言包 node.*；show = 出现条件）
const NODES = [
  // 每种资源只画一个采集点供手敲；地图上每种资源实际有 2 个点（见 data.js HARVEST_SITES），
  // 数量展示与采集站指派都在「建筑」面板里
  { id: 'bush',   k: 'bush',   x: 70,  y: 460, r: 60, action: 'gather', show: () => true },
  { id: 'rabbit', k: 'rabbit', x: 398, y: 452, r: 56, action: 'battle', show: () => state.questDone.includes('eat-berry') },
  { id: 'tree',   k: 'tree',   x: 240, y: 268, r: 72, action: 'gather', show: () => state.questDone.includes('hunt-rabbit') },
  { id: 'boar',   k: 'boar',   x: 92,  y: 330, r: 56, action: 'battle', show: () => state.questDone.includes('craft-woodsword') },
  { id: 'stone',  k: 'stone',  x: 392, y: 316, r: 56, action: 'gather', show: () => state.questDone.includes('hunt-boar') },
  { id: 'goat',   k: 'goat',   x: 240, y: 442, r: 60, action: 'battle', show: () => state.questDone.includes('craft-leatherarmor') },
  { id: 'iron',   k: 'iron',   x: 392, y: 200, r: 56, action: 'gather', show: () => state.questDone.includes('hunt-goat') },
];

// 命中检测：屏幕坐标下的可采集节点（长按自动采集用）
function gatherNodeAt(x, y) {
  if (dialog.active || battle.active || panelOpen || scene !== 'game') return null;
  for (const n of NODES) {
    if (!n.show() || n.action !== 'gather') continue;
    const hr = Math.max(n.r, 44) * 0.9;
    if (x >= n.x - hr && x <= n.x + hr && y >= n.y - hr && y <= n.y + hr + 14) return n;
  }
  return null;
}

// 草地装饰（固定位置）
const DECOR = [
  { x: 40, y: 200, k: 0 }, { x: 420, y: 210, k: 1 }, { x: 60, y: 330, k: 1 },
  { x: 150, y: 160, k: 0 }, { x: 320, y: 150, k: 1 }, { x: 440, y: 330, k: 0 },
  { x: 30, y: 480, k: 2 }, { x: 445, y: 490, k: 2 }, { x: 200, y: 500, k: 1 },
  { x: 300, y: 480, k: 0 }, { x: 90, y: 260, k: 2 }, { x: 405, y: 275, k: 2 },
];

const armNew = { armed: false };     // 新游戏覆盖存档的二次确认
const armDelete = { armed: false };  // 删除存档的二次确认
let armClearCache = false;           // 主页清除缓存的二次确认
let craftCat = 'cook';               // 制作面板当前分栏

// ============================================================
// 更新
// ============================================================
function update(dt) {
  if (dialog.active) {
    const cps = TEXT_SPEEDS[settings.speed].cps;
    const full = dialog.lines[dialog.idx].text.length;
    dialog.shown = Math.min(full, dialog.shown + dt * cps);
  }
  // 经济与自动化（采集/制作/建筑/摇杆）不再由渲染帧驱动，改由 main.js 的 economyConsume 按真实时间结算，支持后台挂机
  if (state && scene === 'game' && battle.active) {
    tickBattle(dt);
    battle.pflash = Math.max(0, battle.pflash - dt);
    for (let i = battle.floats.length - 1; i >= 0; i--) {
      battle.floats[i].t += dt;
      if (battle.floats[i].t >= battle.floats[i].life) battle.floats.splice(i, 1);
    }
  }
  // 战斗外耐力恒为满值（打完一场直接回满），无需恢复逻辑
  for (const k in nodeAnim) nodeAnim[k] = Math.max(0, nodeAnim[k] - dt * 4);
  for (let i = floats.length - 1; i >= 0; i--) {
    floats[i].t += dt;
    if (floats[i].t >= floats[i].life) floats.splice(i, 1);
  }
  for (let i = toasts.length - 1; i >= 0; i--) {
    if (toasts[i].sticky) continue; // 常驻提示：停止自动化时才移除
    toasts[i].t += dt;
    if (toasts[i].t >= toasts[i].life) toasts.splice(i, 1);
  }
}

// ============================================================
// 主菜单
// ============================================================
function renderMenu() {
  // 天空
  const sky = ctx.createLinearGradient(0, 0, 0, GAME_H);
  sky.addColorStop(0, '#aee7ff');
  sky.addColorStop(0.55, '#d9f4d0');
  sky.addColorStop(1, '#8fd07a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  // 太阳
  ctx.fillStyle = 'rgba(255,244,180,.9)';
  ctx.beginPath(); ctx.arc(392, 96, 44, 0, Math.PI * 2); ctx.fill();
  // 远山
  ctx.fillStyle = '#a5d98f';
  ctx.beginPath(); ctx.ellipse(90, 470, 260, 150, 0, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8ccb7a';
  ctx.beginPath(); ctx.ellipse(420, 500, 300, 170, 0, Math.PI, Math.PI * 2); ctx.fill();
  // 地面
  ctx.fillStyle = '#7ec46b';
  ctx.fillRect(0, 470, GAME_W, GAME_H - 470);
  // 大树
  drawTree(96, 500, 1.15);
  // 花草
  drawDecor();
  // 标题（英文较长时自动缩小）
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const title = t('ui.title');
  let titleSize = 54;
  font(titleSize, true);
  while (ctx.measureText(title).width > 440 && titleSize > 30) {
    titleSize -= 4;
    font(titleSize, true);
  }
  ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineJoin = 'round';
  ctx.strokeText(title, 240, 236);
  ctx.fillStyle = '#2f6b39';
  ctx.fillText(title, 240, 236);
  if (t('ui.subtitle')) {
    font(15, false);
    ctx.fillStyle = '#4a6b50';
    ctx.fillText(t('ui.subtitle'), 240, 286);
  }

  // 按钮
  uiButton(105, 430, 270, 62, t('menu.new'), () => {
    armNew.armed = false; armDelete.armed = false;
    panelOpen = 'newgame';
  }, { kind: 'primary', size: 20 });
  uiButton(105, 508, 270, 62, t('menu.continue'), () => continueGame(), {
    disabled: !hasSave(), size: 19,
  });
  uiButton(105, 586, 270, 56, t('menu.settings'), () => {
    armNew.armed = false; armDelete.armed = false;
    panelOpen = 'settings';
  }, { kind: 'ghost', size: 19 });

  // 版本
  font(12, false);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(46,93,52,.75)';
  ctx.fillText(t('ui.title') + ' ' + VERSION + ' · ' + t('ui.chapter'), 12, GAME_H - 10);

  // 右下角：清除缓存（低调入口，两段式确认）
  font(10, false);
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = armClearCache ? 'rgba(150,70,55,.75)' : 'rgba(46,93,52,.3)';
  ctx.fillText(armClearCache ? t('menu.clearCacheConfirm') : t('menu.clearCache'), GAME_W - 10, GAME_H - 8);
  reg(GAME_W - 86, GAME_H - 26, 80, 24, () => {
    if (!armClearCache) { armClearCache = true; return; }
    try { localStorage.clear(); } catch (e) {}
    location.href = location.pathname + '?cb=' + Date.now();
  });

  if (panelOpen === 'newgame') drawNewGamePanel();
  if (panelOpen === 'settings') drawSettingsContent();
  if (panelOpen === 'resbar') drawResBarPanel();
}

function drawNewGamePanel() {
  const c = drawPanelBase(t('panel.new'));
  if (hasSave()) {
    drawWrapped(t('menu.overwriteWarn'), c.x, c.y + 16, c.w, 24, '#b0532f', 16, true);
  } else {
    drawWrapped(t('menu.newHint'), c.x, c.y + 16, c.w, 24, '#5a5344', 16, false);
  }
  const startOrConfirm = (skip) => {
    if (hasSave() && !armNew.armed) {
      armNew.armed = true;
      toast(t('ui.confirmOverwrite'), '#ffc966');
      return;
    }
    newGame(skip);
  };
  uiButton(c.x + 42, c.y + 120, 300, 62, t('menu.watchIntro'), () => startOrConfirm(false), { kind: 'primary', size: 19 });
  uiButton(c.x + 42, c.y + 200, 300, 62, t('menu.skipIntro'), () => startOrConfirm(true), { kind: 'ghost', size: 19 });
  uiButton(c.x + 42, c.y + 280, 300, 52, t('ui.cancel'), () => { panelOpen = null; }, { kind: 'flat', size: 17 });
}

// ===== 设置面板（主菜单 / 游戏内共用） =====
function drawSettingsContent() {
  const c = drawPanelBase(t('panel.settings'));
  let y = c.y + 10;
  // 游戏内打开：返回游戏 / 保存并回到主菜单（主菜单打开时无需这两项）
  if (scene === 'game') {
    uiButton(c.x, y, c.w, 48, t('menu.back'), () => { panelOpen = null; }, { kind: 'primary', size: 16 });
    y += 56;
    uiButton(c.x, y, c.w, 48, t('menu.saveExit'), () => { saveState(); panelOpen = null; scene = 'menu'; }, { kind: 'ghost', size: 16 });
    y += 64;
  }
  ctx.fillStyle = '#5a5344'; font(16, true);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(t('settings.textSpeed'), c.x, y + 22);
  y += 48;
  const speedKeys = Object.keys(TEXT_SPEEDS);
  const sbw = (c.w - (speedKeys.length - 1) * 8) / speedKeys.length;
  speedKeys.forEach((k, i) => {
    uiButton(c.x + i * (sbw + 8), y, sbw, 46, t('speed.' + k), () => {
      settings.speed = k;
      saveSettings();
    }, { kind: settings.speed === k ? 'primary' : 'ghost', size: 16 });
  });
  y += 66;
  ctx.fillStyle = '#5a5344'; font(16, true);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(t('settings.language'), c.x, y + 22);
  y += 48;
  const langs = Object.keys(LANG_PACK);
  const lbw = (c.w - (langs.length - 1) * 8) / langs.length;
  langs.forEach((k, i) => {
    uiButton(c.x + i * (lbw + 8), y, lbw, 46, LANG_PACK[k].nativeName, () => {
      if (lang !== k) {
        setLang(k);
        settings.lang = k;
        saveSettings();
      }
    }, { kind: lang === k ? 'primary' : 'ghost', size: 16 });
  });
  y += 66;
  ctx.fillStyle = '#5a5344'; font(16, true);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(t('settings.battleSpeed'), c.x, y + 22);
  y += 48;
  const bKeys = Object.keys(BATTLE_SPEEDS);
  const bbw = (c.w - (bKeys.length - 1) * 8) / bKeys.length;
  bKeys.forEach((k, i) => {
    uiButton(c.x + i * (bbw + 8), y, bbw, 46, t('speed.' + k), () => {
      settings.battleSpeed = k;
      saveSettings();
    }, { kind: settings.battleSpeed === k ? 'primary' : 'ghost', size: 16 });
  });
  y += 70;
  y += drawWrapped(t('settings.saveNote'), c.x, y, c.w, 22, '#8a8171', 13, false) + 16;
  uiButton(c.x, y, c.w, 52, armDelete.armed ? t('settings.deleteConfirm') : t('settings.delete'), () => {
    if (!hasSave()) return;
    if (!armDelete.armed) {
      armDelete.armed = true;
      toast(t('ui.confirmDelete'), '#ffc966');
      return;
    }
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    state = null;
    armDelete.armed = false;
    panelOpen = null;
    scene = 'menu';
    toasts.length = 0;
    toast(t('ui.deleted'), '#ffc966');
  }, { kind: 'danger', size: 17, disabled: !hasSave() });
  y += 86;
  font(13, false); ctx.fillStyle = '#a89f8c';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(tf('settings.about', { v: VERSION }), c.x, y + 12);
  y += 28;
}

// ===== 物品栏显示设置 =====
function drawResBarPanel() {
  const c = drawPanelBase(t('resbar.title'), 'resbar');
  let y = c.y + 8;
  const ord = resBarOrder();
  ord.forEach((id, i) => {
    const hidden = settings.resBarHidden.includes(id);
    drawIcon(id, c.x + 18, y + 20, 26);
    font(15, true);
    ctx.fillStyle = '#3c3c30';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t('item.' + id + '.name'), c.x + 42, y + 21);
    uiButton(c.x + 216, y, 88, 40, hidden ? t('resbar.hidden') : t('resbar.shown'), () => {
      const h = settings.resBarHidden;
      if (h.includes(id)) h.splice(h.indexOf(id), 1);
      else h.push(id);
      saveSettings();
    }, { kind: hidden ? 'ghost' : 'primary', size: 14 });
    uiButton(c.x + 312, y, 34, 40, '↑', () => {
      const o = resBarOrder();
      if (i > 0) {
        [o[i - 1], o[i]] = [o[i], o[i - 1]];
        settings.resBarOrder = o;
        saveSettings();
      }
    }, { kind: 'ghost', size: 16, disabled: i === 0 });
    uiButton(c.x + 350, y, 34, 40, '↓', () => {
      const o = resBarOrder();
      if (i < o.length - 1) {
        [o[i + 1], o[i]] = [o[i], o[i + 1]];
        settings.resBarOrder = o;
        saveSettings();
      }
    }, { kind: 'ghost', size: 16, disabled: i === ord.length - 1 });
    y += 48;
  });
  uiButton(c.x + 92, y + 12, 200, 52, t('resbar.done'), () => { panelOpen = null; }, { kind: 'primary', size: 17 });
  endPanel('resbar', y + 76);
}

// ============================================================
// 开场剧情场景
// ============================================================
function renderStory() {
  const line = dialog.lines[dialog.idx];
  const office = !line || line.bg !== 'field';
  const g = ctx.createLinearGradient(0, 0, 0, GAME_H);
  if (office) {
    g.addColorStop(0, '#0d1220'); g.addColorStop(1, '#1c2438');
  } else {
    g.addColorStop(0, '#1d3a2a'); g.addColorStop(1, '#3d6b45');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  if (office) {
    // 显示器冷光
    ctx.fillStyle = 'rgba(150,190,255,.10)';
    rr(130, 200, 220, 140, 10); ctx.fill();
    ctx.fillStyle = 'rgba(190,215,255,.16)';
    rr(146, 216, 188, 12, 4); ctx.fill();
    rr(146, 240, 150, 12, 4); ctx.fill();
    rr(146, 264, 170, 12, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fillRect(0, 560, GAME_W, GAME_H - 560);
  } else {
    // 月亮与草地剪影
    ctx.fillStyle = 'rgba(240,240,220,.85)';
    ctx.beginPath(); ctx.arc(388, 110, 34, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(80, 620, 300, 140, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(430, 650, 300, 150, 0, Math.PI, Math.PI * 2); ctx.fill();
    drawTree(90, 600, 0.9, true);
  }
  // 跳过按钮
  uiButton(356, 20, 104, 42, t('ui.skip'), () => {
    dialog.active = false;
    enterField(true);
  }, { kind: 'dark', size: 15 });
  drawDialogueBox();
}

// ============================================================
// 游戏主场景
// ============================================================
function renderGame() {
  // 面板/战斗/对话期间，场景与底部按钮均不响应
  const busy = dialog.active || battle.active || panelOpen != null;

  // 草地
  const g = ctx.createLinearGradient(0, 0, 0, GAME_H);
  g.addColorStop(0, '#96d683');
  g.addColorStop(1, '#63b45e');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  drawDecor();

  // ===== 顶部：左上当前地图芯片 / 右上仓库统计芯片 / 中间钉选物品行 =====
  const pins = pinnedItems();
  const topH = 108; // 芯片行 40 + 钉选行 64 + 间距（追踪条在 y 124，与钉选容器 52..116 错开）
  const mapUnlocked = state.questDone.includes('hunt-goat');
  // 左上：当前地图（图标 + 名称），点击弹窗切换（打完黑山羊解锁）
  if (mapUnlocked) {
    ctx.fillStyle = 'rgba(255,255,255,.82)'; rr(8, 8, 148, 40, 12); ctx.fill();
    drawIcon('map_' + state.map, 30, 28, 28);
    font(14, true); ctx.fillStyle = '#4a4438';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t('map.' + state.map), 50, 29);
    if (!busy) reg(8, 8, 148, 40, () => { mapPick = true; });
  }
  // 右上：仓库统计（图标 + 名称 + 总量/总上限），点击弹窗查看全部物品
  const tot = storageTotals();
  ctx.fillStyle = 'rgba(255,255,255,.82)'; rr(GAME_W - 172, 8, 120, 40, 12); ctx.fill();
  drawIcon('warehouse', GAME_W - 156, 28, 24);
  font(13, true); ctx.fillStyle = '#4a4438';
  ctx.fillText(t('inv.warehouse'), GAME_W - 138, 21);
  ctx.fillText(tot.have + '/' + tot.cap, GAME_W - 138, 38);
  if (!busy) reg(GAME_W - 172, 8, 120, 40, () => { invPick = true; });
  // 右上角：设置齿轮（仓库右侧），直达设置面板
  ctx.fillStyle = 'rgba(255,255,255,.82)'; rr(GAME_W - 44, 8, 36, 40, 12); ctx.fill();
  drawIcon('gear', GAME_W - 26, 28, 26);
  if (!busy) reg(GAME_W - 44, 8, 36, 40, () => { panelOpen = 'settings'; });
  // 中间：钉选展示的物品（单行 10 格平分宽度：图标 / 名字 / 数量；点击打开仓库弹窗）
  ctx.fillStyle = 'rgba(255,255,255,.82)'; rr(8, 52, GAME_W - 16, 64, 12); ctx.fill();
  const cellW = (GAME_W - 16) / 10;
  if (pins.length) {
    pins.forEach((id, i) => {
      const x = 8 + i * cellW;
      drawIcon(id, x + cellW / 2, 70, 24);
      // 名字按稀有度着色，超宽自动缩小字号
      const label = t('item.' + id + '.name');
      let fs = 10;
      font(fs, true);
      while (fs > 8 && ctx.measureText(label).width > cellW - 4) { fs--; font(fs, true); }
      ctx.fillStyle = rarityColor(id); ctx.textAlign = 'center';
      ctx.fillText(label, x + cellW / 2, 88);
      // 数量：当前/上限；满/超上限红、≥90% 警告色（配色与 K/M 格式化统一在 ui.js）
      const cur = state.inv[id] || 0, cap = capOf(id);
      const num = fmt(cur) + '/' + fmt(cap);
      let nfs = 12;
      font(nfs, true);
      while (nfs > 9 && ctx.measureText(num).width > cellW - 4) { nfs--; font(nfs, true); }
      ctx.fillStyle = capNumColor(cur, cap);
      ctx.fillText(num, x + cellW / 2, 105);
    });
  } else {
    font(12, false); ctx.fillStyle = '#a89f8c';
    ctx.textAlign = 'center';
    ctx.fillText(t('inv.pinHint'), GAME_W / 2, 84);
  }
  if (!busy) reg(8, 52, GAME_W - 16, 64, () => { invPick = true; });

  // 任务追踪条
  const trackY = 8 + topH + 8;
  const q = curQuest();
  let trackText;
  if (q) {
    const p = Math.min(q.count, questProgress(q));
    const name = questName(q.id);
    trackText = questReady() ? tf('ui.trackerReady', { name }) : tf('ui.tracker', { name, p, c: q.count });
  } else {
    trackText = t('ui.trackerDone');
  }
  font(14, true);
  const tw = ctx.measureText(trackText).width + 26;
  const readyPulse = q && questReady() ? 1 + Math.sin(performance.now() / 200) * 0.04 : 1;
  ctx.save();
  ctx.translate(12, trackY);
  ctx.scale(readyPulse, readyPulse);
  ctx.fillStyle = q && questReady() ? 'rgba(255,205,120,.95)' : 'rgba(255,255,255,.75)';
  rr(0, 0, tw, 30, 15); ctx.fill();
  ctx.fillStyle = q && questReady() ? '#7a4a12' : '#4a6b50';
  ctx.textAlign = 'left';
  ctx.fillText(trackText, 13, 16);
  ctx.restore();
  // 注意：任务追踪条的点击注册放在节点注册之后（见下方），保证追踪条永远可点

  // 采集节点（按进度逐步出现；未解锁的画剪影，让玩家知道地图上还有哪些资源/动物）
  for (const n of NODES) {
    if (!n.show()) {
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.globalAlpha = 0.28;
      if (n.id === 'bush') drawBush(0, 0);
      else if (n.id === 'tree') drawTree(0, 0, 1);
      else if (n.id === 'stone') drawRock(0, 0);
      else if (n.id === 'iron') drawIronNode(0, 0);
      else if (n.id === 'rabbit') drawRabbit(0, 0);
      else if (n.id === 'goat') drawGoat(0, 0, 1);
      else drawBoar(0, 0);
      ctx.restore();
      continue;
    }
    const a = nodeAnim[n.id] || 0;
    const s = 1 + a * 0.1;
    // 长按计时时快速抖动（触发自动采集后停止）
    let jitter = 0;
    if (pointer.down && autoGather.node === n.k && !autoGather.enabled
        && performance.now() - (pointer.downAt || 0) >= AUTO_GATHER.jitterAfter * 1000) {
      jitter = Math.sin(performance.now() / 7) * 1.5;
    }
    ctx.save();
    ctx.translate(n.x + jitter, n.y);
    ctx.scale(s, s);
    if (n.id === 'bush') drawBush(0, 0);
    else if (n.id === 'tree') drawTree(0, 0, 1);
    else if (n.id === 'stone') drawRock(0, 0);
    else if (n.id === 'iron') drawIronNode(0, 0);
    else if (n.id === 'rabbit') drawRabbit(0, 0);
    else if (n.id === 'goat') drawGoat(0, 0, 1);
    else drawBoar(0, 0);
    ctx.restore();
    if (!busy) {
      // 战斗节点命中框略小：给周围的新资源点让出点击区域
      const hr = Math.max(n.r, 44) * (n.action === 'battle' ? 1.2 : 1.4);
      reg(n.x - hr, n.y - hr, hr * 2, hr * 2 + 14, () => {
        if (n.action === 'battle') startBattle(n.id);
        else doGather(n);
      });
    }
  }

  // 名牌与采集血条：统一画在所有节点之上，避免相邻节点（如铁矿）遮挡
  // 先画完全部名牌、再画全部血条：血条优先于名牌展示，挖矿进度不被相邻节点名牌盖住
  for (const n of NODES) {
    // 未解锁：灰名牌「名称 · 未解锁」
    if (!n.show()) {
      const label = t('node.' + n.id + '.name') + ' · ' + t('map.locked');
      font(12, true);
      const lw = ctx.measureText(label).width + 20;
      ctx.fillStyle = 'rgba(30,50,34,.35)';
      rr(n.x - lw / 2, n.y + n.r * 0.62, lw, 24, 12); ctx.fill();
      ctx.fillStyle = 'rgba(234,244,228,.7)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, n.x, n.y + n.r * 0.62 + 13);
      continue;
    }
    const label = t('node.' + n.id + '.name');
    font(13, true);
    const lw = ctx.measureText(label).width + 20;
    // 采集点第二行：采集站使用量（已指派/点位总数），造出采集站后才显示（前期新手不展示）
    let sub = null, used = 0;
    if (n.action === 'gather' && state.builds.some(b => b.t === 'harvester')) {
      const total = Object.values(HARVEST_SITES).filter(v => v === n.k).length;
      used = state.builds.filter(b => b.t === 'harvester' && b.node && HARVEST_SITES[b.node] === n.k).length;
      sub = used + '/' + total;
    }
    const ph = sub ? 42 : 24;
    ctx.fillStyle = 'rgba(30,50,34,.55)';
    rr(n.x - lw / 2, n.y + n.r * 0.62, lw, ph, 12); ctx.fill();
    ctx.fillStyle = '#eaf4e4';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, n.x, n.y + n.r * 0.62 + (sub ? 14 : 13));
    if (sub) {
      font(11, true);
      ctx.fillStyle = used > 0 ? '#9fe08a' : 'rgba(234,244,228,.55)';
      ctx.fillText(sub, n.x, n.y + n.r * 0.62 + 30);
    }
  }
  for (const n of NODES) {
    if (!n.show()) continue;
    // 采集血条（受损时显示分段格）
    const maxH = nodeHitsMax(n.id);
    if (maxH > 1) {
      const cur = state.nodeHp[n.k] || 0;
      if (cur > 0) {
        const cw = 16, gap = 4, h = 8;
        const w = maxH * cw + (maxH - 1) * gap;
        // 血条贴在名牌上方一点点：名牌顶边在 n.y + n.r*0.62，血条底边距它 4px
        const gx = n.x - w / 2, gy = n.y + n.r * 0.62 - h - 4;
        for (let gi = 0; gi < maxH; gi++) {
          ctx.fillStyle = gi < cur ? '#ff8c3a' : 'rgba(0,0,0,.28)';
          rr(gx + gi * (cw + gap), gy, cw, h, 3); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
        rr(gx - 1, gy - 1, w + 2, h + 2, 4); ctx.stroke();
      }
    }
  }
  // 任务追踪条的点击注册在节点之后：重叠区域追踪条优先，保证任务面板随时可开
  if (q && !busy) reg(12, trackY, Math.max(tw, 120), 30, () => { panelOpen = 'quest'; });

  // 飘字
  for (const f of floats) {
    const k = f.t / f.life;
    ctx.globalAlpha = 1 - k;
    font(15, true);
    ctx.fillStyle = f.color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.text, f.x, f.y - 44 * k);
    ctx.globalAlpha = 1;
  }

  // 属性条
  drawStatsStrip(8, 560, GAME_W - 16, 116);

  // 底部按钮：建筑 / 装备 / 制作 / 任务 / 菜单（教程引导或任务可提交时，按钮起跳 + 感叹号引导）
  // 建筑入口在主线全部完成后才出现
  // 「建筑」面板入口：打完黑山羊（神交付「手搓万物」）后解锁，主线电梯任务需要它
  const mainDone = state.questDone.includes('hunt-goat');
  const hint = q && !questReady() ? q.hint : null;
  let btnDefs = [
    ['tab.factory', 'factory', null],
    ['tab.equip', 'equip', hint === 'equip'],
    ['tab.craft', 'craft', hint === 'craft'],
    ['tab.research', 'research', null],
    ['tab.quests', 'quest', null],
  ];
  if (!mainDone) btnDefs = btnDefs.filter(d => d[1] !== 'factory' && d[1] !== 'research');
  const bw = 82, bh = 80, gap = 8, x0 = (GAME_W - btnDefs.length * bw - (btnDefs.length - 1) * gap) / 2, by = 694;
  btnDefs.forEach(([labelKey, panelKey, guide], i) => {
    const bx = x0 + i * (bw + gap);
    const attention = !busy && (guide || (panelKey === 'quest' && q && questReady()));
    guideFx(bx, by, bw, bh, attention, () => {
      uiButton(bx, by, bw, bh, t(labelKey), () => { panelOpen = panelKey; }, { kind: 'primary', size: 16, disabled: busy });
    });
  });

  // 面板
  if (panelOpen === 'quest') drawQuestPanel();
  else if (panelOpen === 'equip') drawEquipPanel();
  else if (panelOpen === 'craft') drawCraftPanel();
  else if (panelOpen === 'research') drawResearchPanel();
  else if (panelOpen === 'settings') drawSettingsContent();
  else if (panelOpen === 'resbar') drawResBarPanel();
  else if (panelOpen === 'factory') drawFactoryPanel();

  // 战斗页（底层内容，面板打开时覆盖其上）
  if (battle.active) drawBattle();

  // 面板（战斗页之上）
  if (panelOpen === 'quest') drawQuestPanel();
  else if (panelOpen === 'equip') drawEquipPanel();
  else if (panelOpen === 'craft') drawCraftPanel();
  else if (panelOpen === 'research') drawResearchPanel();
  else if (panelOpen === 'settings') drawSettingsContent();
  else if (panelOpen === 'resbar') drawResBarPanel();
  else if (panelOpen === 'factory') drawFactoryPanel();

  // 对话框（最上层）
  if (dialog.active) drawDialogueBox();

  // ===== 地图切换弹窗 =====
  if (mapPick) {
    ctx.fillStyle = 'rgba(10,20,16,.45)'; ctx.fillRect(0, 0, GAME_W, GAME_H);
    const pw = 360, ph = 60 + Object.keys(MAPS).length * 56 + 20;
    const px = (GAME_W - pw) / 2, py = 180;
    ctx.fillStyle = '#fbf7ec'; rr(px, py, pw, ph, 16); ctx.fill();
    ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 2; rr(px, py, pw, ph, 16); ctx.stroke();
    font(17, true); ctx.fillStyle = '#3c3c30';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t('map.pick'), px + pw / 2, py + 28);
    // 右上角关闭
    ctx.fillStyle = '#eee7d4'; rr(px + pw - 48, py + 12, 32, 32, 10); ctx.fill();
    ctx.fillStyle = '#8a8171'; font(17, true);
    ctx.textAlign = 'center';
    ctx.fillText('✕', px + pw - 32, py + 29);
    reg(px + pw - 48, py + 12, 32, 32, () => { mapPick = false; });
    reg(0, 0, GAME_W, GAME_H, () => { mapPick = false; }); // 遮罩点击关闭（先注册，地图项优先命中）
    Object.keys(MAPS).forEach((id, i) => {
      const oy = py + 52 + i * 56;
      const cur = state.map === id;
      ctx.fillStyle = cur ? '#fff7e0' : '#fff';
      rr(px + 14, oy, pw - 28, 48, 10); ctx.fill();
      ctx.strokeStyle = cur ? '#e0c37a' : '#e2dac4'; ctx.lineWidth = 1.2;
      rr(px + 14, oy, pw - 28, 48, 10); ctx.stroke();
      drawIcon('map_' + id, px + 40, oy + 24, 30);
      font(15, cur); ctx.fillStyle = cur ? '#7a4a12' : '#5a5344';
      ctx.textAlign = 'left';
      ctx.fillText((cur ? '✓ ' : '') + t('map.' + id), px + 64, oy + 24);
      reg(px + 14, oy, pw - 28, 48, () => { if (switchMap(id)) mapPick = false; });
    });
  }

  // ===== 仓库弹窗：全部物品分类展示，可滚动；勾选钉选（最多 10 个展示在外）=====
  if (invPick) {
    ctx.fillStyle = 'rgba(10,20,16,.45)'; ctx.fillRect(0, 0, GAME_W, GAME_H);
    const pw = 392, px = (GAME_W - pw) / 2, py = 36, ph = 716;
    const listTop = py + 60, listH = ph - 60 - 16;
    ctx.fillStyle = '#fbf7ec'; rr(px, py, pw, ph, 16); ctx.fill();
    ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 2; rr(px, py, pw, ph, 16); ctx.stroke();
    font(17, true); ctx.fillStyle = '#3c3c30';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t('inv.title'), px + pw / 2, py + 26);
    font(12, false); ctx.fillStyle = '#a89f8c';
    ctx.fillText(t('inv.pinHint'), px + pw / 2, py + 48);
    // 右上角关闭按钮（与任务/制作面板同款）
    ctx.fillStyle = '#eee7d4'; rr(px + pw - 48, py + 12, 32, 32, 10); ctx.fill();
    ctx.fillStyle = '#8a8171'; font(17, true);
    ctx.textAlign = 'center';
    ctx.fillText('✕', px + pw - 32, py + 29);
    // 列表内容高度预估 + 滚动注册（复用主面板的拖拽滚动机制）
    const contentRows = ITEM_GROUPS.reduce((n, g) => n + g.items.filter(id => state.seen[id]).length + (g.items.some(id => state.seen[id]) ? 1 : 0), 0);
    const contentH = contentRows * 44 + 20;
    const max = Math.max(0, contentH - listH);
    PANEL_SCROLL_META['invPop'] = { top: listTop, bottom: listTop + listH, max, contentH };
    const sc = PANEL_SCROLLS['invPop'] || 0;
    reg(px + pw - 48, py + 12, 32, 32, () => { invPick = false; }); // 注册在遮罩之后：优先命中
    ctx.save();
    ctx.beginPath(); ctx.rect(px + 2, listTop - 4, pw - 4, listH + 8); ctx.clip();
    ctx.translate(0, -sc);
    let cy = listTop - 4;
    ITEM_GROUPS.forEach((grp) => {
      const shown = grp.items.filter(id => state.seen[id]);
      if (!shown.length) return; // 整组都没解锁过：连组头都不显示
      font(14, true); ctx.fillStyle = '#8a8171';
      ctx.textAlign = 'left';
      ctx.fillText(t('inv.group.' + grp.key), px + 20, cy + 12);
      cy += 30;
      shown.forEach((id) => {
        const have = state.inv[id] || 0;
        const pinned = settings.resBarPicks.includes(id);
        // 钉选框
        ctx.fillStyle = pinned ? '#7fb069' : '#fff';
        rr(px + 20, cy + 11, 20, 20, 4); ctx.fill();
        ctx.strokeStyle = pinned ? '#5c9152' : '#c4bdae'; ctx.lineWidth = 1.2;
        rr(px + 20, cy + 11, 20, 20, 4); ctx.stroke();
        if (pinned) {
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(px + 25, cy + 21); ctx.lineTo(px + 28, cy + 25); ctx.lineTo(px + 35, cy + 16); ctx.stroke();
        }
        drawIcon(id, px + 58, cy + 21, 28);
        font(14, true); ctx.fillStyle = rarityColor(id);
        ctx.textAlign = 'left';
        ctx.fillText(t('item.' + id + '.name'), px + 82, cy + 21);
        font(13, true);
        ctx.textAlign = 'right';
        ctx.fillStyle = capNumColor(have, capOf(id)); // 满仓红/快满黄，与顶栏同一套配色
        ctx.fillText(fmt(have) + '/' + fmt(capOf(id)), px + pw - 28, cy + 21);
        regVis(px + 8, cy, pw - 16, 42, () => {
          const picks = settings.resBarPicks;
          if (picks.includes(id)) picks.splice(picks.indexOf(id), 1);
          else {
            if (picks.length >= 10) { toast(t('inv.pinMax'), '#ff9c8a'); return; }
            picks.push(id);
            if (picks.length >= 10) settings.resBarAutoDone = true; // 攒满 10 个：自动勾选阶段结束
          }
          saveSettings();
        }, listTop - 4, listTop + listH);
        cy += 44;
      });
    });
    ctx.restore();
    // 弹窗内滚动条
    if (max > 0) {
      const barH = Math.max(40, listH * listH / contentH);
      const barY = listTop + (listH - barH) * (sc / max);
      ctx.fillStyle = 'rgba(90,83,68,.22)'; rr(px + pw - 12, listTop, 6, listH, 3); ctx.fill();
      ctx.fillStyle = 'rgba(90,83,68,.5)'; rr(px + pw - 12, barY, 6, barH, 3); ctx.fill();
    }
  }
}

// ===== 装饰 =====
function drawDecor() {
  for (const d of DECOR) {
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.k === 0) {
      // 草丛
      ctx.strokeStyle = 'rgba(58,130,58,.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, 4); ctx.lineTo(-7, -5);
      ctx.moveTo(0, 4); ctx.lineTo(0, -7);
      ctx.moveTo(5, 4); ctx.lineTo(7, -5);
      ctx.stroke();
    } else if (d.k === 1) {
      // 小花
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 4, Math.sin(a) * 4, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    } else {
      // 石子
      ctx.fillStyle = 'rgba(120,130,110,.7)';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// ===== 节点绘制（局部坐标） =====
function drawBush(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(x, y + 26, 42, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3e8f3a';
  ctx.beginPath(); ctx.arc(x - 24, y + 4, 22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 24, y + 4, 22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - 10, 27, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y + 10, 21, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5cb054';
  ctx.beginPath(); ctx.arc(x - 8, y - 16, 12, 0, Math.PI * 2); ctx.fill();
  // 浆果
  const dots = [[-18, 2], [6, -14], [18, 8], [-2, 12]];
  for (const [dx, dy] of dots) {
    ctx.fillStyle = '#e14b4b';
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(x + dx - 1.6, y + dy - 1.6, 1.7, 0, Math.PI * 2); ctx.fill();
  }
}

function drawRock(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(x, y + 24, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  // 一堆灰石头
  const rocks = [[-20, 8, 18], [16, 10, 16], [-2, -6, 22], [24, -4, 12], [-28, -2, 12]];
  for (const [dx, dy, r] of rocks) {
    ctx.fillStyle = '#9aa0a8';
    ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8bec6';
    ctx.beginPath(); ctx.arc(x + dx - r * 0.25, y + dy - r * 0.3, r * 0.55, 0, Math.PI * 2); ctx.fill();
  }
}

// 铁矿脉（褐铁斑点）
function drawIronNode(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(x, y + 24, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#94989f';
  ctx.beginPath();
  ctx.moveTo(x - 42, y + 20); ctx.lineTo(x - 34, y - 14); ctx.lineTo(x - 8, y - 28);
  ctx.lineTo(x + 24, y - 22); ctx.lineTo(x + 42, y + 4); ctx.lineTo(x + 22, y + 22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#aeb2b9';
  ctx.beginPath();
  ctx.moveTo(x - 34, y - 14); ctx.lineTo(x - 8, y - 28); ctx.lineTo(x + 8, y - 18);
  ctx.lineTo(x - 18, y - 6);
  ctx.closePath(); ctx.fill();
  const spots = [[-16, 4], [8, -6], [20, 8], [-2, 12]];
  for (const [dx, dy] of spots) {
    ctx.fillStyle = '#7d838c';
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b717a';
    ctx.beginPath(); ctx.arc(x + dx + 1.4, y + dy + 1.4, 2, 0, Math.PI * 2); ctx.fill();
  }
}

// 白兔（侧影：长耳、圆身）
function drawRabbit(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.14)';
  ctx.beginPath(); ctx.ellipse(0, 26, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0ede6';
  ctx.beginPath(); ctx.ellipse(0, 6, 26, 19, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-26, 8, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0ede6';
  ctx.beginPath(); ctx.arc(22, -2, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e4dfd4';
  ctx.beginPath(); ctx.ellipse(18, -22, 4.5, 12, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(27, -21, 4.5, 12, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f3b8c4';
  ctx.beginPath(); ctx.ellipse(18, -22, 2, 8, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c2c34';
  ctx.beginPath(); ctx.arc(26, -4, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(33, 1, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 黑山羊（boss：弯角、红瞳、山羊胡）
function drawGoat(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(0, 30, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2e2e36';
  rr(-26, 14, 9, 18, 4); ctx.fill();
  rr(16, 14, 9, 18, 4); ctx.fill();
  ctx.fillStyle = '#3a3a44';
  ctx.beginPath(); ctx.ellipse(0, -2, 36, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#33333c';
  ctx.beginPath(); ctx.ellipse(30, 2, 17, 14, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(30, -18, 12, Math.PI * 1.15, Math.PI * 1.9); ctx.stroke();
  ctx.fillStyle = '#2e2e36';
  ctx.beginPath(); ctx.ellipse(22, -10, 6, 3.5, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(40, 10); ctx.lineTo(42, 18); ctx.stroke();
  ctx.fillStyle = '#e8e6df';
  ctx.beginPath(); ctx.ellipse(35, -4, 4.4, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath(); ctx.ellipse(36, -4, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawTree(x, y, s, silhouette) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = silhouette ? 'rgba(0,0,0,.4)' : 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(0, 56, 52, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = silhouette ? 'rgba(0,0,0,.55)' : '#7a4f2a';
  rr(-10, -12, 20, 70, 6); ctx.fill();
  const crown = silhouette ? 'rgba(0,0,0,.5)' : '#4e9c46';
  const crown2 = silhouette ? 'rgba(0,0,0,.45)' : '#62b358';
  ctx.fillStyle = crown;
  ctx.beginPath(); ctx.arc(-36, -18, 34, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(36, -18, 34, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -48, 44, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -12, 38, 0, Math.PI * 2); ctx.fill();
  if (!silhouette) {
    ctx.fillStyle = crown2;
    ctx.beginPath(); ctx.arc(-12, -54, 22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(18, -34, 16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function drawBoar(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(0, 30, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  // 腿
  ctx.fillStyle = '#8f5a4a';
  rr(-26, 12, 10, 18, 4); ctx.fill();
  rr(14, 12, 10, 18, 4); ctx.fill();
  // 身体
  ctx.fillStyle = '#b98069';
  ctx.beginPath(); ctx.ellipse(0, -2, 36, 24, 0, 0, Math.PI * 2); ctx.fill();
  // 背鬃
  ctx.strokeStyle = '#7c4f3d'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-22, -20); ctx.lineTo(-16, -27);
  ctx.moveTo(-8, -24); ctx.lineTo(-2, -31);
  ctx.moveTo(6, -24); ctx.lineTo(12, -30);
  ctx.stroke();
  // 头
  ctx.fillStyle = '#a86e58';
  ctx.beginPath(); ctx.arc(28, 4, 18, 0, Math.PI * 2); ctx.fill();
  // 耳朵
  ctx.fillStyle = '#8f5a4a';
  ctx.beginPath(); ctx.moveTo(20, -12); ctx.lineTo(26, -24); ctx.lineTo(31, -12); ctx.closePath(); ctx.fill();
  // 獠牙
  ctx.fillStyle = '#f3ede0';
  ctx.beginPath(); ctx.moveTo(36, 10); ctx.quadraticCurveTo(44, 8, 42, 0); ctx.lineTo(38, 6); ctx.closePath(); ctx.fill();
  // 猪鼻
  ctx.fillStyle = '#d9a08c';
  ctx.beginPath(); ctx.ellipse(42, 4, 8, 6.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8f5a4a';
  ctx.beginPath(); ctx.arc(44, 2.5, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(44, 6, 1.4, 0, Math.PI * 2); ctx.fill();
  // 眼睛
  ctx.fillStyle = '#2c1d16';
  ctx.beginPath(); ctx.arc(30, -3, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ===== 属性条：生命 / 耐力（法力上限为 0 时不显示） =====
function drawBarRow(x, y, w, h, label, ratio, fillColor, text) {
  ctx.fillStyle = '#4a4438'; font(14, true);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + h / 2 + 1);
  drawBar(x + 52, y, w, h, ratio, fillColor, '#e8dcc8');
  if (text) {
    ctx.fillStyle = '#fff'; font(12, true);
    ctx.textAlign = 'center';
    ctx.fillText(text, x + 52 + w / 2, y + h / 2 + 1);
  }
}

function drawStatsStrip(x, y, w, h) {
  ctx.fillStyle = 'rgba(255,255,255,.82)';
  rr(x, y, w, h, 14); ctx.fill();
  // 条状区块在面板内垂直居中；后续法力加入后三行一起居中
  const rows = [
    { label: t('stat.hp'),   bh: 20, color: '#e05a4e', ratio: Math.max(0, state.hp) / maxHp(), text: Math.ceil(state.hp) + ' / ' + maxHp() },
    { label: t('stat.stam'), bh: 16, color: '#e0a53f', ratio: 1, text: '' + Math.ceil(state.stamina) },
  ];
  if (maxMp() > 0) {
    rows.push({ label: t('stat.mp'), bh: 14, color: '#4f8fd0', ratio: 1, text: '' + maxMp() });
  }
  const gap = 14;
  const total = rows.reduce((acc, r) => acc + r.bh, 0) + gap * (rows.length - 1);
  let by = y + (h - total) / 2;
  for (const r of rows) {
    drawBarRow(x + 18, by, 226, r.bh, r.label, r.ratio, r.color, r.text);
    by += r.bh + gap;
  }
  // 右侧：攻防 + 食物槽，同样垂直居中
  const rx = x + 318;
  const rightH = 20 + 12 + 40;
  let ry = y + (h - rightH) / 2;
  font(14, true);
  ctx.fillStyle = '#4a4438';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(t('stat.atk') + ' ' + atkVal(), rx, ry + 10);
  ctx.fillText(t('stat.def') + ' ' + defVal(), rx + 74, ry + 10);
  ry += 32;
  for (let i = 0; i < MAX_FOOD; i++) {
    const sx = rx + i * 46;
    const f = state.foodSlots[i];
    if (f) {
      ctx.fillStyle = '#fff7e0';
      rr(sx, ry, 40, 40, 9); ctx.fill();
      drawIcon(f, sx + 20, ry + 20, 28);
    } else {
      ctx.strokeStyle = '#b9b09a'; ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      rr(sx, ry, 40, 40, 9); ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ============================================================
// 对话框
// ============================================================
function drawDialogueBox() {
  const d = dialog;
  const line = d.lines[d.idx];
  if (!line) return;
  const story = d.mode === 'story';
  const bx = story ? 20 : 14, bw = story ? 440 : 452;
  const by = story ? 552 : 588, bh = story ? 216 : 198;
  ctx.fillStyle = story ? 'rgba(10,12,16,.9)' : 'rgba(24,28,26,.94)';
  rr(bx, by, bw, bh, 16); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1.5;
  rr(bx, by, bw, bh, 16); ctx.stroke();
  // 说话人
  const whoKey = line.who || 'narrator';
  const col = SPEAKER_COLORS[whoKey] || '#e8e4d8';
  const whoName = t('speaker.' + whoKey);
  font(15, true);
  const nw = ctx.measureText(whoName).width + 24;
  ctx.fillStyle = 'rgba(255,255,255,.1)';
  rr(bx + 16, by + 14, nw, 26, 13); ctx.fill();
  ctx.fillStyle = col;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(whoName, bx + 28, by + 28);
  // 正文（打字机）
  const shown = line.text.slice(0, Math.floor(d.shown));
  font(story ? 21 : 19, false);
  ctx.fillStyle = '#eceadf';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  let cy = by + 56;
  for (const l of wrapText(shown, bw - 40)) {
    ctx.fillText(l, bx + 20, cy);
    cy += story ? 30 : 28;
  }
  // 继续指示
  if (d.shown >= line.text.length) {
    const bounce = Math.sin(performance.now() / 180) * 3;
    ctx.fillStyle = col;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('▼', bx + bw - 34, by + bh - 26 + bounce);
  }
}

// ============================================================
// 面板内容
// ============================================================
function drawQuestPanel() {
  const c = drawPanelBase(t('panel.quest'), 'quest');
  const q = curQuest();
  let y = c.y;
  if (q) {
    const p = Math.min(q.count, questProgress(q));
    // 当前任务卡片
    ctx.fillStyle = '#fff';
    rr(c.x, y, c.w, 196, 14); ctx.fill();
    ctx.strokeStyle = '#e2dac4'; ctx.lineWidth = 1.5;
    rr(c.x, y, c.w, 196, 14); ctx.stroke();
    ctx.fillStyle = '#3c3c30'; font(19, true);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(questName(q.id), c.x + 18, y + 28);
    ctx.fillStyle = questReady() ? '#c2571f' : '#8a8171';
    font(13, true);
    ctx.textAlign = 'right';
    ctx.fillText(questReady() ? t('quest.ready') : t('quest.active'), c.x + c.w - 18, y + 28);
    drawWrapped(t('quests.' + q.id + '.desc'), c.x + 18, y + 50, c.w - 36, 24, '#6b6455', 15, false);
    // 进度条
    ctx.fillStyle = '#eee7d4';
    rr(c.x + 18, y + 108, c.w - 36, 12, 6); ctx.fill();
    ctx.fillStyle = questReady() ? '#3f9142' : '#e0a53f';
    if (p > 0) { rr(c.x + 18, y + 108, Math.max(12, (c.w - 36) * p / q.count), 12, 6); ctx.fill(); }
    font(13, true);
    ctx.fillStyle = '#6b6455';
    ctx.textAlign = 'left';
    ctx.fillText(tf('quest.progress', { p, c: q.count }), c.x + 18, y + 134);
    // 奖励
    ctx.textBaseline = 'middle';
    ctx.fillText(t('quest.reward'), c.x + 18, y + 166);
    let rx = c.x + 76;
    const rw = q.reward || {};
    const keys = Object.keys(rw).filter(k => rw[k] > 0);
    if (!keys.length) {
      font(13, false); ctx.fillStyle = '#a89f8c';
      ctx.fillText(t('ui.none'), rx, y + 166);
    }
    for (const k of keys) {
      drawIcon(k, rx + 12, y + 166, 22);
      font(13, true); ctx.fillStyle = '#6b6455';
      ctx.textAlign = 'left';
      ctx.fillText('×' + rw[k], rx + 26, y + 166);
      rx += 56;
    }
    // 教程引导：任务可提交时，「提交」按钮起跳 + 感叹号
    guideFx(c.x + c.w - 152, y + 148, 134, 40, questReady() && !busyPanel(), () =>
      uiButton(c.x + c.w - 152, y + 148, 134, 40, t('quest.submit'), () => submitQuest(), {
        kind: 'primary', size: 16, disabled: !questReady(),
      }));
    y += 216;
    // 已完成
    ctx.fillStyle = '#8a8171'; font(14, true);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(tf('quest.completed', { n: state.questDone.length }), c.x, y + 14);
    if (state.questDone.length) {
      const names = state.questDone.map(id => questName(id)).join('、');
      drawWrapped(names, c.x, y + 36, c.w, 24, '#a89f8c', 13, false);
    }
    endPanel('quest', y + 70);
  } else {
    ctx.fillStyle = '#3c3c30'; font(22, true);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t('quest.finaleTitle'), c.x + c.w / 2, y + 120);
    drawWrapped(t('quest.finaleText'), c.x + 30, y + 170, c.w - 60, 26, '#8a8171', 15, false);
    endPanel('quest', y + 210);
  }
}

// 食物/装备的加成文本：+15 生命 +3 攻 …
function bonusText(fd) {
  const parts = [];
  if (fd.hp) parts.push(tf('effect.hp', { n: fd.hp }));
  if (fd.stam) parts.push(tf('effect.stam', { n: fd.stam }));
  if (fd.mp) parts.push(tf('effect.mp', { n: fd.mp }));
  if (fd.atk) parts.push(tf('effect.atk', { n: fd.atk }));
  if (fd.def) parts.push(tf('effect.def', { n: fd.def }));
  if (fd.atkPct) parts.push(tf('effect.atkPct', { n: Math.round(fd.atkPct * 100) }));
  return parts.join('  ');
}

// 加成副标题行（通用卡片用）：一条加成一行
function bonusParts(fd) {
  return bonusText(fd).split('  ').filter(Boolean).map(p => ({ t: p, c: '#3f9142', b: true }));
}

// ===== 装备面板：食物 + 装备 =====
function drawEquipPanel() {
  const c = drawPanelBase(t('panel.equip'), 'equip');
  const q = curQuest();
  let y = c.y + 4;
  // ---- 1. 食物槽 ----
  ctx.fillStyle = '#5a5344'; font(16, true);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(t('equip.slots'), c.x, y + 12);
  y += 26;
  for (let i = 0; i < MAX_FOOD; i++) {
    const sx = c.x + i * 132;
    const f = state.foodSlots[i];
    ctx.fillStyle = f ? '#fff7e0' : '#f3eedd';
    rr(sx, y, 120, 64, 10); ctx.fill();
    ctx.strokeStyle = f ? '#e0c37a' : '#d8cfb8'; ctx.lineWidth = 1.5;
    rr(sx, y, 120, 64, 10); ctx.stroke();
    if (f) {
      drawItemCard(sx, y, 120, 64, f, state.inv[f] || 0, t('item.' + f + '.name'), bonusParts(FOODS[f]), '#fff7e0', '#e0c37a');
      reg(sx, y, 120, 64, () => doUnequipFood(i));
    } else {
      font(13, false); ctx.fillStyle = '#b9b09a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t('equip.empty'), sx + 60, y + 32);
    }
  }
  y += 84;
  // ---- 2. 可食用的食物（属性好的在前；空则整块隐藏） ----
  const foods = Object.keys(FOODS).filter(id =>
    (state.inv[id] || 0) > 0 && !state.foodSlots.includes(id))
    .sort((a, b) => (FOODS[b].hp + FOODS[b].stam) - (FOODS[a].hp + FOODS[a].stam));
  if (foods.length) {
    for (const id of foods) {
      ctx.fillStyle = '#fff';
      rr(c.x, y, c.w, 48, 10); ctx.fill();
      drawIconCounted(id, c.x + 26, y + 24, 34, state.inv[id]);
      font(15, true); ctx.fillStyle = '#3c3c30';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('item.' + id + '.name'), c.x + 52, y + 18);
      font(12, false); ctx.fillStyle = '#8a8171';
      ctx.fillText(bonusText(FOODS[id]), c.x + 52, y + 35);
      const full = state.foodSlots.indexOf(null) === -1;
      // 教程引导：食用类任务进行中，「食用」按钮起跳 + 感叹号
      guideFx(c.x + c.w - 96, y + 7, 84, 34, q && q.type === 'eat' && !questReady() && !busyPanel(), () =>
        uiButton(c.x + c.w - 96, y + 7, 84, 34, t('equip.do'), () => doEquipFood(id), {
          kind: 'primary', size: 14, disabled: full,
        }));
      y += 54;
    }
    y += 6;
  }
  // ---- 3. 药物槽 ----
  ctx.fillStyle = '#5a5344'; font(16, true);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(t('equip.herbs'), c.x, y + 12);
  y += 26;
  for (let i = 0; i < MAX_HERB; i++) {
    const sx = c.x + i * 132;
    const m = state.medSlots[i];
    ctx.fillStyle = m ? '#eef7e0' : '#f3eedd';
    rr(sx, y, 120, 64, 10); ctx.fill();
    ctx.strokeStyle = m ? '#a8c37a' : '#d8cfb8'; ctx.lineWidth = 1.5;
    rr(sx, y, 120, 64, 10); ctx.stroke();
    if (m) {
      drawItemCard(sx, y, 120, 64, m, state.inv[m] || 0, t('item.' + m + '.name'),
        [{ t: tf('effect.heal', { n: MEDS[m].heal }), c: '#3f9142', b: true }], '#eef7e0', '#a8c37a');
      reg(sx, y, 120, 64, () => doUnequipHerb(i));
    } else {
      font(13, false); ctx.fillStyle = '#b9b09a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t('equip.empty'), sx + 60, y + 32);
    }
  }
  y += 80;
  // ---- 4. 可使用的药物（空则整块隐藏） ----
  const meds = Object.keys(MEDS).filter(id =>
    (state.inv[id] || 0) > 0 && !state.medSlots.includes(id));
  if (meds.length) {
    for (const id of meds) {
      ctx.fillStyle = '#fff';
      rr(c.x, y, c.w, 48, 10); ctx.fill();
      drawIconCounted(id, c.x + 26, y + 24, 34, state.inv[id]);
      font(15, true); ctx.fillStyle = '#3c3c30';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('item.' + id + '.name'), c.x + 52, y + 18);
      font(12, false); ctx.fillStyle = '#8a8171';
      ctx.fillText(tf('effect.heal', { n: MEDS[id].heal }), c.x + 52, y + 35);
      // 教程引导：用药类任务进行中，「使用」按钮起跳 + 感叹号
      guideFx(c.x + c.w - 96, y + 7, 84, 34, q && q.type === 'med' && !questReady() && !busyPanel(), () =>
        uiButton(c.x + c.w - 96, y + 7, 84, 34, t('equip.use'), () => {
          const slot = state.medSlots.indexOf(null);
          if (slot !== -1) doEquipHerb(slot);
        }, { kind: 'primary', size: 14 }));
      y += 54;
    }
    y += 6;
  }
  // ---- 5. 装备：武器一格、盔甲一格（点击卸下，与食物药物同一套交互） ----
  ctx.fillStyle = '#5a5344'; font(16, true);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(t('equip.gearSlots'), c.x, y + 12);
  y += 26;
  [['weapon', t('equip.weapon')], ['armor', t('equip.armor')]].forEach(([slot, label], i) => {
    const sx = c.x + i * 132;
    const cur = state.equip[slot];
    if (cur) {
      drawItemCard(sx, y, 120, 64, cur, state.inv[cur] || 0, t('item.' + cur + '.name'), [
        { t: tf('equip.dur', { a: gearDurLeft(cur), b: DURABILITY[cur] || 0 }), c: '#8a8171' },
        { t: bonusText(ITEMS[cur].equip), c: '#3f9142', b: true },
      ], '#fff7e0', '#e0c37a');
      reg(sx, y, 120, 64, () => doUnequipGear(slot)); // 点击整格卸下
    } else {
      ctx.fillStyle = '#f3eedd';
      rr(sx, y, 120, 64, 10); ctx.fill();
      ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 1.5;
      rr(sx, y, 120, 64, 10); ctx.stroke();
      font(13, false); ctx.fillStyle = '#b9b09a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label + ' · ' + t('equip.empty'), sx + 60, y + 32);
    }
  });
  y += 84;
  // ---- 6. 可穿戴装备（点击整行穿上，穿上的从这里消失；空则整块隐藏） ----
  const equippedIds = Object.values(state.equip).filter(Boolean);
  const bag = Object.keys(ITEMS).filter(id => ITEMS[id].equip && (state.inv[id] || 0) > 0 && !equippedIds.includes(id))
    .sort((a, b) => ((ITEMS[b].equip.atk || 0) + (ITEMS[b].equip.def || 0))
                  - ((ITEMS[a].equip.atk || 0) + (ITEMS[a].equip.def || 0)));
  for (const id of bag) {
    ctx.fillStyle = '#fff';
    rr(c.x, y, c.w, 48, 10); ctx.fill();
    drawIconCounted(id, c.x + 26, y + 24, 34, state.inv[id]);
    font(15, true); ctx.fillStyle = '#3c3c30';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t('item.' + id + '.name'), c.x + 52, y + 18);
    // 副标题：耐久（跟随物品本身，卸下也保留磨损）
    const dm = DURABILITY[id] || 0;
    font(12, false); ctx.fillStyle = '#8a8171';
    ctx.fillText(tf('equip.dur', { a: gearDurLeft(id), b: dm }), c.x + 52, y + 35);
    // 装备按钮左侧：绿色属性加成（与砍伐次数同款）
    font(12, true); ctx.fillStyle = '#3f9142';
    ctx.textAlign = 'right';
    ctx.fillText(bonusText(ITEMS[id].equip), c.x + c.w - 104, y + 24);
    ctx.textAlign = 'left';
    uiButton(c.x + c.w - 96, y + 7, 84, 34, t('equip.doGear'), () => doEquipGear(id), { kind: 'primary', size: 14 });
    y += 54;
  }
  y += 6;
  // ---- 7. 工具栏（只展示；空则整块隐藏） ----
  const tools = ['wood_axe', 'stone_axe', 'wood_pick', 'stone_pick', 'horn_pick'].filter(id => hasItem(id));
  if (tools.length) {
    ctx.fillStyle = '#5a5344'; font(16, true);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t('equip.tools'), c.x, y + 12);
    y += 24;
    // 工具的采集次数（数据取自产出表）
    const toolHits = {};
    for (const node in GATHER_YIELD) {
      for (const [tool, y2, hits] of GATHER_YIELD[node]) {
        if (tool && y2) toolHits[tool] = { n: hits, key: node === 'tree' ? 'chopTimes' : 'digTimes' };
      }
    }
    for (const id of tools) {
      const inUse = (state.dur[id] || 0) > 0;
      const count = (state.inv[id] || 0) + (inUse ? 1 : 0);
      const dm = DURABILITY[id] || 0;
      ctx.fillStyle = '#fff';
      rr(c.x, y, c.w, 48, 10); ctx.fill();
      drawIconCounted(id, c.x + 26, y + 24, 34, count);
      font(15, true); ctx.fillStyle = '#3c3c30';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('item.' + id + '.name'), c.x + 52, y + 18);
      font(12, false); ctx.fillStyle = '#8a8171';
      ctx.fillText(tf('equip.dur', { a: inUse ? state.dur[id] : dm, b: dm }), c.x + 52, y + 35);
      // 右侧垂直居中：砍伐/挖掘次数
      const th = toolHits[id];
      if (th) {
        font(12, true); ctx.fillStyle = '#3f9142';
        ctx.textAlign = 'right';
        ctx.fillText(tf('ui.' + th.key, { n: th.n }), c.x + c.w - 14, y + 24);
        ctx.textAlign = 'left';
      }
      y += 54;
    }
  }
  endPanel('equip', y + 8);
}

function drawCraftPanel() {
  const c = drawPanelBase(t('panel.craft'), 'craft');
  // 分栏：精炼 / 烹饪 / 装备；当前任务指向的分类页签脉动引导
  const cats = ['cook', 'alchemy', 'refine', 'forge'];
  const tbw = (c.w - (cats.length - 1) * 8) / cats.length;
  const q = curQuest();
  const guideRecipe = q && q.hint === 'craft' && !questReady()
    ? RECIPES.find(r => r.out === q.target) : null;
  const guideCat = guideRecipe ? guideRecipe.cat : null;
  // 页签行整体下移 8px：给引导跳动留出顶部空间，避免被面板内容区裁剪
  const tabY = c.y + 8;
  cats.forEach((cat, i) => {
    const draw = () => uiButton(c.x + i * (tbw + 8), tabY, tbw, 40, t('craft.cats.' + cat), () => { craftCat = cat; }, {
      kind: craftCat === cat ? 'primary' : 'ghost', size: 16,
    });
    // 教程引导：任务指向的分类页签起跳 + 感叹号（已在正确页签时不再引导）
    guideFx(c.x + i * (tbw + 8), tabY, tbw, 40, guideCat === cat && craftCat !== cat && !busyPanel(), draw);
  });
  let y = c.y + 60;
  RECIPES.filter(r => r.cat === craftCat && recipeUnlocked(r)).forEach((r) => {
    const h = 88, pad = 6;
    ctx.fillStyle = '#fff';
    rr(c.x, y, c.w, h, 12); ctx.fill();
    ctx.strokeStyle = '#e2dac4'; ctx.lineWidth = 1.2;
    rr(c.x, y, c.w, h, 12); ctx.stroke();
    // 产物图标 + 持有角标
    drawIconCounted(r.out, c.x + 34, y + 40, 36, state.inv[r.out] || 0);
    font(16, true); ctx.fillStyle = rarityColor(r.out);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t('recipe.' + r.id + '.name') + ((r.y || 1) > 1 ? ' ×' + r.y : ''), c.x + 62, y + 20);
    // 消耗（图标 + 名字 + 需求量，稀有度着色）
    let canMake = Infinity;
    for (const k in r.cost) canMake = Math.min(canMake, Math.floor((state.inv[k] || 0) / r.cost[k]));
    drawCostChips(c.x + 62, y + 36, c.w - 130, r.cost);
    // 制作进度格（进行中时替代说明行）
    const hits = craftHits(r);
    const prog = CRAFT_PROG[r.id] || 0;
    const autoing = autoCraft.recipe === r.id;
    if (autoing || prog > 0) {
      // 制作中恒显整排格子（手动/自动一致）：已完成金格，未完成为空格
      const gw = 150, gh = 10, gx = c.x + 62, gy = y + 64;
      const cw = (gw - (hits - 1) * 3) / hits;
      for (let gi = 0; gi < hits; gi++) {
        ctx.fillStyle = gi < prog ? '#e0a53f' : '#c4bdae';
        rr(gx + gi * (cw + 3), gy, cw, gh, 3); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1;
      rr(gx - 1, gy - 1, gw + 2, gh + 2, 4); ctx.stroke();
    } else {
      font(11, false); ctx.fillStyle = '#a89f8c';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(tf('item.' + r.out + '.desc', itemDescParams(r.out)), c.x + 62, y + 66);
      ctx.textBaseline = 'middle';
    }
    // 打造按钮：宽度自适应文字（如"制作（100）"）；引导/自动制作中脉动；长按时抖动
    const guideBtn = guideRecipe && guideRecipe.id === r.id;
    // 长按计时时按钮快速抖动（触发自动制作后停止）；引导时脉动
    const holdCraft = pointer.down && pointer.downTag === r.id && autoCraft.recipe !== r.id
      && performance.now() - (pointer.downAt || 0) >= AUTO_CRAFT.jitterAfter * 1000;
    const makeText = tf('craft.makeN', { n: canMake });
    font(16, true);
    const btnW = Math.max(84, Math.ceil(ctx.measureText(makeText).width) + 28);
    let bx = c.x + c.w - btnW - 8;
    if (holdCraft) bx += Math.sin(performance.now() / 7) * 1.5;
    const drawBtn = () => uiButton(bx, y + 18, btnW, 44,
      makeText, () => doCraftClick(r), {
        kind: 'primary', size: 16, disabled: canMake <= 0, tag: r.id,
      });
    // 教程引导：任务指向的配方打造按钮起跳 + 感叹号（长按抖动时让位）
    guideFx(bx, y + 18, btnW, 44, guideBtn && !busyPanel() && !holdCraft, drawBtn);
    y += h + pad;
  });
  endPanel('craft', y + 8);
}
function busyPanel() { return dialog.active || battle.active; }

// ============================================================
// 战斗界面（通用：按敌人 id 取绘制函数，未收录的走通用走兽画法）
// ============================================================
const ENEMY_DRAW = { boar: drawBoar, rabbit: drawRabbit, goat: drawGoat };

// 通用走兽（后续敌人先落到这里，再逐步给专属画法）
function drawBeast(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(0, 30, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8d99a8';
  rr(-30, 10, 10, 20, 4); ctx.fill();
  rr(18, 10, 10, 20, 4); ctx.fill();
  ctx.fillStyle = '#a5b2c2';
  ctx.beginPath(); ctx.ellipse(0, -2, 36, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(30, -6, 17, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(22, -20); ctx.lineTo(27, -32); ctx.lineTo(33, -20); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-34, -8); ctx.quadraticCurveTo(-52, -18, -46, 2); ctx.quadraticCurveTo(-40, 10, -30, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2c2c34';
  ctx.beginPath(); ctx.arc(34, -10, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBattle() {
  // 全屏战斗页（覆盖主界面）：真正全屏，无圆角、不透出背景
  const px = 0, py = 0, pw = GAME_W, ph = GAME_H;
  ctx.fillStyle = '#fbf7ec';
  ctx.fillRect(px, py, pw, ph);

  const e = ENEMIES[battle.id];
  const q = curQuest();
  const dead = battle.phase === 'over' && battle.ehp <= 0;
  const cx = px + pw / 2;
  const ix = px + 24;
  const barX = ix + 52;
  const barW = pw - 48 - 52;
  const locked = battle.phase === 'fight';
  const iw = pw - 48;

  // ---- 敌人区 ----
  ctx.fillStyle = '#3c3c30'; font(19, true);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(t('enemy.' + battle.id + '.name'), cx, py + 36);
  const shake = nodeAnim[battle.id] || 0;
  ctx.save();
  ctx.translate(cx + Math.sin(performance.now() / 16) * 5 * shake, py + 130 + (dead ? 8 : 0));
  ctx.rotate(shake * 0.08);
  if (dead) ctx.globalAlpha = 0.55;
  (ENEMY_DRAW[battle.id] || drawBeast)(0, 0, 1.6);
  ctx.globalAlpha = 1;
  ctx.restore();
  drawBarRow(ix, py + 230, barW, 14, t('stat.hp'),
    Math.max(0, battle.ehp) / e.hp, '#e05a4e',
    Math.max(0, battle.ehp) + ' / ' + e.hp);
  drawBarRow(ix, py + 264, barW, 12, t('stat.stam'),
    e.stam ? 1 : 0, '#e0a53f', e.stam + ' / ' + e.stam);
  statChips(ix, py + 294, barW + 52, 22, [
    [t('stat.atkFull'), e.atk],
    [t('stat.defFull'), e.def],
  ]);

  // ---- 对战信息（日志） ----
  font(12, false);
  ctx.fillStyle = '#555043';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const logs = battle.log.slice(-10);
  let ly = py + 340;
  for (const l of logs) {
    for (const line of wrapText(l, pw - 56)) {
      ctx.fillText(line, ix, ly);
      ly += 15;
    }
  }

  // ---- 我方区：血条 / 耐力 / 攻防 ----
  if (battle.pflash > 0) {
    ctx.fillStyle = 'rgba(224,90,78,' + (0.25 * battle.pflash / 0.35) + ')';
    rr(px + 16, py + 496, pw - 32, 90, 10); ctx.fill();
  }
  drawBarRow(ix, py + 506, barW, 15, t('stat.hp'),
    Math.max(0, battle.php) / maxHp(), '#e05a4e',
    Math.max(0, Math.ceil(battle.php)) + ' / ' + maxHp());
  drawBarRow(ix, py + 532, barW, 13, t('stat.stam'), state.stamina / staminaMax(), '#e0a53f',
    Math.ceil(state.stamina) + ' / ' + staminaMax());
  statChips(ix, py + 554, barW + 52, 22, [
    [t('stat.atkFull'), atkVal()],
    [t('stat.defFull'), defVal()],
  ]);

  // ---- 快捷装备行（与装备面板同一套卡片；多过三张可左右滑，底部滚动条提示） ----
  const gearSubs = (id) => [
    { t: tf('equip.dur', { a: gearDurLeft(id), b: DURABILITY[id] || 0 }), c: '#8a8171' },
    { t: bonusText(ITEMS[id].equip), c: '#3f9142', b: true },
  ];
  const cards = [];
  if (state.equip.weapon) cards.push({ icon: state.equip.weapon, count: state.inv[state.equip.weapon] || 0, title: t('item.' + state.equip.weapon + '.name'), subs: gearSubs(state.equip.weapon) });
  if (state.equip.armor) cards.push({ icon: state.equip.armor, count: state.inv[state.equip.armor] || 0, title: t('item.' + state.equip.armor + '.name'), subs: gearSubs(state.equip.armor) });
  state.foodSlots.forEach(f => { if (f) cards.push({ icon: f, count: state.inv[f] || 0, title: t('item.' + f + '.name'), subs: bonusParts(FOODS[f]) }); });
  state.medSlots.forEach(m => { if (m) cards.push({ icon: m, count: 1, title: t('item.' + m + '.name'), subs: [{ t: tf('effect.heal', { n: MEDS[m].heal }), c: '#3f9142', b: true }] }); });
  const cardW = 120, cardH = 64, cgap = 12;
  const totalW = cards.length * cardW + Math.max(0, cards.length - 1) * cgap;
  battle.quickMax = Math.max(0, totalW - iw);
  battle.quickX = Math.max(0, Math.min(battle.quickX || 0, battle.quickMax));
  const rowY = py + 640, rowH = cardH + 12;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ix, rowY, iw, rowH);
  ctx.clip();
  let cx2 = ix - (battle.quickX || 0);
  cards.forEach(card => {
    drawItemCard(cx2, rowY, cardW, cardH, card.icon, card.count, card.title, card.subs);
    if (!locked) reg(cx2, rowY, cardW, cardH, () => { panelOpen = 'equip'; });
    cx2 += cardW + cgap;
  });
  ctx.restore();
  // 超出一屏才显示的横向滚动条：告诉玩家这一行可以左右滑动
  if (battle.quickMax > 0) {
    const trackY = rowY + cardH + 4;
    ctx.fillStyle = '#eae3d0';
    rr(ix, trackY, iw, 4, 2); ctx.fill();
    const tw = Math.max(28, iw * iw / (iw + battle.quickMax));
    const tx = ix + (iw - tw) * ((battle.quickX || 0) / battle.quickMax);
    ctx.fillStyle = '#c9bfa4';
    rr(tx, trackY, tw, 4, 2); ctx.fill();
  }

  // ---- 按钮（面板底部对齐，均分一左一右） ----
  const btnY = py + ph - 66;
  const bW = (pw - 48 - 16) / 2;
  const bxL = ix;
  const bxR = ix + barW + 52 - bW;
  if (battle.phase === 'ready') {
    // 教程引导：讨伐类任务进行中，「开始战斗」按钮起跳 + 感叹号
    guideFx(bxL, btnY, bW, 50, q && q.type === 'hunt' && q.target === battle.id && !questReady(),
      () => uiButton(bxL, btnY, bW, 50, t('battle.begin'), () => beginFight(), { kind: 'danger', size: 18 }));
    uiButton(bxR, btnY, bW, 50, t('battle.flee'), () => endBattle(), { kind: 'ghost', size: 18 });
  } else if (battle.phase === 'fight') {
    font(14, true);
    ctx.fillStyle = '#8a8171';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t('battle.ongoing'), cx, btnY + 25);
  } else {
    const won = battle.log.some(l => l === t('battle.win'));
    // 教程引导：讨伐类任务首次打完（未提交前），「关闭」按钮起跳 + 感叹号
    const closeGuide = q && q.type === 'hunt' && q.target === battle.id;
    if (won) {
      uiButton(bxL, btnY, bW, 50, t('battle.again'), () => { startBattle(battle.id); beginFight(); }, { kind: 'danger', size: 18 });
      guideFx(bxR, btnY, bW, 50, closeGuide,
        () => uiButton(bxR, btnY, bW, 50, t('battle.close'), () => endBattle(), { kind: 'ghost', size: 18 }));
    } else {
      // 战败：关闭按钮占满整行
      const fullW = bxR + bW - bxL;
      guideFx(bxL, btnY, fullW, 50, closeGuide,
        () => uiButton(bxL, btnY, fullW, 50, t('battle.close'), () => endBattle(), { kind: 'primary', size: 18 }));
    }
  }
}

function statChips(x, y, totalW, h, pairs) {
  const gap = 12;
  const w = (totalW - gap * (pairs.length - 1)) / pairs.length;
  pairs.forEach(([label, val], i) => {
    const cx = x + i * (w + gap);
    ctx.fillStyle = '#efe9d8';
    rr(cx, y, w, h, 8); ctx.fill();
    ctx.fillStyle = '#6b6455'; font(14, true);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label + ' ' + val, cx + w / 2, y + h / 2 + 1);
  });
}



// ---- 属性小格（攻/防这类成对展示） ----

// ---- 顶部提示（toast） ----
function drawToasts() {
  font(15, true);
  ctx.textBaseline = 'middle';
  toasts.forEach((t2, i) => {
    const a = Math.min(1, t2.life - t2.t < 0.3 ? (t2.life - t2.t) / 0.3 : 1);
    ctx.globalAlpha = a;
    const w = ctx.measureText(t2.text).width + 32;
    const y = 104 + i * 42;
    ctx.fillStyle = 'rgba(30,34,30,.88)';
    rr((GAME_W - w) / 2, y, w, 32, 16); ctx.fill();
    ctx.fillStyle = t2.color;
    ctx.textAlign = 'center';
    ctx.fillText(t2.text, GAME_W / 2, y + 17);
    ctx.globalAlpha = 1;
  });
}

// ---- 工厂面板（占位：自动化流水线玩法入口） ----
let factoryTab = 'supply'; // 建筑面板分页：supply(供应) | prod(生产) | research(科研)
let mapPick = false;  // 地图切换弹窗
let invPick = false;  // 仓库弹窗（全部物品 / 分类 / 钉选）

// 仓库弹窗的分类（顺序即显示顺序；新物品归类时往这里加）
const ITEM_GROUPS = [
  { key: 'raw',  items: ['berry', 'leaf', 'wood', 'stone', 'ore', 'copper_ore', 'goat_horn', 'raw_rabbit', 'raw_pork', 'leather'] },
  { key: 'mat',  items: ['ingot', 'copper_ingot', 'iron_rod', 'iron_plate', 'copper_plate', 'wire', 'gear', 'cable'] },
  { key: 'food', items: ['cooked_rabbit', 'cooked_pork', 'herb'] },
  { key: 'gear', items: ['wood_axe', 'wood_pick', 'wood_sword', 'stone_axe', 'stone_pick', 'stone_sword', 'horn_pick', 'iron_axe', 'iron_pick', 'iron_sword', 'leather_armor', 'iron_armor'] },
];
let assignPick = null;     // 「选择」弹窗：{ gi, title, cur, opts: [{ v, label }] }
function modalOpen() { return !!assignPick; } // 弹窗打开期间吞掉拖动滚动（main.js 查询）

// 行内产出卡：横排在任务行下方，单行「图标 名称 当前/上限 (+N/分)」
// +N/分 = 1分钟预期（逐物品各自算），底色与组头耗材芯片同款
function drawStockChips(x, yTop, entries) {
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let cx = x;
  (entries || []).forEach((en) => {
    const label = t('item.' + en.id + '.name');
    const cur = state.inv[en.id] || 0, cap = capOf(en.id);
    const stock = fmt(Math.min(cur, cap)) + '/' + fmt(cap);
    const rate = en.rate != null ? '(+' + fmtRate(en.rate) + t('factory.perMin') + ')' : null;
    font(11, true);
    const nameW = ctx.measureText(label).width;
    const stockW = ctx.measureText(stock).width;
    font(10, true);
    const rateW = rate ? ctx.measureText(rate).width : 0;
    const w = 21 + nameW + 8 + stockW + (rate ? 6 + rateW : 0) + 10;
    ctx.fillStyle = 'rgba(0,0,0,.05)'; rr(cx, yTop, w, 20, 4); ctx.fill();
    drawIcon(en.id, cx + 10, yTop + 10, 14);
    font(11, false); ctx.fillStyle = rarityColor(en.id);
    ctx.fillText(label, cx + 21, yTop + 10);
    font(11, true); ctx.fillStyle = capNumColor(cur, cap);
    ctx.fillText(stock, cx + 21 + nameW + 8, yTop + 10);
    if (rate) {
      font(10, true); ctx.fillStyle = '#7fb069';
      ctx.fillText(rate, cx + 21 + nameW + 8 + stockW + 6, yTop + 10);
    }
    cx += w + 6;
  });
}

// 打开指派弹窗：列出资源点/配方 + 关机；点选即生效
function openAssign(gi) {
  const b = state.builds[gi];
  if (!b || !BUILDINGS[b.t].use) return;
  const opts = [{ v: null, label: t('factory.off') }];
  if (b.t === 'harvester') {
    for (const k of Object.keys(HARVEST_SITES)) {
      const tp = HARVEST_SITES[k];
      const hy = HARVEST_YIELD[tp];
      const main = Object.keys(hy.items)[0];
      const perMin = Math.round(60 * hy.items[main] / hy.time * 10) / 10;
      const rate = Number.isInteger(perMin) ? String(perMin) : perMin.toFixed(1);
      opts.push({ v: k, label: t('node.' + tp + '.name') + (k !== tp ? ' ·2' : '') + ' · ' + hy.time + 's · +' + rate + t('item.' + main + '.name') + t('factory.perMin') });
    }
  } else {
    for (const r of factoryRecipes(b.t)) {
      opts.push({ v: r.id, label: t('recipe.' + r.id + '.name') + ((r.y || 1) > 1 ? ' ×' + r.y : '') + ' · +' + fmtRate(recipeRate(r)) + t('factory.perMin') });
    }
  }
  assignPick = { gi, title: t('factory.bld.' + b.t + '.name'), cur: b.t === 'harvester' ? b.node : b.recipe, opts };
}
function applyAssign(gi, v) {
  const b = state.builds[gi];
  if (!b) { assignPick = null; return; }
  if (b.t === 'harvester') b.node = v;
  else b.recipe = v;
  b.busy = 0; // 换任务后重新开始一轮
  assignPick = null;
  markDirty();
}
// 点行直接切换任务：在「关机 → 各选项」序列里循环到下一个（顺序与弹窗一致）
function cycleAssign(gi) {
  const b = state.builds[gi];
  if (!b || !BUILDINGS[b.t].use) return;
  const vals = [null].concat(b.t === 'harvester' ? Object.keys(HARVEST_SITES) : factoryRecipes(b.t).map(r => r.id));
  applyAssign(gi, vals[(vals.indexOf(b.t === 'harvester' ? b.node : b.recipe) + 1) % vals.length]);
}

// 配方每分钟产出预估：60 × 产出 / 时长（整数不带小数点，小数留 1 位）
function recipeRate(r) { return Math.round(60 * (r.y || 1) / (r.t || 30) * 10) / 10; }
function fmtRate(v) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }

function drawFactoryPanel() {
  const c = drawPanelBase(t('map.plains') + ' · ' + t('factory.title'), 'factory');
  let y = c.y + 2;
  // ---- 页签：供应 / 生产 / 科研（与制作面板同款交互）----
  const tabs = ['supply', 'prod'];
  const tbw = (c.w - (tabs.length - 1) * 8) / tabs.length;
  tabs.forEach((tb, i) => {
    uiButton(c.x + i * (tbw + 8), y, tbw, 36, t('factory.tabs.' + tb), () => { factoryTab = tb; }, {
      kind: factoryTab === tb ? 'primary' : 'ghost', size: 14,
    });
  });
  y += 44;
  // ---- 地图信息框：建筑条 / 应力条（与血条同款：左标签 + 彩条 + 条内数据）/ 资源点 ----
  const supply = stressSupply(), demand = stressDemand(), over = stressOver();
  const BH = over ? 128 : 106;
  ctx.fillStyle = '#f6f1e2'; rr(c.x, y, c.w, BH, 10); ctx.fill();
  ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 1; rr(c.x, y, c.w, BH, 10); ctx.stroke();
  const pad = 12, barW = c.w - pad * 2 - 52;
  // 建筑条：中间显示 已建/上限
  drawBarRow(c.x + pad, y + 12, barW, 18, t('tab.factory'),
    Math.min(1, state.builds.length / MAX_BUILDS), '#c9a86a',
    state.builds.length + '/' + MAX_BUILDS);
  // 应力条：运转中需求 / 总供给（机械动力式纯数值对比，如 36/48 应力）；过载变红
  drawBarRow(c.x + pad, y + 36, barW, 18, t('factory.stress'),
    Math.min(1, supply ? demand / supply : 0), over ? '#e05a4e' : '#7fb069',
    demand + '/' + supply + ' ' + t('factory.stress'));
  if (over) {
    font(13, true); ctx.fillStyle = '#c0392b';
    ctx.textAlign = 'center';
    ctx.fillText(t('factory.over'), c.x + c.w / 2, y + 66);
  }
  // 资源行：图标 开发/上限（满了绿、超编红）；水无限 ♾️
  const rowY = y + (over ? 84 : 62);
  const siteTypes = [...new Set(Object.values(HARVEST_SITES))];
  let sx = c.x + pad;
  siteTypes.forEach(tp => {
    drawIcon(tp, sx + 11, rowY + 14, 24);
    const maxN = Object.values(HARVEST_SITES).filter(v => v === tp).length;
    const dev = state.builds.filter(b => b.t === 'harvester' && b.node && HARVEST_SITES[b.node] === tp).length;
    font(13, true);
    ctx.fillStyle = dev > maxN ? '#c0392b' : (dev === maxN ? '#3f9142' : '#5a5344');
    ctx.textAlign = 'left';
    ctx.fillText(dev + '/' + maxN, sx + 26, rowY + 14);
    sx += 74;
  });
  drawIcon('water', sx + 11, rowY + 14, 24);
  font(13, true); ctx.fillStyle = '#4f8fd0';
  ctx.fillText('∞', sx + 26, rowY + 14);
  y += BH + 14;

  // ---- 建筑分组：同类型一组，组头负责建造/选择，组内每台一行（右上角拆除）----
  const groupRow = (bt) => {
    const def = BUILDINGS[bt];
    const list = state.builds.filter(b => b.t === bt);
    const owned = list.length;
    const isCrank = bt === 'hand_crank';
    // 组头：图标 + 名称×数量 + 应力信息 + 造价 + 动作按钮 + 卡内说明
    const chipRows = costChipRows(def.cost, c.w - 64);
    const CH = 64 + chipRows * 24 + 26;
    // 滚出面板可视区的卡片不注册命中（内容坐标需加上滚动偏移后再与可视区比较）
    const sc = c.key ? (PANEL_SCROLLS[c.key] || 0) : 0;
    const cardVis = y + CH > c.y + sc && y < c.y + c.h + sc + 6;
    ctx.fillStyle = '#fff'; rr(c.x, y, c.w, CH, 10); ctx.fill();
    ctx.strokeStyle = '#e2dac4'; ctx.lineWidth = 1.2; rr(c.x, y, c.w, CH, 10); ctx.stroke();
    drawIcon(bt, c.x + 28, y + 38, 34);
    font(15, true); ctx.fillStyle = '#3c3c30';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t('factory.bld.' + bt + '.name') + (owned ? ' ×' + owned : ''), c.x + 52, y + 15);
    // 第二行：应力信息 + 产出预估（带单位）+ 造价；摇杆的实时蓄能显示在下方建筑行
    font(12, false); ctx.fillStyle = '#8a8171';
    const stressUnit = ' ' + t('factory.stress'); // 「 应力」，后期电力可换成 MW
    let info = '';
    if (!isCrank) {
      // 专门的信息行：一律带单位（应力/分钟、物品/分钟），描述文案里不再重复数字
      if (def.gen) info = '+' + def.gen + stressUnit + t('factory.perMin');
      else {
        // 生产站：按最后一台指派的配方显示每分钟产出预估（含物品名）；没指派则显示应力消耗
        const last = list[list.length - 1];
        const r0 = last ? RECIPES.find(x => x.id === last.recipe) : null;
        info = r0 ? '+' + fmtRate(recipeRate(r0)) + t('item.' + r0.out + '.name') + t('factory.perMin')
                  : '-' + def.use + stressUnit + t('factory.perMin');
      }
    }
    ctx.fillText(info, c.x + 52, y + 34);
    // 造价（图标 + 名字 + 数量，稀有度着色，自动换行）
    drawCostChips(c.x + 52, y + 48, c.w - 64, def.cost);
    // 卡内说明行：数值全部从 data.js 定义读取（改数值不用改文案）
    const dp = isCrank
      ? { per: CRANK.per, max: CRANK.max, sec: CRANK.seconds }
      : { gen: def.gen || 0, use: def.use || 0, time: def.time || 30 };
    font(11, false); ctx.fillStyle = '#a89f8c';
    ctx.fillText(tf('factory.bld.' + bt + '.desc', dp), c.x + 52, y + 48 + chipRows * 24 + 8);
    // 动作按钮状态机：摇杆建后变「手摇」；生产站建后变「选择」；水车一直「建造」
    const maxed = def.max !== undefined && owned >= def.max;
    let label, act, disabled;
    const crankBuilt = isCrank && owned;
    if (def.locked) { label = t('factory.locked'); act = () => {}; disabled = true; }
    else if (crankBuilt) { label = null; act = null; disabled = true; } // 组头不放按钮，操作在建筑行
    else if (maxed) { label = t('factory.built'); act = () => {}; disabled = true; }
    else { label = t('factory.build'); act = () => buildFactory(bt); disabled = !canBuildFactory(bt); }
    if (label && cardVis) uiButton(c.x + c.w - 76, y + (CH - 32) / 2, 66, 32, label, act, { kind: 'primary', size: 13, disabled });
    y += CH + 6;
    // 组内成员：每台一行，右上角拆除；行点击轮换该台任务（含关机档）
    list.forEach((b, li) => {
      const gi = state.builds.indexOf(b);
      let jobText = '', blocked = false, cycle = def.time || 30, pct = 0, barColor = '#7fb069', chipIds = null, jobIcon = null, rowH = 52;
      const isCrankRow = bt === 'hand_crank';
      if (!def.use) {
        if (bt === 'hand_crank') {
          // 摇杆：实时蓄能 + 衰减倒计时进度条（归零即断供）
          jobText = tf('factory.crankNow', { n: state.crank.stacks, s: Math.ceil(state.crank.timer) });
          pct = state.crank.timer > 0 ? state.crank.timer / CRANK.seconds : 0;
          barColor = '#e0a53f';
        } else {
          // 水车这类常驻发电：永远满状态条
          jobText = '+' + def.gen + t('factory.stress') + t('factory.perMin');
          pct = 1;
        }
      } else if (b.t === 'harvester') {
        const site = b.node ? HARVEST_SITES[b.node] : null;
        const hy = b.node ? HARVEST_YIELD[site] : null;
        if (!b.node) {
          jobText = t('factory.off');
        } else {
          // 任务行单行：任务名 #N · 单轮时长；速率预期放下方横排卡片里
          jobText = t('node.' + site + '.name') + (b.node !== site ? ' #2' : '') + ' · ' + hy.time + 's';
          jobIcon = site;
          pct = b.busy > 0 ? Math.min(1, b.busy / hy.time) : 0; // 逐轮推进
          chipIds = Object.keys(hy.items).map(k => ({ id: k, rate: Math.round(60 * hy.items[k] / hy.time * 10) / 10 }));
          rowH = 84;
          // 全部产物都满才停产；部分满照常生产（数量各自标红）
          const keys = Object.keys(hy.items);
          const fullKeys = keys.filter(k => (state.inv[k] || 0) + hy.items[k] > capOf(k));
          if (fullKeys.length === keys.length) {
            blocked = true;
            chipIds = null;
            jobIcon = null;
            rowH = 52;
            jobText = t('factory.full') + '：' + fullKeys.map(k => t('item.' + k + '.name')).join(t('ui.listSep'));
          }
        }
        cycle = hy ? hy.time : 30;
      } else {
        const r = RECIPES.find(x => x.id === b.recipe);
        if (r) {
          jobText = t('recipe.' + r.id + '.name') + ((r.y || 1) > 1 ? ' ×' + r.y : '') + ' · ' + (r.t || 30) + 's';
          jobIcon = r.out; // 任务行带产物图标
          cycle = r.t || 30;
          // 每个产物各自一条速率：主产物 60·y/t，副产物 60·数量/t（未来石油类产率不同）
          chipIds = [{ id: r.out, rate: recipeRate(r) }].concat(
            Object.keys(r.by || {}).map(k => ({ id: k, rate: Math.round(60 * (r.by[k] || 0) / (r.t || 30) * 10) / 10 }))
          );
          rowH = 84;
          pct = b.busy > 0 ? Math.min(1, b.busy / cycle) : 0;
          blocked = !recipeOutputsFit(r); // 主产物或副产物仓库满都会停
          if (blocked) {
            chipIds = null;
            jobIcon = null;
            rowH = 52;
            jobText = t('factory.full') + '：' + t('item.' + r.out + '.name') + ' ' + (state.inv[r.out] || 0) + '/' + capOf(r.out);
          }
        } else jobText = t('factory.off');
      }
      ctx.fillStyle = '#f6f1e2'; rr(c.x + 10, y, c.w - 10, rowH, 10); ctx.fill();
      ctx.strokeStyle = blocked ? '#e0b0a0' : '#e2dac4'; ctx.lineWidth = 1.2; rr(c.x + 10, y, c.w - 10, rowH, 10); ctx.stroke();
      font(14, true); ctx.fillStyle = blocked ? '#c0392b' : '#3c3c30';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('factory.bld.' + bt + '.name') + (owned > 1 ? ' #' + (li + 1) : ''), c.x + 24, y + 14);
      // 任务区：任务单行（图标+名称 #N · 时长）；紧凑行同款间距（标题 y+14 → 任务 y+37）
      const jobX = c.x + (jobIcon ? 42 : 24);
      if (jobIcon && rowH > 42) drawIcon(jobIcon, c.x + 31, y + 37, 14);
      font(12, false); ctx.fillStyle = blocked ? '#c0392b' : '#8a8171';
      ctx.fillText(jobText, jobX, y + 37);
      // 产出卡横排（换行展示，含 1 分钟预期速率）
      if (chipIds && !blocked) drawStockChips(c.x + 24, y + 52, chipIds);
      // 底部进度条：贴底通栏、被卡片圆角裁剪（等价 CSS 的 overflow hidden 底栏）
      ctx.save();
      rr(c.x + 10, y, c.w - 10, rowH, 10); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      ctx.fillRect(c.x + 10, y + rowH - 4, c.w - 10, 4);
      const showBar = pct > 0 && (!def.use || !stressOver()); // 发电建筑常显；生产站过载时熄灭
      if (showBar) {
        ctx.fillStyle = barColor;
        ctx.fillRect(c.x + 10, y + rowH - 4, (c.w - 10) * pct, 4);
      }
      ctx.restore();
      // 行内操作：点行任意处 = 直接切换任务；按钮 = 弹窗指派（摇杆=手摇，其余=选择）
      const sc2 = c.key ? (PANEL_SCROLLS[c.key] || 0) : 0;
      const rowVis = y + rowH > c.y + sc2 && y < c.y + c.h + sc2 + 6; // 滚出可视区：不画按钮、不注册命中（含滚动偏移）
      if (!busyPanel() && rowVis && def.use) reg(c.x + 10, y, c.w - 10, rowH, () => cycleAssign(gi)); // 整行可点切换，先注册让按钮/拆除优先命中
      // 按钮锚定行顶部（y+23），与下方产出卡完全错开
      const midY = y + 23;
      if (isCrankRow) {
        if (rowVis) uiButton(c.x + c.w - 128, y + 5, 66, 28, t('factory.crank'), crankClick, { kind: 'primary', size: 13 });
      } else if (def.use) {
        if (rowVis && !busyPanel()) uiButton(c.x + c.w - 128, midY - 14, 66, 28, t('factory.assign'), () => openAssign(gi), { kind: 'primary', size: 13 });
      }
      ctx.fillStyle = '#f3ede0'; rr(c.x + c.w - 42, midY - 15, 30, 30, 8); ctx.fill();
      ctx.fillStyle = '#c0392b'; font(14, true);
      ctx.textAlign = 'center';
      ctx.fillText('✕', c.x + c.w - 27, midY + 1);
      if (!busyPanel()) reg(c.x + c.w - 44, midY - 19, 32, 38, () => removeBuild(gi));
      y += rowH + 4;
    });
    if (owned) y += 4;
  };
  const groupTitle = (title) => {
    font(15, true); ctx.fillStyle = '#5a5344';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(title, c.x, y + 12);
    y += 24;
  };
  if (factoryTab === 'supply') {
    // 供应页：发电机 + 采集器
    groupTitle(t('factory.gen'));
    ['hand_crank', 'water_wheel'].forEach(groupRow);
    groupTitle(t('factory.supplyGather'));
    ['harvester'].forEach(groupRow);
  } else {
    // 生产页：各类制造机器
    groupTitle(t('factory.prod'));
    ['smelter', 'manufacturer', 'assembler'].forEach(groupRow);
  }
  endPanel('factory', y + 8);

  // ---- 「选择」弹窗：盖在面板最上层，遮罩点击关闭 ----
  if (assignPick) {
    ctx.fillStyle = 'rgba(10,20,16,.45)'; ctx.fillRect(0, 0, GAME_W, GAME_H);
    const optH = 44, pw = 360, ph = 96 + assignPick.opts.length * optH;
    const px = (GAME_W - pw) / 2, py = Math.max(70, (GAME_H - ph) / 2);
    ctx.fillStyle = '#fbf7ec'; rr(px, py, pw, ph, 16); ctx.fill();
    ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 2; rr(px, py, pw, ph, 16); ctx.stroke();
    font(17, true); ctx.fillStyle = '#3c3c30';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(assignPick.title, px + pw / 2, py + 28);
    reg(0, 0, GAME_W, GAME_H, () => { assignPick = null; closePanel(); }); // 遮罩点击：弹窗和建筑面板一起关（先注册，选项优先命中）
    assignPick.opts.forEach((o, oi) => {
      const oy = py + 52 + oi * optH;
      const cur = assignPick.cur === o.v;
      ctx.fillStyle = cur ? '#fff7e0' : '#fff';
      rr(px + 14, oy, pw - 28, optH - 8, 10); ctx.fill();
      ctx.strokeStyle = cur ? '#e0c37a' : '#e2dac4'; ctx.lineWidth = 1.2;
      rr(px + 14, oy, pw - 28, optH - 8, 10); ctx.stroke();
      font(14, cur); ctx.fillStyle = cur ? '#7a4a12' : '#5a5344';
      ctx.textAlign = 'left';
      ctx.fillText((cur ? '✓ ' : '') + o.label, px + 30, oy + (optH - 8) / 2);
      reg(px + 14, oy, pw - 28, optH - 8, () => applyAssign(assignPick.gi, o.v));
    });
    uiButton(px + 14, py + ph - 44, pw - 28, 34, t('ui.cancel'), () => { assignPick = null; }, { kind: 'ghost', size: 14 });
  }
}

function drawResearchPanel() {
  const c = drawPanelBase(t('tab.research'), 'research');
  let y = c.y + 2;
  // ---- 科研页：提交材料永久解锁配方（需求按上限内数量判定，溢出不算）----
  RESEARCH.forEach((r) => {
      const done = researchDone(r.id);
      const can = !done && canResearch(r);
      const chipRows = costChipRows(r.cost, c.w - 160);
      const RH = 64 + chipRows * 24 + 20;
      ctx.fillStyle = done ? '#efe9d8' : '#fff'; rr(c.x, y, c.w, RH, 10); ctx.fill();
      ctx.strokeStyle = '#e2dac4'; ctx.lineWidth = 1.2; rr(c.x, y, c.w, RH, 10); ctx.stroke();
      drawIcon('gear', c.x + 28, y + RH / 2, 34);
      font(16, true); ctx.fillStyle = done ? '#a89f8c' : '#3c3c30';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('research.' + r.id + '.name'), c.x + 62, y + 20);
      font(12, false); ctx.fillStyle = '#8a8171';
      ctx.fillText(t('research.' + r.id + '.desc'), c.x + 62, y + 40);
      // 需求（图标 + 名字 + 数量；按上限内数量判定是否够，溢出不算）
      const chips = {};
      for (const k in r.cost) chips[k] = r.cost[k];
      drawCostChips(c.x + 62, y + 60, c.w - 160, chips);
      uiButton(c.x + c.w - 76, y + (RH - 32) / 2, 66, 32, done ? t('research.done') : t('research.submit'), () => submitResearch(r), {
        kind: 'primary', size: 13, disabled: !can,
      });
      y += RH + 10;
    });
    endPanel('research', y + 8);
    return;
}
