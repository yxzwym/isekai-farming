'use strict';
// ============================================================
// 游戏逻辑 · 对话系统与场景流转（原 game.js「对话」「场景流转」段）
// 剧情对白逐行显示、新游戏/继续/回主菜单/关面板
// ============================================================

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
  autoHintPushed = false; // 重进游戏后教学提示允许重新显示
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
  autoHintPushed = false; // 重进游戏后教学提示允许重新显示
  panelOpen = null;
  scene = 'game';
  // 已经达成的目标不再弹提示
  const q = curQuest();
  if (q && questProgress(q) >= q.count) state.questNotified[q.id] = true;
  showAutoHint(); // 中途退过的老玩家：树已出现但没触发过自动化，进游戏补一次教学提示
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
