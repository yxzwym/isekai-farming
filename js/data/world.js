'use strict';
// ============================================================
// 数据层 · 世界内容
// 从原 js/data.js 拆出：建筑表、地图表、采集点实例、采集产出、
// 任务链、敌人数值、采集产出档位。
// ============================================================

// ===== 应力：按“每分钟”计的流量。产能来自摇杆（点击蓄能、限时衰减）与水车/风力机（常驻） =====
// 需求 > 供给时所有生产建筑停摆；各站需求：采集/冶炼/制造 6，合成 12
const BUILDINGS = {
  hand_crank:   { gen: 0,  max: 1, cost: { wood: 5, iron_rod: 3, stone: 3 } },
  water_wheel:  { gen: 18, cost: { gear: 3, wood: 12 } }, // 2 台 = 36 应力，恰好带满「矿机+树机+冶炼+制板+合成」示范产线
  wind_turbine: { gen: 9, research: 'wind', cost: { cloth: 5, gear: 2, iron_rod: 4, wood: 10 } }, // 单台 9 = 水车一半；每多一台全体风力 +5%，60 台封顶 4 倍（见 game 逻辑 windStress）
  harvester:    { use: 6,  cost: { wood: 5, iron_rod: 5, stone: 5 } },
  smelter:      { use: 6,  cost: { stone: 10, iron_plate: 5 } },
  manufacturer: { use: 6,  cost: { wood: 5, iron_rod: 5, iron_plate: 5 } },
  assembler:    { use: 12, cost: { wood: 5, iron_plate: 5, gear: 3 } },
  coal_kiln:    { use: 6,  research: 'coal_kiln', map: 'dark_forest', cost: { stone: 15, wood: 10 } }, // 煤窑：木头→煤+灰烬；近煤供料，只能造在黑暗森林
  steam_engine: { gen: 36, research: 'steam_engine', map: 'plains', burn: { coal: 1 }, time: 40, cost: { stone: 20, iron_plate: 8, gear: 4, cable: 4 } }, // 蒸汽机：36电力=2×水车，烧煤；电力与应力同池结算（应力是前期形态）
  biomass_generator: { gen: 45, research: 'power', burn: { leaf: 9, wood: 18, biomass: 45 }, cost: { copper_plate: 4, iron_plate: 6, cable: 2 } }, // 生物质发电机：烧树叶/木材/生物质（任意一种点亮）；生物质能量+25%
  warehouse:    { storage: 30, max: 3, cost: { concrete: 4, iron_plate: 4, wood: 8 } }, // 仓库：每座全体物品堆叠上限 +30（科研「仓储扩容」解锁）
  space_elevator: { locked: true, max: 1, cost: { wood: 60, stone: 50, iron_rod: 30, iron_plate: 25, gear: 12 } }, // 主线目标：配方与造价后续再定，暂不开放建造
};

// ===== 地图：切换逻辑已就绪（state.map 存当前 id）；新地图在此注册并在 NODES/HARVEST_SITES 挂点位 =====
// unlock = 解锁条件 id：真实任务走任务完成判定，森林篇 id 走 QUEST_COND 计数器（见 game/quest.js condMet）
const MAPS = {
  plains: {}, // 初始草原
  dark_forest: { unlock: 'hunt-goat' }, // 黑暗森林：猎过山羊后解锁
  desert: { unlock: 'hunt-treant' }, // 贫瘠沙漠：击败树精后解锁（无任务，计数器驱动）
  elder_land: { unlock: 'hunt-treant', placeholder: true }, // 击败树精后给解锁标记，内容下一章开放
};

// ===== 采集站可指派的采集点（实例）：两类节点就要两台站，造多了没活干 =====
// 键 = 采集点实例，值 = 节点类型（产量查 HARVEST_YIELD）
const HARVEST_SITES = {
  bush: 'bush', bush2: 'bush',
  tree: 'tree', tree2: 'tree',
  stone: 'stone', stone2: 'stone',
  iron: 'iron', iron2: 'iron',
  // 黑暗森林：煤矿×1 铜矿×2 大树×3 蓝莓丛×1
  coal_mine: 'coal', copper_a: 'copper', copper_b: 'copper',
  ftree: 'tree', ftree2: 'tree', ftree3: 'tree',
  bbush: 'bbush',
  // 贫瘠沙漠：胡萝卜×2 石灰石×2 石头×1
  carrot_a: 'carrot', carrot_b: 'carrot',
  limestone_a: 'limestone', limestone_b: 'limestone',
  dstone: 'stone',
};
// 采集点按地图分桶：指派弹窗/速率面板/自动采集都只看当前图的点位
const HARVEST_SITE_MAP = {
  plains: ['bush', 'bush2', 'tree', 'tree2', 'stone', 'stone2', 'iron', 'iron2'],
  dark_forest: ['coal_mine', 'copper_a', 'copper_b', 'ftree', 'ftree2', 'ftree3', 'bbush'],
  desert: ['carrot_a', 'carrot_b', 'limestone_a', 'limestone_b', 'dstone'],
};
const HARVEST_YIELD = {
  // 难度阶梯：越难的资源单轮越慢、每分钟产出越低（浆果 4 > 木材 3 > 石头 2 > 铁矿/铜矿 1.5）
  // time = 一轮秒数；items = 一轮产出。每分钟产出预估 = 60 × 产出 / time
  bush: { time: 15, items: { berry: 1, leaf: 1 } }, // 4浆果+4树叶/分（最易）
  tree: { time: 20, items: { wood: 1, leaf: 1 } },  // 3木材+3树叶/分（3木/分 = 恰好喂一台齿轮合成）
  stone: { time: 30, items: { stone: 1 } },          // 2石头/分
  iron: { time: 40, items: { ore: 1 } },             // 1.5铁矿/分（40s 一轮，恰好喂满一台冶炼）
  copper: { time: 40, items: { copper_ore: 1 } },    // 黑暗森林铜矿：1.5铜矿/分
  coal: { time: 40, items: { coal: 1 } },            // 黑暗森林煤矿：1.5煤/分（煤窑→蒸汽机的燃料链）
  bbush: { time: 15, items: { blueberry: 1 } },      // 蓝莓丛同浆果丛难度：4蓝莓/分，徒手即采
  carrot: { time: 15, items: { carrot: 1 } },        // 沙漠胡萝卜：同浆果丛难度，4根/分，徒手即采
  limestone: { time: 40, items: { limestone: 1 } },  // 沙漠石灰石：1.5/分，两台矿机恰好喂满一台混凝土合成
};

// ===== 新手篇任务链（线性，自动接取下一个；文案见语言包 quests.*） =====
// type: gather(累计采集) / craft(累计打造) / eat(累计食用) / hunt(累计击杀)
const QUESTS = [
  { id: 'gather-berry',   type: 'gather', item: 'berry',          count: 3, reward: { berry: 6, leaf: 6 } },  // 手动 3 下
  { id: 'eat-berry',      type: 'eat', hint: 'equip',                            count: 1, reward: { berry: 2 } },
  { id: 'hunt-rabbit',    type: 'hunt',  target: 'rabbit',        count: 1, reward: { raw_rabbit: 2, herb: 1 } }, // 生兔肉是烤兔肉的原料，保持
  { id: 'make-herb',      type: 'craft', hint: 'craft', target: 'herb',          count: 1, reward: { herb: 1, leaf: 3 } }, // 做草药耗 3 叶，回补一半
  { id: 'use-herb',       type: 'med',   hint: 'equip',           count: 1, reward: { herb: 1 } },
  { id: 'cook-rabbit',    type: 'craft', hint: 'craft', target: 'cooked_rabbit', count: 1, reward: { cooked_rabbit: 1, berry: 2 } },
  { id: 'chop-wood',      type: 'gather', item: 'wood',           count: 3, reward: { wood: 6, leaf: 6 } },  // 手动 3 下
  { id: 'craft-woodaxe',  type: 'craft', hint: 'craft', target: 'wood_axe',      count: 1, reward: { berry: 2, wood: 2 } },
  { id: 'craft-woodsword', type: 'craft', hint: 'craft', target: 'wood_sword',   count: 1, reward: { berry: 2 } }, // 石头此时未解锁，不能作为奖励
  { id: 'hunt-boar',      type: 'hunt',  target: 'boar',          count: 1, reward: { raw_pork: 2, herb: 1 } },
  { id: 'craft-woodpick', type: 'craft', hint: 'craft', target: 'wood_pick',     count: 1, reward: { leaf: 3, wood: 2 } }, // 石头此时未解锁，不能作为奖励
  { id: 'mine-stone',     type: 'gather', item: 'stone',          count: 10, reward: { stone: 3, wood: 2 } },
  { id: 'craft-stonesword', type: 'craft', hint: 'craft', target: 'stone_sword', count: 1, reward: { leather: 1 } },
  { id: 'craft-leatherarmor', type: 'craft', hint: 'craft', target: 'leather_armor', count: 1, reward: { cooked_pork: 1, herb: 1 } },
  { id: 'hunt-goat',      type: 'hunt',  target: 'goat',          count: 1, reward: { ore: 3, herb: 1 } },
  // ===== 黑暗森林篇无任务：玩家自行摸索（配方/节点/地图走 QUEST_COND 计数器解锁，见 game/quest.js） =====
  { id: 'space_elevator', type: 'build', target: 'space_elevator', count: 1 },
];

// ===== 敌人：回合互殴，伤害 = max(1, 攻击方攻击 - 防守方防御) =====
// drop: 掉落物品与数量区间 [最小, 最大]
// 战斗界面会展示敌人数值并推演胜负，打不过时开始按钮显示"打不过"
// ===== 胜负规则：生命耗尽（php <= 0）才战败，败者保命撤退生命锁 1；恰好剩 1 点是极限险胜算赢 =====
// ===== 耐力铁律：各扣各的——玩家攻击扣玩家耐力、敌人反击扣敌人耐力（stam 字段）=====
// ===== 每次出手固定扣 10；耐力 <10 时该击伤害减半 max(1, floor(d/2)) =====
// ===== 门票设计：每图首怪≈上图 boss 强度（毕业装轻松过）；图 2 怪卡本图新装备；boss 卡新装备+新食物 =====
const ENEMIES = {
  // ===== 初始草原：新手教学，开局即碾压 =====
  rabbit: { hp: 3,  atk: 1,  def: 0, stam: 20, drop: { raw_rabbit: [1, 2] } }, // 徒手 1 伤×3 击秒；承 2×1=2；开局即碾压
  boar:   { hp: 12, atk: 9,  def: 1, stam: 40, drop: { raw_pork: [1, 2], leather: [2, 2] } }, // 卡木剑：3伤×4击恰好12，承3×9=27，兔肉+浆果(42/70)剩15；徒手1伤12击承99必败
  goat:   { hp: 18, atk: 17, def: 2, stam: 80, drop: { goat_horn: [1, 1], leather: [2, 3], raw_mutton: [1, 2], wool: [2, 3] } }, // 草原boss：卡石剑+皮甲+双肉餐：4伤×5击，承4×13=52，兔猪浆果(65/75)剩13；木剑2伤9击承104必败
  // ===== 黑暗森林：击败山羊解锁；全图用铁装（钢要击败树精后才出研究）；boss 卡煲的耐力+蓝莓牛排的血量 =====
  ball:   { hp: 30, atk: 15, def: 3,  stam: 50,  drop: { wood: [2, 4], mushroom: [1, 2] } }, // 首怪≈山羊强度：铁装6伤×5击恰好30，承4×9=36，羊猪浆果(75/75)剩39轻松；石剑3伤10击承75恰好锁败
  bison:  { hp: 40, atk: 17, def: 4,  stam: 60,  drop: { raw_beef: [1, 2], leather: [1, 2] } }, // 卡铁装+森林食物：5伤×8击恰好40，承6×11+5=71，牛蓝排煲(104/100)剩33；草原餐羊猪浆果(75/75)磨10击承81锁败；石剑2伤20击承131爆败
  treant: { hp: 48, atk: 17, def: 4,  stam: 80, drop: { mushroom: [2, 3] } }, // 森林boss：卡铁装+煲耐力+蓝排血量：5伤×10击恰好48（10击耗100耐，煲池100全全力），承8×11+5=93；煲蓝排牛(104/100)剩11、牛煲蓝莓(86/106)差7败、纯肉(83/70)磨14击承113爆败——煲的耐力+蓝排的血量就是门票；石剑2伤24击承163爆败
  // ===== 贫瘠沙漠：击败树精解锁钢研究；全图钢装；骷髅卡沙漠食物；淤泥卡药水 =====
  wolf:       { hp: 60,  atk: 24, def: 4, stam: 80,  drop: { raw_wolf_meat: [1, 2], wolf_fang: [0, 1] } }, // 首怪≈树精强度：钢装9伤×7击（60/9=6.67），承6×15=90，串汤狼煲(119/88)剩29、森林餐牛蓝排煲(104/100)剩14也能过（毕业装平推首怪）；铁装5伤12击承141爆败
  skeleton:   { hp: 50,  atk: 28, def: 5, stam: 90,  drop: { ore: [2, 3] } }, // 卡钢装+沙漠食物：8伤×7击（56≥50），承6×19=114；狼煲/汤/串(119/88)剩5极限过；森林餐(104/100)承114>104必败——沙漠新食物就是门票
  evil_slime: { hp: 84, atk: 22, def: 4, stam: 110, poison: 15, drop: { slime_gel: [2, 3], wolf_fang: [1, 1] } }, // boss：门票=钢装+怒气+抗毒：狂暴16伤×7击恰好84，承6×13+毒6×6=114，串汤狼煲(119/88)剩5极限过；无怒气9伤10击承171必败；无抗毒承168必死；森林餐承114>104必败；铁装+怒气7伤12击承195爆败
};

// ===== 采集产出（没有工具时用 tier0；工具按 hasItem 判定） =====
// 每档第三个元素为"采集血量"：点击扣 1 格，扣满归零才收获一次
const GATHER_YIELD = {
  bush: [
    [null, { berry: 1, leaf: 1 }, 3],
  ],
  tree: [
    [null,        { wood: 1 },            5], // 徒手只掉木头，树叶要去浆果丛顺手摘
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
    ['horn_pick',  { ore: 1 },  4, 2],
    ['iron_pick',  { ore: 1 },  4, 4],
  ],
  coal: [
    [null,         null,         4, 0],
    [null,         null,         4, 1],
    ['stone_pick', { coal: 1 },  4, 2],
    ['horn_pick',  { coal: 1 },  4, 2],
    ['iron_pick',  { coal: 1 },  4, 4],
  ],
  copper: [
    [null,         null,              4, 0],
    [null,         null,              4, 1],
    ['stone_pick', { copper_ore: 1 }, 4, 2],
    ['horn_pick',  { copper_ore: 1 }, 4, 2],
    ['iron_pick',  { copper_ore: 1 }, 4, 4],
  ],
  bbush: [
    [null, { blueberry: 1 }, 3], // 蓝莓比浆果还省事：徒手采集
  ],
  carrot: [
    [null, { carrot: 1 }, 3], // 胡萝卜徒手拔：和浆果丛同难度
  ],
  limestone: [
    [null,         null,              4, 0],
    [null,         null,              4, 1],
    ['stone_pick', { limestone: 1 }, 4, 2],
    ['horn_pick',  { limestone: 1 }, 4, 2],
    ['iron_pick',  { limestone: 1 }, 4, 4],
  ],
};
