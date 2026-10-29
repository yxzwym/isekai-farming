'use strict';
// ============================================================
// 游戏逻辑 · 玩家操作
// 从原 js/game.js 拆出：长按自动采集、自动化教学提示、
// 采集全套（档位判定/工具耐久/产出入包）、制作全套（手搓/自动制作）。
// ============================================================

// ===== 长按自动采集：按住 0.5s/次；按住满 3s 开启常驻，点击任意处取消 =====
const autoGather = { node: null, holdT: 0, timer: 0, enabled: false };
function autoGatherTick(dt) {
  if (!autoGather.enabled && !autoGather.node) return;
  if (!state || scene !== 'game' || dialog.active || battle.active || panelOpen) {
    stopHoldGather();
    return;
  }
  if (autoGather.enabled) {
    // 常驻模式：松手继续，点击任意处才取消
    autoGather.timer -= dt;
    if (autoGather.timer <= 0) {
      autoGather.timer = AUTO_GATHER.interval;
      const n = NODES.find(nd => (nd.map || 'plains') === state.map && nd.k === autoGather.node);
      if (n && n.show() && n.action === 'gather') doGather(n);
      else { stopAllAuto(); }
    }
    return;
  }
  // 按住中
  autoGather.holdT += dt;
  autoGather.timer -= dt;
  if (autoGather.timer <= 0) {
    autoGather.timer = AUTO_GATHER.interval;
    const n = NODES.find(nd => (nd.map || 'plains') === state.map && nd.k === autoGather.node);
    if (n && n.action === 'gather') doGather(n);
  }
  if (autoGather.holdT >= AUTO_GATHER.holdToStart) {
    autoGather.enabled = true;
    autoGather.timer = AUTO_GATHER.interval;
    dismissAutoHint(); // 首次触发自动化：撤教学提示，存档标记不再出现
    toast(t('ui.autoGatherOn'), '#ffc966', true);
  }
}
function startHoldGather(nodeId) {
  if (autoGather.enabled) return;
  autoGather.node = nodeId;
  autoGather.holdT = 0;
  autoGather.timer = AUTO_GATHER.interval;
}
function stopHoldGather() {
  if (autoGather.enabled) return; // 常驻模式不受松手影响
  autoGather.node = null;
  autoGather.holdT = 0;
  autoGather.timer = 0;
}
function cancelAutoGather() {
  if (autoGather.enabled) {
    autoGather.enabled = false;
    autoGather.node = null;
    autoGather.timer = 0;
    return true;
  }
  return false;
}

// ===== 长按自动化教学 =====
// 与大树解锁同一逻辑：伐木取材任务触发（cook-rabbit 烤兔肉完成提交）的那一刻弹一次常驻提示，
// 玩家首次触发自动化（长按）后标记存档并撤掉提示，之后永不出现
let autoHintPushed = false; // 本次进游戏的内存哨兵：教学提示只 push 一次
function showAutoHint() {
  if (!state || state.autoHintDone || autoHintPushed) return;
  if (!state.questDone.includes('cook-rabbit')) return; // 树还没出现（伐木取材任务未触发），不提示
  autoHintPushed = true;
  toast(t('ui.autoHint'), '#ffc966', true);
}
function dismissAutoHint() {
  if (!state || state.autoHintDone) return;
  state.autoHintDone = true;
  markDirty();
  clearStickyToast();
}
// 按下任意处：停止所有自动化（自动采集/自动制作）
function stopAllAuto() {
  autoGather.enabled = false;
  autoGather.node = null;
  autoGather.holdT = 0;
  autoGather.timer = 0;
  autoCraft.recipe = null;
  autoCraft.timer = 0;
  clearStickyToast();
}

// ===== 采集 =====
// 当前档位的产出（与 gatherInfo 同一套力量判定）；tier0 为 null 表示需要工具才能采集
function gatherYield(node) {
  const info = gatherInfo(node);
  return info ? info.y : null;
}
// 该节点正在生效的工具 id（用于扣耐久），没有则 null
function activeTool(node) {
  const info = gatherInfo(node);
  return info && info.tool && DURABILITY[info.tool] ? info.tool : null;
}
// 手头已拥有的同型工具（id 后缀 _axe/_pick）最高力量
function bestToolPower(kind) {
  let p = 0;
  for (const id in DURABILITY) {
    const it = ITEMS[id];
    if (it && it.power && id.endsWith('_' + kind) && hasItem(id) && it.power > p) p = it.power;
  }
  return p;
}
// 手头最强的一把同型工具（采集时实际消耗它的耐久）
function strongestTool(kind) {
  let best = null;
  for (const id in DURABILITY) {
    const it = ITEMS[id];
    if (it && it.power && id.endsWith('_' + kind) && hasItem(id) && (!best || it.power > ITEMS[best].power)) best = id;
  }
  return best;
}
// 当前档位信息：产出 + 采集血量 + 生效工具
// 每档第 4 元素为力量需求：空手只有 0 档；工具档只要手头任意同型工具力量达标即可
function gatherInfo(node) {
  const tiers = GATHER_YIELD[node];
  if (!tiers) return null;
  let best = null;
  for (const [tool, y, hits, req] of tiers) {
    if (!y) continue;
    const need = req || 0;
    if (!tool) { // 空手档：仅限无需力量时
      if (need === 0 && !best) best = { y, hits: hits || 1, tool: null, power: 0 };
      continue;
    }
    // 力量达标就能挖：不要求恰好是档位标注的那把工具（石镐可顶木镐的档）
    const kind = tool.slice(tool.lastIndexOf('_') + 1); // axe / pick
    const bp = bestToolPower(kind);
    if (bp < need || (need === 0 && bp === 0)) continue; // need=0 的工具档仍需拥有该型工具
    const actual = strongestTool(kind);
    // 同档优先选与实际工具匹配的档（攻次数/产出按真实工具计，如角镐 2 击不套给石镐）
    const match = actual === tool;
    if (!best || need > best.power || (need === best.power && match && !best.match)) {
      best = { y, hits: hits || 1, tool: actual, power: need, match };
    }
  }
  return best;
}
// 节点采集血量：当前档位下需要点击的格数
function nodeHitsMax(node) {
  const info = gatherInfo(node);
  return info ? (info.hits || 1) : 0;
}
// 从库存取一把工具上手（满耐久）；库存为空则拿不到
function takeTool(id) {
  if ((state.dur[id] || 0) > 0) return true;
  if ((state.inv[id] || 0) > 0) {
    state.inv[id]--;
    state.dur[id] = DURABILITY[id];
    return true;
  }
  return false;
}
// 工具使用一次；损坏时提示（下次使用自动从库存换新）
function useTool(id) {
  state.dur[id] = (state.dur[id] || 0) - 1;
  if (state.dur[id] <= 0) {
    state.dur[id] = 0;
    toast(tf('ui.toolBroke', { name: t('item.' + id + '.name'), left: state.inv[id] || 0 }), '#ff9c8a');
  }
}
// 节点采集进度：正向计数（1/N … N/N），满格收获并清零进入下一轮
// 临时进度，不入存档：切地图即清，重开游戏从头攒
const nodeHp = {}; // { 采集点实例 k: 已推进格数 }
let lastNeedToolAt = 0;
function doGather(node) {
  if (dialog.active || battle.active) return;
  const id = node.id;
  if (gatherInfo(id) === null) {
    // 没有任何可用档：缺工具，提示所需的具体工具（石矿/铁矿等 tier0 无产出的节点）
    if (performance.now() - lastNeedToolAt > 2000) {
      lastNeedToolAt = performance.now();
      const tier = GATHER_YIELD[id].find(tr => tr[1]);
      if (tier) {
        const key = id === 'tree' ? 'gather.needAxe' : 'gather.needPick';
        toast(tf(key, { power: tier[3] || 0 }), '#ff9c8a');
      }
    }
    return;
  }
  const maxH = nodeHitsMax(id);
  if (!maxH) return;
  nodeAnim[id] = 1;
  const np = (nodeHp[node.k] || 0) + 1;
  if (np < maxH) { nodeHp[node.k] = np; return; }
  nodeHp[node.k] = 0;
  const tool = activeTool(id);
  if (tool && !takeTool(tool)) return;
  const y = gatherYield(id);
  if (tool) useTool(tool);
  // 飘字：实际入包数量（吃仓储上限），以节点为中心水平居中排布
  const got = {};
  const fullItems = [];
  for (const k in y) {
    got[k] = addItem(k, y[k]);
    state.counters.gather[k] = (state.counters.gather[k] || 0) + got[k];
    if (got[k] < y[k]) fullItems.push(k);
  }
  if (fullItems.length) warnStorageFull(fullItems);
  const keys = Object.keys(y);
  font(15, true);
  const widths = keys.map(k => ctx.measureText('+' + got[k] + ' ' + t('item.' + k + '.name')).width);
  const gap = 14;
  const total = widths.reduce((a, b) => a + b, 0) + gap * (keys.length - 1);
  const nd = NODES.find(n => n.k === node.k) || node;
  let fx = nd.x - total / 2;
  keys.forEach((k, i) => {
    addFloat(fx + widths[i] / 2, nd.y - 56, '+' + got[k] + ' ' + t('item.' + k + '.name'), NODE_FLOAT_COLORS[k] || '#2e5d34');
    fx += widths[i] + gap;
    // 入包与计数已在上方 addItem 时完成，这里只负责飘字
  });
  markDirty();
  checkQuestHint();
}
const NODE_FLOAT_COLORS = {
  berry: '#e14b4b', leaf: '#3f9142', wood: '#a5713d', stone: '#6b7280', ore: '#cd8b45',
  coal: '#4a4a4a', copper_ore: '#c47a3d', blueberry: '#5a6fd0',
};

// ===== 制作：点击推进制作条（纯进度，不保存）；做满一次才扣除材料并产出 =====
// 进度临时保存：换做别的东西、关掉制作面板就清空，重攒
const CRAFT_PROG = {}; // { 配方id: 已推进次数 }
let lastCraftId = null; // 上一次手搓的配方 id，用于检测切换制造目标
function clearCraftProg() { for (const k in CRAFT_PROG) delete CRAFT_PROG[k]; lastCraftId = null; }
function craftHits(r) { return CRAFT_HITS[r.id] || 1; }
function doCraftClick(r) {
  if (!recipeUnlocked(r)) return false;
  if (lastCraftId && lastCraftId !== r.id) clearCraftProg(); // 换了制造目标，之前的进度不要了
  lastCraftId = r.id;
  const out = r.out;
  // 主产物与副产物都要放得下才开工
  if (!recipeOutputsFit(r)) { warnStorageFull(recipeFullItems(r)); return false; }
  let prog = CRAFT_PROG[r.id] || 0;
  if (prog === 0) {
    // 起手检查：材料够一整套才能开始
    for (const k in r.cost) if ((state.inv[k] || 0) < r.cost[k]) return false;
  }
  prog++;
  if (prog >= craftHits(r)) {
    for (const k in r.cost) state.inv[k] -= r.cost[k];
    produceRecipe(r);
    state.counters.craft[r.id] = (state.counters.craft[r.id] || 0) + 1;
    CRAFT_PROG[r.id] = 0;
    checkQuestHint();
  } else {
    CRAFT_PROG[r.id] = prog;
  }
  markDirty();
  return true;
}

// ===== 自动制作：长按打造按钮开启，0.5s 造一次，材料不足或达上限自动停止 =====
const autoCraft = { recipe: null, timer: 0 };
function autoCraftStart(id) {
  autoCraft.recipe = id;
  autoCraft.timer = AUTO_CRAFT.interval;
  dismissAutoHint(); // 首次触发自动化：撤教学提示，存档标记不再出现
  toast(t('ui.autoCraftOn'), '#ffc966', true);
}
function cancelAutoCraft() {
  if (autoCraft.recipe) { autoCraft.recipe = null; return true; }
  return false;
}
function autoCraftTick(dt) {
  if (!autoCraft.recipe) return;
  if (panelOpen !== 'craft' || dialog.active || battle.active) { stopAllAuto(); return; }
  autoCraft.timer -= dt;
  if (autoCraft.timer > 0) return;
  autoCraft.timer = AUTO_CRAFT.interval;
  const r = RECIPES.find(rr => rr.id === autoCraft.recipe);
  if (!r || !doCraftClick(r)) {
    stopAllAuto();
    toast(t('ui.autoCraftOff'), '#ffc966');
  }
}
