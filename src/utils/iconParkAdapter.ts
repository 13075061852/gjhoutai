import {
  Add,
  Adjustment,
  Alarm,
  Attention,
  Badge,
  Box,
  CategoryManagement,
  ChartHistogram,
  Check,
  Checklist,
  Close,
  CloseOne,
  CloudStorage,
  CodeBrackets,
  Column,
  Config,
  Copy,
  Cpu,
  DatabaseConfig,
  Delete,
  DocDetail,
  Down,
  Download,
  Edit,
  Excel,
  Eyes,
  FileAddition,
  FileFailed,
  FileSearch,
  Fire,
  Flask,
  FolderUpload,
  FullScreen,
  Globe,
  GoldMedal,
  GridFour,
  HamburgerButton,
  History,
  Home,
  IdCard,
  Key,
  Left,
  LinkCloud,
  List,
  ListNumbers,
  Lock,
  MailPackage,
  MedalOne,
  MessageSecurity,
  NetworkTree,
  OffScreen,
  Theme,
  Percentage,
  Peoples,
  PeoplesTwo,
  Photograph,
  Play,
  Plug,
  PreviewCloseOne,
  Printer,
  Refresh,
  Right,
  Robot,
  Router,
  Save,
  Scale,
  Search,
  Send,
  Setting,
  Share,
  Shield,
  ShoppingCart,
  Stopwatch,
  Table,
  Tag,
  Thermometer,
  TreeDiagram,
  Upload,
  UploadPicture,
  User,
  UserBusiness,
  World,
} from '@icon-park/svg';

type IconRenderer = (props: {
  size?: string | number;
  strokeWidth?: number;
  theme?: 'outline' | 'filled' | 'two-tone' | 'multi-color';
  fill?: string | string[];
}) => string;

const iconMap: Record<string, IconRenderer> = {
  'ti-adjustments': Adjustment,
  'ti-alert-triangle': Attention,
  'ti-arrow-back-up': Left,
  'ti-binary-tree-2': TreeDiagram,
  'ti-braces': CodeBrackets,
  'ti-building-factory-2': UserBusiness,
  'ti-category': CategoryManagement,
  'ti-chart-bar': ChartHistogram,
  'ti-chart-bar-off': DatabaseConfig,
  'ti-chart-dots': ChartHistogram,
  'ti-check': Check,
  'ti-checklist': Checklist,
  'ti-checks': Check,
  'ti-chevron-down': Down,
  'ti-chevron-left': Left,
  'ti-chevron-right': Right,
  'ti-clipboard-copy': Copy,
  'ti-clipboard-list': List,
  'ti-cloud-data-connection': CloudStorage,
  'ti-copy': Copy,
  'ti-cpu-2': Cpu,
  'ti-crop': FullScreen,
  'ti-currency-yen': Percentage,
  'ti-database-off': DatabaseConfig,
  'ti-device-floppy': Save,
  'ti-download': Download,
  'ti-edit': Edit,
  'ti-eraser': CloseOne,
  'ti-eye': Eyes,
  'ti-eye-off': PreviewCloseOne,
  'ti-file-alert': FileFailed,
  'ti-file-description': DocDetail,
  'ti-file-plus': FileAddition,
  'ti-file-search': FileSearch,
  'ti-file-spreadsheet': Excel,
  'ti-file-text': DocDetail,
  'ti-flask-2': Flask,
  'ti-globe': Globe,
  'ti-history': History,
  'ti-home': Home,
  'ti-id-badge-2': IdCard,
  'ti-key': Key,
  'ti-layout-columns': Column,
  'ti-layout-grid': GridFour,
  'ti-layout-sidebar-right-collapse': Right,
  'ti-layout-sidebar-right-expand': Left,
  'ti-list': List,
  'ti-list-check': Checklist,
  'ti-list-details': List,
  'ti-list-numbers': ListNumbers,
  'ti-loader-2': Refresh,
  'ti-lock': Lock,
  'ti-maximize': FullScreen,
  'ti-medal': GoldMedal,
  'ti-medal-2': MedalOne,
  'ti-menu-2': HamburgerButton,
  'ti-message-2-cog': MessageSecurity,
  'ti-package': Box,
  'ti-package-export': MailPackage,
  'ti-package-import': MailPackage,
  'ti-palette': Theme,
  'ti-pencil': Edit,
  'ti-percentage': Percentage,
  'ti-photo-search': FileSearch,
  'ti-photo-up': UploadPicture,
  'ti-player-play': Play,
  'ti-player-stop-filled': Stopwatch,
  'ti-plug-connected': Plug,
  'ti-plug-off': CloseOne,
  'ti-plus': Add,
  'ti-printer': Printer,
  'ti-refresh': Refresh,
  'ti-restore': Refresh,
  'ti-robot': Robot,
  'ti-route': Router,
  'ti-scale': Scale,
  'ti-search': Search,
  'ti-send-2': Send,
  'ti-settings': Setting,
  'ti-share': Share,
  'ti-shield-check': Shield,
  'ti-shopping-cart': ShoppingCart,
  'ti-square-check': Check,
  'ti-table-options': Table,
  'ti-tags': Tag,
  'ti-test-pipe': Flask,
  'ti-thermometer': Thermometer,
  'ti-trash': Delete,
  'ti-upload': Upload,
  'ti-user': User,
  'ti-users': Peoples,
  'ti-users-group': PeoplesTwo,
  'ti-world': World,
  'ti-world-off': LinkCloud,
  'ti-world-search': Search,
  'ti-x': Close,
};

const iconClassPattern = /^ti-[a-z0-9-]+$/;

function getIconClass(element: Element) {
  return Array.from(element.classList).find((className) => iconClassPattern.test(className));
}

function renderIcon(element: Element) {
  const iconClass = getIconClass(element);
  if (!iconClass) return;

  const render = iconMap[iconClass];
  if (!render) return;

  const html = render({ size: '1em', strokeWidth: 4, theme: 'outline' });
  if ((element as HTMLElement).dataset.iconParkName === iconClass && element.innerHTML === html) return;

  element.innerHTML = html;
  (element as HTMLElement).dataset.iconParkName = iconClass;
  (element as HTMLElement).dataset.iconParkRendered = 'true';
}

function renderIcons(root: ParentNode = document) {
  root.querySelectorAll('.ti').forEach(renderIcon);
}

export function mountIconParkAdapter() {
  renderIcons();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes') {
        renderIcon(mutation.target as Element);
        return;
      }

      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.classList.contains('ti')) renderIcon(node);
        renderIcons(node);
      });
    });
  });

  observer.observe(document.body, {
    attributeFilter: ['class'],
    attributes: true,
    childList: true,
    subtree: true,
  });

  return () => observer.disconnect();
}
