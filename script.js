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
    const bulkCopyBtn    = document.getElementById('bulk-copy-btn');
    const sortSelect     = document.getElementById('sort-order');
    const saveBtn        = document.getElementById('save-btn');
    const fileLinkGroup  = document.getElementById('file-link-group');
    const fileLinkBtn    = document.getElementById('file-link-btn');
    const fileUnlinkBtn  = document.getElementById('file-unlink-btn');
    const fileLinkStatus = document.getElementById('file-link-status');
    const favoritesChips = document.getElementById('favorites-chips');
    const favoritesAddForm = document.getElementById('favorites-add-form');
    const favoriteInput  = document.getElementById('favorite-input');
    const allTagsList    = document.getElementById('all-tags-list');

    // ── State ──
    let prompts     = [];
    let editingId   = null;
    let displayMode = 'grid';
    let searchMode  = 'partial';      // 'partial' | 'exact'
    let sortOrder   = 'updated_desc'; // updated_desc | created_desc | created_asc | name_asc
    let dirty       = false;          // 未保存の変更があるか（自動保存OFF時に使用）
    let fileHandle  = null;           // File System Access API のハンドル
    let favoriteTags    = [];         // お気に入りタグ一覧（永続化）
    let activeFavorites = new Set();  // 現在 ON のお気に入りタグ（セッション内）

    const STORAGE_KEY   = 'prompts_data';
    const DISPLAY_KEY   = 'display_mode';
    const AUTO_SAVE_KEY = 'auto_save_enabled';
    const SORT_KEY      = 'sort_order';
    const FAVORITES_KEY = 'favorite_tags';

    const fsSupported = (typeof window.showSaveFilePicker === 'function');

    // ── 検索モード切替ボタン（動的生成） ──
    const toggleModeBtn = document.createElement('button');
    toggleModeBtn.type = 'button';
    toggleModeBtn.textContent = '部分';
    toggleModeBtn.className = 'search-mode-toggle-btn';
    toggleModeBtn.title = '検索モードを切り替え';
    const searchContainer = searchInput.parentNode;
    searchContainer.insertBefore(toggleModeBtn, searchInput);

    // ── 初期読み込み ──
    loadData();
    restoreFileLink();

    // ═══════════════════════════════════════════
    //  イベントリスナー
    // ═══════════════════════════════════════════

    // フォーム送信
    form.addEventListener('submit', function (e) {
        e.preventDefault();
        addOrUpdatePrompt();
    });

    // 検索（デバウンス）
    let searchTimer;
    searchInput.addEventListener('input', function () {
        clearSearchBtn.style.display = this.value ? 'flex' : 'none';
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderPrompts, 150);
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

    // 並び替え
    sortSelect.addEventListener('change', function () {
        sortOrder = sortSelect.value;
        localStorage.setItem(SORT_KEY, sortOrder);
        renderPrompts();
    });

    // お気に入り追加
    favoritesAddForm.addEventListener('submit', function (e) {
        e.preventDefault();
        addFavorite(favoriteInput.value);
    });

    // お気に入りチップ（トグル / 削除）の委譲
    favoritesChips.addEventListener('click', function (e) {
        const toggleEl = e.target.closest('[data-fav-toggle]');
        if (toggleEl) { toggleFavorite(toggleEl.dataset.favToggle); return; }
        const removeEl = e.target.closest('[data-fav-remove]');
        if (removeEl) { removeFavorite(removeEl.dataset.favRemove); }
    });

    // キャンセル
    cancelBtn.addEventListener('click', resetForm);

    // 一括コピー
    bulkCopyBtn.addEventListener('click', bulkCopyPrompts);

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

    // 自動保存トグル
    autoSaveChk.addEventListener('change', () => {
        localStorage.setItem(AUTO_SAVE_KEY, autoSaveChk.checked);
        // OFF→ON に切り替えた際、未保存があれば即保存
        if (autoSaveChk.checked && dirty) saveData();
        updateSaveButton();
    });

    // 手動保存
    saveBtn.addEventListener('click', () => {
        saveData();
        showToast('💾 保存しました');
    });

    // エクスポート / インポート
    exportBtn.addEventListener('click', exportData);
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', importData);

    // ファイル連携
    if (fsSupported) {
        fileLinkBtn.addEventListener('click', linkFile);
        fileUnlinkBtn.addEventListener('click', unlinkFile);
    } else if (fileLinkGroup) {
        fileLinkGroup.style.display = 'none';
    }

    // 未保存のまま離脱しようとしたら警告
    window.addEventListener('beforeunload', (e) => {
        if (dirty && !isAutoSaveEnabled()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // 一覧のクリックを委譲で処理（インライン onclick を廃止＝XSS対策）
    promptList.addEventListener('click', function (e) {
        const tagEl = e.target.closest('.tag');
        if (tagEl && promptList.contains(tagEl)) {
            setSearchTag(tagEl.dataset.tag);
            return;
        }
        const actionEl = e.target.closest('[data-action]');
        if (!actionEl) return;
        const row = actionEl.closest('[data-id]');
        if (!row) return;
        const id = row.dataset.id;
        switch (actionEl.dataset.action) {
            case 'copy':   copyPrompt(id);   break;
            case 'edit':   editPrompt(id);   break;
            case 'delete': deletePrompt(id); break;
        }
    });

    // ═══════════════════════════════════════════
    //  Record actions
    // ═══════════════════════════════════════════

    function editPrompt(id) {
        const p = prompts.find(x => x.id === id);
        if (!p) return;

        document.getElementById('name').value    = p.name;
        document.getElementById('comment').value = p.comment || '';
        document.getElementById('tags').value    = p.tags.join(', ');
        document.getElementById('prompt').value  = p.prompt;

        editingId = id;
        submitBtn.textContent = '更新';
        cancelBtn.style.display = 'inline-flex';

        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.getElementById('name').focus();
    }

    function deletePrompt(id) {
        if (!confirm('このプロンプトを削除しますか？')) return;
        prompts = prompts.filter(p => p.id !== id);
        persist();
        renderPrompts();
        showToast('🗑 削除しました');
    }

    function copyPrompt(id) {
        const p = prompts.find(x => x.id === id);
        if (!p) return;
        navigator.clipboard.writeText(p.prompt)
            .then(() => showToast('✓ プロンプトをコピーしました'))
            .catch(() => showToast('コピーに失敗しました', 4000));
    }

    function setSearchTag(tag) {
        searchInput.value = tag;
        clearSearchBtn.style.display = 'flex';
        // 部分一致モードにしてから検索
        if (searchMode !== 'partial') {
            searchMode = 'partial';
            toggleModeBtn.textContent = '部分';
            toggleModeBtn.classList.remove('exact-mode');
        }
        renderPrompts();
    }

    // ── 一括コピー ──
    function bulkCopyPrompts() {
        const filtered = getFiltered();

        if (filtered.length === 0) {
            showToast('⚠ コピー対象がありません', 2500);
            return;
        }

        // 各プロンプトの改行を除去して1行化、改行で結合
        const text = sortList(filtered)
            .map(p => p.prompt.replace(/[\r\n]+/g, ' ').trim())
            .join('\n');

        navigator.clipboard.writeText(text)
            .then(() => {
                showToast(`✓ ${filtered.length} 件のプロンプトをコピーしました`);
                bulkCopyBtn.classList.add('copied');
                bulkCopyBtn.querySelector('.bulk-copy-label').textContent = `${filtered.length} 件コピー完了`;
                clearTimeout(bulkCopyBtn._timer);
                bulkCopyBtn._timer = setTimeout(() => {
                    bulkCopyBtn.classList.remove('copied');
                    bulkCopyBtn.querySelector('.bulk-copy-label').textContent = '一括コピー';
                }, 2500);
            })
            .catch(() => showToast('⚠ コピーに失敗しました', 3500));
    }

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

        // タグ：前後空白除去・空要素除去・重複除去
        const tags = tagsRaw
            ? [...new Set(tagsRaw.split(',').map(t => t.trim()).filter(t => t.length > 0))]
            : [];

        const now = Date.now();

        if (editingId !== null) {
            prompts = prompts.map(p =>
                p.id === editingId
                    ? { ...p, name, comment, tags, prompt, updatedAt: now }
                    : p
            );
            showToast('✓ 更新しました');
        } else {
            prompts.push({ id: genId(), name, comment, tags, prompt, createdAt: now, updatedAt: now });
            showToast('✓ 追加しました');
        }

        persist();
        resetForm();
        renderPrompts();
    }

    function resetForm() {
        editingId = null;
        submitBtn.textContent = '追加';
        cancelBtn.style.display = 'none';
        form.reset();
    }

    // 現在の検索条件でフィルタした配列を返す（描画と一括コピーで共用）
    function getFiltered() {
        const term = searchInput.value.trim().toLowerCase();
        const favs = [...activeFavorites];

        return prompts.filter(p => {
            // お気に入り AND：ON のタグをすべて持つものだけ通す
            if (favs.length) {
                const lower = p.tags.map(t => t.toLowerCase());
                if (!favs.every(f => lower.includes(f.toLowerCase()))) return false;
            }

            if (!term) return true;

            if (searchMode === 'partial') {
                return p.name.toLowerCase().includes(term)
                    || (p.comment && p.comment.toLowerCase().includes(term))
                    || p.prompt.toLowerCase().includes(term)
                    || p.tags.some(t => t.toLowerCase().includes(term));
            }
            // exact: 名前・タグの完全一致
            return p.name.toLowerCase() === term
                || p.tags.some(t => t.toLowerCase() === term);
        });
    }

    function sortList(list) {
        const arr = list.slice();
        switch (sortOrder) {
            case 'created_desc': arr.sort((a, b) => b.createdAt - a.createdAt); break;
            case 'created_asc':  arr.sort((a, b) => a.createdAt - b.createdAt); break;
            case 'name_asc':     arr.sort((a, b) => a.name.localeCompare(b.name, 'ja')); break;
            case 'updated_desc':
            default:             arr.sort((a, b) => b.updatedAt - a.updatedAt); break;
        }
        return arr;
    }

    function renderPrompts() {
        const filtering = searchInput.value.trim() || activeFavorites.size > 0;
        const filtered = sortList(getFiltered());

        countBadge.textContent = filtered.length;
        updateTagDatalist();
        promptList.innerHTML = '';

        if (filtered.length === 0) {
            promptList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✦</div>
                    <p>${filtering ? '条件に合うプロンプトがありません' : 'プロンプトがまだありません'}</p>
                    <p style="font-size:12px;">${filtering ? '検索語やお気に入りの絞り込みを見直してみてください' : '上のフォームから追加できます'}</p>
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
        const frag = document.createDocumentFragment();
        list.forEach(p => {
            const card = document.createElement('div');
            card.className = 'prompt-card';
            card.dataset.id = p.id;
            card.innerHTML = `
                <h3>${escHtml(p.name)}</h3>
                ${p.comment ? `<p class="card-comment">${escHtml(p.comment)}</p>` : ''}
                <div class="tags">
                    ${p.tags.map(t => `<button type="button" class="tag" data-tag="${escHtml(t)}">${escHtml(t)}</button>`).join('')}
                </div>
                <p class="prompt-text">${escHtml(p.prompt)}</p>
                <div class="actions">
                    <button type="button" class="copy"   data-action="copy">コピー</button>
                    <button type="button" class="edit"   data-action="edit">編集</button>
                    <button type="button" class="delete" data-action="delete">削除</button>
                </div>`;
            frag.appendChild(card);
        });
        promptList.appendChild(frag);
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
                    <tr data-id="${escHtml(p.id)}">
                        <td>${escHtml(p.name)}</td>
                        <td>${p.comment ? escHtml(p.comment) : '<span style="color:var(--text-muted)">—</span>'}</td>
                        <td>${p.tags.map(t => `<button type="button" class="tag" data-tag="${escHtml(t)}">${escHtml(t)}</button>`).join('')}</td>
                        <td class="prompt-text-cell">${escHtml(p.prompt)}</td>
                        <td class="actions-cell">
                            <button type="button" class="copy"   data-action="copy">コピー</button>
                            <button type="button" class="edit"   data-action="edit">編集</button>
                            <button type="button" class="delete" data-action="delete">削除</button>
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

    // ═══════════════════════════════════════════
    //  お気に入りタグ
    // ═══════════════════════════════════════════

    function saveFavorites() {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteTags));
    }

    function addFavorite(raw) {
        const tag = (raw || '').trim();
        if (!tag) return;
        if (favoriteTags.some(t => t.toLowerCase() === tag.toLowerCase())) {
            showToast('⚠ すでにお気に入りに登録済みです', 2500);
            return;
        }
        favoriteTags.push(tag);
        saveFavorites();
        favoriteInput.value = '';
        renderFavorites();
        showToast(`⭐ 「${tag}」をお気に入りに追加しました`);
    }

    function removeFavorite(tag) {
        favoriteTags = favoriteTags.filter(t => t !== tag);
        const wasActive = activeFavorites.delete(tag);
        saveFavorites();
        renderFavorites();
        if (wasActive) renderPrompts();
    }

    function toggleFavorite(tag) {
        if (activeFavorites.has(tag)) activeFavorites.delete(tag);
        else activeFavorites.add(tag);
        renderFavorites();
        renderPrompts();
    }

    function renderFavorites() {
        if (favoriteTags.length === 0) {
            favoritesChips.innerHTML = '<span class="favorites-hint">よく使うタグを登録すると、ここからワンクリックで絞り込めます</span>';
            return;
        }
        favoritesChips.innerHTML = favoriteTags.map(t => {
            const on = activeFavorites.has(t);
            return `
                <span class="fav-chip${on ? ' active' : ''}">
                    <button type="button" class="fav-chip-toggle" data-fav-toggle="${escHtml(t)}"
                            aria-pressed="${on}">${escHtml(t)}</button>
                    <button type="button" class="fav-chip-remove" data-fav-remove="${escHtml(t)}"
                            title="お気に入りから削除" aria-label="お気に入りから削除">×</button>
                </span>`;
        }).join('');
    }

    // 全プロンプトのタグを重複除去・ソートして返す
    function getAllTags() {
        const set = new Set();
        prompts.forEach(p => p.tags.forEach(t => set.add(t)));
        return [...set].sort((a, b) => a.localeCompare(b, 'ja'));
    }

    // datalist（お気に入り追加の補完候補）を更新
    function updateTagDatalist() {
        if (!allTagsList) return;
        allTagsList.innerHTML = getAllTags()
            .map(t => `<option value="${escHtml(t)}"></option>`)
            .join('');
    }

    // ═══════════════════════════════════════════
    //  Storage / persistence
    // ═══════════════════════════════════════════

    // 変更を反映：自動保存ONなら即保存、OFFなら未保存フラグを立てる
    function persist() {
        if (isAutoSaveEnabled()) {
            saveData();
        } else {
            dirty = true;
            updateSaveButton();
        }
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
        dirty = false;
        updateSaveButton();
        writeToFile();   // 連携中なら実ファイルにも書き出し
    }

    function loadData() {
        const raw = localStorage.getItem(STORAGE_KEY);
        let needsResave = false;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    const result = migrate(parsed);
                    prompts = result.records;
                    needsResave = result.changed;
                }
            } catch (_) { prompts = []; }
        }

        const savedMode = localStorage.getItem(DISPLAY_KEY);
        if (savedMode === 'grid' || savedMode === 'list') displayMode = savedMode;

        const savedSort = localStorage.getItem(SORT_KEY);
        if (savedSort) sortOrder = savedSort;
        sortSelect.value = sortOrder;

        const savedAutoSave = localStorage.getItem(AUTO_SAVE_KEY);
        if (savedAutoSave !== null) autoSaveChk.checked = savedAutoSave === 'true';

        // お気に入りタグの読み込み（配列・文字列のみ・重複除去で正規化）
        const rawFav = localStorage.getItem(FAVORITES_KEY);
        if (rawFav) {
            try {
                const parsedFav = JSON.parse(rawFav);
                if (Array.isArray(parsedFav)) {
                    favoriteTags = [...new Set(
                        parsedFav.filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean)
                    )];
                }
            } catch (_) { favoriteTags = []; }
        }

        // マイグレーションで形が変わっていれば保存し直す（自動保存設定に依らず実施）
        if (needsResave) localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));

        updateSaveButton();
        renderFavorites();
        setDisplayMode(displayMode);
    }

    function isAutoSaveEnabled() {
        return localStorage.getItem(AUTO_SAVE_KEY) !== 'false';
    }

    function updateSaveButton() {
        const off = !isAutoSaveEnabled();
        saveBtn.style.display = off ? 'inline-flex' : 'none';
        saveBtn.classList.toggle('has-changes', off && dirty);
        saveBtn.textContent = dirty ? '● 保存' : '保存';
    }

    // ── レコード正規化 / マイグレーション ──
    function genId() {
        if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    }

    function toStr(v) {
        return typeof v === 'string' ? v : (v != null ? String(v) : '');
    }

    // 任意の入力を安全なレコード形へ整える（不正なら null）
    function normalizeRecord(obj) {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;

        const name   = toStr(obj.name).trim();
        const prompt = toStr(obj.prompt);
        // 名前・プロンプトが両方空なら無効レコードとして弾く
        if (!name && !prompt.trim()) return null;

        const id = (obj.id === undefined || obj.id === null || obj.id === '')
            ? genId()
            : String(obj.id);

        const comment = toStr(obj.comment);

        const tags = Array.isArray(obj.tags)
            ? [...new Set(obj.tags.filter(t => typeof t === 'string').map(t => t.trim()).filter(Boolean))]
            : [];

        // createdAt：無ければ数値レガシーID（Date.now由来）→ それも無ければ現在時刻
        let createdAt = Number(obj.createdAt);
        if (!createdAt || Number.isNaN(createdAt)) {
            const legacy = Number(obj.id);
            createdAt = (!Number.isNaN(legacy) && legacy > 0) ? legacy : Date.now();
        }
        let updatedAt = Number(obj.updatedAt);
        if (!updatedAt || Number.isNaN(updatedAt)) updatedAt = createdAt;

        return { id, name, comment, tags, prompt, createdAt, updatedAt };
    }

    // 配列を正規化し、形が変わったかを返す
    function migrate(arr) {
        let changed = false;
        const records = [];
        for (const item of arr) {
            const r = normalizeRecord(item);
            if (!r) { changed = true; continue; }
            if (!changed) {
                const before = JSON.stringify(item);
                const after  = JSON.stringify(r);
                if (before !== after) changed = true;
            }
            records.push(r);
        }
        return { records, changed };
    }

    // ── Modal ──
    function openSettingsModal() {
        settingsModal.classList.add('show');
        document.body.style.overflow = 'hidden';
        updateFileStatus();
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
                if (!Array.isArray(data)) {
                    showToast('⚠ 無効なファイル形式です（配列ではありません）', 4000);
                    return;
                }

                const { records } = migrate(data);
                if (records.length === 0) {
                    showToast('⚠ 取り込めるレコードがありませんでした', 4000);
                    return;
                }

                // 既存データがある場合は全置換の確認
                if (prompts.length > 0 &&
                    !confirm(`現在の ${prompts.length} 件を、インポートした ${records.length} 件で置き換えます。よろしいですか？`)) {
                    return;
                }

                prompts = records;
                saveData();
                renderPrompts();
                showToast(`📥 ${records.length} 件インポートしました`);
                closeSettingsModal();
            } catch (_) {
                showToast('⚠ ファイルの読み込みに失敗しました', 4000);
            }
        };
        reader.readAsText(file);
        importFile.value = '';
    }

    // ═══════════════════════════════════════════
    //  File System Access API（実ファイル連携・任意）
    // ═══════════════════════════════════════════

    const IDB_NAME  = 'prompt_stocker';
    const IDB_STORE = 'handles';
    const HANDLE_KEY = 'fileHandle';

    function idbOpen() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, 1);
            req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    async function idbSet(key, val) {
        const db = await idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(val, key);
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
        });
    }

    async function idbGet(key) {
        const db = await idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const rq = tx.objectStore(IDB_STORE).get(key);
            rq.onsuccess = () => resolve(rq.result);
            rq.onerror   = () => reject(rq.error);
        });
    }

    async function idbDel(key) {
        const db = await idbOpen();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror    = () => reject(tx.error);
        });
    }

    async function ensurePermission(handle, write) {
        const opts = { mode: write ? 'readwrite' : 'read' };
        if ((await handle.queryPermission(opts)) === 'granted') return true;
        if ((await handle.requestPermission(opts)) === 'granted') return true;
        return false;
    }

    async function linkFile() {
        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: 'prompts_data.json',
                types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
            });
            fileHandle = handle;
            await idbSet(HANDLE_KEY, handle);
            await writeToFile();
            updateFileStatus();
            showToast('📁 ファイルと連携しました');
        } catch (err) {
            if (err && err.name === 'AbortError') return;
            showToast('⚠ ファイル連携に失敗しました', 4000);
        }
    }

    async function unlinkFile() {
        fileHandle = null;
        try { await idbDel(HANDLE_KEY); } catch (_) {}
        updateFileStatus();
        showToast('ファイル連携を解除しました');
    }

    async function writeToFile() {
        if (!fileHandle) return;
        try {
            if (!(await ensurePermission(fileHandle, true))) return;
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(prompts, null, 2));
            await writable.close();
        } catch (err) {
            console.warn('ファイル書き込みに失敗しました', err);
        }
    }

    async function restoreFileLink() {
        if (!fsSupported) return;
        try {
            const handle = await idbGet(HANDLE_KEY);
            if (handle) {
                fileHandle = handle;
                updateFileStatus();
            }
        } catch (_) {}
    }

    function updateFileStatus() {
        if (!fsSupported || !fileLinkStatus) return;
        if (fileHandle) {
            fileLinkStatus.textContent = `連携中: ${fileHandle.name}`;
            fileLinkStatus.classList.add('linked');
            fileLinkBtn.textContent = '📁 別のファイルに切り替え';
            fileUnlinkBtn.style.display = 'flex';
        } else {
            fileLinkStatus.textContent = '未連携';
            fileLinkStatus.classList.remove('linked');
            fileLinkBtn.textContent = '📁 ファイルと連携する';
            fileUnlinkBtn.style.display = 'none';
        }
    }

    // ── Toast ──
    function showToast(message, duration = 2800) {
        const toast = document.getElementById('toast');
        toast.querySelector('.toast-message').textContent = message;
        toast.classList.remove('show');
        void toast.offsetWidth; // 再アニメーションのための強制リフロー
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
