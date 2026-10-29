'use strict';
// ============================================================
// 游戏逻辑 · 建筑与生产
// 从原 js/game.js 拆出：应力供需、地图切换、仓储上限与入包、
// 科研、建造/拆除、摇杆、燃烧发电、自动生产推进。
// ============================================================

// ===== 建筑：应力驱动的自动化生产 =====
// 应力是按“每分钟”计的流量：供给 = 摇杆蓄能（点击叠加、限时衰减）+ 水车常驻；
// 需求 > 供给时所有生产建筑停摆。各配方的自动时长与批量见 data 的 t / y 字段
// 风力机出力：单台 9 应力（水车一半），但有群体加成——每多一台全体风力 +5%，封顶 4 倍
// n 台 = n × 9 × min(4, 1 + 0.05n)：20 台追平同数量水车(360)，之后反超，60 台到顶（4×）
function windStress() {
  const n = state.builds.filter(b => b.t === 'wind_turbine' && b.map === state.map).length;
  if (!n) return 0;
  return n * BUILDINGS.wind_turbine.gen * Math.min(4, 1 + n * 0.05);
}
// 应力部分：人力与自然力（摇杆/水车/风车）——前期形态
function stressSupply() {
  // 摇杆蓄能只在本图建有摇杆时生效（蓄能本身全图共享一个计时器）
  const hasCrank = state.builds.some(b => b.t === 'hand_crank' && b.map === state.map);
  let n = hasCrank ? (state.crank.stacks || 0) : 0;
  for (const b of state.builds) {
    if (b.map !== state.map) continue; // 应力按地图结算：各图的供需互不干涉
    if (b.t === 'wind_turbine') continue; // 风力带群体加成，单独结算
    const def = BUILDINGS[b.t];
    if (def.burn && !def.time) continue; // 燃烧电力类（生物质发电机）归电力栏；烧煤的蒸汽机（def.time）出应力
    if (def.burn && !(b.burnLeft > 0)) continue; // 蒸汽机灭火（没燃料）时不供
    n += def.gen || 0;
  }
  return n + windStress();
}
// 电力部分：真正的电力（MW）——生物质发电机等多燃料燃烧建筑，燃着才供
// 电力与应力是两套独立资源：现有采集/制造站全吃应力；电力留给后续的电气设备
function powerSupply() {
  let n = 0;
  for (const b of state.builds) {
    if (b.map !== state.map) continue;
    const def = BUILDINGS[b.t];
    if (!def.burn || def.time || !def.gen) continue; // 蒸汽机（def.time）出应力，不算电力
    if (!(b.burnLeft > 0)) continue;
    n += def.gen;
  }
  return n;
}
function stressDemand() {
  let n = 0;
  for (const b of state.builds) {
    if (b.map !== state.map) continue;
    const def = BUILDINGS[b.t];
    if (!def.use) continue;
    // 只有真正干活的才耗应力：执行中，或待命状态（有任务且随时能开工）；
    // 关机、缺料、产出满的机器一律不计耗，恢复条件后立即重新计入并复产
    if (b.busy > 0 || stationJobReady(b)) n += def.use;
  }
  return n;
}
function stressOver() { return stressDemand() > stressSupply(); } // 只对应力池结算：电力替代不了应力

// 生产站的待命判定：有任务、材料够、仓库放得下——三者齐了就随时开工
function stationJobReady(b) {
  if (b.t === 'harvester') {
    if (!b.node || !HARVEST_SITES[b.node]) return false;
    const hy = HARVEST_YIELD[HARVEST_SITES[b.node]];
    if (!hy) return false;
    // 多产物（如木头+树叶）：只要有一项放得下就继续生产，全部满了才停产
    for (const k in hy.items) if ((state.inv[k] || 0) + hy.items[k] <= capOf(k)) return true;
    return false;
  }
  const r = RECIPES.find(rr => rr.id === b.recipe);
  if (!r || !recipeOutputsFit(r)) return false;
  for (const k in r.cost) if ((state.inv[k] || 0) < r.cost[k]) return false;
  return true;
}

// ===== 地图切换：第二张图接入时，把 NODES/HARVEST_SITES/建筑按地图挂到对应 id 上 =====
function switchMap(id) {
  const def = MAPS[id];
  if (!def || state.map === id) return false;
  if (def.unlock && !condMet(def.unlock)) return false; // 未达成解锁条件的地图进不去
  state.map = id;
  for (const k in nodeHp) delete nodeHp[k]; // 采集进度是临时的，换图即清
  stopAllAuto(); // 换图后原节点的自动采集不再有效
  markDirty();
  return true;
}

// 仓储上限：所有物品都有堆叠上限；存满后自动化卡住、手搓拒绝，逼玩家理产线
// 物品名字的稀有度颜色（未登记的按常见灰处理）
function rarityColor(id) {
  const r = RARITY[id];
  return RARITY_COLORS[r] || RARITY_COLORS.common;
}
// 仓库建筑加成：每座仓库全体物品堆叠容量 +30（仓储是全局的，不限地图）
function warehouseBonus() {
  return state.builds.filter(b => b.t === 'warehouse').length * (BUILDINGS.warehouse.storage || 30);
}
function capOf(id) {
  const base = ITEM_CAPS[id] !== undefined ? ITEM_CAPS[id] : ITEM_CAP_DEFAULT;
  return base + warehouseBonus();
}
// 生产路径的入包：钳制在上限内（自动化/手搓/采集/掉落）
function addItem(id, n) {
  const space = capOf(id) - (state.inv[id] || 0);
  const add = Math.min(n, Math.max(0, space));
  if (add > 0) { state.inv[id] = (state.inv[id] || 0) + add; state.seen[id] = true; }
  return add;
}
// 强制入包：任务奖励、拆建筑返料——允许临时突破上限；超出部分只能消耗，不能产出
function addItemForce(id, n) {
  if (n > 0) state.seen[id] = true;
  state.inv[id] = (state.inv[id] || 0) + n;
  return n;
}
// 解锁/交付类计算专用：突破上限的溢出数量不算，只按上限内的存量计
// （未来的交付任务、科技页材料需求都用这个，不能用 state.inv 原值）
function effInv(id) { return Math.min(state.inv[id] || 0, capOf(id)); }
let lastStorageFullAt = 0;
// 满仓告警：具体到哪些物品放不下（仓库无总量概念，每种物品单独计上限）
function warnStorageFull(items) {
  if (performance.now() - lastStorageFullAt > 2000) {
    lastStorageFullAt = performance.now();
    const names = (items || []).map(k => t('item.' + k + '.name') + ' ' + Math.min(state.inv[k] || 0, capOf(k)) + '/' + capOf(k));
    toast(names.length ? tf('ui.storageFullItem', { items: names.join(t('ui.listSep')) }) : t('ui.storageFull'), '#ff9c8a');
  }
}
// 配方里放不下的产出（主产物 + 副产物）：满仓告警与判定共用，副产物满一样算满
function recipeFullItems(r) {
  const out = [];
  if ((state.inv[r.out] || 0) + (r.y || 1) > capOf(r.out)) out.push(r.out);
  for (const k in (r.by || {})) if ((state.inv[k] || 0) + r.by[k] > capOf(k)) out.push(k);
  return out;
}
// 配方的全部产出（主产物 + 副产物）：入库是否都放得下；副产物满一样算满
function recipeOutputsFit(r) { return recipeFullItems(r).length === 0; }
function produceRecipe(r) {
  addItem(r.out, r.y || 1);
  for (const k in (r.by || {})) addItem(k, r.by[k]);
}

// ===== 科研：提交材料永久解锁配方；需求按上限内数量计（溢出不算，见 effInv）=====
function researchDone(id) { return state.research.includes(id); }
function canResearch(r) {
  for (const k in r.cost) if (effInv(k) < r.cost[k]) return false;
  return true;
}
function submitResearch(r) {
  if (!canResearch(r)) return;
  for (const k in r.cost) state.inv[k] -= r.cost[k]; // 实际扣货（含溢出部分）
  state.research.push(r.id);
  // 揭示该科研解锁的全部配方
  for (const rec of RECIPES) {
    if (rec.res === r.id) toast(tf('ui.recipeUnlocked', { name: t('recipe.' + rec.id + '.name') }), '#ffd479');
  }
  // 揭示该科研解锁的建筑
  for (const bt in BUILDINGS) {
    if (BUILDINGS[bt].research === r.id) toast(tf('ui.bldUnlocked', { name: t('factory.bld.' + bt + '.name') }), '#ffd479');
  }
  markDirty();
}
// hidden 科研的动态揭示：满足 reveal 条件才在科研面板出现
// （采到煤显煤窑、采到铜矿显铜加工、研完煤窑显蒸汽机；reveal 字段见 data）
function researchVisible(r) {
  if (!r.hidden) return true;
  const v = r.reveal || {};
  if (v.item && !hasItem(v.item)) return false;
  if (v.research && !researchDone(v.research)) return false;
  if (v.quest && !condMet(v.quest)) return false;
  return true;
}
// 各生产站可指派的配方：按配方的 m 字段指派机器（面板页签 cat 与机器类型解耦），
// 只列已解锁的。铁棒/铁板/齿轮等材料件归制造站，装备/工具归合成站，冶炼归冶炼站
function factoryRecipes(type) {
  return RECIPES.filter(r => r.m === type && recipeUnlocked(r));
}
function canAffordBuild(bt) {
  const cost = BUILDINGS[bt].cost;
  for (const k in cost) if ((state.inv[k] || 0) < cost[k]) return false;
  return true;
}
// 建造条件：材料够 + 该类未达台数上限（摇杆仅 1 台）+ 地图建筑位未满 + 科研已解锁（风力机）
function canBuildFactory(bt) {
  const def = BUILDINGS[bt];
  if (def.locked) return false; // 暂未开放建造（主线目标类建筑，配方后续再定）
  if (def.research && !researchDone(def.research)) return false; // 科研未完成：保持锁定
  if (def.map && state.map !== def.map) return false; // 限定地图：煤窑只能造森林，蒸汽机只能造草原
  if (def.max !== undefined && state.builds.filter(b => b.t === bt && b.map === state.map).length >= def.max) return false;
  if (state.builds.filter(b => b.map === state.map).length >= MAX_BUILDS) return false; // 建筑位按地图各算 50
  return canAffordBuild(bt);
}
function buildFactory(bt) {
  if (!BUILDINGS[bt] || BUILDINGS[bt].locked || dialog.active) return;
  if (!canBuildFactory(bt)) {
    if (state.builds.filter(b => b.map === state.map).length >= MAX_BUILDS) toast(t('factory.mapFull'), '#ff9c8a');
    return;
  }
  for (const k in BUILDINGS[bt].cost) state.inv[k] -= BUILDINGS[bt].cost[k];
  const b = { t: bt, map: state.map, busy: 0, burnLeft: 0 };
  if (BUILDINGS[bt].burn && !BUILDINGS[bt].time) b.fuel = null; // 多燃料发电机：默认自动按次序烧
  if (BUILDINGS[bt].use) {
    if (bt === 'harvester') b.node = null;
    else b.recipe = null;
  }
  state.builds.push(b);
  toast(tf('ui.crafted', { name: t('factory.bld.' + bt + '.name') }), '#ffd479');
  markDirty();
}
// 拆除：100% 返还造价（允许临时突破仓储上限），随时推倒重规划
function removeBuild(i) {
  if (dialog.active) return;
  const b = state.builds[i];
  if (!b) return;
  if (b.t === 'hand_crank') { state.crank.stacks = 0; state.crank.timer = 0; } // 拆掉摇杆：蓄能清零，重造要重新手摇
  for (const k in BUILDINGS[b.t].cost) addItemForce(k, BUILDINGS[b.t].cost[k]);
  state.builds.splice(i, 1);
  toast(tf('ui.demolished', { name: t('factory.bld.' + b.t + '.name') }), '#ffc966');
  markDirty();
}
// 摇杆：每次点击 +4/分（上限 32/分）并刷新 60 秒时限；时限一过供给归零
function crankClick() {
  state.crank.stacks = Math.min(state.crank.stacks + CRANK.per, CRANK.max);
  state.crank.timer = CRANK.seconds;
  nodeAnim.crank = 1;
  markDirty();
}

// 燃烧类发电：点火烧一轮，燃尽自动续；没燃料就熄火停供
// 蒸汽机（def.time 存在）：burn:{coal:1} 每轮固定耗一份煤，烧 time 秒；
// 生物质发电机（无 def.time）：burn 为各燃料的燃烧秒数 {leaf:9,wood:18,biomass:45}，
// 燃尽后按树叶→木材→生物质的次序点燃（先烧低价值的，生物质攒着当后备能源）
function burnTick(dt) {
  for (const b of state.builds) {
    if (b.map !== state.map) continue; // 人不在的图整厂停摆，燃料也不烧
    const def = BUILDINGS[b.t];
    if (!def.burn) continue;
    if (b.burnLeft > 0) {
      b.burnLeft -= dt;
      if (b.burnLeft > 0) continue;
    }
    let ok = true;
    if (def.time) { // 单燃料定时轮换（蒸汽机）
      for (const k in def.burn) if ((state.inv[k] || 0) < def.burn[k]) { ok = false; break; }
      if (ok) {
        for (const k in def.burn) state.inv[k] -= def.burn[k];
        b.curFuel = Object.keys(def.burn)[0]; // 记录本轮烧的是什么：进度条按时长归一化用
        b.burnLeft = def.time + Math.max(0, b.burnLeft); // 补上燃尽瞬间剩余的小数尾巴
      }
    } else { // 多燃料发电机：指定燃料优先（选择弹窗指派），未指定按次序找背包里有的点燃
      let pick = null;
      if (b.fuel && (state.inv[b.fuel] || 0) >= 1) pick = b.fuel;
      else for (const k in def.burn) if ((state.inv[k] || 0) >= 1) { pick = k; break; }
      ok = !!pick;
      if (ok) {
        state.inv[pick]--;
        b.curFuel = pick;
        b.burnLeft = def.burn[pick] + Math.max(0, b.burnLeft);
      }
    }
    if (ok) markDirty();
    else b.burnLeft = 0;
  }
}

// 自动生产推进：开料即锁料，走满一轮出成品，无缝接下一轮；过载/仓库满/缺料都会卡住不动
function factoryTick(dt) {
  // 摇杆蓄能倒计时：到点归零，供给骤降可能直接过载停摆
  if (state.crank.timer > 0) {
    state.crank.timer -= dt;
    if (state.crank.timer <= 0) { state.crank.timer = 0; state.crank.stacks = 0; markDirty(); }
  }
  burnTick(dt);
  if (stressOver()) return;
  for (const b of state.builds) {
    if (b.map !== state.map) continue; // 各图建筑独立运转：只推进当前图的生产
    const def = BUILDINGS[b.t];
    if (!def.use) continue;
    // 单轮时长：采集站按资源点效率；生产站按配方 t（不同东西做得有快有慢）
    let done = 30, cur = null;
    if (b.t === 'harvester') {
      const hy = b.node ? HARVEST_YIELD[HARVEST_SITES[b.node]] : null;
      if (!hy) continue;
      done = hy.time;
    } else {
      cur = RECIPES.find(rr => rr.id === b.recipe);
      done = cur ? (cur.t || 30) : 30;
    }
    if (b.busy > 0) { // 一轮进行中
      b.busy += dt;
      if (b.busy >= done) {
        b.busy = 0;
        if (b.t === 'harvester') {
          const y = HARVEST_YIELD[HARVEST_SITES[b.node]];
          if (y) for (const k in y.items) addItem(k, y.items[k]);
        } else {
          if (!cur) continue;
          produceRecipe(cur);
        }
        markDirty();
      }
      continue;
    }
    // 空闲：待命（不计应力消耗）——关机/缺料/仓库满都卡在这里，条件一满足立即开工
    if (!stationJobReady(b)) continue;
    if (b.t === 'harvester') {
      b.busy = Math.min(dt, done);
    } else {
      for (const k in cur.cost) state.inv[k] -= cur.cost[k];
      b.busy = Math.min(dt, done);
      markDirty();
    }
  }
}
