/**
 * C10H (Skyworth SK-L1001) Touchscreen & Kiosk Web Suite
 * - Modular options: Virtual Keyboard, Browser Navigation Bar, Kinetic Touch Scroll
 * - Chinese Pinyin & Xiaohe Shuangpin (小鹤双拼)
 * - Settings Modal for runtime customization
 */
(function() {
  if (window.__c10h_suite_injected) return;
  window.__c10h_suite_injected = true;

  // 1. Load Configuration
  const CFG = Object.assign({
    enableKeyboard: 1,
    enableNav: 1,
    enableTouchScroll: 1,
    defaultInputMode: "xiaohe"
  }, window.__C10H_CONFIG || {});

  const getBoolOpt = (key, defaultVal) => {
    const val = localStorage.getItem(key);
    if (val !== null) return val === "true";
    return defaultVal !== 0 && defaultVal !== false;
  };

  const optKeyboard = getBoolOpt("c10h_enable_keyboard", CFG.enableKeyboard);
  const optNav = getBoolOpt("c10h_enable_nav", CFG.enableNav);
  const optTouchScroll = getBoolOpt("c10h_enable_touch_scroll", CFG.enableTouchScroll);
  let inputMode = localStorage.getItem("c10h_input_mode") || CFG.defaultInputMode || "xiaohe";

  const DICT = window.PINYIN_DICT || {};

  // Xiaohe Shuangpin Mapping Tables
  const XIAOHE_INITIALS = {
    'b': 'b', 'c': 'c', 'd': 'd', 'f': 'f', 'g': 'g', 'h': 'h',
    'j': 'j', 'k': 'k', 'l': 'l', 'm': 'm', 'n': 'n', 'p': 'p',
    'q': 'q', 'r': 'r', 's': 's', 't': 't', 'w': 'w', 'x': 'x',
    'y': 'y', 'z': 'z', 'v': 'zh', 'i': 'ch', 'u': 'sh'
  };

  const XIAOHE_ZERO = {
    'aa': 'a', 'ai': 'ai', 'aj': 'an', 'ah': 'ang', 'ac': 'ao',
    'ee': 'e', 'ew': 'ei', 'ef': 'en', 'eg': 'eng', 'er': 'er',
    'oo': 'o', 'ou': 'ou'
  };

  const XIAOHE_HINTS = {
    'q': 'iu', 'w': 'ei', 'e': 'e', 'r': 'uan', 't': 'ue', 'y': 'un', 'u': 'sh', 'i': 'ch', 'o': 'uo', 'p': 'ie',
    'a': 'a', 's': 'ong', 'd': 'ai', 'f': 'en', 'g': 'eng', 'h': 'ang', 'j': 'an', 'k': 'ing', 'l': 'uang',
    'z': 'ou', 'x': 'ua', 'c': 'ao', 'v': 'zh/ui', 'b': 'in', 'n': 'iao', 'm': 'ian'
  };

  function decodeXiaohe(sh) {
    if (sh.length < 2) return sh;
    const pair = sh.slice(0, 2).toLowerCase();
    if (XIAOHE_ZERO[pair]) return XIAOHE_ZERO[pair];

    const sKey = pair[0];
    const yKey = pair[1];
    const s = XIAOHE_INITIALS[sKey] || sKey;

    let y = "";
    if (yKey === 'q') y = 'iu';
    else if (yKey === 'w') y = 'ei';
    else if (yKey === 'e') y = 'e';
    else if (yKey === 'r') y = ['j', 'q', 'x', 'y'].includes(s) ? 'van' : 'uan';
    else if (yKey === 't') y = ['j', 'q', 'x', 'y', 'n', 'l'].includes(s) ? 'ue' : 'ue';
    else if (yKey === 'y') y = 'un';
    else if (yKey === 'u') y = 'u';
    else if (yKey === 'i') y = 'i';
    else if (yKey === 'o') y = 'uo';
    else if (yKey === 'p') y = 'ie';
    else if (yKey === 'a') y = 'a';
    else if (yKey === 's') y = ['j', 'q', 'x', 'y'].includes(s) ? 'iong' : 'ong';
    else if (yKey === 'd') y = 'ai';
    else if (yKey === 'f') y = 'en';
    else if (yKey === 'g') y = 'eng';
    else if (yKey === 'h') y = 'ang';
    else if (yKey === 'j') y = 'an';
    else if (yKey === 'k') y = ['g', 'k', 'h', 'zh', 'ch', 'sh'].includes(s) ? 'uai' : 'ing';
    else if (yKey === 'l') y = ['j', 'q', 'x', 'n', 'l', 'y'].includes(s) ? 'iang' : 'uang';
    else if (yKey === 'z') y = 'ou';
    else if (yKey === 'x') y = ['j', 'q', 'x', 'd', 'l'].includes(s) ? 'ia' : 'ua';
    else if (yKey === 'c') y = 'ao';
    else if (yKey === 'v') y = ['j', 'q', 'x', 'y', 'n', 'l'].includes(s) ? 'v' : 'ui';
    else if (yKey === 'b') y = 'in';
    else if (yKey === 'n') y = 'iao';
    else if (yKey === 'm') y = 'ian';

    let res = s + y;
    if (['j', 'q', 'x'].includes(s) && y === 'u') res = s + 'u';
    if (['j', 'q', 'x'].includes(s) && y === 'ue') res = s + 'ue';
    return res;
  }

  // -------------------------------------------------------------
  // Settings Modal Dialog
  // -------------------------------------------------------------
  const modalOverlay = document.createElement("div");
  modalOverlay.id = "c10h-settings-overlay";
  modalOverlay.innerHTML = `
    <div id="c10h-settings-dialog">
      <div class="c10h-dialog-header">
        <span class="c10h-dialog-title">⚙ C10H 屏幕与交互选项</span>
        <button class="c10h-dialog-close" id="c10h-cfg-close">✕</button>
      </div>
      <div class="c10h-dialog-body">
        <div class="c10h-form-group">
          <label class="c10h-checkbox-label">
            <input type="checkbox" id="cfg-chk-keyboard" ${optKeyboard ? 'checked' : ''}>
            <span>启用触控虚拟键盘 (Virtual Keyboard)</span>
          </label>
          <div class="c10h-desc">点击输入框自动升起键盘，支持中文拼音与候选词。</div>
        </div>

        <div class="c10h-form-group">
          <label class="c10h-checkbox-label">
            <input type="checkbox" id="cfg-chk-nav" ${optNav ? 'checked' : ''}>
            <span>启用顶部网址导航条 (Browser Navigation Bar)</span>
          </label>
          <div class="c10h-desc">顶部轻触展开导航条，支持网页前进、后退、刷新及网址输入。</div>
        </div>

        <div class="c10h-form-group">
          <label class="c10h-checkbox-label">
            <input type="checkbox" id="cfg-chk-scroll" ${optTouchScroll ? 'checked' : ''}>
            <span>启用触屏拖拽滑动 (Kinetic Touch Scroll)</span>
          </label>
          <div class="c10h-desc">在任意页面区域按住滑动即可流畅滚动网页。</div>
        </div>

        <div class="c10h-form-group">
          <div class="c10h-section-title">默认中文输入模式</div>
          <div class="c10h-radio-group">
            <label class="c10h-radio-label">
              <input type="radio" name="cfg-input-mode" value="xiaohe" ${inputMode === 'xiaohe' ? 'checked' : ''}>
              <span>小鹤双拼 (高效两键打字)</span>
            </label>
            <label class="c10h-radio-label">
              <input type="radio" name="cfg-input-mode" value="quanpin" ${inputMode === 'quanpin' ? 'checked' : ''}>
              <span>全拼</span>
            </label>
          </div>
        </div>

        <div class="c10h-tip-box">
          提示：以上选项支持在网页即时调整，也可在终端执行 <code>c10h-kiosk-ctl</code> 或修改 <code>/etc/c10h-kiosk.env</code> 永久配置。
        </div>
      </div>
      <div class="c10h-dialog-footer">
        <button class="c10h-btn" id="c10h-cfg-reset">恢复系统默认</button>
        <button class="c10h-btn c10h-btn-primary" id="c10h-cfg-save">保存并生效</button>
      </div>
    </div>
  `;

  function openSettingsModal() {
    modalOverlay.classList.add("visible");
  }

  function closeSettingsModal() {
    modalOverlay.classList.remove("visible");
  }

  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) closeSettingsModal();
  });

  const setupModalEvents = () => {
    const btnClose = modalOverlay.querySelector("#c10h-cfg-close");
    const btnSave = modalOverlay.querySelector("#c10h-cfg-save");
    const btnReset = modalOverlay.querySelector("#c10h-cfg-reset");

    if (btnClose) btnClose.onclick = closeSettingsModal;

    if (btnSave) {
      btnSave.onclick = () => {
        const chkKeyboard = modalOverlay.querySelector("#cfg-chk-keyboard").checked;
        const chkNav = modalOverlay.querySelector("#cfg-chk-nav").checked;
        const chkScroll = modalOverlay.querySelector("#cfg-chk-scroll").checked;
        const selectedMode = modalOverlay.querySelector("input[name='cfg-input-mode']:checked")?.value || "xiaohe";

        localStorage.setItem("c10h_enable_keyboard", chkKeyboard);
        localStorage.setItem("c10h_enable_nav", chkNav);
        localStorage.setItem("c10h_enable_touch_scroll", chkScroll);
        localStorage.setItem("c10h_input_mode", selectedMode);

        closeSettingsModal();
        window.location.reload();
      };
    }

    if (btnReset) {
      btnReset.onclick = () => {
        localStorage.removeItem("c10h_enable_keyboard");
        localStorage.removeItem("c10h_enable_nav");
        localStorage.removeItem("c10h_enable_touch_scroll");
        localStorage.removeItem("c10h_input_mode");
        closeSettingsModal();
        window.location.reload();
      };
    }
  };

  // -------------------------------------------------------------
  // 2. Kinetic Touch Drag-to-Scroll (if enabled)
  // -------------------------------------------------------------
  if (optTouchScroll) {
    let isDragging = false;
    let startX = 0, startY = 0;
    let scrollTarget = null;
    let moved = false;

    function findScrollableParent(el) {
      while (el && el !== document.body && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        const ovY = style.overflowY;
        const ovX = style.overflowX;
        if (
          (ovY === 'auto' || ovY === 'scroll') && el.scrollHeight > el.clientHeight ||
          (ovX === 'auto' || ovX === 'scroll') && el.scrollWidth > el.clientWidth
        ) {
          return el;
        }
        el = el.parentElement;
      }
      return window;
    }

    window.addEventListener('mousedown', (e) => {
      if (
        (modalOverlay && modalOverlay.contains(e.target)) ||
        e.target.closest('#fnos-virtual-keyboard') ||
        e.target.closest('#fnos-kb-toggle-btn') ||
        e.target.closest('#fnos-top-nav-bar') ||
        e.target.closest('#c10h-minimal-settings-btn') ||
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        return;
      }
      isDragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      scrollTarget = findScrollableParent(e.target);
    }, { passive: true });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        moved = true;
      }

      if (moved) {
        if (scrollTarget === window) {
          window.scrollBy(-dx, -dy);
        } else if (scrollTarget && typeof scrollTarget.scrollBy === 'function') {
          scrollTarget.scrollBy(-dx, -dy);
        }
        startX = e.clientX;
        startY = e.clientY;
      }
    }, { passive: true });

    window.addEventListener('mouseup', (e) => {
      if (isDragging && moved) {
        e.preventDefault();
        e.stopPropagation();
      }
      isDragging = false;
      moved = false;
      scrollTarget = null;
    }, true);
  }

  // -------------------------------------------------------------
  // 3. Virtual Touch Keyboard (if enabled)
  // -------------------------------------------------------------
  let activeInput = null;
  let isShift = false;
  let isSymbols = false;
  let isChinese = true;
  let pinyinBuffer = "";

  const LAYOUT_LOWER = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["Shift", "z", "x", "c", "v", "b", "n", "m", "⌫"],
    ["?123", "中/En", "Space", "Enter", "⚙", "⌨"]
  ];

  const LAYOUT_UPPER = [
    ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Shift", "Z", "X", "C", "V", "B", "N", "M", "⌫"],
    ["?123", "中/En", "Space", "Enter", "⚙", "⌨"]
  ];

  const LAYOUT_SYMBOLS = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["~", "`", "@", "#", "$", "%", "^", "&", "*", "-"],
    ["+", "=", "{", "}", "[", "]", ":", ";", "\"", "'"],
    ["ABC", "<", ">", ",", ".", "?", "/", "\\", "|", "⌫"],
    ["ABC", "中/En", "Space", "Enter", "⚙", "⌨"]
  ];

  const kbContainer = document.createElement("div");
  kbContainer.id = "fnos-virtual-keyboard";

  const candidateBar = document.createElement("div");
  candidateBar.id = "vk-candidate-bar";

  const modeBadge = document.createElement("span");
  modeBadge.id = "vk-mode-badge";
  modeBadge.title = "点击切换 小鹤双拼 / 全拼";

  const pinyinLabel = document.createElement("span");
  pinyinLabel.id = "vk-pinyin-buffer";

  const candidateList = document.createElement("div");
  candidateList.id = "vk-candidate-list";

  const kbSettingsBtn = document.createElement("span");
  kbSettingsBtn.id = "vk-settings-btn";
  kbSettingsBtn.textContent = "⚙ 设置";
  kbSettingsBtn.title = "打开副屏与交互选项";
  kbSettingsBtn.onclick = (e) => {
    e.stopPropagation();
    openSettingsModal();
  };

  candidateBar.appendChild(modeBadge);
  candidateBar.appendChild(pinyinLabel);
  candidateBar.appendChild(candidateList);
  candidateBar.appendChild(kbSettingsBtn);

  const keysContainer = document.createElement("div");
  keysContainer.id = "vk-keys-container";

  kbContainer.appendChild(candidateBar);
  kbContainer.appendChild(keysContainer);

  modeBadge.addEventListener("click", (e) => {
    e.stopPropagation();
    inputMode = (inputMode === "xiaohe") ? "quanpin" : "xiaohe";
    localStorage.setItem("c10h_input_mode", inputMode);
    pinyinBuffer = "";
    updateCandidateBar();
    renderKeyboard();
  });

  const toggleBtn = document.createElement("div");
  toggleBtn.id = "fnos-kb-toggle-btn";
  toggleBtn.textContent = "⌨";

  kbContainer.addEventListener("mousedown", (e) => e.preventDefault());
  kbContainer.addEventListener("touchstart", (e) => e.preventDefault());
  toggleBtn.addEventListener("mousedown", (e) => e.preventDefault());
  toggleBtn.addEventListener("touchstart", (e) => e.preventDefault());

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (kbContainer.classList.contains("vk-visible")) {
      hideKeyboard();
    } else {
      if (!activeInput) {
        activeInput = document.querySelector('input[type="text"], input[type="password"], textarea') || document.activeElement;
      }
      showKeyboard(activeInput);
    }
  });

  function updateCandidateBar() {
    modeBadge.textContent = isChinese ? (inputMode === "xiaohe" ? "小鹤双拼" : "全拼") : "英文";

    if (!pinyinBuffer) {
      pinyinLabel.textContent = "";
      candidateList.innerHTML = `<span style="color:#6b7280;font-size:14px;line-height:36px;">点击按键输入拼音，空格选字</span>`;
      return;
    }

    let searchPy = pinyinBuffer.toLowerCase();
    if (inputMode === "xiaohe" && pinyinBuffer.length >= 2) {
      searchPy = decodeXiaohe(pinyinBuffer);
    }

    pinyinLabel.textContent = (inputMode === "xiaohe" && pinyinBuffer.length >= 2) 
      ? `${pinyinBuffer} (${searchPy})|` 
      : `${pinyinBuffer}|`;
    candidateList.innerHTML = "";

    const candidates = DICT[searchPy] || [];
    if (candidates.length === 0) {
      for (const py in DICT) {
        if (py.startsWith(searchPy)) {
          for (const c of DICT[py]) {
            if (!candidates.includes(c)) candidates.push(c);
            if (candidates.length >= 8) break;
          }
        }
        if (candidates.length >= 8) break;
      }
    }

    if (candidates.length === 0) {
      candidates.push(pinyinBuffer);
    }

    candidates.forEach((cand, idx) => {
      const item = document.createElement("div");
      item.className = "vk-candidate-item";
      item.textContent = `${idx + 1}.${cand}`;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        insertText(cand);
        pinyinBuffer = "";
        updateCandidateBar();
      });
      candidateList.appendChild(item);
    });
  }

  function renderKeyboard() {
    keysContainer.innerHTML = "";
    let layout;
    if (isSymbols) layout = LAYOUT_SYMBOLS;
    else if (isShift) layout = LAYOUT_UPPER;
    else layout = LAYOUT_LOWER;

    layout.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "vk-row";

      row.forEach((keyText) => {
        const keyEl = document.createElement("div");
        keyEl.className = "vk-key";

        if (keyText === "Shift") {
          keyEl.classList.add("vk-key-special", "vk-key-shift");
          keyEl.textContent = "⇧";
          if (isShift) keyEl.classList.add("vk-shift-active");
        } else if (keyText === "⌫") {
          keyEl.classList.add("vk-key-special", "vk-key-backspace");
          keyEl.textContent = "⌫";
        } else if (keyText === "Enter") {
          keyEl.classList.add("vk-key-special", "vk-key-enter");
          keyEl.textContent = "Enter";
        } else if (keyText === "Space") {
          keyEl.classList.add("vk-key-space");
          keyEl.textContent = isChinese ? "空格 / 选字" : "Space";
        } else if (keyText === "中/En") {
          keyEl.classList.add("vk-key-special", "vk-key-mode");
          keyEl.textContent = isChinese ? (inputMode === "xiaohe" ? "鹤" : "中") : "En";
          keyEl.style.background = isChinese ? "#1e3a8a" : "#374151";
          keyEl.style.color = isChinese ? "#93c5fd" : "#f3f4f6";
        } else if (keyText === "?123" || keyText === "ABC") {
          keyEl.classList.add("vk-key-special");
          keyEl.textContent = keyText;
        } else if (keyText === "⚙") {
          keyEl.classList.add("vk-key-special");
          keyEl.textContent = "⚙";
          keyEl.title = "设置";
        } else if (keyText === "⌨") {
          keyEl.classList.add("vk-key-special", "vk-key-hide");
          keyEl.textContent = "⌨";
        } else {
          keyEl.textContent = keyText;
          if (isChinese && !isSymbols && inputMode === "xiaohe" && XIAOHE_HINTS[keyText.toLowerCase()]) {
            const sub = document.createElement("span");
            sub.className = "vk-sub-text";
            sub.textContent = XIAOHE_HINTS[keyText.toLowerCase()];
            keyEl.appendChild(sub);
          }
        }

        keyEl.addEventListener("click", (e) => {
          e.stopPropagation();
          handleKeyPress(keyText);
        });

        rowEl.appendChild(keyEl);
      });

      keysContainer.appendChild(rowEl);
    });
  }

  function insertText(text) {
    if (!activeInput) return;
    let val = activeInput.value || "";
    let start = activeInput.selectionStart ?? val.length;
    let end = activeInput.selectionEnd ?? val.length;

    let newVal = val.slice(0, start) + text + val.slice(end);
    let newPos = start + text.length;

    const proto = activeInput.tagName === "TEXTAREA" 
      ? window.HTMLTextAreaElement.prototype 
      : window.HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) {
      desc.set.call(activeInput, newVal);
    } else {
      activeInput.value = newVal;
    }

    activeInput.dispatchEvent(new Event("input", { bubbles: true }));
    activeInput.dispatchEvent(new Event("change", { bubbles: true }));

    try {
      activeInput.setSelectionRange(newPos, newPos);
    } catch (_) {}
  }

  function handleKeyPress(key) {
    if (key === "Shift") {
      isShift = !isShift;
      renderKeyboard();
      return;
    }

    if (key === "中/En") {
      isChinese = !isChinese;
      if (!isChinese && pinyinBuffer) {
        insertText(pinyinBuffer);
        pinyinBuffer = "";
      }
      updateCandidateBar();
      renderKeyboard();
      return;
    }

    if (key === "?123") {
      isSymbols = true;
      renderKeyboard();
      return;
    }

    if (key === "ABC") {
      isSymbols = false;
      isShift = false;
      renderKeyboard();
      return;
    }

    if (key === "⚙") {
      openSettingsModal();
      return;
    }

    if (key === "⌨") {
      hideKeyboard();
      return;
    }

    if (key === "Enter") {
      if (pinyinBuffer) {
        insertText(pinyinBuffer);
        pinyinBuffer = "";
        updateCandidateBar();
        return;
      }
      if (activeInput) {
        const enterDown = new KeyboardEvent("keydown", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true
        });
        activeInput.dispatchEvent(enterDown);
        const enterUp = new KeyboardEvent("keyup", {
          key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true
        });
        activeInput.dispatchEvent(enterUp);
        if (activeInput.form) {
          activeInput.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        }
      }
      return;
    }

    if (key === "⌫") {
      if (pinyinBuffer) {
        pinyinBuffer = pinyinBuffer.slice(0, -1);
        updateCandidateBar();
        return;
      }
      if (!activeInput) return;
      let val = activeInput.value || "";
      let start = activeInput.selectionStart ?? val.length;
      let end = activeInput.selectionEnd ?? val.length;
      if (start === end) {
        if (start > 0) {
          let newVal = val.slice(0, start - 1) + val.slice(start);
          let newPos = start - 1;
          const proto = activeInput.tagName === "TEXTAREA" 
            ? window.HTMLTextAreaElement.prototype 
            : window.HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, "value");
          if (desc && desc.set) desc.set.call(activeInput, newVal);
          else activeInput.value = newVal;
          activeInput.dispatchEvent(new Event("input", { bubbles: true }));
          activeInput.dispatchEvent(new Event("change", { bubbles: true }));
          try { activeInput.setSelectionRange(newPos, newPos); } catch (_) {}
        }
      } else {
        let newVal = val.slice(0, start) + val.slice(end);
        let newPos = start;
        const proto = activeInput.tagName === "TEXTAREA" 
          ? window.HTMLTextAreaElement.prototype 
          : window.HTMLInputElement.prototype;
        const desc = Object.getOwnPropertyDescriptor(proto, "value");
        if (desc && desc.set) desc.set.call(activeInput, newVal);
        else activeInput.value = newVal;
        activeInput.dispatchEvent(new Event("input", { bubbles: true }));
        activeInput.dispatchEvent(new Event("change", { bubbles: true }));
        try { activeInput.setSelectionRange(newPos, newPos); } catch (_) {}
      }
      return;
    }

    if (isChinese && !isSymbols && /^[a-z]$/i.test(key)) {
      pinyinBuffer += key.toLowerCase();
      updateCandidateBar();
      return;
    }

    if (key === "Space") {
      if (pinyinBuffer) {
        let searchPy = pinyinBuffer.toLowerCase();
        if (inputMode === "xiaohe" && pinyinBuffer.length >= 2) {
          searchPy = decodeXiaohe(pinyinBuffer);
        }
        const candidates = DICT[searchPy] || [];
        if (candidates.length > 0) {
          insertText(candidates[0]);
        } else {
          insertText(pinyinBuffer);
        }
        pinyinBuffer = "";
        updateCandidateBar();
        return;
      }
      insertText(" ");
      return;
    }

    insertText(key);
    if (isShift) {
      isShift = false;
      renderKeyboard();
    }
  }

  function showKeyboard(inputEl) {
    if (!optKeyboard) return;
    activeInput = inputEl;
    pinyinBuffer = "";
    updateCandidateBar();
    renderKeyboard();
    kbContainer.classList.add("vk-visible");
    toggleBtn.style.display = "none";
    
    setTimeout(() => {
      if (activeInput && typeof activeInput.scrollIntoView === 'function') {
        activeInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
  }

  function hideKeyboard() {
    kbContainer.classList.remove("vk-visible");
    pinyinBuffer = "";
    updateCandidateBar();
    if (optKeyboard) {
      toggleBtn.style.display = "flex";
    }
  }

  if (optKeyboard) {
    document.addEventListener("focusin", (e) => {
      const target = e.target;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        const type = (target.getAttribute("type") || "text").toLowerCase();
        if (["checkbox", "radio", "submit", "button", "file", "range", "color"].includes(type)) {
          return;
        }
        showKeyboard(target);
      }
    });

    document.addEventListener("click", (e) => {
      if (
        kbContainer.classList.contains("vk-visible") &&
        !kbContainer.contains(e.target) &&
        e.target !== toggleBtn &&
        e.target !== activeInput &&
        !(activeInput && activeInput.contains(e.target))
      ) {
        hideKeyboard();
      }
    });
  }

  // -------------------------------------------------------------
  // 4. Top Floating Browser Navigation Bar (if enabled)
  // -------------------------------------------------------------
  const navBar = document.createElement("div");
  navBar.id = "fnos-top-nav-bar";

  if (optNav) {
    const btnBack = document.createElement("button");
    btnBack.className = "nav-btn";
    btnBack.textContent = "⬅ 后退";
    btnBack.onclick = () => window.history.back();

    const btnForward = document.createElement("button");
    btnForward.className = "nav-btn";
    btnForward.textContent = "➡ 前进";
    btnForward.onclick = () => window.history.forward();

    const btnReload = document.createElement("button");
    btnReload.className = "nav-btn";
    btnReload.textContent = "🔄 刷新";
    btnReload.onclick = () => window.location.reload();

    const btnHome = document.createElement("button");
    btnHome.className = "nav-btn nav-btn-home";
    btnHome.textContent = "🏠 飞牛桌面";
    btnHome.onclick = () => { window.location.href = "http://127.0.0.1:5666"; };

    const urlInput = document.createElement("input");
    urlInput.id = "nav-url-input";
    urlInput.type = "text";
    urlInput.placeholder = "输入网址前往 (如 www.baidu.com 或 192.168.5.1)";
    urlInput.value = window.location.href;

    function navigateTo(url) {
      if (!url) return;
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "http://" + url;
      }
      window.location.href = url;
    }

    urlInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        navigateTo(urlInput.value.trim());
      }
    });

    const btnGo = document.createElement("button");
    btnGo.className = "nav-btn nav-btn-home";
    btnGo.textContent = "前往";
    btnGo.onclick = () => navigateTo(urlInput.value.trim());

    const btnSettings = document.createElement("button");
    btnSettings.className = "nav-btn";
    btnSettings.textContent = "⚙ 设置";
    btnSettings.onclick = (e) => {
      e.stopPropagation();
      openSettingsModal();
    };

    const navHandle = document.createElement("div");
    navHandle.id = "nav-handle";
    navHandle.textContent = "🌐 网址导航";
    navHandle.onclick = (e) => {
      e.stopPropagation();
      navBar.classList.toggle("nav-expanded");
    };

    navBar.appendChild(btnBack);
    navBar.appendChild(btnForward);
    navBar.appendChild(btnReload);
    navBar.appendChild(btnHome);
    navBar.appendChild(urlInput);
    navBar.appendChild(btnGo);
    navBar.appendChild(btnSettings);
    navBar.appendChild(navHandle);
  }

  // -------------------------------------------------------------
  // 5. Fallback minimal settings gear (if both nav and keyboard are disabled)
  // -------------------------------------------------------------
  let minimalGear = null;
  if (!optNav && !optKeyboard) {
    minimalGear = document.createElement("div");
    minimalGear.id = "c10h-minimal-settings-btn";
    minimalGear.textContent = "⚙";
    minimalGear.title = "打开副屏设置";
    minimalGear.onclick = openSettingsModal;
  }

  // -------------------------------------------------------------
  // 6. DOM Attachment
  // -------------------------------------------------------------
  function attach() {
    if (document.body) {
      if (!document.getElementById("c10h-settings-overlay")) {
        document.body.appendChild(modalOverlay);
        setupModalEvents();
      }

      if (optKeyboard) {
        if (!document.getElementById("fnos-virtual-keyboard")) {
          document.body.appendChild(kbContainer);
          renderKeyboard();
          updateCandidateBar();
        }
        if (!document.getElementById("fnos-kb-toggle-btn")) {
          document.body.appendChild(toggleBtn);
        }
      }

      if (optNav) {
        if (!document.getElementById("fnos-top-nav-bar")) {
          document.body.appendChild(navBar);
        }
      }

      if (minimalGear && !document.getElementById("c10h-minimal-settings-btn")) {
        document.body.appendChild(minimalGear);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
})();
