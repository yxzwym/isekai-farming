'use strict';
// ============================================================
// 数据层 · 全局数值配置
// 从原 js/data.js 拆出：版本/画布/存档键、基础属性、耐力上限、
// 制作次数、自动化参数、药物、建筑位上限、摇杆、稀有度、仓储上限、
// 战斗节奏与文字速度。
// 所有文案（物品名、任务、剧情、界面文字）都在 js/lang/*.js 语言包中，
// 这里只放 id 与数值。
// ============================================================

const VERSION = '0.0.1';
const GAME_W = 480, GAME_H = 800;
const SAVE_KEY = 'isekai-farming-save-v11';
const SETTINGS_KEY = 'isekai-farming-settings-v1';

// 基础属性：没有等级；食物/装备在其上加成
const BASE = { hp: 20, mp: 0, atk: 1, def: 0 };

// 耐力：每次攻击消耗，不足时该次伤害减半；打完一场战斗直接回满
const STAMINA = { max: 50, cost: 10 };

const MAX_FOOD = 3;
const MAX_HERB = 3;
const MAX_POTION = 3; // 药水槽：装备面板里位于食物槽之下、药物槽之上，逻辑与食物一致

// 制作次数：每次点击/自动制作扣 1 格，扣满产出 1 件（未定义的配方视为 1 次）
// 手搓只是临时补料手段：次数普遍偏高，自动化才是正道
const CRAFT_HITS = {
  cooked_rabbit: 3,
  cooked_pork: 3,
  cooked_mutton: 3,
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
  cloth: 6,
  charcoal: 4,
  steel_smelt: 4,
  steel_sword: 6,
  steel_armor: 6,
  cooked_beef: 3,
  mushroom_stew: 4,
  blueberry_steak: 3,
  roasted_mushroom: 3,
  ancestor_wisdom: 4,
  // 沙漠产线
  concrete: 4,
  biomass_leaf: 4,
  biomass_wood: 4,
  wolf_club: 6,
  wolf_armor: 6,
  carrot_pork_skewer: 3,
  beef_carrot_soup: 3,
  wolf_carrot_stew: 3,
  carrot_berry_stew: 3,
  antidote: 4,
  tonic: 4,
  fury: 4,
  mega_salve: 4,
};

// 自动化长按参数：按住开启的秒数 / 自动执行间隔
// jitterAfter：按住多久后开始抖动反馈（秒）
const AUTO_GATHER = { holdToStart: 1.5, jitterAfter: 1, interval: 0.5 };
const AUTO_CRAFT = { holdToStart: 1.5, jitterAfter: 1, interval: 0.5, cap: 99 };

// 药物：战斗结束后自动使用，恢复生命
const MEDS = {
  herb: { heal: 15 },
  ancestor_wisdom: { heal: 40 }, // 黑暗森林药物：灰烬所制，比药草强得多
  mega_salve: { heal: 40 }, // 贫瘠沙漠药膏：淤泥凝胶所制，战后大量回血的救命储备
};

const MAX_BUILDS = 50; // 每张地图的建筑位上限

const CRANK = { per: 4, max: 32, seconds: 60 }; // 摇杆：每次点击 +4/分，叠至上限 32/分；点击刷新时限

// ===== 物品稀有度：常规 RPG 分档，物品名字的颜色随稀有度变化 =====
// common 常见(灰) / uncommon 优良(绿) / rare 稀有(蓝) / epic 史诗(紫) / legendary 传说(橙)
const RARITY = {
  berry: 'common', leaf: 'common', wood: 'common', stone: 'common', herb: 'common',
  raw_rabbit: 'common', raw_pork: 'common', raw_mutton: 'common', wool: 'common',
  wood_axe: 'common', wood_pick: 'common', wood_sword: 'common',
  cooked_rabbit: 'uncommon', cooked_pork: 'uncommon', cooked_mutton: 'uncommon', leather: 'uncommon', goat_horn: 'uncommon',
  ore: 'uncommon', copper_ore: 'uncommon',
  stone_pick: 'uncommon', stone_axe: 'uncommon', stone_sword: 'uncommon', leather_armor: 'uncommon',
  // 当前所有加工件/铁质装备统一按优良（绿）处理；分档表保留，后续高阶内容再启用
  ingot: 'uncommon', copper_ingot: 'uncommon', iron_rod: 'uncommon', iron_plate: 'uncommon', copper_plate: 'uncommon',
  wire: 'uncommon', gear: 'uncommon', horn_pick: 'uncommon',
  iron_sword: 'uncommon', iron_pick: 'uncommon', iron_axe: 'uncommon', iron_armor: 'uncommon',
  cable: 'uncommon', cloth: 'uncommon',
  // 黑暗森林：原料常见，食物/钢锭优良，钢装备与树精掉落稀有
  coal: 'common', ash: 'common', mushroom: 'common', raw_beef: 'common',
  blueberry: 'uncommon', cooked_beef: 'uncommon', mushroom_stew: 'uncommon', blueberry_steak: 'uncommon', roasted_mushroom: 'uncommon', ancestor_wisdom: 'uncommon', steel_ingot: 'uncommon',
  steel_sword: 'rare', steel_armor: 'rare',
  // 贫瘠沙漠：原料常见，加工件/燃料/菜/药优良，狼牙与淤泥产物稀有，狼甲/狼牙棒是首件史诗级终局装备
  limestone: 'common', carrot: 'common', raw_wolf_meat: 'common', biomass: 'common',
  concrete: 'uncommon', carrot_pork_skewer: 'uncommon', beef_carrot_soup: 'uncommon', wolf_carrot_stew: 'uncommon', carrot_berry_stew: 'uncommon',
  antidote: 'uncommon', tonic: 'uncommon', fury: 'uncommon',
  wolf_fang: 'rare', slime_gel: 'rare', mega_salve: 'rare',
  wolf_club: 'epic', wolf_armor: 'epic',
};
const RARITY_COLORS = {
  common: '#6b6455',
  uncommon: '#3f9142',
  rare: '#3b7ec2',
  epic: '#9b59d0',
  legendary: '#e08a3c',
};

// ===== 物品仓储上限：初始空间 50/件（后期仓库建筑可扩容，此处即基础值） =====
// 超上限的来源只有两类：任务强制奖励、拆建筑全额返料——突破部分能正常消耗，
// 但不能作为产出目标（自动化/手搓都会拒绝），解锁与交付类计算一律用上限内的数量
const ITEM_CAP_DEFAULT = 50;
const ITEM_CAPS = {
  leaf: 40, // 树叶是杂料，略低于基础空间
  ore: 60, copper_ore: 60, // 原矿进料口放宽一档，减少满矿打断采集
  ingot: 80, copper_ingot: 80, // 锭是产线枢纽件（板/棒/装备都吃它），缓冲放大
  gear: 30, goat_horn: 10, leather: 20,
  raw_rabbit: 20, raw_pork: 20, raw_mutton: 20,
  cooked_rabbit: 20, cooked_pork: 20, cooked_mutton: 20, herb: 20,
  wool: 20, cloth: 60, // 布料是科研/建筑材料，空间放宽一档
  iron_rod: 100, iron_plate: 100, // 产线主中间品，空间放宽到 100
  copper_plate: 100, wire: 100, // 铜产线同口径
  wood_axe: 10, wood_pick: 10, stone_axe: 10, stone_pick: 10,
  wood_sword: 10, stone_sword: 10, horn_pick: 10, leather_armor: 10,
  iron_sword: 10, iron_pick: 10, iron_axe: 10, iron_armor: 10,
  // 黑暗森林
  coal: 60, ash: 40, mushroom: 20, blueberry: 20,
  steel_ingot: 80, raw_beef: 20, cooked_beef: 20, mushroom_stew: 20, blueberry_steak: 20, roasted_mushroom: 20, ancestor_wisdom: 20,
  steel_sword: 10, steel_armor: 10,
  // 贫瘠沙漠：石灰石/混凝土是建材放宽，生物质是产线燃料，肉类/食物/药水 20，装备 10
  limestone: 60, concrete: 40, biomass: 60,
  raw_wolf_meat: 20, wolf_fang: 20, slime_gel: 20,
  carrot: 20, carrot_pork_skewer: 20, beef_carrot_soup: 20, wolf_carrot_stew: 20, carrot_berry_stew: 20,
  antidote: 20, tonic: 20, fury: 20, mega_salve: 20,
  wolf_club: 10, wolf_armor: 10,
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
