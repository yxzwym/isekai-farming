'use strict';
// ============================================================
// 多语言：语言包在 js/lang/*.js 中注册到 LANG_PACK
// t('a.b.c') 取当前语言文案，缺失时回退中文包
// tf('a.b.c', {n: 1}) 替换 {n} 占位符
// ============================================================

const LANG_PACK = {};
let lang = 'zh-CN';

function t(path) {
  const get = (pack) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), pack);
  const v = get(LANG_PACK[lang]);
  if (v !== undefined) return v;
  const f = get(LANG_PACK['zh-CN']);
  return f !== undefined ? f : path;
}

function tf(path, params) {
  let s = t(path);
  for (const k in params || {}) s = s.split('{' + k + '}').join(String(params[k]));
  return s;
}

function setLang(l) {
  if (LANG_PACK[l]) lang = l;
}
