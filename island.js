/*!
 * 焦糖布丁 · Island  v1.0.0
 * 灵动岛那种「原生弹簧」形变：宽、高、圆角三根弹簧，同一个力，动的是真实尺寸（不是 scale），
 * 所以里面的字永远不会被拉伸。移植自一套 Android 原生实现。
 * MIT License · https://github.com/wave2234/caramel-pudding
 *
 *   const island = new CaramelIsland(el, { bean: { w: 118, h: 34, r: 17 } });
 *   island.to({ w: 360, h: 150, r: 34 }, { open: true });   // 展开
 *   island.to({ w: 200, h: 34, r: 17 });                     // 收成胶囊（内容变化）
 *   island.to(island.bean, { hide: true });                  // 收起并淡出
 */
(function (root) {
  'use strict';

  // 单位质量阻尼弹簧：k = 刚度，z = 阻尼比（1 = 临界阻尼，不回弹；越小越弹）
  var PHASE = {
    expand: { k: 280, z: 0.8 },   // 展开：只带一点点过冲
    shrink: { k: 1200, z: 1 },    // 收起：临界阻尼，干脆利落，大约 190ms 就回到胶囊高度
    pop: { k: 200, z: 0.65 }      // 胶囊里内容变了（只有宽度在变）：轻轻弹一下
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function reduced() { try { return root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function speed() { var cp = root.CaramelPudding; return cp && cp.config && cp.config.speed > 0 ? cp.config.speed : 1; }

  // 解析解推进一步：任何帧率下都稳定，不会因为掉帧而「爆掉」
  function step(x, v, goal, k, z, dt) {
    var d = x - goal, w = Math.sqrt(k), decay = Math.exp(-z * w * dt);
    if (z >= 1) {
      var b = v + w * d;
      return [goal + (d + b * dt) * decay, (v - w * b * dt) * decay];
    }
    var wd = w * Math.sqrt(1 - z * z), b2 = (v + z * w * d) / wd, c = Math.cos(wd * dt), s = Math.sin(wd * dt), off = d * c + b2 * s;
    return [goal + off * decay, ((-d * wd * s + b2 * wd * c) - z * w * off) * decay];
  }

  function Island(el, opt) {
    opt = opt || {};
    this.el = el;
    this.bean = opt.bean || { w: 118, h: 34, r: 17 };   // 收起时的那颗「豆子」
    var s = opt.start || this.bean;
    this.v = [s.w, s.h, s.r]; this.vel = [0, 0, 0];
    this.target = s; this.final = s; this.start = s;
    this.phase = 'still'; this.age = 0; this.contentAge = 0;
    this.opacity = opt.hidden ? 0 : 1; this.inA = 1; this.outA = 0; this.blur = 0;
    this.expanded = false; this.hiding = false;
    this.onFrame = opt.onFrame || null;
    this._raf = 0; this._last = 0;
    this.render();
  }

  /**
   * goal: { w, h, r }
   * o.open   展开成大卡片
   * o.hide   收回豆子并淡出
   * o.appear 从看不见到出现
   */
  Island.prototype.to = function (goal, o) {
    o = o || {};
    this.final = goal; this.expanded = !!o.open; this.hiding = !!o.hide;
    this.contentAge = 0; this.outA = o.appear ? 0 : 1; this.inA = 0; this.blur = 12;
    if (o.animate === false || reduced()) {
      this.v = [goal.w, goal.h, goal.r]; this.vel = [0, 0, 0];
      this.opacity = o.hide ? 0 : 1; this.inA = 1; this.outA = 0; this.blur = 0; this.phase = 'still';
      this.render();
      return this;
    }
    this.opacity = 1;
    var b = this.bean;
    if (o.appear) { this.opacity = 0; this.begin('appear', b); }
    else if (o.hide || (!o.open && (this.v[1] > b.h + 0.5 || this.phase === 'expand'))) this.begin('shrink', b);
    else if (o.open) this.begin('expand', goal);
    else this.begin('pop', goal);
    this.loop();
    return this;
  };

  Island.prototype.begin = function (p, goal) {
    this.phase = p; this.age = 0;
    this.start = { w: this.v[0], h: this.v[1], r: this.v[2] };
    this.target = goal;
  };

  Island.prototype.progress = function () {
    var d = this.target.w - this.start.w;
    return Math.abs(d) < 0.5 ? Math.min(1, this.age / 0.2) : clamp((this.v[0] - this.start.w) / d, 0, 1.1);
  };

  Island.prototype.advance = function (dt) {
    var p = this.phase, b = this.bean, i;
    if (p === 'still') return;
    this.age += dt; this.contentAge += dt;
    // 旧内容 50~60ms 内就淡掉，不和新内容叠在一起
    this.outA = clamp(1 - this.contentAge / (this.expanded ? 0.06 : 0.05), 0, 1);
    if (p === 'appear') {
      this.opacity = Math.min(1, this.age / 0.08);
      if (this.age >= 0.08) this.begin(this.expanded ? 'expand' : 'pop', this.final);
      return;
    }
    if (p === 'fade') {
      this.opacity = Math.max(0, 1 - this.age / 0.15);
      if (this.opacity === 0) this.phase = 'still';
      return;
    }
    var P = PHASE[p], g = [this.target.w, this.target.h, this.target.r];
    for (i = 0; i < 3; i++) { var r = step(this.v[i], this.vel[i], g[i], P.k, P.z, dt); this.v[i] = r[0]; this.vel[i] = r[1]; }
    if (p === 'shrink') {
      this.inA = 0;
      // 收起分两段：先 190ms 把高度收回胶囊，再只在水平方向弹到最终宽度
      if (this.age >= 0.19) {
        this.v[1] = b.h; this.v[2] = b.r; this.vel[1] = this.vel[2] = 0;
        this.begin(this.hiding ? 'fade' : 'pop', this.final);
      }
    } else if (p === 'expand') {
      // 新内容等形状长到 40% 以后才出现：75ms 起，225ms 内从模糊 12px 变清楚
      var a = clamp((this.age - 0.075) / 0.225, 0, 1);
      this.inA = this.progress() < 0.4 ? 0 : a;
      this.blur = 12 * (1 - this.inA);
    } else if (p === 'pop') {
      var pr = this.progress();
      this.inA = clamp((pr - 0.2) / 0.6, 0, 1);
      this.blur = 12 * (1 - clamp((pr - 0.8) / 0.15, 0, 1));
    }
    if ((p === 'expand' || p === 'pop') && this.age + 0.0001 >= (p === 'pop' ? 0.57 : 0.55)) {
      var o = [this.start.w, this.start.h, this.start.r], ok = true;
      for (i = 0; i < 3; i++) {
        var tol = Math.max(b.h / 30, Math.abs(g[i] - o[i]) * 0.006);
        if (Math.abs(this.v[i] - g[i]) > tol || Math.abs(this.vel[i]) > tol * 8) { ok = false; break; }
      }
      if (ok) { this.v = g.slice(); this.vel = [0, 0, 0]; this.inA = 1; this.outA = 0; this.blur = 0; this.phase = 'still'; }
    }
  };

  Island.prototype.loop = function () {
    var self = this;
    if (self._raf) return;
    self._last = 0;
    var tick = function (t) {
      self._raf = 0;
      var dt = self._last ? Math.min(0.05, (t - self._last) / 1000) : 1 / 60;
      self._last = t;
      self.advance(dt * speed());
      self.render();
      if (self.phase !== 'still') self._raf = requestAnimationFrame(tick);
    };
    self._raf = requestAnimationFrame(tick);
  };

  // 默认渲染：写尺寸，并把内容透明度 / 模糊交给 CSS 变量
  //   [data-in]  { opacity: var(--island-in);  filter: blur(var(--island-blur)); }
  //   [data-out] { opacity: var(--island-out); }
  Island.prototype.render = function () {
    var st = { width: this.v[0], height: this.v[1], radius: this.v[2], opacity: this.opacity, incoming: this.inA, outgoing: this.outA, blur: this.blur, phase: this.phase };
    if (this.onFrame) return this.onFrame(st, this);
    var s = this.el.style;
    s.width = st.width.toFixed(2) + 'px';
    s.height = st.height.toFixed(2) + 'px';
    s.borderRadius = st.radius.toFixed(2) + 'px';
    s.opacity = st.opacity;
    s.setProperty('--island-in', st.incoming.toFixed(3));
    s.setProperty('--island-out', st.outgoing.toFixed(3));
    s.setProperty('--island-blur', st.blur.toFixed(2) + 'px');
  };

  Island.PHASE = PHASE;
  Island.step = step;
  // 拖拽松手的回弹（另一套参数）：k = 300, c = 13（阻尼比约 0.38，会过冲一点再回来）
  Island.DRAG = { k: 300, z: 13 / (2 * Math.sqrt(300)) };
  root.CaramelIsland = Island;
})(typeof window !== 'undefined' ? window : this);
