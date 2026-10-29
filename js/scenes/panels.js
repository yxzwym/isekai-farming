'use strict';
// ============================================================
// 场景 · 面板（原 scenes.js「面板内容」段）
// 作弊 / 任务 / 装备 / 制作 / 科研面板
// 通用加成文本 + busyPanel 判定
// ============================================================

const armWipe = { armed: false };    // 作弊面板清档重开的二次确认
let craftCat = 'cook';               // 制作面板当前分栏

// ===== 作弊面板（开发测试工具，不做多语言）：console 输入 cheat() 打开 =====
const cheatPick = { id: null };         // 物品增删区：当前选中的物品
const CHEAT_ITEMS = Object.keys(ITEMS); // 物品网格展示顺序（与 data.js 定义序一致）
function drawCheatPanel() {
  const c = drawPanelBase('作弊面板', 'cheat'); // 内容超长可滚动（物品网格会随物品增多变高）
  const sc = c.key ? (PANEL_SCROLLS[c.key] || 0) : 0;
  const rowVis = (y0, h) => y0 + h > c.y + sc && y0 < c.y + c.h + sc + 6; // 滚出可视区的按钮/格子不注册命中
  let y = c.y + 2;
  const bw = (c.w - 10) / 2, bh = 40;
  const row = (a, b) => {
    uiButton(c.x, y, bw, bh, a.label, a.cb, a.o || { size: 15 });
    uiButton(c.x + bw + 10, y, bw, bh, b.label, b.cb, b.o || { size: 15 });
    y += bh + 8;
  };
  row(
    { label: '全部物品 +10', cb: () => cheatAllItems(10) },
    { label: '全部物品 +100', cb: () => cheatAllItems(100) }
  );
  row(
    { label: '科研全开', cb: cheatResearch },
    { label: '跳过当前任务', cb: cheatSkipQuest }
  );
  row(
    { label: 'HP/体力拉满', cb: cheatVitals },
    { label: '摇杆应力拉满', cb: cheatStress }
  );
  row(
    { label: '每种建筑 +1', cb: cheatBuildAll },
    { label: '移除所有物品', cb: cheatClearItems, o: { kind: 'danger', size: 15 } }
  );
  // 清档不可逆：两段确认，与删档按钮同一交互模式；占满整行（滚出可视区不注册命中）
  if (rowVis(y, bh)) uiButton(c.x, y, c.w, bh,
    armWipe.armed ? '再点一次确认清档' : '清档重开',
    () => {
      if (!armWipe.armed) { armWipe.armed = true; toast('再点一次确认：清空存档并重开', '#ffc966'); return; }
      cheatWipe();
    },
    { kind: 'danger', size: 15 });
  y += bh + 8;

  // ---- 选择物品再增加：先点选物品，再点下方数量按钮增删 ----
  y += 2;
  font(12, false);
  ctx.fillStyle = '#a89f8c';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('点选物品，再点下方数量增删', c.x, y + 8);
  if (cheatPick.id) {
    font(13, true);
    ctx.fillStyle = '#c2571f';
    ctx.textAlign = 'right';
    ctx.fillText('已选：' + t('item.' + cheatPick.id + '.name'), c.x + c.w, y + 8);
  }
  y += 20;
  const gs = 36, gap = 5, cols = 9; // 9 列铺满面板宽（428 - 44 内边距），不再左右留白
  const gx0 = c.x + (c.w - (cols * gs + (cols - 1) * gap)) / 2;
  CHEAT_ITEMS.forEach((id, i) => {
    const gx = gx0 + (i % cols) * (gs + gap);
    const gy = y + Math.floor(i / cols) * (gs + gap);
    const sel = cheatPick.id === id;
    ctx.fillStyle = sel ? '#ffe9c9' : '#fff';
    rr(gx, gy, gs, gs, 8); ctx.fill();
    ctx.strokeStyle = sel ? '#e08a3c' : '#e2dac4';
    ctx.lineWidth = sel ? 2 : 1;
    rr(gx, gy, gs, gs, 8); ctx.stroke();
    drawIconCounted(id, gx + gs / 2, gy + gs / 2, 20, state.inv[id] || 0);
    if (rowVis(gy, gs)) reg(gx, gy, gs, gs, () => { cheatPick.id = id; });
  });
  y += Math.ceil(CHEAT_ITEMS.length / cols) * (gs + gap) + 4;
  const qw = (c.w - 3 * 8) / 4;
  const noPick = !cheatPick.id;
  if (rowVis(y, 40)) {
    uiButton(c.x, y, qw, 40, '+1', noPick ? null : () => cheatGiveItem(cheatPick.id, 1), { disabled: noPick, size: 15 });
    uiButton(c.x + qw + 8, y, qw, 40, '+10', noPick ? null : () => cheatGiveItem(cheatPick.id, 10), { disabled: noPick, size: 15 });
    uiButton(c.x + (qw + 8) * 2, y, qw, 40, '+100', noPick ? null : () => cheatGiveItem(cheatPick.id, 100), { disabled: noPick, size: 15 });
    uiButton(c.x + (qw + 8) * 3, y, qw, 40, '清零', noPick ? null : () => {
      state.inv[cheatPick.id] = 0;
      markDirty();
      toast(t('item.' + cheatPick.id + '.name') + ' 已清零', '#ffd479');
    }, { disabled: noPick, kind: 'danger', size: 15 });
  }
  endPanel('cheat', y + 48); // 报备内容底部：超出可视区就出滚动条
}

function drawQuestPanel() {
  const c = drawPanelBase(t('panel.quest'), 'quest');
  const q = curQuest();
  let y = c.y;
  if (q) {
    const p = Math.min(q.count, questProgress(q));
    // 奖励逐条长行（图标 + 名称稀有度 + ×数量），卡片高度按行数自适应
    const rw = q.reward || {};
    const keys = Object.keys(rw).filter(k => rw[k] > 0);
    const rewardH = keys.length ? keys.length * 36 : 18;
    const CH = 218 + rewardH;
    // 当前任务卡片
    ctx.fillStyle = '#fff';
    rr(c.x, y, c.w, CH, 14); ctx.fill();
    ctx.strokeStyle = '#e2dac4'; ctx.lineWidth = 1.5;
    rr(c.x, y, c.w, CH, 14); ctx.stroke();
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
    ctx.fillText(t('quest.reward'), c.x + 18, y + 154);
    if (!keys.length) {
      font(13, false); ctx.fillStyle = '#a89f8c';
      ctx.fillText(t('ui.none'), c.x + 18, y + 172);
    }
    keys.forEach((k, i) => {
      const ry = y + 166 + i * 36;
      ctx.fillStyle = '#f6f1e2';
      rr(c.x + 18, ry, c.w - 36, 30, 8); ctx.fill();
      drawIcon(k, c.x + 36, ry + 15, 20);
      font(13, true);
      ctx.fillStyle = rarityColor(k);
      ctx.textAlign = 'left';
      ctx.fillText(t('item.' + k + '.name'), c.x + 52, ry + 15);
      ctx.fillStyle = '#6b6455';
      ctx.textAlign = 'right';
      ctx.fillText('×' + rw[k], c.x + c.w - 32, ry + 15);
    });
    // 教程引导：任务可提交时，「提交」按钮起跳 + 感叹号（按钮贴卡片底部）
    const btnY = y + CH - 46;
    guideFx(c.x + c.w - 152, btnY, 134, 36, questReady() && !busyPanel(), () =>
      uiButton(c.x + c.w - 152, btnY, 134, 36, t('quest.submit'), () => submitQuest(), {
        kind: 'primary', size: 16, disabled: !questReady(),
      }));
    y += CH + 20;
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
  if (fd.reduce) parts.push(tf('effect.reduce', { n: Math.round(fd.reduce * 100) }));
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
  // ---- 2.5 药水槽（食物槽之下、药物槽之上；仅 POTIONS 可装，逻辑与食物同构） ----
  // 从未拥有过药水就整段隐藏（槽位+列表都不出）：前期用不上，别占面板；
  // 一旦拥有过（potionSeen 记号，进存档）就常显——药水用光了也不藏，免得段落忽隐忽现
  const hasPotion = state.potionSeen || state.potionSlots.some(p => p)
    || Object.keys(POTIONS).some(id => (state.inv[id] || 0) > 0);
  if (hasPotion) state.potionSeen = true;
  if (hasPotion) {
  ctx.fillStyle = '#5a5344'; font(16, true);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(t('equip.potions'), c.x, y + 12);
  y += 26;
  for (let i = 0; i < MAX_POTION; i++) {
    const sx = c.x + i * 132;
    const p = state.potionSlots[i];
    ctx.fillStyle = p ? '#efe7ff' : '#f3eedd';
    rr(sx, y, 120, 64, 10); ctx.fill();
    ctx.strokeStyle = p ? '#b39ae0' : '#d8cfb8'; ctx.lineWidth = 1.5;
    rr(sx, y, 120, 64, 10); ctx.stroke();
    if (p) {
      drawItemCard(sx, y, 120, 64, p, state.inv[p] || 0, t('item.' + p + '.name'), bonusParts(POTIONS[p]), '#efe7ff', '#b39ae0');
      reg(sx, y, 120, 64, () => doUnequipPotion(i)); // 点击整格撤下
    } else {
      font(13, false); ctx.fillStyle = '#b9b09a';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t('equip.empty'), sx + 60, y + 32);
    }
  }
  y += 84;
  // 可服用的药水（减免 > 耐力 > 攻击排序；列表空则给酿造引导行）
  const potions = Object.keys(POTIONS).filter(id =>
    (state.inv[id] || 0) > 0 && !state.potionSlots.includes(id))
    .sort((a, b) => ((POTIONS[b].reduce || 0) * 100 + (POTIONS[b].stam || 0) + (POTIONS[b].atkPct || 0) * 100)
                  - ((POTIONS[a].reduce || 0) * 100 + (POTIONS[a].stam || 0) + (POTIONS[a].atkPct || 0) * 100));
  if (potions.length) {
    for (const id of potions) {
      ctx.fillStyle = '#fff';
      rr(c.x, y, c.w, 48, 10); ctx.fill();
      drawIconCounted(id, c.x + 26, y + 24, 34, state.inv[id]);
      font(15, true); ctx.fillStyle = '#3c3c30';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('item.' + id + '.name'), c.x + 52, y + 18);
      font(12, false); ctx.fillStyle = '#8a8171';
      ctx.fillText(bonusText(POTIONS[id]), c.x + 52, y + 35);
      const full = state.potionSlots.indexOf(null) === -1;
      uiButton(c.x + c.w - 96, y + 7, 84, 34, t('equip.doPotion'), () => doEquipPotion(id), {
        kind: 'primary', size: 14, disabled: full,
      });
      y += 54;
    }
    y += 6;
  }
  } // hasPotion：整段药水区结束
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

function drawResearchPanel() {
  const c = drawPanelBase(t('tab.research'), 'research');
  let y = c.y + 2;
  // ---- 科研页：提交材料永久解锁配方/建筑（需求按上限内数量判定，溢出不算）----
  // hidden 条目按 reveal 条件动态揭示（拿到煤矿显示煤窑科技、拿到铜矿显示铜科技、完成煤窑显示蒸汽机）
  RESEARCH.filter(r => researchVisible(r)).forEach((r) => {
      const done = researchDone(r.id);
      const can = !done && canResearch(r);
      const chipRows = costChipRows(r.cost, c.w - 160);
      // 描述自动换行：先按当前字体量行数定卡高（长描述不再压到提交按钮下面）
      font(12, false);
      const descMax = c.w - 150;
      const descLines = String(t('research.' + r.id + '.desc')).split('\n')
        .reduce((n, p) => n + wrapText(p, descMax).length, 0);
      const descH = descLines * 16;
      const chipsY = y + 32 + descH + 10;
      const RH = (chipsY - y) + chipRows * 24 + 16;
      ctx.fillStyle = done ? '#efe9d8' : '#fff'; rr(c.x, y, c.w, RH, 10); ctx.fill();
      ctx.strokeStyle = '#e2dac4'; ctx.lineWidth = 1.2; rr(c.x, y, c.w, RH, 10); ctx.stroke();
      drawIcon('gear', c.x + 28, y + RH / 2, 34);
      font(16, true); ctx.fillStyle = done ? '#a89f8c' : '#3c3c30';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('research.' + r.id + '.name'), c.x + 62, y + 20);
      drawWrapped(t('research.' + r.id + '.desc'), c.x + 62, y + 32, descMax, 16, done ? '#a89f8c' : '#8a8171', 12, false);
      // 需求（图标 + 名字 + 数量；按上限内数量判定是否够，溢出不算）
      const chips = {};
      for (const k in r.cost) chips[k] = r.cost[k];
      drawCostChips(c.x + 62, chipsY, c.w - 160, chips);
      uiButton(c.x + c.w - 76, y + (RH - 32) / 2, 66, 32, done ? t('research.done') : t('research.submit'), () => submitResearch(r), {
        kind: 'primary', size: 13, disabled: !can,
      });
      y += RH + 10;
    });
    endPanel('research', y + 8);
    return;
}
