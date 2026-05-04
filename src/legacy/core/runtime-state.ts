// @ts-nocheck
(function () {
  'use strict';

  const App = window.GJHApp || (window.GJHApp = {});

  const state = {
    chatHistory: [],
    chatSessions: [],
    chatSessionId: '',
    conversationMenuQuery: '',
    chatBusy: false,
    dataAttachmentEnabled: false,
  };

  App.state = state;
})();
