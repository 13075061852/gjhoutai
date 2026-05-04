export {};

declare global {
  interface Window {
    GJHApp: Record<string, any>;
    App: Record<string, any>;
    XLSX?: any;
    JSZip?: any;
  }
}
