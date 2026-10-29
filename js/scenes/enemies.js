'use strict';
// ============================================================
// 场景 · 敌人绘制（原 scenes.js「敌人绘制」段）
// 7 种敌人专属画法 + 通用走兽兜底 + ENEMY_DRAW 映射表
// ============================================================

// 白兔（侧影：长耳、圆身）
function drawRabbit(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.14)';
  ctx.beginPath(); ctx.ellipse(0, 26, 34, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0ede6';
  ctx.beginPath(); ctx.ellipse(0, 6, 26, 19, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-26, 8, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f0ede6';
  ctx.beginPath(); ctx.arc(22, -2, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e4dfd4';
  ctx.beginPath(); ctx.ellipse(18, -22, 4.5, 12, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(27, -21, 4.5, 12, 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f3b8c4';
  ctx.beginPath(); ctx.ellipse(18, -22, 2, 8, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c2c34';
  ctx.beginPath(); ctx.arc(26, -4, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(33, 1, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 黑山羊（boss：弯角、红瞳、山羊胡）
function drawGoat(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(0, 30, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2e2e36';
  rr(-26, 14, 9, 18, 4); ctx.fill();
  rr(16, 14, 9, 18, 4); ctx.fill();
  ctx.fillStyle = '#3a3a44';
  ctx.beginPath(); ctx.ellipse(0, -2, 36, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#33333c';
  ctx.beginPath(); ctx.ellipse(30, 2, 17, 14, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(30, -18, 12, Math.PI * 1.15, Math.PI * 1.9); ctx.stroke();
  ctx.fillStyle = '#2e2e36';
  ctx.beginPath(); ctx.ellipse(22, -10, 6, 3.5, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(40, 10); ctx.lineTo(42, 18); ctx.stroke();
  ctx.fillStyle = '#e8e6df';
  ctx.beginPath(); ctx.ellipse(35, -4, 4.4, 3.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath(); ctx.ellipse(36, -4, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawBoar(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(0, 30, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  // 腿
  ctx.fillStyle = '#8f5a4a';
  rr(-26, 12, 10, 18, 4); ctx.fill();
  rr(14, 12, 10, 18, 4); ctx.fill();
  // 身体
  ctx.fillStyle = '#b98069';
  ctx.beginPath(); ctx.ellipse(0, -2, 36, 24, 0, 0, Math.PI * 2); ctx.fill();
  // 背鬃
  ctx.strokeStyle = '#7c4f3d'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-22, -20); ctx.lineTo(-16, -27);
  ctx.moveTo(-8, -24); ctx.lineTo(-2, -31);
  ctx.moveTo(6, -24); ctx.lineTo(12, -30);
  ctx.stroke();
  // 头
  ctx.fillStyle = '#a86e58';
  ctx.beginPath(); ctx.arc(28, 4, 18, 0, Math.PI * 2); ctx.fill();
  // 耳朵
  ctx.fillStyle = '#8f5a4a';
  ctx.beginPath(); ctx.moveTo(20, -12); ctx.lineTo(26, -24); ctx.lineTo(31, -12); ctx.closePath(); ctx.fill();
  // 獠牙
  ctx.fillStyle = '#f3ede0';
  ctx.beginPath(); ctx.moveTo(36, 10); ctx.quadraticCurveTo(44, 8, 42, 0); ctx.lineTo(38, 6); ctx.closePath(); ctx.fill();
  // 猪鼻
  ctx.fillStyle = '#d9a08c';
  ctx.beginPath(); ctx.ellipse(42, 4, 8, 6.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8f5a4a';
  ctx.beginPath(); ctx.arc(44, 2.5, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(44, 6, 1.4, 0, Math.PI * 2); ctx.fill();
  // 眼睛
  ctx.fillStyle = '#2c1d16';
  ctx.beginPath(); ctx.arc(30, -3, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ============================================================
// 战斗界面敌人绘制映射（按敌人 id 取绘制函数，未收录的走通用走兽画法）
// ============================================================
const ENEMY_DRAW = {
  boar: drawBoar, rabbit: drawRabbit, goat: drawGoat,
  ball: drawBall, bison: drawBison, treant: drawTreant,
  wolf: drawWolf, skeleton: drawSkeleton, evil_slime: drawSlime,
};

// 通用走兽（后续敌人先落到这里，再逐步给专属画法）
function drawBeast(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(0, 30, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8d99a8';
  rr(-30, 10, 10, 20, 4); ctx.fill();
  rr(18, 10, 10, 20, 4); ctx.fill();
  ctx.fillStyle = '#a5b2c2';
  ctx.beginPath(); ctx.ellipse(0, -2, 36, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(30, -6, 17, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(22, -20); ctx.lineTo(27, -32); ctx.lineTo(33, -20); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-34, -8); ctx.quadraticCurveTo(-52, -18, -46, 2); ctx.quadraticCurveTo(-40, 10, -30, 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2c2c34';
  ctx.beginPath(); ctx.arc(34, -10, 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 球球人（圆滚滚的抽象怪：果冻圆身 + 呆滞圆眼 + 短手短脚）
function drawBall(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(0, 30, 40, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b56128';
  rr(-20, 18, 10, 13, 5); ctx.fill();
  rr(10, 18, 10, 13, 5); ctx.fill();
  ctx.strokeStyle = '#e8913c'; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-30, 2); ctx.lineTo(-40, 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(30, 2); ctx.lineTo(40, 12); ctx.stroke();
  ctx.fillStyle = '#e8913c';
  ctx.beginPath(); ctx.arc(0, -6, 33, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4b269';
  ctx.beginPath(); ctx.arc(-10, -18, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-10, -10, 7, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(11, -10, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c2c34';
  ctx.beginPath(); ctx.arc(-8, -10, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(13, -10, 3.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2c2c34'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(1, 2, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  ctx.restore();
}

// 野牛（壮硕深棕：肩峰 + 弯角 + 畜生脸）
function drawBison(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(0, 30, 48, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a352a';
  rr(-28, 12, 11, 20, 4); ctx.fill();
  rr(16, 12, 11, 20, 4); ctx.fill();
  ctx.fillStyle = '#5d4433';
  ctx.beginPath(); ctx.ellipse(0, -2, 40, 25, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6e5340';
  ctx.beginPath(); ctx.ellipse(-4, -20, 23, 15, 0, 0, Math.PI * 2); ctx.fill(); // 肩峰
  ctx.beginPath(); ctx.ellipse(31, 2, 16, 13, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#e8dcc4'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(31, -16, 11, Math.PI * 1.15, Math.PI * 1.9); ctx.stroke(); // 弯角
  ctx.fillStyle = '#3a2c22';
  ctx.beginPath(); ctx.ellipse(42, 8, 5.5, 4.5, 0.4, 0, Math.PI * 2); ctx.fill(); // 鼻吻
  ctx.fillStyle = '#2c2c34';
  ctx.beginPath(); ctx.arc(36, -5, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 树精（森林 boss：成精的古树，树皮脸 + 红瞳 + 根须脚）
function drawTreant(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath(); ctx.ellipse(0, 52, 56, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-16, 20); ctx.quadraticCurveTo(-26, 34, -36, 44);
  ctx.moveTo(16, 20); ctx.quadraticCurveTo(26, 34, 34, 46);
  ctx.moveTo(0, 24); ctx.quadraticCurveTo(2, 36, -2, 48);
  ctx.stroke();
  ctx.fillStyle = '#6b4527';
  ctx.beginPath();
  ctx.moveTo(-26, 24); ctx.quadraticCurveTo(-34, -8, -18, -34);
  ctx.lineTo(18, -34);
  ctx.quadraticCurveTo(34, -8, 26, 24);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a3a22'; // 树瘤
  ctx.beginPath(); ctx.ellipse(-12, 8, 5, 7, 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(14, 14, 4, 5, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2e5e38';
  ctx.beginPath(); ctx.arc(-34, -46, 28, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(34, -46, 28, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -62, 36, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -38, 32, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3d7a48';
  ctx.beginPath(); ctx.arc(-10, -66, 18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(20, -50, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3a2517'; // 眼窝
  ctx.beginPath(); ctx.ellipse(-12, -16, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(12, -16, 8, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e05a4e'; // 红瞳
  ctx.beginPath(); ctx.arc(-12, -15, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(12, -15, 3.6, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#3a2517'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(-4, 1); ctx.lineTo(2, 5); ctx.lineTo(9, 1); ctx.stroke();
  ctx.restore();
}

// 野狼（沙漠：灰毛竖耳、龇牙、垂尾）
function drawWolf(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(0, 30, 46, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#6e7278'; // 腿
  rr(-28, 12, 10, 18, 4); ctx.fill();
  rr(16, 12, 10, 18, 4); ctx.fill();
  ctx.fillStyle = '#82878e'; // 身体
  ctx.beginPath(); ctx.ellipse(-4, 0, 36, 22, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#94999f'; // 背毛浅色
  ctx.beginPath(); ctx.ellipse(-6, -12, 28, 12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#82878e'; // 头
  ctx.beginPath(); ctx.arc(28, -6, 17, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); // 吻部
  ctx.moveTo(38, -8); ctx.lineTo(52, -2); ctx.lineTo(38, 4);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6e7278'; // 竖耳
  ctx.beginPath(); ctx.moveTo(20, -20); ctx.lineTo(24, -33); ctx.lineTo(30, -20); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(28, -20); ctx.lineTo(34, -31); ctx.lineTo(38, -18); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#6e7278'; ctx.lineWidth = 6; ctx.lineCap = 'round'; // 垂尾
  ctx.beginPath(); ctx.moveTo(-36, -6); ctx.quadraticCurveTo(-52, 0, -50, 14); ctx.stroke();
  ctx.fillStyle = '#f3ede0'; // 龇牙
  ctx.beginPath(); ctx.moveTo(42, -2); ctx.lineTo(44, 3); ctx.lineTo(46, -2); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(48, -3); ctx.lineTo(50, 1); ctx.lineTo(52, -4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8b23c'; // 琥珀眼
  ctx.beginPath(); ctx.ellipse(31, -10, 3.6, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c2c34';
  ctx.beginPath(); ctx.arc(32, -10, 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// 骷髅（沙漠：白骨骨架、黑眼窝、肋骨）
function drawSkeleton(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  ctx.fillStyle = 'rgba(0,0,0,.16)';
  ctx.beginPath(); ctx.ellipse(0, 32, 36, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ddd6c4'; ctx.lineWidth = 5.5; ctx.lineCap = 'round'; // 腿骨
  ctx.beginPath();
  ctx.moveTo(-9, 10); ctx.lineTo(-11, 30);
  ctx.moveTo(9, 10); ctx.lineTo(11, 30);
  ctx.stroke();
  ctx.fillStyle = '#e8e2d0'; // 骨盆
  ctx.beginPath(); ctx.ellipse(0, 10, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ddd6c4'; ctx.lineWidth = 4.5; // 脊柱
  ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 8); ctx.stroke();
  ctx.strokeStyle = '#e8e2d0'; ctx.lineWidth = 3.4; // 肋骨
  ctx.beginPath();
  ctx.moveTo(-2, -8); ctx.quadraticCurveTo(-16, -8, -18, 0);
  ctx.moveTo(2, -8); ctx.quadraticCurveTo(16, -8, 18, 0);
  ctx.moveTo(-2, -2); ctx.quadraticCurveTo(-15, -2, -16, 5);
  ctx.moveTo(2, -2); ctx.quadraticCurveTo(15, -2, 16, 5);
  ctx.stroke();
  ctx.strokeStyle = '#ddd6c4'; ctx.lineWidth = 4.2; ctx.lineCap = 'round'; // 臂骨
  ctx.beginPath();
  ctx.moveTo(-8, -12); ctx.lineTo(-24, -2); ctx.lineTo(-30, 12);
  ctx.moveTo(8, -12); ctx.lineTo(24, -2); ctx.lineTo(30, 12);
  ctx.stroke();
  ctx.fillStyle = '#efeadb'; // 头骨
  ctx.beginPath(); ctx.arc(0, -22, 15, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); // 下颚
  ctx.moveTo(-8, -12); ctx.quadraticCurveTo(0, -4, 8, -12);
  ctx.quadraticCurveTo(0, -16, -8, -12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a2620'; // 黑眼窝
  ctx.beginPath(); ctx.ellipse(-6, -24, 4.4, 5.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(6, -24, 4.4, 5.2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c0392b'; // 眼窝幽火
  ctx.beginPath(); ctx.arc(-6, -24, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(6, -24, 1.8, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a2620'; ctx.lineWidth = 1.6; // 牙缝
  ctx.beginPath();
  ctx.moveTo(-4, -13); ctx.lineTo(-4, -9);
  ctx.moveTo(0, -13); ctx.lineTo(0, -8);
  ctx.moveTo(4, -13); ctx.lineTo(4, -9);
  ctx.stroke();
  ctx.restore();
}

// 邪恶淤泥（沙漠 boss：紫黑泥浆团、气泡、毒绿核心）
function drawSlime(x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s || 1, s || 1);
  const w = performance.now() / 300;
  ctx.fillStyle = 'rgba(40,20,50,.2)';
  ctx.beginPath(); ctx.ellipse(0, 32, 50, 12, 0, 0, Math.PI * 2); ctx.fill();
  // 泥浆主体（顶部随时间蠕动）
  const wob = Math.sin(w) * 4;
  ctx.fillStyle = '#5b3d78';
  ctx.beginPath();
  ctx.moveTo(-40, 24);
  ctx.quadraticCurveTo(-46, -6, -22 - wob, -26);
  ctx.quadraticCurveTo(0, -44 + wob, 22 - wob, -26);
  ctx.quadraticCurveTo(46, -6, 40, 24);
  ctx.quadraticCurveTo(0, 34, -40, 24);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6d4c8e'; // 高光泥层
  ctx.beginPath();
  ctx.moveTo(-30, 14);
  ctx.quadraticCurveTo(-34, -8, -16 - wob * 0.7, -22);
  ctx.quadraticCurveTo(0, -34 + wob * 0.7, 16 - wob * 0.7, -22);
  ctx.quadraticCurveTo(33, -8, 30, 14);
  ctx.quadraticCurveTo(0, 22, -30, 14);
  ctx.closePath(); ctx.fill();
  // 上浮毒泡
  const bs = (performance.now() / 900) % 1;
  ctx.fillStyle = 'rgba(140,200,90,.5)';
  ctx.beginPath(); ctx.arc(-14, 8 - bs * 26, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(16, 12 - ((bs + 0.5) % 1) * 30, 3.2, 0, Math.PI * 2); ctx.fill();
  // 毒绿核心（滴毒的眼睛）
  ctx.fillStyle = '#8fd44a';
  ctx.beginPath(); ctx.ellipse(-12, -8, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(12, -8, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2c4a1e';
  ctx.beginPath(); ctx.arc(-12, -7, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(12, -7, 3.4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#8fd44a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; // 毒液嘴
  ctx.beginPath(); ctx.moveTo(-10, 8); ctx.lineTo(-4, 11); ctx.lineTo(2, 8); ctx.lineTo(8, 11); ctx.stroke();
  ctx.restore();
}
