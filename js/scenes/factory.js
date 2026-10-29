'use strict';
// ============================================================
// 场景 · 工厂面板（原 scenes.js「工厂面板」段）
// 建筑分组 / 指派弹窗 / 供应与生产页签 / 行内产出卡
// ============================================================

// ---- 工厂面板（占位：自动化流水线玩法入口） ----
let factoryTab = 'supply'; // 建筑面板分页：supply(供应) | prod(生产) | research(科研)
const GRP_OPEN = {}; // bt -> 组内成员是否展开（默认收起只显示 3 行，同种造太多不再无限拉长页面）
let assignPick = null;     // 「选择」弹窗：{ gi, title, cur, opts: [{ v, label }] }
function modalOpen() { return !!assignPick; } // 弹窗打开期间吞掉拖动滚动（main.js 查询）

// 行内产出卡：横排在任务行下方，单行「图标 名称 当前/上限 (+N/分)」
// +N/分 = 1分钟预期（逐物品各自算），底色与组头耗材芯片同款
function drawStockChips(x, yTop, entries) {
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let cx = x;
  (entries || []).forEach((en) => {
    const label = t('item.' + en.id + '.name');
    const cur = state.inv[en.id] || 0, cap = capOf(en.id);
    const stock = fmt(Math.min(cur, cap)) + '/' + fmt(cap);
    const rate = en.rate != null ? '(+' + fmtRate(en.rate) + t('factory.perMin') + ')' : null;
    font(11, true);
    const nameW = ctx.measureText(label).width;
    const stockW = ctx.measureText(stock).width;
    font(10, true);
    const rateW = rate ? ctx.measureText(rate).width : 0;
    const w = 21 + nameW + 8 + stockW + (rate ? 6 + rateW : 0) + 10;
    ctx.fillStyle = 'rgba(0,0,0,.05)'; rr(cx, yTop, w, 20, 4); ctx.fill();
    drawIcon(en.id, cx + 10, yTop + 10, 14);
    font(11, false); ctx.fillStyle = rarityColor(en.id);
    ctx.fillText(label, cx + 21, yTop + 10);
    font(11, true); ctx.fillStyle = capNumColor(cur, cap);
    ctx.fillText(stock, cx + 21 + nameW + 8, yTop + 10);
    if (rate) {
      font(10, true); ctx.fillStyle = '#7fb069';
      ctx.fillText(rate, cx + 21 + nameW + 8 + stockW + 6, yTop + 10);
    }
    cx += w + 6;
  });
}

// 预估组头总和芯片占用行数（画卡片前先量高度用；换行规则必须与 drawRateChips 完全一致）
function rateChipRows(chips, maxW) {
  if (!chips || !chips.length) return 0;
  let rows = 1, cx = 0, n = 0;
  font(11, true);
  chips.forEach((ch) => {
    const w = 21 + ctx.measureText(ch.label).width + 10;
    if (n >= 3 || (cx > 0 && cx + w > maxW)) { rows++; cx = 0; n = 0; }
    cx += w + 6; n++;
  });
  return rows;
}
// 组头总和芯片：图标 + 「±N/分钟」；产出绿、应力琥珀、耗电土橙（比 stockChips 紧凑：无名称与库存）
// maxW 限宽自动换行（每行至多 3 个，规则与 rateChipRows 完全一致）
function drawRateChips(x, yTop, chips, maxW) {
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  let cx = x, n = 0;
  (chips || []).forEach((ch) => {
    font(11, true);
    const w = 21 + ctx.measureText(ch.label).width + 10;
    if (n >= 3 || (cx > x && cx + w > x + maxW)) { cx = x; yTop += 24; n = 0; }
    ctx.fillStyle = 'rgba(0,0,0,.05)'; rr(cx, yTop, w, 20, 4); ctx.fill();
    drawIcon(ch.icon, cx + 10, yTop + 10, 14);
    ctx.fillStyle = ch.color || '#5a5344';
    ctx.fillText(ch.label, cx + 21, yTop + 10);
    cx += w + 6; n++;
  });
}

// 打开指派弹窗：列出资源点/配方 + 关机；点选即生效
function openAssign(gi) {
  const b = state.builds[gi];
  if (!b || !BUILDINGS[b.t].use) return;
  const opts = [{ v: null, label: t('factory.off') }];
  if (b.t === 'harvester') {
    const seen = {}; // 类型内出现序号：同类型第 2 个点起显示 ·2/·3（与被占用跳过无关）
    for (const k of (HARVEST_SITE_MAP[state.map] || [])) {
      const tp = HARVEST_SITES[k];
      seen[tp] = (seen[tp] || 0) + 1;
      // 资源点独占：已被其他采集站占用的点不再列出（自己占的点仍列出，可保留或改关机）
      if (state.builds.some(x => x !== b && x.t === 'harvester' && x.node === k)) continue;
      const hy = HARVEST_YIELD[tp];
      const main = Object.keys(hy.items)[0];
      const perMin = Math.round(60 * hy.items[main] / hy.time * 10) / 10;
      const rate = Number.isInteger(perMin) ? String(perMin) : perMin.toFixed(1);
      opts.push({ v: k, label: t('node.' + tp + '.name') + (seen[tp] > 1 ? ' ·' + seen[tp] : '') + ' · ' + hy.time + 's · +' + rate + t('item.' + main + '.name') + t('factory.perMin') });
    }
  } else {
    for (const r of factoryRecipes(b.t)) {
      opts.push({ v: r.id, label: t('recipe.' + r.id + '.name') + ((r.y || 1) > 1 ? ' ×' + r.y : '') + ' · +' + fmtRate(recipeRate(r)) + t('factory.perMin') });
    }
  }
  assignPick = { gi, title: t('factory.bld.' + b.t + '.name'), cur: b.t === 'harvester' ? b.node : b.recipe, opts };
}
function applyAssign(gi, v) {
  const b = state.builds[gi];
  if (!b) { assignPick = null; return; }
  if (b.t === 'harvester') b.node = v;
  else b.recipe = v;
  b.busy = 0; // 换任务后重新开始一轮
  assignPick = null;
  markDirty();
}
// 点行直接切换任务：在「关机 → 各选项」序列里循环到下一个（顺序与弹窗一致）
function cycleAssign(gi) {
  const b = state.builds[gi];
  if (!b || !BUILDINGS[b.t].use) return;
  const vals = [null];
  if (b.t === 'harvester') {
    // 资源点独占：轮换序列跳过已被其他采集站占用的点（当前值不在序列时从关机档开始）
    for (const k of (HARVEST_SITE_MAP[state.map] || [])) {
      if (!state.builds.some(x => x !== b && x.t === 'harvester' && x.node === k)) vals.push(k);
    }
  } else {
    factoryRecipes(b.t).forEach(r => vals.push(r.id));
  }
  const cur = b.t === 'harvester' ? b.node : b.recipe;
  applyAssign(gi, vals[(vals.indexOf(cur) + 1) % vals.length]);
}

// 配方每分钟产出预估：60 × 产出 / 时长（整数不带小数点，小数留 1 位）
function recipeRate(r) { return Math.round(60 * (r.y || 1) / (r.t || 30) * 10) / 10; }
function fmtRate(v) { return Number.isInteger(v) ? String(v) : v.toFixed(1); }

function drawFactoryPanel() {
  const c = drawPanelBase(t('map.' + state.map) + ' · ' + t('factory.title'), 'factory');
  let y = c.y + 2;
  // ---- 页签：供应 / 生产 / 科研（与制作面板同款交互）----
  const tabs = ['supply', 'prod'];
  const tbw = (c.w - (tabs.length - 1) * 8) / tabs.length;
  tabs.forEach((tb, i) => {
    uiButton(c.x + i * (tbw + 8), y, tbw, 36, t('factory.tabs.' + tb), () => { factoryTab = tb; }, {
      kind: factoryTab === tb ? 'primary' : 'ghost', size: 14,
    });
  });
  y += 44;
  // ---- 地图信息框：建筑条 / 应力条 / 电力条（与血条同款：左标签 + 彩条 + 条内数据）/ 资源点 ----
  const supply = stressSupply(), demand = stressDemand(), over = stressOver();
  const power = powerSupply(), total = supply + power; // 电力与应力等效共池：需求由合计供给结算
  const hasStress = supply > 0; // 应力供给为 0（没建水车、也没蓄能）时，整条应力统计不显示
  const hasPower = power > 0;   // 电力供给为 0（没建发电机或没燃料）时，整条电力统计不显示
  const BH = 24 * (1 + (hasStress ? 1 : 0) + (hasPower ? 1 : 0)) + (over ? 24 : 0) + 58;
  ctx.fillStyle = '#f6f1e2'; rr(c.x, y, c.w, BH, 10); ctx.fill();
  ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 1; rr(c.x, y, c.w, BH, 10); ctx.stroke();
  const pad = 12, barW = c.w - pad * 2 - 52;
  let by = y + 12;
  // 建筑条：中间显示 已建/上限（建筑位按地图各算）
  const mapBlds = state.builds.filter(b => b.map === state.map);
  drawBarRow(c.x + pad, by, barW, 18, t('tab.factory'),
    Math.min(1, mapBlds.length / MAX_BUILDS), '#c9a86a',
    mapBlds.length + '/' + MAX_BUILDS);
  by += 24;
  // 应力条：运转中需求 / 总供给（应力+电力合并，如 36/48）；过载变红；无供给时整行隐藏
  if (hasStress) {
    drawBarRow(c.x + pad, by, barW, 18, t('factory.stress'),
      Math.min(1, total ? demand / total : 0), over ? '#e05a4e' : '#7fb069',
      demand + '/' + Math.round(total)); // 风力加成会产生小数，取整显示
    drawIcon('stress', c.x + pad + 38, by + 9, 14); // 闪电图标：紧贴「应力」label 之后、条之前
    by += 24;
  }
  // 电力条：燃烧发电（蒸汽机/生物质发电机）的供电 MW，条长 = 电力占总供给的比例
  if (hasPower) {
    drawBarRow(c.x + pad, by, barW, 18, t('factory.power'),
      Math.min(1, total ? power / total : 0), '#4f8fd0',
      '+' + Math.round(power) + ' MW');
    drawIcon('power', c.x + pad + 38, by + 9, 14);
    by += 24;
  }
  if (over) {
    font(13, true); ctx.fillStyle = '#c0392b';
    ctx.textAlign = 'center';
    ctx.fillText(t('factory.over'), c.x + c.w / 2, by + 4);
    by += 24;
  }
  // 资源行：图标 开发/上限（满了绿、超编红）；水无限 ♾️（只有初始草原有水，森林不能造水车）
  const rowY = by + 2;
  const mapSites = HARVEST_SITE_MAP[state.map] || [];
  const siteTypes = [...new Set(mapSites.map(k => HARVEST_SITES[k]))];
  let sx = c.x + pad;
  siteTypes.forEach(tp => {
    drawIcon(tp, sx + 11, rowY + 14, 24);
    const maxN = mapSites.filter(k => HARVEST_SITES[k] === tp).length;
    const dev = state.builds.filter(b => b.t === 'harvester' && b.map === state.map && b.node && HARVEST_SITES[b.node] === tp).length;
    font(13, true);
    ctx.fillStyle = dev > maxN ? '#c0392b' : (dev === maxN ? '#3f9142' : '#5a5344');
    ctx.textAlign = 'left';
    ctx.fillText(dev + '/' + maxN, sx + 26, rowY + 14);
    sx += 74;
  });
  if (state.map === 'plains') {
    drawIcon('water', sx + 11, rowY + 14, 24);
    font(13, true); ctx.fillStyle = '#4f8fd0';
    ctx.fillText('∞', sx + 26, rowY + 14);
  }
  y += BH + 14;

  // ---- 建筑分组：同类型一组，组头负责建造/选择，组内每台一行（右上角拆除）----
  const groupRow = (bt) => {
    const def = BUILDINGS[bt];
    const list = state.builds.filter(b => b.t === bt && b.map === state.map); // 建筑按地图独立分组
    const owned = list.length;
    const isCrank = bt === 'hand_crank';
    // 组总和芯片内容（画卡前先算好，行数进卡高）；摇杆的实时蓄能显示在下方建筑行
    // 发电类显示总供电（未建时预览单台值）；采集/制造类汇总全部在产机器的每分钟产出，待命耗电单列一条
    const perMin = t('factory.perMin');
    const fmtV = v => fmtRate(Math.round(v * 10) / 10);
    const chips = [];
    if (!isCrank) {
      if (bt === 'warehouse') {
        // 仓库：静置加成，无任务无耗电
        chips.push({ icon: bt, label: '+' + (def.storage || 30) + ' ' + t('factory.storageUnit'), color: '#7fb069' });
      } else if (bt === 'wind_turbine') {
        chips.push({ icon: 'stress', label: '+' + fmtV(owned ? windStress() : def.gen) + perMin, color: '#d99a2b' });
      } else if (def.burn && def.gen) {
        // 燃烧发电：只统计燃着的机器（MW），断燃料即熄火
        const lit = list.filter(b => b.burnLeft > 0).length;
        chips.push({ icon: 'power', label: '+' + (lit * def.gen) + ' MW', color: '#4f8fd0' });
      } else if (def.gen) {
        chips.push({ icon: 'stress', label: '+' + (owned * def.gen) + perMin, color: '#d99a2b' });
      } else {
        const rateMap = {};
        list.forEach(b => {
          let outs = null;
          if (b.t === 'harvester') {
            const site = b.node ? HARVEST_SITES[b.node] : null;
            const hy = site ? HARVEST_YIELD[site] : null;
            if (hy) outs = Object.keys(hy.items).map(k => ({ id: k, rate: 60 * hy.items[k] / hy.time }));
          } else {
            const r = RECIPES.find(x => x.id === b.recipe);
            if (r) outs = [{ id: r.out, rate: 60 * (r.y || 1) / (r.t || 30) }].concat(
              Object.keys(r.by || {}).map(k => ({ id: k, rate: 60 * (r.by[k] || 0) / (r.t || 30) })));
          }
          (outs || []).forEach(o => { rateMap[o.id] = (rateMap[o.id] || 0) + o.rate; });
        });
        for (const id in rateMap) chips.push({ icon: id, label: '+' + fmtV(rateMap[id]) + perMin, color: '#7fb069' });
        // 待命耗电（与 stressDemand 同口径：执行中或随时可开工的机器才算）
        const drain = list.filter(b => b.busy > 0 || stationJobReady(b)).length * def.use;
        if (drain) chips.push({ icon: 'stress', label: '-' + drain + perMin, color: '#b5764a' });
      }
    }
    // 组头：图标 + 名称×数量 + 总和芯片 + 造价 + 动作按钮 + 卡内说明
    const rateMaxW = c.w - 136; // 芯片行避开右侧建造按钮（按钮从 c.w-76 起）
    const rateRows = Math.max(1, rateChipRows(chips, rateMaxW));
    const chipRows = costChipRows(def.cost, c.w - 64);
    // 卡内说明自动换行：先按当前字体量行数定卡高（超长描述不再顶到按钮/溢出卡片）
    const dp = isCrank
      ? { per: CRANK.per, max: CRANK.max, sec: CRANK.seconds }
      : { gen: def.gen || 0, use: def.use || 0, time: def.time || 30 };
    font(11, false);
    const descMax = c.w - 76;
    const descLines = String(tf('factory.bld.' + bt + '.desc', dp)).split('\n')
      .reduce((n, p) => n + wrapText(p, descMax).length, 0);
    const descH = descLines * 15;
    const CH = 32 + (rateRows + chipRows) * 24 + descH + 12;
    // 滚出面板可视区的卡片不注册命中（内容坐标需加上滚动偏移后再与可视区比较）
    const sc = c.key ? (PANEL_SCROLLS[c.key] || 0) : 0;
    const cardVis = y + CH > c.y + sc && y < c.y + c.h + sc + 6;
    ctx.fillStyle = '#fff'; rr(c.x, y, c.w, CH, 10); ctx.fill();
    ctx.strokeStyle = '#e2dac4'; ctx.lineWidth = 1.2; rr(c.x, y, c.w, CH, 10); ctx.stroke();
    drawIcon(bt, c.x + 28, y + 38, 34);
    font(15, true); ctx.fillStyle = '#3c3c30';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t('factory.bld.' + bt + '.name') + (owned ? ' ×' + owned : ''), c.x + 52, y + 15);
    // 第二行：组总和芯片（图标 + ±N/分钟，maxW 内自动换行避让按钮）
    if (!isCrank) drawRateChips(c.x + 52, y + 28, chips, rateMaxW);
    // 造价（图标 + 名字 + 数量，稀有度着色，自动换行）
    drawCostChips(c.x + 52, y + 30 + rateRows * 24, c.w - 64, def.cost);
    // 卡内说明：数值全部从 data.js 定义读取（改数值不用改文案），自动换行
    drawWrapped(tf('factory.bld.' + bt + '.desc', dp), c.x + 52, y + 34 + (rateRows + chipRows) * 24, descMax, 15, '#a89f8c', 11, false);
    // 动作按钮状态机：摇杆建后变「手摇」；生产站建后变「选择」；水车一直「建造」
    // 科研未解锁的建筑在上面已被过滤，整卡不显示，不会走到这里
    const maxed = def.max !== undefined && owned >= def.max;
    let label, act, disabled;
    const crankBuilt = isCrank && owned;
    if (def.locked || crankBuilt) { label = null; act = null; disabled = true; } // 组头不放按钮，操作在建筑行
    else if (maxed) { label = t('factory.built'); act = () => {}; disabled = true; }
    else { label = t('factory.build'); act = () => buildFactory(bt); disabled = !canBuildFactory(bt); }
    if (label && cardVis) uiButton(c.x + c.w - 76, y + (CH - 32) / 2, 66, 32, label, act, { kind: 'primary', size: 13, disabled });
    y += CH + 6;
    // 组内成员：每台一行，右上角拆除；行点击轮换该台任务（含关机档）
    // 同种造太多时页面被拉得极长：默认只显示前 3 行，其余收进展开条
    const shown = GRP_OPEN[bt] ? list.length : Math.min(3, list.length);
    list.slice(0, shown).forEach((b, li) => {
      const gi = state.builds.indexOf(b);
      let jobText = '', blocked = false, cycle = def.time || 30, pct = 0, barColor = '#7fb069', chipIds = null, jobIcon = null, rowH = 52;
      const isCrankRow = bt === 'hand_crank';
      if (!def.use) {
        if (bt === 'hand_crank') {
          // 摇杆：实时蓄能 + 衰减倒计时进度条（归零即断供）
          jobText = tf('factory.crankNow', { n: state.crank.stacks, s: Math.ceil(state.crank.timer) });
          pct = state.crank.timer > 0 ? state.crank.timer / CRANK.seconds : 0;
          barColor = '#e0a53f';
        } else if (bt === 'warehouse') {
          // 仓库：无任务静置加成，永远满状态条
          jobText = '+' + (def.storage || 30) + ' ' + t('factory.storageUnit');
          pct = 1;
        } else if (def.burn && def.gen) {
          // 燃烧发电：燃着显示 MW + 本轮剩余秒数；燃尽自动续烧，没燃料才熄火
          jobText = b.burnLeft > 0 ? '+' + def.gen + ' MW · ' + Math.ceil(b.burnLeft) + 's' : t('factory.needFuel');
          pct = b.burnLeft > 0 ? Math.min(1, b.burnLeft / (def.time || def.burn.biomass || 40)) : 0;
          barColor = '#4f8fd0';
        } else {
          // 水车/风力机这类常驻发电：永远满状态条（风力机的群体加成在组头信息行展示）
          jobText = '+' + def.gen + t('factory.stress') + t('factory.perMin');
          pct = 1;
        }
      } else if (b.t === 'harvester') {
        const site = b.node ? HARVEST_SITES[b.node] : null;
        const hy = b.node ? HARVEST_YIELD[site] : null;
        if (!b.node) {
          jobText = t('factory.off');
        } else {
          // 任务行单行：任务名 #N · 单轮时长；N = 同类型资源点内的序号（#1 不显示）；速率预期放下方横排卡片里
          const idx = (HARVEST_SITE_MAP[state.map] || []).filter(s => HARVEST_SITES[s] === site).indexOf(b.node) + 1;
          jobText = t('node.' + site + '.name') + (idx > 1 ? ' #' + idx : '') + ' · ' + hy.time + 's';
          jobIcon = site;
          pct = b.busy > 0 ? Math.min(1, b.busy / hy.time) : 0; // 逐轮推进
          chipIds = Object.keys(hy.items).map(k => ({ id: k, rate: Math.round(60 * hy.items[k] / hy.time * 10) / 10 }));
          rowH = 84;
          // 全部产物都满才停产；部分满照常生产（数量各自标红）
          const keys = Object.keys(hy.items);
          const fullKeys = keys.filter(k => (state.inv[k] || 0) + hy.items[k] > capOf(k));
          if (fullKeys.length === keys.length) {
            blocked = true;
            chipIds = null;
            jobIcon = null;
            rowH = 52;
            jobText = t('factory.full') + '：' + fullKeys.map(k => t('item.' + k + '.name')).join(t('ui.listSep'));
          }
        }
        cycle = hy ? hy.time : 30;
      } else {
        const r = RECIPES.find(x => x.id === b.recipe);
        if (r) {
          jobText = t('recipe.' + r.id + '.name') + ((r.y || 1) > 1 ? ' ×' + r.y : '') + ' · ' + (r.t || 30) + 's';
          jobIcon = r.out; // 任务行带产物图标
          cycle = r.t || 30;
          // 每个产物各自一条速率：主产物 60·y/t，副产物 60·数量/t（未来石油类产率不同）
          chipIds = [{ id: r.out, rate: recipeRate(r) }].concat(
            Object.keys(r.by || {}).map(k => ({ id: k, rate: Math.round(60 * (r.by[k] || 0) / (r.t || 30) * 10) / 10 }))
          );
          rowH = 84;
          pct = b.busy > 0 ? Math.min(1, b.busy / cycle) : 0;
          blocked = !recipeOutputsFit(r); // 主产物或副产物仓库满都会停
          if (blocked) {
            chipIds = null;
            jobIcon = null;
            rowH = 52;
            jobText = t('factory.full') + '：' + t('item.' + r.out + '.name') + ' ' + (state.inv[r.out] || 0) + '/' + capOf(r.out);
          }
        } else jobText = t('factory.off');
      }
      ctx.fillStyle = '#f6f1e2'; rr(c.x + 10, y, c.w - 10, rowH, 10); ctx.fill();
      ctx.strokeStyle = blocked ? '#e0b0a0' : '#e2dac4'; ctx.lineWidth = 1.2; rr(c.x + 10, y, c.w - 10, rowH, 10); ctx.stroke();
      font(14, true); ctx.fillStyle = blocked ? '#c0392b' : '#3c3c30';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(t('factory.bld.' + bt + '.name') + (owned > 1 ? ' #' + (li + 1) : ''), c.x + 24, y + 14);
      // 任务区：任务单行（图标+名称 #N · 时长）；紧凑行同款间距（标题 y+14 → 任务 y+37）
      const jobX = c.x + (jobIcon ? 42 : 24);
      if (jobIcon && rowH > 42) drawIcon(jobIcon, c.x + 31, y + 37, 14);
      font(12, false); ctx.fillStyle = blocked ? '#c0392b' : '#8a8171';
      ctx.fillText(jobText, jobX, y + 37);
      // 产出卡横排（换行展示，含 1 分钟预期速率）
      if (chipIds && !blocked) drawStockChips(c.x + 24, y + 52, chipIds);
      // 底部进度条：贴底通栏、被卡片圆角裁剪（等价 CSS 的 overflow hidden 底栏）
      ctx.save();
      rr(c.x + 10, y, c.w - 10, rowH, 10); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,.08)';
      ctx.fillRect(c.x + 10, y + rowH - 4, c.w - 10, 4);
      const showBar = pct > 0 && (!def.use || !stressOver()); // 发电建筑常显；生产站过载时熄灭
      if (showBar) {
        ctx.fillStyle = barColor;
        ctx.fillRect(c.x + 10, y + rowH - 4, (c.w - 10) * pct, 4);
      }
      ctx.restore();
      // 行内操作：点行任意处 = 直接切换任务；按钮 = 弹窗指派（摇杆=手摇，其余=选择）
      const sc2 = c.key ? (PANEL_SCROLLS[c.key] || 0) : 0;
      const rowVis = y + rowH > c.y + sc2 && y < c.y + c.h + sc2 + 6; // 滚出可视区：不画按钮、不注册命中（含滚动偏移）
      if (!busyPanel() && rowVis && def.use) reg(c.x + 10, y, c.w - 10, rowH, () => cycleAssign(gi)); // 整行可点切换，先注册让按钮/拆除优先命中
      // 按钮锚定行顶部（y+23），与下方产出卡完全错开
      const midY = y + 23;
      if (isCrankRow) {
        if (rowVis) uiButton(c.x + c.w - 128, y + 5, 66, 28, t('factory.crank'), crankClick, { kind: 'primary', size: 13 });
      } else if (def.use) {
        if (rowVis && !busyPanel()) uiButton(c.x + c.w - 128, midY - 14, 66, 28, t('factory.assign'), () => openAssign(gi), { kind: 'primary', size: 13 });
      }
      ctx.fillStyle = '#f3ede0'; rr(c.x + c.w - 42, midY - 15, 30, 30, 8); ctx.fill();
      ctx.fillStyle = '#c0392b'; font(14, true);
      ctx.textAlign = 'center';
      ctx.fillText('✕', c.x + c.w - 27, midY + 1);
      if (!busyPanel() && rowVis) reg(c.x + c.w - 44, midY - 19, 32, 38, () => removeBuild(gi));
      y += rowH + 4;
    });
    // 展开/收起条：全宽细条居中文字，点击切换 GRP_OPEN
    if (list.length > 3) {
      const open = !!GRP_OPEN[bt];
      const ty = y + 1, th = 26;
      const sc3 = c.key ? (PANEL_SCROLLS[c.key] || 0) : 0;
      const tglVis = ty + th > c.y + sc3 && ty < c.y + c.h + sc3 + 6;
      ctx.fillStyle = 'rgba(0,0,0,.045)'; rr(c.x + 10, ty, c.w - 10, th, 8); ctx.fill();
      font(12, true); ctx.fillStyle = '#8a8171';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText((open ? '▴ ' : '▾ ') + (open ? t('factory.collapse') : tf('factory.expand', { n: list.length - 3 })), c.x + c.w / 2 + 5, ty + 14);
      if (!busyPanel() && tglVis) reg(c.x + 10, ty, c.w - 10, th, () => { GRP_OPEN[bt] = !open; });
      y += th + 4;
    }
    if (owned) y += 4;
  };
  const groupTitle = (title) => {
    font(15, true); ctx.fillStyle = '#5a5344';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(title, c.x, y + 12);
    y += 24;
  };
  // 科研未解锁的建筑整张卡片隐藏，解锁后才出现在列表里
  const visBlds = ids => ids.filter(bt => !BUILDINGS[bt].research || researchDone(BUILDINGS[bt].research));
  if (factoryTab === 'supply') {
    // 供应页：发电机（人力/自然力应力 + 燃烧电力）+ 采集器
    groupTitle(t('factory.gen'));
    visBlds(['hand_crank', 'water_wheel', 'wind_turbine', 'steam_engine', 'biomass_generator']).forEach(groupRow);
    groupTitle(t('factory.supplyGather'));
    visBlds(['harvester']).forEach(groupRow);
  } else {
    // 生产页：各类制造机器 + 后勤设施（仓库）
    groupTitle(t('factory.prod'));
    visBlds(['smelter', 'manufacturer', 'assembler', 'coal_kiln', 'warehouse']).forEach(groupRow);
  }
  endPanel('factory', y + 8);

  // ---- 「选择」弹窗：盖在面板最上层，遮罩点击关闭 ----
  if (assignPick) {
    ctx.fillStyle = 'rgba(10,20,16,.45)'; ctx.fillRect(0, 0, GAME_W, GAME_H);
    const optH = 44, pw = 360, ph = 96 + assignPick.opts.length * optH;
    const px = (GAME_W - pw) / 2, py = Math.max(70, (GAME_H - ph) / 2);
    ctx.fillStyle = '#fbf7ec'; rr(px, py, pw, ph, 16); ctx.fill();
    ctx.strokeStyle = '#d8cfb8'; ctx.lineWidth = 2; rr(px, py, pw, ph, 16); ctx.stroke();
    font(17, true); ctx.fillStyle = '#3c3c30';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(assignPick.title, px + pw / 2, py + 28);
    reg(0, 0, GAME_W, GAME_H, () => { assignPick = null; closePanel(); }); // 遮罩点击：弹窗和建筑面板一起关（先注册，选项优先命中）
    assignPick.opts.forEach((o, oi) => {
      const oy = py + 52 + oi * optH;
      const cur = assignPick.cur === o.v;
      ctx.fillStyle = cur ? '#fff7e0' : '#fff';
      rr(px + 14, oy, pw - 28, optH - 8, 10); ctx.fill();
      ctx.strokeStyle = cur ? '#e0c37a' : '#e2dac4'; ctx.lineWidth = 1.2;
      rr(px + 14, oy, pw - 28, optH - 8, 10); ctx.stroke();
      font(14, cur); ctx.fillStyle = cur ? '#7a4a12' : '#5a5344';
      ctx.textAlign = 'left';
      ctx.fillText((cur ? '✓ ' : '') + o.label, px + 30, oy + (optH - 8) / 2);
      reg(px + 14, oy, pw - 28, optH - 8, () => applyAssign(assignPick.gi, o.v));
    });
    uiButton(px + 14, py + ph - 44, pw - 28, 34, t('ui.cancel'), () => { assignPick = null; }, { kind: 'ghost', size: 14 });
  }
}
