document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('prompt-form');
    const promptList = document.getElementById('prompt-list');
    const searchInput = document.getElementById('search');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFile = document.getElementById('import-file');
    const cancelBtn = document.getElementById('cancel-btn');

    let prompts = [];
    let editingId = null;
    const STORAGE_KEY = 'prompts_data';

    // 初期データ読み込み
    loadData();

    // フォーム送信
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        addPrompt();
    });

    // 検索
    searchInput.addEventListener('input', function() {
        renderPrompts();
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
            prompts.push(updatedPrompt);
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
        saveData();
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
        filteredPrompts.forEach(prompt => {
            const card = document.createElement('div');
            card.className = 'prompt-card';
            card.innerHTML = `
                <h3>${prompt.name}</h3>
                ${prompt.comment ? `<p><strong>コメント:</strong> ${prompt.comment}</p>` : ''}
                <div class="tags">
                    ${prompt.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
                <p class="prompt-text">${prompt.prompt}</p>
                <div class="actions">
                    <button class="edit" onclick="editPrompt(${prompt.id})">編集</button>
                    <button class="delete" onclick="deletePrompt(${prompt.id})">削除</button>
                </div>
            `;
            promptList.appendChild(card);
        });
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

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));
    }

    function loadData() {
        const data = localStorage.getItem(STORAGE_KEY);
        if (data) {
            prompts = JSON.parse(data);
        }
        renderPrompts();
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
