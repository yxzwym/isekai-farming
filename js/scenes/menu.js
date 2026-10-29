'use strict';
// ============================================================
// 场景 · 主菜单与开场剧情（原 scenes.js「更新」「主菜单」「剧情」「对话框」段）
// 帧更新 / 主菜单 / 新游戏与设置面板 / 物品栏显示设置 / 开场剧情 / 对话框
// ============================================================

const SPEAKER_COLORS = { narrator: '#9fb0b8', you: '#bcd7ff', god: '#ffd479', mystery: '#d8a6ff' };

const armNew = { armed: false };     // 新游戏覆盖存档的二次确认
const armDelete = { armed: false };  // 删除存档的二次确认
let armClearCache = false;           // 主页清除缓存的二次确认

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
  let y = c.y + 4;
  y += drawWrapped(t('resbar.note'), c.x, y, c.w, 22, '#8a8171', 13, false) + 16;
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
  // 正文（打字机）：整段文本提前测量布局（每行固定），打字只按字符数逐行裁切显示。
  // 不能对「已显示部分」每帧重排——部分文本与完整文本的断行决策可能不同，行尾会中途跳行
  if (d.wrapFor !== d.idx || d.wrapSrc !== line.text) {
    font(story ? 21 : 19, false);
    d.wrap = wrapText(line.text, bw - 40);
    d.wrapFor = d.idx;
    d.wrapSrc = line.text;
  }
  font(story ? 21 : 19, false);
  ctx.fillStyle = '#eceadf';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  let left = Math.floor(d.shown), cy = by + 56;
  for (const l of d.wrap) {
    if (left <= 0) break;
    ctx.fillText(l.slice(0, left), bx + 20, cy);
    left -= l.length;
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
