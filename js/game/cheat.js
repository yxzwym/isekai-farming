'use strict';
// ============================================================
// 游戏逻辑 · 作弊面板（原 game.js「作弊」段，开发测试工具）
// console 输入 cheat（不带括号也行）打开面板；改动走正常 markDirty 存档流程
// ============================================================

// getter 副作用：console 里单独求值 cheat 即弹出面板；cheat() 同样兼容（返回函数再开一次无妨）
Object.defineProperty(window, 'cheat', {
  configurable: true,
  get() {
    panelOpen = 'cheat';
    return function cheatFn() { panelOpen = 'cheat'; };
  },
});
// 全部物品各加 n（强制入包，顺带标记 seen 让仓库显示出来）
function cheatAllItems(n) {
  for (const id in ITEMS) addItemForce(id, n);
  markDirty();
  toast('全部物品 +' + n, '#ffd479');
}
// 移除所有物品：只清库存数量，装备槽/食物槽/药品槽的引用不动
function cheatClearItems() {
  for (const id in state.inv) state.inv[id] = 0;
  markDirty();
  toast('已移除所有物品', '#ffd479');
}
// 指定物品加 n（强制入包；作弊面板「选择物品再增加」用）
function cheatGiveItem(id, n) {
  addItemForce(id, n);
  markDirty();
  toast(t('item.' + id + '.name') + ' +' + n, '#ffd479');
}
// 解锁全部科研条目
function cheatResearch() {
  state.research = RESEARCH.map(r => r.id);
  markDirty();
  toast('科研已全部解锁', '#ffd479');
}
// 当前任务直接标记完成进入下一环（与正常提交同路径解锁配方，但不发奖励）
function cheatSkipQuest() {
  const q = curQuest();
  if (!q) { toast('任务已全部完成', '#a89f8c'); return; }
  if (!state.questDone.includes(q.id)) state.questDone.push(q.id);
  state.quest++;
  markDirty();
  toast('已跳过：' + questName(q.id), '#ffd479');
}
function cheatVitals() {
  state.hp = BASE.hp;
  state.stamina = STAMINA.max;
  markDirty();
  toast('HP/体力已拉满', '#ffd479');
}
function cheatStress() {
  state.crank.stacks = CRANK.max;
  state.crank.timer = CRANK.seconds;
  markDirty();
  toast('摇杆应力拉满 ' + CRANK.max + '/分（' + CRANK.seconds + ' 秒）', '#ffd479');
}
// 点燃当前地图所有发电类建筑（烧燃料的）：电力测试用，burnLeft 拉长到 999 秒
function cheatPower() {
  let n = 0;
  for (const b of state.builds) {
    const def = BUILDINGS[b.t];
    if (b.map !== state.map || !def.burn || !def.gen) continue;
    b.burnLeft = 999;
    n += def.gen;
  }
  markDirty();
  toast('已点燃 ' + n + ' MW 发电（测试）', '#ffd479');
}
// 每种未锁定建筑补到 1 台（带 max 上限与建筑位上限的照常尊重；生产站不指派任务，保持待命不耗应力）
function cheatBuildAll() {
  for (const bt in BUILDINGS) {
    const def = BUILDINGS[bt];
    if (def.locked) continue;
    if (def.max && state.builds.filter(b => b.t === bt && b.map === state.map).length >= def.max) continue;
    if (state.builds.filter(b => b.map === state.map).length >= MAX_BUILDS) break;
    const b = { t: bt, map: state.map, busy: 0, burnLeft: 0 };
    if (def.use) { if (bt === 'harvester') b.node = null; else b.recipe = null; }
    state.builds.push(b);
  }
  markDirty();
  toast('每种建筑已补到 1 台', '#ffd479');
}
// 清空存档并刷新页面（scenes.js 的清档按钮走两段确认后才调用）
function cheatWipe() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  location.reload();
}
