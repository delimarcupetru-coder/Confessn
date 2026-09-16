import { useEffect, useMemo, useRef, useState } from 'react'
import heic2any from 'heic2any'
import { supabase } from './supabase'
import './App.css'

type Language = 'en' | 'fr' | 'zh' | 'de' | 'it' | 'es' | 'ja'

type Folder = {
  id: string
  name: string
}

type ProjectRecord = {
  id: string
  name: string
  size: string
  style: string
  color: string
  notes: string
  folderId: string
  artwork: string | null
  createdAt: string
  frameEnabled?: boolean
  matEnabled?: boolean
  matColorId?: string
  stripColorId?: string
  stripEnabled?: boolean
  artworkRatio?: number
  zoom?: number
  artPosition?: { x: number; y: number }
  frameThickness?: number
  matMargin?: number
  stripThickness?: number
}

type Account = {
  name: string
  email: string
  avatar?: string
  folders: Folder[]
  activeFolderId: string
  projects: ProjectRecord[]
}

type LocalAuth = {
  email: string
  username: string
  passwordHash: string
  account: Account
}

type FrameOption = {
  id: string
  label: string
  description: string
  icon: string
}

type ColorOption = {
  id: string
  name: string
  hex: string
}

const defaultAccount: Account = {
  name: 'Guest customer',
  email: 'hello@virtualartframingstudio.com',
  folders: [{ id: 'all', name: 'All projects' }],
  activeFolderId: 'all',
  projects: [],
}

const translations = {
  en: {
    brand: 'Virtual Art Framing Studio',
    navWork: 'Workspace',
    navProjects: 'Projects',
    navAbout: 'About',
    navContact: 'Contact',
    logIn: 'Log in',
    createAccount: 'Create Account',
    cta: 'Book a consult',
    heroTag: 'Custom framing • Preserved art • Made for your walls',
    heroTitle: 'Design the perfect frame for your artwork.',
    heroText:
      'Upload your piece, choose your frame profile, compare finish colors, and save your favorite concepts before ordering.',
    browse: 'Browse gallery',
    start: 'Start your project',
    folderTitle: 'Project folders',
    folderName: 'New folder name',
    folderAdd: 'Add folder',
    uploadTitle: 'Upload artwork',
    uploadHint: 'PNG, JPG, or HEIC',
    styleTitle: 'Frame profile',
    sizeTitle: 'Field size',
    sizeNarrow: 'Narrow profile',
    sizeMedium: 'Medium profile',
    sizeLarge: 'Large profile',
    colorTitle: 'Frame color',
    projectTitle: 'Project title',
    notesTitle: 'Design notes',
    notesHint: 'Tell us what mood, room, or finish you want.',
    save: 'Save project',
    share: 'Share for opinion',
    submit: 'Submit order',
    saved: 'Project saved to your device',
    shared: 'Share link copied to clipboard',
    galleryTitle: 'Recently framed',
    quote: 'See your art in a new light.',
    follow: 'Follow us',
    contactTitle: 'Contact us',
    contactName: 'Your name',
    send: 'Send',
    languages: 'Languages',
    placeholder: 'Tell us about your space and the mood you want for the frame.',
    customerProjects: 'My projects',
    market: 'A thoughtful framing studio for collectors, interiors, and gifting.',
    orderSummary: 'Order summary',
    template: 'Template',
    noProjects: 'No saved projects yet.',
    savedProjects: 'Saved projects',
    frame: 'Frame',
    mat: 'Mat',
    allFolders: 'All projects',
    loadedProject: 'Loaded preview',
    whiteWall: 'White wall',
    warmLight: 'Warm light',
    delete: 'Delete folder',
    newFolder: 'New folder',
    saveFolder: 'Save folder',
    projectCreated: 'Project folder created',
  },
  fr: {
    brand: 'Atelier de Cadres d’Art Virtuel',
    navWork: 'Espace',
    navProjects: 'Projets',
    navAbout: 'À propos',
    navContact: 'Contact',
    logIn: 'Connexion',
    createAccount: 'Créer un compte',
    cta: 'Prendre rendez-vous',
    heroTag: 'Cadres sur mesure • Art préservé • Pour vos murs',
    heroTitle: 'Créez le cadre parfait pour votre œuvre.',
    heroText:
      'Téléchargez votre pièce, choisissez votre profil, comparez les finitions, puis sauvegardez vos idées avant la commande.',
    browse: 'Voir la galerie',
    start: 'Commencer',
    folderTitle: 'Dossiers de projets',
    folderName: 'Nom du nouveau dossier',
    folderAdd: 'Ajouter',
    uploadTitle: 'Téléverser une œuvre',
    uploadHint: 'PNG, JPG ou HEIC',
    styleTitle: 'Profil du cadre',
    sizeTitle: 'Largeur du champ',
    sizeNarrow: 'Profil étroit',
    sizeMedium: 'Profil moyen',
    sizeLarge: 'Profil large',
    colorTitle: 'Couleur du cadre',
    projectTitle: 'Titre du projet',
    notesTitle: 'Notes de design',
    notesHint: 'Décrivez l’ambiance, la pièce ou la finition souhaitée.',
    save: 'Enregistrer',
    share: 'Partager pour avis',
    submit: 'Envoyer la commande',
    saved: 'Projet enregistré sur votre appareil',
    shared: 'Lien de partage copié',
    galleryTitle: 'Récemment encadrés',
    quote: 'Voyez votre art sous un nouveau jour.',
    follow: 'Suivez-nous',
    contactTitle: 'Contactez-nous',
    contactName: 'Votre nom',
    send: 'Envoyer',
    languages: 'Langues',
    placeholder: 'Parlez-nous de votre espace et de l’ambiance que vous souhaitez pour le cadre.',
    customerProjects: 'Mes projets',
    market: 'Un atelier d’encadrement pensé pour les collectionneurs, les intérieurs et les cadeaux.',
    orderSummary: 'Résumé de commande',
    template: 'Modèle',
    noProjects: 'Aucun projet enregistré pour le moment.',
    savedProjects: 'Projets enregistrés',
    frame: 'Cadre',
    mat: 'Passe-partout',
    allFolders: 'Tous les projets',
    loadedProject: 'Aperçu chargé',
    whiteWall: 'Mur blanc',
    warmLight: 'Lumière chaude',
    delete: 'Supprimer le dossier',
    newFolder: 'Nouveau dossier',
    saveFolder: 'Enregistrer',
    projectCreated: 'Dossier créé',
  },
  zh: {
    brand: '虚拟艺术装裱工作室',
    navWork: '工作区',
    navProjects: '项目',
    navAbout: '关于',
    navContact: '联系',
    logIn: '登录',
    createAccount: '创建账户',
    cta: '预约咨询',
    heroTag: '定制装裱 • 保护作品 • 为墙面量身定制',
    heroTitle: '为您的作品定制完美画框。',
    heroText: '上传作品，选择框型，比较色板，并在下单前保存最喜欢的方案。',
    browse: '浏览作品集',
    start: '开始项目',
    folderTitle: '项目文件夹',
    folderName: '新文件夹名称',
    folderAdd: '添加文件夹',
    uploadTitle: '上传作品',
    uploadHint: 'PNG、JPG 或 HEIC',
    styleTitle: '画框类型',
    sizeTitle: '边框尺寸',
    sizeNarrow: '窄版型',
    sizeMedium: '中版型',
    sizeLarge: '大版型',
    colorTitle: '画框颜色',
    projectTitle: '项目名称',
    notesTitle: '设计备注',
    notesHint: '告诉我们您想要的氛围、空间和质感。',
    save: '保存项目',
    share: '分享给朋友',
    submit: '提交订单',
    saved: '项目已保存到本地',
    shared: '分享链接已复制到剪贴板',
    galleryTitle: '最近装裱',
    quote: '让你的艺术焕发新光彩。',
    follow: '关注我们',
    contactTitle: '联系我们',
    contactName: '您的姓名',
    send: '发送',
    languages: '语言',
    placeholder: '告诉我们您想要的空间氛围和画框风格。',
    customerProjects: '我的项目',
    market: '为收藏者、室内设计与礼赠场景打造的装裱工作室。',
    orderSummary: '订单摘要',
    template: '模板',
    noProjects: '还没有已保存项目。',
    savedProjects: '已保存项目',
    frame: '框架',
    mat: '底板',
    allFolders: '全部项目',
    loadedProject: '已加载预览',
    whiteWall: '白墙',
    warmLight: '暖光',
    delete: '删除文件夹',
    newFolder: '新文件夹',
    saveFolder: '保存',
    projectCreated: '文件夹已创建',
  },
  de: {
    brand: 'Virtuelles Kunstrahmen-Studio',
    navWork: 'Arbeitsbereich',
    navProjects: 'Projekte',
    navAbout: 'Über uns',
    navContact: 'Kontakt',
    logIn: 'Anmelden',
    createAccount: 'Konto erstellen',
    cta: 'Beratung buchen',
    heroTag: 'Maßanfertigung • Kunst geschützt • Für Ihre Wände',
    heroTitle: 'Gestalten Sie den perfekten Rahmen für Ihr Kunstwerk.',
    heroText:
      'Laden Sie Ihr Werk hoch, wählen Sie das Profil, vergleichen Sie Farben und speichern Sie Ihr Favoriten vor dem Bestellen.',
    browse: 'Galerie ansehen',
    start: 'Projekt starten',
    folderTitle: 'Projektordner',
    folderName: 'Name des neuen Ordners',
    folderAdd: 'Ordner hinzufügen',
    uploadTitle: 'Kunstwerk hochladen',
    uploadHint: 'PNG, JPG oder HEIC',
    styleTitle: 'Rahmenprofil',
    sizeTitle: 'Feldgröße',
    sizeNarrow: 'Schmales Profil',
    sizeMedium: 'Mittleres Profil',
    sizeLarge: 'Großes Profil',
    colorTitle: 'Rahmenfarbe',
    projectTitle: 'Projektname',
    notesTitle: 'Designnotizen',
    notesHint: 'Sagen Sie uns, welche Stimmung, Raum oder Oberfläche Sie wünschen.',
    save: 'Projekt speichern',
    share: 'Für Feedback teilen',
    submit: 'Bestellung senden',
    saved: 'Projekt auf dem Gerät gespeichert',
    shared: 'Freigabelink in die Zwischenablage kopiert',
    galleryTitle: 'Kürzlich gerahmt',
    quote: 'Sehen Sie Ihre Kunst in neuem Licht.',
    follow: 'Folgen Sie uns',
    contactTitle: 'Kontaktieren Sie uns',
    contactName: 'Ihr Name',
    send: 'Senden',
    languages: 'Sprachen',
    placeholder: 'Erzählen Sie uns von Ihrem Raum und der Stimmung, die Sie für den Rahmen wünschen.',
    customerProjects: 'Meine Projekte',
    market: 'Ein durchdachtes Rahmungsstudio für Sammler, Innenräume und Geschenke.',
    orderSummary: 'Bestellübersicht',
    template: 'Vorlage',
    noProjects: 'Noch keine gespeicherten Projekte.',
    savedProjects: 'Gespeicherte Projekte',
    frame: 'Rahmen',
    mat: 'Passepartout',
    allFolders: 'Alle Projekte',
    loadedProject: 'Vorschau geladen',
    whiteWall: 'Weiße Wand',
    warmLight: 'Warmes Licht',
    delete: 'Ordner löschen',
    newFolder: 'Neuer Ordner',
    saveFolder: 'Speichern',
    projectCreated: 'Ordner erstellt',
  },
  it: {
    brand: 'Virtual Art Framing Studio',
    navWork: 'Workspace',
    navProjects: 'Progetti',
    navAbout: 'Chi siamo',
    navContact: 'Contatti',
    logIn: 'Accedi',
    createAccount: 'Crea account',
    cta: 'Prenota consulto',
    heroTag: 'Cornici su misura • Arte preservata • Per le tue pareti',
    heroTitle: 'Crea la cornice perfetta per la tua opera.',
    heroText:
      'Carica il tuo pezzo, scegli il profilo, confronta i colori e salva le tue idee prima dell’ordine.',
    browse: 'Sfoglia la galleria',
    start: 'Inizia il progetto',
    folderTitle: 'Cartelle progetti',
    folderName: 'Nome nuova cartella',
    folderAdd: 'Aggiungi cartella',
    uploadTitle: 'Carica opera',
    uploadHint: 'PNG, JPG o HEIC',
    styleTitle: 'Profilo telaio',
    sizeTitle: 'Dimensione campo',
    sizeNarrow: 'Profilo stretto',
    sizeMedium: 'Profilo medio',
    sizeLarge: 'Profilo largo',
    colorTitle: 'Colore telaio',
    projectTitle: 'Titolo progetto',
    notesTitle: 'Note di design',
    notesHint: 'Dicci l’atmosfera, l’ambiente o la finitura che desideri.',
    save: 'Salva progetto',
    share: 'Condividi per parere',
    submit: 'Invia ordine',
    saved: 'Progetto salvato sul dispositivo',
    shared: 'Link di condivisione copiato',
    galleryTitle: 'Recentemente incorniciati',
    quote: 'Vedi la tua arte sotto una nuova luce.',
    follow: 'Seguici',
    contactTitle: 'Contattaci',
    contactName: 'Il tuo nome',
    send: 'Invia',
    languages: 'Lingue',
    placeholder: 'Parlaci dello spazio e dell’atmosfera che vuoi per la cornice.',
    customerProjects: 'I miei progetti',
    market: 'Uno studio di incorniciatura pensato per collezionisti, interni e regali.',
    orderSummary: 'Riepilogo ordine',
    template: 'Modello',
    noProjects: 'Nessun progetto salvato ancora.',
    savedProjects: 'Progetti salvati',
    frame: 'Telaio',
    mat: 'Passpartout',
    allFolders: 'Tutti i progetti',
    loadedProject: 'Anteprima caricata',
    whiteWall: 'Parete bianca',
    warmLight: 'Luce calda',
    delete: 'Elimina cartella',
    newFolder: 'Nuova cartella',
    saveFolder: 'Salva',
    projectCreated: 'Cartella creata',
  },
  es: {
    brand: 'Estudio de Enmarcado Virtual',
    navWork: 'Espacio',
    navProjects: 'Proyectos',
    navAbout: 'Nosotros',
    navContact: 'Contacto',
    logIn: 'Iniciar sesión',
    createAccount: 'Crear cuenta',
    cta: 'Reservar consulta',
    heroTag: 'Enmarcado a medida • Arte protegida • Para tus paredes',
    heroTitle: 'Diseña el marco perfecto para tu obra.',
    heroText:
      'Sube tu pieza, elige el perfil, compara acabados y guarda tus favoritos antes de pedir.',
    browse: 'Explorar galería',
    start: 'Iniciar proyecto',
    folderTitle: 'Carpetas de proyectos',
    folderName: 'Nombre de la nueva carpeta',
    folderAdd: 'Añadir carpeta',
    uploadTitle: 'Subir obra',
    uploadHint: 'PNG, JPG o HEIC',
    styleTitle: 'Perfil del marco',
    sizeTitle: 'Tamaño del campo',
    sizeNarrow: 'Perfil estrecho',
    sizeMedium: 'Perfil medio',
    sizeLarge: 'Perfil ancho',
    colorTitle: 'Color del marco',
    projectTitle: 'Título del proyecto',
    notesTitle: 'Notas de diseño',
    notesHint: 'Cuéntanos el ambiente, la habitación o el acabado que quieres.',
    save: 'Guardar proyecto',
    share: 'Compartir para opinión',
    submit: 'Enviar pedido',
    saved: 'Proyecto guardado en el dispositivo',
    shared: 'Enlace compartido copiado',
    galleryTitle: 'Recientemente enmarcadas',
    quote: 'Ve tu arte con otra luz.',
    follow: 'Síguenos',
    contactTitle: 'Contáctanos',
    contactName: 'Tu nombre',
    send: 'Enviar',
    languages: 'Idiomas',
    placeholder: 'Cuéntanos sobre tu espacio y el ambiente que quieres para el marco.',
    customerProjects: 'Mis proyectos',
    market: 'Un taller de enmarcado pensado para coleccionistas, interiores y regalos.',
    orderSummary: 'Resumen del pedido',
    template: 'Plantilla',
    noProjects: 'Todavía no hay proyectos guardados.',
    savedProjects: 'Proyectos guardados',
    frame: 'Marco',
    mat: 'Paspartú',
    allFolders: 'Todos los proyectos',
    loadedProject: 'Vista previa cargada',
    whiteWall: 'Pared blanca',
    warmLight: 'Luz cálida',
    delete: 'Eliminar carpeta',
    newFolder: 'Nueva carpeta',
    saveFolder: 'Guardar',
    projectCreated: 'Carpeta creada',
  },
  ja: {
    brand: 'バーチャル・アート・フレーミング・スタジオ',
    navWork: 'ワークスペース',
    navProjects: 'プロジェクト',
    navAbout: '会社概要',
    navContact: 'お問い合わせ',
    logIn: 'ログイン',
    createAccount: 'アカウント作成',
    cta: '相談を予約',
    heroTag: 'オーダーメイド額装 • 作品保護 • 壁に合わせて',
    heroTitle: '作品にぴったりの額縁をデザイン。',
    heroText: '作品をアップロードして、額縁の形状と色を比較し、注文前に気に入った案を保存できます。',
    browse: 'ギャラリーを見る',
    start: 'プロジェクト開始',
    folderTitle: 'プロジェクトフォルダ',
    folderName: '新しいフォルダ名',
    folderAdd: 'フォルダ追加',
    uploadTitle: '作品をアップロード',
    uploadHint: 'PNG、JPG、HEIC',
    styleTitle: '額縁の種類',
    sizeTitle: '額縁サイズ',
    sizeNarrow: 'ナロー',
    sizeMedium: 'ミディアム',
    sizeLarge: 'ラージ',
    colorTitle: '額縁カラー',
    projectTitle: 'プロジェクト名',
    notesTitle: 'デザインメモ',
    notesHint: '希望の雰囲気、部屋、仕上げを教えてください。',
    save: 'プロジェクトを保存',
    share: '意見をもらう',
    submit: '注文を送信',
    saved: '端末にプロジェクトを保存しました',
    shared: '共有リンクをコピーしました',
    galleryTitle: '最近の額装作品',
    quote: 'あなたのアートを新しい光で見てください。',
    follow: 'フォローする',
    contactTitle: 'お問い合わせ',
    contactName: 'お名前',
    send: '送信',
    languages: '言語',
    placeholder: '部屋の雰囲気や、希望する額縁の印象を教えてください。',
    customerProjects: 'マイプロジェクト',
    market: 'コレクター、インテリア、ギフト向けの丁寧な額装スタジオ。',
    orderSummary: '注文概要',
    template: 'テンプレート',
    noProjects: '保存されたプロジェクトはまだありません。',
    savedProjects: '保存済みプロジェクト',
    frame: '額縁',
    mat: 'マット',
    allFolders: 'すべてのプロジェクト',
    loadedProject: 'プレビュー読み込み済み',
    whiteWall: '白い壁',
    warmLight: '温かい光',
    delete: 'フォルダ削除',
    newFolder: '新規フォルダ',
    saveFolder: '保存',
    projectCreated: 'フォルダを作成しました',
  },
} as const

const materialOptions: FrameOption[] = [
  { id: 'darkwood', label: 'Dark Wood', description: 'Deep natural grain', icon: '▥' },
  { id: 'stainless', label: 'Stainless Steel', description: 'Cool metallic finish', icon: '▤' },
  { id: 'lightwood', label: 'Light Wood', description: 'Warm natural grain', icon: '▦' },
  { id: 'engravedwood', label: 'Engraved Wood', description: 'Detailed carved grain', icon: '▧' },
]

const frameTypeOptions: FrameOption[] = [
  { id: 'floating', label: 'Floating', description: 'Open gap around the mat', icon: '▣' },
  { id: 'classic', label: 'Classic', description: 'Timeless profile', icon: '◫' },
  { id: 'studio', label: 'Studio', description: 'Clean professional profile', icon: '▭' },
  { id: 'modern', label: 'Modern', description: 'Minimal crisp profile', icon: '□' },
]

const sizeOptions = [
  { id: 'narrow', label: 'Narrow', description: 'Slim, delicate finish', icon: '▎' },
  { id: 'medium', label: 'Medium', description: 'Balanced and versatile', icon: '▭' },
  { id: 'large', label: 'Large', description: 'Bold statement borders', icon: '▮' },
]

const colorOptions: ColorOption[] = [
  { id: 'ivory', name: 'Ivory', hex: '#f4e9d8' },
  { id: 'walnut', name: 'Walnut', hex: '#5e3727' },
  { id: 'oak', name: 'Oak', hex: '#c9a36b' },
  { id: 'sage', name: 'Sage', hex: '#a7b39a' },
  { id: 'rust', name: 'Rust', hex: '#b8583a' },
]

const matColorOptions: ColorOption[] = [
  { id: 'yellow', name: 'Yellow', hex: '#f2d34f' },
  { id: 'light-blue', name: 'Light Blue', hex: '#b9dced' },
  { id: 'sky-blue', name: 'Sky Blue', hex: '#74b9e6' },
  { id: 'carrot', name: 'Carrot', hex: '#ed934d' },
  { id: 'phosphate', name: 'Phosphate', hex: '#d9c89f' },
  { id: 'cobalt', name: 'Cobalt', hex: '#3156a3' },
  { id: 'copper-hydroxide-phosphate', name: 'Copper Hydroxide Phosphate', hex: '#70a89b' },
  { id: 'nickel-phosphate-octahydrate', name: 'Nikel Phosphate Octahydrate', hex: '#91a6b5' },
  { id: 'cristal-zinc-nickel-phosphate', name: 'Cristal Zinc Nickel Phosphate', hex: '#c5d0d4' },
  { id: 'nickel-phosphate', name: 'Nickel Phosphate', hex: '#b6b7ad' },
  { id: 'chromium-phosphate', name: 'Chromium Phosphate', hex: '#76948c' },
]

const stripColorOptions: ColorOption[] = [
  { id: 'red', name: 'Red', hex: '#c94242' },
  { id: 'blue', name: 'Blue', hex: '#356bc1' },
  { id: 'purple', name: 'Purple', hex: '#8152ad' },
  { id: 'green', name: 'Green', hex: '#4e9560' },
  { id: 'black', name: 'Black', hex: '#1d1d22' },
  ...colorOptions,
]

const galleryItems = [
  {
    title: 'Monochrome Morning',
    image:
      'https://images.unsplash.com/photo-1515405295579-ba7b45403062?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Coastal Stillness',
    image:
      'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Hunter & Linen',
    image:
      'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Golden Hour',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
  },
]

const portfolioIcons = {
  maps: '⌖',
  instagram: '◎',
  linkedin: 'in',
  youtube: '▶',
}

function App() {
  useEffect(() => {
    document.title = 'VAFS'
  }, [])

  const [language, setLanguage] = useState<Language>('en')
  const [frameEnabled, setFrameEnabled] = useState(true)
  const [matEnabled, setMatEnabled] = useState(true)
  const [selectedStyle, setSelectedStyle] = useState(materialOptions[0].id)
  const [selectedFrameType, setSelectedFrameType] = useState(frameTypeOptions[0].id)
  const [selectedSize, setSelectedSize] = useState(sizeOptions[1].id)
  const [selectedColor, setSelectedColor] = useState(colorOptions[1])
  const [selectedMatColor, setSelectedMatColor] = useState(matColorOptions[0])
  const [selectedStripColor, setSelectedStripColor] = useState(stripColorOptions[0])
  const [stripEnabled, setStripEnabled] = useState(true)
  const [artwork, setArtwork] = useState<string | null>(null)
  const [artworkRatio, setArtworkRatio] = useState(4 / 5)
  const [frameOrientation, setFrameOrientation] = useState<'vertical' | 'horizontal'>('vertical')
  const [uploadMessage, setUploadMessage] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'create' | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const sessionActivityKey = 'virtual-art-framing-session-activity'
  const [authUsername, setAuthUsername] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [authSuccessMessage, setAuthSuccessMessage] = useState('')
  const [showAccountDialog, setShowAccountDialog] = useState(false)
  const [profileUsername, setProfileUsername] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePassword, setProfilePassword] = useState('')
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>()
  const [profileAvatarZoom, setProfileAvatarZoom] = useState(1)
  const [profileImageLoading, setProfileImageLoading] = useState(false)
  const [profileImageError, setProfileImageError] = useState('')
  const profileImageInputRef = useRef<HTMLInputElement | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [showFolderDialog, setShowFolderDialog] = useState(false)
  const [projectFileName, setProjectFileName] = useState('my-framing-project')
  const [contactName, setContactName] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [zoom, setZoom] = useState(1)
  const [wallTone, setWallTone] = useState<'white' | 'warm'>('white')
  const [frameThickness, setFrameThickness] = useState(18)
  const [matMargin, setMatMargin] = useState(14)
  const [stripThickness, setStripThickness] = useState(2)
  const [artPosition, setArtPosition] = useState({ x: 0, y: 0 })
  const [artDrag, setArtDrag] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [artWidthInches, setArtWidthInches] = useState(12)
  const [artHeightInches, setArtHeightInches] = useState(15)
  const [frameWidthInches] = useState(16)
  const [frameHeightInches] = useState(20)
  const standardFrameSizes = [
    { width: 8, height: 10 },
    { width: 11, height: 14 },
    { width: 12, height: 16 },
    { width: 16, height: 20 },
    { width: 18, height: 24 },
    { width: 20, height: 24 },
    { width: 24, height: 30 },
    { width: 24, height: 36 },
    { width: 30, height: 40 },
  ]
  const [standardFrameSizeIndex, setStandardFrameSizeIndex] = useState(0)
  const [showDimensions] = useState(false)
  const [showDimensionsDialog, setShowDimensionsDialog] = useState(false)
  const [resizeDrag, setResizeDrag] = useState<{ kind: 'frame' | 'mat' | 'strip'; startY: number; startValue: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const captureRef = useRef<HTMLDivElement | null>(null)
  const pinchDistanceRef = useRef<number | null>(null)
  const restoringProjectRef = useRef(0)

  const [account, setAccount] = useState<Account>(() => {
    const saved = window.localStorage.getItem('virtual-art-framing-studio-account')
    if (saved) {
      try {
        return JSON.parse(saved) as Account
      } catch {
        return defaultAccount
      }
    }
    return defaultAccount
  })
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let mounted = true
    const loadSessionProfile = async () => {
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      const user = data.session?.user
      if (!user) {
        setAuthUserId(null)
        setAuthReady(true)
        return
      }
      setAuthUserId(user.id)
      const { data: profile } = await supabase.from('user_profiles').select('account').eq('user_id', user.id).maybeSingle()
      if (profile?.account) setAccount(profile.account as Account)
      setAccount((current) => ({ ...current, name: user.user_metadata.username ?? current.name, email: user.email ?? current.email }))
      setIsLoggedIn(true)
      setAuthReady(true)
    }
    void loadSessionProfile()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        setAuthUserId(null)
        setAuthReady(true)
        setIsLoggedIn(false)
        return
      }
      setAuthReady(false)
      setAuthUserId(session.user.id)
      setAccount((current) => ({
        ...current,
        name: session.user.user_metadata.username ?? current.name,
        email: session.user.email ?? current.email,
      }))
      setIsLoggedIn(true)
      if (event === 'SIGNED_IN' && (window.location.search.includes('code=') || window.location.hash.includes('access_token'))) {
        setAuthSuccessMessage('Authentication successful!')
        window.setTimeout(() => setAuthSuccessMessage(''), 6000)
      }
      window.setTimeout(() => {
        void supabase.from('user_profiles').select('account').eq('user_id', session.user.id).maybeSingle().then(({ data: profile }) => {
          if (profile?.account) setAccount(profile.account as Account)
          setAuthReady(true)
        })
      }, 0)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isLoggedIn || !authReady) return
    const timeoutMs = 10 * 60 * 1000
    const markActivity = () => window.localStorage.setItem(sessionActivityKey, String(Date.now()))
    const checkActivity = () => {
      const lastActivity = Number(window.localStorage.getItem(sessionActivityKey) ?? Date.now())
      if (Date.now() - lastActivity >= timeoutMs) {
        void supabase.auth.signOut()
        window.localStorage.removeItem(sessionActivityKey)
        setIsLoggedIn(false)
      }
    }
    markActivity()
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'] as const
    events.forEach((eventName) => window.addEventListener(eventName, markActivity, { passive: true }))
    const timer = window.setInterval(checkActivity, 30000)
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, markActivity))
      window.clearInterval(timer)
    }
  }, [isLoggedIn])

  const t = translations[language]

  const hashPassword = async (password: string) => {
    const data = new TextEncoder().encode(password)
    const digest = await crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  const submitAuth = async () => {
    const email = authEmail.trim().toLowerCase()
    const username = authUsername.trim()
    if (!email || authPassword.length < 6) {
      setAuthMessage('Enter an email and a password with at least 6 characters.')
      return
    }
    if (authMode === 'create' && !username) {
      setAuthMessage('Enter a username.')
      return
    }
    const supabaseResult = authMode === 'create'
      ? await supabase.auth.signUp({
        email,
        password: authPassword,
        options: {
          data: { username },
          emailRedirectTo: window.location.origin,
        },
      })
      : await supabase.auth.signInWithPassword({ email, password: authPassword })

    if (supabaseResult.error) {
      setAuthMessage(supabaseResult.error.message)
      return
    }

    if (authMode === 'create' && !supabaseResult.data.session) {
      setAuthMessage('Account created. Check your email to confirm the account, then log in.')
      return
    }

    const user = supabaseResult.data.user
    const nextAccount = {
      ...account,
      name: user?.user_metadata.username ?? username ?? account.name,
      email: user?.email ?? email,
    }
    setAccount(nextAccount)
    setIsLoggedIn(true)
    setAuthMessage(authMode === 'create' ? 'Account created.' : 'Logged in.')
    setAuthPassword('')
    setAuthMode(null)
  }

  const logOut = () => {
    window.localStorage.removeItem('virtual-art-framing-studio-session')
    window.localStorage.removeItem(sessionActivityKey)
    void supabase.auth.signOut()
    setIsLoggedIn(false)
  }

  const openAccountDialog = () => {
    setProfileUsername(account.name)
    setProfileEmail(account.email)
    setProfilePassword('')
    setProfileAvatar(account.avatar)
    setProfileAvatarZoom(1)
    setShowAccountDialog(true)
  }

  const saveAccountChanges = async () => {
    const username = profileUsername.trim()
    const email = profileEmail.trim().toLowerCase()
    if (!username || !email) return
    let savedAvatar = profileAvatar
    if (profileAvatar && profileAvatarZoom !== 1) {
      const image = new Image()
      image.src = profileAvatar
      await new Promise<void>((resolve) => {
        image.onload = () => resolve()
        image.onerror = () => resolve()
      })
      if (image.naturalWidth && image.naturalHeight) {
        const size = 512
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (context) {
          const sourceSize = size / profileAvatarZoom
          const sourceOffset = (size - sourceSize) / 2
          context.drawImage(image, sourceOffset, sourceOffset, sourceSize, sourceSize, 0, 0, size, size)
          savedAvatar = canvas.toDataURL('image/jpeg', 0.9)
        }
      }
    }
    const nextAccount = { ...account, name: username, email, avatar: savedAvatar }
    setAccount(nextAccount)
    const storedAuth = window.localStorage.getItem('virtual-art-framing-studio-auth')
    if (storedAuth) {
      try {
        const auth = JSON.parse(storedAuth) as LocalAuth
        const passwordHash = profilePassword ? await hashPassword(profilePassword) : auth.passwordHash
        window.localStorage.setItem('virtual-art-framing-studio-auth', JSON.stringify({ ...auth, email, username, passwordHash, account: nextAccount }))
      } catch {
        // Keep the profile update local even if an old auth record is malformed.
      }
    }
    setShowAccountDialog(false)
  }

  const handleProfileImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setProfileImageLoading(true)
    setProfileImageError('')
    let imageBlob: Blob = file
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name)
    if (isHeic) {
      try {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
        imageBlob = Array.isArray(converted) ? converted[0] : converted
      } catch {
        setProfileImageLoading(false)
        setProfileImageError('This HEIC photo could not be converted.')
        return
      }
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        setProfileImageLoading(false)
        setProfileImageError('Image could not be loaded.')
        return
      }
      const image = new Image()
      image.onload = () => {
        const size = 512
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        if (!context) {
          setProfileImageLoading(false)
          setProfileImageError('Image could not be processed.')
          return
        }
        context.fillStyle = '#e8e2d9'
        context.fillRect(0, 0, size, size)
        const imageScale = Math.min(size / image.naturalWidth, size / image.naturalHeight) * 0.82
        const drawnWidth = image.naturalWidth * imageScale
        const drawnHeight = image.naturalHeight * imageScale
        context.drawImage(image, (size - drawnWidth) / 2, (size - drawnHeight) / 2, drawnWidth, drawnHeight)
        setProfileAvatar(canvas.toDataURL('image/jpeg', 0.9))
        setProfileImageLoading(false)
      }
      image.onerror = () => {
        setProfileImageLoading(false)
        setProfileImageError('Image could not be loaded.')
      }
      image.src = reader.result
    }
    reader.onerror = () => {
      setProfileImageLoading(false)
      setProfileImageError('Image could not be loaded.')
    }
    reader.readAsDataURL(imageBlob)
  }
  const defaultFrameThickness = selectedFrameType === 'floating' ? 12 : selectedStyle === 'stainless' ? 14 : 18
  const frameGap = selectedFrameType === 'floating' ? 4 : 0
  const defaultMatMargin = selectedSize === 'narrow' ? 8 : selectedSize === 'medium' ? 14 : 22
  const previewWidth = Math.min(380, 480 * artworkRatio)

  useEffect(() => {
    if (restoringProjectRef.current > 0) {
      restoringProjectRef.current -= 1
      return
    }
    setFrameThickness(defaultFrameThickness)
  }, [defaultFrameThickness])

  useEffect(() => {
    if (restoringProjectRef.current > 0) {
      restoringProjectRef.current -= 1
      return
    }
    setMatMargin(defaultMatMargin)
  }, [defaultMatMargin])

  useEffect(() => {
    if (!resizeDrag) return
    const handlePointerMove = (event: PointerEvent) => {
      const nextValue = resizeDrag.startValue - (event.clientY - resizeDrag.startY) / 2
      if (resizeDrag.kind === 'frame') setFrameThickness(Math.min(42, Math.max(6, nextValue)))
      if (resizeDrag.kind === 'mat') setMatMargin(Math.min(80, Math.max(0, nextValue)))
      if (resizeDrag.kind === 'strip') setStripThickness(Math.min(8, Math.max(0, nextValue)))
    }
    const stopResize = () => setResizeDrag(null)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
    }
  }, [resizeDrag])

  useEffect(() => {
    if (!artDrag) return
    const handlePointerMove = (event: PointerEvent) => {
      setArtPosition({
        x: artDrag.originX + event.clientX - artDrag.startX,
        y: artDrag.originY + event.clientY - artDrag.startY,
      })
    }
    const stopDrag = () => setArtDrag(null)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDrag)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDrag)
    }
  }, [artDrag])

  useEffect(() => {
    window.localStorage.setItem('virtual-art-framing-studio-account', JSON.stringify(account))
    const savedAuth = window.localStorage.getItem('virtual-art-framing-studio-auth')
    if (savedAuth) {
      try {
        const auth = JSON.parse(savedAuth) as LocalAuth
        window.localStorage.setItem('virtual-art-framing-studio-auth', JSON.stringify({ ...auth, account }))
      } catch {
        // Ignore malformed local auth data and keep the profile usable.
      }
    }
    if (authReady && authUserId) {
      void supabase.from('user_profiles').upsert({ user_id: authUserId, account, updated_at: new Date().toISOString() })
    }
  }, [account, authReady, authUserId])

  const activeFolderProjects = useMemo(() => {
    return account.projects.filter((project) => {
      if (account.activeFolderId === 'all') return true
      return project.folderId === account.activeFolderId
    })
  }, [account])

  const handleArtworkUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return

    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || /\.(heic|heif)$/i.test(file.name)
    if (!file.type.startsWith('image/') && !isHeic) {
      setUploadMessage('Please choose an image file.')
      return
    }

    try {
      let imageBlob: Blob = file
      if (isHeic) {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
        imageBlob = Array.isArray(converted) ? converted[0] : converted
      }

      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setArtwork(reader.result)
          setZoom(1)
          setArtPosition({ x: 0, y: 0 })
          setUploadMessage('')
        }
      }
      reader.onerror = () => setUploadMessage('This image could not be loaded.')
      reader.readAsDataURL(imageBlob)
    } catch {
      setUploadMessage('This image format could not be converted.')
    }
  }

  const openArtworkPicker = () => {
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  const applyArtworkDimensions = () => {
    const safeWidth = Math.max(1, artWidthInches)
    const safeHeight = Math.max(1, artHeightInches)
    setArtWidthInches(safeWidth)
    setArtHeightInches(safeHeight)
    setArtworkRatio(safeWidth / safeHeight)
    setFrameOrientation(safeWidth >= safeHeight ? 'horizontal' : 'vertical')
    setShowDimensionsDialog(false)
  }

  const saveProject = () => {
    setShowSaveDialog(true)
  }

  const confirmSaveProject = async () => {
    const safeFileName = projectFileName.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'my-framing-project'
    const nextProject: ProjectRecord = {
      id: crypto.randomUUID(),
      name: safeFileName,
      size: selectedSize,
      style: `${selectedFrameType}-${selectedStyle}`,
      color: selectedColor.name,
      notes: '',
      folderId: account.activeFolderId,
      artwork,
      createdAt: new Date().toISOString(),
      frameEnabled,
      matEnabled,
      matColorId: selectedMatColor.id,
      stripColorId: selectedStripColor.id,
      stripEnabled,
      artworkRatio,
      zoom,
      artPosition,
      frameThickness,
      matMargin,
      stripThickness,
    }

    const nextAccount = {
      ...account,
      projects: [nextProject, ...account.projects],
    }

    window.localStorage.setItem('virtual-art-framing-studio-account', JSON.stringify(nextAccount))
    setAccount(() => nextAccount)
    setShowSaveDialog(false)
    setSaveMessage(`Saved locally to profile: ${safeFileName}`)
    if (authUserId) {
      try {
        const { error } = await supabase.from('user_profiles').upsert({
          user_id: authUserId,
          account: nextAccount,
          updated_at: new Date().toISOString(),
        })
        if (!error) setSaveMessage(`Saved to profile: ${safeFileName}`)
      } catch {
        setSaveMessage(`Saved locally to profile: ${safeFileName}`)
      }
    }
  }

  const createFolder = () => {
    const name = newFolderName.trim()
    if (!name) return
    const folder = { id: crypto.randomUUID(), name }
    const nextAccount = { ...account, folders: [...account.folders, folder], activeFolderId: folder.id }
    setAccount(nextAccount)
    setNewFolderName('')
    setShowFolderDialog(false)
  }

  const renameActiveFolder = () => {
    if (account.activeFolderId === 'all') return
    const current = account.folders.find((folder) => folder.id === account.activeFolderId)
    const name = window.prompt('Rename folder', current?.name ?? '')?.trim()
    if (!name) return
    setAccount({ ...account, folders: account.folders.map((folder) => folder.id === account.activeFolderId ? { ...folder, name } : folder) })
  }

  const deleteProject = (projectId: string) => {
    const nextAccount = {
      ...account,
      projects: account.projects.filter((project) => project.id !== projectId),
    }
    window.localStorage.setItem('virtual-art-framing-studio-account', JSON.stringify(nextAccount))
    setAccount(() => nextAccount)
    setSelectedProjectId(null)
  }

  const loadProject = (project: ProjectRecord) => {
    const [savedFrameType, savedMaterial] = project.style.split('-')
    const matchingColor = colorOptions.find((color) => color.name === project.color)
    setSelectedProjectId(project.id)
    setSelectedFrameType(frameTypeOptions.some((option) => option.id === savedFrameType) ? savedFrameType : 'modern')
    setSelectedStyle(materialOptions.some((option) => option.id === savedMaterial) ? savedMaterial : materialOptions[0].id)
    setSelectedSize(project.size as typeof selectedSize)
    if (matchingColor) setSelectedColor(matchingColor)
    restoringProjectRef.current = 2
    setFrameEnabled(project.frameEnabled ?? true)
    setMatEnabled(project.matEnabled ?? true)
    if (project.matColorId) setSelectedMatColor(matColorOptions.find((color) => color.id === project.matColorId) ?? selectedMatColor)
    if (project.stripColorId) setSelectedStripColor(stripColorOptions.find((color) => color.id === project.stripColorId) ?? selectedStripColor)
    setStripEnabled(project.stripEnabled ?? true)
    setArtwork(project.artwork)
    setArtworkRatio(project.artworkRatio ?? 4 / 5)
    setArtPosition(project.artPosition ?? { x: 0, y: 0 })
    setZoom(project.zoom ?? 1)
    if (project.frameThickness !== undefined) setFrameThickness(project.frameThickness)
    if (project.matMargin !== undefined) setMatMargin(project.matMargin)
    if (project.stripThickness !== undefined) setStripThickness(project.stripThickness)
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const sendContactMessage = () => {
    const subject = encodeURIComponent(`Framing project inquiry from ${contactName || 'customer'}`)
    const body = encodeURIComponent(contactMessage || 'Hello, I would like to discuss a custom frame order.')
    window.location.href = `mailto:hello@virtualartframingstudio.com?subject=${subject}&body=${body}`
  }

  const handleStageWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return
    event.preventDefault()
    const delta = event.deltaY < 0 ? 0.08 : -0.08
    setZoom((current) => Math.min(1.25, Math.max(0.8, Number((current + delta).toFixed(2)))))
  }

  const handlePinchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      const [first, second] = Array.from(event.touches)
      pinchDistanceRef.current = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
    }
  }

  const handlePinchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchDistanceRef.current) return
    event.preventDefault()
    const [first, second] = Array.from(event.touches)
    const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
    const delta = (distance - pinchDistanceRef.current) / 180
    setZoom((current) => Number(Math.min(1.25, Math.max(0.8, current + delta)).toFixed(2)))
    pinchDistanceRef.current = distance
  }

  const handlePinchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchDistanceRef.current = null
  }

  return (
    <main className="studio-shell">
      {authSuccessMessage && <div className="auth-success-message" role="status">{authSuccessMessage}</div>}
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">V</div>
          <span>{t.brand}</span>
        </div>

        <nav className="nav">
          <a href="#workspace">{t.navWork}</a>
          <a href="#projects">{t.navProjects}</a>
          <a href="#about">{t.navAbout}</a>
          <a href="#contact">{t.navContact}</a>
          <select
            aria-label={t.languages}
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
            className="mobile-lang-select"
          >
            <option value="en">EN</option>
            <option value="fr">FR</option>
            <option value="zh">中文</option>
            <option value="de">DE</option>
            <option value="it">IT</option>
            <option value="es">ES</option>
            <option value="ja">日本語</option>
          </select>
        </nav>

        <div className="header-actions">
          {isLoggedIn ? (
            <>
              <button type="button" className="profile-badge" aria-label={`Open account for ${account.name}`} onClick={openAccountDialog}>
                {account.avatar ? <img className="profile-avatar profile-avatar-image" src={account.avatar} alt="" /> : <span className="profile-avatar">{account.name.slice(0, 1).toUpperCase()}</span>}
                <span className="profile-name">{account.name}</span>
              </button>
              <button type="button" className="header-link-button" onClick={logOut}>Log out</button>
            </>
          ) : (
            <>
              <button type="button" className="header-link-button" onClick={() => { setAuthMode('login'); setAuthMessage('') }}>
                {t.logIn}
              </button>
              <button type="button" className="primary-button compact-button" onClick={() => { setAuthMode('create'); setAuthMessage('') }}>
                {t.createAccount}
              </button>
            </>
          )}
          <select aria-label={t.languages} value={language} onChange={(event) => setLanguage(event.target.value as Language)} className="lang-select">
            <option value="en">EN</option><option value="fr">FR</option><option value="zh">中文</option><option value="de">DE</option><option value="it">IT</option><option value="es">ES</option><option value="ja">日本語</option>
          </select>
        </div>
      </header>

      <section id="workspace" className="hero-stage">
        <div
          className={`stage-shell stage-${wallTone}`}
          onWheel={handleStageWheel}
          aria-label="Workspace staging area"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleArtworkUpload}
          />

          <div className="workspace-menu-bar">
            <div className="menu-group">
              <button type="button" className={frameEnabled ? 'menu-chip active' : 'menu-chip'} aria-label="Toggle frame" onClick={() => setFrameEnabled((current) => !current)}>
                Frame
              </button>
              <select className="menu-select" aria-label="Frame type" value={selectedFrameType} onChange={(event) => setSelectedFrameType(event.target.value as typeof selectedFrameType)}>
                {frameTypeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>

            <div className="menu-group">
              <span>Material</span>
              <select className="menu-select" aria-label="Frame material" value={selectedStyle} onChange={(event) => setSelectedStyle(event.target.value)}>
                {materialOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>

            <div className="menu-group">
              <button type="button" className={matEnabled ? 'menu-chip active' : 'menu-chip'} aria-label="Toggle mat" onClick={() => setMatEnabled((current) => !current)}>
                Mat
              </button>
              <select className="menu-select" aria-label="Mat size" value={selectedSize} onChange={(event) => setSelectedSize(event.target.value as typeof selectedSize)}>
                {sizeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>

            <div className="menu-group compact-group">
              <span>Mat color</span>
              <label className="color-picker">
                <span className="swatch-mini" style={{ background: selectedMatColor.hex }}></span>
                <select
                  aria-label="Mat color"
                  value={selectedMatColor.id}
                  onChange={(event) => setSelectedMatColor(matColorOptions.find((color) => color.id === event.target.value) ?? matColorOptions[0])}
                >
                  {matColorOptions.map((color) => <option key={color.id} value={color.id}>{color.name}</option>)}
                </select>
              </label>
            </div>

            <div className="menu-actions">
              <button type="button" className="menu-action" onClick={openArtworkPicker}>
                Upload
              </button>
              <button
                type="button"
                className={frameOrientation === 'horizontal' ? 'menu-action active' : 'menu-action'}
                aria-label="Horizontal frame"
                title="Horizontal frame"
                onClick={() => {
                  setFrameOrientation('horizontal')
                  setArtworkRatio((current) => Math.max(1.35, current >= 1 ? current : 1 / current))
                }}
              >
                ↔
              </button>
              <button
                type="button"
                className={frameOrientation === 'vertical' ? 'menu-action active' : 'menu-action'}
                aria-label="Vertical frame"
                title="Vertical frame"
                onClick={() => {
                  setFrameOrientation('vertical')
                  setArtworkRatio((current) => Math.min(0.75, current <= 1 ? current : 1 / current))
                }}
              >
                ↕
              </button>
              <button
                type="button"
                className={stripEnabled ? 'menu-action active' : 'menu-action'}
                aria-label="Toggle mat strip"
                aria-pressed={stripEnabled}
                title="Toggle mat strip"
                onClick={() => setStripEnabled((current) => !current)}
              >
                Strip
              </button>
              <label className="color-picker">
                <span className="swatch-mini" style={{ background: selectedStripColor.hex }}></span>
                <select
                  aria-label="Strip color"
                  value={selectedStripColor.id}
                  onChange={(event) => setSelectedStripColor(stripColorOptions.find((color) => color.id === event.target.value) ?? stripColorOptions[0])}
                >
                  {stripColorOptions.map((color) => <option key={color.id} value={color.id}>{color.name}</option>)}
                </select>
              </label>
              <button
                type="button"
                className={wallTone === 'white' ? 'menu-action active' : 'menu-action'}
                onClick={() => setWallTone('white')}
              >
                Wall
              </button>
              <button
                type="button"
                className={wallTone === 'warm' ? 'menu-action active' : 'menu-action'}
                onClick={() => setWallTone('warm')}
              >
                Light
              </button>
            </div>
          </div>

          <div
            className="workspace-canvas"
            onTouchStart={handlePinchStart}
            onTouchMove={handlePinchMove}
            onTouchEnd={handlePinchEnd}
          >
            <select
              className="standard-size-control"
              data-screenshot-ignore
              disabled={selectedFrameType === 'floating'}
              aria-label="Change standard frame size"
              title="Change standard frame size"
              value={standardFrameSizeIndex}
              onChange={(event) => setStandardFrameSizeIndex(Number(event.target.value))}
            >
              {standardFrameSizes.map((size, index) => (
                <option key={`${size.width}x${size.height}`} value={index}>
                  {size.width.toFixed(2)} in × {size.height.toFixed(2)} in
                </option>
              ))}
            </select>
            <div
              className="workspace-corner-tools"
              data-screenshot-ignore
              style={{ right: `calc(50% - ${(previewWidth + 48) / 2}px)`, bottom: '-48px' }}
            >
              <button
                type="button"
                className="menu-action"
                aria-label="Adjust frame thickness"
                title="Drag F to adjust frame thickness"
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setResizeDrag({ kind: 'frame', startY: event.clientY, startValue: frameThickness })
                }}
              >
                F
              </button>
              <button
                type="button"
                className="menu-action"
                aria-label="Adjust mat size"
                title="Drag M to adjust mat size"
                onPointerDown={(event) => {
                  event.preventDefault()
                  if (event.pointerType === 'touch') return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setResizeDrag({ kind: 'mat', startY: event.clientY, startValue: matMargin })
                }}
                onClick={() => {
                  const step = 4
                  setMatMargin((current) => (current >= 80 ? 0 : Math.min(80, current + step)))
                }}
              >
                M
              </button>
              <button type="button" className="menu-action" aria-label="Zoom out artwork" onClick={() => setZoom((current) => Number(Math.max(0.7, current - 0.1).toFixed(2)))}>−</button>
              <button type="button" className="menu-action" aria-label="Zoom in artwork" onClick={() => setZoom((current) => Number(Math.min(1.25, current + 0.1).toFixed(2)))}>+</button>
              <button
                type="button"
                className="menu-action"
                aria-label="Adjust strip size"
                title="Drag S to adjust strip thickness"
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setResizeDrag({ kind: 'strip', startY: event.clientY, startValue: stripThickness })
                }}
              >
                S
              </button>
            </div>
            <div
              ref={captureRef}
              className="art-capture-area"
              style={{ width: `min(100%, ${previewWidth + 48}px)`, aspectRatio: artworkRatio }}
            >
              <div
                className="art-preview"
                style={{
                  borderColor: selectedColor.hex,
                  width: `min(100%, ${previewWidth}px)`,
                  aspectRatio: artworkRatio,
                }}
              >
              {matEnabled && <div
                className="art-mat"
                style={{
                  inset: `${frameThickness + frameGap}px`,
                  padding: `${matMargin}px`,
                  background: selectedMatColor.hex,
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== 'touch') return
                  event.preventDefault()
                  event.stopPropagation()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setResizeDrag({ kind: 'mat', startY: event.clientY, startValue: matMargin })
                }}
              >
                <div
                  className="mat-cut-edge"
                  style={{
                    borderColor: stripEnabled ? selectedStripColor.hex : selectedMatColor.hex,
                    borderWidth: stripEnabled ? `${Math.max(2, stripThickness)}px` : 0,
                    boxShadow: stripEnabled ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.75)' : 'none',
                  }}
                >
                  {artwork ? (
                    <img
                      key={artwork}
                      className="uploaded-artwork"
                      src={artwork}
                      alt="Uploaded artwork preview"
                      style={{ transform: `translate(${artPosition.x}px, ${artPosition.y}px) scale(${zoom})` }}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        setResizeDrag(null)
                        event.currentTarget.setPointerCapture(event.pointerId)
                        setArtDrag({
                          startX: event.clientX,
                          startY: event.clientY,
                          originX: artPosition.x,
                          originY: artPosition.y,
                        })
                      }}
                      onLoad={(event) => {
                        const image = event.currentTarget
                        if (image.naturalWidth && image.naturalHeight) {
                          const naturalRatio = image.naturalWidth / image.naturalHeight
                          setArtworkRatio(naturalRatio)
                          setArtHeightInches(artWidthInches / naturalRatio)
                          setFrameOrientation(naturalRatio >= 1 ? 'horizontal' : 'vertical')
                        }
                      }}
                    />
                  ) : (
                    <div className="art-placeholder">Your artwork</div>
                  )}
                </div>
              </div>}
              {!matEnabled && artwork && <img
                className="uploaded-artwork artwork-without-mat"
                src={artwork}
                alt="Uploaded artwork preview"
                style={{ transform: `translate(${artPosition.x}px, ${artPosition.y}px) scale(${zoom})` }}
              />}
              {frameEnabled && <div
                className={`frame-shell frame-${selectedStyle} frame-${selectedFrameType}`}
                style={{
                  borderColor: selectedColor.hex,
                  borderWidth: `${frameThickness}px`,
                  borderImage: selectedStyle === 'engravedwood' ? 'none' : undefined,
                  boxShadow: selectedStyle === 'engravedwood'
                    ? 'inset 0 0 0 3px #b27b4d, inset 0 0 0 6px #4a291b'
                    : undefined,
                }}
                onPointerDown={(event) => {
                  if (event.pointerType !== 'touch') return
                  event.preventDefault()
                  event.stopPropagation()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setResizeDrag({ kind: 'frame', startY: event.clientY, startValue: frameThickness })
                }}
              ></div>}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="gallery-center-button"
            onClick={openArtworkPicker}
          >
            {artwork ? 'Replace artwork' : 'Upload artwork'}
          </button>
          {uploadMessage && <span className="upload-message" role="alert">{uploadMessage}</span>}
          <div className="workspace-scale" aria-label="Frame size">
            {(selectedFrameType === 'floating' ? frameWidthInches : standardFrameSizes[standardFrameSizeIndex].width).toFixed(2)} in × {(selectedFrameType === 'floating' ? frameHeightInches : standardFrameSizes[standardFrameSizeIndex].height).toFixed(2)} in
          </div>
          {showDimensions && (
            <div className="workspace-dimensions" aria-label="Artwork dimensions">
              <span className="dimension-width">{artWidthInches.toFixed(1)} in</span>
              <span className="dimension-height">{artHeightInches.toFixed(1)} in</span>
            </div>
          )}
          <div className="workspace-save-area">
            {saveMessage && <span className="save-message">{saveMessage}</span>}
            <button type="button" className="workspace-save-button" onClick={saveProject}>
              Save Project
            </button>
          </div>
        </div>

      </section>

      <section id="projects" className="portfolio-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">{t.galleryTitle}</p>
            <h2>{t.quote}</h2>
          </div>
        </div>

        <div className="carousel" aria-label="Completed projects carousel">
          {galleryItems.map((item) => (
            <article key={item.title} className="gallery-card">
              <div className="gallery-frame">
                <div className="gallery-mat">
                  <img src={item.image} alt={item.title} />
                </div>
              </div>
              <div className="gallery-info">
                <strong>{item.title}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="about" className="bottom-grid">
        <div className="project-list panel-block">
          <div className="saved-projects-heading">
            <h3>{t.savedProjects}</h3>
            <button type="button" className="folder-plus-button" aria-label="Create folder" title="Create folder" onClick={() => setShowFolderDialog(true)}>+</button>
          </div>
          <div className="folder-bar">
            <select value={account.activeFolderId} onChange={(event) => setAccount({ ...account, activeFolderId: event.target.value })} aria-label="Project folder">
              {account.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            <button type="button" className="menu-action" onClick={renameActiveFolder} disabled={account.activeFolderId === 'all'}>Rename</button>
          </div>
          {activeFolderProjects.length === 0 ? (
            <p>{t.noProjects}</p>
          ) : (
            <ul>
              {activeFolderProjects.map((project) => (
                <li key={project.id} className={selectedProjectId === project.id ? 'selected' : ''}>
                  <button
                    type="button"
                    className="project-select-button"
                    onClick={() => loadProject(project)}
                  >
                    {project.artwork && <img className="saved-project-thumb" src={project.artwork} alt="" />}
                    <strong>{project.name}</strong>
                    <span>
                      {project.size} · {project.color}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="trash-button project-trash-button"
                    aria-label={`Delete ${project.name}`}
                    onClick={() => deleteProject(project.id)}
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="project-list panel-block">
          <h3>{t.orderSummary}</h3>
          <p>No order summary</p>
        </div>
        <div className="follow-panel panel-block">
          <h3>{t.follow}</h3>
          <div className="social-list">
            <a href="https://maps.google.com" target="_blank" rel="noreferrer">
              <span>{portfolioIcons.maps}</span> Google Maps
            </a>
            <a href="https://instagram.com" target="_blank" rel="noreferrer">
              <span>{portfolioIcons.instagram}</span> Instagram
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noreferrer">
              <span>{portfolioIcons.linkedin}</span> LinkedIn
            </a>
            <a href="https://youtube.com" target="_blank" rel="noreferrer">
              <span>{portfolioIcons.youtube}</span> YouTube
            </a>
          </div>
        </div>
      </section>

      <section id="contact" className="contact-section panel-block">
        <div className="contact-copy">
          <p className="eyebrow">{t.contactTitle}</p>
          <h2>{t.market}</h2>
        </div>
        <div className="contact-form">
          <input
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            placeholder={t.contactName}
          />
          <textarea
            value={contactMessage}
            onChange={(event) => setContactMessage(event.target.value)}
            placeholder={t.placeholder}
          />
          <button type="button" className="primary-button" onClick={sendContactMessage}>
            {t.send}
          </button>
        </div>
      </section>

      {authMode && (
        <div className="dialog-overlay" onClick={() => setAuthMode(null)}>
          <div className="dialog-box small-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <h4>{authMode === 'create' ? 'Create account' : 'Log in'}</h4>
              <button type="button" onClick={() => setAuthMode(null)}>×</button>
            </div>
            {authMode === 'create' && (
              <div className="field-group">
                <label htmlFor="auth-username">Username</label>
                <input id="auth-username" autoComplete="username" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} />
              </div>
            )}
            <div className="field-group">
              <label htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" type="password" autoComplete={authMode === 'create' ? 'new-password' : 'current-password'} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} />
            </div>
            {authMessage && <p className="dialog-hint" role="status">{authMessage}</p>}
            <button type="button" className="primary-button full-width-button" onClick={() => void submitAuth()}>
              {authMode === 'create' ? 'Create account' : 'Log in'}
            </button>
          </div>
        </div>
      )}

      {showSaveDialog && (
        <div className="dialog-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="dialog-box small-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <h4>Save project</h4>
              <button type="button" onClick={() => setShowSaveDialog(false)}>×</button>
            </div>
            <div className="field-group">
              <label htmlFor="project-file-name">Project file name</label>
              <input
                id="project-file-name"
                value={projectFileName}
                onChange={(event) => setProjectFileName(event.target.value)}
                placeholder="my-framing-project"
              />
            </div>
            <div className="field-group">
              <label htmlFor="project-folder-location">Folder location</label>
              <select
                id="project-folder-location"
                className="menu-select full-width-button"
                value={account.activeFolderId}
                onChange={(event) => setAccount({ ...account, activeFolderId: event.target.value })}
                aria-label="Folder location"
              >
                {account.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </div>
            <button type="button" className="primary-button full-width-button" onClick={confirmSaveProject}>
              Save
            </button>
          </div>
        </div>
      )}

      {showAccountDialog && (
        <div className="dialog-overlay" onClick={() => setShowAccountDialog(false)}>
          <div className="dialog-box small-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <h4>Account</h4>
              <button type="button" onClick={() => setShowAccountDialog(false)}>×</button>
            </div>
            <div className="account-photo-editor">
              <button type="button" className="account-photo-button" onClick={() => profileImageInputRef.current?.click()}>
                {profileImageLoading ? <span className="upload-dots" aria-label="Uploading photo">...</span> : profileAvatar ? <img src={profileAvatar} alt="Profile" style={{ transform: `scale(${profileAvatarZoom})` }} /> : <span>{profileUsername.slice(0, 1).toUpperCase()}</span>}
              </button>
              <input ref={profileImageInputRef} type="file" accept="image/*" hidden onChange={handleProfileImage} />
              {profileImageError && <span className="dialog-hint" role="alert">{profileImageError}</span>}
              <div className="photo-zoom-controls" aria-label="Profile photo zoom">
                <button type="button" className="menu-action" onClick={() => setProfileAvatarZoom((current) => Math.max(0.8, Number((current - 0.1).toFixed(2))))}>−</button>
                <span>{Math.round(profileAvatarZoom * 100)}%</span>
                <button type="button" className="menu-action" onClick={() => setProfileAvatarZoom((current) => Math.min(2, Number((current + 0.1).toFixed(2))))}>+</button>
              </div>
            </div>
            <div className="field-group">
              <label htmlFor="profile-username">Username</label>
              <input id="profile-username" value={profileUsername} onChange={(event) => setProfileUsername(event.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor="profile-email">Email</label>
              <input id="profile-email" type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor="profile-password">Password</label>
              <input id="profile-password" type="password" placeholder="Leave blank to keep current password" value={profilePassword} onChange={(event) => setProfilePassword(event.target.value)} />
            </div>
            <button type="button" className="primary-button full-width-button" disabled={profileImageLoading} onClick={() => void saveAccountChanges()}>Save Changes</button>
          </div>
        </div>
      )}

      {showFolderDialog && (
        <div className="dialog-overlay" onClick={() => setShowFolderDialog(false)}>
          <div className="dialog-box small-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <h4>Create folder</h4>
              <button type="button" onClick={() => setShowFolderDialog(false)}>×</button>
            </div>
            <div className="field-group">
              <label htmlFor="new-folder-name">Folder name</label>
              <input id="new-folder-name" autoFocus value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} placeholder="New folder" />
            </div>
            <button type="button" className="primary-button full-width-button" onClick={createFolder}>Create folder</button>
          </div>
        </div>
      )}

      {showDimensionsDialog && (
        <div className="dialog-overlay" onClick={() => setShowDimensionsDialog(false)}>
          <div className="dialog-box small-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <h4>Artwork dimensions</h4>
              <button type="button" onClick={() => setShowDimensionsDialog(false)}>×</button>
            </div>
            <div className="details-row">
              <div className="field-group">
                <label htmlFor="art-width">Width (in)</label>
                <input id="art-width" type="number" min="1" step="0.1" value={artWidthInches} onChange={(event) => setArtWidthInches(Number(event.target.value) || 1)} />
              </div>
              <div className="field-group">
                <label htmlFor="art-height">Height (in)</label>
                <input id="art-height" type="number" min="1" step="0.1" value={artHeightInches} onChange={(event) => setArtHeightInches(Number(event.target.value) || 1)} />
              </div>
            </div>
            <button type="button" className="primary-button full-width-button" onClick={applyArtworkDimensions}>Apply dimensions</button>
          </div>
        </div>
      )}

    </main>
  )
}

export default App
