// ============================================================
// 数值平衡与战斗规则断言套件（零依赖，由 tests/harness.js 加载）
// 运行：osascript -l JavaScript tests/harness.js
//
// 设计铁律（用户裁决，改数值前先读）：
// 1. 门票链：每个怪「当时能拿到的最好装备+最好食物刚好能打过」，
//    装备/食物必须遵守获取顺序（上一场的掉落解锁下一场的装备）
// 2. 耐力各扣各：玩家攻击扣玩家耐力池（state.stamina），
//    敌人反击扣敌人耐力池（battle.estam），每次出手固定 10 点，
//    池子见底后该次出手伤害减半但可无限继续
// 3. 胜负：battle.php <= 0 才战败（败者置 1 保命撤退）；
//    php = 1 且敌人已倒是极限险胜算赢
// 4. 不手推数值：所有断言基于 debugFight 真实模拟输出，
//    期望值与 world.js ENEMIES 注释账目互为校验
// ============================================================
(() => {
  let passCount = 0, failCount = 0;
  const lines = [], report = [];
  function check(name, actual, expect) {
    const ok = actual === expect;
    ok ? passCount++ : failCount++;
    if (!ok) lines.push('FAIL  ' + name + '  expect=' + expect + ' actual=' + actual);
  }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }

  // ===== debugFight：战斗调试器（想知道打不打得过，传敌人和装备直接模拟，不手推）=====
  // 用法：debugFight('bison', { w:'iron_sword', a:'iron_armor',
  //        foods:['cooked_beef','blueberry_steak','mushroom_stew'] })
  // cfg = { w 武器, a 护甲, foods 食物槽, potions 药水槽, stock 库存份数,
  //         gearHp 强制耐久, inv 额外背包 }
  // 返回真实战报；同时把一行摘要记入 report，测试结束后统一打印
  function debugFight(enemy, cfg) {
    battle.active = false; battle.phase = 'ready';
    state = defaultState();
    state.equip.weapon = cfg.w || null;
    state.equip.armor = cfg.a || null;
    const stock = cfg.stock || 1;
    for (const f of cfg.foods) state.inv[f] = stock;
    state.foodSlots = cfg.foods.slice();
    if (cfg.potions) {
      for (const p of cfg.potions) if (p) state.inv[p] = stock;
      state.potionSlots = cfg.potions.slice();
    }
    if (cfg.w) state.gearDur[cfg.w] = cfg.gearHp !== undefined ? cfg.gearHp : DURABILITY[cfg.w];
    if (cfg.a) state.gearDur[cfg.a] = cfg.gearHp !== undefined ? cfg.gearHp : DURABILITY[cfg.a];
    if (cfg.inv) for (const k in cfg.inv) state.inv[k] = cfg.inv[k];
    state.hp = BASE.hp + foodBonus().hp;
    startBattle(enemy);
    beginFight();
    // 出手计数包裹：验证「耐力各扣各」与击数
    let pHits = 0, eHits = 0, minStam = Infinity;
    const _pa = playerAttack, _ec = enemyCounter;
    playerAttack = function () { _pa(); pHits++; if (battle.phase === 'fight') minStam = Math.min(minStam, state.stamina); };
    enemyCounter = function () { _ec(); eHits++; };
    let g = 0;
    while (battle.phase === 'fight' && g++ < 600) tickBattle(1);
    playerAttack = _pa; enemyCounter = _ec;
    const loseLocked = battle.php === 1 && state.hp === 1 && battle.phase === 'over' && battle.ehp > 0;
    const out = {
      enemy, php: battle.php, ehp: battle.ehp, phase: battle.phase,
      hp0: state.hp, // 战后：食物已扣
      stamMax: staminaMax(), // 战后池（食物已扣时 ≠ 战前）
      foodSlots: state.foodSlots.slice(), potionSlots: state.potionSlots.slice(),
      pHits, eHits, minStam,
      estam: battle.estam,
      equip: { weapon: state.equip.weapon, armor: state.equip.armor },
      gearDur: { w: state.gearDur[cfg.w], a: state.gearDur[cfg.a] },
      invW: state.inv[cfg.w],
      loseLocked,
      win: battle.php > 0 && !loseLocked,
    };
    report.push(
      pad(enemy, 11) + pad(cfg.w || '(徒手)', 12) + pad(cfg.a || '-', 13) +
      'php=' + pad(out.php, 4) + 'ehp=' + pad(out.ehp, 4) +
      '玩家' + pad(out.pHits + '击', 5) + '敌人' + pad(out.eHits + '击', 5) +
      '敌耐余' + pad(out.estam, 4) +
      (out.loseLocked ? '锁败' : out.win ? '胜' : '异常')
    );
    return out;
  }

  // ===== 1. 门票胜局（精确断言剩血；配置严格遵守获取顺序）=====
  // 兔子：徒手+浆果，碾压级
  let r = debugFight('rabbit', { w: null, a: null, foods: ['berry'] });
  check('win-rabbit.php', r.php, 22);
  // 野猪：木剑门票（craft-woodaxe）；皮甲要打完野猪才有 → 无甲
  r = debugFight('boar', { w: 'wood_sword', a: null, foods: ['cooked_rabbit', 'berry'] });
  check('win-boar.php', r.php, 15);
  // 山羊：石剑+皮甲+双肉餐（hunt-boar 解锁）
  r = debugFight('goat', { w: 'stone_sword', a: 'leather_armor',
    foods: ['cooked_rabbit', 'cooked_pork', 'berry'] });
  check('win-goat.php', r.php, 13);
  // 球球人：森林首怪≈山羊强度，铁装轻松
  r = debugFight('ball', { w: 'iron_sword', a: 'iron_armor',
    foods: ['cooked_mutton', 'cooked_pork', 'berry'] });
  check('win-ball.php', r.php, 39);
  // 野牛：铁装+牛蓝排煲（煲的耐力+牛排的血量）
  r = debugFight('bison', { w: 'iron_sword', a: 'iron_armor',
    foods: ['cooked_beef', 'blueberry_steak', 'mushroom_stew'] });
  check('win-bison.php', r.php, 33);
  // 树精：铁装+煲蓝排牛（煲的耐力+蓝排的血量就是门票）
  r = debugFight('treant', { w: 'iron_sword', a: 'iron_armor',
    foods: ['mushroom_stew', 'blueberry_steak', 'cooked_beef'] });
  check('win-treant.php', r.php, 11);
  // 野狼：钢装+沙漠三件套
  r = debugFight('wolf', { w: 'steel_sword', a: 'steel_armor',
    foods: ['carrot_pork_skewer', 'beef_carrot_soup', 'wolf_carrot_stew'] });
  check('win-wolf.php', r.php, 29);
  // 野狼平推对照：钢装+森林餐也能过（毕业装平推首怪）
  r = debugFight('wolf', { w: 'steel_sword', a: 'steel_armor',
    foods: ['mushroom_stew', 'blueberry_steak', 'cooked_beef'] });
  check('win-wolf-forest.php', r.php, 14);
  // 骷髅：钢装+狼煲/汤/串（沙漠新食物就是门票）
  r = debugFight('skeleton', { w: 'steel_sword', a: 'steel_armor',
    foods: ['wolf_carrot_stew', 'beef_carrot_soup', 'carrot_pork_skewer'] });
  check('win-skeleton.php', r.php, 5);
  // 淤泥 boss：钢装+怒气+抗毒+劲力+三件套——极限过
  r = debugFight('evil_slime', { w: 'steel_sword', a: 'steel_armor',
    foods: ['carrot_pork_skewer', 'beef_carrot_soup', 'wolf_carrot_stew'],
    potions: ['tonic', 'antidote', 'fury'] });
  check('win-slime.php', r.php, 5);

  // ===== 2. 必败对照（锁败：php 锁 1 且 state.hp 锁 1 且敌人还活着）=====
  r = debugFight('boar', { w: null, a: null, foods: ['berry'] });
  check('lose-boar-fist.locked', r.loseLocked, true);
  r = debugFight('goat', { w: 'wood_sword', a: 'leather_armor',
    foods: ['cooked_rabbit', 'cooked_pork', 'berry'] });
  check('lose-goat-wood.locked', r.loseLocked, true);
  r = debugFight('ball', { w: 'stone_sword', a: 'leather_armor',
    foods: ['cooked_rabbit', 'cooked_pork', 'berry'] });
  check('lose-ball-stone.locked', r.loseLocked, true);
  // 野牛草原餐：磨得动但承不住
  r = debugFight('bison', { w: 'iron_sword', a: 'iron_armor',
    foods: ['cooked_mutton', 'cooked_pork', 'berry'] });
  check('lose-bison-plains.locked', r.loseLocked, true);
  r = debugFight('bison', { w: 'stone_sword', a: 'leather_armor',
    foods: ['cooked_beef', 'blueberry_steak', 'mushroom_stew'] });
  check('lose-bison-stone.locked', r.loseLocked, true);
  // 树精牛煲蓝莓：缺蓝莓牛排的血量，差 7 败
  r = debugFight('treant', { w: 'iron_sword', a: 'iron_armor',
    foods: ['cooked_beef', 'mushroom_stew', 'blueberry'] });
  check('lose-treant-nosteak.locked', r.loseLocked, true);
  r = debugFight('treant', { w: 'stone_sword', a: 'leather_armor',
    foods: ['mushroom_stew', 'blueberry_steak', 'cooked_beef'] });
  check('lose-treant-stone.locked', r.loseLocked, true);
  r = debugFight('wolf', { w: 'iron_sword', a: 'iron_armor',
    foods: ['mushroom_stew', 'blueberry_steak', 'cooked_beef'] });
  check('lose-wolf-iron.locked', r.loseLocked, true);
  r = debugFight('skeleton', { w: 'steel_sword', a: 'steel_armor',
    foods: ['mushroom_stew', 'blueberry_steak', 'cooked_beef'] });
  check('lose-skeleton-forest.locked', r.loseLocked, true);
  // 淤泥三卡：无怒气 / 无抗毒 / 森林餐 / 铁装
  r = debugFight('evil_slime', { w: 'steel_sword', a: 'steel_armor',
    foods: ['carrot_pork_skewer', 'beef_carrot_soup', 'wolf_carrot_stew'],
    potions: ['tonic', 'antidote', null] });
  check('lose-slime-nofury.locked', r.loseLocked, true);
  r = debugFight('evil_slime', { w: 'steel_sword', a: 'steel_armor',
    foods: ['carrot_pork_skewer', 'beef_carrot_soup', 'wolf_carrot_stew'],
    potions: ['tonic', null, 'fury'] });
  check('lose-slime-noantidote.locked', r.loseLocked, true);
  r = debugFight('evil_slime', { w: 'steel_sword', a: 'steel_armor',
    foods: ['mushroom_stew', 'blueberry_steak', 'cooked_beef'],
    potions: ['tonic', 'antidote', 'fury'] });
  check('lose-slime-forest.locked', r.loseLocked, true);
  r = debugFight('evil_slime', { w: 'iron_sword', a: 'iron_armor',
    foods: ['carrot_pork_skewer', 'beef_carrot_soup', 'wolf_carrot_stew'],
    potions: ['tonic', 'antidote', 'fury'] });
  check('lose-slime-iron.locked', r.loseLocked, true);

  // ===== 3. 耐力各扣各（树精门票战实录）=====
  r = debugFight('treant', { w: 'iron_sword', a: 'iron_armor',
    foods: ['mushroom_stew', 'blueberry_steak', 'cooked_beef'] });
  check('stamina.playerHits', r.pHits, 10);  // 5伤×10击恰好48
  check('stamina.enemyCounters', r.eHits, 9); // 9 次反击（第 10 击致命不挨打）
  check('stamina.playerMin', r.minStam, 10); // 第 9 击后余 10，第 10 击全力扣光（致死击后不再记录）
  check('stamina.enemyLeft', r.estam, 0);    // 敌池 80 - 9 反击 × 10，钳 0；末击疲劳减半（伤 5）

  // ===== 4. 食物/药水槽去重（同一物品只装一份）=====
  battle.active = false;
  state = defaultState();
  state.inv.mushroom_stew = 5;
  doEquipFood('mushroom_stew');
  doEquipFood('mushroom_stew');
  check('dedupe.food', state.foodSlots.filter(f => f === 'mushroom_stew').length, 1);
  state.inv.antidote = 5;
  doEquipPotion('antidote');
  doEquipPotion('antidote');
  check('dedupe.potion', state.potionSlots.filter(p => p === 'antidote').length, 1);

  // ===== 5. 装备耐久：武器按攻击、护甲按被击、坏换备件、无备件即裸装 =====
  // 野猪木剑 4 击：耐久 15 → 11
  r = debugFight('boar', { w: 'wood_sword', a: null, foods: ['cooked_rabbit', 'berry'] });
  check('dur.weaponPerHit', r.gearDur.w, DURABILITY.wood_sword - 4);
  // 山羊战：石剑 5 击、皮甲 4 次被击
  r = debugFight('goat', { w: 'stone_sword', a: 'leather_armor',
    foods: ['cooked_rabbit', 'cooked_pork', 'berry'] });
  check('dur.armorPerHit', r.gearDur.a, DURABILITY.leather_armor - 4);
  // 坏换备件：耐久 1 + 库存 2 → 第一击损坏，备件满耐久上手，4 击后剩 12
  r = debugFight('boar', { w: 'wood_sword', a: null,
    foods: ['cooked_rabbit', 'berry'], gearHp: 1, inv: { wood_sword: 2 } });
  check('dur.spare.taken', r.invW, 1);
  check('dur.spare.reset', r.gearDur.w, DURABILITY.wood_sword - 3);
  check('dur.spare.equipped', r.equip.weapon, 'wood_sword');
  // 无备件：损坏即裸装（武器槽清空、耐久记录删除）
  r = debugFight('boar', { w: 'wood_sword', a: null,
    foods: ['cooked_rabbit', 'berry'], gearHp: 1, inv: {} });
  check('dur.broken.unequipped', r.equip.weapon, null);
  check('dur.broken.purged', state.gearDur.wood_sword === undefined, true);

  // ===== 6. 消耗品扣除：战后每份食物/药水 -1；库存见底槽清空 =====
  // 库存充足：扣 1 份，槽保留
  r = debugFight('treant', { w: 'iron_sword', a: 'iron_armor', stock: 2,
    foods: ['mushroom_stew', 'blueberry_steak', 'cooked_beef'] });
  check('consume.food.deducted', state.inv.mushroom_stew, 1);
  check('consume.food.kept', r.foodSlots.includes('mushroom_stew'), true);
  // 库存见底：槽清空、加成撤回
  r = debugFight('treant', { w: 'iron_sword', a: 'iron_armor', stock: 1,
    foods: ['mushroom_stew', 'blueberry_steak', 'cooked_beef'] });
  check('consume.food.runout.slot', r.foodSlots.filter(Boolean).length, 0);
  check('consume.food.runout.bonus', foodBonus().hp, 0);
  // 药水战后每瓶 -1
  r = debugFight('evil_slime', { w: 'steel_sword', a: 'steel_armor', stock: 3,
    foods: ['carrot_pork_skewer', 'beef_carrot_soup', 'wolf_carrot_stew'],
    potions: ['tonic', 'antidote', 'fury'] });
  check('consume.potion.deducted', state.inv.fury, 2);
  check('consume.potion.kept', r.potionSlots.includes('fury'), true);

  return '== ' + passCount + ' passed, ' + failCount + ' failed ==\n' +
    (failCount ? lines.join('\n') + '\n' : 'ALL OK\n') +
    '---- 战斗模拟实录（debugFight）----\n' + report.join('\n');
})()
