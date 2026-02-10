// ==UserScript==
// @name         Gemini 智能高亮笔记助手
// @namespace    http://tampermonkey.net/
// @version      1.16
// @description  基于V14架构，移除上下文预览文字，侧边栏固定，保留所有AI功能
// @author       Zhang Zuhao
// @match        https://gemini.google.com/*
// @connect      api.openai.com
// @connect      api.deepseek.com
// @connect      *
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    console.log(">>> V16 精简回归版已启动");

    // --- 全局变量 ---
    let notesData = [];
    let savedRange = null;
    let currentAIMarkdown = "";

    // --- 1. 样式注入 ---
    const style = document.createElement('style');
    style.textContent = `
        /* 基础组件 */
        .z-highlight { background-color: #ffeb3b; color: #000; font-weight: bold; border-bottom: 2px solid #fbc02d; cursor: pointer; }

        /* 摘录悬浮钮 */
        #z-action-btn { position: fixed; z-index: 99999; padding: 8px 16px; background: #202124; color: #fff; border-radius: 24px; cursor: pointer; font-size: 13px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: none; user-select: none; font-family: sans-serif; }

        /* 右下角图标 (固定位置，不可拖拽) */
        #z-dock-icon { position: fixed; bottom: 30px; right: 30px; width: 50px; height: 50px; background: #fff; border-radius: 50%; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 99998; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; transition: transform 0.2s; user-select: none; }
        #z-dock-icon:hover { transform: scale(1.1); }

        /* --- 侧边栏核心样式 --- */
        #z-notes-panel {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: 400px;
            height: 100vh;
            background: #fff;
            border-left: 1px solid #dadce0;
            box-shadow: -4px 0 16px rgba(0,0,0,0.1);
            z-index: 99999;
            padding: 20px;
            display: none;
            font-family: 'Google Sans', sans-serif;
            flex-direction: column;
            box-sizing: border-box;
        }

        /* 列表区域 */
        #z-notes-list {
            flex: 1;
            overflow-y: auto;
            margin-bottom: 15px;
            font-size: 14px;
            color: #333;
            border-bottom: 1px solid #eee;
            padding-bottom: 10px;
            min-height: 100px;
        }

        /* AI 渲染区域 */
        #z-ai-result {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            font-size: 14px;
            color: #37474f;
            margin-bottom: 15px;
            display: none;
            line-height: 1.6;
            border: 1px solid #e0e0e0;
            overflow-y: auto;
            max-height: 40%;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);
        }

        /* Markdown 渲染样式 */
        #z-ai-result h2 { margin: 16px 0 8px 0; font-size: 16px; color: #202124; font-weight: 700; border-left: 4px solid #1a73e8; padding-left: 8px; line-height: 1.3; }
        #z-ai-result h3 { margin: 12px 0 6px 0; font-size: 15px; color: #4285f4; font-weight: 600; }
        #z-ai-result ul { padding-left: 20px; margin: 6px 0; }
        #z-ai-result li { margin-bottom: 6px; }
        #z-ai-result strong { color: #000; font-weight: 700; background: rgba(255, 235, 59, 0.3); padding: 0 2px; border-radius: 2px;}

        /* 列表项 (已移除 ctx 样式) */
        .z-note-item { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px dashed #eee; padding-bottom: 8px; }
        .z-note-left { flex: 1; margin-right: 10px; font-size: 14px; line-height: 1.5; color: #202124;}
        /* 删除按钮 */
        .z-del-btn { color: #ea4335; cursor: pointer; font-weight: bold; padding: 6px; font-size: 18px; line-height: 1; border-radius: 4px; }
        .z-del-btn:hover { background: #fce8e6; }

        /* 按钮组 */
        .z-btn-row { display: flex; gap: 8px; margin-top: auto; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid #eee; }
        .z-btn { border: none; border-radius: 8px; cursor: pointer; padding: 10px 12px; font-weight: 500; font-size: 13px; flex: 1; text-align: center; white-space: nowrap; transition: background 0.2s; }
        .z-btn-primary { background: #e8f0fe; color: #1a73e8; }
        .z-btn-primary:hover { background: #d2e3fc; }
        .z-btn-ai { background: linear-gradient(135deg, #4285f4 0%, #34a853 100%); color: white; flex: 100%; margin-bottom: 8px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 5px rgba(0,0,0,0.15); }
        .z-btn-ai:hover { opacity: 0.9; box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
        .z-btn-close { background: #f1f3f4; color: #5f6368; flex: 0 0 auto; }
        .z-btn-setting { background: #fff; border: 1px solid #dadce0; color: #5f6368; flex: 0 0 auto; width: 40px; }
        .z-btn-setting:hover { background: #f8f9fa; }

        /* 设置模态框 */
        #z-settings-modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px; box-shadow: 0 24px 48px rgba(0,0,0,0.2); z-index: 100000; border-radius: 12px; width: 320px; display: none; font-family: sans-serif; }
        .z-input { width: 100%; padding: 10px; margin: 8px 0 20px 0; border: 1px solid #dadce0; border-radius: 6px; box-sizing: border-box; display: block; font-size: 14px; }
        .z-label { font-size: 13px; font-weight: bold; color: #202124; display: block; margin-bottom: 4px; }
    `;
    document.head.appendChild(style);

    // --- 2. UI 构建 ---
    const actionBtn = document.createElement('div'); actionBtn.id = 'z-action-btn'; actionBtn.textContent = '🖊️ 摘录'; document.body.appendChild(actionBtn);
    const dockIcon = document.createElement('div'); dockIcon.id = 'z-dock-icon'; dockIcon.textContent = '📝'; document.body.appendChild(dockIcon);

    // 侧边栏容器
    const notesPanel = document.createElement('div'); notesPanel.id = 'z-notes-panel';

    // 顶部标题栏
    const headerDiv = document.createElement('div');
    headerDiv.style.marginBottom = '20px';
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.alignItems = 'center';

    const h3 = document.createElement('h3');
    h3.textContent = '📚 重点笔记';
    h3.style.margin = '0';
    h3.style.fontSize = '20px';
    h3.style.color = '#202124';

    const topCloseBtn = document.createElement('span');
    topCloseBtn.textContent = '✕';
    topCloseBtn.style.cursor = 'pointer';
    topCloseBtn.style.padding = '8px';
    topCloseBtn.style.fontSize = '18px';
    topCloseBtn.style.color = '#5f6368';
    topCloseBtn.onclick = () => notesPanel.style.display = 'none';

    headerDiv.appendChild(h3);
    headerDiv.appendChild(topCloseBtn);
    notesPanel.appendChild(headerDiv);

    const notesList = document.createElement('div'); notesList.id = 'z-notes-list'; notesPanel.appendChild(notesList);
    const aiResult = document.createElement('div'); aiResult.id = 'z-ai-result'; notesPanel.appendChild(aiResult);

    // 底部按钮区
    const btnRow = document.createElement('div'); btnRow.className = 'z-btn-row';
    const createBtn = (cls, txt, id, title) => { const b = document.createElement('button'); b.className = 'z-btn '+cls; b.textContent = txt; b.id = id; if(title) b.title = title; return b; };

    const btnAi = createBtn('z-btn-ai', '✨ AI 智能总结', 'z-btn-ai');
    const btnCopyAi = createBtn('z-btn-primary', '复制 AI', 'z-btn-copy-ai', '复制 AI 生成的总结');
    const btnCopyRaw = createBtn('z-btn-primary', '复制原文', 'z-btn-copy-raw', '复制所有高亮的原始文字');
    const btnSet = createBtn('z-btn-setting', '⚙️', 'z-btn-setting', 'API 设置');

    btnRow.append(btnAi, btnCopyAi, btnCopyRaw, btnSet);
    notesPanel.appendChild(btnRow); document.body.appendChild(notesPanel);

    // 设置弹窗
    const modal = document.createElement('div'); modal.id = 'z-settings-modal';
    const mTitle = document.createElement('h4'); mTitle.textContent = 'API 配置'; mTitle.style.marginTop = '0'; modal.appendChild(mTitle);

    const createInput = (id, ph, lbl) => { const l = document.createElement('span'); l.className = 'z-label'; l.textContent = lbl; modal.appendChild(l); const i = document.createElement('input'); i.type = id.includes('key') ? 'password' : 'text'; i.id = id; i.className = 'z-input'; i.placeholder = ph; modal.appendChild(i); };
    createInput('z-api-url', 'https://api.deepseek.com/chat/completions', 'API Endpoint');
    createInput('z-api-key', 'sk-...', 'API Key');
    createInput('z-model-name', 'deepseek-chat', 'Model Name');

    const mBtns = document.createElement('div'); mBtns.style.textAlign = 'right';
    const saveBtn = createBtn('z-btn-primary', '保存', 'z-save-settings'); saveBtn.style.marginRight = '8px'; saveBtn.style.width = 'auto';
    const cancelBtn = createBtn('z-btn-close', '取消', 'z-close-settings'); cancelBtn.style.width = 'auto';
    mBtns.append(saveBtn, cancelBtn); modal.appendChild(mBtns); document.body.appendChild(modal);

    // --- 3. 核心功能 ---
    function getSectionContext(range) {
        let node = range.commonAncestorContainer;
        if (node.nodeType === 3) node = node.parentNode;
        const currentBlock = node.closest('p, ul, ol, li, h1, h2, h3, h4, h5, h6, pre, table, .code-block');
        if (!currentBlock) return node.innerText;
        const container = currentBlock.parentElement;
        if (!container) return currentBlock.innerText;
        const siblings = Array.from(container.children);
        const currentIndex = siblings.indexOf(currentBlock);
        if (currentIndex === -1) return currentBlock.innerText;
        let startIndex = 0;
        for (let i = currentIndex; i >= 0; i--) {
            if (/^H[1-6]$/.test(siblings[i].tagName)) { startIndex = i; break; }
        }
        let contextBuffer = [];
        for (let i = startIndex; i < siblings.length; i++) {
            const el = siblings[i];
            if (i !== startIndex && /^H[1-6]$/.test(el.tagName)) break;
            const text = el.innerText.trim();
            if (text) contextBuffer.push(text);
        }
        return contextBuffer.join('\n\n');
    }

    // Markdown 渲染器
    function safeRenderMarkdown(container, text) {
        container.textContent = '';
        if (!text) return;
        const lines = text.split('\n');
        let currentList = null;

        lines.forEach(line => {
            line = line.trim();
            if (line === '') return;

            if (line.startsWith('- ') || line.startsWith('* ')) {
                if (!currentList) { currentList = document.createElement('ul'); container.appendChild(currentList); }
                const li = document.createElement('li'); parseInlineStyle(li, line.substring(2)); currentList.appendChild(li);
            }
            else if (line.startsWith('## ')) {
                currentList = null; const h2 = document.createElement('h2'); parseInlineStyle(h2, line.substring(3)); container.appendChild(h2);
            }
            else if (line.startsWith('### ')) {
                currentList = null; const h3 = document.createElement('h3'); parseInlineStyle(h3, line.substring(4)); container.appendChild(h3);
            }
            else {
                currentList = null; const p = document.createElement('div'); p.style.marginBottom = '6px'; parseInlineStyle(p, line); container.appendChild(p);
            }
        });
    }

    function parseInlineStyle(node, text) {
        const parts = text.split('**');
        parts.forEach((part, index) => {
            if (index % 2 === 1) { const b = document.createElement('strong'); b.textContent = part; node.appendChild(b); }
            else { if (part) node.appendChild(document.createTextNode(part)); }
        });
    }

    // --- 4. 业务逻辑 (精简版：移除 ctxDiv) ---
    function renderList() {
        notesList.textContent = '';
        if (notesData.length === 0) {
            const emptyTip = document.createElement('div');
            emptyTip.style.color = '#999'; emptyTip.style.textAlign = 'center'; emptyTip.style.marginTop = '40px';
            emptyTip.innerHTML = '📭 暂无笔记<br><span style="font-size:12px">选中文字即可摘录</span>';
            notesList.appendChild(emptyTip); return;
        }
        notesData.forEach(item => {
            const itemDiv = document.createElement('div'); itemDiv.className = 'z-note-item';

            const leftDiv = document.createElement('div'); leftDiv.className = 'z-note-left';

            // 仅添加高亮文字，不再添加上下文预览 div
            const hlDiv = document.createElement('div');
            const b = document.createElement('b');
            b.textContent = item.highlight;
            hlDiv.appendChild(b);

            leftDiv.appendChild(hlDiv);

            const delDiv = document.createElement('div'); delDiv.className = 'z-del-btn'; delDiv.textContent = '×'; delDiv.onclick = () => deleteNote(item.id);
            itemDiv.append(leftDiv, delDiv); notesList.appendChild(itemDiv);
        });
    }

    function deleteNote(id) {
        const index = notesData.findIndex(n => n.id === id);
        if (index > -1) {
            const item = notesData[index];
            if (item.spanElement && document.body.contains(item.spanElement)) {
                const parent = item.spanElement.parentNode;
                while (item.spanElement.firstChild) parent.insertBefore(item.spanElement.firstChild, item.spanElement);
                parent.removeChild(item.spanElement);
            }
            notesData.splice(index, 1); renderList();
        }
    }

    // --- 事件 ---
    document.addEventListener('mouseup', function(e) {
        if (e.target.closest('#z-action-btn') || e.target.closest('#z-notes-panel') || e.target.closest('#z-dock-icon') || e.target.closest('#z-settings-modal')) return;
        setTimeout(() => {
            const selection = window.getSelection(); const text = selection.toString().trim();
            if (text.length > 0) {
                try {
                    const range = selection.getRangeAt(0); const rect = range.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        savedRange = range;
                        actionBtn.style.top = (rect.top - 45) + 'px'; actionBtn.style.left = (rect.left + rect.width/2 - 40) + 'px'; actionBtn.style.display = 'block'; return;
                    }
                } catch(err) {}
            }
            actionBtn.style.display = 'none';
        }, 50);
    });
    window.addEventListener('scroll', () => { actionBtn.style.display = 'none'; }, true);

    actionBtn.addEventListener('mousedown', function(e) {
        e.preventDefault(); e.stopPropagation();
        if (!savedRange) return;
        try {
            let contextText = getSectionContext(savedRange);
            const span = document.createElement('span'); span.className = 'z-highlight'; span.textContent = savedRange.toString();
            savedRange.deleteContents(); savedRange.insertNode(span);
            notesData.push({ id: Date.now(), highlight: span.textContent, context: contextText, spanElement: span });
            renderList(); actionBtn.style.display = 'none'; window.getSelection().removeAllRanges();

            if(notesPanel.style.display === 'none') {
                notesPanel.style.display = 'flex';
            }

        } catch (err) { console.error(err); }
    });

    dockIcon.onclick = () => { notesPanel.style.display = (notesPanel.style.display === 'none') ? 'flex' : 'none'; if (notesPanel.style.display === 'flex') renderList(); };

    btnSet.onclick = () => {
        document.getElementById('z-api-url').value = GM_getValue('api_url', 'https://api.deepseek.com/chat/completions');
        document.getElementById('z-api-key').value = GM_getValue('api_key', '');
        document.getElementById('z-model-name').value = GM_getValue('model_name', 'deepseek-chat');
        modal.style.display = 'block';
    };
    cancelBtn.onclick = () => modal.style.display = 'none';
    saveBtn.onclick = () => {
        GM_setValue('api_url', document.getElementById('z-api-url').value.trim());
        GM_setValue('api_key', document.getElementById('z-api-key').value.trim());
        GM_setValue('model_name', document.getElementById('z-model-name').value.trim());
        alert('设置已保存'); modal.style.display = 'none';
    };

    btnCopyRaw.onclick = () => {
        if (notesData.length === 0) { alert('没有原文可复制'); return; }
        const rawText = notesData.map(n => `- ${n.highlight}`).join('\n');
        navigator.clipboard.writeText(rawText).then(() => { const old = btnCopyRaw.textContent; btnCopyRaw.textContent = '已复制'; setTimeout(() => btnCopyRaw.textContent = old, 1500); });
    };
    btnCopyAi.onclick = () => {
        if (!currentAIMarkdown) { alert('还没有生成 AI 总结'); return; }
        navigator.clipboard.writeText(currentAIMarkdown).then(() => { const old = btnCopyAi.textContent; btnCopyAi.textContent = '已复制'; setTimeout(() => btnCopyAi.textContent = old, 1500); });
    };

    btnAi.onclick = function() {
        if (notesData.length === 0) return alert('请先摘录');
        const k = GM_getValue('api_key'); let url = GM_getValue('api_url');
        if (!k) return alert('请先设置 API Key');
        if (url.includes('api.deepseek.com') && !url.endsWith('completions')) url = 'https://api.deepseek.com/chat/completions';
        if (url.includes('api.openai.com') && !url.endsWith('completions')) url = 'https://api.openai.com/v1/chat/completions';

        btnAi.textContent = '正在分析上下文生成笔记...'; btnAi.disabled = true;
        aiResult.style.display = 'block'; aiResult.textContent = '💡 思考中...';
        aiResult.style.color = '#555';

        const prompt = notesData.map(n => `### 摘录点\n"${n.highlight}"\n\n### 所在章节完整内容\n${n.context}`).join('\n\n---\n\n');

        GM_xmlhttpRequest({
            method: "POST",
            url: url,
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${k}` },
            data: JSON.stringify({
                model: GM_getValue('model_name', 'deepseek-chat'),
                messages: [
                    {role: "system", content: "你是一个高效的学习助手。请基于用户的摘录和章节内容，生成结构清晰的 Markdown 笔记。使用 ## 二级标题作为主要部分，使用列表列出要点，关键词加粗。"},
                    {role: "user", content: prompt}
                ]
            }),
            onload: (res) => {
                btnAi.textContent = '✨ AI 智能总结'; btnAi.disabled = false;
                try {
                    const d = JSON.parse(res.responseText);
                    if (d.choices && d.choices[0]) {
                        currentAIMarkdown = d.choices[0].message.content;
                        safeRenderMarkdown(aiResult, currentAIMarkdown);
                    } else {
                        aiResult.style.color = 'red'; aiResult.textContent = "Error: " + (d.error?.message || JSON.stringify(d));
                    }
                } catch(e) { aiResult.textContent = "解析错误"; }
            },
            onerror: () => { btnAi.textContent = '重试'; btnAi.disabled = false; aiResult.textContent = "网络错误"; }
        });
    };
})();
