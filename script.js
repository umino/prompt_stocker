document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('prompt-form');
    const promptList = document.getElementById('prompt-list');
    const searchInput = document.getElementById('search');
    const clearSearchBtn = document.getElementById('clear-search');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    const cancelBtn = document.getElementById('cancel-btn');
    const gridModeBtn = document.getElementById('grid-mode-btn');
    const listModeBtn = document.getElementById('list-mode-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeModal = document.getElementById('close-modal');
    const autoSaveCheckbox = document.getElementById('auto-save');

    let prompts = [];
    let editingId = null;
    let displayMode = 'grid'; // 'grid' or 'list'
    const STORAGE_KEY = 'prompts_data';
    const DISPLAY_MODE_KEY = 'display_mode';

    // 初期データ読み込み
    loadData();

    // フォーム送信
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        addPrompt();
    });

    // 検索
    searchInput.addEventListener('input', function() {
        clearSearchBtn.style.display = this.value ? 'block' : 'none';
        renderPrompts();
    });

    // 検索クリア
    clearSearchBtn.addEventListener('click', function() {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        renderPrompts();
        searchInput.focus();
    });

    // エクスポート
    exportBtn.addEventListener('click', exportData);

    // インポート
    importBtn.addEventListener('click', function() {
        importFile.click();
    });

    importFile.addEventListener('change', importData);

    // キャンセル
    cancelBtn.addEventListener('click', function() {
        editingId = null;
        form.querySelector('button[type="submit"]').textContent = '追加';
        cancelBtn.style.display = 'none';
        form.reset();
    });

    // モード切り替え
    gridModeBtn.addEventListener('click', function() {
        setDisplayMode('grid');
    });

    listModeBtn.addEventListener('click', function() {
        setDisplayMode('list');
    });

    // 設定ボタン
    settingsBtn.addEventListener('click', function() {
        openSettingsModal();
    });

    // モーダル閉じるボタン
    closeModal.addEventListener('click', function() {
        closeSettingsModal();
    });

    // モーダルオーバーレイクリックで閉じる
    settingsModal.addEventListener('click', function(e) {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });

    // 自動保存チェックボックスの変更を監視
    autoSaveCheckbox.addEventListener('change', function() {
        const isAutoSave = this.checked;
        // 自動保存設定をlocalStorageに保存
        localStorage.setItem('auto_save_enabled', isAutoSave);
        console.log('自動保存設定:', isAutoSave ? '有効' : '無効');
    });

    // Escapeキーでモーダルを閉じる
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && settingsModal.classList.contains('show')) {
            closeSettingsModal();
        }
    });

    function setDisplayMode(mode) {
        displayMode = mode;

        // ボタンのアクティブ状態を更新
        gridModeBtn.classList.toggle('active', mode === 'grid');
        listModeBtn.classList.toggle('active', mode === 'list');

        // プロンプトリストのクラスを更新
        promptList.className = `prompt-list ${mode}-mode`;

        // 表示モードをlocalStorageに保存
        localStorage.setItem(DISPLAY_MODE_KEY, mode);

        // プロンプトを再描画
        renderPrompts();
    }

    function addPrompt() {
        const name = document.getElementById('name').value.trim();
        const comment = document.getElementById('comment').value.trim();
        const tagsInput = document.getElementById('tags').value.trim();
        const prompt = document.getElementById('prompt').value.trim();

        if (!name || name.length < 1 || name.length > 20) {
            alert('名前は1〜20文字で入力してください。');
            return;
        }

        if (comment && (comment.length < 1 || comment.length > 40)) {
            alert('コメントは1〜40文字で入力してください。');
            return;
        }

        if (!prompt || prompt.length < 1 || prompt.length > 400) {
            alert('プロンプトは1〜400文字で入力してください。');
            return;
        }

        const tags = tagsInput ? tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length >= 1 && tag.length <= 10) : [];

        if (tags.some(tag => tag.length < 1 || tag.length > 10)) {
            alert('各タグは1〜10文字で入力してください。');
            return;
        }

        if (editingId) {
            // 更新
            const updatedPrompt = {
                id: editingId,
                name,
                comment,
                tags,
                prompt
            };
            prompts = prompts.map(p => p.id === editingId ? updatedPrompt : p);
            editingId = null;
            form.querySelector('button[type="submit"]').textContent = '追加';
            cancelBtn.style.display = 'none';
        } else {
            // 新規追加
            const newPrompt = {
                id: Date.now(),
                name,
                comment,
                tags,
                prompt
            };
            prompts.push(newPrompt);
        }

        // 自動保存設定をチェックして保存
        const autoSaveEnabled = localStorage.getItem('auto_save_enabled') !== 'false';
        if (autoSaveEnabled) {
            saveData();
        }

        form.reset();
        renderPrompts();
    }

    function renderPrompts() {
        const searchTerm = searchInput.value.toLowerCase();
        const filteredPrompts = prompts.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            p.tags.some(tag => tag.toLowerCase().includes(searchTerm))
        );

        promptList.innerHTML = '';

        if (displayMode === 'list') {
            // リストモード（テーブル形式）
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
                    ${filteredPrompts.map(prompt => `
                        <tr>
                            <td>${prompt.name}</td>
                            <td>${prompt.comment || '-'}</td>
                            <td>${prompt.tags.map(tag => `<span class="tag" onclick="setSearchTag('${tag}')">${tag}</span>`).join('')}</td>
                            <td class="prompt-text-cell">${prompt.prompt}</td>
                            <td class="actions-cell">
                                <button class="copy" onclick="copyPrompt(${prompt.id})">コピー</button>
                                <button class="edit" onclick="editPrompt(${prompt.id})">編集</button>
                                <button class="delete" onclick="deletePrompt(${prompt.id})">削除</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            `;
            promptList.appendChild(table);
        } else {
            // グリッドモード（カード形式）
            filteredPrompts.forEach(prompt => {
                const card = document.createElement('div');
                card.className = 'prompt-card';
                card.innerHTML = `
                    <h3>${prompt.name}</h3>
                    ${prompt.comment ? `<p><strong>コメント:</strong> ${prompt.comment}</p>` : ''}
                    <div class="tags">
                        ${prompt.tags.map(tag => `<span class="tag" onclick="setSearchTag('${tag}')">${tag}</span>`).join('')}
                    </div>
                    <p class="prompt-text">${prompt.prompt}</p>
                    <div class="actions">
                        <button class="copy" onclick="copyPrompt(${prompt.id})">コピー</button>
                        <button class="edit" onclick="editPrompt(${prompt.id})">編集</button>
                        <button class="delete" onclick="deletePrompt(${prompt.id})">削除</button>
                    </div>
                `;
                promptList.appendChild(card);
            });
        }
    }

    window.editPrompt = function(id) {
        const prompt = prompts.find(p => p.id === id);
        if (!prompt) return;

        document.getElementById('name').value = prompt.name;
        document.getElementById('comment').value = prompt.comment;
        document.getElementById('tags').value = prompt.tags.join(', ');
        document.getElementById('prompt').value = prompt.prompt;

        editingId = id;
        form.querySelector('button[type="submit"]').textContent = '更新';
        cancelBtn.style.display = 'inline-block';
    };

    window.deletePrompt = function(id) {
        if (confirm('本当に削除しますか？')) {
            prompts = prompts.filter(p => p.id !== id);
            saveData();
            renderPrompts();
        }
    };

    window.setSearchTag = function(tag) {
        const searchInput = document.getElementById('search');
        searchInput.value = tag;
        searchInput.dispatchEvent(new Event('input')); // 検索を即時実行
    };

    function showToast(message, duration = 3000) {
        const toast = document.getElementById('toast');
        toast.querySelector('.toast-message').textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }

    window.copyPrompt = function(id) {
        const prompt = prompts.find(p => p.id === id);
        if (!prompt) return;

        navigator.clipboard.writeText(prompt.prompt).then(function() {
            showToast('プロンプトをコピーしました');
        }).catch(function(err) {
            showToast('コピーに失敗しました', 4000);
        });
    };

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    }

    function loadData() {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            prompts = JSON.parse(data);
        }

        // 保存された表示モードを読み込み
        const savedMode = localStorage.getItem(DISPLAY_MODE_KEY);
        if (savedMode && (savedMode === 'grid' || savedMode === 'list')) {
            displayMode = savedMode;
        }

        // 保存された自動保存設定を読み込み
        const autoSaveEnabled = localStorage.getItem('auto_save_enabled');
        if (autoSaveEnabled !== null) {
            autoSaveCheckbox.checked = autoSaveEnabled === 'true';
        }

        // 初期表示モードを設定
        setDisplayMode(displayMode);
    }

    // モーダルを開く
    function openSettingsModal() {
        settingsModal.classList.add('show');
        document.body.style.overflow = 'hidden'; // 背景スクロールを無効化
    }

    // モーダルを閉じる
    function closeSettingsModal() {
        settingsModal.classList.remove('show');
        document.body.style.overflow = ''; // 背景スクロールを有効化
    }

    function exportData() {
        const dataStr = JSON.stringify(prompts, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'prompts_data.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function importData(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedPrompts = JSON.parse(e.target.result);
                if (Array.isArray(importedPrompts)) {
                    prompts = importedPrompts;
                    saveData();
                    renderPrompts();
                    alert('データをインポートしました。');
                } else {
                    alert('無効なファイル形式です。');
                }
            } catch (error) {
                alert('ファイルの読み込みに失敗しました。');
            }
        };
        reader.readAsText(file);
        importFile.value = '';
    }
});
