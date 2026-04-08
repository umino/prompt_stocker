document.addEventListener('DOMContentLoaded', function () {
    // ── DOM refs ──
    const form           = document.getElementById('prompt-form');
    const promptList     = document.getElementById('prompt-list');
    const searchInput    = document.getElementById('search');
    const clearSearchBtn = document.getElementById('clear-search');
    const exportBtn      = document.getElementById('export-btn');
    const importBtn      = document.getElementById('import-btn');
    const importFile     = document.getElementById('import-file');
    const cancelBtn      = document.getElementById('cancel-btn');
    const submitBtn      = document.getElementById('submit-btn');
    const gridModeBtn    = document.getElementById('grid-mode-btn');
    const listModeBtn    = document.getElementById('list-mode-btn');
    const settingsBtn    = document.getElementById('settings-btn');
    const settingsModal  = document.getElementById('settings-modal');
    const closeModal     = document.getElementById('close-modal');
    const autoSaveChk    = document.getElementById('auto-save');
    const countBadge     = document.getElementById('count-badge');

    // ── State ──
    let prompts     = [];
    let editingId   = null;
    let displayMode = 'grid';
    let searchMode  = 'partial';   // 'partial' | 'exact'

    const STORAGE_KEY    = 'prompts_data';
    const DISPLAY_KEY    = 'display_mode';
    const AUTO_SAVE_KEY  = 'auto_save_enabled';

    // ── 検索モード切替ボタン（動的生成） ──
    const toggleModeBtn = document.createElement('button');
    toggleModeBtn.type = 'button';
    toggleModeBtn.textContent = '部分';
    toggleModeBtn.className = 'search-mode-toggle-btn';
    toggleModeBtn.title = '検索モードを切り替え';
    // search-container の先頭 (input の前) に挿入
    const searchContainer = searchInput.parentNode;
    searchContainer.insertBefore(toggleModeBtn, searchInput);

    // ── 初期読み込み ──
    loadData();

    // ═══════════════════════════════════════════
    //  イベントリスナー
    // ═══════════════════════════════════════════

    // フォーム送信
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        addOrUpdatePrompt();
    });

    // 検索
    searchInput.addEventListener('input', function () {
        clearSearchBtn.style.display = this.value ? 'flex' : 'none';
        renderPrompts();
    });

    // 検索モード切替
    toggleModeBtn.addEventListener('click', function () {
        searchMode = searchMode === 'partial' ? 'exact' : 'partial';
        toggleModeBtn.textContent = searchMode === 'partial' ? '部分' : '完全';
        toggleModeBtn.classList.toggle('exact-mode', searchMode === 'exact');
        renderPrompts();
    });

    // 検索クリア
    clearSearchBtn.addEventListener('click', function () {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        renderPrompts();
        searchInput.focus();
    });

    // キャンセル
    cancelBtn.addEventListener('click', resetForm);

    // 表示モード
    gridModeBtn.addEventListener('click', () => setDisplayMode('grid'));
    listModeBtn.addEventListener('click', () => setDisplayMode('list'));

    // 設定
    settingsBtn.addEventListener('click', openSettingsModal);
    closeModal.addEventListener('click', closeSettingsModal);
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettingsModal();
    });

    // Escape でモーダルを閉じる
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsModal.classList.contains('show')) {
            closeSettingsModal();
        }
    });

    // 自動保存
    autoSaveChk.addEventListener('change', () => {
        localStorage.setItem(AUTO_SAVE_KEY, autoSaveChk.checked);
    });

    // エクスポート / インポート
    exportBtn.addEventListener('click', exportData);
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', importData);

    // ═══════════════════════════════════════════
    //  グローバル関数（HTML inline から呼ばれる）
    // ═══════════════════════════════════════════

    window.editPrompt = function (id) {
        const p = prompts.find(x => x.id === id);
        if (!p) return;

        document.getElementById('name').value    = p.name;
        document.getElementById('comment').value = p.comment || '';
        document.getElementById('tags').value    = p.tags.join(', ');
        document.getElementById('prompt').value  = p.prompt;

        editingId = id;
        submitBtn.textContent = '更新';
        cancelBtn.style.display = 'inline-flex';

        // フォームまでスクロール
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('name').focus();
    };

    window.deletePrompt = function (id) {
        if (!confirm('このプロンプトを削除しますか？')) return;
        prompts = prompts.filter(p => p.id !== id);
        saveData();
        renderPrompts();
        showToast('🗑 削除しました');
    };

    window.copyPrompt = function (id) {
        const p = prompts.find(x => x.id === id);
        if (!p) return;
        navigator.clipboard.writeText(p.prompt)
            .then(() => showToast('✓ プロンプトをコピーしました'))
            .catch(() => showToast('コピーに失敗しました', 4000));
    };

    window.setSearchTag = function (tag) {
        searchInput.value = tag;
        clearSearchBtn.style.display = 'flex';
        // 部分一致モードにしてから検索
        if (searchMode !== 'partial') {
            searchMode = 'partial';
            toggleModeBtn.textContent = '部分';
            toggleModeBtn.classList.remove('exact-mode');
        }
        searchInput.dispatchEvent(new Event('input'));
    };

    // ═══════════════════════════════════════════
    //  Core Functions
    // ═══════════════════════════════════════════

    function addOrUpdatePrompt() {
        const name    = document.getElementById('name').value.trim();
        const comment = document.getElementById('comment').value.trim();
        const tagsRaw = document.getElementById('tags').value.trim();
        const prompt  = document.getElementById('prompt').value.trim();

        if (!name) {
            showToast('⚠ 名前は必須です', 3500); return;
        }
        if (!prompt) {
            showToast('⚠ プロンプトは必須です', 3500); return;
        }

        const tags = tagsRaw
            ? tagsRaw.split(',').map(t => t.trim()).filter(t => t.length > 0)
            : [];

        if (editingId !== null) {
            prompts = prompts.map(p =>
                p.id === editingId
                    ? { ...p, name, comment, tags, prompt }
                    : p
            );
            showToast('✓ 更新しました');
        } else {
            prompts.push({ id: Date.now(), name, comment, tags, prompt });
            showToast('✓ 追加しました');
        }

        if (isAutoSaveEnabled()) saveData();
        resetForm();
        renderPrompts();
    }

    function resetForm() {
        editingId = null;
        submitBtn.textContent = '追加';
        cancelBtn.style.display = 'none';
        form.reset();
    }

    function renderPrompts() {
        const term = searchInput.value.toLowerCase();

        const filtered = term
            ? prompts.filter(p => {
                if (searchMode === 'partial') {
                    return p.name.toLowerCase().includes(term) ||
                           p.tags.some(t => t.toLowerCase().includes(term));
                } else {
                    return p.name.toLowerCase() === term ||
                           p.tags.some(t => t.toLowerCase() === term);
                }
            })
            : prompts;

        // カウントバッジ更新
        countBadge.textContent = filtered.length;

        promptList.innerHTML = '';

        if (filtered.length === 0) {
            promptList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✦</div>
                    <p>${term ? '検索結果が見つかりません' : 'プロンプトがまだありません'}</p>
                    <p style="font-size:12px;">${term ? '別のキーワードで検索してみてください' : '上のフォームから追加できます'}</p>
                </div>`;
            return;
        }

        if (displayMode === 'list') {
            renderListMode(filtered);
        } else {
            renderGridMode(filtered);
        }
    }

    function renderGridMode(list) {
        list.forEach(p => {
            const card = document.createElement('div');
            card.className = 'prompt-card';
            card.innerHTML = `
                <h3>${escHtml(p.name)}</h3>
                ${p.comment ? `<p class="card-comment">${escHtml(p.comment)}</p>` : ''}
                <div class="tags">
                    ${p.tags.map(t => `<span class="tag" onclick="setSearchTag('${escHtml(t)}')">${escHtml(t)}</span>`).join('')}
                </div>
                <p class="prompt-text">${escHtml(p.prompt)}</p>
                <div class="actions">
                    <button class="copy"   onclick="copyPrompt(${p.id})">コピー</button>
                    <button class="edit"   onclick="editPrompt(${p.id})">編集</button>
                    <button class="delete" onclick="deletePrompt(${p.id})">削除</button>
                </div>`;
            promptList.appendChild(card);
        });
    }

    function renderListMode(list) {
        const table = document.createElement('table');
        table.className = 'prompt-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>名前</th>
                    <th>コメント</th>
                    <th>タグ</th>
                    <th>プロンプト</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
                ${list.map(p => `
                    <tr>
                        <td>${escHtml(p.name)}</td>
                        <td>${p.comment ? escHtml(p.comment) : '<span style="color:var(--text-muted)">—</span>'}</td>
                        <td>${p.tags.map(t => `<span class="tag" onclick="setSearchTag('${escHtml(t)}')">${escHtml(t)}</span>`).join('')}</td>
                        <td class="prompt-text-cell">${escHtml(p.prompt)}</td>
                        <td class="actions-cell">
                            <button class="copy"   onclick="copyPrompt(${p.id})">コピー</button>
                            <button class="edit"   onclick="editPrompt(${p.id})">編集</button>
                            <button class="delete" onclick="deletePrompt(${p.id})">削除</button>
                        </td>
                    </tr>`).join('')}
            </tbody>`;
        promptList.appendChild(table);
    }

    // ── Display mode ──
    function setDisplayMode(mode) {
        displayMode = mode;
        promptList.className = `prompt-list${mode === 'list' ? ' list-mode' : ''}`;
        gridModeBtn.classList.toggle('active', mode === 'grid');
        listModeBtn.classList.toggle('active', mode === 'list');
        localStorage.setItem(DISPLAY_KEY, mode);
        renderPrompts();
    }

    // ── Storage ──
    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    }

    function loadData() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            try { prompts = JSON.parse(raw); } catch (_) { prompts = []; }
        }

        const savedMode = localStorage.getItem(DISPLAY_KEY);
        if (savedMode === 'grid' || savedMode === 'list') displayMode = savedMode;

        const savedAutoSave = localStorage.getItem(AUTO_SAVE_KEY);
        if (savedAutoSave !== null) autoSaveChk.checked = savedAutoSave === 'true';

        setDisplayMode(displayMode);
    }

    function isAutoSaveEnabled() {
        return localStorage.getItem(AUTO_SAVE_KEY) !== 'false';
    }

    // ── Modal ──
    function openSettingsModal() {
        settingsModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function closeSettingsModal() {
        settingsModal.classList.remove('show');
        document.body.style.overflow = '';
    }

    // ── Export / Import ──
    function exportData() {
        const json = JSON.stringify(prompts, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: 'prompts_data.json' });
        a.click();
        URL.revokeObjectURL(url);
        showToast('📤 エクスポートしました');
    }

    function importData(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if (Array.isArray(data)) {
                    prompts = data;
                    saveData();
                    renderPrompts();
                    showToast(`📥 ${data.length} 件インポートしました`);
                    closeSettingsModal();
                } else {
                    showToast('⚠ 無効なファイル形式です', 4000);
                }
            } catch (_) {
                showToast('⚠ ファイルの読み込みに失敗しました', 4000);
            }
        };
        reader.readAsText(file);
        importFile.value = '';
    }

    // ── Toast ──
    function showToast(message, duration = 2800) {
        const toast = document.getElementById('toast');
        toast.querySelector('.toast-message').textContent = message;
        toast.classList.remove('show');
        // Force reflow for re-animation
        void toast.offsetWidth;
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('show'), duration);
    }

    // ── Utility ──
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
});
