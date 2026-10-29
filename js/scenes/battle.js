'use strict';
// ============================================================
// 场景 · 战斗界面（原 scenes.js「战斗界面」段）
// 通用：按敌人 id 取绘制函数，未收录的走通用走兽画法
// ============================================================

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
  // 敌人属性格：火焰系/带毒敌人在开打前就把特殊伤害亮出来，玩家可据此备药备装
  const eChips = [
    [t('stat.atkFull'), e.atk],
    [t('stat.defFull'), e.def],
  ];
  if (e.poison) eChips.push([t('stat.poison'), e.poison]);
  statChips(ix, py + 294, barW + 52, 22, eChips);

  // ---- 对战信息（日志） ----
  // 结算行（胜利/战败及其后的奖励行）必须完整可见：日志条数超过窗口时前移窗口起点，
  // 丢掉更早的过程行也不能把「获得了什么」挤出去
  const resAt = Math.max(battle.log.indexOf(t('battle.win')), battle.log.indexOf(t('battle.lose')));
  let logs = battle.log.slice(-10);
  if (resAt >= 0 && resAt < battle.log.length - 10) {
    const tailN = battle.log.length - resAt; // 结算行条数（含起点行）
    logs = battle.log.slice(Math.max(0, resAt - (10 - tailN)));
  }
  font(12, false);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const gotPrefix = t('ui.gotPrefix');
  let ly = py + 340;
  for (const l of logs) {
    ctx.fillStyle = l.indexOf(gotPrefix) === 0 ? '#b07a12' : '#555043'; // 奖励行金色，一眼看到战利品
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
  state.potionSlots.forEach(p => { if (p) cards.push({ icon: p, count: state.inv[p] || 0, title: t('item.' + p + '.name'), subs: bonusParts(POTIONS[p]) }); });
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

// ---- 属性小格（攻/防这类成对展示） ----
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
