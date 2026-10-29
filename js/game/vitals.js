'use strict';
// ============================================================
// 游戏逻辑 · 属性与穿戴
// 从原 js/game.js 拆出：派生属性、食物/药草/装备的装填与卸下、
// 装备耐久、战后自动用药。
// ============================================================

// ===== 派生属性 =====
function foodBonus() {
  const b = { hp: 0, stam: 0, mp: 0, atk: 0, def: 0, atkPct: 0 };
  for (const f of state.foodSlots) {
    if (!f || !FOODS[f]) continue;
    const fd = FOODS[f];
    for (const k in b) if (fd[k]) b[k] += fd[k];
  }
  return b;
}
function maxHp() { return BASE.hp + foodBonus().hp; }
function staminaMax() { return STAMINA.max + foodBonus().stam + potionBonus().stam; }
function maxMp() { return BASE.mp + foodBonus().mp; }
function atkVal() {
  const f = foodBonus(), p = potionBonus();
  let a = BASE.atk + f.atk + p.atk;
  const w = state.equip.weapon;
  if (w && ITEMS[w].equip) a += ITEMS[w].equip.atk;
  return Math.floor(a * (1 + f.atkPct + p.atkPct));
}
function defVal() {
  const f = foodBonus();
  let d = BASE.def + f.def;
  const ar = state.equip.armor;
  if (ar && ITEMS[ar].equip) d += ITEMS[ar].equip.def;
  return d;
}
// 物品是否已获得：背包、已装备，或正在使用中（工具那把已从库存拿出）
function hasItem(id) {
  return (state.inv[id] || 0) > 0
    || state.equip.weapon === id || state.equip.armor === id
    || (state.dur[id] || 0) > 0;
}

// 工具类描述的动态参数：从采集产出表提取该工具各资源产出量
// 语言包里用 {wood} {leaf} {stone} {ore} 等占位符，数值只维护在 GATHER_YIELD 一处
function itemDescParams(id) {
  const p = {};
  for (const node in GATHER_YIELD) {
    for (const [tool, y] of GATHER_YIELD[node]) {
      if (tool === id && y) for (const k in y) p[k] = y[k];
    }
  }
  return p;
}

// ===== 食物食用：装填即生效，不预扣库存；每场战斗结束后扣 1 份 =====
// 血量加成是即时光环：装填当下兑现到当前血量，卸下/耗尽同步撤回
function applyFoodHp(food, sign) {
  const g = (FOODS[food] && FOODS[food].hp) || 0;
  if (!g) return;
  state.hp = sign > 0 ? Math.min(maxHp(), state.hp + g) : Math.max(1, state.hp - g);
}
// 耐力同理：加成即时兑现/撤回；耐力平时恒满，只有战斗中每次攻击扣 10
function applyFoodStam(food, sign) {
  const g = (FOODS[food] && FOODS[food].stam) || 0;
  if (!g) return;
  state.stamina = sign > 0 ? Math.min(staminaMax(), state.stamina + g) : Math.max(0, state.stamina - g);
}
function doEquipFood(food) {
  if (dialog.active) return;
  // 战斗准备阶段允许装填食物（备战换装），开战后禁止
  if (battle.active && battle.phase !== 'ready') return;
  if (!FOODS[food]) return;
  if ((state.inv[food] || 0) <= 0) return;
  if (state.foodSlots.includes(food)) return;
  const i = state.foodSlots.indexOf(null);
  if (i === -1) {
    toast(tf('equip.slotsInfo', { n: MAX_FOOD }), '#ff9c8a');
    return;
  }
  // 装填不预扣库存：数量显示与背包一致，战斗结束才真正消耗（与武器盔甲同一套逻辑）
  state.foodSlots[i] = food;
  applyFoodHp(food, 1);  // 血量加成战前即时兑现
  applyFoodStam(food, 1); // 耐力加成即时兑现
  state.counters.equipped++;
  syncReadyVitals(); // 备战时换装：血量上限变了，重跑自动用药并同步血条
  markDirty();
  checkQuestHint();
}
// 战前准备阶段：血量上限/血量变动后重跑自动用药，并把结果同步进战斗血量快照
function syncReadyVitals() {
  if (!battle.active || battle.phase !== 'ready') return;
  autoUseMeds();
  battle.php = Math.max(1, state.hp);
}
function doUnequipFood(i) {
  const f = state.foodSlots[i];
  if (!f) return;
  state.foodSlots[i] = null; // 卸下只是取消加成，不增减库存
  applyFoodHp(f, -1);   // 血量加成同步撤回
  applyFoodStam(f, -1); // 耐力加成同步撤回
  syncReadyVitals();
  markDirty();
}
// ===== 药草槽：装入/取出；装入即检测回血，战斗结束后也会自动使用 =====
function doEquipHerb(i) {
  if ((state.inv.herb || 0) <= 0) return;
  if (state.medSlots[i]) return;
  state.medSlots[i] = 'herb';
  autoUseMeds();
  syncReadyVitals(); // 战前准备：把回血同步进战斗血量快照，药草立即生效
  markDirty();
}
function doUnequipHerb(i) {
  state.medSlots[i] = null;
  markDirty();
}
// 快捷栏点击：槽内有则取下，没有则装入背包中属性最好的未食用食物
function toggleFoodSlot(i) {
  if (dialog.active || battle.active) return;
  if (state.foodSlots[i]) { doUnequipFood(i); return; }
  const avail = Object.keys(FOODS).filter(id =>
    (state.inv[id] || 0) > 0 && !state.foodSlots.includes(id))
    .sort((a, b) => (FOODS[b].hp + FOODS[b].stam) - (FOODS[a].hp + FOODS[a].stam));
  if (!avail.length) return;
  state.foodSlots[i] = avail[0];
  applyFoodHp(avail[0], 1);   // 血量加成即时兑现
  applyFoodStam(avail[0], 1); // 耐力加成即时兑现
  state.counters.equipped++;
  markDirty();
  checkQuestHint();
}
function toggleHerbSlot(i) {
  if (dialog.active || battle.active) return;
  if (state.medSlots[i]) { doUnequipHerb(i); return; }
  doEquipHerb(i);
}

// ===== 药水槽：与食物光环同构（装填即时兑现、战后每瓶扣 1、见底撤回），只收 POTIONS 登记的药水 =====
function potionBonus() {
  const b = { hp: 0, stam: 0, mp: 0, atk: 0, def: 0, atkPct: 0, reduce: 0 };
  for (const p of state.potionSlots) {
    if (!p || !POTIONS[p]) continue;
    const pd = POTIONS[p];
    for (const k in b) if (pd[k]) b[k] += pd[k];
  }
  return b;
}
// 中毒减免总和：多瓶叠加封顶 80%（清不掉毒，只是减伤）
function poisonReduce() { return Math.min(0.8, potionBonus().reduce); }
// 药水的耐力加成即时兑现/撤回（药水没有血量加成，无需 applyPotionHp）
function applyPotionStam(p, sign) {
  const g = (POTIONS[p] && POTIONS[p].stam) || 0;
  if (!g) return;
  state.stamina = sign > 0 ? Math.min(staminaMax(), state.stamina + g) : Math.max(0, state.stamina - g);
}
function doEquipPotion(p) {
  if (dialog.active) return;
  if (battle.active && battle.phase !== 'ready') return; // 备战可换药，开战后禁止
  if (!POTIONS[p]) return;
  if ((state.inv[p] || 0) <= 0) return;
  if (state.potionSlots.includes(p)) return;
  const i = state.potionSlots.indexOf(null);
  if (i === -1) {
    toast(tf('equip.potionInfo', { n: MAX_POTION }), '#ff9c8a');
    return;
  }
  state.potionSlots[i] = p;
  applyPotionStam(p, 1); // 耐力加成即时兑现
  state.counters.equipped++;
  syncReadyVitals();
  markDirty();
  checkQuestHint();
}
function doUnequipPotion(i) {
  const p = state.potionSlots[i];
  if (!p) return;
  state.potionSlots[i] = null;
  applyPotionStam(p, -1); // 耐力加成同步撤回
  syncReadyVitals();
  markDirty();
}
// 药水槽快捷点击：槽内有则取下，没有则装入背包中评分最高的未服用药水
function togglePotionSlot(i) {
  if (dialog.active || battle.active) return;
  if (state.potionSlots[i]) { doUnequipPotion(i); return; }
  const score = id => (POTIONS[id].reduce || 0) * 100 + (POTIONS[id].stam || 0) + (POTIONS[id].atkPct || 0) * 100;
  const avail = Object.keys(POTIONS).filter(id =>
    (state.inv[id] || 0) > 0 && !state.potionSlots.includes(id))
    .sort((a, b) => score(b) - score(a));
  if (!avail.length) return;
  state.potionSlots[i] = avail[0];
  applyPotionStam(avail[0], 1);
  state.counters.equipped++;
  markDirty();
  checkQuestHint();
}

// ===== 装备穿戴：武器一格、盔甲一格，装备时自动换下原有装备 =====
function doEquipGear(id) {
  const meta = ITEMS[id];
  if (!meta || !meta.equip) return;
  if ((state.inv[id] || 0) <= 0) return;
  const slot = meta.equip.atk ? 'weapon' : 'armor';
  if (state.equip[slot] === id) return;
  // 装备不预扣库存：数量显示与背包一致，损坏时才真正消耗
  state.equip[slot] = id;
  if (state.gearDur[id] === undefined) state.gearDur[id] = DURABILITY[id] || 0;
  markDirty();
}
function doUnequipGear(slot) {
  // 卸下只是取消"当前使用"，不增减库存
  state.equip[slot] = null;
  markDirty();
}

// 装备剩余耐久：跟随物品本身（卸下再穿不重置）；未记录的件按满耐久计
function gearDurLeft(id) {
  const v = state.gearDur[id];
  return (typeof v === 'number' && v > 0) ? v : (DURABILITY[id] || 0);
}

// 战斗中消耗装备耐久；损坏时自动换上库存备件，没有则相当于没装备
function useGearDur(slot) {
  const id = state.equip[slot];
  if (!id) return;
  const left = gearDurLeft(id) - 1;
  state.gearDur[id] = left;
  if (left > 0) return;
  if ((state.inv[id] || 0) > 0) state.inv[id]--; // 坏掉的这件从库存扣除
  if ((state.inv[id] || 0) > 0) {
    state.gearDur[id] = DURABILITY[id]; // 备件满耐久上手
    battle.log.push(tf('battle.gearReplaced', { name: t('item.' + id + '.name'), left: state.inv[id] || 0 }));
  } else {
    state.equip[slot] = null;
    delete state.gearDur[id];
    battle.log.push(tf('battle.gearBroke', { name: t('item.' + id + '.name') }));
  }
}

// 战后/使用时自动用药：生命不满时按槽内药草自动恢复到上限
// 返回 { used, healed } 供战斗日志提示
function autoUseMeds() {
  let used = 0, healed = 0;
  for (let i = 0; i < state.medSlots.length && state.hp < maxHp(); i++) {
    const m = state.medSlots[i];
    if (!m || !MEDS[m]) continue;
    while (state.hp < maxHp() && (state.inv[m] || 0) > 0) {
      state.inv[m]--;
      used++;
      const gain = Math.min(maxHp() - state.hp, MEDS[m].heal);
      state.hp += gain;
      healed += gain;
      state.counters.medsUsed++;
    }
    if ((state.inv[m] || 0) <= 0) state.medSlots[i] = null;
  }
  return { used, healed };
}
