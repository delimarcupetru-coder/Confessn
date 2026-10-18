import { useEffect, useMemo, useRef, useState } from 'react'
import heic2any from 'heic2any'
import html2canvas from 'html2canvas'
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
  bottomMatEnabled?: boolean
  bottomMatColorId?: string
  stripColorId?: string
  stripEnabled?: boolean
  frameSizeIndex?: number
  artworkRatio?: number
  zoom?: number
  artPosition?: { x: number; y: number }
  frameThickness?: number
  matMargin?: number
  stripThickness?: number
}

type ImageFormat = 'png' | 'jpg'
type ExportSelection = { handle: FileSystemFileHandle | null; filename: string; format: ImageFormat }

type Account = {
  name: string
  email: string
  avatar?: string
  folders: Folder[]
  activeFolderId: string
  projects: ProjectRecord[]
}

function mergeProfileAccount(local: Account, remote: Account): Account {
  const localProjectIds = new Set(local.projects.map((project) => project.id))
  const localFolderIds = new Set(local.folders.map((folder) => folder.id))
  return {
    ...remote,
    folders: [...local.folders, ...remote.folders.filter((folder) => !localFolderIds.has(folder.id))],
    projects: [...local.projects, ...remote.projects.filter((project) => !localProjectIds.has(project.id))],
  }
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

const accountStorageKey = 'virtual-art-framing-studio-account'

function openAccountDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('virtual-art-framing-studio-projects', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('accounts')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readStoredAccount(): Promise<Account | undefined> {
  const database = await openAccountDatabase()
  try {
    return await new Promise<Account | undefined>((resolve, reject) => {
      const request = database.transaction('accounts', 'readonly').objectStore('accounts').get('current')
      request.onsuccess = () => resolve(request.result as Account | undefined)
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

async function writeStoredAccount(account: Account) {
  const database = await openAccountDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('accounts', 'readwrite')
      transaction.objectStore('accounts').put(account, 'current')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    window.localStorage.removeItem(accountStorageKey)
  } finally {
    database.close()
  }
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
  { id: 'blackwood', label: 'Black Wood', description: 'Dark stained natural grain', icon: '▥' },
  { id: 'engravedwood', label: 'Engraved Wood', description: 'Detailed carved grain', icon: '▧' },
]

function makeFrameTexture(base: [number, number, number], steel = false) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const context = canvas.getContext('2d')!
  const image = context.createImageData(canvas.width, canvas.height)
  let seed = 14321
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      const noise = (seed / 4294967296 - 0.5) * (steel ? 10 : 5)
      const knot = Math.exp(-((x - 156) ** 2 / 1500 + (y - 62) ** 2 / 220))
      const grainLine = y + 3 * Math.sin(x * 0.025 + y * 0.06) + (y - 62) * knot * 1.4
      const grain = steel
        ? 9 * Math.sin(y * 0.055) + 3 * Math.sin(y * 1.8) + noise
        : 16 * Math.sin(grainLine * 0.23) + 7 * Math.sin(grainLine * 0.72) + 4 * Math.sin(y * 0.06) + noise
      const index = (y * canvas.width + x) * 4
      for (let channel = 0; channel < 3; channel++) image.data[index + channel] = Math.max(0, Math.min(255, base[channel] + grain))
      image.data[index + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  const rotated = document.createElement('canvas')
  rotated.width = canvas.height
  rotated.height = canvas.width
  const rotatedContext = rotated.getContext('2d')!
  rotatedContext.translate(rotated.width, 0)
  rotatedContext.rotate(Math.PI / 2)
  rotatedContext.drawImage(canvas, 0, 0)
  return { horizontal: canvas.toDataURL('image/png'), vertical: rotated.toDataURL('image/png') }
}

const frameTextures: Record<string, { horizontal: string; vertical: string }> = {
  darkwood: makeFrameTexture([81, 48, 33]),
  lightwood: makeFrameTexture([200, 159, 107]),
  blackwood: makeFrameTexture([43, 42, 40]),
  stainless: makeFrameTexture([175, 183, 186], true),
}

const frameTypeOptions: FrameOption[] = [
  { id: 'floating', label: 'Floating', description: 'Open gap around the mat', icon: '▣' },
  { id: 'classic', label: 'Classic', description: 'Timeless profile', icon: '◫' },
  { id: 'studio', label: 'Studio', description: 'Clean professional profile', icon: '▭' },
  { id: 'modern', label: 'Modern', description: 'Minimal crisp profile', icon: '□' },
]

const sizeOptions = [
  { id: 'standard', label: 'Standard', description: 'Standard mat opening', icon: '▭' },
  { id: 'letter', label: 'Letter', description: 'Letter-size mat opening', icon: '▮' },
]

const colorOptions: ColorOption[] = [
  { id: 'ivory', name: 'Ivory', hex: '#f4e9d8' },
  { id: 'walnut', name: 'Walnut', hex: '#5e3727' },
  { id: 'oak', name: 'Oak', hex: '#c9a36b' },
  { id: 'sage', name: 'Sage', hex: '#a7b39a' },
  { id: 'rust', name: 'Rust', hex: '#b8583a' },
]

const matColorOptions: ColorOption[] = [
  { id: 'pearl', name: 'Pearl', hex: '#e1e3de' },
  { id: 'linen', name: 'Linen', hex: '#e7dfcf' },
  { id: 'warm-ivory', name: 'Warm Ivory', hex: '#f4e4b8' },
  { id: 'yellow', name: 'Yellow', hex: '#f2d34f' },
  { id: 'light-blue', name: 'Light Blue', hex: '#b9dced' },
  { id: 'sky-blue', name: 'Sky Blue', hex: '#74b9e6' },
  { id: 'carrot', name: 'Carrot', hex: '#ed934d' },
  { id: 'phosphate', name: 'Phosphate', hex: '#d9c89f' },
  { id: 'cobalt', name: 'Cobalt', hex: '#3156a3' },
  { id: 'copper-hydroxide-phosphate', name: 'Copper Hydroxide Phosphate', hex: '#70a89b' },
  { id: 'nickel-phosphate-octahydrate', name: 'Nikel Phosphate Octahydrate', hex: '#91a6b5' },
  { id: 'cristal-zinc-nickel-phosphate', name: 'Crystal Zinc Nickel Phosphate', hex: '#c5d0d4' },
  { id: 'nickel-phosphate', name: 'Nickel Phosphate', hex: '#b6b7ad' },
  { id: 'chromium-phosphate', name: 'Chromium Phosphate', hex: '#76948c' },
]

const bottomMatColorOptions: ColorOption[] = [
  { id: 'black', name: 'Black', hex: '#17171b' },
  { id: 'charcoal-gray', name: 'Charcoal Gray', hex: '#45464a' },
  { id: 'navy-blue', name: 'Navy Blue', hex: '#172b4d' },
  { id: 'burgundy', name: 'Burgundy', hex: '#722f3b' },
  { id: 'forest-green', name: 'Forest Green', hex: '#294b3b' },
  { id: 'gold', name: 'Gold', hex: '#c4a24d' },
  { id: 'silver', name: 'Silver', hex: '#b7bbbe' },
  { id: 'cream', name: 'Cream', hex: '#f1e8d4' },
  { id: 'warm-tan', name: 'Warm Tan', hex: '#bd956a' },
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
    material: 'blackwood', profile: 'modern', frameWidth: 10, matColorId: 'pearl', matSize: 'standard', matWidth: 8,
    stripColorId: 'black', stripWidth: 2, details: 'Modern · Black Wood · standard pearl mat',
  },
  {
    title: 'Jack-O-Lantern Decor',
    image:
      'https://images.unsplash.com/photo-1571931468289-38ebb2c5a1c2?auto=format&fit=crop&w=900&q=80',
    material: 'blackwood', profile: 'modern', frameWidth: 12, matColorId: 'warm-ivory', matSize: 'standard', matWidth: 12,
    stripColorId: 'rust', stripWidth: 2, details: 'Halloween · Jack-o-lantern · Black Wood',
  },
  {
    title: 'Pumpkin at Dusk',
    image:
      'https://images.unsplash.com/photo-1541550353839-95e417a9f95b?auto=format&fit=crop&w=900&q=80',
    material: 'darkwood', profile: 'studio', frameWidth: 16, matColorId: 'linen', matSize: 'standard', matWidth: 10,
    stripColorId: 'rust', stripWidth: 2, details: 'Halloween · Glowing Pumpkin · Dark Wood',
  },
  {
    title: 'Golden Hour Pumpkins',
    image:
      'https://images.unsplash.com/photo-1569511850437-6dfab062c00b?auto=format&fit=crop&w=900&q=80',
    material: 'lightwood', profile: 'floating', frameWidth: 12, matColorId: 'warm-ivory', matSize: 'standard', matWidth: 12,
    stripColorId: 'rust', stripWidth: 2, details: 'Harvest · Autumn Pumpkins · Light Wood',
  },
  {
    title: 'Pumpkin Harvest',
    image:
      'https://images.unsplash.com/photo-1725951751033-d9bfc8a9aab8?auto=format&fit=crop&w=900&q=80',
    material: 'lightwood', profile: 'classic', frameWidth: 16, matColorId: 'linen', matSize: 'standard', matWidth: 10,
    stripColorId: 'rust', stripWidth: 2, details: 'Harvest · Pumpkins in the Field · Light Wood',
  },
  {
    title: 'Coastal Stillness',
    image:
      'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=900&q=80',
    material: 'lightwood', profile: 'floating', frameWidth: 12, matColorId: 'light-blue', matSize: 'standard', matWidth: 18,
    stripColorId: 'blue', stripWidth: 2, details: 'Floating · Light Wood · blue mat',
  },
  {
    title: 'Hunter & Linen',
    image:
      'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&w=900&q=80',
    material: 'darkwood', profile: 'studio', frameWidth: 18, matColorId: 'linen', matSize: 'letter', matWidth: 26,
    stripColorId: 'walnut', stripWidth: 3, details: 'Studio · Dark Wood · letter linen mat',
  },
  {
    title: 'Golden Hour',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=80',
    material: 'stainless', profile: 'classic', frameWidth: 24, matColorId: 'warm-ivory', matSize: 'standard', matWidth: 12,
    stripColorId: 'rust', stripWidth: 2, details: 'Classic · Stainless Steel · warm mat',
  },
] as const

const portfolioIcons = {
  maps: '⌖',
  instagram: '◎',
  linkedin: 'in',
  youtube: '▶',
}

const minArtZoom = 1
const maxArtZoom = 4

type PinchGesture = {
  distance: number
  zoom: number
  position: { x: number; y: number }
  focus: { x: number; y: number }
}

function App() {
  useEffect(() => {
    document.title = 'VAFS'
  }, [])

  const [language, setLanguage] = useState<Language>('en')
  const [frameEnabled, setFrameEnabled] = useState(true)
  const [matEnabled, setMatEnabled] = useState(true)
  const [bottomMatEnabled, setBottomMatEnabled] = useState(false)
  const [selectedStyle, setSelectedStyle] = useState('blackwood')
  const [selectedFrameType, setSelectedFrameType] = useState('modern')
  const [selectedSize, setSelectedSize] = useState('standard')
  const [selectedColor, setSelectedColor] = useState(colorOptions[1])
  const [selectedMatColor, setSelectedMatColor] = useState(matColorOptions.find((color) => color.id === 'pearl')!)
  const [selectedBottomMatColor, setSelectedBottomMatColor] = useState(bottomMatColorOptions.find((color) => color.id === 'warm-tan')!)
  const [selectedStripColor, setSelectedStripColor] = useState(stripColorOptions.find((color) => color.id === 'black')!)
  const [stripEnabled, setStripEnabled] = useState(true)
  const [artwork, setArtwork] = useState<string | null>(galleryItems.find((item) => item.title === 'Golden Hour Pumpkins')!.image)
  const [artworkRatio, setArtworkRatio] = useState(4 / 5)
  const [frameOrientation, setFrameOrientation] = useState<'vertical' | 'horizontal'>('vertical')
  const [uploadMessage, setUploadMessage] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [downloadMessage, setDownloadMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [pendingDownload, setPendingDownload] = useState<ProjectRecord | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [cunActive, setCunActive] = useState(false)
  const [showCunManual, setShowCunManual] = useState(false)
  const [cunMessage, setCunMessage] = useState({
    key: 'ready',
    title: 'Guide mode is ready',
    description: 'Hover over or focus a highlighted control to see what it does and how to use it.',
  })
  const [authMode, setAuthMode] = useState<'login' | 'create' | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
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
  const explicitLogoutRef = useRef(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showFolderDialog, setShowFolderDialog] = useState(false)
  const [projectFileName, setProjectFileName] = useState('my-framing-project')
  const [exportFormat, setExportFormat] = useState<ImageFormat>('png')
  const [contactName, setContactName] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [zoom, setZoom] = useState(1)
  const [wallTone, setWallTone] = useState<'white' | 'warm'>('white')
  const [frameThickness, setFrameThickness] = useState(10)
  const [matMargin, setMatMargin] = useState(8)
  const [stripThickness, setStripThickness] = useState(2)
  const [artPosition, setArtPosition] = useState({ x: 0, y: 0 })
  const [artDrag, setArtDrag] = useState<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [artWidthInches, setArtWidthInches] = useState(12)
  const [artHeightInches, setArtHeightInches] = useState(15)
  const [frameWidthInches] = useState(16)
  const [frameHeightInches] = useState(20)
  const frameSizeGroups = [
    { label: 'Small', sizes: [{ width: 4, height: 6 }, { width: 5, height: 7 }, { width: 8, height: 10 }] },
    { label: 'Medium', sizes: [{ width: 11, height: 14 }, { width: 12, height: 16 }, { width: 14, height: 18 }, { width: 16, height: 20 }] },
    { label: 'Large', sizes: [{ width: 18, height: 24 }, { width: 20, height: 24 }, { width: 20, height: 30 }, { width: 24, height: 36 }, { width: 30, height: 40 }] },
    { label: 'Square', sizes: [8, 10, 12, 16, 20, 24, 30].map((size) => ({ width: size, height: size })) },
  ]
  const standardFrameSizes = frameSizeGroups.flatMap((group) => group.sizes)
  const [standardFrameSizeIndex, setStandardFrameSizeIndex] = useState(
    standardFrameSizes.findIndex((size) => size.width === 8 && size.height === 10),
  )
  const selectedFrameSize = standardFrameSizes[standardFrameSizeIndex]
  const [showDimensions] = useState(false)
  const [showDimensionsDialog, setShowDimensionsDialog] = useState(false)
  const [resizeDrag, setResizeDrag] = useState<{ kind: 'frame' | 'mat' | 'strip'; startY: number; startValue: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const captureRef = useRef<HTMLDivElement | null>(null)
  const saveHandleRef = useRef<ExportSelection | null>(null)
  const artworkOpeningRef = useRef<HTMLDivElement | null>(null)
  const pinchGestureRef = useRef<PinchGesture | null>(null)
  const artZoomRef = useRef(zoom)
  const artPositionRef = useRef(artPosition)
  const autoFitDefaultArtworkRef = useRef(true)
  const previousMatSizeRef = useRef(selectedSize)
  const restoringProjectRef = useRef(2)

  const [account, setAccount] = useState<Account>(() => {
    const saved = window.localStorage.getItem(accountStorageKey)
    if (saved) {
      try {
        return JSON.parse(saved) as Account
      } catch {
        return defaultAccount
      }
    }
    return defaultAccount
  })
  const [accountReady, setAccountReady] = useState(false)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let mounted = true
    void readStoredAccount().then((stored) => {
      if (mounted && stored) setAccount(stored)
    }).catch(() => {
      if (mounted) setSaveMessage('Browser project storage is unavailable.')
    }).finally(() => {
      if (mounted) setAccountReady(true)
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!accountReady) return
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
      if (profile?.account) setAccount((current) => mergeProfileAccount(current, profile.account as Account))
      setAccount((current) => ({ ...current, name: user.user_metadata.username ?? current.name, email: user.email ?? current.email }))
      setIsLoggedIn(true)
      setAuthReady(true)
    }
    void loadSessionProfile()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        setAuthUserId(null)
        setAuthReady(true)
        if (explicitLogoutRef.current) {
          explicitLogoutRef.current = false
          setIsLoggedIn(false)
        }
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
          if (profile?.account) setAccount((current) => mergeProfileAccount(current, profile.account as Account))
          setAuthReady(true)
        })
      }, 0)
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [accountReady])

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
    explicitLogoutRef.current = true
    window.localStorage.removeItem('virtual-art-framing-studio-session')
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
  const defaultFrameThickness = selectedFrameType === 'floating' ? 12 : selectedFrameType === 'classic' ? 24 : selectedFrameType === 'modern' ? 10 : selectedStyle === 'stainless' ? 14 : 18
  const frameGap = selectedFrameType === 'floating' ? 4 : 0
  const defaultMatMargin = selectedSize === 'standard' ? 14 : 22
  const bottomMatMargin = 12
  const previewFrameRatio = selectedFrameType === 'floating'
    ? frameWidthInches / frameHeightInches
    : selectedFrameSize.width / selectedFrameSize.height
  const previewWidth = Math.min(380, 480 * previewFrameRatio)

  useEffect(() => {
    if (!autoFitDefaultArtworkRef.current || !artwork) return
    const opening = artworkOpeningRef.current
    const image = opening?.querySelector<HTMLImageElement>('img.uploaded-artwork')
    if (!opening || !image?.naturalWidth || !image.naturalHeight) return
    autoFitDefaultArtworkRef.current = false
    artZoomRef.current = 1
    artPositionRef.current = { x: 0, y: 0 }
    setArtPosition({ x: 0, y: 0 })
    setZoom(1)
  }, [artwork, matEnabled, bottomMatEnabled, frameThickness, frameGap, matMargin, bottomMatMargin, previewFrameRatio])

  const moveArtwork = (position: { x: number; y: number }) => {
    const opening = artworkOpeningRef.current
    if (!opening) {
      artPositionRef.current = position
      setArtPosition(position)
      return
    }
    const bounds = opening.getBoundingClientRect()
    const maxX = Math.max(0, bounds.width * (artZoomRef.current - 1) / 2)
    const maxY = Math.max(0, bounds.height * (artZoomRef.current - 1) / 2)
    const clampedPosition = {
      x: Math.max(-maxX, Math.min(maxX, position.x)),
      y: Math.max(-maxY, Math.min(maxY, position.y)),
    }
    artPositionRef.current = clampedPosition
    setArtPosition(clampedPosition)
  }

  const zoomArtworkAt = (
    nextScale: number,
    focus: { x: number; y: number },
    fromScale = artZoomRef.current,
    fromPosition = artPositionRef.current,
    fromFocus = focus,
  ) => {
    const opening = artworkOpeningRef.current
    if (!artwork || !opening) return
    const rect = opening.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const scale = Math.min(maxArtZoom, Math.max(minArtZoom, nextScale))
    const ratio = scale / fromScale
    artZoomRef.current = scale
    moveArtwork({
      x: focus.x - centerX - (fromFocus.x - centerX - fromPosition.x) * ratio,
      y: focus.y - centerY - (fromFocus.y - centerY - fromPosition.y) * ratio,
    })
    setZoom(scale)
  }

  const adjustArtworkZoom = (factor: number) => {
    const rect = artworkOpeningRef.current?.getBoundingClientRect()
    if (!rect) return
    zoomArtworkAt(artZoomRef.current * factor, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
  }

  useEffect(() => {
    if (restoringProjectRef.current > 0) {
      restoringProjectRef.current -= 1
      return
    }
    setFrameThickness(defaultFrameThickness)
  }, [defaultFrameThickness])

  useEffect(() => {
    if (previousMatSizeRef.current === selectedSize) return
    previousMatSizeRef.current = selectedSize
    if (restoringProjectRef.current > 0) {
      restoringProjectRef.current -= 1
      return
    }
    setMatMargin(defaultMatMargin)
  }, [defaultMatMargin, selectedSize])

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
      if (event.pointerId !== artDrag.pointerId || pinchGestureRef.current) return
      moveArtwork({
        x: artDrag.originX + event.clientX - artDrag.startX,
        y: artDrag.originY + event.clientY - artDrag.startY,
      })
    }
    const stopDrag = (event: PointerEvent) => {
      if (event.pointerId === artDrag.pointerId) setArtDrag(null)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', stopDrag)
    }
  }, [artDrag])

  useEffect(() => {
    if (!accountReady) return
    void writeStoredAccount(account).catch(() => setSaveMessage('Could not keep your projects in this browser.'))
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
  }, [account, accountReady, authReady, authUserId])

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
          autoFitDefaultArtworkRef.current = false
          setArtwork(reader.result)
          artZoomRef.current = 1
          setZoom(1)
          moveArtwork({ x: 0, y: 0 })
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
    if (!accountReady) return
    setSaveError('')
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
      bottomMatEnabled,
      bottomMatColorId: selectedBottomMatColor.id,
      stripColorId: selectedStripColor.id,
      stripEnabled,
      frameSizeIndex: standardFrameSizeIndex,
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

    const filePromise = artwork ? chooseSaveFile(nextProject) : null
    try {
      await writeStoredAccount(nextAccount)
    } catch {
      setSaveError('Could not save in this browser. Check your available device storage.')
      return
    }
    setAccount(() => nextAccount)
    setShowSaveDialog(false)
    setSaveMessage(`Saved in this browser: ${safeFileName}`)
    if (filePromise) {
      const handle = await filePromise
      if (handle !== undefined) beginProjectDownload(nextProject, handle)
    }
    if (authUserId) {
      try {
        const { error } = await supabase.from('user_profiles').upsert({
          user_id: authUserId,
          account: nextAccount,
          updated_at: new Date().toISOString(),
        })
        setSaveMessage(error ? `Saved in this browser, but account sync failed: ${safeFileName}` : `Saved to profile: ${safeFileName}`)
      } catch {
        setSaveMessage(`Saved in this browser, but account sync failed: ${safeFileName}`)
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

  const deleteActiveFolder = () => {
    if (account.activeFolderId === 'all') return
    const folderId = account.activeFolderId
    const nextAccount = {
      ...account,
      folders: account.folders.filter((folder) => folder.id !== folderId),
      activeFolderId: 'all',
      projects: account.projects.map((project) => project.folderId === folderId ? { ...project, folderId: 'all' } : project),
    }
    setAccount(nextAccount)
  }

  const deleteProject = (projectId: string) => {
    const nextAccount = {
      ...account,
      projects: account.projects.filter((project) => project.id !== projectId),
    }
    setAccount(() => nextAccount)
    setSelectedProjectId(null)
  }

  const loadProject = (project: ProjectRecord) => {
    const [savedFrameType, savedMaterial] = project.style.split('-')
    const matchingColor = colorOptions.find((color) => color.name === project.color)
    setSelectedProjectId(project.id)
    setSelectedFrameType(frameTypeOptions.some((option) => option.id === savedFrameType) ? savedFrameType : 'modern')
    setSelectedStyle(materialOptions.some((option) => option.id === savedMaterial) ? savedMaterial : materialOptions[0].id)
    setSelectedSize(project.size === 'letter' || project.size === 'large' ? 'letter' : 'standard')
    if (project.frameSizeIndex !== undefined && standardFrameSizes[project.frameSizeIndex]) {
      setStandardFrameSizeIndex(project.frameSizeIndex)
    }
    if (matchingColor) setSelectedColor(matchingColor)
    restoringProjectRef.current = 2
    setFrameEnabled(project.frameEnabled ?? true)
    setMatEnabled(project.matEnabled ?? true)
    if (project.matColorId) setSelectedMatColor(matColorOptions.find((color) => color.id === project.matColorId) ?? selectedMatColor)
    setBottomMatEnabled(project.bottomMatEnabled ?? false)
    if (project.bottomMatColorId) setSelectedBottomMatColor(bottomMatColorOptions.find((color) => color.id === project.bottomMatColorId) ?? selectedBottomMatColor)
    if (project.stripColorId) setSelectedStripColor(stripColorOptions.find((color) => color.id === project.stripColorId) ?? selectedStripColor)
    setStripEnabled(project.stripEnabled ?? true)
    autoFitDefaultArtworkRef.current = false
    setArtwork(project.artwork)
    setArtworkRatio(project.artworkRatio ?? 4 / 5)
    artZoomRef.current = Math.min(maxArtZoom, Math.max(minArtZoom, project.zoom ?? 1))
    setZoom(artZoomRef.current)
    moveArtwork(project.artPosition ?? { x: 0, y: 0 })
    if (project.frameThickness !== undefined) setFrameThickness(project.frameThickness)
    if (project.matMargin !== undefined) setMatMargin(project.matMargin)
    if (project.stripThickness !== undefined) setStripThickness(project.stripThickness)
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const applyGalleryLook = (item: (typeof galleryItems)[number]) => {
    restoringProjectRef.current = 2
    setSelectedProjectId(null)
    autoFitDefaultArtworkRef.current = false
    setSelectedFrameType(item.profile)
    setSelectedStyle(item.material)
    setFrameThickness(item.frameWidth)
    setFrameEnabled(true)
    setSelectedSize(item.matSize)
    setMatMargin(item.matWidth)
    setSelectedMatColor(matColorOptions.find((color) => color.id === item.matColorId)!)
    setMatEnabled(true)
    setBottomMatEnabled(false)
    setSelectedStripColor(stripColorOptions.find((color) => color.id === item.stripColorId)!)
    setStripThickness(item.stripWidth)
    setStripEnabled(true)
    setArtwork(item.image)
    setArtworkRatio(1)
    artZoomRef.current = 1
    setZoom(1)
    moveArtwork({ x: 0, y: 0 })
    document.getElementById('workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    if (!pendingDownload || selectedProjectId !== pendingDownload.id) return
    let cancelled = false
    const download = async () => {
      try {
        const capture = captureRef.current
        if (!capture) throw new Error('Preview unavailable')
        const image = capture.querySelector<HTMLImageElement>('img.uploaded-artwork')
        if (image && !image.complete) {
          await new Promise<void>((resolve, reject) => {
            image.addEventListener('load', () => resolve(), { once: true })
            image.addEventListener('error', () => reject(new Error('Artwork could not be loaded')), { once: true })
          })
        }
        if (image && !image.naturalWidth) throw new Error('Artwork could not be loaded')
        await document.fonts.ready
        if (cancelled) return
        const selection = saveHandleRef.current
        const format = selection?.format ?? 'png'
        const canvas = await html2canvas(capture, {
          backgroundColor: null,
          scale: 2,
          useCORS: true,
          onclone: (documentClone) => {
            const clone = documentClone.querySelector<HTMLElement>('.art-capture-area')
            if (clone) clone.style.background = 'transparent'
          },
        })
        const wallX = Math.round(canvas.width * 0.18)
        const wallY = Math.round(canvas.height * 0.12)
        const screenshot = document.createElement('canvas')
        screenshot.width = canvas.width + wallX * 2
        screenshot.height = canvas.height + wallY * 2
        const context = screenshot.getContext('2d')
        if (!context) throw new Error('Screenshot canvas unavailable')
        const wall = context.createLinearGradient(0, 0, 0, screenshot.height)
        wall.addColorStop(0, wallTone === 'warm' ? '#fffaf0' : '#ffffff')
        wall.addColorStop(1, wallTone === 'warm' ? '#f3e7bc' : '#f4f1e8')
        context.fillStyle = wall
        context.fillRect(0, 0, screenshot.width, screenshot.height)
        context.shadowColor = 'rgba(23, 20, 18, 0.25)'
        context.shadowBlur = 36
        context.shadowOffsetY = 18
        context.drawImage(canvas, wallX, wallY)
        const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
        const blob = await new Promise<Blob | null>((resolve) => screenshot.toBlob(resolve, mime, 0.92))
        if (!blob || blob.type !== mime) throw new Error('Image encoding failed')
        const signature = new Uint8Array(await blob.slice(0, format === 'jpg' ? 3 : 8).arrayBuffer())
        if (format === 'jpg' ? signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255 : signature[0] !== 137 || signature[1] !== 80 || signature[2] !== 78 || signature[3] !== 71) {
          throw new Error('Image format mismatch')
        }
        if (cancelled) return
        if (selection?.handle) {
          const writable = await selection.handle.createWritable()
          await writable.write(blob)
          await writable.close()
          setDownloadMessage(`Saved ${selection.filename} to your device`)
          return
        }
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = selection?.filename ?? `${pendingDownload.name.replace(/[\\/:*?"<>|]+/g, '-')}.png`
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        setDownloadMessage(`Download requested: ${link.download}. Check your browser's Downloads.`)
      } catch {
        if (!cancelled) setDownloadMessage('Could not save this project to your device. Please try again.')
      } finally {
        if (!cancelled) {
          saveHandleRef.current = null
          setPendingDownload(null)
        }
      }
    }
    void download()
    return () => { cancelled = true }
  }, [pendingDownload, selectedProjectId, wallTone])

  const chooseSaveFile = async (project: ProjectRecord): Promise<ExportSelection | undefined> => {
    setDownloadMessage('')
    const filename = `${project.name.replace(/[\\/:*?"<>|]+/g, '-')}.${exportFormat}`
    const picker = (window as Window & { showSaveFilePicker?: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle> }).showSaveFilePicker
    if (picker) {
      try {
        const handle = await picker.call(window, { suggestedName: filename, types: [
          { description: 'PNG image', accept: { 'image/png': ['.png'] } },
          { description: 'JPG image', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } },
        ] })
        const extension = handle.name.toLowerCase().match(/\.(png|jpe?g)$/)?.[1]
        return { handle, filename: handle.name, format: extension === 'jpg' || extension === 'jpeg' ? 'jpg' : extension === 'png' ? 'png' : exportFormat }
      } catch (error) {
        setDownloadMessage((error as DOMException).name === 'AbortError' ? 'File save canceled; project remains in this browser.' : 'Could not open the Save dialog. Please try again.')
        return undefined
      }
    }
    return { handle: null, filename, format: exportFormat }
  }

  const beginProjectDownload = (project: ProjectRecord, selection: ExportSelection) => {
    saveHandleRef.current = selection
    loadProject(project)
    setPendingDownload(project)
  }

  const downloadProject = async (project: ProjectRecord) => {
    const selection = await chooseSaveFile(project)
    if (selection) beginProjectDownload(project, selection)
  }

  const sendContactMessage = () => {
    const subject = encodeURIComponent(`Framing project inquiry from ${contactName || 'customer'}`)
    const body = encodeURIComponent(contactMessage || 'Hello, I would like to discuss a custom frame order.')
    window.location.href = `mailto:hello@virtualartframingstudio.com?subject=${subject}&body=${body}`
  }

  useEffect(() => {
    const opening = artworkOpeningRef.current
    if (!artwork || !opening) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1)
      zoomArtworkAt(artZoomRef.current * Math.exp(-delta * 0.002), { x: event.clientX, y: event.clientY })
    }
    opening.addEventListener('wheel', handleWheel, { passive: false })
    return () => opening.removeEventListener('wheel', handleWheel)
  }, [artwork, matEnabled])

  const handleArtworkPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    if (pinchGestureRef.current) return
    setResizeDrag(null)
    event.currentTarget.setPointerCapture(event.pointerId)
    setArtDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: artPositionRef.current.x,
      originY: artPositionRef.current.y,
    })
  }

  const handlePinchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const opening = artworkOpeningRef.current
    const touches = Array.from(event.touches)
    if (!artwork || !opening || touches.length !== 2 || touches.some(
      (touch) => !(touch.target instanceof Node) || !opening.contains(touch.target),
    )) return
    const [first, second] = touches
    const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
    if (!distance) return
    pinchGestureRef.current = {
      distance,
      zoom: artZoomRef.current,
      position: artPositionRef.current,
      focus: { x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 },
    }
    setArtDrag(null)
    setResizeDrag(null)
  }

  const handlePinchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const gesture = pinchGestureRef.current
    if (event.touches.length !== 2 || !gesture) return
    const [first, second] = Array.from(event.touches)
    const distance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
    zoomArtworkAt(
      gesture.zoom * distance / gesture.distance,
      { x: (first.clientX + second.clientX) / 2, y: (first.clientY + second.clientY) / 2 },
      gesture.zoom,
      gesture.position,
      gesture.focus,
    )
  }

  const handlePinchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length < 2) pinchGestureRef.current = null
  }

  const updateCunMessage = (target: EventTarget | null) => {
    if (!cunActive || !(target instanceof Element)) return
    const control = target.closest<HTMLElement>('[data-cun-title][data-cun]')
    if (!control) return
    const title = control.dataset.cunTitle ?? 'Control'
    const description = control.dataset.cun ?? ''
    if (!description) return
    setCunMessage((current) => current.key === title ? current : { key: title, title, description })
  }

  return (
    <main
      className={cunActive ? 'studio-shell cun-guide-active' : 'studio-shell'}
      onPointerOverCapture={(event) => updateCunMessage(event.target)}
      onFocusCapture={(event) => updateCunMessage(event.target)}
    >
      {authSuccessMessage && <div className="auth-success-message" role="status">{authSuccessMessage}</div>}
      <header className="topbar">
        <div className="brand-wrap">
          <div className="brand-mark">V</div>
          <span>{t.brand}</span>
        </div>

        <nav className="nav">
          <a href="#workspace" data-cun-title="Workspace" data-cun="The framing workspace is where you upload artwork, choose frame and mat settings, adjust the image, and save a project.">{t.navWork}</a>
          <a href="#projects" data-cun-title="Projects" data-cun="Browse saved projects, open one to continue editing, download its framed image, or organize projects into folders.">{t.navProjects}</a>
          <a
            href="#confessn-university"
            className="nav-university-link"
            aria-controls="cun-notification"
            aria-expanded={cunActive}
            data-cun-title="Confessn University"
            data-cun="Turn on guide mode. Hover over or focus a workspace control to see its instructions. Open the full manual from the CUN notification."
            onClick={(event) => {
              event.preventDefault()
              setCunActive(true)
              setShowCunManual(false)
              setCunMessage({ key: 'ready', title: 'Guide mode is ready', description: 'Hover over or focus a highlighted control to see what it does and how to use it.' })
            }}
          >Confessn University</a>
          <a href="#about" data-cun-title="About" data-cun="Read about Confessn and the framing studio.">{t.navAbout}</a>
          <a href="#contact" data-cun-title="Contact" data-cun="Use the contact form to send a message to the studio.">{t.navContact}</a>
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
              <button type="button" className="profile-badge" aria-label={`Open account for ${account.name}`} data-cun-title="Account profile" data-cun="Open your account to update the profile name, email, password, or profile photo." onClick={openAccountDialog}>
                {account.avatar ? <img className="profile-avatar profile-avatar-image" src={account.avatar} alt="" /> : <span className="profile-avatar">{account.name.slice(0, 1).toUpperCase()}</span>}
                <span className="profile-name">{account.name}</span>
              </button>
              <button type="button" className="header-link-button" data-cun-title="Log out" data-cun="Sign out of the current account on this device." onClick={logOut}>Log out</button>
            </>
          ) : (
            <>
              <button type="button" className="header-link-button" data-cun-title="Log in" data-cun="Open the sign-in form to access an existing account." onClick={() => { setAuthMode('login'); setAuthMessage('') }}>
                {t.logIn}
              </button>
              <button type="button" className="primary-button compact-button" data-cun-title="Create account" data-cun="Create an account to manage your profile and saved framing projects." onClick={() => { setAuthMode('create'); setAuthMessage('') }}>
                {t.createAccount}
              </button>
            </>
          )}
          <select aria-label={t.languages} value={language} onChange={(event) => setLanguage(event.target.value as Language)} className="lang-select">
            <option value="en">EN</option><option value="fr">FR</option><option value="zh">中文</option><option value="de">DE</option><option value="it">IT</option><option value="es">ES</option><option value="ja">日本語</option>
          </select>
        </div>
      </header>

      {cunActive && (
        <aside id="cun-notification" className="cun-notification" aria-label="Confessn University Notification" role="status">
          <div className="cun-notification-heading">
            <span>Confessn University Notification</span>
            <button type="button" aria-label="Close CUN guide mode" onClick={() => { setCunActive(false); setShowCunManual(false) }}>×</button>
          </div>
          <strong>{cunMessage.title}</strong>
          <p>{cunMessage.description}</p>
          <button type="button" className="cun-manual-button" onClick={() => setShowCunManual(true)}>Open illustrated manual</button>
        </aside>
      )}

      <section id="workspace" className="hero-stage">
        <div
          className={`stage-shell stage-${wallTone}`}
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
              <button type="button" className={frameEnabled ? 'menu-chip active' : 'menu-chip'} aria-label="Toggle frame" data-cun-title="Frame on or off" data-cun="Toggle the decorative frame without changing the artwork or mat settings." onClick={() => setFrameEnabled((current) => !current)}>
                Frame
              </button>
              <select
                className="menu-select"
                aria-label="Frame type"
                data-cun-title="Frame type"
                data-cun="Choose Classic, Studio, Modern, or Floating to change the frame profile. Floating uses its own fixed dimensions."
                value={selectedFrameType}
                onChange={(event) => {
                  restoringProjectRef.current = 0
                  autoFitDefaultArtworkRef.current = true
                  artZoomRef.current = 1
                  setZoom(1)
                  moveArtwork({ x: 0, y: 0 })
                  setSelectedFrameType(event.target.value as typeof selectedFrameType)
                }}
              >
                {frameTypeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>

            <div className="menu-group">
              <span>Material</span>
              <select className="menu-select" aria-label="Frame material" data-cun-title="Frame material" data-cun="Choose a material and finish, including wood and stainless options." value={selectedStyle} onChange={(event) => { restoringProjectRef.current = 0; setSelectedStyle(event.target.value) }}>
                {materialOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>

            <div className="menu-group">
              <button type="button" className={matEnabled ? 'menu-chip active' : 'menu-chip'} aria-label="Toggle top mat" data-cun-title="Top Mat" data-cun="Turn the outer mat layer on or off. Choose Standard or Letter size and a color beside this control." onClick={() => setMatEnabled((current) => !current)}>
                Top Mat
              </button>
              <select className="menu-select" aria-label="Top mat size" data-cun-title="Top Mat size" data-cun="Choose Standard or Letter to change the outer mat opening size." value={selectedSize} onChange={(event) => { restoringProjectRef.current = 0; setSelectedSize(event.target.value as typeof selectedSize) }}>
                {sizeOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>

            <div className="menu-group compact-group">
              <span>Top Mat color</span>
              <label className="color-picker">
                <span className="swatch-mini" style={{ background: selectedMatColor.hex }}></span>
                <select
                  aria-label="Top mat color"
                  data-cun-title="Top Mat color"
                  data-cun="Choose the color for the outer mat board."
                  value={selectedMatColor.id}
                  onChange={(event) => setSelectedMatColor(matColorOptions.find((color) => color.id === event.target.value) ?? matColorOptions[0])}
                >
                  {matColorOptions.map((color) => <option key={color.id} value={color.id}>{color.name}</option>)}
                </select>
              </label>
            </div>

            <div className="menu-group compact-group">
              <button
                type="button"
                className={bottomMatEnabled ? 'menu-chip active' : 'menu-chip'}
                aria-label="Toggle bottom mat"
                aria-pressed={bottomMatEnabled}
                data-cun-title="Bottom Mat"
                data-cun="Turn on the inner mat layer, then choose its color from the menu beside it."
                onClick={() => setBottomMatEnabled((current) => !current)}
              >
                Bottom Mat
              </button>
              <label className="color-picker">
                <span className="swatch-mini" style={{ background: selectedBottomMatColor.hex }}></span>
                <select
                  aria-label="Bottom mat color"
                  data-cun-title="Bottom Mat color"
                  data-cun="Choose the color for the inner mat. This menu becomes available when Bottom Mat is on."
                  value={selectedBottomMatColor.id}
                  disabled={!bottomMatEnabled}
                  onChange={(event) => setSelectedBottomMatColor(bottomMatColorOptions.find((color) => color.id === event.target.value) ?? bottomMatColorOptions[0])}
                >
                  {bottomMatColorOptions.map((color) => <option key={color.id} value={color.id}>{color.name}</option>)}
                </select>
              </label>
            </div>

            <div className="menu-actions">
              <button type="button" className="menu-action workspace-upload-action" data-cun-title="Upload artwork" data-cun="Choose an image from your device to place it inside the frame. Upload replaces the current artwork." onClick={openArtworkPicker}>
                Upload
              </button>
              <button
                type="button"
                className={frameOrientation === 'horizontal' ? 'menu-action active' : 'menu-action'}
                aria-label="Horizontal frame"
                title="Horizontal frame"
                data-cun-title="Horizontal orientation"
                data-cun="Set the artwork orientation to horizontal. The image will remain centered in the mat opening."
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
                data-cun-title="Vertical orientation"
                data-cun="Set the artwork orientation to vertical. The image will remain centered in the mat opening."
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
                aria-label="Mat Offcut"
                aria-pressed={stripEnabled}
                title="Mat Offcut"
                data-cun-title="Mat Offcut"
                data-cun="Toggle the narrow accent strip where the outer and inner mat layers meet. Choose its color from the adjacent menu."
                onClick={() => setStripEnabled((current) => !current)}
              >
                Mat Offcut
              </button>
              <label className="color-picker">
                <span className="swatch-mini" style={{ background: selectedStripColor.hex }}></span>
                <select
                  aria-label="Strip color"
                  data-cun-title="Mat Offcut color"
                  data-cun="Choose the accent color for the Mat Offcut strip."
                  value={selectedStripColor.id}
                  onChange={(event) => setSelectedStripColor(stripColorOptions.find((color) => color.id === event.target.value) ?? stripColorOptions[0])}
                >
                  {stripColorOptions.map((color) => <option key={color.id} value={color.id}>{color.name}</option>)}
                </select>
              </label>
              <button
                type="button"
                className={wallTone === 'white' ? 'menu-action active' : 'menu-action'}
                data-cun-title="Wall"
                data-cun="Set the preview wall to the white tone. This changes the display background, not the frame or artwork."
                onClick={() => setWallTone('white')}
              >
                Wall
              </button>
              <button
                type="button"
                className={wallTone === 'warm' ? 'menu-action active' : 'menu-action'}
                data-cun-title="Light wall"
                data-cun="Set the preview wall to the warm light tone. This changes the display background, not the frame or artwork."
                onClick={() => setWallTone('warm')}
              >
                Light
              </button>
            </div>

            <select
              className="standard-size-control"
              data-screenshot-ignore
              disabled={selectedFrameType === 'floating'}
              aria-label="Change standard frame size"
              title="Change standard frame size"
              data-cun-title="Frame size"
              data-cun="Choose a physical frame size from the Small, Medium, Large, or Square groups. Floating frames use their fixed size instead."
              value={standardFrameSizeIndex}
              onChange={(event) => {
                autoFitDefaultArtworkRef.current = true
                artZoomRef.current = 1
                setZoom(1)
                moveArtwork({ x: 0, y: 0 })
                setStandardFrameSizeIndex(Number(event.target.value))
              }}
            >
              {frameSizeGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.sizes.map((size) => {
                    const index = standardFrameSizes.indexOf(size)
                    return (
                      <option key={`${size.width}x${size.height}`} value={index}>
                        {size.width.toFixed(2)} in × {size.height.toFixed(2)} in
                      </option>
                    )
                  })}
                </optgroup>
              ))}
            </select>

            <button type="button" className="gallery-center-button workspace-upload-action" data-cun-title="Replace artwork" data-cun="Choose another image from your device. Your frame and mat selections stay in place." onClick={openArtworkPicker}>
              {artwork ? 'Replace artwork' : 'Upload artwork'}
            </button>
            {uploadMessage && <span className="upload-message" role="alert">{uploadMessage}</span>}
            <div className="workspace-scale" aria-label="Frame size">
              {(selectedFrameType === 'floating' ? frameWidthInches : standardFrameSizes[standardFrameSizeIndex].width).toFixed(2)} in × {(selectedFrameType === 'floating' ? frameHeightInches : standardFrameSizes[standardFrameSizeIndex].height).toFixed(2)} in
            </div>
            <div className="workspace-save-area">
              {saveMessage && <span className="save-message">{saveMessage}</span>}
              {downloadMessage && <span className="save-message" role="status">{downloadMessage}</span>}
              <button type="button" className="workspace-save-button" data-cun-title="Save Project" data-cun="Name the project, choose a folder and PNG or JPG, then save the editable project and framed image." onClick={saveProject} disabled={!accountReady}>
                Save Project
              </button>
            </div>
          </div>

          <div
            className="workspace-canvas"
            onTouchStart={handlePinchStart}
            onTouchMove={handlePinchMove}
            onTouchEnd={handlePinchEnd}
            onTouchCancel={handlePinchEnd}
          >
            <div
              ref={captureRef}
              className="art-capture-area"
              style={{ width: `min(100%, ${previewWidth + 48}px)`, aspectRatio: previewFrameRatio }}
            >
              <div
                ref={!matEnabled && !bottomMatEnabled ? artworkOpeningRef : undefined}
                className="art-preview"
                style={{
                  borderColor: selectedColor.hex,
                  width: `min(100%, ${previewWidth}px)`,
                  aspectRatio: previewFrameRatio,
                }}
              >
                {(matEnabled || bottomMatEnabled) && (
                  <div
                    className="mat-stack"
                    style={{
                      inset: `${frameThickness + frameGap}px`,
                      padding: `${matMargin}px`,
                      background: matEnabled ? selectedMatColor.hex : selectedBottomMatColor.hex,
                      pointerEvents: 'auto',
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType !== 'touch') return
                      event.preventDefault()
                      event.stopPropagation()
                      event.currentTarget.setPointerCapture(event.pointerId)
                      setResizeDrag({ kind: 'mat', startY: event.clientY, startValue: matMargin })
                    }}
                  >
                    {matEnabled ? (
                      <div
                        className="art-mat"
                        style={{
                          position: 'relative',
                          inset: 'auto',
                          width: '100%',
                          height: '100%',
                          boxSizing: 'border-box',
                          padding: bottomMatEnabled ? `${bottomMatMargin}px` : 0,
                          background: bottomMatEnabled ? selectedBottomMatColor.hex : 'transparent',
                          borderColor: stripEnabled ? selectedStripColor.hex : 'transparent',
                          borderStyle: 'solid',
                          borderWidth: stripEnabled ? `${Math.max(2, stripThickness)}px` : 0,
                        }}
                      >
                        <div
                          ref={artworkOpeningRef}
                          className="mat-cut-edge"
                          style={{
                            borderColor: selectedMatColor.hex,
                            borderWidth: 0,
                            boxShadow: 'none',
                            background: selectedMatColor.hex,
                          }}
                        >
                          {artwork ? (
                            <img
                              key={artwork}
                              className="uploaded-artwork"
                              src={artwork}
                              alt="Uploaded artwork preview"
                              style={{ transform: `translate(${artPosition.x}px, ${artPosition.y}px) scale(${zoom})` }}
                              onPointerDown={handleArtworkPointerDown}
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
                      </div>
                    ) : (
                      <div
                        ref={artworkOpeningRef}
                        className="mat-cut-edge bottom-mat-opening"
                        style={{
                          borderColor: stripEnabled ? selectedStripColor.hex : selectedBottomMatColor.hex,
                          borderWidth: stripEnabled ? `${Math.max(2, stripThickness)}px` : 0,
                          boxShadow: stripEnabled ? 'inset 0 0 0 1px rgba(255, 255, 255, 0.75)' : 'none',
                          background: selectedBottomMatColor.hex,
                        }}
                      >
                        {artwork ? (
                          <img
                            key={artwork}
                            className="uploaded-artwork"
                            src={artwork}
                            alt="Uploaded artwork preview"
                            style={{ transform: `translate(${artPosition.x}px, ${artPosition.y}px) scale(${zoom})` }}
                            onPointerDown={handleArtworkPointerDown}
                          />
                        ) : (
                          <div className="art-placeholder">Your artwork</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {!matEnabled && !bottomMatEnabled && artwork && <img
                  className="uploaded-artwork artwork-without-mat"
                  src={artwork}
                  alt="Uploaded artwork preview"
                  style={{ transform: `translate(${artPosition.x}px, ${artPosition.y}px) scale(${zoom})` }}
                  onPointerDown={handleArtworkPointerDown}
                />}
                {frameEnabled && <div
                  className={`frame-shell frame-${selectedStyle} frame-${selectedFrameType}`}
                  style={{
                    '--frame-width': `${frameThickness}px`,
                    '--frame-texture-horizontal': frameTextures[selectedStyle] ? `url("${frameTextures[selectedStyle].horizontal}")` : undefined,
                    '--frame-texture-vertical': frameTextures[selectedStyle] ? `url("${frameTextures[selectedStyle].vertical}")` : undefined,
                  } as React.CSSProperties}
                  onPointerDown={(event) => {
                    if (event.pointerType !== 'touch') return
                    event.preventDefault()
                    event.stopPropagation()
                    event.currentTarget.setPointerCapture(event.pointerId)
                    setResizeDrag({ kind: 'frame', startY: event.clientY, startValue: frameThickness })
                  }}
                >
                  <span className="frame-side frame-side-top" />
                  <span className="frame-side frame-side-right" />
                  <span className="frame-side frame-side-bottom" />
                  <span className="frame-side frame-side-left" />
                </div>}
              </div>
            </div>
            <div className="workspace-adjust-tools" data-screenshot-ignore>
              <button
                type="button"
                className="menu-action"
                aria-label="Adjust frame thickness"
                title="Drag F to adjust frame thickness"
                data-cun-title="F · Frame thickness"
                data-cun="Press and drag this control vertically. Drag up to make the frame thicker; drag down to make it thinner."
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setResizeDrag({ kind: 'frame', startY: event.clientY, startValue: frameThickness })
                }}
              >F</button>
              <button
                type="button"
                className="menu-action"
                aria-label="Adjust mat size"
                title="Drag M to adjust mat size"
                data-cun-title="M · Mat width"
                data-cun="Press and drag this control vertically. Drag up to widen the mat; drag down to narrow it."
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setResizeDrag({ kind: 'mat', startY: event.clientY, startValue: matMargin })
                }}
              >M</button>
              <button type="button" className="menu-action" aria-label="Zoom out artwork" data-cun-title="Zoom out" data-cun="Reduce the artwork zoom one step. Zoom cannot go below the cover size, so the mat opening stays filled." disabled={!artwork} onClick={() => adjustArtworkZoom(1 / 1.1)}>−</button>
              <button type="button" className="menu-action" aria-label="Zoom in artwork" data-cun-title="Zoom in" data-cun="Enlarge the artwork one step. Drag the image to reposition it within the mat opening." disabled={!artwork} onClick={() => adjustArtworkZoom(1.1)}>+</button>
              <button
                type="button"
                className="menu-action"
                aria-label="Adjust strip size"
                title="Drag S to adjust strip thickness"
                data-cun-title="S · Offcut width"
                data-cun="Press and drag this control vertically. Drag up to widen the Mat Offcut; drag down to narrow it."
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setResizeDrag({ kind: 'strip', startY: event.clientY, startValue: stripThickness })
                }}
              >S</button>
            </div>
          </div>
          {showDimensions && (
            <div className="workspace-dimensions" aria-label="Artwork dimensions">
              <span className="dimension-width">{artWidthInches.toFixed(1)} in</span>
              <span className="dimension-height">{artHeightInches.toFixed(1)} in</span>
            </div>
          )}
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
          {galleryItems.map((item) => {
            const matColor = matColorOptions.find((color) => color.id === item.matColorId)!
            const stripColor = stripColorOptions.find((color) => color.id === item.stripColorId)!
            return (
            <article key={item.title} className="gallery-card">
              <div
                className={`gallery-frame frame-${item.material} frame-${item.profile}`}
                style={{
                  '--frame-width': `${item.frameWidth}px`,
                  '--frame-texture-horizontal': `url("${frameTextures[item.material].horizontal}")`,
                  '--frame-texture-vertical': `url("${frameTextures[item.material].vertical}")`,
                  '--gallery-mat-color': matColor.hex,
                  '--gallery-mat-width': `${item.matWidth}px`,
                  '--gallery-strip-color': stripColor.hex,
                  '--gallery-strip-width': `${item.stripWidth}px`,
                } as React.CSSProperties}
              >
                <div className="gallery-mat">
                  <img src={item.image} alt={item.title} />
                </div>
                <div className="frame-shell" aria-hidden="true">
                  <span className="frame-side frame-side-top" />
                  <span className="frame-side frame-side-right" />
                  <span className="frame-side frame-side-bottom" />
                  <span className="frame-side frame-side-left" />
                </div>
              </div>
              <div className="gallery-info">
                <strong>{item.title}</strong>
                <span>{item.details}</span>
                <button type="button" className="gallery-use-button" onClick={() => applyGalleryLook(item)} aria-label={`Use ${item.title} look`} data-cun-title={`Use ${item.title} look`} data-cun="Load this example artwork and its matching frame and mat settings into the workspace.">Use this look</button>
              </div>
            </article>
          )})}
        </div>
      </section>

      <section id="about" className="bottom-grid">
        <div className="project-list panel-block">
          <div className="saved-projects-heading">
            <h3>{t.savedProjects}</h3>
            <button type="button" className="folder-plus-button" aria-label="Create folder" title="Create folder" data-cun-title="Create project folder" data-cun="Create a folder to organize saved framing projects." onClick={() => setShowFolderDialog(true)}>+</button>
          </div>
          <div className="folder-bar">
            <select value={account.activeFolderId} onChange={(event) => setAccount({ ...account, activeFolderId: event.target.value })} aria-label="Project folder" data-cun-title="Project folder filter" data-cun="Choose which folder's saved projects to display.">
              {account.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            <button type="button" className="menu-action" data-cun-title="Rename folder" data-cun="Rename the currently selected project folder." onClick={renameActiveFolder} disabled={account.activeFolderId === 'all'}>Rename</button>
            <button type="button" className="menu-action" data-cun-title="Delete folder" data-cun="Delete the selected folder." onClick={deleteActiveFolder} disabled={account.activeFolderId === 'all'}>Delete</button>
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
                    data-cun-title={`Open ${project.name}`}
                    data-cun="Select this saved project to restore its artwork, frame, and mat settings in the workspace."
                    onClick={() => loadProject(project)}
                  >
                    {project.artwork && <img className="saved-project-thumb" src={project.artwork} alt="" />}
                    <strong>{project.name}</strong>
                    <span>
                      {project.size === 'letter' || project.size === 'large' ? 'Letter' : 'Standard'} · {project.color}
                    </span>
                  </button>
                  <div className="project-row-actions">
                    <button
                      type="button"
                      className="trash-button project-download-button"
                      aria-label={`Download ${project.name}`}
                      title="Download framed project"
                      data-cun-title={`Download ${project.name}`}
                      data-cun="Download this project's framed artwork image."
                      disabled={!project.artwork || pendingDownload !== null}
                      onClick={() => void downloadProject(project)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="trash-button project-trash-button"
                      aria-label={`Delete ${project.name}`}
                      data-cun-title={`Delete ${project.name}`}
                      data-cun="Remove this saved project from the project list."
                      onClick={() => deleteProject(project.id)}
                    >
                      🗑
                    </button>
                  </div>
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
          <button type="button" className="primary-button" data-cun-title="Send message" data-cun="Send the contact form message to the studio." onClick={sendContactMessage}>
            {t.send}
          </button>
        </div>
      </section>

      {showCunManual && (
        <div className="dialog-overlay university-overlay" onClick={() => setShowCunManual(false)}>
          <section
            className="dialog-box university-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cun-manual-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dialog-header university-header">
              <div>
                <p className="university-eyebrow">Confessn University</p>
                <h2 id="cun-manual-title">Framing Manual</h2>
              </div>
              <button type="button" aria-label="Close framing manual" onClick={() => setShowCunManual(false)}>×</button>
            </div>
            <p className="university-intro">Use the guide mode to identify any control. This manual covers the complete framing workflow.</p>

            <div className="university-diagrams">
              <div className="university-frame-diagram" role="img" aria-label="Frame, outer top mat, colored offcut, inner bottom mat, and artwork layers">
                <div className="university-diagram-top-mat">
                  <div className="university-diagram-offcut">
                    <div className="university-diagram-bottom-mat">
                      <div className="university-diagram-art">ART</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="university-layer-labels">
                <span><i className="layer-swatch layer-frame" />Frame</span>
                <span><i className="layer-swatch layer-top-mat" />Top Mat · outer</span>
                <span><i className="layer-swatch layer-offcut" />Mat Offcut</span>
                <span><i className="layer-swatch layer-bottom-mat" />Bottom Mat · inner</span>
                <span><i className="layer-swatch layer-art" />Artwork</span>
              </div>
              <div className="university-gesture-guide" aria-label="Drag adjustment controls">
                <div><kbd>F</kbd><span>Frame width</span></div>
                <div><kbd>M</kbd><span>Mat width</span></div>
                <div><kbd>S</kbd><span>Offcut width</span></div>
                <p>Press and drag up to increase; drag down to decrease.</p>
              </div>
            </div>

            <div className="university-manual-grid">
              <section className="university-guide-section">
                <h3>Start with artwork</h3>
                <p>Choose <strong>Upload</strong> or <strong>Replace artwork</strong> to select an image from your device. From the gallery, select <strong>Use this look</strong> to load an example and its matching frame settings.</p>
              </section>
              <section className="university-guide-section">
                <h3>Choose frame</h3>
                <p>Toggle <strong>Frame</strong> on or off. Choose Classic, Studio, Modern, or Floating, then choose a material. Use the size menu to select Small, Medium, Large, or Square dimensions; Floating uses its own dimensions.</p>
              </section>
              <section className="university-guide-section">
                <h3>Layer the mats</h3>
                <p><strong>Top Mat</strong> is the outer layer. Choose Standard or Letter and a color. Enable <strong>Bottom Mat</strong> to add an inner layer and choose its color. <strong>Mat Offcut</strong> toggles the accent at the boundary between the mats; its adjacent menu changes the accent color.</p>
              </section>
              <section className="university-guide-section">
                <h3>Position and zoom</h3>
                <p>Drag the artwork to reposition it. Use <strong>−</strong> and <strong>+</strong> to zoom with a mouse, or drag with one finger and pinch with two on a touch screen. The image covers the mat opening; zoom cannot go below the cover size.</p>
              </section>
              <section className="university-guide-section">
                <h3>Adjust the frame and mats</h3>
                <p>Press and drag <strong>F</strong> for frame thickness, <strong>M</strong> for mat width, or <strong>S</strong> for offcut width. Drag upward to increase a value and downward to decrease it.</p>
              </section>
              <section className="university-guide-section">
                <h3>Set orientation and wall</h3>
                <p>Choose <strong>↔</strong> for horizontal or <strong>↕</strong> for vertical artwork. <strong>Wall</strong> and <strong>Light</strong> choose the preview wall tone behind the frame.</p>
              </section>
              <section className="university-guide-section">
                <h3>Save and continue later</h3>
                <p>Select <strong>Save Project</strong>, enter a name, choose a folder and PNG or JPG, then save. The editable project is kept in this browser and the framed artwork can be downloaded. In <strong>Projects</strong>, select an item to reopen it, use the down arrow to download, or the trash button to delete. Folder controls organize saved work.</p>
              </section>
            </div>

            <div className="university-footer">
              <span>Hover over or focus any control with guide mode on for a specific tip.</span>
              <button type="button" className="primary-button" onClick={() => setShowCunManual(false)}>Back to guide</button>
            </div>
          </section>
        </div>
      )}

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
            <div className="field-group">
              <span className="field-label">Image format</span>
              <div className="format-options save-format-options" role="group" aria-label="Image format">
                {(['png', 'jpg'] as const).map((format) => (
                  <button key={format} type="button" className={`format-option ${exportFormat === format ? 'active' : ''}`} aria-pressed={exportFormat === format} onClick={() => setExportFormat(format)}>{format.toUpperCase()}</button>
                ))}
              </div>
            </div>
            {saveError && <p className="dialog-hint" role="alert">{saveError}</p>}
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
