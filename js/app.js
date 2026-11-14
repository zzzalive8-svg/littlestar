/* ============================================================
   我们的小相册 · 交互逻辑
   原生 JS，无框架、无网络请求，双击 index.html 即可运行。
   ============================================================ */

(function () {
  "use strict";

  /* ---------------- 基础工具 ---------------- */

  var C = window.CONFIG || {};
  var QUERY = (function () {
    try {
      return new URLSearchParams(window.location.search);
    } catch (e) {
      return { get: function () { return null; } };
    }
  })();

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function parseDateOnly(value) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value || ""));
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var date = new Date(y, mo - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) {
      return null;
    }
    return date;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function dayDiff(from, to) {
    var a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
    var b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86400000);
  }

  function calendarDiff(start, end) {
    if (!start || !end || end < start) return { years: 0, months: 0, days: 0 };
    var y = end.getFullYear() - start.getFullYear();
    var m = end.getMonth() - start.getMonth();
    var d = end.getDate() - start.getDate();
    if (d < 0) {
      m -= 1;
      d += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    }
    if (m < 0) {
      y -= 1;
      m += 12;
    }
    return { years: y, months: m, days: d };
  }

  function formatDateLong(value) {
    var d = parseDateOnly(value);
    if (!d) return "";
    return d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日";
  }

  function formatDateShort(value) {
    var d = parseDateOnly(value);
    if (!d) return "";
    return d.getFullYear() + "." + pad2(d.getMonth() + 1) + "." + pad2(d.getDate());
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function isBirthdayNow() {
    if (QUERY.get("birthday") === "1") return true;
    var now = new Date();
    var month = (C.birthday && C.birthday.month) || 11;
    var day = (C.birthday && C.birthday.day) || 15;
    return now.getMonth() + 1 === Number(month) && now.getDate() === Number(day);
  }

  function syncBirthdayTheme() {
    document.body.classList.toggle("is-birthday", isBirthdayNow());
  }

  function sessionGet(key) {
    try {
      return window.sessionStorage.getItem("love-album:" + key);
    } catch (e) {
      return null;
    }
  }

  function sessionSet(key, value) {
    try {
      window.sessionStorage.setItem("love-album:" + key, value);
    } catch (e) {}
  }

  function reducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function baseName(path) {
    var s = String(path || "");
    var i = s.lastIndexOf("/");
    return i >= 0 ? s.slice(i + 1) : s;
  }

  /* ---------------- 照片数据 ---------------- */

  function normalizePhotos(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.forEach(function (p) {
      if (!p || typeof p.src !== "string" || !p.src) return;
      var date = parseDateOnly(p.date) ? String(p.date).slice(0, 10) : "";
      var caption = typeof p.caption === "string" ? p.caption : "";
      out.push({ src: p.src, date: date, caption: caption });
    });
    out.sort(function (a, b) {
      if (a.date && b.date) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      } else if (a.date) {
        return -1;
      } else if (b.date) {
        return 1;
      }
      return a.src.localeCompare(b.src);
    });
    out.forEach(function (p, i) {
      p.index = i;
    });
    return out;
  }

  var PHOTOS = normalizePhotos(window.PHOTOS);
  var savedFavorite = "";

  /* ---------------- 常用节点 ---------------- */

  var gate = $("#gate");
  var gateCard = $(".gate-card");
  var gateForm = $("#gate-form");
  var gateInput = $("#gate-input");
  var gateHint = $("#gate-hint");
  var app = $("#app");
  var replayBtn = $("#bday-replay");
  var footer = $("#footer");

  var TILTS = [-1.8, 1.5, -0.7, 2.1, -2.3, 0.9, 1.9, -1.2];
  var TAPES = [
    "rgba(255, 226, 122, 0.75)",
    "rgba(255, 215, 225, 0.8)",
    "rgba(207, 195, 240, 0.7)",
    "rgba(205, 239, 227, 0.8)"
  ];
  var NOTE_COLORS = ["#FFE27A", "#FFD7E1", "#CDEFE3", "#CFC3F0", "#FFE9C9"];
  var NOTE_TILTS = [-2.4, 1.8, -1.1, 2.3, -0.5];

  /* ---------------- 小提示 ---------------- */

  var toastEl = null;
  var toastTimer = 0;

  function toast(message) {
    if (!toastEl) {
      toastEl = el("div", "toast");
      toastEl.id = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.remove("is-show");
    void toastEl.offsetWidth;
    toastEl.classList.add("is-show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove("is-show");
    }, 2600);
  }

  /* ---------------- 彩带 ---------------- */

  var Confetti = (function () {
    var canvas = $("#confetti");
    var ctx = canvas ? canvas.getContext("2d") : null;
    var particles = [];
    var raf = 0;
    var running = false;
    var endAt = 0;
    var dpr = 1;

    var COLORS = ["#FF8FA8", "#FFD7E1", "#CFC3F0", "#FFE27A", "#CDEFE3", "#FFFDFB"];

    function resize() {
      if (!canvas || !ctx) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(count, burst) {
      for (var i = 0; i < count; i += 1) {
        var center = !!burst;
        var spread = Math.PI * 2 * Math.random();
        var speed = 3 + Math.random() * 8;
        particles.push({
          x: center ? window.innerWidth * (0.35 + Math.random() * 0.3) : Math.random() * window.innerWidth,
          y: center ? window.innerHeight * (0.34 + Math.random() * 0.16) : -20 - Math.random() * 120,
          vx: center ? Math.cos(spread) * speed : (Math.random() - 0.5) * 2.4,
          vy: center ? Math.sin(spread) * speed - 3 : 2 + Math.random() * 3.4,
          w: 6 + Math.random() * 7,
          h: 5 + Math.random() * 8,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.28,
          color: COLORS[(Math.random() * COLORS.length) | 0],
          round: Math.random() < 0.28
        });
      }
    }

    function frame() {
      if (!running || !ctx) return;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (var i = particles.length - 1; i >= 0; i -= 1) {
        var p = particles[i];
        p.vy += 0.11;
        p.vx *= 0.994;
        p.vy *= 0.996;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > window.innerHeight + 60 || p.x < -80 || p.x > window.innerWidth + 80) {
          particles.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }
      if (particles.length || performance.now() < endAt) {
        raf = window.requestAnimationFrame(frame);
      } else {
        stop();
      }
    }

    function start(duration, count) {
      if (!ctx || reducedMotion()) return;
      resize();
      particles = [];
      spawn(count || 150, false);
      endAt = performance.now() + (duration || 9000);
      if (!running) {
        running = true;
        raf = window.requestAnimationFrame(frame);
      }
    }

    function burst(count) {
      if (!ctx || reducedMotion()) return;
      resize();
      spawn(count || 110, true);
      endAt = performance.now() + 3800;
      if (!running) {
        running = true;
        raf = window.requestAnimationFrame(frame);
      }
    }

    function stop() {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
      particles = [];
      if (ctx) ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }

    window.addEventListener("resize", function () {
      if (running) resize();
    });

    return { start: start, burst: burst, stop: stop };
  })();

  /* ---------------- 音乐盒 ---------------- */

  var Music = (function () {
    var button = $("#music-btn");
    if (!button) return { toggle: function () {}, playBirthday: function () {} };

    var ctx = null;
    var master = null;
    var sfx = null;
    var audio = null;
    var ambientTimer = 0;
    var playing = false;
    var fileFailed = false;

    var PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

    /* 生日快乐（公有领域旋律） */
    var HAPPY = [
      [392, 0.75], [392, 0.25], [440, 1], [392, 1], [523.25, 1], [493.88, 2],
      [392, 0.75], [392, 0.25], [440, 1], [392, 1], [587.33, 1], [523.25, 2],
      [392, 0.75], [392, 0.25], [783.99, 1], [659.25, 1], [523.25, 1], [587.33, 1], [523.25, 2],
      [698.46, 0.75], [698.46, 0.25], [659.25, 1], [523.25, 1], [587.33, 1], [523.25, 2]
    ];

    function ensureCtx() {
      if (ctx) {
        if (ctx.state === "suspended") {
          try { ctx.resume(); } catch (e) {}
        }
        return ctx;
      }
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.0001;
        master.connect(ctx.destination);
        sfx = ctx.createGain();
        sfx.gain.value = 0.55;
        sfx.connect(ctx.destination);
      } catch (e) {
        ctx = null;
      }
      return ctx;
    }

    function tone(freq, when, dur, vol, dest) {
      var c = ensureCtx();
      if (!c) return;
      var target = dest || master;
      var osc = c.createOscillator();
      var osc2 = c.createOscillator();
      var gain = c.createGain();
      var gain2 = c.createGain();
      osc.type = "sine";
      osc2.type = "triangle";
      osc.frequency.value = freq;
      osc2.frequency.value = freq * 2;
      gain2.gain.value = 0.16;
      osc.connect(gain);
      osc2.connect(gain2);
      gain2.connect(gain);
      gain.connect(target);
      var t = Math.max(when, c.currentTime + 0.01);
      var v = vol || 0.5;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(v, t + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      try {
        osc.start(t);
        osc2.start(t);
        osc.stop(t + dur + 0.06);
        osc2.stop(t + dur + 0.06);
      } catch (e) {}
    }

    function playMelody(seq, beat, vol, dest) {
      var c = ensureCtx();
      if (!c) return;
      var t = c.currentTime + 0.08;
      seq.forEach(function (note) {
        var dur = Math.max(0.12, note[1] * beat);
        tone(note[0], t, dur * 0.92, vol, dest);
        t += dur;
      });
    }

    function setPlaying(value) {
      playing = value;
      button.classList.toggle("is-playing", value);
      button.setAttribute("aria-pressed", value ? "true" : "false");
      button.setAttribute("aria-label", value ? "关闭背景音乐" : "打开背景音乐");
    }

    function startSynth(firstNote) {
      var c = ensureCtx();
      if (!c) {
        toast("这台电脑暂时放不了音乐");
        return;
      }
      var now = c.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.linearRampToValueAtTime(0.16, now + 0.6);
      if (ambientTimer) window.clearInterval(ambientTimer);
      if (firstNote) {
        tone(PENTA[2], now + 0.05, 1.5, 0.3, master);
      }
      ambientTimer = window.setInterval(function () {
        if (!playing || !ctx) return;
        if (Math.random() < 0.82) {
          var f = PENTA[(Math.random() * PENTA.length) | 0];
          tone(f, ctx.currentTime + 0.03, 1.4 + Math.random() * 0.7, 0.3, master);
        }
      }, 1050);
      setPlaying(true);
    }

    function fallbackToSynth() {
      if (audio) {
        try { audio.pause(); } catch (e) {}
        audio = null;
      }
      fileFailed = true;
      startSynth(true);
      toast("没找到 music.mp3，换成小八音盒啦");
    }

    function start() {
      if (playing) return;
      if (fileFailed) {
        startSynth(true);
        return;
      }
      var src = C.music || "assets/music.mp3";
      var a = new Audio(src);
      a.loop = true;
      a.volume = 0.52;
      var settled = false;
      a.addEventListener("error", function () {
        if (settled) return;
        settled = true;
        fallbackToSynth();
      }, { once: true });
      function success() {
        if (settled) return;
        settled = true;
        audio = a;
        setPlaying(true);
      }
      a.addEventListener("playing", success, { once: true });

      var request;
      try {
        request = a.play();
      } catch (e) {
        settled = true;
        fallbackToSynth();
        return;
      }
      if (request && typeof request.then === "function") {
        request.then(success).catch(function () {
          if (settled) return;
          settled = true;
          fallbackToSynth();
        });
      } else {
        success();
      }
      window.setTimeout(function () {
        if (settled) return;
        if (!a.paused && !a.ended) {
          success();
          return;
        }
        settled = true;
        fallbackToSynth();
      }, 2200);
    }

    function stop() {
      if (audio) {
        try { audio.pause(); } catch (e) {}
      }
      if (ambientTimer) {
        window.clearInterval(ambientTimer);
        ambientTimer = 0;
      }
      if (ctx && master) {
        var now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(0.0001, now, 0.07);
      }
      setPlaying(false);
    }

    function toggle() {
      if (playing) stop();
      else start();
    }

    function playBirthday() {
      var c = ensureCtx();
      if (!c) return;
      if (c.state === "suspended") {
        try { c.resume(); } catch (e) {}
      }
      playMelody(HAPPY, 0.42, 0.72, sfx);
    }

    button.addEventListener("click", toggle);

    return {
      toggle: toggle,
      playBirthday: playBirthday
    };
  })();

  /* ---------------- 大图查看 ---------------- */

  var Lightbox = (function () {
    var overlay = $("#lightbox");
    if (!overlay) return { open: function () {} };

    var img = $("#lb-img");
    var fallback = $("#lb-fallback");
    var cap = $("#lb-cap");
    var dateEl = $("#lb-date");
    var countEl = $("#lb-count");
    var closeBtn = $("#lb-close");
    var prevBtn = $("#lb-prev");
    var nextBtn = $("#lb-next");
    var current = 0;
    var lastFocus = null;
    var lastOverflow = "";
    var touchStartX = null;

    function render() {
      var photo = PHOTOS[current];
      if (!photo) return;
      img.hidden = false;
      fallback.hidden = true;
      img.classList.remove("is-broken");
      img.src = photo.src;
      img.alt = photo.caption || "我们的照片";
      img.onerror = function () {
        img.hidden = true;
        fallback.hidden = false;
      };
      cap.textContent = photo.caption || "我们的日子";
      dateEl.textContent = formatDateLong(photo.date);
      countEl.textContent = current + 1 + " / " + PHOTOS.length;
      preload(current - 1);
      preload(current + 1);
    }

    function preload(index) {
      if (index < 0 || index >= PHOTOS.length) return;
      var im = new Image();
      im.src = PHOTOS[index].src;
    }

    function open(index) {
      if (!PHOTOS.length || index < 0 || index >= PHOTOS.length) return;
      lastFocus = document.activeElement;
      current = index;
      lastOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      app.inert = true;
      overlay.hidden = false;
      render();
      closeBtn.focus();
    }

    function close() {
      overlay.hidden = true;
      document.body.style.overflow = lastOverflow;
      app.inert = false;
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
      lastFocus = null;
    }

    function go(delta) {
      if (!PHOTOS.length) return;
      current = (current + delta + PHOTOS.length) % PHOTOS.length;
      render();
    }

    function trapFocus(event) {
      var focusable = $$("button", overlay);
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    closeBtn.addEventListener("click", close);
    prevBtn.addEventListener("click", function () { go(-1); });
    nextBtn.addEventListener("click", function () { go(1); });

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) close();
    });

    overlay.addEventListener("pointerdown", function (event) {
      if (event.target === closeBtn || event.target === prevBtn || event.target === nextBtn) return;
      touchStartX = event.clientX;
    });

    overlay.addEventListener("pointerup", function (event) {
      if (touchStartX === null) return;
      var delta = event.clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) > 48) go(delta > 0 ? -1 : 1);
    });

    return {
      open: open,
      close: close,
      prev: function () { go(-1); },
      next: function () { go(1); },
      isOpen: function () { return !overlay.hidden; },
      trapFocus: trapFocus
    };
  })();

  /* ---------------- 时光轴 ---------------- */

  function groupByMonth(list) {
    var groups = [];
    var map = Object.create(null);
    list.forEach(function (photo) {
      var key = photo.date ? photo.date.slice(0, 7) : "unknown";
      if (!map[key]) {
        map[key] = { key: key, items: [] };
        groups.push(map[key]);
      }
      map[key].items.push(photo);
    });
    return groups;
  }

  function monthLabel(key) {
    if (key === "unknown") return "未分类";
    var parts = key.split("-");
    return parts[0] + " 年 " + Number(parts[1]) + " 月";
  }

  function createPhotoCard(photo, order) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "photo-card";
    card.dataset.photoIndex = String(photo.index);
    card.style.setProperty("--tilt", TILTS[order % TILTS.length] + "deg");
    card.style.setProperty("--tape", TAPES[order % TAPES.length]);
    card.setAttribute(
      "aria-label",
      "查看照片：" + (photo.caption || "我们的照片") + (photo.date ? "，" + formatDateLong(photo.date) : "")
    );

    var frame = el("div", "photo-frame");
    var image = document.createElement("img");
    image.loading = "lazy";
    image.decoding = "async";
    image.alt = photo.caption || "我们的照片";
    image.src = photo.src;
    image.addEventListener("error", function () {
      card.classList.add("is-broken");
      var name = baseName(photo.src);
      try {
        name = decodeURIComponent(name);
      } catch (e) {}
      frame.textContent = "这张照片走丢了\n" + name + "\n重新运行「更新照片清单.bat」";
    });
    frame.appendChild(image);

    var cap = el("span", "photo-cap", photo.caption || "我们的日子");
    var date = el("span", "photo-date", formatDateShort(photo.date));
    card.appendChild(frame);
    card.appendChild(cap);
    if (photo.date) card.appendChild(date);
    return card;
  }

  function findPhotoByValue(value) {
    var preferred = String(value || "").trim();
    if (!preferred) return null;
    var wanted = preferred.replace(/\\/g, "/");
    wanted = wanted.slice(wanted.lastIndexOf("/") + 1);
    try {
      wanted = decodeURIComponent(wanted);
    } catch (e) {}
    wanted = wanted.toLowerCase();
    for (var i = 0; i < PHOTOS.length; i += 1) {
      var decoded = PHOTOS[i].src;
      try {
        decoded = decodeURIComponent(decoded);
      } catch (e) {}
      var name = decoded.slice(decoded.lastIndexOf("/") + 1).toLowerCase();
      if (name === wanted) return PHOTOS[i];
    }
    return null;
  }

  function resolveHeroPhoto() {
    var saved = findPhotoByValue(savedFavorite);
    if (saved) return saved;
    var configured = findPhotoByValue(C.heroPhoto);
    if (configured) return configured;
    return PHOTOS.length ? PHOTOS[PHOTOS.length - 1] : null;
  }

  function applyHeroPhoto() {
    var hero = $("#hero-photo");
    if (!hero) return;
    var chosen = resolveHeroPhoto();
    if (!chosen) return;
    delete hero.dataset.fallbackTried;
    hero.src = chosen.src;
    hero.alt = chosen.caption || "最喜欢的一张照片";
    hero.onerror = function () {
      var latest = PHOTOS[PHOTOS.length - 1];
      if (!hero.dataset.fallbackTried && latest && latest.src !== hero.src) {
        hero.dataset.fallbackTried = "1";
        hero.src = latest.src;
        return;
      }
      hero.src = "assets/photo-placeholder.svg";
      hero.onerror = null;
    };
  }

  function renderTimeline() {
    var list = $("#timeline-list");
    var empty = $("#empty-state");
    if (!list || !empty) return;
    list.innerHTML = "";

    if (!PHOTOS.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    var groups = groupByMonth(PHOTOS);
    var frag = document.createDocumentFragment();
    var order = 0;

    groups.forEach(function (group) {
      var block = el("div", "month-block");
      var head = el("div", "month-head");
      head.appendChild(el("h3", null, monthLabel(group.key)));
      head.appendChild(el("span", "month-count", group.items.length + " 张"));
      head.appendChild(el("span", "month-line"));
      block.appendChild(head);

      var grid = el("div", "photo-grid");
      group.items.forEach(function (photo) {
        grid.appendChild(createPhotoCard(photo, order));
        order += 1;
      });
      block.appendChild(grid);
      frag.appendChild(block);
    });

    list.appendChild(frag);

    list.addEventListener("click", function (event) {
      var card = event.target.closest(".photo-card");
      if (!card) return;
      var index = Number(card.dataset.photoIndex);
      if (!isNaN(index)) Lightbox.open(index);
    });

    applyHeroPhoto();
  }

  /* ---------------- 更换最喜欢的一张 ---------------- */

  var Favorite = (function () {
    var overlay = $("#favorite-picker");
    if (!overlay) {
      return {
        open: function () {},
        close: function () {},
        isOpen: function () { return false; },
        trapFocus: function () {}
      };
    }

    var grid = $("#favorite-grid");
    var closeBtn = $("#favorite-close");
    var resetBtn = $("#favorite-reset");
    var trigger = $("#favorite-edit");
    var lastFocus = null;
    var lastOverflow = "";
    var visible = false;

    function render() {
      if (!grid) return;
      grid.innerHTML = "";

      if (!PHOTOS.length) {
        grid.appendChild(
          el(
            "p",
            "favorite-empty",
            "还没有照片。先把照片放进 photos 文件夹，再双击「更新照片清单.bat」，就可以在这里选啦。"
          )
        );
        if (resetBtn) resetBtn.hidden = true;
        return;
      }

      if (resetBtn) resetBtn.hidden = false;
      var current = resolveHeroPhoto();
      var currentSrc = current ? current.src : "";

      PHOTOS.slice()
        .reverse()
        .forEach(function (photo) {
          var item = document.createElement("button");
          item.type = "button";
          item.className = "favorite-item" + (photo.src === currentSrc ? " is-current" : "");
          item.setAttribute("aria-pressed", photo.src === currentSrc ? "true" : "false");
          item.setAttribute("aria-label", "选这张做最喜欢的一张：" + (photo.caption || "我们的照片"));

          var img = document.createElement("img");
          img.loading = "lazy";
          img.decoding = "async";
          img.src = photo.src;
          img.alt = photo.caption || "我们的照片";

          item.appendChild(img);
          if (photo.date) item.appendChild(el("span", "favorite-item-date", formatDateShort(photo.date)));
          item.appendChild(el("span", "favorite-item-cap", photo.caption || "我们的日子"));
          if (photo.src === currentSrc) {
            item.appendChild(el("span", "favorite-item-badge", "♥"));
          }

          item.addEventListener("click", function () {
            savedFavorite = photo.src;
            Store.set("favoritePhoto", photo.src);
            applyHeroPhoto();
            toast("换成这张啦 ♥");
            close();
          });

          grid.appendChild(item);
        });
    }

    function open() {
      if (visible) return;
      visible = true;
      lastFocus = document.activeElement;
      lastOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      app.inert = true;
      render();
      overlay.hidden = false;
      if (closeBtn) closeBtn.focus();
    }

    function close() {
      if (!visible) return;
      visible = false;
      overlay.hidden = true;
      var birthdayStillOpen = !$("#birthday").hidden;
      if (!birthdayStillOpen) {
        document.body.style.overflow = lastOverflow;
        app.inert = false;
      }
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
      lastFocus = null;
    }

    function reset() {
      savedFavorite = "";
      Store.del("favoritePhoto");
      applyHeroPhoto();
      render();
      toast("恢复成默认啦");
    }

    function trapFocus(event) {
      var focusable = $$("button", overlay);
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    if (trigger) trigger.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (resetBtn) resetBtn.addEventListener("click", reset);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) close();
    });

    return {
      open: open,
      close: close,
      isOpen: function () { return visible; },
      trapFocus: trapFocus
    };
  })();

  /* ---------------- 悄悄话 ---------------- */

  var Notes = (function () {
    var board = $("#note-board");
    var form = $("#note-form");
    var input = $("#note-input");
    var addBtn = $("#add-note-btn");
    var cancelBtn = $("#note-cancel");
    var custom = [];
    if (!board) return {};

    function render() {
      board.innerHTML = "";
      var items = [];
      (C.notes || []).forEach(function (text) {
        items.push({ text: String(text), custom: false });
      });
      custom.forEach(function (note) {
        if (note && note.text) items.push({ text: String(note.text), custom: true, id: note.id });
      });

      if (!items.length) {
        board.appendChild(el("p", "notes-empty", "还没有悄悄话，先贴一张吧～"));
        return;
      }

      items.forEach(function (note, index) {
        var card = el("article", "note");
        card.style.setProperty("--note-bg", NOTE_COLORS[index % NOTE_COLORS.length]);
        card.style.setProperty("--tilt", NOTE_TILTS[index % NOTE_TILTS.length] + "deg");
        card.appendChild(el("p", "note-text", note.text));
        card.appendChild(el("span", "note-from", note.custom ? "我贴的" : "写给你"));
        if (note.custom) {
          var del = el("button", "note-del", "×");
          del.type = "button";
          del.setAttribute("aria-label", "撕掉这张纸条");
          del.dataset.noteId = note.id;
          card.appendChild(del);
        }
        board.appendChild(card);
      });
    }

    function save() {
      Store.set("notes", custom);
    }

    function load() {
      Store.get("notes").then(function (value) {
        custom = Array.isArray(value) ? value : [];
        render();
      });
    }

    addBtn.addEventListener("click", function () {
      form.hidden = !form.hidden;
      if (!form.hidden) input.focus();
    });

    cancelBtn.addEventListener("click", function () {
      form.hidden = true;
      input.value = "";
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = input.value.replace(/\s+$/, "");
      if (!text.trim()) {
        toast("写点什么再贴上去呀～");
        return;
      }
      custom.push({
        id: String(Date.now()) + "-" + Math.random().toString(16).slice(2),
        text: text.slice(0, 120),
        at: todayKey()
      });
      save();
      render();
      input.value = "";
      form.hidden = true;
      toast("贴好啦 ♥");
    });

    board.addEventListener("click", function (event) {
      var del = event.target.closest(".note-del");
      if (!del) return;
      var id = del.dataset.noteId;
      custom = custom.filter(function (note) { return note.id !== id; });
      save();
      render();
      toast("纸条撕掉啦");
    });

    render();
    load();
    return { render: render };
  })();

  /* ---------------- 一封信 ---------------- */

  var Letter = (function () {
    var overlay = $("#letter");
    if (!overlay) {
      return {
        open: function () {},
        close: function () {},
        isOpen: function () { return false; },
        trapFocus: function () {}
      };
    }

    var cfg = C.letter || {};
    var bodyEl = $("#letter-body");
    var titleEl = $("#letter-title");
    var greetingEl = $("#letter-greeting");
    var signatureEl = $("#letter-signature");
    var dateEl = $("#letter-date");
    var footEl = $("#letter-foot");
    var paper = $("#letter-paper");
    var closeBtn = $("#letter-close");
    var finishBtn = $("#letter-finish");
    var lastFocus = null;
    var lastOverflow = "";
    var visible = false;

    function render() {
      if (titleEl) titleEl.textContent = cfg.title || "";
      if (greetingEl) greetingEl.textContent = cfg.greeting || "";
      if (bodyEl) {
        bodyEl.innerHTML = "";
        (cfg.paragraphs || []).forEach(function (text) {
          bodyEl.appendChild(el("p", null, text));
        });
      }
      if (signatureEl) signatureEl.textContent = cfg.signature || "";
      if (dateEl) dateEl.textContent = cfg.date || "";
      if (footEl) footEl.textContent = cfg.foot || "";
      $$("[data-letter-label]").forEach(function (node) {
        node.textContent = cfg.button || "我的一封信";
      });
    }

    function open() {
      if (visible) return;
      visible = true;
      lastFocus = document.activeElement;
      lastOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      app.inert = true;
      overlay.hidden = false;
      if (paper) paper.scrollTop = 0;
      Confetti.stop();
      if (closeBtn) closeBtn.focus();
    }

    function close() {
      if (!visible) return;
      visible = false;
      overlay.hidden = true;
      var birthdayStillOpen = !$("#birthday").hidden;
      if (!birthdayStillOpen) {
        document.body.style.overflow = lastOverflow;
        app.inert = false;
      } else {
        Confetti.start(7000, 110);
      }
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
      lastFocus = null;
    }

    function trapFocus(event) {
      var focusable = $$("button", overlay);
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    /* 信只在生日当天出现；生日过后连首页入口也一起收起。 */
    function syncAvailability() {
      var heroBtn = $("#hero-letter-btn");
      var available = cfg.enabled !== false && isBirthdayNow();
      if (heroBtn) heroBtn.hidden = !available;
      if (!available && visible) close();
      return available;
    }

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (finishBtn) finishBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) close();
    });

    var triggers = [$("#bday-letter-btn"), $("#hero-letter-btn")];
    if (cfg.enabled === false) {
      triggers.forEach(function (btn) {
        if (btn) btn.hidden = true;
      });
    } else {
      triggers.forEach(function (btn) {
        if (btn) btn.addEventListener("click", open);
      });
    }

    render();
    syncAvailability();

    return {
      open: open,
      close: close,
      isOpen: function () { return visible; },
      trapFocus: trapFocus,
      syncAvailability: syncAvailability
    };
  })();

  /* ---------------- 生日 ---------------- */

  var Birthday = (function () {
    var overlay = $("#birthday");
    if (!overlay) return { maybeShow: function () {} };

    var btn = $("#blow-btn");
    var closeBtn = $("#bday-close");
    var msg = $("#bday-msg");
    var hint = $("#bday-hint");
    var forced = QUERY.get("birthday") === "1";
    var open = false;
    var blown = false;
    var lastOverflow = "";

    function configMonth() {
      return C.birthday && C.birthday.month ? Number(C.birthday.month) : 11;
    }

    function configDay() {
      return C.birthday && C.birthday.day ? Number(C.birthday.day) : 15;
    }

    function isToday() {
      var now = new Date();
      return now.getMonth() + 1 === configMonth() && now.getDate() === configDay();
    }

    function maybeShow() {
      var shouldShow = forced || isToday();
      if (replayBtn) replayBtn.hidden = !shouldShow;
      if (footer) footer.hidden = !shouldShow;
      if (!shouldShow) {
        if (open) close();
        return;
      }
      if (!forced && sessionGet("bday-shown") === todayKey()) return;
      window.setTimeout(show, 900);
    }

    function show() {
      if (open) return;
      open = true;
      if (Favorite.isOpen()) Favorite.close();
      blown = false;
      overlay.classList.remove("is-closing", "candles-out");
      msg.textContent = "";
      btn.textContent = "许个愿，吹蜡烛";
      btn.disabled = false;
      hint.textContent = "先拆开我写给你的信，再许个愿吧 ♥";
      lastOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      app.inert = true;
      overlay.hidden = false;
      sessionSet("bday-shown", todayKey());
      Confetti.start(10000, 150);
      closeBtn.focus();
    }

    function close() {
      if (!open) return;
      open = false;
      overlay.classList.add("is-closing");
      Confetti.stop();
      window.setTimeout(function () {
        overlay.hidden = true;
        overlay.classList.remove("is-closing");
        document.body.style.overflow = lastOverflow;
        app.inert = false;
      }, 320);
    }

    function blow() {
      if (!open) return;
      if (!blown) {
        blown = true;
        overlay.classList.add("candles-out");
        msg.textContent = C.birthdayMessage || "生日快乐，新的一年也要开开心心。";
        btn.textContent = "再放一次彩带";
        hint.textContent = "愿望已经收好啦 ♥";
        Confetti.burst(120);
        Music.playBirthday();
      } else {
        Confetti.burst(90);
      }
    }

    btn.addEventListener("click", blow);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) close();
    });

    function trapFocus(event) {
      var focusable = $$("button", overlay);
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    return {
      maybeShow: maybeShow,
      show: show,
      close: close,
      trapFocus: trapFocus,
      isOpen: function () { return open; },
      isToday: isToday
    };
  })();

  /* ---------------- 计时 ---------------- */

  function renderCounters() {
    var start = parseDateOnly(C.togetherSince);
    var today = startOfDay(new Date());
    var daysEl = $("#days-together");
    var detailEl = $("#days-detail");

    if (start) {
      var diff = dayDiff(start, today);
      if (diff < 0) {
        if (daysEl) daysEl.textContent = "0";
        if (detailEl) detailEl.textContent = "纪念日还没到呀";
      } else {
        var total = diff + 1;
        var cd = calendarDiff(start, today);
        if (daysEl) daysEl.textContent = String(total);
        if (detailEl) {
          var text = "第 " + total + " 天";
          if (cd.years > 0) text += " · " + cd.years + " 年";
          if (cd.months > 0) text += " " + cd.months + " 个月";
          detailEl.textContent = text;
        }
      }
    }

  }

  /* ---------------- 暗号门 ---------------- */

  var unlocked = false;
  var failedAttempts = 0;
  var composing = false;

  function normalizePassphrase(value) {
    var text = String(value || "");
    try {
      text = text.normalize("NFKC");
    } catch (e) {}
    return text.replace(/\s+/g, "").toLowerCase();
  }

  function unlock(animate) {
    if (unlocked) return;
    unlocked = true;
    document.body.classList.remove("is-locked");
    document.body.classList.add("is-unlocked");
    app.inert = false;
    app.removeAttribute("inert");
    if (animate) {
      gate.classList.add("is-open");
      window.setTimeout(function () {
        gate.hidden = true;
      }, 950);
    } else {
      gate.hidden = true;
    }
    window.setTimeout(function () {
      Birthday.maybeShow();
    }, animate ? 1050 : 260);
  }

  function showWrong(message) {
    failedAttempts += 1;
    gateHint.textContent = message;
    gateCard.classList.remove("is-wrong");
    void gateCard.offsetWidth;
    gateCard.classList.add("is-wrong");
    gateInput.select();
  }

  function checkGate() {
    var expected = C.passphrase || "想你了";
    var value = gateInput.value;
    if (!value.trim()) {
      showWrong("暗号还没写呢～");
      return;
    }
    if (normalizePassphrase(value) === normalizePassphrase(expected)) {
      gateHint.textContent = "";
      unlock(true);
    } else if (failedAttempts + 1 >= 3) {
      showWrong(C.gateHint || "再想想我们之间的小秘密～");
    } else {
      showWrong("不对哦，再想想～");
    }
  }

  function initGate() {
    app.inert = true;
    gateForm.addEventListener("submit", function (event) {
      event.preventDefault();
      if (composing) return;
      checkGate();
    });
    gateInput.addEventListener("compositionstart", function () {
      composing = true;
    });
    gateInput.addEventListener("compositionend", function () {
      composing = false;
    });

    /* 每次打开网页都要重新说暗号，不记住解锁状态。 */
    if (window.innerWidth >= 720) {
      window.setTimeout(function () {
        if (!unlocked) gateInput.focus();
      }, 260);
    }
  }

  /* ---------------- 全局键盘 ---------------- */

  function globalKeydown(event) {
    if (Letter.isOpen()) {
      if (event.key === "Escape") {
        event.preventDefault();
        Letter.close();
      } else if (event.key === "Tab") {
        Letter.trapFocus(event);
      }
      return;
    }
    if (Birthday.isOpen()) {
      if (event.key === "Escape") {
        event.preventDefault();
        Birthday.close();
      } else if (event.key === "Tab") {
        Birthday.trapFocus(event);
      }
      return;
    }
    if (Favorite.isOpen()) {
      if (event.key === "Escape") {
        event.preventDefault();
        Favorite.close();
      } else if (event.key === "Tab") {
        Favorite.trapFocus(event);
      }
      return;
    }
    if (Lightbox.isOpen()) {
      if (event.key === "Escape") {
        event.preventDefault();
        Lightbox.close();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        Lightbox.prev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        Lightbox.next();
      } else if (event.key === "Tab") {
        Lightbox.trapFocus(event);
      }
    }
  }

  /* ---------------- 启动 ---------------- */

  function fillConfig() {
    $$('[data-name="her"]').forEach(function (node) {
      node.textContent = C.herName || "你";
    });
    $$('[data-name="my"]').forEach(function (node) {
      node.textContent = C.myName || "我";
    });
    $$('[data-config="heroQuote"]').forEach(function (node) {
      node.textContent = C.heroQuote || "";
    });
    document.title = (C.myName || "我们") + "与" + (C.herName || "你") + " · 小相册";
  }

  function init() {
    if (QUERY.get("noanim") === "1") document.body.classList.add("noanim");

    syncBirthdayTheme();
    fillConfig();
    renderCounters();
    var cachedFavorite = Store.getSync("favoritePhoto");
    if (cachedFavorite) savedFavorite = String(cachedFavorite);
    renderTimeline();

    Store.get("favoritePhoto").then(function (value) {
      if (value) {
        savedFavorite = String(value);
        applyHeroPhoto();
      }
    });

    initGate();

    document.addEventListener("keydown", globalKeydown);

    if (replayBtn) {
      replayBtn.addEventListener("click", function () {
        Birthday.show();
      });
    }

    var lastDay = todayKey();
    window.setInterval(function () {
      var nowKey = todayKey();
      if (nowKey !== lastDay) {
        lastDay = nowKey;
        syncBirthdayTheme();
        renderCounters();
        Letter.syncAvailability();
        Birthday.maybeShow();
      } else {
        renderCounters();
      }
    }, 60000);
  }

  /* 从浏览器缓存返回时也重新走一遍暗号门 */
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) window.location.reload();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
