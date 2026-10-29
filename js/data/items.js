'use strict';
// ============================================================
// 数据层 · 物品与配方
// 从原 js/data.js 拆出：物品表、耐久表、食物效果、配方表、科研表。
// 名称/描述见语言包 item.*；数值配置见 js/data/config.js。
// ============================================================

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
  // ===== 羊毛产线（黑山羊掉落羊肉/羊毛，布料是风力科研的提交材料）=====
  raw_mutton:    {},
  cooked_mutton: {},
  wool:          {},
  cloth:         {},
  wood_axe:      { power: 1 },
  wood_sword:    { equip: { atk: 3 } },
  stone_axe:     { power: 2 },
  stone_sword:   { equip: { atk: 5 } },
  leather_armor: { equip: { def: 4 } },
  goat_horn:     {},
  horn_pick:     { power: 3 },
  wood_pick:     { power: 1 },
  stone_pick:    { power: 2 },
  // ===== 黑暗森林产线（第二张地图：煤炭/钢/新食物药物）=====
  coal:           {},
  ash:            {},
  mushroom:       {},
  blueberry:      {}, // 浆果的上位替代：徒手采集即可获得
  steel_ingot:    {},
  steel_sword:    { equip: { atk: 12 } },
  steel_armor:    { equip: { def: 9 } },
  raw_beef:       {},
  cooked_beef:    {},
  mushroom_stew:  {},
  blueberry_steak:  {}, // 蓝莓牛排：生牛肉+蓝莓，血耐均衡的森林新菜
  roasted_mushroom: {}, // 烤蘑菇：森林素菜，耐力小食
  ancestor_wisdom: {},
  // ===== 贫瘠沙漠产线（第三张地图：石灰石/混凝土/电力燃料/新敌人掉落/药水）=====
  limestone:     {}, // 石灰石：沙漠新矿石，混凝土的原料
  concrete:      {}, // 混凝土：仓库的建材
  biomass:       {}, // 生物质：树叶/木材加工而成，发电效率更高
  raw_wolf_meat: {}, // 野狼掉落
  wolf_fang:     {}, // 野狼/淤泥怪掉落：狼牙棒与狼甲的材料
  slime_gel:     {}, // 邪恶淤泥掉落：高级药膏的原料
  wolf_club:     { equip: { atk: 16 } }, // 狼牙棒（狼牙+钢）：击败淤泥怪后解锁的终极武器
  wolf_armor:    { equip: { def: 12 } }, // 狼甲：终极护甲
  carrot:        {}, // 沙漠新植物：徒手可采
  carrot_pork_skewer: {}, // 胡萝卜肉串
  beef_carrot_soup:   {}, // 牛肉胡萝卜浓汤
  wolf_carrot_stew:   {}, // 狼肉胡萝卜煲
  carrot_berry_stew:  {}, // 胡萝卜浆果煲：沙漠荤素平衡菜
  antidote:      {}, // 抗毒药水：淤泥战门票
  tonic:         {}, // 劲力药水：战时耐力上限大增
  fury:          {}, // 狂暴药水：战时攻击大增
  mega_salve:    {}, // 高级药膏：战后回血远超祖宗的智慧
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
  steel_sword: 90,
  steel_armor: 40,
  // 终局装备链：狼牙棒/狼甲
  wolf_club: 120,
  wolf_armor: 50,
};

// ===== 食物：只有熟食可以食用；食用后生效，每场战斗消耗 1 份 =====
// 平衡定位：肉血多耐少，植物血少耐多——野猪/山羊战需要肉凑血、浆果凑耐力
const FOODS = {
  berry:         { hp: 4,  stam: 15 },
  cooked_rabbit: { hp: 18, stam: 5 },
  cooked_pork:   { hp: 23, stam: 5 },
  cooked_mutton: { hp: 28, stam: 5 }, // 山羊最难打，熟羊肉是最强肉类
  // ===== 黑暗森林食物：牛肉血多，蘑菇煲耐力最高——树精战要靠煲的耐力速杀 =====
  cooked_beef:   { hp: 32, stam: 10 },
  mushroom_stew: { hp: 24, stam: 26 }, // 耐力全场最高：树精战10击恰耗100耐，煲池50+26+14+10=100全全力，就是门票
  blueberry:     { hp: 10, stam: 20 },
  blueberry_steak:   { hp: 28, stam: 14 }, // 生牛肉+蓝莓：血耐均衡，树精战血量门票
  roasted_mushroom:  { hp: 8,  stam: 22 }, // 烤蘑菇：纯素耐力小食
  // ===== 贫瘠沙漠食物：胡萝卜血少耐多（植物定位），生肉+胡萝卜的荤素菜全面上位 =====
  carrot:             { hp: 5,  stam: 18 }, // 生吃也行：蓝莓位替换
  carrot_pork_skewer: { hp: 26, stam: 12 }, // 生猪肉+胡萝卜：熟猪肉上位
  beef_carrot_soup:   { hp: 35, stam: 14 }, // 生牛肉+胡萝卜：熟牛肉上位
  wolf_carrot_stew:   { hp: 38, stam: 12 }, // 生狼肉+胡萝卜：当前最强肉菜
  carrot_berry_stew:  { hp: 16, stam: 16 }, // 胡萝卜+浆果：沙漠荤素平衡菜
};

// ===== 药水：只能装进药水槽（potionSlots），逻辑与食物光环完全同构 =====
// reduce = 中毒伤害减免比例（多瓶叠加封顶 80%，见 vitals.poisonReduce）
// atkPct 存小数（0.25 = +25%），与 FOODS/atkVal 的数学保持一致；渲染文案时 ×100
const POTIONS = {
  antidote: { reduce: 0.6 },  // 抗毒药水：邪恶淤泥战的门票
  tonic:    { stam: 40 },     // 劲力药水：战时耐力上限大增，撑住 12 击的 Boss 拉锯
  fury:     { atkPct: 0.25 }, // 狂暴药水：战时攻击大增
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
  { id: 'wire',         out: 'wire',         cost: { copper_ingot: 1 }, y: 2, unlock: 'hunt-goat', res: 'power', cat: 'refine', m: 'manufacturer', t: 40 }, // 3线/分（「电力」科研才开放，电线电缆进入电力时代）
  { id: 'cable',        out: 'cable',        cost: { wire: 2 },         unlock: 'hunt-goat', res: 'power', cat: 'refine', m: 'manufacturer', t: 40 }, // 恰好吃满 3 线/分

  // ===== 黑暗森林产线（煤窑/钢/新食物药物；煤窑配方只有煤窑站能生产）=====
  { id: 'charcoal',        out: 'coal',           cost: { wood: 2 },     by: { ash: 1 }, res: 'coal_kiln', cat: 'refine', m: 'coal_kiln', t: 40 }, // 2木→1煤+1灰烬，1.5煤/分=恰好喂满一台蒸汽机
  { id: 'steel_smelt',     out: 'steel_ingot',    cost: { ingot: 1, coal: 1 },           res: 'steel', cat: 'refine', m: 'assembler', t: 40 }, // 煤+铁=钢锭：击败树精后显示钢研究，解锁才能造
  { id: 'steel_sword',     out: 'steel_sword',    cost: { steel_ingot: 3 },              res: 'steel', cat: 'forge',  m: 'manufacturer', t: 30 },
  { id: 'steel_armor',     out: 'steel_armor',    cost: { steel_ingot: 3, leather: 2 },  res: 'steel', cat: 'forge',  m: 'assembler', t: 45 },
  { id: 'cooked_beef',     out: 'cooked_beef',    cost: { raw_beef: 1 }, unlock: 'hunt-bison', cat: 'cook', m: 'manufacturer' },
  { id: 'mushroom_stew',   out: 'mushroom_stew',  cost: { mushroom: 2, berry: 1 }, unlock: 'hunt-ball', cat: 'cook', m: 'assembler' }, // 蘑菇+浆果=蘑菇煲，耐力全场最高
  { id: 'blueberry_steak', out: 'blueberry_steak', cost: { raw_beef: 1, blueberry: 2 }, unlock: 'hunt-bison', cat: 'cook', m: 'assembler' }, // 蓝莓+牛排：树精战血量门票
  { id: 'roasted_mushroom', out: 'roasted_mushroom', cost: { mushroom: 2 }, unlock: 'hunt-ball', cat: 'cook', m: 'manufacturer' }, // 烤蘑菇：纯素耐力小食
  { id: 'ancestor_wisdom', out: 'ancestor_wisdom', cost: { ash: 3 },                     res: 'coal_kiln', cat: 'alchemy', m: 'manufacturer', t: 60 }, // 灰烬炼药，回血远超药草

  // ===== 羊毛产线（黑山羊掉落，为风力科研供料；与铁线同为 40s 均一流速）=====
  { id: 'cooked_mutton', out: 'cooked_mutton', cost: { raw_mutton: 1 }, unlock: 'hunt-goat', cat: 'cook', m: 'manufacturer' },
  { id: 'cloth',         out: 'cloth',         cost: { wool: 3 },       unlock: 'hunt-goat', cat: 'refine', m: 'manufacturer', t: 40 }, // 1.5布/分，吃 4.5羊毛/分

  // ===== 贫瘠沙漠产线（石灰石→混凝土→仓库扩容；生物质→电力；药水走制造/合成站）=====
  { id: 'concrete',      out: 'concrete',      cost: { limestone: 2, coal: 1 },    res: 'storage_expansion', cat: 'refine', m: 'assembler', t: 40 }, // 1.5混凝土/分，吃 3石灰石+1.5煤/分 = 两台石灰石矿机
  { id: 'biomass_leaf',  out: 'biomass',       cost: { leaf: 4 },                  res: 'power', cat: 'refine', m: 'manufacturer', t: 40 }, // 4叶→1生物质：能量+25%
  { id: 'biomass_wood',  out: 'biomass',       cost: { wood: 2 },                  res: 'power', cat: 'refine', m: 'manufacturer', t: 40 }, // 2木→1生物质：能量+25%

  // ===== 终局装备链（狼牙+钢；击败淤泥怪后解锁制造）=====
  { id: 'wolf_club',  out: 'wolf_club',  cost: { wolf_fang: 2, steel_ingot: 3 },  unlock: 'hunt-evil_slime', cat: 'forge', m: 'assembler', t: 30 },
  { id: 'wolf_armor', out: 'wolf_armor', cost: { wolf_fang: 1, steel_ingot: 3, leather: 2 }, unlock: 'hunt-evil_slime', cat: 'forge', m: 'assembler', t: 45 },

  // ===== 沙漠菜肴（生肉+胡萝卜的荤素搭配，全面上位）=====
  { id: 'carrot_pork_skewer', out: 'carrot_pork_skewer', cost: { raw_pork: 1, carrot: 2 },      unlock: 'gather-carrot', cat: 'cook', m: 'assembler' },
  { id: 'beef_carrot_soup',   out: 'beef_carrot_soup',   cost: { raw_beef: 1, carrot: 2 },      unlock: 'gather-carrot', cat: 'cook', m: 'assembler' },
  { id: 'wolf_carrot_stew',   out: 'wolf_carrot_stew',   cost: { raw_wolf_meat: 1, carrot: 2 }, unlock: 'hunt-wolf',     cat: 'cook', m: 'assembler' },
  { id: 'carrot_berry_stew',  out: 'carrot_berry_stew',  cost: { carrot: 2, berry: 2 },         unlock: 'gather-carrot', cat: 'cook', m: 'assembler' }, // 胡萝卜+浆果：沙漠素菜

  // ===== 药水（制造/合成站生产；猎狼后逐步解锁，凝胶药膏要打完淤泥怪）=====
  { id: 'antidote',   out: 'antidote',   cost: { leaf: 2, berry: 3, herb: 1 }, unlock: 'hunt-wolf',        cat: 'alchemy', m: 'assembler', t: 60 }, // 抗毒：淤泥战的门票
  { id: 'tonic',      out: 'tonic',      cost: { herb: 1, blueberry: 3, leaf: 2 }, unlock: 'hunt-wolf',    cat: 'alchemy', m: 'assembler', t: 60 }, // 劲力：战时耐力上限+40
  { id: 'fury',       out: 'fury',       cost: { herb: 2, mushroom: 2 },       unlock: 'hunt-wolf',        cat: 'alchemy', m: 'assembler', t: 60 }, // 狂暴：战时攻击+25%
  { id: 'mega_salve', out: 'mega_salve', cost: { slime_gel: 1, herb: 2 },      unlock: 'hunt-evil_slime',  cat: 'alchemy', m: 'assembler', t: 60 }, // 高级药膏：战后回血 40
];

// ===== 科研：提交材料永久解锁一批配方（材料按上限内数量计数，见 game 逻辑的 effInv）=====
// 后续的电力等科技都在这张表里加条目
const RESEARCH = [
  { id: 'wind',   cost: { cloth: 10 } },       // 风的利用：解锁建筑「风力机」
  { id: 'copper', cost: { copper_ore: 10 }, hidden: true, reveal: { item: 'copper_ore' } }, // 铜加工：只解锁铜锭/铜板，采到铜矿才显示
  { id: 'coal_kiln', cost: { coal: 5 }, hidden: true, reveal: { item: 'coal' } }, // 煤窑：采到煤后显示；解锁煤窑建筑 + 烧炭 + 祖宗的智慧
  { id: 'steel', cost: { coal: 6, ingot: 8 }, hidden: true, reveal: { quest: 'hunt-treant' } }, // 钢加工：击败树精后显示；解锁钢锭/钢剑/钢甲
  { id: 'steam_engine', cost: { copper_plate: 5, steel_ingot: 5 }, hidden: true, reveal: { research: 'coal_kiln' } }, // 蒸汽机：研完煤窑后显示
  // ===== 贫瘠沙漠三连：仓储扩容 → 电力 =====
  { id: 'storage_expansion', cost: { limestone: 10, iron_plate: 4 }, hidden: true, reveal: { item: 'limestone' } }, // 仓储扩容：采到石灰石后显示；解锁仓库建筑 + 混凝土
  { id: 'power', cost: { copper_plate: 6, steel_ingot: 4 }, hidden: true, reveal: { research: 'steam_engine' } }, // 电力：研完蒸汽机后显示；解锁电线/电缆/生物质配方 + 生物质发电机
];
