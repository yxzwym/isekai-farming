// JXA 测试运行器：macOS 自带，零依赖
// 运行：osascript -l JavaScript tests/harness.js（项目根或 tests/ 目录下均可）
// 原理：stub 浏览器环境 → 按序拼接 23 个源文件（与 index.html 一致）→ eval 测试脚本
ObjC.import('Foundation');

function readFile(p) {
  return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null));
}
function exists(p) {
  return !!ObjC.unwrap($.NSFileManager.defaultManager.fileExistsAtPath(p));
}

// 自动探测项目根：tests/ 目录下运行取 ../，项目根运行取 ./
var ROOT = exists('../index.html') ? '../' : './';
var FILES = [
  'js/i18n.js', 'js/lang/zh-CN.js', 'js/lang/en-US.js',
  'js/data/config.js', 'js/data/items.js', 'js/data/world.js',
  'js/game/state.js', 'js/game/vitals.js', 'js/game/actions.js', 'js/game/factory.js', 'js/game/battle.js', 'js/game/quest.js', 'js/game/dialog.js', 'js/game/cheat.js',
  'js/ui.js',
  'js/scenes/nodes.js', 'js/scenes/enemies.js', 'js/scenes/menu.js', 'js/scenes/field.js', 'js/scenes/panels.js', 'js/scenes/battle.js', 'js/scenes/factory.js',
  'js/main.js',
];

// ---- 浏览器环境 stub ----
var ctxStub;
var canvasStub = {
  getContext: function () { return ctxStub; },
  style: {}, width: 0, height: 0,
  addEventListener: function () {},
  getBoundingClientRect: function () { return { left: 0, top: 0, width: 480, height: 800 }; },
};
ctxStub = new Proxy({ canvas: canvasStub }, {
  get: function (t, p) {
    if (typeof p === 'symbol') return undefined;
    if (p in t) return t[p];
    return function () { return { addColorStop: function () {}, width: 10 }; };
  },
  set: function (t, p, v) { t[p] = v; return true; },
});
var window = { addEventListener: function () {}, innerWidth: 480, innerHeight: 800, devicePixelRatio: 1 };
var document = {
  getElementById: function () { return canvasStub; },
  addEventListener: function () {},
  hidden: false,
  createElement: function () { return { style: {}, getContext: function () { return ctxStub; }, addEventListener: function () {} }; },
};
var localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
var performance = { now: function () { return Date.now(); } };
var requestAnimationFrame = function () {};
var setInterval = function () { return 0; };
var clearInterval = function () {};
var setTimeout = function () { return 0; };
var clearTimeout = function () {};
var navigator = { vibrate: function () {}, userAgent: 'jxa-test' };
var CanvasRenderingContext2D = function () {};
CanvasRenderingContext2D.prototype = {};

// ---- 拼接全部脚本（剥离文件首行 'use strict'，保证声明落进本次 eval 作用域）----
var parts = [];
for (var i = 0; i < FILES.length; i++) {
  var code = readFile(ROOT + FILES[i]);
  if (code == null) throw new Error('MISSING FILE: ' + FILES[i]);
  code = code.replace(/^\s*'use strict';\s*/, '');
  parts.push('// ==== ' + FILES[i] + ' ====\n' + code);
}
var testCode = readFile(ROOT + 'tests/balance_scan.js');
if (testCode == null) throw new Error('MISSING FILE: tests/balance_scan.js');
eval(parts.join('\n') + '\n' + testCode);
