/*
 * picker.js — interaktives Antippen/Verschieben von Punkten auf einem Foto.
 *
 * Zeichnet das Foto skaliert in ein <canvas>, verwaltet eine Punktliste in
 * BILD-Pixelkoordinaten (unabhängig von Anzeigegröße), erlaubt Hinzufügen per
 * Tap und Feinjustierung per Ziehen. Beim Ziehen wird eine Lupe (Magnifier)
 * eingeblendet, damit man pixelgenau platzieren kann.
 */
(function (global) {
  'use strict';

  function Picker(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts || {};
    this.img = null;                 // HTMLImageElement
    this.points = [];                // [{x,y}] in Bildkoordinaten
    this.maxPoints = this.opts.maxPoints || 4;
    this.labels = this.opts.labels || [];
    this.mode = this.opts.mode || 'window'; // 'window' (Polygon) | 'line' (Strecke, z. B. Kartenlänge)
    this.color = this.opts.color || '#a472f0';
    this.onChange = this.opts.onChange || function () {};
    this.dragIndex = -1;
    this.view = { scale: 1, ox: 0, oy: 0 }; // Bild->Canvas Transform
    this._bind();
  }

  Picker.prototype.setImage = function (img) {
    this.img = img;
    this.points = [];
    this.dragIndex = -1;
    this._resize();
    this.draw();
    this.onChange(this.points.slice());
  };

  Picker.prototype.reset = function () {
    this.points = [];
    this.dragIndex = -1;
    this.draw();
    this.onChange(this.points.slice());
  };

  // Modus/Anzahl/Beschriftung umstellen, ohne neue Event-Listener zu binden
  // (die gebundenen Handler lesen this.* zur Laufzeit). Setzt die Punkte zurück.
  Picker.prototype.configure = function (opts) {
    opts = opts || {};
    if (opts.maxPoints != null) this.maxPoints = opts.maxPoints;
    if (opts.mode) this.mode = opts.mode;
    if (opts.labels) this.labels = opts.labels;
    if (opts.color) this.color = opts.color;
    if (opts.onChange) this.onChange = opts.onChange;
    this.points = [];
    this.dragIndex = -1;
    this.draw();
    this.onChange(this.points.slice());
  };

  Picker.prototype.undo = function () {
    this.points.pop();
    this.draw();
    this.onChange(this.points.slice());
  };

  Picker.prototype.getPoints = function () { return this.points.slice(); };
  Picker.prototype.isComplete = function () { return this.points.length === this.maxPoints; };

  Picker.prototype._resize = function () {
    if (!this.img) return;
    var maxW = this.canvas.parentElement.clientWidth || 360;
    var ratio = this.img.naturalHeight / this.img.naturalWidth;
    var cssW = maxW;
    var cssH = Math.round(maxW * ratio);
    var dpr = global.devicePixelRatio || 1;
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.view.scale = this.canvas.width / this.img.naturalWidth;
    this.view.ox = 0;
    this.view.oy = 0;
  };

  // Bild- -> Canvas-Koordinaten (interne Pixel)
  Picker.prototype._toCanvas = function (p) {
    return { x: p.x * this.view.scale + this.view.ox, y: p.y * this.view.scale + this.view.oy };
  };

  // Pointer-Event -> Bildkoordinaten
  Picker.prototype._toImage = function (ev) {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = global.devicePixelRatio || 1;
    var cx = (ev.clientX - rect.left) * dpr; // in Canvas-Pixeln
    var cy = (ev.clientY - rect.top) * dpr;
    return { x: (cx - this.view.ox) / this.view.scale, y: (cy - this.view.oy) / this.view.scale };
  };

  Picker.prototype._hitTest = function (imgPt) {
    var dpr = global.devicePixelRatio || 1;
    var thresholdPx = 22 * dpr; // Fingerradius in Canvas-Pixeln
    var best = -1, bestD = Infinity;
    for (var i = 0; i < this.points.length; i++) {
      var c = this._toCanvas(this.points[i]);
      var ci = this._toCanvas(imgPt);
      var d = Math.hypot(c.x - ci.x, c.y - ci.y);
      if (d < thresholdPx && d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  Picker.prototype._bind = function () {
    var self = this;
    function down(ev) {
      if (!self.img) return;
      ev.preventDefault();
      var p = self._toImage(ev);
      var hit = self._hitTest(p);
      if (hit >= 0) {
        self.dragIndex = hit;
      } else if (self.points.length < self.maxPoints) {
        self.points.push(p);
        self.dragIndex = self.points.length - 1;
      } else {
        // alle gesetzt: nächstgelegenen Punkt greifen
        self.dragIndex = self._nearest(p);
      }
      self.draw();
      self.onChange(self.points.slice());
    }
    function move(ev) {
      if (self.dragIndex < 0 || !self.img) return;
      ev.preventDefault();
      var p = self._toImage(ev);
      p.x = Math.max(0, Math.min(self.img.naturalWidth, p.x));
      p.y = Math.max(0, Math.min(self.img.naturalHeight, p.y));
      self.points[self.dragIndex] = p;
      self.draw(true);
      self.onChange(self.points.slice());
    }
    function up() {
      self.dragIndex = -1;
      self.draw();
    }
    this.canvas.addEventListener('pointerdown', down);
    this.canvas.addEventListener('pointermove', move);
    global.addEventListener('pointerup', up);
    global.addEventListener('resize', function () {
      var pts = self.points.slice();
      self._resize();
      self.points = pts;
      self.draw();
    });
  };

  Picker.prototype._nearest = function (imgPt) {
    var best = 0, bestD = Infinity;
    for (var i = 0; i < this.points.length; i++) {
      var d = Math.hypot(this.points[i].x - imgPt.x, this.points[i].y - imgPt.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  Picker.prototype.draw = function (showLoupe) {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.img) return;
    ctx.drawImage(this.img, this.view.ox, this.view.oy,
      this.img.naturalWidth * this.view.scale, this.img.naturalHeight * this.view.scale);

    var pts = this.points.map(this._toCanvas, this);
    var dpr = global.devicePixelRatio || 1;

    // Verbindungslinien
    if (pts.length > 1) {
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (this.mode === 'window' && pts.length === this.maxPoints) ctx.closePath();
      ctx.stroke();

      if (this.mode === 'window' && pts.length === this.maxPoints) {
        // dezente, durchscheinende Füllung (funktioniert für jedes Farbformat)
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.restore();
      }
    }

    // Punkte + Labels
    for (var j = 0; j < pts.length; j++) {
      var c = pts[j];
      ctx.beginPath();
      ctx.arc(c.x, c.y, 8 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = this.color;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2.5 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();

      var lbl = this.labels[j] || String(j + 1);
      ctx.font = (13 * dpr) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      var tw = ctx.measureText(lbl).width;
      ctx.fillStyle = 'rgba(15,23,42,0.85)';
      ctx.fillRect(c.x - tw / 2 - 5 * dpr, c.y - 30 * dpr, tw + 10 * dpr, 19 * dpr);
      ctx.fillStyle = '#fff';
      ctx.fillText(lbl, c.x, c.y - 16 * dpr);
    }

    if (showLoupe && this.dragIndex >= 0) this._drawLoupe(this.points[this.dragIndex]);
  };

  // Lupe: vergrößerter Bildausschnitt um den aktiven Punkt, oben links.
  Picker.prototype._drawLoupe = function (imgPt) {
    var ctx = this.ctx;
    var dpr = global.devicePixelRatio || 1;
    var R = 56 * dpr;       // Lupenradius (Canvas-Pixel)
    var srcR = 42;          // Quellradius in Bildpixeln
    var zoom = R / srcR;
    var cx = R + 10 * dpr, cy = R + 10 * dpr;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(
      this.img,
      imgPt.x - srcR, imgPt.y - srcR, srcR * 2, srcR * 2,
      cx - R, cy - R, R * 2, R * 2
    );
    // Fadenkreuz
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    void zoom;
  };

  global.Picker = Picker;
})(window);
