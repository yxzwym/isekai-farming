'use strict';
// ============================================================
// 场景 · 游戏主场景（原 scenes.js「游戏主场景」段）
// 顶部芯片 / 任务追踪 / 采集节点 / 属性条 / 底部按钮
// 地图切换弹窗 / 仓库弹窗
// ============================================================

let mapPick = false;  // 地图切换弹窗
let invPick = false;  // 仓库弹窗（全部物品 / 分类 / 钉选）

// 仓库弹窗的分类（顺序即显示顺序；新物品归类时往这里加）
const ITEM_GROUPS = [
  { key: 'raw',  items: ['berry', 'leaf', 'wood', 'stone', 'ore', 'copper_ore', 'coal', 'mushroom', 'raw_beef', 'goat_horn', 'raw_rabbit', 'raw_pork', 'raw_mutton', 'wool', 'leather', 'limestone', 'raw_wolf_meat', 'slime_gel'] },
  { key: 'mat',  items: ['ingot', 'copper_ingot', 'iron_rod', 'iron_plate', 'copper_plate', 'steel_ingot', 'wire', 'gear', 'cable', 'cloth', 'ash', 'concrete', 'biomass', 'wolf_fang'] },
  { key: 'food', items: ['cooked_rabbit', 'cooked_pork', 'cooked_mutton', 'cooked_beef', 'blueberry', 'mushroom_stew', 'blueberry_steak', 'roasted_mushroom', 'herb', 'ancestor_wisdom', 'carrot', 'carrot_pork_skewer', 'beef_carrot_soup', 'wolf_carrot_stew', 'carrot_berry_stew', 'antidote', 'tonic', 'fury', 'mega_salve'] },
  { key: 'gear', items: ['wood_axe', 'wood_pick', 'wood_sword', 'stone_axe', 'stone_pick', 'stone_sword', 'horn_pick', 'iron_axe', 'iron_pick', 'iron_sword', 'steel_sword', 'wolf_club', 'leather_armor', 'iron_armor', 'steel_armor', 'wolf_armor'] },
];

// ============================================================
// 游戏主场景
// ============================================================
function renderGame() {
  // 面板/战斗/对话期间，场景与底部按钮均不响应
  const busy = dialog.active || battle.active || panelOpen != null;

  // 背景：初始草原 = 草地；黑暗森林 = 幽暗深绿
  const g = ctx.createLinearGradient(0, 0, 0, GAME_H);
  if (state.map === 'dark_forest') {
    g.addColorStop(0, '#2a4638');
    g.addColorStop(1, '#182a21');
  } else if (state.map === 'desert') {
    g.addColorStop(0, '#e8cf9a');
    g.addColorStop(1, '#d4b078');
  } else {
    g.addColorStop(0, '#96d683');
    g.addColorStop(1, '#63b45e');
  }
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
  // 右上：仓库图标按钮（与设置齿轮同款：白底圆角 + 纯图标），点击弹窗查看全部物品
  ctx.fillStyle = 'rgba(255,255,255,.82)'; rr(GAME_W - 86, 8, 36, 40, 12); ctx.fill();
  drawIcon('warehouse', GAME_W - 68, 28, 26);
  if (!busy) reg(GAME_W - 86, 8, 36, 40, () => { invPick = true; });
  // 右上角：设置齿轮（仓库右侧），直达设置面板
  ctx.fillStyle = 'rgba(255,255,255,.82)'; rr(GAME_W - 44, 8, 36, 40, 12); ctx.fill();
  drawIcon('gear', GAME_W - 26, 28, 26);
  if (!busy) reg(GAME_W - 44, 8, 36, 40, () => { panelOpen = 'settings'; });
  // 中间：钉选展示的物品（单行 10 格平分宽度：图标 / 名字 / 数量；点击打开仓库弹窗）
  // 没有勾选物品时显示引导提示（点击同样打开仓库弹窗）
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
      // 数量：只显示当前数量；满/超上限红、≥90% 警告色（配色统一在 ui.js）
      const cur = state.inv[id] || 0, cap = capOf(id);
      const num = fmt(cur);
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

  // 采集节点（按进度逐步出现；未解锁的完全不展示；只渲染当前地图的节点）
  for (const n of NODES) {
    if ((n.map || 'plains') !== state.map || !n.show()) continue;
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
    else if (n.id === 'tree') n.big ? drawTree(0, 0, 1.18, false, true) : drawTree(0, 0, 1);
    else if (n.id === 'stone') drawRock(0, 0);
    else if (n.id === 'iron') drawIronNode(0, 0);
    else if (n.id === 'coal') drawCoalNode(0, 0);
    else if (n.id === 'copper') drawCopperNode(0, 0);
    else if (n.id === 'bbush') drawBush(0, 0, '#5a6fd0'); // 蓝莓丛：结蓝果
    else if (n.id === 'rabbit') drawRabbit(0, 0);
    else if (n.id === 'goat') drawGoat(0, 0, 1);
    else if (n.id === 'ball') drawBall(0, 0);
    else if (n.id === 'bison') drawBison(0, 0);
    else if (n.id === 'treant') drawTreant(0, 0, 1);
    else if (n.id === 'carrot') drawCarrot(0, 0);
    else if (n.id === 'limestone') drawLimestoneNode(0, 0);
    else if (n.id === 'wolf') drawWolf(0, 0);
    else if (n.id === 'skeleton') drawSkeleton(0, 0);
    else if (n.id === 'evil_slime') drawSlime(0, 0, 1);
    else drawBoar(0, 0);
    ctx.restore();
    if (!busy) {
      // 战斗节点命中框略小：给周围的新资源点让出点击区域
      // 战斗节点（站立怪）形体在原点上方：命中框上多下少，避免下方框体盖住下方资源点（如树精吞掉煤矿的点击）
      const hr = Math.max(n.r, 44) * (n.action === 'battle' ? 1.2 : 1.4);
      const bh = n.action === 'battle' ? [hr * 1.1, hr * 0.5] : [hr, hr + 14];
      reg(n.x - hr, n.y - bh[0], hr * 2, bh[0] + bh[1], () => {
        if (n.action === 'battle') startBattle(n.id);
        else doGather(n);
      });
    }
  }

  // 名牌与采集血条：统一画在所有节点之上，避免相邻节点（如铁矿）遮挡
  // 先画完全部名牌、再画全部血条：血条优先于名牌展示，挖矿进度不被相邻节点名牌盖住
  for (const n of NODES) {
    if ((n.map || 'plains') !== state.map || !n.show()) continue;
    const label = t(n.nameKey || ('node.' + n.id + '.name'));
    font(13, true);
    const lw = ctx.measureText(label).width + 20;
    // 采集点第二行：采集站使用量（已指派/点位总数，只统计本图），造出采集站后才显示（前期新手不展示）
    let sub = null, used = 0;
    if (n.action === 'gather' && state.builds.some(b => b.t === 'harvester')) {
      const total = (HARVEST_SITE_MAP[state.map] || []).filter(k => HARVEST_SITES[k] === n.k).length;
      used = state.builds.filter(b => b.t === 'harvester' && b.map === state.map && b.node && HARVEST_SITES[b.node] === n.k).length;
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
    if ((n.map || 'plains') !== state.map || !n.show()) continue;
    // 采集血条（受损时显示分段格）
    const maxH = nodeHitsMax(n.id);
    if (maxH > 1) {
      const cur = nodeHp[n.k] || 0;
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
  // 任务追踪条：声明与绘制都放在节点/名牌/血条之后，保证 UI 视觉最高层（大节点遮不住）
  const q = curQuest();
  const trackY = 8 + topH + 8;
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
  // 点击注册也在节点之后：重叠区域追踪条优先，保证任务面板随时可开
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
  // 血条右侧的攻防/槽位预览区整块可点：直接打开装备面板（与底部「装备」按钮同效）
  if (!busy && !dialog.active && !battle.active) reg(318, 560, GAME_W - 318 - 8, 116, () => { panelOpen = 'equip'; });

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
  else if (panelOpen === 'cheat') drawCheatPanel();

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
  else if (panelOpen === 'cheat') drawCheatPanel();

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
      const mdef = MAPS[id];
      const unlocked = !mdef.unlock || condMet(mdef.unlock);
      ctx.fillStyle = cur ? '#fff7e0' : (unlocked ? '#fff' : '#f3eee0');
      rr(px + 14, oy, pw - 28, 48, 10); ctx.fill();
      ctx.strokeStyle = cur ? '#e0c37a' : '#e2dac4'; ctx.lineWidth = 1.2;
      rr(px + 14, oy, pw - 28, 48, 10); ctx.stroke();
      ctx.globalAlpha = unlocked ? 1 : 0.45;
      drawIcon('map_' + id, px + 40, oy + 24, 30);
      ctx.globalAlpha = 1;
      font(15, cur); ctx.fillStyle = cur ? '#7a4a12' : (unlocked ? '#5a5344' : '#a89f8c');
      ctx.textAlign = 'left';
      // 未解锁的地图不剧透名字（第三张图是占位，只给问号）
      ctx.fillText((cur ? '✓ ' : '') + (unlocked ? t('map.' + id) : '？？？'), px + 64, oy + 24);
      if (!unlocked) {
        font(12, false); ctx.fillStyle = '#b0a890'; ctx.textAlign = 'right';
        ctx.fillText(t('map.locked'), px + pw - 30, oy + 24);
      }
      reg(px + 14, oy, pw - 28, 48, () => {
        if (!unlocked) { toast(t('map.locked'), '#ff9c8a'); return; }
        if (switchMap(id)) mapPick = false;
      });
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
    // 右上角关闭按钮（与任务/制作面板同款）
    ctx.fillStyle = '#eee7d4'; rr(px + pw - 48, py + 12, 32, 32, 10); ctx.fill();
    ctx.fillStyle = '#8a8171'; font(17, true);
    ctx.textAlign = 'center';
    ctx.fillText('✕', px + pw - 32, py + 29);
    // 列表内容高度预估 + 滚动注册（复用主面板的拖拽滚动机制）
    const contentRows = ITEM_GROUPS.reduce((n, g) => n + g.items.filter(id => state.seen[id]).length + (g.items.some(id => state.seen[id]) ? 1 : 0), 0);
    const contentH = contentRows * 44 + 20;
    const max = Math.max(0, contentH - listH);
    PANEL_SCROLL_META['invPop'] = { top: listTop, bottom: listTop + listH, max, contentH, frame: uiFrameNo };
    const sc = PANEL_SCROLLS['invPop'] || 0;
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
    // ✕ 在列表之后注册：命中从后往前取，滚动后点关闭不会被列表残影抢走
    reg(px + pw - 48, py + 12, 32, 32, () => { invPick = false; });
    // 弹窗内滚动条
    if (max > 0) {
      const barH = Math.max(40, listH * listH / contentH);
      const barY = listTop + (listH - barH) * (sc / max);
      ctx.fillStyle = 'rgba(90,83,68,.22)'; rr(px + pw - 12, listTop, 6, listH, 3); ctx.fill();
      ctx.fillStyle = 'rgba(90,83,68,.5)'; rr(px + pw - 12, barY, 6, barH, 3); ctx.fill();
    }
  }
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
  // 右侧：攻防 + 食物槽，同样垂直居中（点击打开装备面板的命中区在 drawGame 里注册，busy 是那边的局部变量）
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
