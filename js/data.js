'use strict';
// ============================================================
// 数值与机制配置。所有文案（物品名、任务、剧情、界面文字）
// 都在 js/lang/*.js 语言包中，这里只放 id 与数值。
// ============================================================

const VERSION = '0.0.1';
const GAME_W = 480, GAME_H = 800;
const SAVE_KEY = 'isekai-farming-save-v10';
const SETTINGS_KEY = 'isekai-farming-settings-v1';

// 基础属性：没有等级；食物/装备在其上加成
const BASE = { hp: 25, mp: 0, atk: 1, def: 0 };

// 耐力：每次攻击消耗，不足时该次伤害减半；打完一场战斗直接回满
const STAMINA = { max: 50, cost: 10 };

const MAX_FOOD = 3;
const MAX_HERB = 3;

// 制作次数：每次点击/自动制作扣 1 格，扣满产出 1 件（未定义的配方视为 1 次）
// 手搓只是临时补料手段：次数普遍偏高，自动化才是正道
const CRAFT_HITS = {
  cooked_rabbit: 3,
  cooked_pork: 3,
  herb: 3,
  wood_axe: 6,
  wood_sword: 6,
  stone_axe: 6,
  stone_sword: 6,
  leather_armor: 6,
  horn_pick: 6,
  wood_pick: 6,
  stone_pick: 6,
  smelt: 3,
  iron_rod: 4,
  iron_plate: 6,
  gear: 6,
  iron_sword: 6,
  iron_pick: 6,
  iron_axe: 6,
  iron_armor: 6,
  copper_smelt: 3,
  copper_plate: 6,
  wire: 4,
  cable: 4,
};

// 自动化长按参数：按住开启的秒数 / 自动执行间隔
// jitterAfter：按住多久后开始抖动反馈（秒）
const AUTO_GATHER = { holdToStart: 1.5, jitterAfter: 1, interval: 0.5 };
const AUTO_CRAFT = { holdToStart: 1.5, jitterAfter: 1, interval: 0.5, cap: 99 };

// 药物：战斗结束后自动使用，恢复生命
const MEDS = {
  herb: { heal: 15 },
};

// ===== 物品（名称/描述见语言包 item.*）
// equip = 穿戴加成（武器/护甲）；没有 equip 的是纯工具（斧/镐，不占装备槽）
// 武器/护甲/工具都是消耗品，耐久见 DURABILITY
const ITEMS = {
  berry:         {},
  leaf:          {},
  herb:          {},
  wood:          {},
  stone:         {},
  raw_rabbit:    {},
  cooked_rabbit: {},
  raw_pork:      {},
  cooked_pork:   {},
  leather:       {},
  ore:           {},
  ingot:         {},
  iron_rod:      {},
  iron_plate:    {},
  gear:          {},
  iron_sword:    { equip: { atk: 8 } },
  iron_pick:     { power: 4 },
  iron_axe:      { power: 3 },
  iron_armor:    { equip: { def: 6 } },
  // ===== 铜产线（第二张图的资源，科研「铜加工」解锁配方）=====
  copper_ore:    {},
  copper_ingot:  {},
  copper_plate:  {},
  wire:          {},
  cable:         {},
  wood_axe:      { power: 1 },
  wood_sword:    { equip: { atk: 3 } },
  stone_axe:     { power: 2 },
  stone_sword:   { equip: { atk: 5 } },
  leather_armor: { equip: { def: 4 } },
  goat_horn:     {},
  horn_pick:     { power: 3 },
  wood_pick:     { power: 1 },
  stone_pick:    { power: 2 },
};

// ===== 耐久：工具按使用次数、武器按攻击次数、护甲按被击次数；归零即损坏 =====
const DURABILITY = {
  wood_axe: 15,
  wood_pick: 15,
  stone_pick: 40,
  wood_sword: 15,
  stone_axe: 50,
  stone_sword: 50,
  horn_pick: 100,
  leather_armor: 15,
  iron_sword: 60,
  iron_pick: 80,
  iron_axe: 60,
  iron_armor: 25,
};

// ===== 食物：只有熟食可以食用；食用后生效，每场战斗消耗 1 份 =====
const FOODS = {
  berry:         { hp: 5,  stam: 10 },
  cooked_rabbit: { hp: 15, stam: 4 },
  cooked_pork:   { hp: 20, stam: 3 },
};

// ===== 配方（只消耗原材料；unlock = 需已完成的任务 id，null = 初始可用）
// cat: cook(烹饪) / alchemy(炼药) / refine(精炼) / forge(锻造)
// m = 自动化指派的生产站：smelter(冶炼) / manufacturer(制造，单材料) / assembler(合成，双材料)
// y = 单次产出件数（默认 1）；t = 自动化生产单件/单批的秒数（默认 30），
//     “每分钟产量”预估 = 60 * y / t，可出现小数；实际生产一件一件来，按 t 走
// by = 副产物 { 物品: 数量 }（未来的石油类配方）：任一产出仓库满即整站停摆；
//      无副产物的普通配方主产物满了只是跳过本轮不锁料，不卡死、只是上游浪费
//
// ===== 产线节奏配平（「全链 1.5 件/分」）=====
// 采集按难度阶梯：浆果 15s < 大树 20s < 石矿 30s < 铁矿/铜矿 40s，越难越慢
// 产线均一流速：矿机 1.5矿/分 → 冶炼 40s(1矿→1锭) → 制板 40s(1锭→1板) →
// 齿轮 40s(1板+2木)，全链每台 1.5 件/分；齿轮吃 3木/分 = 一台树机，草药吃 3叶/分 = 一台树机的树叶
// 单台矿机+单台树机正好喂满整条链，两台水车(18×2=36 应力)恰好带满：
// 矿机+树机+冶炼+制板+合成 全部 100% 负载，一眼配平
const RECIPES = [
  { id: 'cooked_rabbit', out: 'cooked_rabbit', cost: { raw_rabbit: 1 }, unlock: 'hunt-rabbit', cat: 'cook', m: 'manufacturer' },
  { id: 'cooked_pork',   out: 'cooked_pork',   cost: { raw_pork: 1 },   unlock: 'hunt-boar',  cat: 'cook', m: 'manufacturer' },
  { id: 'herb',          out: 'herb',          cost: { leaf: 3 },       unlock: null,         cat: 'alchemy', m: 'manufacturer', t: 60 }, // 3叶/分 = 一台采树机的树叶流量

  { id: 'wood_axe',   out: 'wood_axe',   cost: { wood: 2, leaf: 3 }, unlock: 'chop-wood',   cat: 'forge', m: 'assembler' },
  { id: 'wood_pick',  out: 'wood_pick',  cost: { wood: 2, leaf: 2 }, unlock: 'hunt-boar',    cat: 'forge', m: 'assembler' },
  { id: 'wood_sword', out: 'wood_sword', cost: { wood: 4 },          unlock: 'craft-woodaxe', cat: 'forge', m: 'assembler' },
  { id: 'stone_axe',  out: 'stone_axe',  cost: { wood: 2, stone: 3 }, unlock: 'hunt-boar', cat: 'forge', m: 'assembler' },
  { id: 'stone_sword', out: 'stone_sword', cost: { wood: 2, stone: 5 }, unlock: 'craft-woodaxe', cat: 'forge', m: 'assembler' },
  { id: 'leather_armor', out: 'leather_armor', cost: { leather: 3, leaf: 6 }, unlock: 'hunt-boar', cat: 'forge', m: 'assembler' },
  { id: 'stone_pick', out: 'stone_pick', cost: { wood: 2, stone: 3 }, unlock: 'mine-stone', cat: 'forge', m: 'assembler' },
  { id: 'horn_pick', out: 'horn_pick', cost: { goat_horn: 1, wood: 2 }, unlock: 'hunt-goat', cat: 'forge', m: 'assembler' },

  { id: 'smelt',      out: 'ingot',      cost: { ore: 1 },           unlock: 'hunt-goat', cat: 'refine', m: 'smelter', t: 40 }, // 1.5锭/分，吃满一台矿机(1.5矿/分)
  { id: 'iron_rod',   out: 'iron_rod',   cost: { ingot: 1 },         unlock: 'hunt-goat', cat: 'refine', m: 'manufacturer', t: 40 },
  { id: 'iron_plate', out: 'iron_plate', cost: { ingot: 1 },         unlock: 'hunt-goat', cat: 'refine', m: 'manufacturer', t: 40 }, // 1锭→1板，吃满一台冶炼
  { id: 'gear',       out: 'gear',       cost: { iron_plate: 1, wood: 2 }, unlock: 'hunt-goat', cat: 'refine', m: 'assembler', t: 40 }, // 吃 1.5板+3木/分 = 一台板机+一台树机
  { id: 'iron_sword', out: 'iron_sword', cost: { iron_rod: 2, iron_plate: 2 }, unlock: 'hunt-goat', cat: 'forge', m: 'assembler', t: 30 },
  { id: 'iron_pick',  out: 'iron_pick',  cost: { iron_rod: 3, iron_plate: 1 }, unlock: 'hunt-goat', cat: 'forge', m: 'assembler', t: 30 },
  { id: 'iron_axe',   out: 'iron_axe',   cost: { iron_rod: 2, wood: 2 }, unlock: 'hunt-goat', cat: 'forge', m: 'assembler', t: 30 },
  { id: 'iron_armor', out: 'iron_armor', cost: { iron_plate: 3, leather: 2 }, unlock: 'hunt-goat', cat: 'forge', m: 'assembler', t: 45 },

  // ===== 铜产线（科研「铜加工」解锁；铜矿在第二张图）与铁线同构：全链 1.5 件/分 =====
  { id: 'copper_smelt', out: 'copper_ingot', cost: { copper_ore: 1 }, unlock: 'hunt-goat', res: 'copper', cat: 'refine', m: 'smelter', t: 40 },
  { id: 'copper_plate', out: 'copper_plate', cost: { copper_ingot: 1 }, unlock: 'hunt-goat', res: 'copper', cat: 'refine', m: 'manufacturer', t: 40 },
  { id: 'wire',         out: 'wire',         cost: { copper_ingot: 1 }, y: 2, unlock: 'hunt-goat', res: 'copper', cat: 'refine', m: 'manufacturer', t: 40 }, // 3线/分
  { id: 'cable',        out: 'cable',        cost: { wire: 2 },         unlock: 'hunt-goat', res: 'copper', cat: 'refine', m: 'manufacturer', t: 40 }, // 恰好吃满 3 线/分
];

// ===== 科研：提交材料永久解锁一批配方（材料按上限内数量计数，见 game.js 的 effInv）=====
// 后续的电力等科技都在这张表里加条目
const RESEARCH = [
  { id: 'copper', cost: { copper_ore: 10 } }, // 铜加工
];

// ===== 应力：按“每分钟”计的流量。产能来自摇杆（点击蓄能、限时衰减）与水车（常驻） =====
// 需求 > 供给时所有生产建筑停摆；各站需求：采集/冶炼/制造 6，合成 12
const BUILDINGS = {
  hand_crank:   { gen: 0,  max: 1, cost: { wood: 4, iron_rod: 2, stone: 2 } },
  water_wheel:  { gen: 18, cost: { gear: 2, wood: 8 } }, // 2 台 = 36 应力，恰好带满「矿机+树机+冶炼+制板+合成」示范产线
  harvester:    { use: 6,  cost: { wood: 4, iron_rod: 4, stone: 4 } },
  smelter:      { use: 6,  cost: { stone: 8, iron_plate: 2 } },
  manufacturer: { use: 6,  cost: { wood: 4, iron_rod: 2, iron_plate: 2 } },
  assembler:    { use: 12, cost: { wood: 4, iron_plate: 2, gear: 2 } },
  space_elevator: { locked: true, max: 1, cost: { wood: 40, stone: 30, iron_rod: 20, iron_plate: 15, gear: 8 } }, // 主线目标：配方与造价后续再定，暂不开放建造
};
const MAX_BUILDS = 50; // 每张地图的建筑位上限

// ===== 地图：切换逻辑已就绪（state.map 存当前 id）；新地图在此注册并在 NODES/HARVEST_SITES 挂点位 =====
const MAPS = {
  plains: {}, // 初始台地
};
const CRANK = { per: 4, max: 32, seconds: 60 }; // 摇杆：每次点击 +4/分，叠至上限 32/分；点击刷新时限

// ===== 物品仓储上限：初始空间 50/件（后期仓库建筑可扩容，此处即基础值） =====
// 超上限的来源只有两类：任务强制奖励、拆建筑全额返料——突破部分能正常消耗，
// 但不能作为产出目标（自动化/手搓都会拒绝），解锁与交付类计算一律用上限内的数量
// ===== 物品稀有度：常规 RPG 分档，物品名字的颜色随稀有度变化 =====
// common 常见(灰) / uncommon 优良(绿) / rare 稀有(蓝) / epic 史诗(紫) / legendary 传说(橙)
const RARITY = {
  berry: 'common', leaf: 'common', wood: 'common', stone: 'common', herb: 'common',
  raw_rabbit: 'common', raw_pork: 'common',
  wood_axe: 'common', wood_pick: 'common', wood_sword: 'common',
  cooked_rabbit: 'uncommon', cooked_pork: 'uncommon', leather: 'uncommon', goat_horn: 'uncommon',
  ore: 'uncommon', copper_ore: 'uncommon',
  stone_pick: 'uncommon', stone_axe: 'uncommon', stone_sword: 'uncommon', leather_armor: 'uncommon',
  // 当前所有加工件/铁质装备统一按优良（绿）处理；分档表保留，后续高阶内容再启用
  ingot: 'uncommon', copper_ingot: 'uncommon', iron_rod: 'uncommon', iron_plate: 'uncommon', copper_plate: 'uncommon',
  wire: 'uncommon', gear: 'uncommon', horn_pick: 'uncommon',
  iron_sword: 'uncommon', iron_pick: 'uncommon', iron_axe: 'uncommon', iron_armor: 'uncommon',
  cable: 'uncommon',
};
const RARITY_COLORS = {
  common: '#6b6455',
  uncommon: '#3f9142',
  rare: '#3b7ec2',
  epic: '#9b59d0',
  legendary: '#e08a3c',
};

const ITEM_CAP_DEFAULT = 50;
const ITEM_CAPS = {
  leaf: 40, // 树叶是杂料，略低于基础空间
  ore: 60, copper_ore: 60, // 原矿进料口放宽一档，减少满矿打断采集
  ingot: 80, copper_ingot: 80, // 锭是产线枢纽件（板/棒/装备都吃它），缓冲放大
  gear: 30, goat_horn: 10, leather: 20,
  raw_rabbit: 20, raw_pork: 20,
  cooked_rabbit: 20, cooked_pork: 20, herb: 20,
  iron_rod: 100, iron_plate: 100, // 产线主中间品，空间放宽到 100
  copper_plate: 100, wire: 100, // 铜产线同口径
  wood_axe: 10, wood_pick: 10, stone_axe: 10, stone_pick: 10,
  wood_sword: 10, stone_sword: 10, horn_pick: 10, leather_armor: 10,
  iron_sword: 10, iron_pick: 10, iron_axe: 10, iron_armor: 10,
};

// ===== 采集站可指派的采集点（实例）：两类节点就要两台站，造多了没活干 =====
// 键 = 采集点实例，值 = 节点类型（产量查 HARVEST_YIELD）
const HARVEST_SITES = {
  bush: 'bush', bush2: 'bush',
  tree: 'tree', tree2: 'tree',
  stone: 'stone', stone2: 'stone',
  iron: 'iron', iron2: 'iron',
};
const HARVEST_YIELD = {
  // 难度阶梯：越难的资源单轮越慢、每分钟产出越低（浆果 4 > 木材 3 > 石头 2 > 铁矿/铜矿 1.5）
  // time = 一轮秒数；items = 一轮产出。每分钟产出预估 = 60 × 产出 / time
  bush: { time: 15, items: { berry: 1, leaf: 1 } }, // 4浆果+4树叶/分（最易）
  tree: { time: 20, items: { wood: 1, leaf: 1 } },  // 3木材+3树叶/分（3木/分 = 恰好喂一台齿轮合成）
  stone: { time: 30, items: { stone: 1 } },          // 2石头/分
  iron: { time: 40, items: { ore: 1 } },             // 1.5铁矿/分（40s 一轮，恰好喂满一台冶炼）
  copper: { time: 40, items: { copper_ore: 1 } },    // 第二张图铜矿预留：1.5铜矿/分
};

// ===== 新手篇任务链（线性，自动接取下一个；文案见语言包 quests.*） =====
// type: gather(累计采集) / craft(累计打造) / eat(累计食用) / hunt(累计击杀)
const QUESTS = [
  { id: 'gather-berry',   type: 'gather', item: 'berry',          count: 10, reward: { berry: 8 } },
  { id: 'eat-berry',      type: 'eat', hint: 'equip',                            count: 1, reward: { berry: 6 } },
  { id: 'hunt-rabbit',    type: 'hunt',  target: 'rabbit',        count: 1, reward: { raw_rabbit: 2, herb: 1 } },
  { id: 'make-herb',      type: 'craft', hint: 'craft', target: 'herb',          count: 1, reward: { herb: 1, leaf: 6 } },
  { id: 'use-herb',       type: 'med',   hint: 'equip',           count: 1, reward: { herb: 2 } },
  { id: 'cook-rabbit',    type: 'craft', hint: 'craft', target: 'cooked_rabbit', count: 1, reward: { cooked_rabbit: 1, berry: 4 } },
  { id: 'chop-wood',      type: 'gather', item: 'wood',           count: 10, reward: { wood: 6, berry: 4 } },
  { id: 'craft-woodaxe',  type: 'craft', hint: 'craft', target: 'wood_axe',      count: 1, reward: { berry: 6, wood: 4 } },
  { id: 'craft-woodsword', type: 'craft', hint: 'craft', target: 'wood_sword',   count: 1, reward: { berry: 6, stone: 2 } },
  { id: 'hunt-boar',      type: 'hunt',  target: 'boar',          count: 1, reward: { raw_pork: 2, herb: 1 } },
  { id: 'craft-woodpick', type: 'craft', hint: 'craft', target: 'wood_pick',     count: 1, reward: { stone: 4, wood: 4 } },
  { id: 'mine-stone',     type: 'gather', item: 'stone',          count: 10, reward: { stone: 6, wood: 4 } },
  { id: 'craft-stonesword', type: 'craft', hint: 'craft', target: 'stone_sword', count: 1, reward: { leather: 2 } },
  { id: 'craft-leatherarmor', type: 'craft', hint: 'craft', target: 'leather_armor', count: 1, reward: { cooked_pork: 1, herb: 1 } },
  { id: 'hunt-goat',      type: 'hunt',  target: 'goat',          count: 1, reward: { ore: 6, herb: 2 } },
  { id: 'space_elevator', type: 'build', target: 'space_elevator', count: 1 },
];

// ===== 敌人：回合互殴，伤害 = max(1, 攻击方攻击 - 防守方防御) =====
// drop: 掉落物品与数量区间 [最小, 最大]
// 战斗界面会展示敌人数值并推演胜负，打不过时开始按钮显示"打不过"
const ENEMIES = {
  rabbit: { hp: 3,  atk: 1,  def: 0, stam: 20, drop: { raw_rabbit: [1, 2] } },
  boar:   { hp: 10, atk: 10, def: 1, stam: 40, drop: { raw_pork: [1, 2], leather: [2, 2] } },
  goat:   { hp: 24, atk: 15, def: 2, stam: 80, drop: { goat_horn: [1, 1], leather: [2, 3], raw_pork: [1, 2] } },
};

// ===== 采集产出（没有工具时用 tier0；工具按 hasItem 判定） =====
// 每档第三个元素为"采集血量"：点击扣 1 格，扣满归零才收获一次
const GATHER_YIELD = {
  bush: [
    [null, { berry: 1, leaf: 1 }, 3],
  ],
  tree: [
    [null,        { wood: 1, leaf: 1 },   5],
    ['wood_axe',  { wood: 1, leaf: 1 },   3],
    ['stone_axe', { wood: 1, leaf: 1 },   2],
    ['iron_axe',  { wood: 1, leaf: 1 },   1],
  ],  stone: [
    [null,        null,        4, 0],
    ['wood_pick', { stone: 1 }, 4, 1],
  ],
  iron: [
    [null,         null,        4, 0],
    [null,         null,        4, 1],
    ['stone_pick', { ore: 1 },  4, 2],
    ['horn_pick',  { ore: 1 },  2, 2],
    ['iron_pick',  { ore: 1 },  1, 4],
  ],
};

// ===== 战斗节奏：玩家攻击后到敌人反击的间隔（秒） =====
const BATTLE_SPEEDS = {
  instant: 0,
  fast: 0.25,
  normal: 0.5,
  slow: 1,
};

// ===== 对话文字速度（字符/秒，label 见语言包 speed.*） =====
const TEXT_SPEEDS = {
  slow:    { cps: 14 },
  normal:  { cps: 30 },
  fast:    { cps: 60 },
  instant: { cps: 9999 },
};
