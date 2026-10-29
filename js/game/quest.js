'use strict';
// ============================================================
// 游戏逻辑 · 任务系统（原 game.js「任务」段）
// 主线任务进度判定、配方解锁、提交与提示
// ============================================================

// ===== 摸索式解锁条件表 =====
// 黑暗森林篇删除了任务链，原任务 id 改由 counters（行为计数）驱动；键 = 兼容旧数据的任务 id
const QUEST_COND = {
  'hunt-ball':   () => (state.counters.hunt.ball || 0) >= 1,
  'hunt-bison':  () => (state.counters.hunt.bison || 0) >= 1,
  'hunt-treant': () => (state.counters.hunt.treant || 0) >= 1,
  'gather-coal': () => (state.counters.gather.coal || 0) >= 5,
  'cook-beef':   () => (state.counters.craft.cooked_beef || 0) >= 1,
  'make-stew':   () => (state.counters.craft.mushroom_stew || 0) >= 1,
  // ===== 贫瘠沙漠：同样无任务，配方/节点全靠行为计数 =====
  'hunt-wolf':       () => (state.counters.hunt.wolf || 0) >= 1,
  'hunt-skeleton':   () => (state.counters.hunt.skeleton || 0) >= 1,
  'hunt-evil_slime': () => (state.counters.hunt.evil_slime || 0) >= 1,
  'gather-carrot':   () => (state.counters.gather.carrot || 0) >= 1,
  'gather-limestone': () => (state.counters.gather.limestone || 0) >= 1,
};
// 统一解锁判定：表内走计数器，否则回落已完成任务（在表中的 id 永远不走任务判定）
function condMet(id) {
  if (QUEST_COND[id]) return QUEST_COND[id]();
  return state.questDone.includes(id);
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
  if (r.unlock && !condMet(r.unlock)) return false;
  if (r.res && !state.research.includes(r.res)) return false; // 科研未完成：铜产线等保持隐藏
  return true;
}
function questName(id) { return t('quests.' + id + '.name'); }
function questLines(id, key) {
  const arr = t('quests.' + id + '.' + key);
  return Array.isArray(arr) ? arr.slice() : [];
}

// 任务可提交时弹一次性提示
function checkQuestHint() {
  const q = curQuest();
  if (q && !state.questNotified[q.id] && questProgress(q) >= q.count) {
    state.questNotified[q.id] = true;
    toast(tf('ui.questHint'), '#ffc966');
    markDirty();
  }
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
    showAutoHint(); // 提交 cook-rabbit 时伐木取材任务触发、树刚出现，此刻弹长按教学；其余提交被哨兵拦住
  };
  if (lines.length) startDialogue(lines, { onDone: giveRewards });
  else giveRewards();
}
