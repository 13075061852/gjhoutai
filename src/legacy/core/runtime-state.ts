import { ensureLegacyApp } from './app-context';

(function () {
  'use strict';

  const App = ensureLegacyApp();

  const state: LegacyState = {
    chatHistory: [],
    chatSessions: [],
    chatSessionId: '',
    conversationMenuQuery: '',
    chatBusy: false,
    dataAttachmentEnabled: false,
  };

  App.state = state;
})();
