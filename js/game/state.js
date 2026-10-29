'use strict';
// ============================================================
// 游戏逻辑 · 全局状态与存档
// 从原 js/game.js 拆出：全局可变量与容器、初始存档结构、
// 设置读写、顶部物品栏、存档存取、提示与飘字。
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
    ver: 14,
    inv,
    equip: { weapon: null, armor: null }, // 装备槽：武器一格、盔甲一格
    gearDur: {},                          // 装备剩余耐久，按物品 id 存储
    dur: {},                              // 在用工具的剩余耐久 { wood_axe: n, ... }
    builds: [],                           // 已建成建筑 [{ t, map, node?, recipe?, busy, burnLeft? }]
    map: 'plains',                        // 当前地图 id（MAPS 表）
    seen: {},                             // 曾拥有过（数量 > 0 过）的物品；仓库只展示这些
    crank: { stacks: 0, timer: 0 },       // 摇杆蓄能：当前应力/分 与剩余时限秒
    research: [],                         // 已完成的科研 id（RESEARCH 表）
    hp: BASE.hp,
    medSlots: [null, null, null],
    stamina: STAMINA.max,
    foodSlots: [null, null, null],
    potionSlots: [null, null, null],      // 药水槽 ×3（装备面板位于食物槽下、药物槽上，逻辑同食物，仅可装药水）
    counters: {
      gather: { berry: 0, wood: 0, stone: 0, ore: 0, copper_ore: 0, coal: 0, blueberry: 0, carrot: 0, limestone: 0 },
      craft: { cooked_rabbit: 0, cooked_pork: 0, wood_axe: 0, wood_sword: 0, stone_axe: 0, stone_sword: 0, leather_armor: 0, horn_pick: 0, smelt: 0, charcoal: 0, steel_smelt: 0, steel_sword: 0, steel_armor: 0, cooked_beef: 0, mushroom_stew: 0, ancestor_wisdom: 0, concrete: 0, biomass: 0 },
      hunt: { rabbit: 0, boar: 0, goat: 0, ball: 0, bison: 0, treant: 0, wolf: 0, skeleton: 0, evil_slime: 0 },
      medsUsed: 0,
      equipped: 0,
    },
    quest: 0,
    questDone: [],
    autoHintDone: false,                  // 玩家触发过自动化（长按）后，长按教学提示永久消失
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
      if (!MAPS[b.map]) b.map = 'plains'; // ver<13 旧档：建筑全部归还初始草原（旧版只有这一张图）
      b.burnLeft = typeof b.burnLeft === 'number' && b.burnLeft > 0 ? b.burnLeft : 0;
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
    // ver<14 旧档没有药水槽：默认空槽；槽内只允许 POTION 登记的药水，其余清掉
    out.potionSlots = Array.isArray(s.potionSlots) ? s.potionSlots.slice(0, MAX_POTION) : [];
    while (out.potionSlots.length < MAX_POTION) out.potionSlots.push(null);
    for (let i = 0; i < out.potionSlots.length; i++) {
      const id = out.potionSlots[i];
      if (id && !POTIONS[id]) out.potionSlots[i] = null;
    }
    // ver<9 旧档装填食物时预扣了 1 份库存：按当前槽位补回（同一食物只占一格，补一次即可）
    if ((s.ver || 0) < 9) {
      const seen = {};
      for (const f of out.foodSlots) {
        if (f && FOODS[f] && !seen[f]) { seen[f] = true; out.inv[f] = (out.inv[f] || 0) + 1; }
      }
    }
    out.stamina = typeof s.stamina === 'number' ? s.stamina : STAMINA.max;
    out.questDone = Array.isArray(s.questDone) ? s.questDone : [];
    out.autoHintDone = !!s.autoHintDone;
    out.questNotified = s.questNotified || {};
    out.flags = Object.assign({ introSeen: false }, s.flags || {});
    out.map = MAPS[s.map] ? s.map : 'plains';
    out.seen = Object.assign({}, s.seen || {});
    for (const id in out.inv) if ((out.inv[id] || 0) > 0) out.seen[id] = true; // 旧档迁移
    return out;
  } catch (e) { return null; }
}
function markDirty() { dirty = true; }

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
function addFloat(x, y, text, color) {
  floats.push({ x, y, text, color: color || '#2e5d34', t: 0, life: 1.1 });
}
