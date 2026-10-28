'use strict';
// ============================================================
// Canvas 即时模式 UI 辅助：按钮 / 面板 / 图标 / 文字换行
// 每帧渲染时注册点击区域（hits），由 main.js 的 onTap 消费
// ============================================================

let hits = [];
const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';

function font(size, bold) { ctx.font = (bold ? 'bold ' : '') + size + 'px ' + FONT; }
function reg(x, y, w, h, cb) { hits.push({ x, y, w, h, cb }); }
function inRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
// 数字统一格式化：后期数值爆炸用 K/M 缩写（10K / 1.2M），一位小数、整数不带小数点
function fmt(n) {
  if (n >= 1e6) { const v = n / 1e6; return (v % 1 ? v.toFixed(1) : v) + 'M'; }
  if (n >= 1e4) { const v = n / 1e3; if (v >= 999.95) return '1.0M'; return (v % 1 ? v.toFixed(1) : v) + 'K'; }
  return '' + n;
}
// 库存量数字配色（顶栏/仓库通用）：超或等于上限红，≥90% 警告黄，其余常态色
function capNumColor(cur, cap) {
  return cur >= cap ? '#c0392b' : (cur / cap >= 0.9 ? '#e0a53f' : '#4a4438');
}

// roundRect 兜底（老 Safari）
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// ===== 按钮 =====
function uiButton(x, y, w, h, label, cb, o = {}) {
  const dis = !!o.disabled;
  let fill, text;
  switch (o.kind) {
    case 'primary': fill = '#3f9142'; text = '#fff'; break;
    case 'danger':  fill = '#c0564b'; text = '#fff'; break;
    case 'ghost':   fill = '#e7e2d3'; text = '#5a5344'; break;
    case 'dark':    fill = 'rgba(255,255,255,.14)'; text = '#d8e2d4'; break;
    default:        fill = '#f3efe2'; text = '#3c5a3f';
  }
  if (dis) {
    fill = o.kind === 'primary' ? '#a9bfa6' : (o.kind === 'danger' ? '#d8b0aa' : '#e6e1d2');
    text = '#9a948a';
  }
  ctx.fillStyle = fill;
  rr(x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  font(o.size || 18, true);
  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  if (!dis && cb) reg(x, y, w, h, cb, o.tag);
}

// 引导动效：0.9s 一跳（平滑起跳-回落）+ 轻微放大 + 任务同款红色感叹号角标。
// 底部页签与面板内引导按钮共用；drawFn 照常绘制按钮并注册点击。
function guideFx(x, y, w, h, active, drawFn) {
  if (!active) { drawFn(); return; }
  const hop = Math.sin(((performance.now() / 900) % 1) * Math.PI);
  const sc = 1 + hop * 0.07, cx = x + w / 2, cy = y + h / 2 - hop * 8;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);
  ctx.translate(-cx, -(y + h / 2));
  drawFn();
  ctx.fillStyle = '#e14b4b';
  ctx.beginPath(); ctx.arc(x + w - 11, y + 10, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; font(12, true);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', x + w - 11, y + 11);
  ctx.restore();
}

// ===== 面板框架（返回内容区） =====
const PANEL = { x: 26, y: 54, w: 428, h: 692 };
const PANEL_CLIP_H = PANEL.h - 64 - 14;
const PANEL_SCROLLS = {};      // key -> 滚动偏移
const PANEL_SCROLL_META = {};  // key -> { top, bottom, contentH }

// 命中注册：把绘制时的坐标（可能处于滚动平移中）换算回屏幕坐标
// 带可视范围限定的命中注册：命中区滚出可视区间（top..bottom）就不注册，
// 避免“看不见但点得到”的隐形按钮（配合 drawPanelBase/弹窗的滚动裁剪使用）
function regVis(x, y, w, h, cb, top, bottom) {
  const m = ctx.getTransform();
  const sy = (m.d * y + m.f) / viewScale;
  if (sy + h < top || sy > bottom) return;
  reg(x, y, w, h, cb);
}
function reg(x, y, w, h, cb, tag) {
  const m = ctx.getTransform();
  const sx = (m.a * x + m.e) / viewScale;
  const sy = (m.d * y + m.f) / viewScale;
  hits.push({ x: sx, y: sy, w, h, cb, tag });
}

// 滚动命中：某屏幕坐标是否落在可滚动面板的内容区
function panelScrollAt(x, y) {
  for (const k in PANEL_SCROLL_META) {
    const m = PANEL_SCROLL_META[k];
    if (x >= PANEL.x && x <= PANEL.x + PANEL.w && y >= m.top && y <= m.bottom && m.max > 0) return k;
  }
  return null;
}
// 只滚动指定滚动区：拖动作用于当前命中的那一层，不再同时滚所有面板
function scrollPanelBy(key, dy) {
  const m = PANEL_SCROLL_META[key];
  if (!m || m.max <= 0) return;
  PANEL_SCROLLS[key] = Math.max(0, Math.min(m.max, (PANEL_SCROLLS[key] || 0) + dy));
}

// 面板函数内容画完后调用：报备内容底部 y（内容坐标），画滚动条
function endPanelScroll(key, contentBottom) {
  const m = PANEL_SCROLL_META[key];
  if (!m) return;
  m.contentH = Math.max(0, contentBottom);
  m.max = Math.max(0, contentBottom - PANEL_CLIP_H);
  const sc = PANEL_SCROLLS[key] || 0;
  if (sc > m.max) PANEL_SCROLLS[key] = m.max;
  if (m.max > 0) {
    const trackTop = m.top, trackH = PANEL_CLIP_H;
    const barH = Math.max(40, trackH * trackH / contentBottom);
    const barY = trackTop + (trackH - barH) * (sc / m.max);
    ctx.fillStyle = 'rgba(90,83,68,.22)';
    rr(PANEL.x + PANEL.w - 14, trackTop, 6, trackH, 3); ctx.fill();
    ctx.fillStyle = 'rgba(90,83,68,.5)';
    rr(PANEL.x + PANEL.w - 14, barY, 6, barH, 3); ctx.fill();
  }
}

function drawPanelBase(title, scrollKey) {
  ctx.fillStyle = 'rgba(10,20,16,.45)';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.fillStyle = '#fbf7ec';
  rr(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 18);
  ctx.fill();
  ctx.strokeStyle = '#d8cfb8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#5a5344';
  font(21, true);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, PANEL.x + 22, PANEL.y + 34);
  const cx = PANEL.x + PANEL.w - 48, cy = PANEL.y + 16;
  ctx.fillStyle = '#eee7d4';
  rr(cx, cy, 32, 32, 10);
  ctx.fill();
  ctx.fillStyle = '#8a8171';
  font(17, true);
  ctx.textAlign = 'center';
  ctx.fillText('✕', cx + 16, cy + 17);
  reg(cx, cy, 32, 32, closePanel);
  if (scrollKey) {
    PANEL_SCROLL_META[scrollKey] = { top: PANEL.y + 64, bottom: PANEL.y + PANEL.h - 14, max: 0, contentH: 0 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(PANEL.x + 2, PANEL.y + 60, PANEL.w - 4, PANEL_CLIP_H + 6);
    ctx.clip();
    ctx.translate(0, -(PANEL_SCROLLS[scrollKey] || 0));
  }
  return { x: PANEL.x + 22, y: PANEL.y + 64, w: PANEL.w - 44, h: PANEL.h - 84, key: scrollKey || null };
}

// 与 drawPanelBase(scrollKey) 配对：报备内容底部（内容坐标），恢复裁剪并绘制滚动条
function endPanel(key, contentBottom) {
  if (!key) return;
  ctx.restore();
  endPanelScroll(key, contentBottom);
}

// ===== 文字换行：英文按单词断行，超长词（中文长句）按字符硬拆 =====
function wrapText(text, maxW) {
  const lines = [];
  let line = '';
  const tokens = String(text).match(/\s+|[^\s]+/g) || [];
  for (let tk of tokens) {
    if (/^\s+$/.test(tk)) { line += tk; continue; }
    if (line && ctx.measureText(line + tk).width > maxW) {
      lines.push(line.trimEnd());
      line = '';
    }
    while (ctx.measureText(tk).width > maxW) {
      let cur = '';
      const chars = [...tk];
      let i = 0;
      while (i < chars.length && ctx.measureText(cur + chars[i]).width <= maxW) {
        cur += chars[i];
        i++;
      }
      if (!cur) { cur = chars[0]; i = 1; }
      lines.push(cur);
      tk = chars.slice(i).join('');
    }
    line += tk;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}
// 支持用 \n 分段；返回绘制高度
function drawWrapped(text, x, y, maxW, lh, color, size, bold) {
  font(size, bold);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let cy = y;
  for (const para of String(text).split('\n')) {
    for (const l of wrapText(para, maxW)) {
      ctx.fillText(l, x, cy);
      cy += lh;
    }
  }
  return cy - y;
}

// ===== 进度条 =====
function drawBar(x, y, w, h, ratio, fillColor, backColor) {
  ctx.fillStyle = backColor;
  rr(x, y, w, h, h / 2); ctx.fill();
  if (ratio > 0) {
    ctx.fillStyle = fillColor;
    rr(x, y, Math.max(h, w * Math.min(1, ratio)), h, h / 2); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1;
  rr(x, y, w, h, h / 2); ctx.stroke();
}

// ===== 物品图标（纯代码绘制，24 为基准尺寸，居中于 cx,cy） =====
function drawIcon(id, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  const u = s / 24;
  ctx.scale(u, u);
  ctx.lineCap = 'round';
  switch (id) {
    case 'berry':
      ctx.strokeStyle = '#5b3a1e'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(1, -11); ctx.stroke();
      ctx.save(); ctx.translate(4, -9); ctx.rotate(-0.5);
      ctx.fillStyle = '#4f9e3f';
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#d84343';
      ctx.beginPath(); ctx.arc(0, 2, 8.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.arc(-3, -1, 2.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'leaf':
      ctx.save(); ctx.rotate(-0.55);
      ctx.fillStyle = '#4f9e3f';
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2f6b2f'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
      ctx.restore();
      break;
    case 'ore':
      ctx.fillStyle = '#93979e';
      ctx.beginPath();
      ctx.moveTo(-11, 8); ctx.lineTo(-9, -5); ctx.lineTo(-2, -10);
      ctx.lineTo(7, -8); ctx.lineTo(11, 1); ctx.lineTo(6, 9);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#cd8b45';
      ctx.beginPath(); ctx.arc(-3, -1, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2, -5, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'ingot':
      ctx.fillStyle = '#c9ced6';
      ctx.beginPath();
      ctx.moveTo(-10, 6); ctx.lineTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(10, 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8f97a3'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.moveTo(-5, -3.5); ctx.lineTo(4, -3.5); ctx.stroke();
      break;
    case 'wood':
      ctx.fillStyle = '#8a5a2b';
      rr(-11, -6, 22, 12, 5); ctx.fill();
      ctx.fillStyle = '#c98d55';
      ctx.beginPath(); ctx.ellipse(8, 0, 3.6, 5.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(8, 0, 1.6, 2.6, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'herb':
      // 药草（绿叶小束）
      ctx.strokeStyle = '#3f7d35'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, -2); ctx.stroke();
      ctx.fillStyle = '#5cb054';
      ctx.beginPath(); ctx.ellipse(-5, -4, 6, 3, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5, -4, 6, 3, 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -8, 3, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7ec46b';
      ctx.beginPath(); ctx.ellipse(0, -8, 1.4, 3.4, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'stone':
      ctx.fillStyle = '#9aa0a8';
      ctx.beginPath();
      ctx.moveTo(-11, 7); ctx.lineTo(-9, -6); ctx.lineTo(0, -11);
      ctx.lineTo(9, -6); ctx.lineTo(11, 4); ctx.lineTo(4, 10);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#b8bec6';
      ctx.beginPath();
      ctx.moveTo(-9, -6); ctx.lineTo(0, -11); ctx.lineTo(5, -7);
      ctx.lineTo(-3, -3);
      ctx.closePath(); ctx.fill();
      break;
    case 'raw_rabbit':
      // 带骨兔腿（生，偏粉白）
      ctx.save(); ctx.rotate(-0.5);
      ctx.fillStyle = '#f0cfd0';
      ctx.beginPath(); ctx.ellipse(-2, 2, 9.5, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d8a8aa'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(9, -8); ctx.stroke();
      ctx.fillStyle = '#f6efe2';
      ctx.beginPath(); ctx.arc(10, -9, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12.5, -6.5, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(-4, 0, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    case 'cooked_rabbit':
      // 烤兔腿（焦香）
      ctx.save(); ctx.rotate(-0.5);
      ctx.fillStyle = '#b4713a';
      ctx.beginPath(); ctx.ellipse(-2, 2, 9.5, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a4f1e'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(9, -8); ctx.stroke();
      ctx.fillStyle = '#f6efe2';
      ctx.beginPath(); ctx.arc(10, -9, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12.5, -6.5, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a4f1e'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(-3, 3, 3.4, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      break;
    case 'raw_pork':
      // 带骨腿肉（生）
      ctx.save(); ctx.rotate(-0.5);
      ctx.fillStyle = '#e8968f';
      ctx.beginPath(); ctx.ellipse(-2, 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c96f68'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(9, -8); ctx.stroke();
      ctx.fillStyle = '#f6efe2';
      ctx.beginPath(); ctx.arc(10, -9, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12.5, -6.5, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath(); ctx.arc(-4, 0, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    case 'cooked_pork':
      // 烤得焦香的腿肉（熟）
      ctx.save(); ctx.rotate(-0.5);
      ctx.fillStyle = '#a5652f';
      ctx.beginPath(); ctx.ellipse(-2, 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7c4517'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(9, -8); ctx.stroke();
      ctx.fillStyle = '#f6efe2';
      ctx.beginPath(); ctx.arc(10, -9, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12.5, -6.5, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7c4517'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(-3, 3, 3.4, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      break;
    case 'leather':
      // 皮革片（卷角）
      ctx.fillStyle = '#a5652f';
      rr(-10, -9, 20, 18, 4); ctx.fill();
      ctx.strokeStyle = '#7c4517'; ctx.lineWidth = 1.4;
      rr(-10, -9, 20, 18, 4); ctx.stroke();
      ctx.strokeStyle = '#7c4517'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6, -3); ctx.lineTo(6, -3);
      ctx.moveTo(-6, 1); ctx.lineTo(6, 1);
      ctx.stroke();
      ctx.fillStyle = '#c98d55';
      ctx.beginPath(); ctx.arc(0, 7, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'goat_horn':
      // 山羊角（弯角）
      ctx.strokeStyle = '#d8cfb8';
      ctx.lineWidth = 5.5; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-9, 9);
      ctx.quadraticCurveTo(-12, -6, 0, -10);
      ctx.quadraticCurveTo(9, -12, 10, -5);
      ctx.stroke();
      ctx.strokeStyle = '#b3a888'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-8, 6); ctx.quadraticCurveTo(-9, -3, 1, -7);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-4, 2); ctx.quadraticCurveTo(-3, -4, 5, -7);
      ctx.stroke();
      break;
    case 'wood_pick':
      drawPickIcon('wood');
      break;
    case 'stone_pick':
      drawPickIcon('stone');
      break;
    case 'horn_pick':
      drawPickIcon('horn');
      break;
    case 'wood_axe':
    case 'stone_axe':
      drawAxeIcon(id === 'stone_axe');
      break;
    case 'wood_sword':
    case 'stone_sword':
      drawSwordIcon(id === 'stone_sword');
      break;
    case 'leather_armor':
      // 皮革背心
      ctx.fillStyle = '#a5652f';
      rr(-10, -11, 20, 22, 5); ctx.fill();
      ctx.fillStyle = '#8a5326';
      rr(-10, -11, 7, 10, 3); ctx.fill();
      rr(3, -11, 7, 10, 3); ctx.fill();
      ctx.strokeStyle = '#7c4517'; ctx.lineWidth = 1.4;
      rr(-10, -11, 20, 22, 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(10, -2); ctx.stroke();
      ctx.fillStyle = '#c98d55';
      ctx.beginPath(); ctx.arc(0, 4, 2.2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'iron_rod':
      // 铁棒：斜放的金属圆棒
      ctx.save(); ctx.rotate(-0.6);
      ctx.fillStyle = '#b6bcc6';
      rr(-11, -3.5, 22, 7, 3.5); ctx.fill();
      ctx.strokeStyle = '#828a96'; ctx.lineWidth = 1.2;
      rr(-11, -3.5, 22, 7, 3.5); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.beginPath(); ctx.moveTo(-8, -1.5); ctx.lineTo(8, -1.5); ctx.stroke();
      ctx.restore();
      break;
    case 'iron_plate':
      // 铁板：平板 + 四颗铆钉
      ctx.fillStyle = '#b6bcc6';
      rr(-11, -7, 22, 14, 3); ctx.fill();
      ctx.strokeStyle = '#828a96'; ctx.lineWidth = 1.2;
      rr(-11, -7, 22, 14, 3); ctx.stroke();
      ctx.fillStyle = '#828a96';
      for (const [px, py] of [[-7, -3], [7, -3], [-7, 3], [7, 3]]) {
        ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'hand_crank':
      // 手摇摇杆：轴心 + 曲柄 + 木柄
      ctx.fillStyle = '#828a96';
      ctx.beginPath(); ctx.arc(0, 2, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b6bcc6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(6, -4); ctx.lineTo(12, -4); ctx.stroke();
      ctx.fillStyle = '#8a5a2b';
      rr(10, -8, 5, 8, 2.5); ctx.fill();
      break;
    case 'water_wheel':
      // 水车：轮辐 + 叶板
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 2;
      for (let a = 0; a < 4; a++) {
        const ang = a * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ang) * 9.5, Math.sin(ang) * 9.5); ctx.stroke();
        ctx.fillStyle = '#a06a34';
        ctx.save();
        ctx.translate(Math.cos(ang) * 11, Math.sin(ang) * 11);
        ctx.rotate(ang);
        rr(-1.8, -3.2, 3.6, 6.4, 1.4); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#6f81a0';
      ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'harvester':
      // 采集站：料斗 + 钻头 + 出料口
      ctx.fillStyle = '#9aa5b1';
      ctx.beginPath();
      ctx.moveTo(-10, -9); ctx.lineTo(10, -9); ctx.lineTo(6, 1); ctx.lineTo(-6, 1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7c8794';
      rr(-4, 1, 8, 4, 1.5); ctx.fill();
      ctx.fillStyle = '#e0a53f';
      ctx.beginPath();
      ctx.moveTo(-4, 5); ctx.lineTo(4, 5); ctx.lineTo(0, 11);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5cb054';
      ctx.beginPath(); ctx.arc(-9, 7, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'smelter':
      // 冶炼站：石炉 + 炉口火光
      ctx.fillStyle = '#8d939c';
      rr(-10, -9, 20, 18, 3); ctx.fill();
      ctx.fillStyle = '#6f757e';
      rr(-12, 5, 24, 4, 2); ctx.fill();
      ctx.fillStyle = '#3c3c30';
      rr(-6, -1, 12, 7, 2); ctx.fill();
      ctx.fillStyle = '#e08a3c';
      ctx.beginPath();
      ctx.moveTo(-4, 5); ctx.quadraticCurveTo(-2, -1, 0, 2.5);
      ctx.quadraticCurveTo(2, -1, 4, 5);
      ctx.closePath(); ctx.fill();
      break;
    case 'manufacturer':
      // 制造站：机箱 + 单齿轮
      ctx.fillStyle = '#9aa5b1';
      rr(-10, -7, 20, 14, 3); ctx.fill();
      ctx.strokeStyle = '#7c8794'; ctx.lineWidth = 1.2;
      rr(-10, -7, 20, 14, 3); ctx.stroke();
      ctx.strokeStyle = '#e8eef4'; ctx.lineWidth = 2;
      for (let a = 0; a < 8; a++) {
        const ang = a * Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * 4.5, Math.sin(ang) * 4.5);
        ctx.lineTo(Math.cos(ang) * 7, Math.sin(ang) * 7); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e0a53f';
      ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
      break;
    case 'assembler':
      // 合成站：双料仓汇入主机
      ctx.fillStyle = '#9aa5b1';
      rr(-12, -8, 8, 8, 2); ctx.fill();
      rr(-12, 1, 8, 8, 2); ctx.fill();
      ctx.strokeStyle = '#7c8794'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(1, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-4, 5); ctx.lineTo(1, 1); ctx.stroke();
      ctx.fillStyle = '#8494a5';
      rr(1, -6, 11, 13, 3); ctx.fill();
      ctx.fillStyle = '#5cb054';
      ctx.beginPath(); ctx.arc(6.5, 0.5, 3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'iron_armor':
      // 铁甲：金属胸甲
      ctx.fillStyle = '#b6bcc6';
      rr(-10, -11, 20, 22, 5); ctx.fill();
      ctx.fillStyle = '#828a96';
      rr(-10, -11, 7, 10, 3); ctx.fill();
      rr(3, -11, 7, 10, 3); ctx.fill();
      ctx.strokeStyle = '#6f757d'; ctx.lineWidth = 1.4;
      rr(-10, -11, 20, 22, 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(10, -2); ctx.stroke();
      ctx.fillStyle = '#e8eef4';
      ctx.beginPath(); ctx.arc(0, 4, 2.2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'iron_sword':
      // 铁剑：钢青色剑身
      ctx.fillStyle = '#b6bcc6';
      ctx.beginPath();
      ctx.moveTo(-2, -12); ctx.lineTo(2, -12); ctx.lineTo(2, 4); ctx.lineTo(0, 7); ctx.lineTo(-2, 4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#828a96'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#8a5a2b';
      rr(-6, 4, 12, 3, 1.5); ctx.fill();
      ctx.fillStyle = '#6b4a2a';
      rr(-1.5, 7, 3, 5, 1.5); ctx.fill();
      break;
    case 'iron_pick':
      drawPickIcon('iron');
      break;
    case 'iron_axe':
      // 铁斧：钢青斧刃
      ctx.save(); ctx.rotate(0.5);
      ctx.fillStyle = '#8a5a2b';
      rr(-2, -10, 4, 22, 2); ctx.fill();
      ctx.fillStyle = '#b6bcc6';
      ctx.beginPath();
      ctx.moveTo(-2, -11);
      ctx.quadraticCurveTo(10, -10, 8, 0);
      ctx.lineTo(-2, -2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#828a96'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      break;
    case 'water':
      // 水：蓝色水滴
      ctx.fillStyle = '#5aa7d0';
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.quadraticCurveTo(8, -2, 8, 4);
      ctx.arc(0, 4, 8, 0, Math.PI);
      ctx.quadraticCurveTo(-8, -2, 0, -11);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(-3, 4, 2.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'bush':
      // 采集点：浆果丛（绿丛 + 红果）
      ctx.fillStyle = '#4f9e3f';
      ctx.beginPath(); ctx.ellipse(-3, 2, 8, 6.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, 3, 7, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -3, 6.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d84343';
      for (const [px, py] of [[-4, 1], [3, 4], [1, -3], [6, 0]]) {
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'tree':
      // 采集点：大树（树冠 + 树干）
      ctx.fillStyle = '#8a5a2b';
      rr(-2, 2, 4, 10, 1.5); ctx.fill();
      ctx.fillStyle = '#4f9e3f';
      ctx.beginPath(); ctx.arc(0, -4, 8.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6db95c';
      ctx.beginPath(); ctx.arc(-3, -6, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d84343';
      ctx.beginPath(); ctx.arc(3, -3, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'iron':
      // 采集点：铁矿脉（灰岩 + 棕色铁斑）
      ctx.fillStyle = '#93979e';
      ctx.beginPath();
      ctx.moveTo(-11, 8); ctx.lineTo(-9, -5); ctx.lineTo(-2, -10);
      ctx.lineTo(7, -8); ctx.lineTo(11, 1); ctx.lineTo(6, 9);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7d838c';
      ctx.beginPath(); ctx.arc(-3, -1, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2, -5, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'coal':
      // 采集点：煤矿（灰岩 + 黑色煤斑）
      ctx.fillStyle = '#93979e';
      ctx.beginPath();
      ctx.moveTo(-11, 8); ctx.lineTo(-9, -5); ctx.lineTo(-2, -10);
      ctx.lineTo(7, -8); ctx.lineTo(11, 1); ctx.lineTo(6, 9);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2c2c30';
      ctx.beginPath(); ctx.arc(-3, -1, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2, -5, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'copper':
      // 采集点：铜矿脉（灰岩 + 铜斑）
      ctx.fillStyle = '#93979e';
      ctx.beginPath();
      ctx.moveTo(-11, 8); ctx.lineTo(-9, -5); ctx.lineTo(-2, -10);
      ctx.lineTo(7, -8); ctx.lineTo(11, 1); ctx.lineTo(6, 9);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d08a5e';
      ctx.beginPath(); ctx.arc(-3, -1, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2, -5, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'space_elevator':
      // 太空电梯：发射底座 + 塔身 + 缆线 + 轿厢
      ctx.fillStyle = '#8d939c';
      rr(-9, 7, 18, 5, 2); ctx.fill();
      ctx.fillStyle = '#b6bcc6';
      rr(-2.5, -9, 5, 17, 2); ctx.fill();
      ctx.strokeStyle = '#828a96'; ctx.lineWidth = 1;
      rr(-2.5, -9, 5, 17, 2); ctx.stroke();
      ctx.strokeStyle = '#d08a5e'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, -13); ctx.stroke();
      ctx.fillStyle = '#5aa7d0';
      rr(-1.5, -4, 3, 4, 1); ctx.fill();
      ctx.fillStyle = '#ffd479';
      ctx.beginPath(); ctx.arc(0, -12.5, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'map_plains':
      // 初始台地：层状台地
      ctx.fillStyle = '#7fb069';
      rr(-10, -2, 20, 9, 3); ctx.fill();
      ctx.fillStyle = '#5c9152';
      rr(-6, -7, 12, 6, 2); ctx.fill();
      ctx.fillStyle = '#8a5a2b';
      rr(-10, 6, 20, 3, 1.5); ctx.fill();
      break;
    case 'warehouse':
      // 仓库：木箱
      ctx.fillStyle = '#c98d55';
      rr(-10, -8, 20, 16, 2); ctx.fill();
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 1.4;
      rr(-10, -8, 20, 16, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(10, -2); ctx.stroke();
      ctx.fillStyle = '#8a5a2b';
      rr(-2.5, -4, 5, 4, 1); ctx.fill();
      break;
    case 'copper_ore':
      // 铜矿：灰岩 + 铜色斑点
      ctx.fillStyle = '#93979e';
      ctx.beginPath();
      ctx.moveTo(-11, 8); ctx.lineTo(-9, -5); ctx.lineTo(-2, -10);
      ctx.lineTo(7, -8); ctx.lineTo(11, 1); ctx.lineTo(6, 9);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d08a5e';
      ctx.beginPath(); ctx.arc(-3, -1, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2, -5, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'copper_ingot':
      // 铜锭：橙铜色锭块
      ctx.fillStyle = '#d08a5e';
      ctx.beginPath();
      ctx.moveTo(-10, 6); ctx.lineTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(10, 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a05f3a'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,235,210,.75)';
      ctx.beginPath(); ctx.moveTo(-5, -3.5); ctx.lineTo(4, -3.5); ctx.stroke();
      break;
    case 'copper_plate':
      // 铜板：铜色平板 + 铆钉
      ctx.fillStyle = '#d08a5e';
      rr(-11, -7, 22, 14, 3); ctx.fill();
      ctx.strokeStyle = '#a05f3a'; ctx.lineWidth = 1.2;
      rr(-11, -7, 22, 14, 3); ctx.stroke();
      ctx.fillStyle = '#a05f3a';
      for (const [px, py] of [[-7, -3], [7, -3], [-7, 3], [7, 3]]) {
        ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'wire':
      // 电线：铜色线圈
      ctx.strokeStyle = '#d08a5e'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#a05f3a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#d08a5e';
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(12, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-12, 0); ctx.stroke();
      break;
    case 'cable':
      // 电缆：深色粗缆 + 铜芯截面
      ctx.save(); ctx.rotate(-0.6);
      ctx.fillStyle = '#4a4438';
      rr(-11, -4.5, 22, 9, 4.5); ctx.fill();
      ctx.strokeStyle = '#2c2620'; ctx.lineWidth = 1;
      rr(-11, -4.5, 22, 9, 4.5); ctx.stroke();
      ctx.fillStyle = '#d08a5e';
      ctx.beginPath(); ctx.arc(9, 0, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2d3b3';
      ctx.beginPath(); ctx.arc(9, 0, 1.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    case 'gear':
      // 齿轮：外齿 + 中孔
      ctx.fillStyle = '#9aa0a8';
      for (let a = 0; a < 8; a++) {
        const ang = a * Math.PI / 4;
        ctx.save();
        ctx.translate(Math.cos(ang) * 8, Math.sin(ang) * 8);
        ctx.rotate(ang);
        rr(-2, -2.4, 4.4, 4.8, 1.2); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6f757d'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e8e4d8';
      ctx.beginPath(); ctx.arc(0, 0, 2.8, 0, Math.PI * 2); ctx.fill();
      break;
  }
  ctx.restore();
}

// ===== 耗材芯片：图标 + 名字 + ×需求；名字按稀有度着色，不足变红；放不下自动换行 =====
// 预估占用行数（画卡片前先量高度用）
function costChipRows(cost, maxW) {
  let rows = 1, cx = 0;
  font(11, true);
  for (const k in cost) {
    const w = 20 + ctx.measureText(t('item.' + k + '.name')).width + 30;
    if (cx + w > maxW && cx > 0) { rows++; cx = 0; }
    cx += w + 6;
  }
  return rows;
}
// 绘制耗材芯片，返回占用高度（每行 20 + 行距 4）
function drawCostChips(x, y, maxW, cost) {
  font(11, true);
  let cx = x, cy = y;
  const rowH = 20;
  for (const k in cost) {
    const have = state.inv[k] || 0;
    const need = cost[k];
    const label = t('item.' + k + '.name');
    const nameW = ctx.measureText(label).width;
    const w = 20 + nameW + 30;
    if (cx + w > x + maxW && cx > x) { cx = x; cy += rowH + 4; }
    ctx.fillStyle = 'rgba(0,0,0,.05)';
    rr(cx, cy, w, rowH, 4); ctx.fill();
    drawIcon(k, cx + 10, cy + rowH / 2, 14);
    font(11, true);
    ctx.fillStyle = rarityColor(k);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + 20, cy + rowH / 2);
    ctx.fillStyle = have >= need ? '#8a8171' : '#c0392b';
    ctx.fillText('×' + need, cx + 24 + nameW, cy + rowH / 2);
    cx += w + 6;
  }
  return cy + rowH - y;
}

// 物品图标 + 右上角数量角标（背景块 + 数字，表示当前持有量）
function drawIconCounted(id, cx, cy, s, count) {
  drawIcon(id, cx, cy, s);
  if (count === undefined || count <= 0) return; // 数量 0 不显示角标
  const text = count > 999 ? '999+' : '' + count;
  font(11, true);
  const w = ctx.measureText(text).width + 10;
  const bx = cx + s * 0.38, by = cy - s * 0.38;
  ctx.fillStyle = 'rgba(40,44,40,.92)';
  rr(bx - w / 2, by - 8, w, 16, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1;
  rr(bx - w / 2, by - 8, w, 16, 8); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, bx, by + 1);
}

// 通用物品卡：图标(数量角标) + 标题 + 副标题行（颜色随行）。
// 装备面板的槽位和战斗页的快捷条共用这一套，改一处两边同步。
// subs: [{ t: 文本, c: 颜色, b: 是否加粗 }]，从标题下方依次往下排
function drawItemCard(x, y, w, h, icon, count, title, subs, bg, stroke) {
  ctx.fillStyle = bg || '#fff';
  rr(x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = stroke || '#e2dac4'; ctx.lineWidth = 1;
  rr(x, y, w, h, 10); ctx.stroke();
  drawIconCounted(icon, x + 26, y + h / 2, 36, count);
  font(12, true); ctx.fillStyle = '#3c3c30';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(title, x + 52, y + 17);
  let sy = y + 33;
  for (const s of subs) {
    font(10, !!s.b); ctx.fillStyle = s.c;
    ctx.fillText(s.t, x + 52, sy);
    sy += 13;
  }
}

// 斧：木/石刃共用
function drawAxeIcon(stone) {
  ctx.save(); ctx.rotate(0.5);
  ctx.fillStyle = '#8a5a2b';
  rr(-2, -10, 4, 22, 2); ctx.fill();
  ctx.fillStyle = stone ? '#9aa0a8' : '#c98d55';
  ctx.beginPath();
  ctx.moveTo(-2, -11);
  ctx.quadraticCurveTo(10, -10, 8, 0);
  ctx.lineTo(-2, -2);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = stone ? '#6f757d' : '#a5713d'; ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

// 剑：木/石刃共用
function drawSwordIcon(stone) {
  ctx.fillStyle = stone ? '#9aa0a8' : '#c98d55';
  ctx.beginPath();
  ctx.moveTo(-2, -12); ctx.lineTo(2, -12); ctx.lineTo(2, 4); ctx.lineTo(0, 7); ctx.lineTo(-2, 4);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = stone ? '#6f757d' : '#a5713d'; ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#8a5a2b';
  rr(-6, 4, 12, 3, 1.5); ctx.fill();
  ctx.fillStyle = '#6b4a2a';
  rr(-1.5, 7, 3, 5, 1.5); ctx.fill();
}

// 镐：镐头颜色随材质（角镐为羊角色）
function drawPickIcon(head) {
  ctx.fillStyle = '#8a5a2b';
  rr(-1.5, -6, 3, 19, 1.5); ctx.fill();
  const colors = { wood: ['#a5713d', '#7d5426'], stone: ['#9aa0a8', '#6f757d'], horn: ['#d8cfb8', '#b3a888'], iron: ['#b6bcc6', '#828a96'] };
  const [fill, stroke] = colors[head] || colors.stone;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-11, -7);
  ctx.quadraticCurveTo(0, -14, 11, -7);
  ctx.lineTo(9, -3);
  ctx.quadraticCurveTo(0, -9, -9, -3);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = stroke; ctx.lineWidth = 1;
  ctx.stroke();
}
