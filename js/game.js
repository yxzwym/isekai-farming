'use strict';
// ============================================================
// 运行时状态、存档与游戏规则
// ============================================================

let state = null;              // 当前存档状态；null = 未开始游戏（主菜单）
let scene = 'menu';            // menu | story | game
let panelOpen = null;          // 'equip' | 'quest' | 'craft' | 'menu' | 'settings' | 'newgame' | 'resbar'
let settings = { speed: 'normal', battleSpeed: 'normal', lang: 'zh-CN', resBarOrder: null, resBarHidden: [], resBarPicks: [], resBarAutoDone: false };
let dirty = false, lastSaveAt = 0;

const floats = [];   // 场景飘字 {x,y,text,color,t,life}
const toasts = [];   // 顶部提示 {text,color,t,life}
const nodeAnim = { bush: 0, rock: 0, tree: 0, boar: 0, crank: 0 }; // 采集节点/摇杆受击动画

// ===== 状态 =====
function defaultState() {
  const inv = {};
  for (const id in ITEMS) inv[id] = 0;
  return {
    ver: 12,
    inv,
    equip: { weapon: null, armor: null }, // 装备槽：武器一格、盔甲一格
    gearDur: {},                          // 装备剩余耐久，按物品 id 存储
    dur: {},                              // 在用工具的剩余耐久 { wood_axe: n, ... }
    builds: [],                           // 已建成建筑 [{ t, node?, recipe?, busy }]
    map: 'plains',                        // 当前地图 id（MAPS 表）
    seen: {},                             // 曾拥有过（数量 > 0 过）的物品；仓库只展示这些
    crank: { stacks: 0, timer: 0 },       // 摇杆蓄能：当前应力/分 与剩余时限秒
    research: [],                         // 已完成的科研 id（RESEARCH 表）
    hp: BASE.hp,
    medSlots: [null, null, null],
    stamina: STAMINA.max,
    foodSlots: [null, null, null],
    counters: {
      gather: { berry: 0, wood: 0, stone: 0, ore: 0 },
      craft: { cooked_rabbit: 0, cooked_pork: 0, wood_axe: 0, wood_sword: 0, stone_axe: 0, stone_sword: 0, leather_armor: 0, horn_pick: 0, smelt: 0 },
      hunt: { rabbit: 0, boar: 0, goat: 0 },
      medsUsed: 0,
      equipped: 0,
    },
    quest: 0,
    questDone: [],
    questNotified: {},
    flags: { introSeen: false },
  };
}

// ===== 设置（独立于存档，删档也不丢） =====
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    const out = {
      speed: TEXT_SPEEDS[s.speed] ? s.speed : 'normal',
      battleSpeed: BATTLE_SPEEDS[s.battleSpeed] !== undefined ? s.battleSpeed : 'normal',
      lang: LANG_PACK[s.lang] ? s.lang : 'zh-CN',
      resBarOrder: null,
      resBarHidden: [],
      resBarPicks: [],
    };
    const valid = id => ITEMS[id] && !ITEMS[id].unique;
    if (Array.isArray(s.resBarOrder)) out.resBarOrder = s.resBarOrder.filter(valid);
    if (Array.isArray(s.resBarHidden)) out.resBarHidden = s.resBarHidden.filter(valid);
    if (Array.isArray(s.resBarPicks)) out.resBarPicks = s.resBarPicks.filter(valid).slice(0, 10);
    out.resBarAutoDone = !!s.resBarAutoDone;
    return out;
  } catch (e) {
    return { speed: 'normal', battleSpeed: 'normal', lang: 'zh-CN', resBarOrder: null, resBarHidden: [] };
  }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}

// 顶部物品栏：非装备物品的展示顺序（新物品自动追加到末尾）
function resBarOrder() {
  const def = Object.keys(ITEMS).filter(id => !ITEMS[id].unique);
  const ord = (settings.resBarOrder || []).slice();
  for (const id of def) if (!ord.includes(id)) ord.push(id);
  return ord.filter(id => def.includes(id));
}
// 顶部物品栏实际显示：按顺序、未隐藏、数量 > 0
// 顶部钉选展示的物品：玩家在仓库弹窗里自选（≤10）
function pinnedItems() {
  return settings.resBarPicks.filter(id => state.seen[id]);
}
// 自动勾选：有存货的物品按获得顺序自动进入钉选，攒满 10 个即停止，
// 之后完全由玩家手动管理（取消勾选不会被自动补回）
function autoPinTick() {
  if (!state || settings.resBarAutoDone) return;
  for (const id of Object.keys(ITEMS)) {
    if (settings.resBarPicks.length >= 10) { settings.resBarAutoDone = true; break; }
    if ((state.inv[id] || 0) > 0 && !settings.resBarPicks.includes(id)) settings.resBarPicks.push(id);
  }
}
function resBarItems() {
  return resBarOrder().filter(id => !settings.resBarHidden.includes(id) && (state.inv[id] || 0) > 0);
}

// ===== 存档 =====
function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}
function saveState() {
  if (!state) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  dirty = false;
  lastSaveAt = performance.now();
}
function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const d = defaultState();
    const out = Object.assign(d, s);
    out.inv = Object.assign(d.inv, s.inv || {});
    out.equip = Object.assign({ weapon: null, armor: null }, s.equip || {});
    out.gearDur = Object.assign({}, s.gearDur || {});
    // 旧版耐久按槽位（weapon/armor）存储：迁移到当前装备的物品 id 上
    for (const slot of ['weapon', 'armor']) {
      const v = out.gearDur[slot];
      if (typeof v === 'number' && v > 0 && out.equip[slot]) out.gearDur[out.equip[slot]] = v;
      delete out.gearDur[slot];
    }
    out.dur = s.dur || {};
    // 建筑列表：剔掉未知类型/非法指派；进度截断到该建筑一轮的时长内
    out.builds = Array.isArray(s.builds) ? s.builds.filter(b => b && BUILDINGS[b.t]) : [];
    for (const b of out.builds) {
      const def = BUILDINGS[b.t];
      b.busy = typeof b.busy === 'number' && b.busy > 0 ? b.busy : 0;
      if (def.use) {
        if (b.t === 'harvester') {
          if (!HARVEST_SITES[b.node]) b.node = null;
          delete b.recipe;
        } else {
          const ok = b.recipe && factoryRecipes(b.t).some(r => r.id === b.recipe);
          if (!ok) b.recipe = null;
          delete b.node;
        }
      }
    }
    out.research = Array.isArray(s.research) ? s.research.filter(id => RESEARCH.some(r => r.id === id)) : [];
    const ck = s.crank || {};
    out.crank = {
      stacks: typeof ck.stacks === 'number' && ck.stacks > 0 ? Math.min(ck.stacks, CRANK.max) : 0,
      timer: typeof ck.timer === 'number' && ck.timer > 0 ? Math.min(ck.timer, CRANK.seconds) : 0,
    };
    out.medSlots = Array.isArray(s.medSlots) ? s.medSlots.slice(0, MAX_HERB) : [];
    while (out.medSlots.length < MAX_HERB) out.medSlots.push(null);
    out.hp = typeof s.hp === 'number' ? s.hp : BASE.hp;
    // 槽位里只能放带 equip 的物品（斧子这类工具不可装备）
    for (const slot of ['weapon', 'armor']) {
      const id = out.equip[slot];
      if (id && (!ITEMS[id] || !ITEMS[id].equip)) {
        if (ITEMS[id]) out.inv[id] = (out.inv[id] || 0) + 1;
        out.equip[slot] = null;
      }
    }
    const c = s.counters || {};
    out.counters = {
      gather: Object.assign(d.counters.gather, c.gather || {}),
      craft: Object.assign(d.counters.craft, c.craft || {}),
      hunt: Object.assign({ boar: 0 }, c.hunt || {}),
      equipped: c.equipped || 0,
    };
    out.foodSlots = Array.isArray(s.foodSlots) ? s.foodSlots.slice(0, MAX_FOOD) : [];
    while (out.foodSlots.length < MAX_FOOD) out.foodSlots.push(null);
    // ver<9 旧档装填食物时预扣了 1 份库存：按当前槽位补回（同一食物只占一格，补一次即可）
    if ((s.ver || 0) < 9) {
      const seen = {};
      for (const f of out.foodSlots) {
        if (f && FOODS[f] && !seen[f]) { seen[f] = true; out.inv[f] = (out.inv[f] || 0) + 1; }
      }
    }
    out.stamina = typeof s.stamina === 'number' ? s.stamina : STAMINA.max;
    out.questDone = Array.isArray(s.questDone) ? s.questDone : [];
    out.questNotified = s.questNotified || {};
    out.flags = Object.assign({ introSeen: false }, s.flags || {});
    out.map = MAPS[s.map] ? s.map : 'plains';
    out.seen = Object.assign({}, s.seen || {});
    for (const id in out.inv) if ((out.inv[id] || 0) > 0) out.seen[id] = true; // 旧档迁移
    return out;
  } catch (e) { return null; }
}
function markDirty() { dirty = true; }

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
      const n = NODES.find(nd => nd.k === autoGather.node);
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
    const n = NODES.find(nd => nd.k === autoGather.node);
    if (n && n.action === 'gather') doGather(n);
  }
  if (autoGather.holdT >= AUTO_GATHER.holdToStart) {
    autoGather.enabled = true;
    autoGather.timer = AUTO_GATHER.interval;
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
function staminaMax() { return STAMINA.max + foodBonus().stam; }
function maxMp() { return BASE.mp + foodBonus().mp; }
function atkVal() {
  const f = foodBonus();
  let a = BASE.atk + f.atk;
  const w = state.equip.weapon;
  if (w && ITEMS[w].equip) a += ITEMS[w].equip.atk;
  return Math.floor(a * (1 + f.atkPct));
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

// ===== 任务 =====
function curQuest() { return state.quest < QUESTS.length ? QUESTS[state.quest] : null; }
function questProgress(q) {
  if (q.type === 'gather') return state.counters.gather[q.item] || 0;
  if (q.type === 'craft') return state.counters.craft[q.target] || 0;
  if (q.type === 'eat') return state.counters.equipped;
  if (q.type === 'hunt') return state.counters.hunt[q.target] || 0;
  if (q.type === 'med') return state.counters.medsUsed;
  if (q.type === 'build') return state.builds.some(b => b.t === q.target) ? 1 : 0; // 目标建筑建成即达成
  return 0;
}
function questReady() {
  const q = curQuest();
  return !!(q && questProgress(q) >= q.count);
}
function recipeUnlocked(r) {
  if (r.unlock && !state.questDone.includes(r.unlock)) return false;
  if (r.res && !state.research.includes(r.res)) return false; // 科研未完成：铜产线等保持隐藏
  return true;
}
function questName(id) { return t('quests.' + id + '.name'); }
function questLines(id, key) {
  const arr = t('quests.' + id + '.' + key);
  return Array.isArray(arr) ? arr.slice() : [];
}

// ===== 提示与飘字 =====
function toast(text, color, sticky) {
  toasts.push({ text, color: color || '#f2f0e4', t: 0, life: 2.0, sticky: !!sticky });
  if (toasts.length > 4) toasts.shift();
}
function clearStickyToast() {
  for (let i = toasts.length - 1; i >= 0; i--) {
    if (toasts[i].sticky) toasts.splice(i, 1);
  }
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
function addFloat(x, y, text, color) {
  floats.push({ x, y, text, color: color || '#2e5d34', t: 0, life: 1.1 });
}
function checkQuestHint() {
  const q = curQuest();
  if (q && !state.questNotified[q.id] && questProgress(q) >= q.count) {
    state.questNotified[q.id] = true;
    toast(tf('ui.questHint'), '#ffc966');
    markDirty();
  }
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

// ===== 建筑：应力驱动的自动化生产 =====
// 应力是按“每分钟”计的流量：供给 = 摇杆蓄能（点击叠加、限时衰减）+ 水车常驻；
// 需求 > 供给时所有生产建筑停摆。各配方的自动时长与批量见 data.js 的 t / y 字段
function stressSupply() {
  let n = state.crank.stacks || 0;
  for (const b of state.builds) n += BUILDINGS[b.t].gen || 0;
  return n;
}
function stressDemand() {
  let n = 0;
  for (const b of state.builds) {
    const def = BUILDINGS[b.t];
    if (!def.use) continue;
    // 只有真正干活的才耗应力：执行中，或待命状态（有任务且随时能开工）；
    // 关机、缺料、产出满的机器一律不计耗，恢复条件后立即重新计入并复产
    if (b.busy > 0 || stationJobReady(b)) n += def.use;
  }
  return n;
}
function stressOver() { return stressDemand() > stressSupply(); }

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

// 仓储上限：所有物品都有堆叠上限；存满后自动化卡住、手搓拒绝，逼玩家理产线
// ===== 地图切换：第二张图接入时，把 NODES/HARVEST_SITES/建筑按地图挂到对应 id 上 =====
function switchMap(id) {
  if (!MAPS[id] || state.map === id) return false;
  state.map = id;
  for (const k in nodeHp) delete nodeHp[k]; // 采集进度是临时的，换图即清
  markDirty();
  return true;
}
// 物品名字的稀有度颜色（未登记的按常见灰处理）
function rarityColor(id) {
  const r = RARITY[id];
  return RARITY_COLORS[r] || RARITY_COLORS.common;
}
function capOf(id) { return ITEM_CAPS[id] !== undefined ? ITEM_CAPS[id] : ITEM_CAP_DEFAULT; }
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
  markDirty();
}
// 各生产站可指派的配方：按配方的 m 字段指派机器（面板页签 cat 与机器类型解耦），
// 只列已解锁的。铁棒/铁板/齿轮等材料件归制造站，装备/工具归合成站，冶炼归冶炼站
function factoryRecipes(type) {
  return RECIPES.filter(r => r.m === type && recipeUnlocked(r));
}
function canAffordBuild(t) {
  const cost = BUILDINGS[t].cost;
  for (const k in cost) if ((state.inv[k] || 0) < cost[k]) return false;
  return true;
}
// 建造条件：材料够 + 该类未达台数上限（摇杆仅 1 台）+ 地图建筑位未满
function canBuildFactory(t) {
  const def = BUILDINGS[t];
  if (def.locked) return false; // 暂未开放建造（主线目标类建筑，配方后续再定）
  if (def.max !== undefined && state.builds.filter(b => b.t === t).length >= def.max) return false;
  if (state.builds.length >= MAX_BUILDS) return false;
  return canAffordBuild(t);
}
function buildFactory(t) {
  if (!BUILDINGS[t] || BUILDINGS[t].locked || dialog.active) return;
  if (!canBuildFactory(t)) {
    if (state.builds.length >= MAX_BUILDS) toast(t('factory.mapFull'), '#ff9c8a');
    return;
  }
  for (const k in BUILDINGS[t].cost) state.inv[k] -= BUILDINGS[t].cost[k];
  const b = { t, busy: 0 };
  if (BUILDINGS[t].use) {
    if (t === 'harvester') b.node = null;
    else b.recipe = null;
  }
  state.builds.push(b);
  toast(tf('ui.crafted', { name: t('factory.bld.' + t + '.name') }), '#ffd479');
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

// 自动生产推进：开料即锁料，走满一轮出成品，无缝接下一轮；过载/仓库满/缺料都会卡住不动
function factoryTick(dt) {
  // 摇杆蓄能倒计时：到点归零，供给骤降可能直接过载停摆
  if (state.crank.timer > 0) {
    state.crank.timer -= dt;
    if (state.crank.timer <= 0) { state.crank.timer = 0; state.crank.stacks = 0; markDirty(); }
  }
  if (stressOver()) return;
  for (const b of state.builds) {
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

// ===== 战斗：回合互殴；耐力不足时该次伤害减半；生命见底时加护保命撤退 =====
// 生命不持久：开战时满血（基础 + 食物），打完扣食物重算
// phase: ready(查看敌人) → fight(自动你一下我一下) → over(结算)
// 能不能赢在 open 时就已由 simulateBattle 判定，开始后必然按推演走完
const battle = {
  active: false, id: null, ehp: 0, php: 0, log: [], phase: 'ready',
  next: 'player',  // 轮到谁出手
  timer: 0,        // 距下一次出手的倒计时
  pflash: 0,       // 我方受击高亮
  floats: [],      // 战斗内伤害飘字
  quickX: 0,       // 快捷装备行横向滚动偏移
};



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

function startBattle(id) {
  const e = ENEMIES[id];
  if (!e || dialog.active) return;
  if (battle.active && battle.phase !== 'over') return;
  state.stamina = staminaMax(); // 战前准备耐力恒满；只有战斗中攻击才消耗
  autoUseMeds();               // 战前准备：检测一次回血
  battle.active = true;
  battle.id = id;
  battle.ehp = e.hp;
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

// 敌人反击
function enemyCounter() {
  const e = ENEMIES[battle.id];
  const back = Math.max(1, e.atk - defVal());
  battle.php -= back;
  battle.pflash = 0.35;
  battle.floats.push({ text: '-' + back, x: 240, y: 408, t: 0, life: 0.8, color: '#e05a4e' });
  useGearDur('armor');
  battle.log.push(tf('battle.enemyHit', { name: t('enemy.' + battle.id + '.name'), d: back }));
  if (battle.php <= 1) {
    battle.php = 1;
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
  const med = autoUseMeds();
  if (med.used > 0) {
    battle.log.push(tf('battle.herbUsed', { n: med.used, heal: med.healed }));
  }
  state.stamina = staminaMax();
  markDirty();
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
function endBattle() {
  if (battle.active && (battle.phase === 'fight' || battle.phase === 'ready')) {
    state.hp = Math.max(1, Math.ceil(battle.php)); // 中途撤退：保持当前血量
    if (battle.phase === 'fight') consumeFoodAfterBattle(); // 打响过才算战斗消耗；战前准备撤退不吃食物
    state.stamina = staminaMax();
  }
  battle.active = false;
  battle.id = null;
  markDirty();
}

// ===== 任务提交 =====
function submitQuest() {
  const q = curQuest();
  if (!q || !questReady()) return;
  state.questDone.push(q.id);
  // 该任务新解锁的配方：弹通用提示
  for (const r of RECIPES) {
    if (r.unlock === q.id) toast(tf('ui.recipeUnlocked', { name: t('item.' + r.out + '.name') }), '#ffd479');
  }
  const lines = questLines(q.id, 'done');
  state.quest++;
  const nq = curQuest();
  if (nq) lines.push(...questLines(nq.id, 'intro'));
  const rw = q.reward || {};
  const got = Object.keys(rw).filter(k => rw[k] > 0);
  const added = {};
  for (const k in rw) added[k] = addItemForce(k, rw[k]); // 任务强制奖励：允许临时突破上限
  markDirty();
  closePanel();
  const giveRewards = () => {
    for (const k of got) {
      if (added[k] > 0) toast(tf('ui.gotReward', { name: t('item.' + k + '.name'), n: added[k] }), '#ffd479');
    }
  };
  if (lines.length) startDialogue(lines, { onDone: giveRewards });
  else giveRewards();
}

// ===== 对话系统 =====
const dialog = { active: false, lines: [], idx: 0, shown: 0, onDone: null, mode: 'field' };

function startDialogue(lines, opts = {}) {
  if (!lines || !lines.length) {
    if (opts.onDone) opts.onDone();
    return;
  }
  // 行可以是 {who,text}，也可以直接是字符串（默认神明发言）
  dialog.active = true;
  dialog.lines = lines.map(l => (typeof l === 'string' ? { who: 'god', text: l } : l));
  dialog.idx = 0;
  dialog.shown = 0;
  dialog.onDone = opts.onDone || null;
  dialog.mode = opts.mode || (scene === 'story' ? 'story' : 'field');
}
function advanceDialog() {
  if (!dialog.active) return;
  const line = dialog.lines[dialog.idx];
  if (!line) { // 防御：异常数据时直接结束对话，避免卡死
    dialog.active = false;
    const cb0 = dialog.onDone;
    dialog.onDone = null;
    if (cb0) cb0();
    return;
  }
  if (dialog.shown < line.text.length) {
    dialog.shown = line.text.length;
    return;
  }
  if (dialog.idx < dialog.lines.length - 1) {
    dialog.idx++;
    dialog.shown = 0;
  } else {
    dialog.active = false;
    const cb = dialog.onDone;
    dialog.onDone = null;
    if (cb) cb();
  }
}

// ===== 场景流转 =====
function newGame(skipIntro) {
  state = defaultState();
  state.hp = maxHp();
  floats.length = 0; toasts.length = 0;
  panelOpen = null;
  if (skipIntro) {
    state.flags.introSeen = true;
    scene = 'game';
    startDialogue([...t('story.skip'), ...questLines(QUESTS[0].id, 'intro')]);
  } else {
    scene = 'story';
    startDialogue(t('story.intro').slice(), {
      mode: 'story',
      onDone() { enterField(false); },
    });
  }
}
function enterField(skipped) {
  state.flags.introSeen = true;
  scene = 'game';
  const lines = skipped
    ? [...t('story.skip'), ...questLines(QUESTS[0].id, 'intro')]
    : questLines(QUESTS[0].id, 'intro');
  startDialogue(lines);
}
function continueGame() {
  const s = loadState();
  if (!s) { toast(t('ui.noSave'), '#ff9c8a'); return; }
  state = s;
  state.hp = Math.min(state.hp, maxHp());
  state.stamina = staminaMax(); // 耐力恒满：只有战斗中攻击才会消耗，存档里的余量不作数
  floats.length = 0; toasts.length = 0;
  panelOpen = null;
  scene = 'game';
  // 已经达成的目标不再弹提示
  const q = curQuest();
  if (q && questProgress(q) >= q.count) state.questNotified[q.id] = true;
}
function backToMenu() {
  saveState();
  state = null;
  scene = 'menu';
  panelOpen = null;
  floats.length = 0; toasts.length = 0;
}
function closePanel() {
  panelOpen = null;
  assignPick = null; mapPick = false; invPick = false; // 面板关掉时连弹窗一起收干净
  clearCraftProg(); // 手搓进度是临时的，页面一关就清
}
