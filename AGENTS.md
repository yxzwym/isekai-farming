# AGENTS.md · 开发约定

纯原生 Canvas 网页游戏：HTML/CSS/JS 零依赖、零构建。480×800 逻辑分辨率。
全局变量通信，**禁用 ES modules**；23 个 JS 文件按 `index.html` 中的顺序加载，顺序不能乱。

改完代码跑测试（macOS 自带，零依赖）：

```
osascript -l JavaScript tests/harness.js
```

`tests/balance_scan.js` 是数值断言套件。**任何战斗数值（ENEMIES/装备/食物/药水）改动都必须跑它**，42 条断言全绿才算过。套件里每次跑完还会打印 `debugFight` 战斗实录（每场的 php/ehp/击数/敌耐余），想知道某配置打不打得过直接加一场模拟，不手推。

## 战斗系统铁律（用户裁决，不可擅改）

1. **耐力各扣各**：玩家攻击扣玩家耐力池 `state.stamina`，敌人反击扣敌人耐力池 `battle.estam`（`startBattle` 时初始化为 `ENEMIES[id].stam`）。每次出手固定 10 点（`STAMINA.cost`）。池子见底后该次出手**伤害减半但可无限继续**——不存在"没耐力就不能打"。
2. **伤害公式**：`dmg = max(1, atkVal - defVal)`；减半击 `max(1, floor(dmg/2))`。
3. **派生属性**：`atkVal = floor((BASE.atk 1 + 武器atk + 食物atk + 药水atk) × (1 + atkPct合计))`；`defVal = BASE.def 0 + 食物def + 护甲def`。
4. **血池/耐力池**：`hp池 = BASE.hp 20 + Σ食物hp`（战斗开始时快照进 `battle.php`）；`耐力池 = STAMINA.max 50 + Σ食物stam + Σ药水stam`。
5. **胜负**：`battle.php <= 0` 才战败；败者 `php` 锁 1 且 `settleBattle` 后 `state.hp = 1`（保命撤退）；`php = 1` 且敌人已倒是极限险胜算赢。
6. **门票设计**：每个怪「当时的最好装备 + 最好食物刚好能打过，差几滴血无所谓」；下一件装备到手后回来碾压。难度阶梯：每张图第一个怪 ≈ 上一张图最后一个怪；第二个怪需要本图新装备；boss 需要新装备 + 新食物。开局兔子 3 滴血碾压级。
7. **获取顺序**：配数值必须按玩家实际获取顺序推演（见下链），不能引用未来才有的装备/食物。图 2（黑暗森林）全用铁装；钢研究击败树精后才解锁，钢装留给图 3；骷髅卡沙漠食物，淤泥 boss 卡三药水；狼牙棒+狼甲（hunt-evil_slime 解锁）是终局装备。

## 装备/食物获取顺序链

```
徒手+浆果 → 兔子
木剑(craft-woodaxe)+兔肉 → 野猪          （皮甲配方要打完野猪才解锁，野猪战无甲）
石剑+皮甲+兔肉/猪肉 → 山羊               （击败山羊解锁黑暗森林+铁线）
铁装+羊猪浆果 → 球球人                    （煲配方 hunt-ball 解锁）
铁装+牛蓝排煲 → 野牛                      （cooked_beef/blueberry_steak hunt-bison 解锁）
铁装+煲蓝排牛 → 树精                      （煲耐力+蓝排血量=门票；击败树精解锁沙漠+钢研究）
钢装+串/汤/狼煲 → 野狼                    （沙漠菜 hunt-wolf 前后解锁；钢装+森林餐也能平推）
钢装+狼煲/汤/串 → 骷髅                    （沙漠新食物就是门票；森林餐必败）
钢装+狼煲/汤/串+劲力/抗毒/怒气 → 淤泥 boss（三药缺一必败）
狼牙棒+狼甲（击败淤泥解锁）→ 终局装备
```

## 数值验证方法

**不手推，直接模拟**：改完数值跑 `osascript -l JavaScript tests/harness.js`，看 `debugFight` 实录与断言结果：

- `debugFight(敌人id, { w, a, foods, potions })` 返回真实战报（php/ehp/双方击数/敌耐余/锁败与否）
- 卡低配：断言「上一档装备 + 上一档食物」组合锁败；卡 boss：断言「新装备 + 无新食物/新药水」恰好锁败（如树精缺蓝莓牛排、淤泥无怒气）
- 期望值与 world.js ENEMIES 注释账目互为校验：偏离说明数据被改坏，先查数据再改断言

## 项目结构

- `js/data/`：config（BASE/STAMINA/BATTLE_SPEEDS）、items（ITEMS/DURABILITY/FOODS/POTIONS/RECIPES/RESEARCH）、world（MAPS/QUESTS/ENEMIES/GATHER_YIELD）
- `js/game/`：state（存档）、vitals（派生属性/穿戴/耐久/用药）、actions（采集/生产）、factory、battle、quest、dialog、cheat
- `js/scenes/`：每个画面一个渲染文件；`js/ui.js` 公共 UI；`js/i18n.js` + `js/lang/` 双语
- 文案全部走语言包 `t()/tf()`，不硬编码字符串；数值只维护在 data 层一处
- 敌人删除要清全链：ENEMIES、drop、场景绘制分支、语言包 enemy.*/item.*/剧情
