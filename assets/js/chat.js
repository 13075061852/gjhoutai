(function () {
  'use strict';

  const App = window.GJHApp;
  if (!App) return;

  const { refs, constants, state, utils } = App;

  const saveChatHistory = () => {
    utils.writeJson(constants.CHAT_STORAGE_KEY, state.chatHistory.slice(-30));
  };

  const loadChatHistory = () => {
    const parsed = utils.readJson(constants.CHAT_STORAGE_KEY, []);
    return Array.isArray(parsed) ? parsed : [];
  };

  const scrollChatToBottom = () => {
    if (!refs.chatMessages) return;
    requestAnimationFrame(() => {
      refs.chatMessages.scrollTop = refs.chatMessages.scrollHeight;
    });
  };

  const renderChat = () => {
    if (!refs.chatMessages) return;
    const intro = refs.chatIntroText;
    const items = state.chatHistory.length
      ? state.chatHistory
      : [{ role: 'system', content: '先去保存 OpenRouter 配置，然后我就能在全局聊天里帮你回答问题。' }];

    refs.chatMessages.innerHTML = items.map((item) => {
      const label = item.role === 'user' ? '你' : item.role === 'assistant' ? 'AI' : '系统';
      return `<div class="ai-message ${item.role === 'user' ? 'user' : ''}"><div class="msg-meta">${label}</div><p>${utils.markdownLite(item.content)}</p></div>`;
    }).join('');

    if (intro) {
      const hasKey = Boolean((App.config.getFormConfig().apiKey || '').trim());
      const resolvedModel = App.config.getResolvedModel();
      intro.textContent = hasKey
        ? `已连接到 ${resolvedModel || '未选择模型'}，可以直接在这里聊天。`
        : '先去保存 OpenRouter 配置，然后我就能在全局聊天里帮你回答问题。';
    }

    scrollChatToBottom();
  };

  const pushChatMessage = (role, content) => {
    state.chatHistory.push({ role, content });
    saveChatHistory();
    renderChat();
  };

  const sendChatMessage = async () => {
    if (state.chatBusy) return;
    const config = App.config.getFormConfig();
    const prompt = (refs.chatInput?.value || '').trim();
    if (!prompt) return;
    if (!config.apiKey) {
      pushChatMessage('assistant', '请先在 AI 配置里填写 OpenRouter API 密钥，然后再发送消息。');
      return;
    }

    const model = App.config.getResolvedModel();
    if (!model) {
      pushChatMessage('assistant', '请先选择一个模型。');
      return;
    }

    state.chatBusy = true;
    if (refs.chatSendBtn) refs.chatSendBtn.disabled = true;
    if (refs.chatInput) refs.chatInput.disabled = true;

    pushChatMessage('user', prompt);
    if (refs.chatInput) refs.chatInput.value = '';
    pushChatMessage('assistant', '正在思考...');
    const pendingIndex = state.chatHistory.length - 1;

    try {
      const requestMessages = state.chatHistory
        .slice(0, pendingIndex)
        .filter((item) => item.role === 'user' || item.role === 'assistant')
        .slice(-12);

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: App.config.getRequestHeaders(config),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: config.systemPrompt || constants.DEFAULT_CONFIG.systemPrompt },
            ...requestMessages,
          ],
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          stream: false,
        }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const answer = data?.choices?.[0]?.message?.content?.trim() || '我暂时没有返回内容。';
      state.chatHistory[pendingIndex] = { role: 'assistant', content: answer };
      saveChatHistory();
      renderChat();
    } catch (error) {
      state.chatHistory[pendingIndex] = { role: 'assistant', content: `发送失败：${error?.message || '网络或权限错误'}` };
      saveChatHistory();
      renderChat();
    } finally {
      state.chatBusy = false;
      if (refs.chatSendBtn) refs.chatSendBtn.disabled = false;
      if (refs.chatInput) refs.chatInput.disabled = false;
    }
  };

  const bindChat = () => {
    refs.clearChatBtn?.addEventListener('click', () => {
      state.chatHistory = [];
      saveChatHistory();
      renderChat();
    });

    refs.chatSendBtn?.addEventListener('click', sendChatMessage);
    refs.chatInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
      }
    });
  };

  const init = () => {
    state.chatHistory = loadChatHistory();
    bindChat();
    renderChat();
  };

  App.chat = {
    init,
    renderChat,
    sendChatMessage,
  };
})();
