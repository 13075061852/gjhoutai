// @ts-nocheck
import { ensureLegacyApp } from './app-context';

(function () {
  'use strict';

  const App = ensureLegacyApp();

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
