import {
  ActivitySource,
  Add,
  Adjustment,
  Alarm,
  AlarmClock,
  Airplane,
  ArrowLeft,
  ArrowRight,
  AssemblyLine,
  Attention,
  Badge,
  BoltOne,
  Box,
  BuildingOne,
  Calendar,
  Car,
  CategoryManagement,
  ChartHistogram,
  ChartLine,
  Check,
  CheckCorrect,
  Checklist,
  Close,
  CloseOne,
  CloudStorage,
  CodeBrackets,
  Column,
  Config,
  Copy,
  Cpu,
  Currency,
  DatabaseConfig,
  Delete,
  Devices,
  Diamond,
  DocDetail,
  Dollar,
  Down,
  Download,
  Edit,
  Excel,
  Eyes,
  FileAddition,
  FileFailed,
  FilePdf,
  FileSearch,
  Fire,
  Flask,
  FolderUpload,
  FullScreen,
  Globe,
  GoldMedal,
  Gps,
  GridFour,
  HamburgerButton,
  HighHeeledShoes,
  History,
  Home,
  IdCard,
  Info,
  Key,
  Left,
  Light,
  LinkCloud,
  LinkOut,
  List,
  ListNumbers,
  Lock,
  MailPackage,
  MapTwo,
  MedalOne,
  Message,
  MessageSecurity,
  Minus,
  Moon,
  NetworkTree,
  OffScreen,
  PaperMoneyTwo,
  Percentage,
  Peoples,
  PeoplesTwo,
  PhoneCall,
  Photograph,
  Play,
  Plug,
  PreviewCloseOne,
  Printer,
  Radar,
  Refresh,
  Right,
  Robot,
  Round,
  Router,
  Save,
  Scale,
  Search,
  Seedling,
  Send,
  Setting,
  Share,
  Shield,
  ShoppingCart,
  Sofa,
  Star,
  Stopwatch,
  Success,
  Sun,
  Table,
  Tag,
  Theme,
  Thermometer,
  Time,
  TreeDiagram,
  TrendingDown,
  TrendingUp,
  Upload,
  UploadPicture,
  User,
  UserBusiness,
  World,
  Zoom,
} from '@icon-park/svg';

type IconRenderer = (props: {
  size?: string | number;
  strokeWidth?: number;
  theme?: 'outline' | 'filled' | 'two-tone' | 'multi-color';
  fill?: string | string[];
}) => string;

const iconMap: Record<string, IconRenderer> = {
  'ti-activity': ActivitySource,
  'ti-adjustments': Adjustment,
  'ti-adjustments-horizontal': Adjustment,
  'ti-alert-triangle': Attention,
  'ti-arrow-back-up': Left,
  'ti-arrow-left': ArrowLeft,
  'ti-arrow-right': ArrowRight,
  'ti-armchair': Sofa,
  'ti-assembly': AssemblyLine,
  'ti-binary-tree-2': TreeDiagram,
  'ti-bolt': BoltOne,
  'ti-braces': CodeBrackets,
  'ti-building': BuildingOne,
  'ti-building-factory-2': UserBusiness,
  'ti-bulb': Light,
  'ti-calendar-check': Calendar,
  'ti-car': Car,
  'ti-category': CategoryManagement,
  'ti-chart-bar': ChartHistogram,
  'ti-chart-bar-off': DatabaseConfig,
  'ti-chart-dots': ChartHistogram,
  'ti-chart-dots-3': ChartHistogram,
  'ti-chart-line': ChartLine,
  'ti-check': Check,
  'ti-checkup-list': Checklist,
  'ti-checklist': Checklist,
  'ti-checks': Check,
  'ti-chevron-down': Down,
  'ti-chevron-left': Left,
  'ti-chevron-right': Right,
  'ti-circle': Round,
  'ti-circle-check': CheckCorrect,
  'ti-circle-check-filled': Success,
  'ti-clipboard-copy': Copy,
  'ti-clipboard-list': List,
  'ti-clock': Time,
  'ti-clock-filled': Time,
  'ti-clock-history': History,
  'ti-clock-off': AlarmClock,
  'ti-cloud-data-connection': CloudStorage,
  'ti-coins': PaperMoneyTwo,
  'ti-copy': Copy,
  'ti-cpu': Cpu,
  'ti-cpu-2': Cpu,
  'ti-crop': FullScreen,
  'ti-current-location': Gps,
  'ti-currency-dollar': Dollar,
  'ti-currency-yen': Percentage,
  'ti-currency-yuan': Currency,
  'ti-database-edit': DatabaseConfig,
  'ti-database-off': DatabaseConfig,
  'ti-device-mobile': Devices,
  'ti-device-floppy': Save,
  'ti-diamond': Diamond,
  'ti-download': Download,
  'ti-edit': Edit,
  'ti-eraser': CloseOne,
  'ti-eye': Eyes,
  'ti-eye-off': PreviewCloseOne,
  'ti-external-link': LinkOut,
  'ti-file-alert': FileFailed,
  'ti-file-description': DocDetail,
  'ti-file-plus': FileAddition,
  'ti-file-search': FileSearch,
  'ti-file-spreadsheet': Excel,
  'ti-file-text': DocDetail,
  'ti-file-type-docx': DocDetail,
  'ti-file-type-pdf': FilePdf,
  'ti-file-upload': FolderUpload,
  'ti-flask': Flask,
  'ti-flask-2': Flask,
  'ti-globe': Globe,
  'ti-history': History,
  'ti-home': Home,
  'ti-id-badge-2': IdCard,
  'ti-info-circle': Info,
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
  'ti-map': MapTwo,
  'ti-maximize': FullScreen,
  'ti-medal': GoldMedal,
  'ti-medal-2': MedalOne,
  'ti-menu-2': HamburgerButton,
  'ti-message-2-cog': MessageSecurity,
  'ti-message-circle': Message,
  'ti-minus': Minus,
  'ti-moon-stars': Moon,
  'ti-package': Box,
  'ti-package-export': MailPackage,
  'ti-package-import': MailPackage,
  'ti-palette': Theme,
  'ti-pencil': Edit,
  'ti-percentage': Percentage,
  'ti-phone-call': PhoneCall,
  'ti-photo': Photograph,
  'ti-photo-spark': Photograph,
  'ti-photo-search': FileSearch,
  'ti-photo-up': UploadPicture,
  'ti-plane': Airplane,
  'ti-video': Play,
  'ti-player-play': Play,
  'ti-player-play-filled': Play,
  'ti-player-stop-filled': Stopwatch,
  'ti-plug-connected': Plug,
  'ti-plug-off': CloseOne,
  'ti-plus': Add,
  'ti-printer': Printer,
  'ti-radar': Radar,
  'ti-refresh': Refresh,
  'ti-restore': Refresh,
  'ti-robot': Robot,
  'ti-route': Router,
  'ti-scale': Scale,
  'ti-search': Search,
  'ti-seeding': Seedling,
  'ti-send-2': Send,
  'ti-settings': Setting,
  'ti-schema': NetworkTree,
  'ti-share': Share,
  'ti-shield-check': Shield,
  'ti-shoe': HighHeeledShoes,
  'ti-shopping-cart': ShoppingCart,
  'ti-sparkles': Star,
  'ti-square-check': Check,
  'ti-star': Star,
  'ti-sun': Sun,
  'ti-table': Table,
  'ti-table-import': Table,
  'ti-table-options': Table,
  'ti-table-search': Table,
  'ti-tags': Tag,
  'ti-test-pipe': Flask,
  'ti-thermometer': Thermometer,
  'ti-trash': Delete,
  'ti-trending-down': TrendingDown,
  'ti-trending-up': TrendingUp,
  'ti-upload': Upload,
  'ti-user': User,
  'ti-users': Peoples,
  'ti-users-group': PeoplesTwo,
  'ti-world': World,
  'ti-world-off': LinkCloud,
  'ti-world-search': Search,
  'ti-x': Close,
  'ti-zoom-check-filled': Zoom,
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
  root.querySelectorAll('.ti').forEach((element) => {
    renderIcon(element);
    observeIconClass(element);
  });
}

const observedIconElements = new WeakSet<Element>();
const iconAttributeObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    if (mutation.type === 'attributes') renderIcon(mutation.target as Element);
  });
});

function observeIconClass(element: Element) {
  if (observedIconElements.has(element)) return;
  observedIconElements.add(element);
  iconAttributeObserver.observe(element, { attributeFilter: ['class'], attributes: true });
}

export function mountIconParkAdapter() {
  renderIcons();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.classList.contains('ti')) {
          renderIcon(node);
          observeIconClass(node);
        }
        renderIcons(node);
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return () => {
    observer.disconnect();
    iconAttributeObserver.disconnect();
  };
}
