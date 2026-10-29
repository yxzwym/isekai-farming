'use strict';
// ============================================================
// 场景 · 采集节点与装饰（原 scenes.js「节点」「装饰」段）
// 节点定义 / 命中检测 / 草地装饰与节点绘制（局部坐标）
// ============================================================

// 采集/战斗节点（名称见语言包 node.*；show = 出现条件；map = 所属地图，缺省初始草原）
// 采集节点 id 必须与 GATHER_YIELD/HARVEST_SITES 的类型键一致（doGather 按 n.id 取产出档）
const NODES = [
  // 每种资源只画一个采集点供手敲；地图上每种资源实际有多个点（见 HARVEST_SITES），
  // 数量展示与采集站指派都在「建筑」面板里
  { id: 'bush',   k: 'bush',   map: 'plains', x: 70,  y: 460, r: 60, action: 'gather', show: () => true },
  { id: 'rabbit', k: 'rabbit', map: 'plains', x: 398, y: 452, r: 56, action: 'battle', show: () => state.questDone.includes('eat-berry') },
  { id: 'tree',   k: 'tree',   map: 'plains', x: 240, y: 268, r: 72, action: 'gather', show: () => state.questDone.includes('cook-rabbit') }, // 伐木取材任务触发（cook-rabbit 完成）时出现
  { id: 'boar',   k: 'boar',   map: 'plains', x: 92,  y: 330, r: 56, action: 'battle', show: () => state.questDone.includes('craft-woodsword') },
  { id: 'stone',  k: 'stone',  map: 'plains', x: 392, y: 316, r: 56, action: 'gather', show: () => state.questDone.includes('hunt-boar') },
  { id: 'goat',   k: 'goat',   map: 'plains', x: 240, y: 442, r: 60, action: 'battle', show: () => state.questDone.includes('craft-leatherarmor') },
  { id: 'iron',   k: 'iron',   map: 'plains', x: 392, y: 200, r: 56, action: 'gather', show: () => state.questDone.includes('hunt-goat') },
  // 黑暗森林：采集点进图即显示；敌人全部直接展示（图2无任务，玩家自行探索）
  { id: 'coal',   k: 'coal',   map: 'dark_forest', x: 85,  y: 430, r: 60, action: 'gather', show: () => true },
  { id: 'copper', k: 'copper', map: 'dark_forest', x: 390, y: 190, r: 56, action: 'gather', show: () => true },
  { id: 'bbush',  k: 'bbush',  map: 'dark_forest', x: 395, y: 330, r: 56, action: 'gather', show: () => true },
  { id: 'ball',   k: 'ball',   map: 'dark_forest', x: 240, y: 260, r: 58, action: 'battle', show: () => condMet('hunt-goat') },
  { id: 'bison',  k: 'bison',  map: 'dark_forest', x: 240, y: 470, r: 62, action: 'battle', show: () => true },
  { id: 'treant', k: 'treant', map: 'dark_forest', x: 92,  y: 330, r: 80, action: 'battle', show: () => true },
  // 贫瘠沙漠：采集点进图即显示；战斗节点按击杀计数逐步出现（无任务，自行摸索）
  { id: 'carrot',    k: 'carrot',    map: 'desert', x: 85,  y: 430, r: 52, action: 'gather', show: () => true },
  { id: 'limestone', k: 'limestone', map: 'desert', x: 390, y: 190, r: 56, action: 'gather', show: () => true },
  { id: 'stone',     k: 'stone',     map: 'desert', x: 395, y: 330, r: 56, action: 'gather', show: () => true }, // 砂岩石矿：沿用 stone 产出档
  { id: 'wolf',       k: 'wolf',       map: 'desert', x: 240, y: 470, r: 62, action: 'battle', show: () => true },
  { id: 'skeleton',   k: 'skeleton',   map: 'desert', x: 395, y: 455, r: 58, action: 'battle', show: () => condMet('hunt-wolf') },
  { id: 'evil_slime', k: 'evil_slime', map: 'desert', x: 92,  y: 330, r: 80, action: 'battle', show: () => condMet('hunt-skeleton') },
];

// 命中检测：屏幕坐标下的可采集节点（长按自动采集用）
function gatherNodeAt(x, y) {
  if (dialog.active || battle.active || panelOpen || scene !== 'game') return null;
  for (const n of NODES) {
    if ((n.map || 'plains') !== state.map || !n.show() || n.action !== 'gather') continue;
    const hr = Math.max(n.r, 44) * 0.9;
    if (x >= n.x - hr && x <= n.x + hr && y >= n.y - hr && y <= n.y + hr + 14) return n;
  }
  return null;
}

// 草地装饰（固定位置）
const DECOR = [
  { x: 40, y: 200, k: 0 }, { x: 420, y: 210, k: 1 }, { x: 60, y: 330, k: 1 },
  { x: 150, y: 160, k: 0 }, { x: 320, y: 150, k: 1 }, { x: 440, y: 330, k: 0 },
  { x: 30, y: 480, k: 2 }, { x: 445, y: 490, k: 2 }, { x: 200, y: 500, k: 1 },
  { x: 300, y: 480, k: 0 }, { x: 90, y: 260, k: 2 }, { x: 405, y: 275, k: 2 },
];

// ===== 装饰 =====
function drawDecor() {
  for (const d of DECOR) {
    ctx.save();
    ctx.translate(d.x, d.y);
    if (d.k === 0) {
      // 草丛（沙漠 = 枯黄干草）；主菜单也复用本函数画装饰，此时 state 尚未加载，须先判空
      ctx.strokeStyle = state && state.map === 'desert' ? 'rgba(196,158,82,.85)' : 'rgba(58,130,58,.8)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, 4); ctx.lineTo(-7, -5);
      ctx.moveTo(0, 4); ctx.lineTo(0, -7);
      ctx.moveTo(5, 4); ctx.lineTo(7, -5);
      ctx.stroke();
    } else if (d.k === 1) {
      // 小花
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 4, Math.sin(a) * 4, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    } else {
      // 石子
      ctx.fillStyle = 'rgba(120,130,110,.7)';
      ctx.beginPath(); ctx.ellipse(0, 0, 6, 4, 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// ===== 节点绘制（局部坐标） =====
function drawBush(x, y, berry) {
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(x, y + 26, 42, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3e8f3a';
  ctx.beginPath(); ctx.arc(x - 24, y + 4, 22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 24, y + 4, 22, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y - 10, 27, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y + 10, 21, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5cb054';
  ctx.beginPath(); ctx.arc(x - 8, y - 16, 12, 0, Math.PI * 2); ctx.fill();
  // 浆果（颜色可换：蓝莓丛结蓝果）
  const bc = berry || '#e14b4b';
  const dots = [[-18, 2], [6, -14], [18, 8], [-2, 12]];
  for (const [dx, dy] of dots) {
    ctx.fillStyle = bc;
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 5.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.arc(x + dx - 1.6, y + dy - 1.6, 1.7, 0, Math.PI * 2); ctx.fill();
  }
}

function drawRock(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(x, y + 24, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  // 一堆灰石头
  const rocks = [[-20, 8, 18], [16, 10, 16], [-2, -6, 22], [24, -4, 12], [-28, -2, 12]];
  for (const [dx, dy, r] of rocks) {
    ctx.fillStyle = '#9aa0a8';
    ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8bec6';
    ctx.beginPath(); ctx.arc(x + dx - r * 0.25, y + dy - r * 0.3, r * 0.55, 0, Math.PI * 2); ctx.fill();
  }
}

// 铁矿脉（褐铁斑点）
function drawIronNode(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(x, y + 24, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#94989f';
  ctx.beginPath();
  ctx.moveTo(x - 42, y + 20); ctx.lineTo(x - 34, y - 14); ctx.lineTo(x - 8, y - 28);
  ctx.lineTo(x + 24, y - 22); ctx.lineTo(x + 42, y + 4); ctx.lineTo(x + 22, y + 22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#aeb2b9';
  ctx.beginPath();
  ctx.moveTo(x - 34, y - 14); ctx.lineTo(x - 8, y - 28); ctx.lineTo(x + 8, y - 18);
  ctx.lineTo(x - 18, y - 6);
  ctx.closePath(); ctx.fill();
  const spots = [[-16, 4], [8, -6], [20, 8], [-2, 12]];
  for (const [dx, dy] of spots) {
    ctx.fillStyle = '#7d838c';
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b717a';
    ctx.beginPath(); ctx.arc(x + dx + 1.4, y + dy + 1.4, 2, 0, Math.PI * 2); ctx.fill();
  }
}

// 煤矿脉（深灰岩 + 乌黑煤块）
function drawCoalNode(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(x, y + 24, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5c5f66';
  ctx.beginPath();
  ctx.moveTo(x - 42, y + 20); ctx.lineTo(x - 34, y - 14); ctx.lineTo(x - 8, y - 28);
  ctx.lineTo(x + 24, y - 22); ctx.lineTo(x + 42, y + 4); ctx.lineTo(x + 22, y + 22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6e7178';
  ctx.beginPath();
  ctx.moveTo(x - 34, y - 14); ctx.lineTo(x - 8, y - 28); ctx.lineTo(x + 8, y - 18);
  ctx.lineTo(x - 18, y - 6);
  ctx.closePath(); ctx.fill();
  const spots = [[-16, 4], [8, -6], [20, 8], [-2, 12]];
  for (const [dx, dy] of spots) {
    ctx.fillStyle = '#26282e';
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3d45';
    ctx.beginPath(); ctx.arc(x + dx - 1.6, y + dy - 1.6, 2.2, 0, Math.PI * 2); ctx.fill();
  }
}

// 铜矿脉（灰岩 + 铜橙矿斑）
function drawCopperNode(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(x, y + 24, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#94989f';
  ctx.beginPath();
  ctx.moveTo(x - 42, y + 20); ctx.lineTo(x - 34, y - 14); ctx.lineTo(x - 8, y - 28);
  ctx.lineTo(x + 24, y - 22); ctx.lineTo(x + 42, y + 4); ctx.lineTo(x + 22, y + 22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#aeb2b9';
  ctx.beginPath();
  ctx.moveTo(x - 34, y - 14); ctx.lineTo(x - 8, y - 28); ctx.lineTo(x + 8, y - 18);
  ctx.lineTo(x - 18, y - 6);
  ctx.closePath(); ctx.fill();
  const spots = [[-16, 4], [8, -6], [20, 8], [-2, 12]];
  for (const [dx, dy] of spots) {
    ctx.fillStyle = '#c47a3d';
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e09a5a';
    ctx.beginPath(); ctx.arc(x + dx - 1.5, y + dy - 1.5, 2, 0, Math.PI * 2); ctx.fill();
  }
}

// 石灰岩崖（沙漠：灰白岩体 + 米黄沉积纹理）
function drawLimestoneNode(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,.14)';
  ctx.beginPath(); ctx.ellipse(x, y + 24, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#cfc7b2';
  ctx.beginPath();
  ctx.moveTo(x - 42, y + 20); ctx.lineTo(x - 34, y - 14); ctx.lineTo(x - 8, y - 28);
  ctx.lineTo(x + 24, y - 22); ctx.lineTo(x + 42, y + 4); ctx.lineTo(x + 22, y + 22);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e0d9c6';
  ctx.beginPath();
  ctx.moveTo(x - 34, y - 14); ctx.lineTo(x - 8, y - 28); ctx.lineTo(x + 8, y - 18);
  ctx.lineTo(x - 18, y - 6);
  ctx.closePath(); ctx.fill();
  // 沉积层理线
  ctx.strokeStyle = 'rgba(150,140,115,.6)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 30, y + 4); ctx.lineTo(x - 6, y + 8); ctx.lineTo(x + 18, y + 2);
  ctx.moveTo(x - 22, y + 14); ctx.lineTo(x + 2, y + 17);
  ctx.stroke();
  const spots = [[-16, 2], [10, -8], [22, 6]];
  for (const [dx, dy] of spots) {
    ctx.fillStyle = '#efe9d8';
    ctx.beginPath(); ctx.arc(x + dx, y + dy, 4.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b8ae94';
    ctx.beginPath(); ctx.arc(x + dx + 1.4, y + dy + 1.4, 1.8, 0, Math.PI * 2); ctx.fill();
  }
}

// 胡萝卜地（沙漠：沙垄里露出橙萝卜头 + 绿缨）
function drawCarrot(x, y) {
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.beginPath(); ctx.ellipse(x, y + 22, 44, 11, 0, 0, Math.PI * 2); ctx.fill();
  // 隆起的沙垄
  ctx.fillStyle = '#e3c58f';
  ctx.beginPath(); ctx.ellipse(x, y + 8, 40, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#edd6a4';
  ctx.beginPath(); ctx.ellipse(x, y + 4, 34, 12, 0, 0, Math.PI * 2); ctx.fill();
  // 露头的萝卜（橙肩 + 生长环）与绿缨
  const roots = [[-18, 0], [4, -6], [22, 2]];
  for (const [dx, dy] of roots) {
    ctx.fillStyle = '#e8813c';
    ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 8.5, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f29a58';
    ctx.beginPath(); ctx.ellipse(x + dx - 2, y + dy - 2, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3f9142'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + dx - 3, y + dy - 5); ctx.lineTo(x + dx - 7, y + dy - 16);
    ctx.moveTo(x + dx, y + dy - 6); ctx.lineTo(x + dx, y + dy - 19);
    ctx.moveTo(x + dx + 3, y + dy - 5); ctx.lineTo(x + dx + 7, y + dy - 16);
    ctx.stroke();
  }
}

function drawTree(x, y, s, silhouette, dark) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = silhouette ? 'rgba(0,0,0,.4)' : 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(0, 56, 52, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = silhouette ? 'rgba(0,0,0,.55)' : (dark ? '#54371f' : '#7a4f2a');
  rr(-10, -12, 20, 70, 6); ctx.fill();
  const crown = silhouette ? 'rgba(0,0,0,.5)' : (dark ? '#275231' : '#4e9c46');
  const crown2 = silhouette ? 'rgba(0,0,0,.45)' : (dark ? '#356a41' : '#62b358');
  ctx.fillStyle = crown;
  ctx.beginPath(); ctx.arc(-36, -18, 34, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(36, -18, 34, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -48, 44, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -12, 38, 0, Math.PI * 2); ctx.fill();
  if (!silhouette) {
    ctx.fillStyle = crown2;
    ctx.beginPath(); ctx.arc(-12, -54, 22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(18, -34, 16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
