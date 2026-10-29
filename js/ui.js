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
const PANEL_SCROLL_META = {};  // key -> { top, bottom, contentH, frame }
let uiFrameNo = 0;             // UI 帧号：滚动区每帧重注册，命中只认「本帧注册过」的区域（关掉的面板不留幽灵滚动区拦截拖动）
let PANEL_CLOSE = null;        // 面板 ✕ 关闭区：延迟到 endPanel（内容画完）再注册——后注册者优先，点 ✕ 永远不被滚动列表抢走
function beginUiFrame() { uiFrameNo++; }

// 命中注册：把绘制时的坐标（可能处于滚动平移中）换算回屏幕坐标
// 带可视范围限定的命中注册：命中区滚出可视区间（top..bottom）就不注册，
// 避免“看不见但点得到”的隐形按钮（配合 drawPanelBase/弹窗的滚动裁剪使用）
function regVis(x, y, w, h, cb, top, bottom) {
  const m = ctx.getTransform();
  const sx = (m.a * x + m.e) / viewScale;
  const sy = (m.d * y + m.f) / viewScale;
  if (sy + h < top || sy > bottom) return;
  // 命中区与可视区间求交：滚出可视区的部分不参与命中（滚上去的行残影不再盖住 ✕）
  const vy = Math.max(sy, top);
  const vh = Math.min(sy + h, bottom) - vy;
  if (vh <= 0) return;
  hits.push({ x: sx, y: vy, w, h: vh, cb });
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
    if (m.frame === uiFrameNo && x >= PANEL.x && x <= PANEL.x + PANEL.w && y >= m.top && y <= m.bottom && m.max > 0) return k;
  }
  return null;
}
// 滚动条滑块命中：按住滑块直接拖动（比例映射内容），区别于内容区的滑动滚动
function scrollThumbAt(x, y) {
  for (const k in PANEL_SCROLL_META) {
    const m = PANEL_SCROLL_META[k];
    if (m.frame === uiFrameNo && m.max > 0 && x >= PANEL.x + PANEL.w - 18 && x <= PANEL.x + PANEL.w - 2 && y >= m.barY && y <= m.barY + m.barH) return k;
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
    // 滑块几何存入 meta：pointerdown 用 scrollThumbAt 判定、pointermove 按比例映射滚动
    m.trackTop = trackTop; m.trackH = trackH; m.barH = barH; m.barY = barY;
    ctx.fillStyle = 'rgba(90,83,68,.22)';
    rr(PANEL.x + PANEL.w - 14, trackTop, 6, trackH, 3); ctx.fill();
    ctx.fillStyle = 'rgba(90,83,68,.5)';
    rr(PANEL.x + PANEL.w - 14, barY, 6, barH, 3); ctx.fill();
    // 轨道空白区点击翻页（在滑块上/下方向滚一屏）；后注册者优先于内容行，✕ 在 endPanel 里最后注册仍最高优先
    const page = Math.max(80, trackH - 80);
    if (barY - trackTop > 2) reg(PANEL.x + PANEL.w - 18, trackTop, 16, barY - trackTop, () => scrollPanelBy(key, -page));
    if (trackTop + trackH - (barY + barH) > 2) reg(PANEL.x + PANEL.w - 18, barY + barH, 16, trackTop + trackH - barY - barH, () => scrollPanelBy(key, page));
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
  PANEL_CLOSE = { x: cx, y: cy, w: 32, h: 32 };
  if (!scrollKey) reg(cx, cy, 32, 32, closePanel); // 无滚动面板直接注册；滚动面板在 endPanel 内容画完后注册
  if (scrollKey) {
    PANEL_SCROLL_META[scrollKey] = { top: PANEL.y + 64, bottom: PANEL.y + PANEL.h - 14, max: 0, contentH: 0, frame: uiFrameNo };
    ctx.save();
    ctx.beginPath();
    ctx.rect(PANEL.x + 2, PANEL.y + 60, PANEL.w - 4, PANEL_CLIP_H + 6);
    ctx.clip();
    ctx.translate(0, -(PANEL_SCROLLS[scrollKey] || 0));
  }
  return { x: PANEL.x + 22, y: PANEL.y + 64, w: PANEL.w - 44, h: PANEL.h - 84, key: scrollKey || null };
}

// 与 drawPanelBase(scrollKey) 配对：报备内容底部 y（内容坐标），恢复裁剪并画滚动条
function endPanel(key, contentBottom) {
  if (!key) return;
  // 先还原变换再注册 ✕：滚动平移生效时 reg 的坐标会被顶出绘制位置，导致拖动后点 ✕ 无反应
  ctx.restore();
  endPanelScroll(key, contentBottom);
  // ✕ 在内容（含滚动条）之后注册：命中从后往前取，滚动列表的行永远抢不过它（修复滚动后点 ✕ 穿透进列表）
  if (PANEL_CLOSE) {
    const r = PANEL_CLOSE;
    PANEL_CLOSE = null;
    reg(r.x, r.y, r.w, r.h, closePanel);
  }
}

// ===== 文字换行（中文排版规则）=====
// 单元切分：英文/数字连续串为一个单元（不拆词），其余逐字符一个单元
// 断行优先级：① 行内最后一个句读标点后 ② 任意字符边界；行首禁则标点悬挂到上一行行尾
function wrapText(text, maxW) {
  const units = String(text).match(/[A-Za-z0-9][A-Za-z0-9'’\-]*|./g) || [];
  const HEAD_FORBID = /^[，。、；：？！…—%）)\]】」』"”’~～》〉,.:;?!]/; // 这些标点不能出现在行首
  const lines = [];
  let line = '';
  let i = 0;
  while (i < units.length) {
    const u = units[i];
    if (/^\s$/.test(u) && !line) { i++; continue; } // 断行后丢弃行首空白
    // 单元本身超宽（超长英文词/无空格长串）：按字符硬拆
    if (ctx.measureText(u).width > maxW) {
      const rest = [...u];
      while (rest.length && (!line || ctx.measureText(line + rest[0]).width <= maxW)) line += rest.shift();
      if (line) { lines.push(line); line = ''; }
      while (ctx.measureText(rest.join('')).width > maxW) {
        let cur = '';
        while (rest.length && ctx.measureText(cur + rest[0]).width <= maxW) cur += rest.shift();
        if (!cur) cur = rest.shift();
        lines.push(cur);
      }
      line = rest.join('');
      i++;
      continue;
    }
    if (line && ctx.measureText(line + u).width > maxW) {
      // 放不下：优先回退到行内最后一个句读标点后断行（断点更自然，避免「5/点」这类怪断）
      const m = line.match(/^.*[，。、；：？！…—,.:;?!]/);
      if (m && m[0].length < line.length) {
        const cut = m[0].length;
        lines.push(line.slice(0, cut).trimEnd());
        line = line.slice(cut);
        continue; // 不消费当前单元，下一轮以更短的行重试
      }
      // 行首禁则：即将开头的标点悬挂到本行行尾（行允许轻微超宽）
      let j = i;
      while (j < units.length && HEAD_FORBID.test(units[j])) { line += units[j]; j++; }
      lines.push(line);
      line = '';
      i = j;
      continue;
    }
    line += u;
    i++;
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
    case 'raw_mutton':
      // 带骨羊腿（生，偏红）
      ctx.save(); ctx.rotate(-0.5);
      ctx.fillStyle = '#d96d62';
      ctx.beginPath(); ctx.ellipse(-2, 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#b04a42'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(9, -8); ctx.stroke();
      ctx.fillStyle = '#f6efe2';
      ctx.beginPath(); ctx.arc(10, -9, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12.5, -6.5, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.beginPath(); ctx.arc(-4, 0, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      break;
    case 'cooked_mutton':
      // 烤羊腿（深焦香，最壮的肉）
      ctx.save(); ctx.rotate(-0.5);
      ctx.fillStyle = '#96521f';
      ctx.beginPath(); ctx.ellipse(-2, 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6e3a10'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(9, -8); ctx.stroke();
      ctx.fillStyle = '#f6efe2';
      ctx.beginPath(); ctx.arc(10, -9, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(12.5, -6.5, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#6e3a10'; ctx.lineWidth = 1.2;
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
    case 'wool':
      // 羊毛团（蓬松绒球）
      ctx.fillStyle = '#f2eee4';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d4ccb8'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ddd4c0'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-7, -4); ctx.quadraticCurveTo(-3, -7, 1, -4); ctx.quadraticCurveTo(5, -1, 8, 1);
      ctx.moveTo(-8, 1); ctx.quadraticCurveTo(-4, 3, 0, 2); ctx.quadraticCurveTo(4, 1, 7, 4);
      ctx.moveTo(-6, 5); ctx.quadraticCurveTo(-2, 7, 2, 6);
      ctx.stroke();
      break;
    case 'cloth':
      // 布料（叠好的布片，浅色织纹）
      ctx.fillStyle = '#e8e2d2';
      rr(-10, -8, 20, 17, 3); ctx.fill();
      ctx.strokeStyle = '#b8ad92'; ctx.lineWidth = 1.3;
      rr(-10, -8, 20, 17, 3); ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-6, -3); ctx.lineTo(6, -3);
      ctx.moveTo(-6, 1); ctx.lineTo(6, 1);
      ctx.moveTo(-6, 5); ctx.lineTo(6, 5);
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
    case 'wind_turbine':
      // 风力机：塔杆 + 三叶风轮
      ctx.strokeStyle = '#9aa5b1'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.lineTo(0, 12); ctx.stroke();
      ctx.fillStyle = '#f6f3ea';
      for (let a = 0; a < 3; a++) {
        const ang = -Math.PI / 2 + a * Math.PI * 2 / 3;
        ctx.save(); ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(0, -2.5);
        ctx.quadraticCurveTo(5, -7, 3.5, -12.5);
        ctx.quadraticCurveTo(1, -9, 0, -2.5);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#e8e2d2';
      ctx.beginPath(); ctx.arc(0, -1, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7c8794';
      ctx.beginPath(); ctx.arc(0, -1, 1.2, 0, Math.PI * 2); ctx.fill();
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
    case 'stress':
      // 应力/机械负荷：压应力示意（左右箭头挤压中间块，工程制图画法）；闪电留给电力
      ctx.fillStyle = '#e0a53f';
      rr(-3.5, -5.5, 7, 11, 1.5); ctx.fill(); // 受压块
      ctx.beginPath();
      // 左箭头（杆 + 头，指向受压块）
      ctx.moveTo(-12, -1.7); ctx.lineTo(-7.5, -1.7); ctx.lineTo(-7.5, 1.7); ctx.lineTo(-12, 1.7); ctx.closePath();
      ctx.moveTo(-7.5, -4.2); ctx.lineTo(-4.2, 0); ctx.lineTo(-7.5, 4.2); ctx.closePath();
      // 右箭头（镜像）
      ctx.moveTo(12, -1.7); ctx.lineTo(7.5, -1.7); ctx.lineTo(7.5, 1.7); ctx.lineTo(12, 1.7); ctx.closePath();
      ctx.moveTo(7.5, -4.2); ctx.lineTo(4.2, 0); ctx.lineTo(7.5, 4.2); ctx.closePath();
      ctx.fill();
      break;
    case 'map_dark_forest':
      // 黑暗森林：深色针叶树
      ctx.fillStyle = '#54371f';
      rr(-1.5, 6, 3, 5, 1); ctx.fill();
      ctx.fillStyle = '#275231';
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(7, -2); ctx.lineTo(3.5, -2); ctx.lineTo(9, 6);
      ctx.lineTo(-9, 6); ctx.lineTo(-3.5, -2); ctx.lineTo(-7, -2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#356a41';
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(7, -2); ctx.lineTo(3.5, -2); ctx.lineTo(0, -6);
      ctx.closePath(); ctx.fill();
      break;
    case 'map_elder_land':
      // 祖先之地（未开放）：紫雾山影
      ctx.fillStyle = '#6b5b95';
      ctx.beginPath();
      ctx.moveTo(-11, 8); ctx.lineTo(-4, -4); ctx.lineTo(1, 2); ctx.lineTo(5, -7); ctx.lineTo(11, 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(-4, -4, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, -7, 2.2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'coal_kiln':
      // 煤窑：土拱窑 + 窑口火光
      ctx.fillStyle = '#9a8f80';
      ctx.beginPath();
      ctx.moveTo(-11, 10); ctx.lineTo(-11, 0);
      ctx.quadraticCurveTo(-11, -11, 0, -11);
      ctx.quadraticCurveTo(11, -11, 11, 0);
      ctx.lineTo(11, 10);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#756b5d'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-11, 10); ctx.lineTo(-11, 0);
      ctx.quadraticCurveTo(-11, -11, 0, -11);
      ctx.quadraticCurveTo(11, -11, 11, 0);
      ctx.lineTo(11, 10);
      ctx.stroke();
      ctx.fillStyle = '#332e28';
      ctx.beginPath(); ctx.arc(0, 10, 4.8, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e0782a';
      ctx.beginPath(); ctx.arc(0, 10, 3, Math.PI, Math.PI * 2); ctx.fill();
      break;
    case 'steam_engine':
      // 蒸汽机：汽缸机身 + 烟囱 + 蒸汽团 + 飞轮
      ctx.fillStyle = '#9aa5b1';
      rr(-11, -3, 15, 11, 2.5); ctx.fill();
      ctx.strokeStyle = '#7c8794'; ctx.lineWidth = 1.2;
      rr(-11, -3, 15, 11, 2.5); ctx.stroke();
      ctx.fillStyle = '#b6bcc6';
      rr(-8, 0, 6, 4, 1.5); ctx.fill();
      ctx.fillStyle = '#6f757d';
      rr(4, -9, 4, 7, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(6, -11, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(9.5, -14, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#828a96';
      ctx.beginPath(); ctx.arc(-3, 8, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8e4d8';
      ctx.beginPath(); ctx.arc(-3, 8, 1.2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'steel_ingot':
      // 钢锭：亮蓝钢色
      ctx.fillStyle = '#d5dbe4';
      ctx.beginPath();
      ctx.moveTo(-10, 6); ctx.lineTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(10, 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#9aa5b1'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.moveTo(-5, -3.5); ctx.lineTo(4, -3.5); ctx.stroke();
      break;
    case 'steel_sword':
      // 钢剑：亮钢剑身 + 铜护手
      ctx.fillStyle = '#d5dbe4';
      ctx.beginPath();
      ctx.moveTo(-2, -12); ctx.lineTo(2, -12); ctx.lineTo(2, 4); ctx.lineTo(0, 7); ctx.lineTo(-2, 4);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#9aa5b1'; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-0.6, -9); ctx.lineTo(-0.6, 2); ctx.stroke();
      ctx.fillStyle = '#a0652f';
      rr(-6, 4, 12, 3, 1.5); ctx.fill();
      ctx.fillStyle = '#6b4a2a';
      rr(-1.5, 7, 3, 5, 1.5); ctx.fill();
      break;
    case 'steel_armor':
      // 钢甲：亮钢胸甲
      ctx.fillStyle = '#d5dbe4';
      rr(-10, -11, 20, 22, 5); ctx.fill();
      ctx.fillStyle = '#9aa5b1';
      rr(-10, -11, 7, 10, 3); ctx.fill();
      rr(3, -11, 7, 10, 3); ctx.fill();
      ctx.strokeStyle = '#828a96'; ctx.lineWidth = 1.4;
      rr(-10, -11, 20, 22, 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(10, -2); ctx.stroke();
      ctx.fillStyle = '#5a6fd0';
      ctx.beginPath(); ctx.arc(0, 4, 2.2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'blueberry':
      // 蓝莓：蓝紫果（浆果的上位替代，采了就能吃）
      ctx.strokeStyle = '#3d5233'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(1, -11); ctx.stroke();
      ctx.save(); ctx.translate(4, -9); ctx.rotate(-0.5);
      ctx.fillStyle = '#4f7a3f';
      ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#4a5fc0';
      ctx.beginPath(); ctx.arc(0, 2, 8.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#35459c';
      ctx.beginPath(); ctx.arc(0, 2, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.arc(-3, -1, 2.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'bbush':
      // 采集点：蓝莓丛（深绿丛 + 蓝果）
      ctx.fillStyle = '#3d6a3a';
      ctx.beginPath(); ctx.ellipse(-3, 2, 8, 6.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, 3, 7, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, -3, 6.5, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a5fc0';
      for (const [px, py] of [[-4, 1], [3, 4], [1, -3], [6, 0]]) {
        ctx.beginPath(); ctx.arc(px, py, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'mushroom':
      // 蘑菇：红伞白点
      ctx.fillStyle = '#f0e8d8';
      rr(-2.5, -1, 5, 10, 2); ctx.fill();
      ctx.fillStyle = '#c9524a';
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.quadraticCurveTo(-9, -10, 0, -10);
      ctx.quadraticCurveTo(9, -10, 9, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(-4, -4.5, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2.5, -6, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, -3, 1.2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'raw_beef':
      // 生牛肉排：深红 + 油花
      ctx.fillStyle = '#c14a44';
      rr(-10, -6, 20, 13, 5); ctx.fill();
      ctx.strokeStyle = '#96332e'; ctx.lineWidth = 1.2;
      rr(-10, -6, 20, 13, 5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,245,235,.7)';
      ctx.beginPath(); ctx.ellipse(-4, -2, 3, 1.8, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4, 2, 2.4, 1.5, 0.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'cooked_beef':
      // 烤牛排：焦褐 + 烤痕
      ctx.fillStyle = '#8a5230';
      rr(-10, -6, 20, 13, 5); ctx.fill();
      ctx.strokeStyle = '#6b3a1e'; ctx.lineWidth = 1.2;
      rr(-10, -6, 20, 13, 5); ctx.stroke();
      ctx.strokeStyle = '#5c2f16'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-6, -3); ctx.lineTo(0, 3);
      ctx.moveTo(0, -3); ctx.lineTo(6, 3);
      ctx.stroke();
      break;
    case 'mushroom_stew':
      // 蘑菇煲：陶碗炖菇
      ctx.fillStyle = '#c98d55';
      ctx.beginPath();
      ctx.moveTo(-10, -2); ctx.lineTo(10, -2);
      ctx.quadraticCurveTo(9, 9, 0, 9);
      ctx.quadraticCurveTo(-9, 9, -10, -2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#e8b96a';
      ctx.beginPath(); ctx.ellipse(0, -2, 10, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c9524a';
      ctx.beginPath(); ctx.arc(-3.5, -3, 2.4, Math.PI, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, -3, 2, Math.PI, Math.PI * 2); ctx.fill();
      break;
    case 'ancestor_wisdom':
      // 祖先的智慧：灰烬熬成的发光药瓶
      ctx.fillStyle = '#8a5a2b';
      rr(-2.5, -11, 5, 5, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(216, 190, 105, .9)';
      rr(-6, -6, 12, 16, 4); ctx.fill();
      ctx.strokeStyle = '#a8873a'; ctx.lineWidth = 1.2;
      rr(-6, -6, 12, 16, 4); ctx.stroke();
      ctx.fillStyle = '#e8b040';
      rr(-4.5, -1, 9, 9.5, 2.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,190,.9)';
      ctx.beginPath(); ctx.arc(-2, 2, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff3c4';
      ctx.beginPath(); ctx.arc(5, -8, 1.2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'ash':
      // 灰烬：煤窑副产的灰粉堆
      ctx.fillStyle = '#b8b2a6';
      ctx.beginPath();
      ctx.moveTo(-10, 8);
      ctx.quadraticCurveTo(-6, -5, 0, -6);
      ctx.quadraticCurveTo(7, -5, 10, 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8f887c';
      ctx.beginPath(); ctx.arc(-4, 2, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(2, 0, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(5, 4, 1.2, 0, Math.PI * 2); ctx.fill();
      break;
    // ===== 贫瘠沙漠：电力 / 新建筑 / 新物品 / 药水 =====
    case 'power':
      // 电力：蓝色闪电（与应力的琥珀闪电区分）
      ctx.fillStyle = '#4f8fd0';
      ctx.beginPath();
      ctx.moveTo(2, -12); ctx.lineTo(-7, 1); ctx.lineTo(-1, 1); ctx.lineTo(-2, 12); ctx.lineTo(7, -2); ctx.lineTo(1, -2);
      ctx.closePath(); ctx.fill();
      break;
    case 'map_desert':
      // 沙漠：沙丘 + 仙人掌 + 烈日
      ctx.fillStyle = '#e8cf9a';
      ctx.beginPath();
      ctx.moveTo(-12, 10); ctx.quadraticCurveTo(-4, 0, 4, 10);
      ctx.quadraticCurveTo(9, 4, 12, 10);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#4f8a3f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(6, 10); ctx.lineTo(6, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(3, 4); ctx.lineTo(3, 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(6, 6); ctx.lineTo(9, 6); ctx.lineTo(9, 3); ctx.stroke();
      ctx.fillStyle = '#e8a03c';
      ctx.beginPath(); ctx.arc(-6, -6, 3.5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'biomass_generator':
      // 生物质发电机：深灰机组 + 绿叶标志 + 火星烟囱
      ctx.fillStyle = '#4a4a42';
      rr(-10, -5, 20, 13, 3); ctx.fill();
      ctx.fillStyle = '#6b6b60';
      rr(-10, -5, 20, 5, 3); ctx.fill();
      ctx.strokeStyle = '#828a96'; ctx.lineWidth = 1.4;
      rr(-10, -5, 20, 13, 3); ctx.stroke();
      ctx.fillStyle = '#7fb069';
      ctx.beginPath(); ctx.ellipse(0, 2, 5, 3.2, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#3f6b34'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-4, 5); ctx.lineTo(4, -1); ctx.stroke();
      ctx.fillStyle = '#5a5344';
      rr(4, -10, 3, 5, 1); ctx.fill();
      ctx.fillStyle = '#e0a53f';
      ctx.beginPath(); ctx.arc(5.5, -11, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'limestone':
      // 石灰石：灰白沉积岩块 + 层理线
      ctx.fillStyle = '#cfc7b2';
      ctx.beginPath();
      ctx.moveTo(-11, 8); ctx.lineTo(-9, -4); ctx.lineTo(-2, -9); ctx.lineTo(8, -6); ctx.lineTo(11, 4); ctx.lineTo(7, 9);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#a89f8c'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-9, -1); ctx.lineTo(10, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(9, 5); ctx.stroke();
      break;
    case 'concrete':
      // 混凝土：灰浆砌块
      ctx.fillStyle = '#9aa0a8';
      rr(-10, -6, 20, 16, 3); ctx.fill();
      ctx.fillStyle = '#b8bec6';
      rr(-10, -10, 20, 6, 3); ctx.fill();
      ctx.strokeStyle = '#7a8088'; ctx.lineWidth = 1.2;
      rr(-10, -10, 20, 20, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(10, -4); ctx.stroke();
      break;
    case 'biomass':
      // 生物质：压缩发酵的绿色燃料块
      ctx.fillStyle = '#6b8f3f';
      rr(-9, -7, 18, 14, 4); ctx.fill();
      ctx.fillStyle = '#54742f';
      rr(-9, -7, 18, 6, 4); ctx.fill();
      ctx.strokeStyle = '#3f5a24'; ctx.lineWidth = 1.2;
      rr(-9, -7, 18, 14, 4); ctx.stroke();
      ctx.fillStyle = '#a4c47f';
      ctx.beginPath(); ctx.arc(-3, 1, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -2, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, 3, 1.3, 0, Math.PI * 2); ctx.fill();
      break;
    case 'raw_wolf_meat':
      // 生狼肉：带骨深红腿肉（比猪肉暗红）
      ctx.fillStyle = '#e8e2d0';
      rr(4, -10, 3, 8, 1.5); ctx.fill();
      ctx.beginPath(); ctx.arc(4, -10, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(7, -10, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a83c3c';
      ctx.beginPath();
      ctx.moveTo(-10, -4); ctx.quadraticCurveTo(-2, -9, 6, -4); ctx.quadraticCurveTo(10, 2, 4, 9); ctx.quadraticCurveTo(-6, 10, -10, 4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(-4, 0, 2.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'wolf_fang':
      // 狼牙：白弯牙
      ctx.fillStyle = '#f2eee0';
      ctx.beginPath();
      ctx.moveTo(-4, -10); ctx.quadraticCurveTo(6, -6, 3, 8); ctx.quadraticCurveTo(1, 10, -1, 8); ctx.quadraticCurveTo(-3, -2, -6, -8);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c9bfa4'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-4, -10); ctx.quadraticCurveTo(6, -6, 3, 8);
      ctx.stroke();
      break;
    case 'wolf_club':
      // 狼牙棒：粗木棒 + 缠嵌狼牙
      ctx.save(); ctx.rotate(0.5);
      ctx.fillStyle = '#6b4a2a';
      rr(-3, -12, 6, 24, 2.5); ctx.fill();
      ctx.strokeStyle = '#4f361c'; ctx.lineWidth = 1;
      rr(-3, -12, 6, 24, 2.5); ctx.stroke();
      ctx.fillStyle = '#f2eee0';
      ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(-8.5, -6); ctx.lineTo(-3, -3.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(3, -2); ctx.lineTo(8.5, 0); ctx.lineTo(3, 2.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-3, 4); ctx.lineTo(-8.5, 6); ctx.lineTo(-3, 8.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c9bfa4'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(-8.5, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, -2); ctx.lineTo(8.5, 0); ctx.stroke();
      ctx.restore();
      break;
    case 'wolf_armor':
      // 狼甲：灰狼皮胸甲 + 毛点
      ctx.fillStyle = '#8a8171';
      rr(-10, -11, 20, 22, 5); ctx.fill();
      ctx.fillStyle = '#756c5c';
      rr(-10, -11, 7, 10, 3); ctx.fill();
      rr(3, -11, 7, 10, 3); ctx.fill();
      ctx.strokeStyle = '#5c5546'; ctx.lineWidth = 1.4;
      rr(-10, -11, 20, 22, 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(10, -2); ctx.stroke();
      ctx.fillStyle = '#c9bfa4';
      ctx.beginPath(); ctx.arc(-6, -8, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -7, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(6, -8, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 4, 2.2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'slime_gel':
      // 淤泥凝胶：紫黑粘液滴 + 毒绿核心
      ctx.fillStyle = '#5b3d78';
      ctx.beginPath();
      ctx.moveTo(0, -11); ctx.quadraticCurveTo(9, 0, 7, 6); ctx.quadraticCurveTo(4, 11, 0, 11); ctx.quadraticCurveTo(-4, 11, -7, 6); ctx.quadraticCurveTo(-9, 0, 0, -11);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8fd44a';
      ctx.beginPath(); ctx.arc(0, 4, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.beginPath(); ctx.arc(-3, -2, 1.8, 0, Math.PI * 2); ctx.fill();
      break;
    case 'carrot':
      // 胡萝卜：橙锥 + 绿缨
      ctx.save(); ctx.rotate(0.5);
      ctx.fillStyle = '#e8813c';
      ctx.beginPath();
      ctx.moveTo(-4.5, -6); ctx.lineTo(4.5, -6); ctx.quadraticCurveTo(2, 8, 0, 11); ctx.quadraticCurveTo(-2, 8, -4.5, -6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c4611f'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-2.5, -1); ctx.lineTo(1, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-2, 4); ctx.lineTo(0.5, 4.6); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#4f9e3f';
      ctx.beginPath(); ctx.ellipse(-3, -9, 4, 2, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, -9, 4, 2, 0.5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'carrot_pork_skewer':
      // 胡萝卜肉串：签子串熟肉与胡萝卜段
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(10, -10); ctx.stroke();
      ctx.fillStyle = '#c98a5a';
      ctx.save(); ctx.translate(3, -3); ctx.rotate(-0.78);
      rr(-4, -3.5, 8, 7, 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#e8813c';
      ctx.save(); ctx.translate(-4, 4); ctx.rotate(-0.78);
      rr(-3.5, -3, 7, 6, 2); ctx.fill();
      ctx.restore();
      break;
    case 'beef_carrot_soup':
      // 牛肉胡萝卜浓汤：白碗橙汤
      ctx.fillStyle = '#f2eee0';
      ctx.beginPath();
      ctx.moveTo(-11, -2); ctx.lineTo(11, -2); ctx.quadraticCurveTo(9, 10, 0, 10); ctx.quadraticCurveTo(-9, 10, -11, -2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#c9bfa4'; ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#e8963c';
      ctx.beginPath();
      ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.quadraticCurveTo(7, 8, 0, 8); ctx.quadraticCurveTo(-7, 8, -9, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c4781f';
      ctx.beginPath(); ctx.arc(-3, 3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, 2, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a5a3a';
      ctx.beginPath(); ctx.arc(1, 5, 1.8, 0, Math.PI * 2); ctx.fill();
      break;
    case 'wolf_carrot_stew':
      // 狼肉胡萝卜煲：深陶锅炖菜
      ctx.fillStyle = '#8a5a3a';
      rr(-10, -4, 20, 13, 4); ctx.fill();
      ctx.fillStyle = '#6b4428';
      rr(-10, -4, 20, 5, 4); ctx.fill();
      ctx.strokeStyle = '#54341e'; ctx.lineWidth = 1.2;
      rr(-10, -4, 20, 13, 4); ctx.stroke();
      ctx.fillStyle = '#d8903c';
      ctx.beginPath(); ctx.ellipse(0, -4, 8.4, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8813c';
      ctx.beginPath(); ctx.arc(-3, -4.6, 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a83c3c';
      ctx.beginPath(); ctx.arc(3, -3.6, 1.8, 0, Math.PI * 2); ctx.fill();
      break;
    case 'blueberry_steak':
      // 蓝莓牛排：焦褐牛排 + 紫蓝莓点缀
      ctx.fillStyle = '#8a5230';
      rr(-10, -3, 20, 13, 5); ctx.fill();
      ctx.strokeStyle = '#6b3a1e'; ctx.lineWidth = 1.2;
      rr(-10, -3, 20, 13, 5); ctx.stroke();
      ctx.strokeStyle = '#5c2f16'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.lineTo(0, 6);
      ctx.moveTo(0, 0); ctx.lineTo(6, 6);
      ctx.stroke();
      ctx.fillStyle = '#5b6bc4';
      ctx.beginPath(); ctx.arc(-7, -6, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-1.5, -8.5, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(4, -6, 2.4, 0, Math.PI * 2); ctx.fill();
      break;
    case 'roasted_mushroom':
      // 烤蘑菇：竹签串双菇
      ctx.strokeStyle = '#a5713d'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-10, 10); ctx.lineTo(8, -8); ctx.stroke();
      ctx.fillStyle = '#c9524a';
      ctx.beginPath(); ctx.arc(-4, 3, 5.6, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8b96a';
      rr(-7.5, 3, 7, 3.6, 1.8); ctx.fill();
      ctx.fillStyle = '#b3854a';
      ctx.beginPath(); ctx.arc(4, -5, 4.8, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d8cfb8';
      rr(1.2, -5, 5.6, 3, 1.5); ctx.fill();
      break;
    case 'carrot_berry_stew':
      // 胡萝卜蓝莓煲：陶碗 + 橙胡萝卜 + 紫蓝莓
      ctx.fillStyle = '#c98d55';
      ctx.beginPath();
      ctx.moveTo(-10, -2); ctx.lineTo(10, -2);
      ctx.quadraticCurveTo(9, 9, 0, 9);
      ctx.quadraticCurveTo(-9, 9, -10, -2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = '#e8b96a';
      ctx.beginPath(); ctx.ellipse(0, -2, 10, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e8813c';
      ctx.beginPath(); ctx.arc(-3.5, -3, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(1, -2.2, 1.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5b6bc4';
      ctx.beginPath(); ctx.arc(4.5, -3.4, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(-6.5, -2.2, 1.6, 0, Math.PI * 2); ctx.fill();
      break;
    case 'antidote':
      // 抗毒药水：紫塞瓶 + 绿液 + 解毒勾
      ctx.fillStyle = '#5a5344';
      rr(-2.5, -12, 5, 4, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(216, 230, 250, .9)';
      rr(-6, -8, 12, 18, 4); ctx.fill();
      ctx.strokeStyle = '#8a97a8'; ctx.lineWidth = 1.2;
      rr(-6, -8, 12, 18, 4); ctx.stroke();
      ctx.fillStyle = '#8fd44a';
      rr(-4.5, 0, 9, 8.5, 2.5); ctx.fill();
      ctx.strokeStyle = '#3f9142'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-2.5, 4.5); ctx.lineTo(-0.5, 6.5); ctx.lineTo(2.5, 2.5); ctx.stroke();
      break;
    case 'tonic':
      // 劲力药水：琥珀瓶 + 上扬箭头
      ctx.fillStyle = '#5a5344';
      rr(-2.5, -12, 5, 4, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(255, 244, 214, .9)';
      rr(-6, -8, 12, 18, 4); ctx.fill();
      ctx.strokeStyle = '#c9a86a'; ctx.lineWidth = 1.2;
      rr(-6, -8, 12, 18, 4); ctx.stroke();
      ctx.fillStyle = '#e8a03c';
      rr(-4.5, 0, 9, 8.5, 2.5); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-2.5, 5.5); ctx.lineTo(0, 2.5); ctx.lineTo(2.5, 5.5); ctx.stroke();
      break;
    case 'fury':
      // 狂暴药水：红瓶 + 怒纹
      ctx.fillStyle = '#5a5344';
      rr(-2.5, -12, 5, 4, 1.5); ctx.fill();
      ctx.fillStyle = 'rgba(255, 226, 226, .9)';
      rr(-6, -8, 12, 18, 4); ctx.fill();
      ctx.strokeStyle = '#c4787a'; ctx.lineWidth = 1.2;
      rr(-6, -8, 12, 18, 4); ctx.stroke();
      ctx.fillStyle = '#d84343';
      rr(-4.5, 0, 9, 8.5, 2.5); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-3, 3); ctx.lineTo(0, 6); ctx.lineTo(3, 3); ctx.stroke();
      break;
    case 'mega_salve':
      // 高级药膏：白罐 + 绿十字
      ctx.fillStyle = '#f2eee0';
      rr(-9, -6, 18, 15, 4); ctx.fill();
      ctx.fillStyle = '#c9bfa4';
      rr(-5, -10, 10, 4, 2); ctx.fill();
      ctx.strokeStyle = '#b3ab92'; ctx.lineWidth = 1.2;
      rr(-9, -6, 18, 15, 4); ctx.stroke();
      ctx.fillStyle = '#3f9142';
      rr(-1.6, -3, 3.2, 9, 1.2); ctx.fill();
      rr(-4.5, -0.2, 9, 3.2, 1.2); ctx.fill();
      break;
  }
  ctx.restore();
}

// ===== 耗材芯片：图标 + 名字 + ×需求；名字按稀有度着色，不足变红；一行最多 3 个，放不下自动换行 =====
// 预估占用行数（画卡片前先量高度用；换行规则必须与 drawCostChips 完全一致）
function costChipRows(cost, maxW) {
  let rows = 1, cx = 0, n = 0;
  font(11, true);
  const keys = Object.keys(cost);
  for (let i = 0; i < keys.length; i++) {
    const w = 20 + ctx.measureText(t('item.' + keys[i] + '.name')).width + 30;
    if (cx > 0 && (n >= 3 || cx + w > maxW)) { rows++; cx = 0; n = 0; }
    cx += w + 6; n++;
  }
  return rows;
}
// 绘制耗材芯片，返回占用高度（每行 20 + 行距 4）
function drawCostChips(x, y, maxW, cost) {
  font(11, true);
  let cx = x, cy = y, n = 0;
  const rowH = 20;
  const keys = Object.keys(cost);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const have = state.inv[k] || 0;
    const need = cost[k];
    const label = t('item.' + k + '.name');
    const nameW = ctx.measureText(label).width;
    const w = 20 + nameW + 30;
    if (n >= 3 || (cx > x && cx + w > x + maxW)) { cx = x; cy += rowH + 4; n = 0; }
    ctx.fillStyle = 'rgba(0,0,0,.05)';
    rr(cx, cy, w, rowH, 4); ctx.fill();
    drawIcon(k, cx + 10, cy + rowH / 2, 14);
    font(11, true);
    ctx.fillStyle = rarityColor(k);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx + 20, cy + rowH / 2);
    ctx.fillStyle = have >= need ? '#8a8171' : '#c0392b';
    ctx.fillText('×' + need, cx + 24 + nameW, cy + rowH / 2);
    cx += w + 6; n++;
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
