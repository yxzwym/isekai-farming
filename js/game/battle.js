'use strict';
// ============================================================
// 游戏逻辑 · 战斗系统（原 game.js「战斗」段）
// 回合互殴：phase ready(查看敌人) → fight(自动你一下我一下) → over(结算)
// ============================================================

// ===== 战斗：回合互殴；耐力不足时该次伤害减半；生命耗尽（<=0）时战败保命撤退（生命锁 1） =====
// 生命不持久：开战时满血（基础 + 食物），打完扣食物重算
// phase: ready(查看敌人) → fight(自动你一下我一下) → over(结算)
const battle = {
  active: false, id: null, ehp: 0, php: 0, estam: 0, log: [], phase: 'ready',
  next: 'player',  // 轮到谁出手
  timer: 0,        // 距下一次出手的倒计时
  pflash: 0,       // 我方受击高亮
  floats: [],      // 战斗内伤害飘字
  quickX: 0,       // 快捷装备行横向滚动偏移
};

function startBattle(id) {
  const e = ENEMIES[id];
  if (!e || dialog.active) return;
  if (battle.active && battle.phase !== 'over') return;
  state.stamina = staminaMax(); // 战前准备耐力恒满；只有战斗中攻击才消耗
  autoUseMeds();               // 战前准备：自动使用装备药品回血；战斗打响后绝不回血，药物只在战前/战后生效
  battle.active = true;
  battle.id = id;
  battle.ehp = e.hp;
  battle.estam = e.stam || 0; // 敌人耐力池：敌人反击消耗，耗尽后反击减半
  battle.php = Math.max(1, state.hp); // 以当前血量开战
  battle.phase = 'ready';
  battle.next = 'player';
  battle.timer = 0;
  battle.pflash = 0;
  battle.floats = [];
  battle.log = [];
}

// 开打（自动你一下我一下）
function beginFight() {
  if (!battle.active || battle.phase !== 'ready') return;
  battle.phase = 'fight';
  battle.next = 'player';
  battle.timer = 0;
}

// 自动战斗推进：按战斗节奏你一下我一下
function tickBattle(dt) {
  if (!battle.active || battle.phase !== 'fight') return;
  battle.timer -= dt;
  if (battle.timer > 0) return;
  const gap = BATTLE_SPEEDS[settings.battleSpeed];
  if (battle.next === 'player') {
    playerAttack();
    if (battle.phase === 'fight') { battle.next = 'enemy'; battle.timer = gap; }
  } else {
    enemyCounter();
    if (battle.phase === 'fight') { battle.next = 'player'; battle.timer = gap; }
  }
}

// 玩家出手
function playerAttack() {
  if (!battle.active || battle.phase !== 'fight') return;
  const e = ENEMIES[battle.id];
  const tired = state.stamina < STAMINA.cost;
  let d = Math.max(1, atkVal() - e.def);
  if (tired) d = Math.max(1, Math.floor(d / 2));
  state.stamina = Math.max(0, state.stamina - STAMINA.cost);
  battle.ehp -= d;
  nodeAnim[battle.id] = 1;
  battle.floats.push({ text: '-' + d, x: 240, y: 150, t: 0, life: 0.8, color: '#e05a4e' });
  useGearDur('weapon');
  battle.log.push(tired ? tf('battle.hitTired', { d }) : tf('battle.hit', { d }));
  if (battle.ehp <= 0) winBattle();
  else markDirty();
}

// 敌人反击：各扣各的耐力——敌人攻击扣敌人自己的耐力池，耗尽后该次反击减半
function enemyCounter() {
  const e = ENEMIES[battle.id];
  const etired = battle.estam < STAMINA.cost;
  let back = Math.max(1, e.atk - defVal());
  if (etired) back = Math.max(1, Math.floor(back / 2));
  battle.estam = Math.max(0, battle.estam - STAMINA.cost);
  battle.php -= back;
  battle.pflash = 0.35;
  battle.floats.push({ text: '-' + back, x: 240, y: 408, t: 0, life: 0.8, color: '#e05a4e' });
  useGearDur('armor');
  battle.log.push(tf(etired ? 'battle.enemyHitTired' : 'battle.enemyHit', { name: t('enemy.' + battle.id + '.name'), d: back }));
  // 带毒敌人（邪恶淤泥）反击后附加毒伤：抗毒药水按减免比例削减，多瓶叠加封顶 80%
  if (e.poison) {
    const pd = Math.max(1, Math.round(e.poison * (1 - poisonReduce())));
    battle.php -= pd;
    battle.pflash = 0.35;
    battle.floats.push({ text: '-' + pd, x: 240, y: 408, t: 0, life: 0.8, color: '#9b59d0' });
    battle.log.push(tf('battle.poisonHit', { name: t('enemy.' + battle.id + '.name'), d: pd }));
  }
  // 生命耗尽才战败；恰好剩 1 点是极限险胜，不判负
  if (battle.php <= 0) {
    battle.php = 1; // 战败保命撤退：生命锁 1
    battle.phase = 'over';
    battle.log.push(t('battle.lose'));
    settleBattle();
  }
  markDirty();
}

// ===== 战斗结算：写回血量、扣食物、自动用药、耐力回满 =====
function settleBattle() {
  state.hp = Math.max(1, Math.ceil(battle.php)); // 保持战斗结果；败者也保住 1 点命
  consumeFoodAfterBattle();
  consumePotionAfterBattle();
  const med = autoUseMeds();
  if (med.used > 0) {
    battle.log.push(tf('battle.herbUsed', { n: med.used, heal: med.healed }));
  }
  state.stamina = staminaMax();
  markDirty();
}

function winBattle() {
  battle.phase = 'over';
  battle.log.push(t('battle.win'));
  const e = ENEMIES[battle.id];
  for (const k in e.drop) {
    const range = e.drop[k];
    const n = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
    const got = addItem(k, n);
    if (got > 0) battle.log.push(tf('ui.gotReward', { name: t('item.' + k + '.name'), n: got }));
  }
  state.counters.hunt[battle.id] = (state.counters.hunt[battle.id] || 0) + 1;
  settleBattle();
  checkQuestHint();
}
function consumeFoodAfterBattle() {
  // 每份已食用食物扣 1 份库存；扣到库存见底则该份加成失效
  let usedOut = false;
  for (let i = 0; i < state.foodSlots.length; i++) {
    const f = state.foodSlots[i];
    if (!f) continue;
    if ((state.inv[f] || 0) > 0) state.inv[f]--;
    if ((state.inv[f] || 0) <= 0) {
      state.foodSlots[i] = null;
      applyFoodHp(f, -1); // 库存见底：加成取消，血量加成部分一并撤回
      battle.log.push(tf('battle.foodUsedOut', { name: t('item.' + f + '.name') }));
      usedOut = true;
    }
  }
  if (usedOut) state.stamina = Math.min(state.stamina, staminaMax());
}
function consumePotionAfterBattle() {
  // 每瓶已服用药水扣 1 份库存；扣到库存见底则该瓶加成失效
  let usedOut = false;
  for (let i = 0; i < state.potionSlots.length; i++) {
    const p = state.potionSlots[i];
    if (!p) continue;
    if ((state.inv[p] || 0) > 0) state.inv[p]--;
    if ((state.inv[p] || 0) <= 0) {
      state.potionSlots[i] = null;
      applyPotionStam(p, -1); // 库存见底：加成取消，耐力加成部分一并撤回
      battle.log.push(tf('battle.foodUsedOut', { name: t('item.' + p + '.name') }));
      usedOut = true;
    }
  }
  if (usedOut) state.stamina = Math.min(state.stamina, staminaMax());
}
function endBattle() {
  if (battle.active && (battle.phase === 'fight' || battle.phase === 'ready')) {
    state.hp = Math.max(1, Math.ceil(battle.php)); // 中途撤退：保持当前血量
    if (battle.phase === 'fight') { // 打响过才算战斗消耗；战前准备撤退不吃食物药水
      consumeFoodAfterBattle();
      consumePotionAfterBattle();
    }
    state.stamina = staminaMax();
  }
  battle.active = false;
  battle.id = null;
  markDirty();
}
