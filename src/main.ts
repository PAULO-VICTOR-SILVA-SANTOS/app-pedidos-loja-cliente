import './style.css'
import * as storeApi from './api/storeApi'
import logoLugarDasTintas from '../images/LOGO CASTRO MULTIMARCAS.png'
import cadastroLojaBg from '../images/cadastro-loja-castro.png'
import camisa1Img from '../images/camisa 1.jpg'
import camisa2Img from '../images/camisa 2.jpg'
import camisa3Img from '../images/camisa 3.jpg'
import cueca1Img from '../images/cueca 1.jpg'
import cueca2Img from '../images/cueca 2.jpg'
import short1Img from '../images/short 1.jpg'
import short2Img from '../images/short 2.jpg'
import short3Img from '../images/short 3.jpg'

/** Máximo de fotos por produto (admin + persistência). */
const MAX_PRODUCT_IMAGES = 10
/** Estoque usado quando o JSON antigo não tinha o campo `estoque`. */
const LEGACY_DEFAULT_ESTOQUE = 999
/** Estoque inicial das peças modelo de exemplo. */
const SEED_MODELO_ESTOQUE = 20

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Step = 'cadastro' | 'catalogo' | 'carrinho' | 'checkout' | 'concluido' | 'admin'

type Customer = {
  /** Somente dígitos (11), ou string vazia */
  cpf: string
  nomeCompleto: string
  enderecoCompleto: string
  nomeOficina: string
  email: string
  whatsapp: string
}

type Category =
  | 'Camisetas e blusas'
  | 'Calças e jeans'
  | 'Vestidos e saias'
  | 'Shorts e bermudas'
  | 'Calçados'
  | 'Acessórios'
  | 'Casacos e jaquetas'
  | 'Outros'

type Product = {
  id: string
  nome: string
  marca: string
  categoria: Category
  subcategoria?: string
  preco: number
  /** URLs ou data URLs; frente, costas, lateral… (máx. 10). */
  imagens: string[]
  estoque: number
  uso: string
  custom?: boolean // adicionado pelo admin
  /** Peça de exemplo (imagens em /modelos/); pode remover no painel */
  modelo?: boolean
}

type AppState = {
  step: Step
  prevStep: Step
  customer: Customer
  filtroBusca: string
  filtroCategoria: 'todas' | Category
  cart: Record<string, number>
  /** id da modalidade configurada em checkoutOptions */
  deliveryMode: string
  /** id da forma de pagamento configurada em checkoutOptions */
  paymentMethod: string
  cashChangeFor: string
  isAdminAuthenticated: boolean
  pedidoNumero: string
  fichaTecnicaId: string | null
}

// ─── Catálogo base: peças modelo (imagens em /public/modelos/) na primeira visita ───

function seedModeloProducts(): Product[] {
  return [
    {
      id: 'modelo-camisa-1',
      nome: 'Camisa modelo 1',
      marca: 'Castro Multimarcas',
      categoria: 'Camisetas e blusas',
      subcategoria: 'Manga curta',
      preco: 89.9,
      imagens: [camisa1Img],
      estoque: SEED_MODELO_ESTOQUE,
      uso: 'Peça modelo para vitrine inicial do catálogo.',
      modelo: true
    },
    {
      id: 'modelo-camisa-2',
      nome: 'Camisa modelo 2',
      marca: 'Castro Multimarcas',
      categoria: 'Camisetas e blusas',
      subcategoria: 'Manga curta',
      preco: 89.9,
      imagens: [camisa2Img],
      estoque: SEED_MODELO_ESTOQUE,
      uso: 'Peça modelo para vitrine inicial do catálogo.',
      modelo: true
    },
    {
      id: 'modelo-camisa-3',
      nome: 'Camisa modelo 3',
      marca: 'Castro Multimarcas',
      categoria: 'Camisetas e blusas',
      subcategoria: 'Manga curta',
      preco: 89.9,
      imagens: [camisa3Img],
      estoque: SEED_MODELO_ESTOQUE,
      uso: 'Peça modelo para vitrine inicial do catálogo.',
      modelo: true
    },
    {
      id: 'modelo-short-1',
      nome: 'Short modelo 1',
      marca: 'Castro Multimarcas',
      categoria: 'Shorts e bermudas',
      subcategoria: 'Casual',
      preco: 69.9,
      imagens: [short1Img],
      estoque: SEED_MODELO_ESTOQUE,
      uso: 'Peça modelo para vitrine inicial do catálogo.',
      modelo: true
    },
    {
      id: 'modelo-short-2',
      nome: 'Short modelo 2',
      marca: 'Castro Multimarcas',
      categoria: 'Shorts e bermudas',
      subcategoria: 'Casual',
      preco: 69.9,
      imagens: [short2Img],
      estoque: SEED_MODELO_ESTOQUE,
      uso: 'Peça modelo para vitrine inicial do catálogo.',
      modelo: true
    },
    {
      id: 'modelo-short-3',
      nome: 'Short modelo 3',
      marca: 'Castro Multimarcas',
      categoria: 'Shorts e bermudas',
      subcategoria: 'Casual',
      preco: 69.9,
      imagens: [short3Img],
      estoque: SEED_MODELO_ESTOQUE,
      uso: 'Peça modelo para vitrine inicial do catálogo.',
      modelo: true
    },
    {
      id: 'modelo-cueca-1',
      nome: 'Cueca modelo 1',
      marca: 'Castro Multimarcas',
      categoria: 'Outros',
      subcategoria: 'Moda intima',
      preco: 39.9,
      imagens: [cueca1Img],
      estoque: SEED_MODELO_ESTOQUE,
      uso: 'Peça modelo para vitrine inicial do catálogo.',
      modelo: true
    },
    {
      id: 'modelo-cueca-2',
      nome: 'Cueca modelo 2',
      marca: 'Castro Multimarcas',
      categoria: 'Outros',
      subcategoria: 'Moda intima',
      preco: 39.9,
      imagens: [cueca2Img],
      estoque: SEED_MODELO_ESTOQUE,
      uso: 'Peça modelo para vitrine inicial do catálogo.',
      modelo: true
    }
  ]
}

// ─── Persistência (LocalStorage) ─────────────────────────────────────────────

const STORAGE_KEYS = {
  /** Chave nova para catálogo da loja de roupas (sem produtos de exemplo antigos). */
  products: 'apd_products_roupas',
  /** Se "1", não carrega mais o catálogo inicial de peças modelo (mesmo com storage limpo). */
  modelosExemplosRemovidos: 'apd_modelos_exemplos_removidos',
  state: 'apd_state',
  customers: 'apd_customers',
  branding: 'apd_store_branding',
  checkoutOptions: 'apd_checkout_options'
}

type DeliveryOptionConfig = {
  id: string
  title: string
  description: string
  /** Se true, na finalização mostra o endereço do cliente no lugar da descrição. */
  showCustomerAddress: boolean
}

type PaymentOptionConfig = {
  id: string
  title: string
  detail: string
  /** Exibe campo “troco para quanto?” e validação em relação ao total. */
  asksCashChange: boolean
}

type CheckoutOptions = {
  /** Oferecer retirada na loja ao cliente. */
  pickupEnabled: boolean
  /** Oferecer entrega ao cliente. */
  deliveryEnabled: boolean
  /** Se true, o valor em `deliveryFee` entra no total quando a modalidade ativa é “entrega”. */
  deliveryFeeEnabled: boolean
  /** Valor da taxa (editável no admin; só soma ao pedido com “entrega” + opção de taxa ativas). */
  deliveryFee: number
  deliveryOptions: DeliveryOptionConfig[]
  paymentCashEnabled: boolean
  paymentCardEnabled: boolean
  paymentPixEnabled: boolean
  /** Chave PIX da loja (copiável pelo cliente no checkout). */
  pixKey: string
  /** Dígitos do WhatsApp (wa.me) que recebe o pedido; vazio = sem envio por WhatsApp até cadastrar no admin. */
  pedidoWhatsapp: string
  paymentOptions: PaymentOptionConfig[]
}

function fmtBrlCheckout(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

/** Monta `deliveryOptions` a partir de retirada / entrega / taxa (painel admin). */
function applyDeliveryFlagsToOptions(opts: CheckoutOptions): CheckoutOptions {
  const list: DeliveryOptionConfig[] = []
  if (opts.pickupEnabled) {
    list.push(
      normalizeDeliveryOption({
        id: 'retirada',
        title: 'Retirada na loja',
        description: 'Retire seu pedido no endereço da loja (veja “Sobre a loja”).',
        showCustomerAddress: false
      })
    )
  }
  if (opts.deliveryEnabled) {
    const fee = Math.max(0, Number(opts.deliveryFee) || 0)
    const feeOn = opts.deliveryFeeEnabled === true
    const desc = !feeOn
      ? 'Entrega no endereço informado. Sem taxa de entrega no total.'
      : fee > 0
        ? `Taxa de entrega: ${fmtBrlCheckout(fee)}. Informe o endereço na finalização.`
        : 'Taxa de entrega ativa (R$ 0,00). Informe o endereço na finalização.'
    list.push(
      normalizeDeliveryOption({
        id: 'entrega',
        title: 'Entrega',
        description: desc,
        showCustomerAddress: true
      })
    )
  }
  return { ...opts, deliveryOptions: list }
}

/** Monta `paymentOptions` a partir de dinheiro / cartão / PIX + chave PIX. */
function applyPaymentFlagsToOptions(opts: CheckoutOptions): CheckoutOptions {
  const list: PaymentOptionConfig[] = []
  const pixKey = String(opts.pixKey ?? '').trim()
  if (opts.paymentCashEnabled) {
    list.push(
      normalizePaymentOption({
        id: 'dinheiro',
        title: 'Dinheiro',
        detail: 'Pagamento em espécie. Informe o troco abaixo, se precisar.',
        asksCashChange: true
      })
    )
  }
  if (opts.paymentCardEnabled) {
    list.push(
      normalizePaymentOption({
        id: 'cartao',
        title: 'Cartão',
        detail: 'Cartão de crédito ou débito.',
        asksCashChange: false
      })
    )
  }
  if (opts.paymentPixEnabled) {
    const detail =
      pixKey.length > 0
        ? pixKey.length > 96
          ? `${pixKey.slice(0, 93)}…`
          : pixKey
        : 'Cadastre a chave PIX no painel administrativo.'
    list.push(
      normalizePaymentOption({
        id: 'pix',
        title: 'PIX',
        detail,
        asksCashChange: false
      })
    )
  }
  return { ...opts, paymentOptions: list }
}

function inferLegacyPaymentCash(legacy: PaymentOptionConfig[]): boolean {
  if (legacy.length === 0) return true
  return legacy.some((o) => /dinheiro|esp[eé]cie/i.test(`${o.id} ${o.title}`))
}

function inferLegacyPaymentCard(legacy: PaymentOptionConfig[]): boolean {
  if (legacy.length === 0) return true
  return legacy.some((o) => /cart[aã]o|cr[eé]dito|d[eé]bito/i.test(`${o.id} ${o.title}`))
}

function inferLegacyPaymentPix(legacy: PaymentOptionConfig[]): boolean {
  if (legacy.length === 0) return true
  return legacy.some((o) => /pix/i.test(`${o.id} ${o.title}`))
}

function inferLegacyPixKey(legacy: PaymentOptionConfig[]): string {
  const row = legacy.find((o) => /pix/i.test(`${o.id} ${o.title}`))
  return String(row?.detail ?? '').trim()
}

function inferLegacyPickupEnabled(d: unknown): boolean {
  if (!Array.isArray(d) || d.length === 0) return true
  return d.some((x) => {
    const o = x as Partial<DeliveryOptionConfig>
    const t = String(o.title ?? '')
    return String(o.id ?? '') === 'retirada' || /retirada/i.test(t)
  })
}

function inferLegacyDeliveryEnabled(d: unknown): boolean {
  if (!Array.isArray(d) || d.length === 0) return true
  return d.some((x) => {
    const o = x as Partial<DeliveryOptionConfig>
    const t = String(o.title ?? '')
    return String(o.id ?? '') === 'entrega' || /entrega/i.test(t)
  })
}

function parseLegacyDeliveryFee(d: unknown): number {
  if (!Array.isArray(d)) return 0
  const entrega = d.find((x) => {
    const o = x as Partial<DeliveryOptionConfig>
    const t = String(o.title ?? '')
    return String(o.id ?? '') === 'entrega' || /entrega/i.test(t)
  }) as Partial<DeliveryOptionConfig> | undefined
  const desc = String(entrega?.description ?? '')
  const m = desc.match(/(?:taxa\s*de\s*entrega|R\$)\s*:?\s*([\d]{1,9}(?:[.,]\d{1,2})?)/i)
  if (!m) return 0
  const raw = m[1].includes(',') ? m[1].replace(/\./g, '').replace(',', '.') : m[1]
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function normalizeLoadedCheckoutOptions(parsed: Partial<CheckoutOptions>): CheckoutOptions {
  const rawPay = Array.isArray(parsed.paymentOptions) ? parsed.paymentOptions : []
  const legacyP = rawPay.map((x) => normalizePaymentOption(x as Partial<PaymentOptionConfig>))
  const legacyD = Array.isArray(parsed.deliveryOptions) ? parsed.deliveryOptions : []

  const pickupExplicit = typeof parsed.pickupEnabled === 'boolean'
  const deliveryExplicit = typeof parsed.deliveryEnabled === 'boolean'
  const feeExplicit = typeof parsed.deliveryFee === 'number' && !Number.isNaN(parsed.deliveryFee)
  const feeEnabledExplicit = typeof parsed.deliveryFeeEnabled === 'boolean'

  const pickupEnabled = pickupExplicit
    ? (parsed.pickupEnabled as boolean)
    : inferLegacyPickupEnabled(legacyD)
  const deliveryEnabled = deliveryExplicit
    ? (parsed.deliveryEnabled as boolean)
    : inferLegacyDeliveryEnabled(legacyD)
  const deliveryFee = feeExplicit ? Math.max(0, parsed.deliveryFee as number) : parseLegacyDeliveryFee(legacyD)
  const deliveryFeeEnabled = feeEnabledExplicit
    ? (parsed.deliveryFeeEnabled as boolean)
    : deliveryFee > 0

  const cashEx = typeof parsed.paymentCashEnabled === 'boolean'
  const cardEx = typeof parsed.paymentCardEnabled === 'boolean'
  const pixEx = typeof parsed.paymentPixEnabled === 'boolean'
  const pixKeyRaw = typeof parsed.pixKey === 'string' ? parsed.pixKey.trim() : inferLegacyPixKey(legacyP)

  let paymentCashEnabled = cashEx ? (parsed.paymentCashEnabled as boolean) : inferLegacyPaymentCash(legacyP)
  let paymentCardEnabled = cardEx ? (parsed.paymentCardEnabled as boolean) : inferLegacyPaymentCard(legacyP)
  let paymentPixEnabled = pixEx ? (parsed.paymentPixEnabled as boolean) : inferLegacyPaymentPix(legacyP)
  if (legacyP.length > 0 && !paymentCashEnabled && !paymentCardEnabled && !paymentPixEnabled) {
    paymentCashEnabled = true
    paymentCardEnabled = true
    paymentPixEnabled = true
  }

  const waStored = typeof parsed.pedidoWhatsapp === 'string' ? parsed.pedidoWhatsapp : ''
  const waNorm = normalizePedidoWhatsappToWaMe(waStored)
  let pedidoWhatsapp = waNorm.ok ? waNorm.digits : ''
  /** Remove número de teste legado que era fallback antes do cadastro no admin. */
  if (pedidoWhatsapp === '5583999159349') pedidoWhatsapp = ''

  const base: CheckoutOptions = {
    pickupEnabled,
    deliveryEnabled,
    deliveryFeeEnabled,
    deliveryFee,
    paymentCashEnabled,
    paymentCardEnabled,
    paymentPixEnabled,
    pixKey: pixKeyRaw,
    pedidoWhatsapp,
    deliveryOptions: [],
    paymentOptions: []
  }
  return applyPaymentFlagsToOptions(applyDeliveryFlagsToOptions(base))
}

const DEFAULT_CHECKOUT_OPTIONS: CheckoutOptions = applyPaymentFlagsToOptions(
  applyDeliveryFlagsToOptions({
    pickupEnabled: true,
    deliveryEnabled: true,
    deliveryFeeEnabled: false,
    deliveryFee: 0,
    paymentCashEnabled: true,
    paymentCardEnabled: true,
    paymentPixEnabled: true,
    pixKey: '',
    pedidoWhatsapp: '',
    deliveryOptions: [],
    paymentOptions: []
  })
)

function normalizeDeliveryOption(raw: Partial<DeliveryOptionConfig>): DeliveryOptionConfig {
  return {
    id: String(raw.id ?? `del-${Date.now()}`),
    title: String(raw.title ?? 'Modalidade').trim() || 'Modalidade',
    description: typeof raw.description === 'string' ? raw.description : '',
    showCustomerAddress: raw.showCustomerAddress === true
  }
}

function normalizePaymentOption(raw: Partial<PaymentOptionConfig>): PaymentOptionConfig {
  return {
    id: String(raw.id ?? `pay-${Date.now()}`),
    title: String(raw.title ?? 'Pagamento').trim() || 'Pagamento',
    detail: typeof raw.detail === 'string' ? raw.detail : '',
    asksCashChange: raw.asksCashChange === true
  }
}

function loadCheckoutOptions(): CheckoutOptions {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.checkoutOptions)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CheckoutOptions>
      const hadLegacyPedidoWa =
        String(parsed.pedidoWhatsapp ?? '').replace(/\D/g, '') === '5583999159349'
      const opts = normalizeLoadedCheckoutOptions(parsed)
      if (hadLegacyPedidoWa) {
        const synced = applyPaymentFlagsToOptions(applyDeliveryFlagsToOptions({ ...opts }))
        try {
          localStorage.setItem(STORAGE_KEYS.checkoutOptions, JSON.stringify(synced))
        } catch (_) {
          /* ignora quota / modo privado */
        }
        return synced
      }
      return opts
    }
  } catch (_) {
    /* ignora */
  }
  return JSON.parse(JSON.stringify(DEFAULT_CHECKOUT_OPTIONS)) as CheckoutOptions
}

function saveCheckoutOptions(opts: CheckoutOptions) {
  const synced = applyPaymentFlagsToOptions(applyDeliveryFlagsToOptions({ ...opts }))
  checkoutOptions = synced
  localStorage.setItem(STORAGE_KEYS.checkoutOptions, JSON.stringify(synced))
}

let checkoutOptions = loadCheckoutOptions()

function getDeliveryOption(id: string): DeliveryOptionConfig | undefined {
  return checkoutOptions.deliveryOptions.find((o) => o.id === id)
}

function getPaymentOption(id: string): PaymentOptionConfig | undefined {
  return checkoutOptions.paymentOptions.find((o) => o.id === id)
}

function clampDeliveryModeId(id: string | undefined): string {
  const opts = checkoutOptions.deliveryOptions
  if (id && opts.some((o) => o.id === id)) return id
  return opts[0]?.id ?? ''
}

function clampPaymentMethodId(id: string | undefined): string {
  const opts = checkoutOptions.paymentOptions
  if (id && opts.some((o) => o.id === id)) return id
  return opts[0]?.id ?? ''
}

type StoreBranding = {
  /** Nome exibido ao lado da logo e no título da página */
  nomeEmpresa: string
  /** Linha menor abaixo do nome (ex.: segmento ou slogan) */
  tagline: string
  /** Se vazio, usa a logo embutida do projeto; senão URL https… ou caminho em /public */
  logoUrl: string
  /** Opcional: texto institucional sobre a empresa */
  descricaoEmpresa: string
  /** Opcional: ramo de atividade (ex.: venda de roupas) */
  ramoEmpresa: string
  /** Opcional: endereço da loja */
  enderecoEmpresa: string
  /** Opcional: telefone de contato */
  telefoneEmpresa: string
}

const DEFAULT_BRANDING: StoreBranding = {
  nomeEmpresa: 'Castro Multimarcas',
  tagline: 'CASTRO MULTIMARCAS',
  logoUrl: '',
  descricaoEmpresa: '',
  ramoEmpresa: '',
  enderecoEmpresa: '',
  telefoneEmpresa: ''
}

const LEGACY_DEFAULT_BRANDING: Pick<StoreBranding, 'nomeEmpresa' | 'tagline'> = {
  nomeEmpresa: 'Lugar das Tintas',
  tagline: 'LUGAR DAS TINTAS AUTOMOTIVAS'
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function loadBranding(): StoreBranding {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.branding)
    if (!raw) return { ...DEFAULT_BRANDING }
    const parsed = JSON.parse(raw) as Partial<StoreBranding>
    const normalized: StoreBranding = {
      nomeEmpresa: typeof parsed.nomeEmpresa === 'string' && parsed.nomeEmpresa.trim()
        ? parsed.nomeEmpresa.trim()
        : DEFAULT_BRANDING.nomeEmpresa,
      tagline:
        typeof parsed.tagline === 'string' ? parsed.tagline.trim() : DEFAULT_BRANDING.tagline,
      logoUrl: typeof parsed.logoUrl === 'string' ? parsed.logoUrl.trim() : '',
      descricaoEmpresa:
        typeof parsed.descricaoEmpresa === 'string' ? parsed.descricaoEmpresa.trim() : '',
      ramoEmpresa: typeof parsed.ramoEmpresa === 'string' ? parsed.ramoEmpresa.trim() : '',
      enderecoEmpresa:
        typeof parsed.enderecoEmpresa === 'string' ? parsed.enderecoEmpresa.trim() : '',
      telefoneEmpresa:
        typeof parsed.telefoneEmpresa === 'string' ? parsed.telefoneEmpresa.trim() : ''
    }
    const isLegacyDefault =
      normalized.nomeEmpresa === LEGACY_DEFAULT_BRANDING.nomeEmpresa &&
      normalized.tagline === LEGACY_DEFAULT_BRANDING.tagline &&
      !normalized.logoUrl &&
      !normalized.descricaoEmpresa &&
      !normalized.ramoEmpresa &&
      !normalized.enderecoEmpresa &&
      !normalized.telefoneEmpresa
    if (isLegacyDefault) return { ...DEFAULT_BRANDING }
    return normalized
  } catch (_) {
    /* ignora parse error */
  }
  return { ...DEFAULT_BRANDING }
}

function saveBranding(b: StoreBranding) {
  localStorage.setItem(STORAGE_KEYS.branding, JSON.stringify(b))
}

let storeBranding = loadBranding()

function getLogoSrc(): string {
  return storeBranding.logoUrl || logoLugarDasTintas
}

function applyDocumentBranding() {
  const name = storeBranding.nomeEmpresa || DEFAULT_BRANDING.nomeEmpresa
  document.title = `${name} – Pedidos online`
  const meta = document.querySelector('meta[name="description"]')
  if (meta) {
    const desc = storeBranding.descricaoEmpresa.trim()
    meta.setAttribute(
      'content',
      desc
        ? desc.slice(0, 160)
        : `Pedidos online – ${name}. Catálogo, carrinho e finalização do pedido.`
    )
  }
}

function hasStoreExtraInfo(): boolean {
  const s = storeBranding
  return Boolean(
    s.descricaoEmpresa.trim() ||
      s.ramoEmpresa.trim() ||
      s.enderecoEmpresa.trim() ||
      s.telefoneEmpresa.trim()
  )
}

/** Bloco opcional “Sobre a loja” para o cliente (cadastro / catálogo). */
function storeAboutCardHtml(): string {
  if (!hasStoreExtraInfo()) return ''
  const s = storeBranding
  const d = s.descricaoEmpresa.trim()
  const r = s.ramoEmpresa.trim()
  const e = s.enderecoEmpresa.trim()
  const t = s.telefoneEmpresa.trim()
  const telDigits = t.replace(/\D/g, '')
  const telLink = telDigits ? `tel:${telDigits}` : ''
  return `
    <div class="card store-about-card fade-in">
      <p class="eyebrow">Sobre a loja</p>
      ${
        d
          ? `<div class="store-about-desc muted">${escapeHtml(d)}</div>`
          : ''
      }
      ${r ? `<p class="store-about-line"><strong>Ramo:</strong> ${escapeHtml(r)}</p>` : ''}
      ${e ? `<p class="store-about-line"><strong>Endereço:</strong> ${escapeHtml(e)}</p>` : ''}
      ${
        t
          ? `<p class="store-about-line"><strong>Telefone:</strong> ${
              telLink
                ? `<a href="${escapeAttr(telLink)}">${escapeHtml(t)}</a>`
                : escapeHtml(t)
            }</p>`
          : ''
      }
    </div>
  `
}

const CATEGORY_VALUES: Category[] = [
  'Camisetas e blusas',
  'Calças e jeans',
  'Vestidos e saias',
  'Shorts e bermudas',
  'Calçados',
  'Acessórios',
  'Casacos e jaquetas',
  'Outros'
]

const CATEGORY_SET = new Set<string>(CATEGORY_VALUES)

const STEP_VALUES: Step[] = ['cadastro', 'catalogo', 'carrinho', 'checkout', 'concluido', 'admin']

function normalizePersistedStep(raw: unknown): Step | undefined {
  if (typeof raw !== 'string') return undefined
  return STEP_VALUES.includes(raw as Step) ? (raw as Step) : undefined
}

function normalizeFiltroCatPersist(raw: unknown): 'todas' | Category {
  if (raw === 'todas') return 'todas'
  if (typeof raw === 'string' && CATEGORY_SET.has(raw)) return raw as Category
  return 'todas'
}

function cartRecordIsEmpty(c: Record<string, number>): boolean {
  return !Object.values(c).some((q) => (q ?? 0) > 0)
}

/** Evita estados impossíveis após F5 (ex.: checkout sem itens). */
function reconcilePersistedStep(p: {
  step: Step
  prevStep: Step
  hasName: boolean
  cartEmpty: boolean
  pedidoNumero: string
  isAdminAuthenticated: boolean
}): { step: Step; prevStep: Step } {
  const { step, prevStep, hasName, cartEmpty, pedidoNumero, isAdminAuthenticated } = p
  if (step === 'admin' && !isAdminAuthenticated) {
    return { step: hasName ? 'catalogo' : 'cadastro', prevStep: hasName ? 'catalogo' : 'cadastro' }
  }
  if (!hasName && step !== 'cadastro') {
    return { step: 'cadastro', prevStep: 'catalogo' }
  }
  if (step === 'checkout' && cartEmpty) {
    return { step: hasName ? 'catalogo' : 'cadastro', prevStep: 'catalogo' }
  }
  if (step === 'concluido' && !pedidoNumero.trim()) {
    return { step: hasName ? 'catalogo' : 'cadastro', prevStep: hasName ? 'carrinho' : 'catalogo' }
  }
  return { step, prevStep }
}

function normalizeCategory(raw: unknown): Category {
  if (typeof raw === 'string' && CATEGORY_SET.has(raw)) return raw as Category
  return 'Outros'
}

function normalizeProduct(raw: unknown): Product {
  const p = raw as Partial<Product> & { imagem?: unknown }
  let imagens: string[] = []
  if (Array.isArray(p.imagens)) {
    imagens = p.imagens
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, MAX_PRODUCT_IMAGES)
  }
  const legacyImg = typeof p.imagem === 'string' ? p.imagem.trim() : ''
  if (!imagens.length && legacyImg) imagens = [legacyImg]

  let estoque: number
  if (typeof p.estoque === 'number' && !Number.isNaN(p.estoque)) {
    estoque = Math.max(0, Math.floor(p.estoque))
  } else {
    estoque = LEGACY_DEFAULT_ESTOQUE
  }

  return {
    id: String(p.id ?? `item-${Date.now()}`),
    nome: String(p.nome ?? 'Produto'),
    marca: String(p.marca ?? '—'),
    categoria: normalizeCategory(p.categoria),
    subcategoria: typeof p.subcategoria === 'string' && p.subcategoria.trim() ? p.subcategoria.trim() : undefined,
    preco: typeof p.preco === 'number' && !Number.isNaN(p.preco) ? p.preco : 0,
    imagens,
    estoque,
    uso: String(p.uso ?? ''),
    custom: p.custom === true,
    modelo: (p as Partial<Product>).modelo === true
  }
}

/** Catálogo só do navegador (localStorage + peças modelo). */
function loadProductsFromStorage(): Product[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.products)
    if (raw !== null) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) return parsed.map(normalizeProduct)
    }
  } catch (_) { /* ignora parse error */ }
  if (localStorage.getItem(STORAGE_KEYS.modelosExemplosRemovidos) === '1') {
    return []
  }
  return seedModeloProducts()
}

function saveProducts(list: Product[]) {
  localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(list))
}

function normalizeLookup(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeCpfDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 11)
}

/** Máscara visual: 000.000.000-00 */
function formatCpfDisplay(digits: string): string {
  const d = normalizeCpfDigits(digits)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function isValidCpf(digits: string): boolean {
  const d = normalizeCpfDigits(digits)
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * (10 - i)
  let rest = (sum * 10) % 11
  if (rest === 10 || rest === 11) rest = 0
  if (rest !== parseInt(d[9], 10)) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * (11 - i)
  rest = (sum * 10) % 11
  if (rest === 10 || rest === 11) rest = 0
  return rest === parseInt(d[10], 10)
}

function loadCustomerProfiles(): Customer[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.customers)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((row) => {
        const c = row as Partial<Customer>
        if (!c || typeof c.nomeCompleto !== 'string' || !c.nomeCompleto.trim()) return null
        return {
          cpf: normalizeCpfDigits(String(c.cpf ?? '')),
          nomeCompleto: c.nomeCompleto.trim(),
          nomeOficina: String(c.nomeOficina ?? '').trim(),
          enderecoCompleto: String(c.enderecoCompleto ?? '').trim(),
          email: String(c.email ?? '').trim(),
          whatsapp: String(c.whatsapp ?? '').trim()
        } satisfies Customer
      })
      .filter((c): c is Customer => c !== null)
  } catch (_) { /* ignora parse error */ }
  return []
}

function saveCustomerProfiles(list: Customer[]) {
  localStorage.setItem(STORAGE_KEYS.customers, JSON.stringify(list))
}

type PersistedState = {
  customer: Customer
  cart: Record<string, number>
  deliveryMode: string
  paymentMethod: string
  cashChangeFor: string
  step?: Step
  prevStep?: Step
  filtroBusca?: string
  filtroCategoria?: string
  isAdminAuthenticated?: boolean
  pedidoNumero?: string
  fichaTecnicaId?: string | null
}

function loadState(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.state)
    if (raw) return JSON.parse(raw) as Partial<PersistedState>
  } catch (_) { /* ignora parse error */ }
  return {}
}

function persistState() {
  const toSave: PersistedState = {
    customer: appState.customer,
    cart: appState.cart,
    deliveryMode: appState.deliveryMode,
    paymentMethod: appState.paymentMethod,
    cashChangeFor: appState.cashChangeFor,
    step: appState.step,
    prevStep: appState.prevStep,
    filtroBusca: appState.filtroBusca,
    filtroCategoria: appState.filtroCategoria,
    isAdminAuthenticated: appState.isAdminAuthenticated,
    pedidoNumero: appState.pedidoNumero,
    fichaTecnicaId: appState.fichaTecnicaId
  }
  try {
    localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(toSave))
  } catch (_) {
    /* quota ou navegação privada */
  }
}

// ─── Estado da aplicação ─────────────────────────────────────────────────────

const saved = loadState()

const emptyCustomer = (): Customer => ({
  cpf: '',
  nomeCompleto: '',
  enderecoCompleto: '',
  nomeOficina: '',
  email: '',
  whatsapp: ''
})

const savedCust = saved.customer as Partial<Customer> | undefined
const customerMerged: Customer = {
  ...emptyCustomer(),
  ...(savedCust ?? {}),
  cpf: normalizeCpfDigits(String(savedCust?.cpf ?? ''))
}

const cartMerged: Record<string, number> =
  saved.cart && typeof saved.cart === 'object' && !Array.isArray(saved.cart)
    ? { ...(saved.cart as Record<string, number>) }
    : {}

const hasName = Boolean(customerMerged.nomeCompleto.trim())
const savedStep = normalizePersistedStep(saved.step)
const savedPrev = normalizePersistedStep(saved.prevStep)
let initialStep: Step =
  savedStep !== undefined ? savedStep : hasName ? 'catalogo' : 'cadastro'
let initialPrev: Step = savedPrev !== undefined ? savedPrev : 'catalogo'

const deliveryModeInit = clampDeliveryModeId(saved.deliveryMode)
const paymentMethodInit = clampPaymentMethodId(saved.paymentMethod)
const filtroBuscaInit = typeof saved.filtroBusca === 'string' ? saved.filtroBusca : ''
const filtroCategoriaInit = normalizeFiltroCatPersist(saved.filtroCategoria)
const pedidoNumeroInit = typeof saved.pedidoNumero === 'string' ? saved.pedidoNumero : ''
const fichaTecnicaIdInit =
  saved.fichaTecnicaId === null || typeof saved.fichaTecnicaId === 'string'
    ? (saved.fichaTecnicaId ?? null)
    : null
const isAdminAuthenticatedInit = saved.isAdminAuthenticated === true

const reconciled = reconcilePersistedStep({
  step: initialStep,
  prevStep: initialPrev,
  hasName,
  cartEmpty: cartRecordIsEmpty(cartMerged),
  pedidoNumero: pedidoNumeroInit,
  isAdminAuthenticated: isAdminAuthenticatedInit
})

const appState: AppState = {
  step: reconciled.step,
  prevStep: reconciled.prevStep,
  customer: customerMerged,
  filtroBusca: filtroBuscaInit,
  filtroCategoria: filtroCategoriaInit,
  cart: cartMerged,
  deliveryMode: deliveryModeInit,
  paymentMethod: paymentMethodInit,
  cashChangeFor: saved.cashChangeFor ?? '',
  isAdminAuthenticated: isAdminAuthenticatedInit,
  pedidoNumero: pedidoNumeroInit,
  fichaTecnicaId: fichaTecnicaIdInit
}

let products = loadProductsFromStorage()
if (localStorage.getItem(STORAGE_KEYS.products) === null) {
  saveProducts(products)
}
let customerProfiles = loadCustomerProfiles()

applyDocumentBranding()

/** Em `npm run dev`, tenta substituir o catálogo pelo retorno da API (servidor em paralelo). */
async function tryReplaceProductsFromApiIfDev() {
  const allow =
    import.meta.env.DEV || import.meta.env.VITE_SYNC_PRODUCTS_FROM_API === 'true'
  if (!allow) return
  const data = await storeApi.fetchProdutos(2800)
  if (data === null) return
  products = data.map(normalizeProduct)
  saveProducts(products)
  render()
}

/** Recarrega o catálogo a partir do GET /produtos (ex.: após pedido ou alteração no admin). */
async function refreshProductsFromApi(): Promise<boolean> {
  const data = await storeApi.fetchProdutos(8000)
  if (data === null) return false
  products = data.map(normalizeProduct)
  saveProducts(products)
  render()
  return true
}

function findCustomerProfileByName(name: string): Customer | null {
  const key = normalizeLookup(name)
  if (!key) return null
  return customerProfiles.find((c) => normalizeLookup(c.nomeCompleto) === key) ?? null
}

function findCustomerProfileByCpf(raw: string): Customer | null {
  const d = normalizeCpfDigits(raw)
  if (d.length !== 11) return null
  return customerProfiles.find((c) => normalizeCpfDigits(c.cpf) === d) ?? null
}

function upsertCustomerProfile(customer: Customer) {
  const cpfDigits = normalizeCpfDigits(customer.cpf)
  const nameKey = normalizeLookup(customer.nomeCompleto)
  if (!nameKey && cpfDigits.length !== 11) return

  const next: Customer = {
    cpf: cpfDigits,
    nomeCompleto: customer.nomeCompleto.trim(),
    nomeOficina: customer.nomeOficina.trim(),
    enderecoCompleto: customer.enderecoCompleto.trim(),
    email: customer.email.trim(),
    whatsapp: customer.whatsapp.trim()
  }

  let idx = -1
  if (cpfDigits.length === 11) {
    idx = customerProfiles.findIndex((c) => normalizeCpfDigits(c.cpf) === cpfDigits)
  }
  if (idx < 0 && nameKey) {
    idx = customerProfiles.findIndex((c) => normalizeLookup(c.nomeCompleto) === nameKey)
  }
  if (idx >= 0) customerProfiles[idx] = next
  else customerProfiles.push(next)
  saveCustomerProfiles(customerProfiles)
}

function customerNameOptionsHtml() {
  const uniqueByName = new Map<string, string>()
  customerProfiles.forEach((c) => {
    const key = normalizeLookup(c.nomeCompleto)
    if (key && !uniqueByName.has(key)) uniqueByName.set(key, c.nomeCompleto.trim())
  })
  return Array.from(uniqueByName.values())
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((name) => `<option value="${name}"></option>`)
    .join('')
}

const categories: Array<'todas' | Category> = ['todas', ...CATEGORY_VALUES]

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function shouldTryServerUpload(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_SYNC_PRODUCTS_FROM_API === 'true'
}

/** Tabela HTML dos pedidos retornados por GET /pedidos. */
function adminPedidosTableHtml(list: unknown[]): string {
  const rows = list
    .map((raw) => {
      const o = raw as Record<string, unknown>
      const num = escapeHtml(String(o.numero ?? '—'))
      const created = o.createdAt
        ? escapeHtml(new Date(String(o.createdAt)).toLocaleString('pt-BR'))
        : '—'
      const items = Array.isArray(o.items) ? o.items : []
      const total = typeof o.total === 'number' && !Number.isNaN(o.total) ? o.total : 0
      return `<tr>
        <td data-label="Nº">${num}</td>
        <td data-label="Data">${created}</td>
        <td data-label="Itens">${items.length}</td>
        <td data-label="Total">${currency.format(total)}</td>
      </tr>`
    })
    .join('')
  return `
    <div class="table-wrap">
      <table class="admin-table">
        <thead><tr><th>Nº pedido</th><th>Data</th><th>Itens</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

function adminJwtStored(): boolean {
  try {
    return Boolean(localStorage.getItem(storeApi.ADMIN_JWT_STORAGE_KEY)?.trim())
  } catch {
    return false
  }
}

const app = document.querySelector<HTMLDivElement>('#app')!
const ADMIN_PIN = '1323' // troque por um PIN privado

/** Fotos escolhidas antes de salvar o produto (data URLs). Limpa ao sair do admin. */
let adminPendingImageDataUrls: string[] = []

/** Logo da loja escolhida em arquivo — aplicada ao salvar identidade. Limpa ao sair do admin. */
let brandingPendingLogoDataUrl: string | null = null

let adminSecretBound = false
let adminLogoTapCount = 0
let adminLogoTapResetTimer: ReturnType<typeof setTimeout> | null = null

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFiltered(): Product[] {
  return products.filter((p) => {
    const byCategory =
      appState.filtroCategoria === 'todas' || p.categoria === appState.filtroCategoria
    const term = appState.filtroBusca.trim().toLowerCase()
    const byText =
      !term ||
      p.nome.toLowerCase().includes(term) ||
      p.marca.toLowerCase().includes(term) ||
      p.categoria.toLowerCase().includes(term)
    return byCategory && byText
  })
}

function cartItems() {
  return Object.entries(appState.cart)
    .filter(([, q]) => q > 0)
    .map(([id, qty]) => {
      const product = products.find((p) => p.id === id)
      if (!product) return null
      return { product, qty, subtotal: qty * product.preco }
    })
    .filter((x): x is { product: Product; qty: number; subtotal: number } => x !== null)
}

function cartTotal() {
  return cartItems().reduce((s, i) => s + i.subtotal, 0)
}

/** Taxa de entrega aplicada com modalidade “entrega” + opção de taxa ativas no admin. */
function checkoutDeliveryFeeTotal(): number {
  if (appState.deliveryMode !== 'entrega') return 0
  if (!checkoutOptions.deliveryFeeEnabled) return 0
  const fee = checkoutOptions.deliveryFee
  return typeof fee === 'number' && !Number.isNaN(fee) ? Math.max(0, fee) : 0
}

function checkoutOrderTotal(): number {
  return cartTotal() + checkoutDeliveryFeeTotal()
}

function cartCount() {
  return cartItems().reduce((s, i) => s + i.qty, 0)
}

/** Ajusta quantidades do carrinho se o estoque do produto cair (ex.: painel admin). */
function syncCartWithStock() {
  let changed = false
  for (const id of Object.keys(appState.cart)) {
    const qty = appState.cart[id] ?? 0
    if (qty <= 0) continue
    const p = products.find((pr) => pr.id === id)
    if (!p) continue
    const cap = p.estoque
    if (qty > cap) {
      if (cap <= 0) delete appState.cart[id]
      else appState.cart[id] = cap
      changed = true
    }
  }
  if (changed) persistState()
}

function gerarNumeroPedido() {
  return `PDO-${Date.now().toString(36).toUpperCase()}`
}

function setStep(step: Step) {
  if (step === 'admin' && !appState.isAdminAuthenticated) {
    alert('Acesso restrito ao painel administrativo.')
    return
  }
  if (step !== 'admin') {
    adminPendingImageDataUrls = []
    brandingPendingLogoDataUrl = null
  }
  appState.prevStep = appState.step
  appState.step = step
  persistState()
  render()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function requestAdminAccess() {
  const pin = prompt('Informe o PIN do administrador:')
  if (pin === null) return
  if (pin.trim() !== ADMIN_PIN) {
    alert('PIN inválido.')
    return
  }
  appState.isAdminAuthenticated = true
  setStep('admin')
}

function registerAdminLogoTap(): boolean {
  adminLogoTapCount += 1

  if (adminLogoTapResetTimer) {
    clearTimeout(adminLogoTapResetTimer)
  }

  adminLogoTapResetTimer = setTimeout(() => {
    adminLogoTapCount = 0
    adminLogoTapResetTimer = null
  }, 1200)

  if (adminLogoTapCount >= 5) {
    adminLogoTapCount = 0
    if (adminLogoTapResetTimer) {
      clearTimeout(adminLogoTapResetTimer)
      adminLogoTapResetTimer = null
    }
    requestAdminAccess()
    return true
  }

  return false
}

function getBackStep(current: Step): Step | null {
  const map: Partial<Record<Step, Step>> = {
    catalogo: 'cadastro',
    carrinho: 'catalogo',
    checkout: 'carrinho',
    concluido: 'checkout',
    admin: appState.prevStep === 'admin' ? 'catalogo' : appState.prevStep
  }
  return map[current] ?? null
}

function updateQty(id: string, qty: number) {
  const product = products.find((pr) => pr.id === id)
  if (qty <= 0) {
    delete appState.cart[id]
  } else if (product) {
    const cap = product.estoque
    if (cap <= 0) {
      alert('Item sem estoque.')
      delete appState.cart[id]
    } else if (qty > cap) {
      alert(`Só há ${cap} unidade(s) disponível(is).`)
      appState.cart[id] = cap
    } else {
      appState.cart[id] = qty
    }
  } else {
    appState.cart[id] = qty
  }
  persistState()
  render()
}

function resetToNewCustomerRegistration() {
  appState.customer = emptyCustomer()
  appState.cart = {}
  appState.filtroBusca = ''
  appState.filtroCategoria = 'todas'
  appState.deliveryMode = clampDeliveryModeId(checkoutOptions.deliveryOptions[0]?.id)
  appState.paymentMethod = clampPaymentMethodId(checkoutOptions.paymentOptions[0]?.id)
  appState.cashChangeFor = ''
  appState.pedidoNumero = ''
  appState.fichaTecnicaId = null
  appState.step = 'cadastro'
  appState.prevStep = 'catalogo'
  persistState()
  render()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

function normalizePedidoWhatsappToWaMe(
  raw: string
): { ok: true; digits: string } | { ok: false; message: string } {
  const d = raw.replace(/\D/g, '')
  if (!d) return { ok: true, digits: '' }
  if (d.length < 10) {
    return {
      ok: false,
      message:
        'O WhatsApp para envio do pedido precisa ter pelo menos 10 dígitos (DDD + número ou código do país), ou deixe o campo em branco.'
    }
  }
  if (d.startsWith('55') && d.length >= 12) return { ok: true, digits: d }
  let local = d
  if (local.length === 11 && local[0] === '0') local = local.slice(1)
  if (local.length === 10 || local.length === 11) return { ok: true, digits: `55${local}` }
  return { ok: true, digits: d }
}

/** Exibe no painel o valor salvo (formato BR quando couber). */
function formatPedidoWhatsappForAdminField(storedDigits: string): string {
  const s = String(storedDigits ?? '').replace(/\D/g, '')
  if (!s) return ''
  if (s.startsWith('55') && s.length >= 12) {
    const local = s.slice(2, 13)
    if (local.length === 10 || local.length === 11) return formatWhatsapp(local)
  }
  return s
}

function lojaWhatsAppDigitsForPedido(): string {
  const d = String(checkoutOptions.pedidoWhatsapp ?? '').replace(/\D/g, '')
  return d.length >= 10 ? d : ''
}

function pedidoWhatsappEnvioDisponivel(): boolean {
  return lojaWhatsAppDigitsForPedido().length >= 10
}

function paymentMethodLabel(methodId: string): string {
  return getPaymentOption(methodId)?.title ?? methodId ?? 'Não configurado'
}

function paymentMethodDetail(methodId: string): string {
  if (methodId === 'pix') {
    const k = checkoutOptions.pixKey?.trim()
    return k ? `Chave PIX: ${k}` : 'PIX'
  }
  const opt = getPaymentOption(methodId)
  if (!opt) return ''
  if (opt.asksCashChange && appState.cashChangeFor) {
    const changeValue = Number(appState.cashChangeFor)
    if (!Number.isNaN(changeValue) && changeValue >= checkoutOrderTotal()) {
      return `${opt.detail} Troco para: ${currency.format(changeValue)}.`
    }
  }
  return opt.detail
}

function deliveryModeSubtitle(o: DeliveryOptionConfig): string {
  if (o.showCustomerAddress) {
    const addr = appState.customer.enderecoCompleto || '—'
    if (o.id === 'entrega' && checkoutOptions.deliveryFeeEnabled) {
      const fee = Math.max(0, Number(checkoutOptions.deliveryFee) || 0)
      const taxa =
        fee > 0 ? `${currency.format(fee)} de taxa.` : 'Taxa ativa (R$ 0,00).'
      return `${taxa} ${addr}`
    }
    return addr
  }
  return o.description || '—'
}

function readCheckoutOptionsFromAdminDom(): CheckoutOptions | null {
  const pickupEl = document.getElementById('co-pickup-enabled') as HTMLInputElement | null
  const deliveryEl = document.getElementById('co-delivery-enabled') as HTMLInputElement | null
  const feeEnabledEl = document.getElementById('co-delivery-fee-enabled') as HTMLInputElement | null
  const feeEl = document.getElementById('co-delivery-fee') as HTMLInputElement | null
  const cashEl = document.getElementById('co-pay-cash') as HTMLInputElement | null
  const cardEl = document.getElementById('co-pay-card') as HTMLInputElement | null
  const pixEl = document.getElementById('co-pay-pix') as HTMLInputElement | null
  const pixKeyEl = document.getElementById('co-pix-key') as HTMLInputElement | null
  const pedidoWaEl = document.getElementById('co-pedido-whatsapp') as HTMLInputElement | null
  if (
    !pickupEl ||
    !deliveryEl ||
    !feeEnabledEl ||
    !feeEl ||
    !cashEl ||
    !cardEl ||
    !pixEl ||
    !pixKeyEl ||
    !pedidoWaEl
  ) {
    return null
  }

  const pickupEnabled = pickupEl.checked
  const deliveryEnabled = deliveryEl.checked
  const deliveryFeeEnabled = feeEnabledEl.checked
  const feeRaw = Number(String(feeEl.value).replace(',', '.'))
  const deliveryFee = Number.isFinite(feeRaw) ? Math.max(0, feeRaw) : 0

  if (!pickupEnabled && !deliveryEnabled) {
    alert('Marque ao menos uma opção: retirada na loja ou entrega.')
    return null
  }

  const paymentCashEnabled = cashEl.checked
  const paymentCardEnabled = cardEl.checked
  const paymentPixEnabled = pixEl.checked
  const pixKey = String(pixKeyEl.value ?? '').trim().slice(0, 200)

  if (!paymentCashEnabled && !paymentCardEnabled && !paymentPixEnabled) {
    alert('Marque ao menos uma forma de pagamento: dinheiro, cartão ou PIX.')
    return null
  }

  const waNorm = normalizePedidoWhatsappToWaMe(String(pedidoWaEl.value ?? ''))
  if (!waNorm.ok) {
    alert(waNorm.message)
    pedidoWaEl.focus()
    return null
  }

  const out: CheckoutOptions = {
    pickupEnabled,
    deliveryEnabled,
    deliveryFeeEnabled,
    deliveryFee,
    paymentCashEnabled,
    paymentCardEnabled,
    paymentPixEnabled,
    pixKey,
    pedidoWhatsapp: waNorm.digits,
    deliveryOptions: [],
    paymentOptions: []
  }
  return out
}

function buildWhatsAppUrl(): string {
  const phone = lojaWhatsAppDigitsForPedido()
  if (phone.length < 10) return '#'
  const loja = storeBranding.nomeEmpresa || DEFAULT_BRANDING.nomeEmpresa
  const lines: string[] = [
    `*Novo Pedido - ${loja}*`,
    `*Nº ${appState.pedidoNumero}*`,
    ``,
    `*Cliente:* ${appState.customer.nomeCompleto}`,
    ...(normalizeCpfDigits(appState.customer.cpf).length === 11
      ? [`*CPF:* ${formatCpfDisplay(appState.customer.cpf)}`]
      : []),
    `*Referência / apelido:* ${appState.customer.nomeOficina}`,
    `*E-mail:* ${appState.customer.email}`,
    `*Endereço:* ${appState.customer.enderecoCompleto}`,
    `*Modalidade:* ${getDeliveryOption(appState.deliveryMode)?.title ?? appState.deliveryMode}`,
    `*Pagamento:* ${paymentMethodLabel(appState.paymentMethod)}`,
    `*Detalhe pagamento:* ${paymentMethodDetail(appState.paymentMethod)}`,
    ``,
    `*Itens:*`
  ]

  cartItems().forEach(({ product, qty, subtotal }) => {
    lines.push(`• ${product.nome} × ${qty} = ${currency.format(subtotal)}`)
  })

  const fee = checkoutDeliveryFeeTotal()
  const sub = cartTotal()
  const total = checkoutOrderTotal()
  if (fee > 0) {
    lines.push('', `*Subtotal (itens):* ${currency.format(sub)}`, `*Taxa de entrega:* ${currency.format(fee)}`)
  }
  lines.push(``, `*Total: ${currency.format(total)}*`)

  const message = encodeURIComponent(lines.join('\n'))
  return `https://wa.me/${lojaWhatsAppDigitsForPedido()}?text=${message}`
}

function formatWhatsapp(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  const p1 = digits.slice(0, 2)
  const p2 = digits.slice(2, 7)
  const p3 = digits.slice(7, 11)
  if (!p1) return ''
  if (!p2) return `(${p1}`
  if (!p3) return `(${p1}) ${p2}`
  return `(${p1}) ${p2}-${p3}`
}

function isValidWhatsapp(value: string): boolean {
  return /^\(\d{2}\) \d{5}-\d{4}$/.test(value)
}

function productImageUrl(imagem: string): string {
  const u = imagem.trim()
  return u || 'https://placehold.co/400x220/e8f0fe/1a3a6b?text=Foto'
}

function productPrimaryImage(p: Product): string {
  const first = p.imagens.find((u) => u.trim())
  return first ? first.trim() : ''
}

function productGalleryUrls(p: Product): string[] {
  const u = p.imagens.map((x) => x.trim()).filter(Boolean).slice(0, MAX_PRODUCT_IMAGES)
  return u.length ? u.map(productImageUrl) : [productImageUrl('')]
}

/** Mensagem de estoque na vitrine (texto combinado com o pedido do cliente). */
function catalogStockLabel(p: Product, qtyInCart: number): string {
  const e = p.estoque
  if (e <= 0) return 'Item sem estoque'
  if (qtyInCart > e) return `Só há ${e} unidade(s) disponível(is)`
  return 'Item com estoque'
}

function catalogStockClass(p: Product, qtyInCart: number): string {
  const e = p.estoque
  if (e <= 0) return 'stock-out'
  if (qtyInCart > e) return 'stock-warn'
  return 'stock-ok'
}

// ─── Telas ────────────────────────────────────────────────────────────────────

function logoHtml() {
  const nome = escapeHtml(storeBranding.nomeEmpresa || DEFAULT_BRANDING.nomeEmpresa)
  const tagRaw = (storeBranding.tagline ?? '').trim()
  const taglineBlock = tagRaw
    ? `<span class="brand-tagline">${escapeHtml(tagRaw)}</span>`
    : ''
  const src = escapeAttr(getLogoSrc())
  return `
    <div class="brand-logo">
      <img
        src="${src}"
        alt="${nome}"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
      />
      <span class="brand-text" style="display:none">
        <span class="brand-accent">${nome}</span>
      </span>
      ${taglineBlock}
    </div>
  `
}

function stepIndicator(active: number) {
  const steps = ['Cadastro', 'Catálogo', 'Carrinho', 'Pagamento']
  return `
    <nav class="steps">
      ${steps
        .map(
          (label, i) => `
        <div class="step-item ${i + 1 === active ? 'active' : ''} ${i + 1 < active ? 'done' : ''}">
          <div class="step-bullet">${i + 1 < active ? '✓' : i + 1}</div>
          <span>${label}</span>
        </div>
        ${i < steps.length - 1 ? '<div class="step-line"></div>' : ''}
      `
        )
        .join('')}
    </nav>
  `
}

function cadastroClubWordmarkLines(): { line1: string; line2: string } {
  const raw = (storeBranding.nomeEmpresa || DEFAULT_BRANDING.nomeEmpresa).trim()
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return {
      line1: parts[0].toUpperCase(),
      line2: parts.slice(1).join(' ').toUpperCase()
    }
  }
  if (parts.length === 1) {
    return { line1: parts[0].toUpperCase(), line2: 'MULTIMARCAS' }
  }
  return { line1: 'CASTRO', line2: 'MULTIMARCAS' }
}

function cadastroScreen() {
  const namesOptions = customerNameOptionsHtml()
  const nomeLoja = escapeHtml(storeBranding.nomeEmpresa || DEFAULT_BRANDING.nomeEmpresa)
  const nomeParaCmp = (storeBranding.nomeEmpresa || DEFAULT_BRANDING.nomeEmpresa).replace(/\s+/g, ' ').trim().toUpperCase()
  const tagRaw = ((storeBranding.tagline ?? '').trim() || DEFAULT_BRANDING.tagline).replace(/\s+/g, ' ').trim().toUpperCase()
  const showTagline = tagRaw.length > 0 && tagRaw !== nomeParaCmp
  const tagLoja = escapeHtml((storeBranding.tagline ?? '').trim() || DEFAULT_BRANDING.tagline)
  const wm = cadastroClubWordmarkLines()
  const wm1 = escapeHtml(wm.line1)
  const wm2 = escapeHtml(wm.line2)
  const heroImg = escapeAttr(cadastroLojaBg)
  const logoSrc = escapeAttr(getLogoSrc())
  return `
    <section class="screen cadastro-entry cadastro-club fade-in">
      <div class="cadastro-club-pattern" aria-hidden="true"></div>
      <div class="cadastro-club-shell">
        <div class="cadastro-club-left">
          <img class="cadastro-club-photo" src="${heroImg}" alt="" />
          <div class="cadastro-club-left-scrim" aria-hidden="true"></div>
          <div class="cadastro-club-left-content">
            <p class="cadastro-club-pedidos">Pedidos online</p>
            <div class="cadastro-club-logo-wrap">
              <img
                class="cadastro-club-logo-img"
                src="${logoSrc}"
                alt="${nomeLoja}"
                width="200"
                height="72"
                loading="eager"
                decoding="async"
                onerror="this.style.display='none'"
              />
            </div>
            <div class="cadastro-club-brand-rail">
              <h1 class="cadastro-club-brand" id="cadastro-hero-title">
                <span class="cadastro-club-brand-line">${wm1}</span>
                <span class="cadastro-club-brand-line cadastro-club-brand-line--accent">${wm2}</span>
              </h1>
            </div>
            ${showTagline ? `<p class="cadastro-club-tagline">${tagLoja}</p>` : ''}
            <nav class="cadastro-club-nav" aria-label="Destaques da loja">
              <h2 class="cadastro-club-shop-title">Loja</h2>
              <ul class="cadastro-club-links">
                <li><span class="cadastro-club-link is-active">Novidades</span></li>
                <li><span class="cadastro-club-link">Camisetas e blusas</span></li>
                <li><span class="cadastro-club-link">Shorts e bermudas</span></li>
                <li><span class="cadastro-club-link">Moda íntima</span></li>
                <li><span class="cadastro-club-link">Acessórios</span></li>
              </ul>
            </nav>
            <p class="cadastro-club-foot">${nomeLoja} — catálogo, carrinho e checkout em um só lugar.</p>
          </div>
        </div>
        <div class="cadastro-club-glass">
          <div class="cadastro-club-glass-inner">
            <p class="cadastro-club-kicker">Passo 1 de 4</p>
            <h2 class="cadastro-club-glass-h">Iniciar pedido</h2>
            <p class="cadastro-club-glass-lead">Bem-vindo(a) de volta!</p>
            <div class="cadastro-club-stepbar">${stepIndicator(1)}</div>
            <form id="cadastro-form" class="cadastro-club-form" novalidate>
              <datalist id="customer-name-suggestions">${namesOptions}</datalist>
              <label class="cadastro-line-field">
                <span class="cadastro-line-icon" aria-hidden="true">◎</span>
                <span class="cadastro-line-body">
                  <span class="cadastro-line-label">CPF <span class="cadastro-req">*</span></span>
                  <input
                    class="cadastro-line-input"
                    required
                    id="customer-cpf"
                    name="cpf"
                    value="${escapeAttr(formatCpfDisplay(appState.customer.cpf))}"
                    placeholder="000.000.000-00"
                    autocomplete="off"
                    inputmode="numeric"
                    maxlength="14"
                  />
                </span>
              </label>
              <label class="cadastro-line-field">
                <span class="cadastro-line-icon" aria-hidden="true">◇</span>
                <span class="cadastro-line-body">
                  <span class="cadastro-line-label">Nome completo <span class="cadastro-req">*</span></span>
                  <input
                    class="cadastro-line-input"
                    required
                    id="customer-full-name"
                    name="nomeCompleto"
                    value="${escapeAttr(appState.customer.nomeCompleto)}"
                    placeholder="Seu nome"
                    autocomplete="name"
                    list="customer-name-suggestions"
                  />
                </span>
              </label>
              <label class="cadastro-line-field">
                <span class="cadastro-line-icon" aria-hidden="true">✉</span>
                <span class="cadastro-line-body">
                  <span class="cadastro-line-label">E-mail <span class="cadastro-req">*</span></span>
                  <input
                    class="cadastro-line-input"
                    required
                    id="customer-email"
                    type="email"
                    name="email"
                    value="${escapeAttr(appState.customer.email)}"
                    placeholder="nome@email.com"
                    autocomplete="email"
                  />
                </span>
              </label>
              <label class="cadastro-line-field">
                <span class="cadastro-line-icon" aria-hidden="true">☎</span>
                <span class="cadastro-line-body">
                  <span class="cadastro-line-label">WhatsApp <span class="cadastro-req">*</span></span>
                  <input
                    class="cadastro-line-input"
                    id="customer-whatsapp"
                    type="tel"
                    name="whatsapp"
                    value="${escapeAttr(appState.customer.whatsapp)}"
                    placeholder="(00) 00000-0000"
                    autocomplete="tel"
                    required
                    maxlength="15"
                    inputmode="numeric"
                    pattern="^\\(\\d{2}\\) \\d{5}-\\d{4}$"
                  />
                </span>
              </label>
              <div class="cadastro-club-actions">
                <button type="submit" class="cadastro-club-cta">
                  Continuar <span class="cadastro-club-cta-arrow" aria-hidden="true">→</span>
                </button>
              </div>
              <p class="cadastro-club-hint">
                Já comprou aqui? Informe o <strong>CPF</strong> e os dados serão preenchidos automaticamente.
              </p>
            </form>
          </div>
        </div>
      </div>
      ${storeAboutCardHtml()}
    </section>
  `
}

function catalogProductCardHtml(p: Product): string {
  const qty = appState.cart[p.id] ?? 0
  const gallery = productGalleryUrls(p)
  const slides = gallery
    .map(
      (src, i) =>
        `<img class="product-carousel-slide" src="${escapeAttr(src)}" alt="${escapeHtml(p.nome)}" loading="${i === 0 ? 'eager' : 'lazy'}"
                onerror="this.src='https://placehold.co/400x220/e8f0fe/1a3a6b?text=Foto'" />`
    )
    .join('')
  const chipLine =
    p.subcategoria != null && String(p.subcategoria).trim()
      ? `<p class="chip">${escapeHtml(String(p.subcategoria).trim())}</p>`
      : ''
  const stockCls = catalogStockClass(p, qty)
  const stockLabel = escapeHtml(catalogStockLabel(p, qty))
  const plusDisabled = p.estoque <= 0 || qty >= p.estoque
  return `
          <article class="product-card">
            <div class="product-img-wrap">
              <div class="product-img-scroll" role="group" aria-label="Fotos do produto">${slides}</div>
              ${p.custom ? '<span class="badge-custom">Personalizado</span>' : ''}
              ${p.modelo ? '<span class="badge-modelo">Exemplo</span>' : ''}
              ${
                gallery.length > 1
                  ? `<span class="product-carousel-hint muted small">Deslize para ver mais fotos</span>`
                  : ''
              }
            </div>
            <div class="product-body">
              ${chipLine}
              <h3>${escapeHtml(p.nome)}</h3>
              <p class="muted small">${escapeHtml(p.marca)}</p>
              <p class="stock-msg ${stockCls}">${stockLabel}</p>
              <p class="muted uso-text">${escapeHtml(p.uso)}</p>
              <button class="btn link-btn" data-action="open-tech" data-id="${p.id}">
                Ver descrição
              </button>
              <div class="product-footer">
                <strong class="price">${currency.format(p.preco)}</strong>
                <div class="qty-wrap">
                  <button class="qty-btn" data-action="minus" data-id="${p.id}" aria-label="Diminuir">−</button>
                  <span class="qty-value">${qty}</span>
                  <button class="qty-btn" data-action="plus" data-id="${p.id}" aria-label="Aumentar" ${plusDisabled ? 'disabled' : ''}>+</button>
                </div>
              </div>
              <button class="btn primary full-width mt4" data-action="open-cart" ${qty === 0 || p.estoque <= 0 ? 'disabled' : ''}>
                ${p.estoque <= 0 ? 'Indisponível' : qty > 0 ? `Ir para carrinho (${qty})` : 'Selecione no + / -'}
              </button>
            </div>
          </article>`
}

function orderedCategoryKeys(byCat: Map<string, Product[]>): string[] {
  const order: string[] = []
  const seen = new Set<string>()
  for (const c of CATEGORY_VALUES) {
    if (byCat.has(c)) {
      order.push(c)
      seen.add(c)
    }
  }
  for (const k of byCat.keys()) {
    if (!seen.has(k)) order.push(k)
  }
  return order
}

function catalogCardsHtml() {
  const filtered = getFiltered()
  if (!filtered.length) {
    return '<p class="empty-msg">Nenhuma peça encontrada com esse filtro — ou o catálogo ainda está vazio.</p>'
  }

  const byCat = new Map<string, Product[]>()
  for (const p of filtered) {
    const k = p.categoria
    if (!byCat.has(k)) byCat.set(k, [])
    byCat.get(k)!.push(p)
  }

  const keys = orderedCategoryKeys(byCat)
  return keys
    .map((cat, idx) => {
      const list = byCat.get(cat) ?? []
      if (!list.length) return ''
      const hid = `catalog-cat-${idx}`
      return `
      <section class="catalog-category-section" aria-labelledby="${hid}">
        <h2 class="catalog-category-heading" id="${hid}">${escapeHtml(cat)}</h2>
        <div class="products-grid">${list.map((p) => catalogProductCardHtml(p)).join('')}</div>
      </section>`
    })
    .join('')
}

function bindCatalogGridActions() {
  const wrap = document.querySelector('.catalog-products-wrap')
  if (!wrap) return

  wrap.querySelectorAll<HTMLButtonElement>('[data-action="plus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!
      updateQty(id, (appState.cart[id] ?? 0) + 1)
    })
  })

  wrap.querySelectorAll<HTMLButtonElement>('[data-action="minus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!
      updateQty(id, (appState.cart[id] ?? 0) - 1)
    })
  })

  wrap.querySelectorAll<HTMLButtonElement>('[data-action="open-cart"]').forEach((btn) => {
    btn.addEventListener('click', () => setStep('carrinho'))
  })

  wrap.querySelectorAll<HTMLButtonElement>('[data-action="open-tech"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.fichaTecnicaId = btn.dataset.id ?? null
      render()
    })
  })
}

function refreshCatalogGrid() {
  const wrap = document.querySelector('.catalog-products-wrap') as HTMLDivElement | null
  if (!wrap) return
  wrap.innerHTML = catalogCardsHtml()
  bindCatalogGridActions()
}

function catalogoScreen() {
  const optionsHtml = categories
    .map(
      (c) =>
        `<option value="${c}" ${appState.filtroCategoria === c ? 'selected' : ''}>${c}</option>`
    )
    .join('')
  const cardsHtml = catalogCardsHtml()

  return `
    <section class="screen fade-in">
      <header class="toolbar card">
        <div class="toolbar-top">
          ${stepIndicator(2)}
          <p class="eyebrow">Cliente: ${escapeHtml(appState.customer.nomeOficina || appState.customer.nomeCompleto)}</p>
          <h1>Catálogo</h1>
        </div>
        <div class="toolbar-actions">
          <button class="btn" id="back-register">← Voltar para cadastro</button>
          <input id="search" placeholder="Buscar por nome, marca ou categoria…"
            value="${appState.filtroBusca}" aria-label="Buscar produto" />
          <select id="category-filter" aria-label="Filtrar por categoria">${optionsHtml}</select>
          <button class="btn primary cart-btn" id="go-cart">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
              viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            Carrinho ${cartCount() > 0 ? `<span class="badge">${cartCount()}</span>` : ''}
          </button>
        </div>
      </header>

      ${storeAboutCardHtml()}

      <div class="catalog-products-wrap">${cardsHtml}</div>
    </section>
  `
}

function cartScreen() {
  const items = cartItems()
  const rows = items
    .map(
      (item) => `
      <tr>
        <td data-label="Produto">
          <div class="cart-item-product">
            <div class="cart-item-thumb-wrap">
              <img
                class="cart-item-thumb"
                src="${escapeAttr(productImageUrl(productPrimaryImage(item.product)))}"
                alt=""
                loading="lazy"
                onerror="this.src='https://placehold.co/96x96/e8f0fe/1a3a6b?text=Foto'"
              />
            </div>
            <div class="cart-item-text">
              <strong>${escapeHtml(item.product.nome)}</strong><br/>
              <small class="muted">${escapeHtml(item.product.marca)}</small>
            </div>
          </div>
        </td>
        <td data-label="Quantidade">
          <div class="qty-wrap inline">
            <button class="qty-btn" data-action="minus" data-id="${item.product.id}" aria-label="Diminuir">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-action="plus" data-id="${item.product.id}" aria-label="Aumentar" ${item.qty >= item.product.estoque ? 'disabled' : ''}>+</button>
          </div>
          <p class="stock-msg ${catalogStockClass(item.product, item.qty)} small" style="margin-top:6px;">${escapeHtml(catalogStockLabel(item.product, item.qty))}</p>
        </td>
        <td data-label="Unitário">${currency.format(item.product.preco)}</td>
        <td data-label="Subtotal"><strong>${currency.format(item.subtotal)}</strong></td>
        <td data-label="Ações">
          <button class="btn tiny danger" data-action="remove" data-id="${item.product.id}" aria-label="Remover item">✕</button>
        </td>
      </tr>
    `
    )
    .join('')

  return `
    <section class="screen card fade-in">
      ${stepIndicator(3)}
      <div class="screen-header">
        <p class="eyebrow">Revisão do pedido</p>
        <h1>Carrinho</h1>
      </div>
      ${
        items.length === 0
          ? `<div class="empty-cart">
               <p>Seu carrinho está vazio.</p>
               <button class="btn primary" id="back-catalog">Voltar ao catálogo</button>
             </div>`
          : `
            <div class="table-wrap cart-table-wrap">
              <table class="cart-table">
                <thead>
                  <tr>
                    <th>Produto</th><th>Qtd.</th><th>Unit.</th><th>Subtotal</th><th></th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
            <div class="cart-total">
              <span>Total do pedido:</span>
              <strong>${currency.format(cartTotal())}</strong>
            </div>
          `
      }
      <div class="actions">
        <button class="btn" id="back-catalog">← Voltar ao catálogo</button>
        <button class="btn primary" id="go-checkout" ${items.length === 0 ? 'disabled' : ''}>
          Ir para pagamento →
        </button>
      </div>
    </section>
  `
}

function checkoutScreen() {
  const hasDeliveryOptions = checkoutOptions.deliveryOptions.length > 0
  const hasPaymentOptions = checkoutOptions.paymentOptions.length > 0
  const deliveryRadios = checkoutOptions.deliveryOptions
    .map(
      (o) => `
          <label class="radio-card ${appState.deliveryMode === o.id ? 'selected' : ''}">
            <input type="radio" name="deliveryMode" value="${escapeAttr(o.id)}"
              ${appState.deliveryMode === o.id ? 'checked' : ''} />
            <div>
              <strong>${escapeHtml(o.title)}</strong>
              <p class="muted">${escapeHtml(deliveryModeSubtitle(o))}</p>
            </div>
          </label>`
    )
    .join('')

  const paymentRadios = checkoutOptions.paymentOptions
    .map(
      (o) => `
          <label class="radio-card ${appState.paymentMethod === o.id ? 'selected' : ''}">
            <input type="radio" name="paymentMethod" value="${escapeAttr(o.id)}"
              ${appState.paymentMethod === o.id ? 'checked' : ''} />
            <div>
              <strong>${escapeHtml(o.title)}</strong>
              <p class="muted">${escapeHtml(o.detail)}</p>
            </div>
          </label>`
    )
    .join('')
  const deliveryBlock = hasDeliveryOptions
    ? deliveryRadios
    : '<p class="muted">Nenhuma modalidade cadastrada ainda. O administrador pode incluir manualmente no painel.</p>'
  const paymentBlock = hasPaymentOptions
    ? paymentRadios
    : '<p class="muted">Nenhuma forma de pagamento cadastrada ainda. O administrador pode incluir manualmente no painel.</p>'

  const showCashBox = getPaymentOption(appState.paymentMethod)?.asksCashChange === true
  const feeLine = checkoutDeliveryFeeTotal()
  const orderTotal = checkoutOrderTotal()
  const pixKeyTrim = checkoutOptions.pixKey?.trim() ?? ''
  const showPixCopyBox =
    checkoutOptions.paymentPixEnabled && appState.paymentMethod === 'pix' && pixKeyTrim.length > 0
  const showPixMissingHint =
    checkoutOptions.paymentPixEnabled && appState.paymentMethod === 'pix' && pixKeyTrim.length === 0

  return `
    <section class="screen card fade-in">
      ${stepIndicator(4)}
      <div class="screen-header">
        <p class="eyebrow">Finalização</p>
        <h1>Pagamento e Entrega</h1>
        <p class="lead">Escolha a modalidade e confirme seu pedido.</p>
      </div>
      <form id="checkout-form" class="checkout-form">
        <fieldset>
          <legend>Modalidade de recebimento</legend>
          ${deliveryBlock}
        </fieldset>

        <fieldset>
          <legend>Forma de pagamento</legend>
          ${paymentBlock}
          <div class="cash-change-box ${showCashBox ? '' : 'hidden'}" id="cash-change-box">
            <label>
              Troco para quanto? (opcional)
              <input
                id="cash-change-for"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                placeholder="Ex: 200,00"
                value="${appState.cashChangeFor}"
              />
            </label>
          </div>
          ${
            showPixCopyBox
              ? `<div class="pix-copy-box" id="pix-copy-box">
            <p class="muted small" style="margin:0 0 8px;">Chave PIX da loja</p>
            <div class="pix-key-row">
              <code class="pix-key-text">${escapeHtml(pixKeyTrim)}</code>
              <button type="button" class="btn" id="copy-pix-key">Copiar chave PIX</button>
            </div>
          </div>`
              : showPixMissingHint
                ? '<p class="muted small pix-pix-missing">PIX selecionado: cadastre a chave no painel administrativo para o cliente copiar aqui.</p>'
                : ''
          }
        </fieldset>

        <div class="summary-box">
          <p><span class="muted">Cliente:</span> <strong>${appState.customer.nomeCompleto}</strong></p>
          ${
            normalizeCpfDigits(appState.customer.cpf).length === 11
              ? `<p><span class="muted">CPF:</span> <strong>${escapeHtml(formatCpfDisplay(appState.customer.cpf))}</strong></p>`
              : ''
          }
          <p><span class="muted">Referência / apelido:</span> <strong>${escapeHtml(appState.customer.nomeOficina)}</strong></p>
          <p><span class="muted">Itens:</span> <strong>${cartCount()} itens</strong></p>
          <p><span class="muted">Pagamento:</span> <strong>${paymentMethodLabel(appState.paymentMethod)}</strong></p>
          <p><span class="muted">Subtotal (itens):</span> <strong>${currency.format(cartTotal())}</strong></p>
          ${
            feeLine > 0
              ? `<p><span class="muted">Taxa de entrega:</span> <strong>${currency.format(feeLine)}</strong></p>`
              : ''
          }
          <p><span class="muted">Total:</span> <strong class="total-highlight">${currency.format(orderTotal)}</strong></p>
        </div>

        <div class="actions">
          <button type="button" class="btn" id="back-cart">← Voltar ao carrinho</button>
          <button type="submit" class="btn primary" ${hasDeliveryOptions && hasPaymentOptions ? '' : 'disabled'}>Confirmar pedido ✓</button>
        </div>
      </form>
    </section>
  `
}

function successScreen() {
  const mode = getDeliveryOption(appState.deliveryMode)?.title ?? '—'
  const payment = paymentMethodLabel(appState.paymentMethod)
  const paymentDetail = paymentMethodDetail(appState.paymentMethod)
  const waOk = pedidoWhatsappEnvioDisponivel()
  const waUrl = waOk ? buildWhatsAppUrl() : ''

  const waBlock = waOk
    ? `
      <div class="wa-banner">
        <p>Envie os detalhes do pedido diretamente via WhatsApp para a loja:</p>
        <a href="${waUrl}" target="_blank" rel="noreferrer noopener" class="btn wa-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.47 14.38c-.25-.13-1.47-.73-1.7-.81-.23-.08-.4-.12-.57.13s-.65.81-.8.97-.3.19-.54.06c-1.57-.78-2.6-1.4-3.64-3.17-.28-.48.28-.44.8-1.47.09-.19.05-.35-.02-.49s-.57-1.37-.78-1.87c-.2-.49-.41-.42-.57-.43h-.48c-.17 0-.44.06-.67.31s-.88.86-.88 2.09.9 2.43 1.03 2.6c.13.17 1.77 2.71 4.3 3.8.6.26 1.07.41 1.43.52.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.47-.28zM12.05 21.78a9.73 9.73 0 0 1-4.97-1.36L4 21.5l1.1-4c-.87-1.52-1.33-3.24-1.33-5.02C3.77 7.06 7.51 3.32 12.05 3.32c2.22 0 4.3.87 5.87 2.44a8.24 8.24 0 0 1 2.43 5.87c0 4.54-3.74 8.15-8.3 8.15zm0-17.38C6.7 4.4 2.35 8.74 2.35 14c0 1.97.57 3.9 1.66 5.57L2 22l2.54-1.97C6.17 21.32 8.07 22 10 22c5.28 0 9.6-4.32 9.6-9.6 0-2.56-1-4.97-2.8-6.77A9.54 9.54 0 0 0 12.05 4.4z"/>
          </svg>
          Enviar pedido pelo WhatsApp
        </a>
      </div>
    `
    : `
      <div class="wa-banner wa-banner-muted">
        <p class="muted small">O WhatsApp da loja para envio do pedido ainda não foi cadastrado no painel administrativo. Guarde o número do pedido acima e entre em contato com a loja pelo canal habitual.</p>
      </div>
    `

  return `
    <section class="screen card success fade-in">
      <div class="success-icon">✓</div>
      <p class="eyebrow success-label">Pedido enviado</p>
      <h1>Pedido confirmado!</h1>
      <p>Obrigado, <strong>${appState.customer.nomeCompleto}</strong>.</p>
      <p class="muted">Nº do pedido: <strong>${appState.pedidoNumero}</strong></p>
      <p class="muted">Modalidade: <strong>${mode}</strong></p>
      <p class="muted">Pagamento: <strong>${payment}</strong></p>
      <p class="muted">${paymentDetail}</p>
      <p class="muted">Total: <strong>${currency.format(checkoutOrderTotal())}</strong></p>

      ${waBlock}

      <button class="btn" id="new-order">Fazer novo pedido</button>
    </section>
  `
}

// ─── Painel Admin ─────────────────────────────────────────────────────────────

function adminScreen() {
  const rows = products
    .map(
      (p, i) => `
      <tr>
        <td data-label="Foto" class="admin-product-thumb-cell">
          <div class="admin-product-thumb-wrap">
            <img
              class="admin-product-thumb"
              src="${escapeAttr(productImageUrl(productPrimaryImage(p)))}"
              alt=""
              loading="lazy"
              onerror="this.src='https://placehold.co/96x96/e8f0fe/1a3a6b?text=Foto'"
            />
          </div>
          <p class="muted small" style="margin:6px 0 0;">${p.imagens.length} foto(s)</p>
        </td>
        <td data-label="Nome">${escapeHtml(p.nome)}${p.modelo ? ' <span class="produto-modelo-tag" title="Peça de exemplo">Modelo</span>' : ''}</td>
        <td data-label="Marca">${escapeHtml(p.marca)}</td>
        <td data-label="Categoria">${escapeHtml(p.categoria)}</td>
        <td data-label="Preço">
          <input
            class="price-edit-input"
            type="number"
            min="0"
            step="0.01"
            value="${p.preco.toFixed(2)}"
            data-action="admin-price"
            data-index="${i}"
            aria-label="Preço de ${escapeAttr(p.nome)}"
          />
        </td>
        <td data-label="Estoque">
          <div class="admin-stock-row">
            <button type="button" class="qty-btn" data-action="admin-stock-minus" data-index="${i}" aria-label="Diminuir estoque">−</button>
            <span class="admin-stock-value">${p.estoque}</span>
            <button type="button" class="qty-btn" data-action="admin-stock-plus" data-index="${i}" aria-label="Aumentar estoque">+</button>
          </div>
        </td>
        <td data-label="Ações">
          <button class="btn tiny" data-action="admin-save-price" data-index="${i}" aria-label="Salvar novo preço de ${escapeAttr(p.nome)}">Salvar</button>
          <button class="btn tiny danger" data-action="admin-delete" data-index="${i}" aria-label="Excluir ${escapeAttr(p.nome)}">✕</button>
        </td>
      </tr>
    `
    )
    .join('')

  const optionsHtml = (categories.filter((c) => c !== 'todas') as Category[])
    .map((c) => `<option value="${c}">${c}</option>`)
    .join('')

  const b = storeBranding
  const logoPreviewSrc = escapeAttr(
    brandingPendingLogoDataUrl || b.logoUrl || logoLugarDasTintas
  )

  const adminDeliveryFeeValue = Number(checkoutOptions.deliveryFee) || 0
  const adminPixKeyValue = escapeAttr(checkoutOptions.pixKey ?? '')
  const adminPedidoWhatsappValue = escapeAttr(formatPedidoWhatsappForAdminField(checkoutOptions.pedidoWhatsapp ?? ''))

  const showServerOrdersDevPanel = import.meta.env.VITE_SHOW_SERVER_ORDERS_DEV === 'true'
  const adminPedidosServidorHtml = showServerOrdersDevPanel
    ? `
      <div class="card" id="admin-pedidos-panel">
        <h2>Pedidos no servidor</h2>
        <p class="muted small" style="margin-bottom:10px;">
          Últimos pedidos gravados no MongoDB. Se a API exigir credencial, prefira <strong>Entrar na API</strong> (JWT com
          <code>JWT_SECRET</code> no servidor) em vez de colocar a chave no bundle. Alternativa: mesma chave em
          <strong>ADMIN_API_KEY</strong> (servidor) e <strong>VITE_ADMIN_API_KEY</strong> (<code>.env</code> do front).
        </p>
        <p class="muted small" style="margin-bottom:8px;">
          ${
            adminJwtStored()
              ? '<strong>Sessão API:</strong> token JWT guardado neste navegador.'
              : import.meta.env?.VITE_ADMIN_API_KEY
                ? '<strong>Sessão API:</strong> usando chave do <code>.env</code> (VITE_ADMIN_API_KEY).'
                : '<strong>Sessão API:</strong> não configurada — use “Entrar na API” ou defina VITE_ADMIN_API_KEY.'
          }
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;align-items:center;">
          <button type="button" class="btn" id="admin-api-jwt-login">Entrar na API (JWT)</button>
          <button type="button" class="btn tiny danger" id="admin-api-jwt-logout">Sair da API</button>
        </div>
        <button type="button" class="btn primary" id="admin-load-pedidos">Carregar pedidos</button>
        <div id="admin-pedidos-out" class="admin-pedidos-out" style="margin-top:14px;"></div>
      </div>
    `
    : ''

  return `
    <section class="screen fade-in">
      <div class="card">
        <p class="eyebrow">Painel administrativo</p>
        <h1>Gerenciar Produtos</h1>
        <p class="lead">Cadastre peças da sua loja de roupas. Com API + MongoDB, fotos podem ir para o servidor e o catálogo sincroniza automaticamente em desenvolvimento.</p>
      </div>

      ${adminPedidosServidorHtml}

      <div class="card">
        <h2>Identidade da loja</h2>
        <p class="muted small" style="margin-bottom: 10px;">
          Defina o nome da empresa, o slogan e a logo. Envie uma imagem pela <strong>galeria do celular</strong> ou por <strong>arquivo no computador</strong>.
        </p>
        <form id="branding-form" class="form-grid" novalidate>
          <label>
            Nome da empresa *
            <input required name="nomeEmpresa" value="${escapeAttr(b.nomeEmpresa)}" placeholder="Ex.: Moda Silva" maxlength="120" />
          </label>
          <label>
            Slogan / linha auxiliar
            <input name="tagline" value="${escapeAttr(b.tagline)}" placeholder="Ex.: MODA FEMININA" maxlength="120" />
          </label>
          <div class="full branding-logo-block">
            <span class="branding-logo-label">Logo da loja</span>
            <div class="admin-photo-actions" style="margin-top: 8px;">
              <button type="button" class="btn" id="branding-pick-logo">📁 Escolher imagem (galeria ou computador)</button>
              <button type="button" class="btn tiny" id="branding-clear-logo">Usar logo padrão do sistema</button>
            </div>
            <input type="file" id="branding-logo-file" accept="image/*" class="visually-hidden" tabindex="-1" aria-hidden="true" />
            <div class="branding-logo-preview-wrap">
              <img id="branding-logo-preview" class="branding-logo-preview" alt="Pré-visualização da logo" src="${logoPreviewSrc}" />
            </div>
            ${
              brandingPendingLogoDataUrl
                ? '<p class="muted small" id="branding-logo-hint">Clique em <strong>Salvar identidade</strong> para aplicar a nova imagem.</p>'
                : ''
            }
          </div>
          <p class="muted small full" style="grid-column: 1 / -1; margin: 4px 0 0;">
            Campos abaixo são <strong>opcionais</strong> e aparecem para o cliente em “Sobre a loja” (cadastro e catálogo).
          </p>
          <label class="full">
            Descrição da empresa (opcional)
            <textarea
              class="admin-descricao-empresa"
              name="descricaoEmpresa"
              rows="8"
              maxlength="2000"
              spellcheck="true"
              placeholder="Conte um pouco da história ou do estilo da loja…"
            >${escapeHtml(b.descricaoEmpresa)}</textarea>
            <span class="admin-descricao-counter muted small" id="admin-descricao-counter" aria-live="polite">${b.descricaoEmpresa.length} / 2000</span>
          </label>
          <label>
            Ramo da empresa (opcional)
            <input type="text" name="ramoEmpresa" value="${escapeAttr(b.ramoEmpresa)}" placeholder="Ex.: venda de roupas femininas" maxlength="200" />
          </label>
          <label>
            Telefone da empresa (opcional)
            <input type="tel" name="telefoneEmpresa" value="${escapeAttr(b.telefoneEmpresa)}" placeholder="Ex.: (00) 00000-0000" maxlength="30" autocomplete="tel" />
          </label>
          <label class="full">
            Endereço da empresa (opcional)
            <input type="text" name="enderecoEmpresa" value="${escapeAttr(b.enderecoEmpresa)}" placeholder="Rua, número, bairro, cidade – CEP" maxlength="300" autocomplete="street-address" />
          </label>
          <div class="full form-actions" style="flex-wrap: wrap; gap: 10px;">
            <button type="submit" class="btn primary">Salvar identidade</button>
            <button type="button" class="btn" id="branding-reset">Restaurar padrão (Castro Multimarcas)</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>Modalidades de entrega / retirada</h2>
        <p class="muted small" style="margin-bottom: 14px;">
          Defina o que o cliente pode escolher na finalização. Use <strong>Salvar entrega e pagamento</strong> no bloco seguinte para aplicar.
          Com <strong>Entrega</strong>, o cliente informa o endereço. Marque <strong>Taxa de entrega</strong> para somar o valor ao total quando a entrega for escolhida; o campo de valor permanece editável.
        </p>
        <div class="admin-delivery-flags" role="group" aria-label="Modalidades de entrega">
          <label class="admin-delivery-flag">
            <input type="checkbox" id="co-pickup-enabled" ${checkoutOptions.pickupEnabled ? 'checked' : ''} />
            <span>Retirada na loja</span>
          </label>
          <label class="admin-delivery-flag">
            <input type="checkbox" id="co-delivery-enabled" ${checkoutOptions.deliveryEnabled ? 'checked' : ''} />
            <span>Entrega</span>
          </label>
          <label class="admin-delivery-flag">
            <input type="checkbox" id="co-delivery-fee-enabled" ${checkoutOptions.deliveryFeeEnabled ? 'checked' : ''} />
            <span>Taxa de entrega</span>
          </label>
          <label class="admin-delivery-fee">
            <span>Valor da taxa (R$)</span>
            <input
              type="number"
              id="co-delivery-fee"
              min="0"
              step="0.01"
              inputmode="decimal"
              placeholder="0,00"
              value="${adminDeliveryFeeValue}"
            />
          </label>
        </div>
      </div>

      <div class="card">
        <h2>Formas de pagamento</h2>
        <p class="muted small" style="margin-bottom: 14px;">
          Marque o que o cliente pode escolher na finalização. Com <strong>Dinheiro</strong>, aparece o campo opcional de troco. Em <strong>PIX</strong>, informe a chave (editável a qualquer momento).
        </p>
        <div class="admin-payment-flags" role="group" aria-label="Formas de pagamento">
          <label class="admin-delivery-flag">
            <input type="checkbox" id="co-pay-cash" ${checkoutOptions.paymentCashEnabled ? 'checked' : ''} />
            <span>Dinheiro</span>
          </label>
          <label class="admin-delivery-flag">
            <input type="checkbox" id="co-pay-card" ${checkoutOptions.paymentCardEnabled ? 'checked' : ''} />
            <span>Cartão</span>
          </label>
          <label class="admin-delivery-flag">
            <input type="checkbox" id="co-pay-pix" ${checkoutOptions.paymentPixEnabled ? 'checked' : ''} />
            <span>PIX</span>
          </label>
          <label class="admin-pix-key-label">
            <span>Chave PIX (copiada pelo cliente)</span>
            <input
              type="text"
              id="co-pix-key"
              maxlength="200"
              autocomplete="off"
              placeholder="E-mail, CPF, telefone, chave aleatória…"
              value="${adminPixKeyValue}"
            />
          </label>
          <div class="admin-pedido-wa-block">
            <label class="admin-pix-key-label admin-pedido-wa-label">
              <span>Número de WhatsApp para envio do pedido</span>
              <input
                type="tel"
                id="co-pedido-whatsapp"
                maxlength="24"
                autocomplete="tel"
                placeholder="(00) 00000-0000"
                value="${adminPedidoWhatsappValue}"
              />
            </label>
            <p class="muted small admin-pedido-wa-hint">
              Texto de ajuda: em branco, o botão “Enviar pedido pelo WhatsApp” não aparece na confirmação. Preencha no formato <strong>(00) 00000-0000</strong> ou com código do país + DDD + número; quem finaliza o pedido envia a mensagem para esse WhatsApp.
            </p>
            <button type="button" class="btn tiny danger" id="co-pedido-whatsapp-clear">Limpar número cadastrado</button>
          </div>
        </div>

        <div class="actions" style="flex-wrap: wrap; gap: 10px;">
          <button type="button" class="btn primary" id="co-save">Salvar entrega e pagamento</button>
          <button type="button" class="btn" id="co-reset-default">Limpar todas as opções</button>
        </div>
      </div>

      <div class="card">
        <h2>Adicionar produto</h2>
        <form id="admin-form" class="form-grid" novalidate>
          <label>
            Nome da peça *
            <input required name="nome" placeholder="Ex.: Camiseta básica algodão" />
          </label>
          <label>
            Marca ou coleção *
            <input required name="marca" placeholder="Ex.: própria, marca parceira" />
          </label>
          <label>
            Categoria *
            <select required name="categoria">${optionsHtml}</select>
          </label>
          <label>
            Detalhe (tamanho, cor…)
            <input name="subcategoria" placeholder="Ex.: M · Branco" />
          </label>
          <label>
            Preço (R$) *
            <input required type="number" min="0" step="0.01" name="preco" placeholder="0,00" />
          </label>
          <label>
            Estoque inicial *
            <input required type="number" min="0" step="1" name="estoque" value="0" placeholder="0" />
          </label>
          <div class="full admin-photo-block">
            <p class="muted small" style="margin-bottom: 8px;">Fotos da peça (até ${MAX_PRODUCT_IMAGES}) — frente, costas, lateral… Com API no ar, as imagens podem ir para o servidor ou para o <strong>Cloudinary</strong> (se <code>CLOUDINARY_URL</code> estiver no .env da API); senão, ficam em base64 no navegador.</p>
            <div class="admin-photo-actions">
              <button type="button" class="btn" id="admin-pick-gallery">📁 Galeria ou arquivo</button>
              <button type="button" class="btn" id="admin-pick-camera">📷 Tirar foto</button>
              <button type="button" class="btn tiny danger" id="admin-clear-photo">Remover todas</button>
            </div>
            <input type="file" id="admin-product-file-gallery" accept="image/*" multiple class="visually-hidden" tabindex="-1" aria-hidden="true" />
            <input type="file" id="admin-product-file-camera" accept="image/*" capture="environment" class="visually-hidden" tabindex="-1" aria-hidden="true" />
            <p class="muted small" id="admin-photo-count">${adminPendingImageDataUrls.length}/${MAX_PRODUCT_IMAGES} fotos</p>
            <div id="admin-photo-thumbs" class="admin-photo-thumbs">
              ${adminPendingImageDataUrls
                .map(
                  (url, idx) => `
                <div class="admin-thumb-cell">
                  <img src="${escapeAttr(url)}" alt="" />
                  <button type="button" class="btn tiny danger admin-thumb-remove" data-action="admin-remove-thumb" data-thumb-index="${idx}" aria-label="Remover foto">×</button>
                </div>`
                )
                .join('')}
            </div>
          </div>
          <label class="full">
            Descrição *
            <input required name="uso" placeholder="Tecido, modelagem, cuidados na lavagem…" />
          </label>
          <div class="full form-actions">
            <button type="submit" class="btn primary">Adicionar ao catálogo</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>Produtos cadastrados (${products.length})</h2>
        ${
          products.some((p) => p.modelo)
            ? `<div class="modelo-exemplos-box">
                 <p class="muted small" style="margin: 0 0 10px;">
                   As peças marcadas como <strong>Modelo</strong> usam imagens de exemplo salvas no site (pasta <code>modelos</code>). Você pode editar preços, excluir uma a uma ou remover todas de uma vez.
                 </p>
                 <button type="button" class="btn danger" id="remove-modelo-products">Remover todas as peças de exemplo</button>
               </div>`
            : ''
        }
        <p class="muted small" style="margin: 6px 0 14px;">
          Use a coluna <strong>Foto</strong> para conferir se a imagem corresponde à peça antes de alterar preço ou excluir.
        </p>
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Foto</th><th>Nome</th><th>Marca</th><th>Categoria</th><th>Preço</th><th>Estoque</th><th>Ações</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="actions">
          <button class="btn" id="back-from-admin">← Voltar ao catálogo</button>
          <button class="btn danger" id="reset-products">Esvaziar catálogo</button>
        </div>
      </div>
    </section>
  `
}

// ─── Template principal ───────────────────────────────────────────────────────

const stepNumber: Record<Step, number> = {
  cadastro: 1,
  catalogo: 2,
  carrinho: 3,
  checkout: 4,
  concluido: 4,
  admin: 2
}

function template() {
  const backStep = getBackStep(appState.step)
  const fichaProduto = appState.fichaTecnicaId
    ? products.find((p) => p.id === appState.fichaTecnicaId) ?? null
    : null
  const fichaModal = fichaProduto
    ? `
      <div class="ficha-overlay" id="ficha-overlay" role="dialog" aria-modal="true" aria-label="Detalhes da peça">
        <div class="ficha-modal" id="ficha-modal">
          <div class="ficha-header">
            <h3>${escapeHtml(fichaProduto.nome)}</h3>
            <button class="btn" id="close-ficha" aria-label="Fechar">✕</button>
          </div>
          <div class="ficha-body">
            <div class="ficha-gallery-scroll">
              ${productGalleryUrls(fichaProduto)
                .map(
                  (src) =>
                    `<img class="ficha-gallery-img" src="${escapeAttr(src)}" alt="" loading="lazy"
                      onerror="this.src='https://placehold.co/400x220/e8f0fe/1a3a6b?text=Foto'" />`
                )
                .join('')}
            </div>
            <p><strong>Marca:</strong> ${escapeHtml(fichaProduto.marca)}</p>
            <p><strong>Categoria:</strong> ${escapeHtml(fichaProduto.categoria)}${fichaProduto.subcategoria ? ` · ${escapeHtml(fichaProduto.subcategoria)}` : ''}</p>
            <p><strong>Preço:</strong> ${currency.format(fichaProduto.preco)}</p>
            <p><strong>Estoque:</strong> ${fichaProduto.estoque} un.</p>
            <p><strong>Descrição:</strong> ${escapeHtml(fichaProduto.uso)}</p>
          </div>
        </div>
      </div>
    `
    : ''
  const screens: Record<Step, string> = {
    cadastro: cadastroScreen(),
    catalogo: catalogoScreen(),
    carrinho: cartScreen(),
    checkout: checkoutScreen(),
    concluido: successScreen(),
    admin: adminScreen()
  }

  const hideTopOnLanding = appState.step === 'cadastro'
  return `
    <div class="app-shell${hideTopOnLanding ? ' app-shell--cadastro-landing' : ''}">
      ${
        hideTopOnLanding
          ? ''
          : `<header class="topbar">
        <div class="topbar-left">
          <button class="btn topbar-back" id="go-back" aria-label="Voltar" ${backStep ? '' : 'disabled'}>←</button>
          <a class="topbar-logo" id="go-home" href="#" aria-label="Início">
            ${logoHtml()}
          </a>
        </div>
        <div class="topbar-right">
          <span class="topbar-step">Etapa ${stepNumber[appState.step]} / 4</span>
          ${appState.customer.nomeCompleto
            ? '<button type="button" class="btn new-registration-btn" id="new-registration" title="Cadastrar novo cliente">Fazer novo cadastro</button>'
            : ''}
        </div>
      </header>`
      }
      ${hideTopOnLanding || !backStep ? '' : '<button class="btn floating-back" id="floating-back" aria-label="Voltar para a página anterior">← Voltar</button>'}
      ${appState.step === 'catalogo' ? `
        <button class="btn floating-cart" id="floating-cart" aria-label="Abrir carrinho">
          🛒 Carrinho <span class="floating-cart-badge">${cartCount()}</span>
        </button>
      ` : ''}
      ${screens[appState.step]}
      ${fichaModal}
    </div>
  `
}

// ─── Bind de eventos ──────────────────────────────────────────────────────────

function bindEvents() {
  if (!adminSecretBound) {
    document.addEventListener('keydown', (e) => {
      const isShortcutA = e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')
      const isShortcutB = e.ctrlKey && e.altKey && (e.key === 'A' || e.key === 'a')
      if (isShortcutA || isShortcutB) {
        e.preventDefault()
        requestAdminAccess()
      }
    })
    adminSecretBound = true
  }

  // Detalhes da peça (modal).
  document.querySelectorAll<HTMLButtonElement>('[data-action="open-tech"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.fichaTecnicaId = btn.dataset.id ?? null
      persistState()
      render()
    })
  })
  document.getElementById('close-ficha')?.addEventListener('click', () => {
    appState.fichaTecnicaId = null
    persistState()
    render()
  })
  document.getElementById('ficha-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      appState.fichaTecnicaId = null
      persistState()
      render()
    }
  })

  // Topbar
  document.getElementById('go-back')?.addEventListener('click', () => {
    const backStep = getBackStep(appState.step)
    if (backStep) setStep(backStep)
  })
  document.getElementById('floating-back')?.addEventListener('click', () => {
    const backStep = getBackStep(appState.step)
    if (backStep) setStep(backStep)
  })
  document.getElementById('floating-cart')?.addEventListener('click', () => setStep('carrinho'))
  document.getElementById('go-home')?.addEventListener('click', (e) => {
    e.preventDefault()
    const openedAdmin = registerAdminLogoTap()
    if (openedAdmin) return
    if (appState.customer.nomeCompleto) setStep('catalogo')
    else setStep('cadastro')
  })
  document.getElementById('new-registration')?.addEventListener('click', () => {
    if (confirm('Iniciar um novo cadastro de cliente? Os dados atuais serão limpos.')) {
      resetToNewCustomerRegistration()
    }
  })
  // Cadastro
  const cadastroForm = document.getElementById('cadastro-form') as HTMLFormElement | null
  const cpfInput = cadastroForm?.querySelector<HTMLInputElement>('input[name="cpf"]')
  const nameInput = cadastroForm?.querySelector<HTMLInputElement>('input[name="nomeCompleto"]')
  const workshopInput = cadastroForm?.querySelector<HTMLInputElement>('input[name="nomeOficina"]')
  const addressInput = cadastroForm?.querySelector<HTMLInputElement>('input[name="enderecoCompleto"]')
  const emailInput = cadastroForm?.querySelector<HTMLInputElement>('input[name="email"]')
  const whatsappInput = cadastroForm?.querySelector<HTMLInputElement>('input[name="whatsapp"]')

  const fillCustomerForm = (customer: Customer) => {
    if (cpfInput) cpfInput.value = formatCpfDisplay(customer.cpf)
    if (nameInput) nameInput.value = customer.nomeCompleto
    if (workshopInput) workshopInput.value = customer.nomeOficina
    if (addressInput) addressInput.value = customer.enderecoCompleto
    if (emailInput) emailInput.value = customer.email
    if (whatsappInput) whatsappInput.value = formatWhatsapp(customer.whatsapp)
    if (!workshopInput) appState.customer.nomeOficina = customer.nomeOficina
    if (!addressInput) appState.customer.enderecoCompleto = customer.enderecoCompleto
    persistState()
  }

  const tryAutofillByName = () => {
    if (!nameInput) return
    const found = findCustomerProfileByName(nameInput.value)
    if (!found) return
    fillCustomerForm(found)
  }

  const tryAutofillByCpf = () => {
    if (!cpfInput) return
    const d = normalizeCpfDigits(cpfInput.value)
    if (d.length !== 11 || !isValidCpf(d)) return
    const found = findCustomerProfileByCpf(d)
    if (!found) return
    fillCustomerForm(found)
  }

  nameInput?.addEventListener('change', tryAutofillByName)
  nameInput?.addEventListener('blur', tryAutofillByName)

  cpfInput?.addEventListener('input', () => {
    if (!cpfInput) return
    cpfInput.value = formatCpfDisplay(cpfInput.value)
    const d = normalizeCpfDigits(cpfInput.value)
    if (d.length === 11 && isValidCpf(d)) {
      const found = findCustomerProfileByCpf(d)
      if (found) fillCustomerForm(found)
    }
  })
  cpfInput?.addEventListener('change', tryAutofillByCpf)
  cpfInput?.addEventListener('blur', tryAutofillByCpf)

  whatsappInput?.addEventListener('input', () => {
    whatsappInput.value = formatWhatsapp(whatsappInput.value)
  })

  const persistCadastroDraftFromDom = () => {
    if (!cadastroForm) return
    const fd = new FormData(cadastroForm)
    appState.customer = {
      ...appState.customer,
      cpf: normalizeCpfDigits(String(fd.get('cpf') ?? '')),
      nomeCompleto: String(fd.get('nomeCompleto') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      whatsapp: String(fd.get('whatsapp') ?? '').trim()
    }
    persistState()
  }
  let cadastroDraftTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleCadastroDraftPersist = () => {
    if (cadastroDraftTimer) clearTimeout(cadastroDraftTimer)
    cadastroDraftTimer = setTimeout(() => {
      cadastroDraftTimer = null
      persistCadastroDraftFromDom()
    }, 280)
  }
  ;[cpfInput, nameInput, emailInput, whatsappInput].forEach((el) => {
    el?.addEventListener('input', scheduleCadastroDraftPersist)
    el?.addEventListener('blur', persistCadastroDraftFromDom)
  })

  cadastroForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const fd = new FormData(cadastroForm)
    const get = (k: string) => String(fd.get(k) ?? '').trim()
    const cpfDigits = normalizeCpfDigits(get('cpf'))
    if (cpfDigits.length !== 11) {
      alert('Informe o CPF com 11 dígitos.')
      cpfInput?.focus()
      return
    }
    if (!isValidCpf(cpfDigits)) {
      alert('CPF inválido. Verifique os números.')
      cpfInput?.focus()
      return
    }
    if (!get('nomeCompleto') || !get('email') || !get('whatsapp')) {
      alert('Preencha todos os campos obrigatórios (*).')
      return
    }
    if (!isValidWhatsapp(get('whatsapp'))) {
      alert('Informe o WhatsApp no formato (00) 00000-0000.')
      whatsappInput?.focus()
      return
    }
    const prev = appState.customer
    appState.customer = {
      cpf: cpfDigits,
      nomeCompleto: get('nomeCompleto'),
      nomeOficina: prev.nomeOficina.trim(),
      enderecoCompleto: prev.enderecoCompleto.trim(),
      email: get('email'),
      whatsapp: get('whatsapp')
    }
    upsertCustomerProfile(appState.customer)
    setStep('catalogo')
  })

  // Catálogo
  document.getElementById('back-register')?.addEventListener('click', () => setStep('cadastro'))
  document.getElementById('go-cart')?.addEventListener('click', () => setStep('carrinho'))
  document.getElementById('search')?.addEventListener('input', (e) => {
    appState.filtroBusca = (e.target as HTMLInputElement).value
    refreshCatalogGrid()
    persistState()
  })
  document.getElementById('category-filter')?.addEventListener('change', (e) => {
    appState.filtroCategoria = (e.target as HTMLSelectElement).value as 'todas' | Category
    refreshCatalogGrid()
    persistState()
  })

  // Carrinho
  document.getElementById('back-catalog')?.addEventListener('click', () => setStep('catalogo'))
  document.getElementById('go-checkout')?.addEventListener('click', () => setStep('checkout'))

  // Checkout
  document.getElementById('back-cart')?.addEventListener('click', () => setStep('carrinho'))
  const cashChangeInput = document.getElementById('cash-change-for') as HTMLInputElement | null
  cashChangeInput?.addEventListener('input', () => {
    appState.cashChangeFor = cashChangeInput.value
    persistState()
  })

  document.querySelectorAll<HTMLInputElement>('input[name="deliveryMode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      appState.deliveryMode = radio.value
      persistState()
      render()
    })
  })

  document.querySelectorAll<HTMLInputElement>('input[name="paymentMethod"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      appState.paymentMethod = radio.value
      const cashBox = document.getElementById('cash-change-box')
      if (getPaymentOption(radio.value)?.asksCashChange) cashBox?.classList.remove('hidden')
      else {
        cashBox?.classList.add('hidden')
        appState.cashChangeFor = ''
        if (cashChangeInput) cashChangeInput.value = ''
      }
      persistState()
      render()
    })
  })

  document.getElementById('copy-pix-key')?.addEventListener('click', async () => {
    const key = checkoutOptions.pixKey?.trim()
    if (!key) return
    try {
      await navigator.clipboard.writeText(key)
      alert('Chave PIX copiada para a área de transferência.')
    } catch {
      window.prompt('Copie a chave PIX:', key)
    }
  })

  const checkoutForm = document.getElementById('checkout-form') as HTMLFormElement | null
  checkoutForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    void (async () => {
      const selected = document.querySelector<HTMLInputElement>('input[name="deliveryMode"]:checked')
      const selectedPayment = document.querySelector<HTMLInputElement>('input[name="paymentMethod"]:checked')
      appState.deliveryMode = clampDeliveryModeId(selected?.value)
      appState.paymentMethod = clampPaymentMethodId(selectedPayment?.value)

      const payOpt = getPaymentOption(appState.paymentMethod)
      if (payOpt?.asksCashChange && appState.cashChangeFor) {
        const changeValue = Number(appState.cashChangeFor)
        const totalPedido = checkoutOrderTotal()
        if (Number.isNaN(changeValue) || changeValue < totalPedido) {
          alert(`O valor de troco deve ser maior ou igual ao total do pedido (${currency.format(totalPedido)}).`)
          cashChangeInput?.focus()
          return
        }
      }

      for (const { product, qty } of cartItems()) {
        if (qty > product.estoque) {
          alert(
            product.estoque <= 0
              ? `"${product.nome}" está sem estoque. Ajuste o carrinho.`
              : `"${product.nome}": só há ${product.estoque} unidade(s) disponível(is).`
          )
          return
        }
      }

      const useApiPedido =
        (import.meta.env.DEV || import.meta.env.VITE_SYNC_PRODUCTS_FROM_API === 'true') &&
        cartItems().length > 0 &&
        cartItems().every(({ product }) => storeApi.isMongoObjectId(product.id))

      if (useApiPedido) {
        const numero = gerarNumeroPedido()
        const r = await storeApi.postPedidoJson({
          numero,
          items: cartItems().map(({ product, qty }) => ({ productId: product.id, qty })),
          total: checkoutOrderTotal(),
          customer: appState.customer,
          deliveryMode: appState.deliveryMode,
          paymentMethod: appState.paymentMethod,
          cashChangeFor: appState.cashChangeFor
        })
        if (r.ok) {
          appState.pedidoNumero = numero
          persistState()
          await refreshProductsFromApi()
          setStep('concluido')
          return
        }
        alert('Não foi possível registrar o pedido na API: ' + r.erro)
        return
      }

      products = products.map((pr) => {
        const q = appState.cart[pr.id]
        if (!q || q <= 0) return pr
        return { ...pr, estoque: Math.max(0, pr.estoque - q) }
      })
      saveProducts(products)

      appState.pedidoNumero = gerarNumeroPedido()
      persistState()
      setStep('concluido')
    })()
  })

  // Atualiza radio-card ao clicar
  document.querySelectorAll<HTMLInputElement>('input[type="radio"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const fieldset = radio.closest('fieldset')
      fieldset?.querySelectorAll('.radio-card').forEach((el) => el.classList.remove('selected'))
      radio.closest('.radio-card')?.classList.add('selected')
    })
  })

  // Sucesso
  document.getElementById('new-order')?.addEventListener('click', () => {
    appState.cart = {}
    appState.filtroBusca = ''
    appState.filtroCategoria = 'todas'
    appState.pedidoNumero = ''
    persistState()
    setStep('catalogo')
  })

  // Botões de quantidade e adicionar ao carrinho (catálogo e carrinho)
  document.querySelectorAll<HTMLButtonElement>('[data-action="plus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!
      updateQty(id, (appState.cart[id] ?? 0) + 1)
    })
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="minus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!
      updateQty(id, (appState.cart[id] ?? 0) - 1)
    })
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="remove"]').forEach((btn) => {
    btn.addEventListener('click', () => updateQty(btn.dataset.id!, 0))
  })

  // Admin – identidade da loja
  const brandingForm = document.getElementById('branding-form') as HTMLFormElement | null
  const brandingDescTa = brandingForm?.querySelector<HTMLTextAreaElement>('textarea[name="descricaoEmpresa"]')
  const brandingDescCounter = document.getElementById('admin-descricao-counter')
  const syncBrandingDescCounter = () => {
    if (!brandingDescTa || !brandingDescCounter) return
    brandingDescCounter.textContent = `${brandingDescTa.value.length} / 2000`
  }
  brandingDescTa?.addEventListener('input', syncBrandingDescCounter)

  brandingForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const fd = new FormData(brandingForm)
    const nomeEmpresa = String(fd.get('nomeEmpresa') ?? '').trim()
    if (!nomeEmpresa) {
      alert('Informe o nome da empresa.')
      return
    }
    const tagline = String(fd.get('tagline') ?? '').trim()
    let logoUrl: string
    if (brandingPendingLogoDataUrl) {
      logoUrl = brandingPendingLogoDataUrl
      brandingPendingLogoDataUrl = null
    } else {
      logoUrl = storeBranding.logoUrl
    }
    storeBranding = {
      nomeEmpresa,
      tagline,
      logoUrl,
      descricaoEmpresa: String(fd.get('descricaoEmpresa') ?? '').trim(),
      ramoEmpresa: String(fd.get('ramoEmpresa') ?? '').trim(),
      enderecoEmpresa: String(fd.get('enderecoEmpresa') ?? '').trim(),
      telefoneEmpresa: String(fd.get('telefoneEmpresa') ?? '').trim()
    }
    saveBranding(storeBranding)
    applyDocumentBranding()
    render()
  })

  const brandingLogoFile = document.getElementById('branding-logo-file') as HTMLInputElement | null
  document.getElementById('branding-pick-logo')?.addEventListener('click', () => brandingLogoFile?.click())
  brandingLogoFile?.addEventListener('change', () => {
    const file = brandingLogoFile.files?.[0]
    if (!file || !file.type.startsWith('image/')) {
      if (file) alert('Selecione um arquivo de imagem.')
      brandingLogoFile.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      if (reader.result.length > 6_500_000) {
        alert('Esta imagem é grande demais. Escolha um arquivo menor.')
        return
      }
      brandingPendingLogoDataUrl = reader.result
      brandingLogoFile.value = ''
      render()
    }
    reader.readAsDataURL(file)
  })

  document.getElementById('branding-clear-logo')?.addEventListener('click', () => {
    brandingPendingLogoDataUrl = null
    storeBranding = { ...storeBranding, logoUrl: '' }
    saveBranding(storeBranding)
    applyDocumentBranding()
    render()
  })

  document.getElementById('branding-reset')?.addEventListener('click', () => {
    if (!confirm('Restaurar nome, slogan e logo padrão do sistema?')) return
    brandingPendingLogoDataUrl = null
    storeBranding = { ...DEFAULT_BRANDING }
    saveBranding(storeBranding)
    applyDocumentBranding()
    render()
  })

  // Admin – Pagamento e Entrega
  document.getElementById('co-save')?.addEventListener('click', () => {
    const next = readCheckoutOptionsFromAdminDom()
    if (!next) return
    saveCheckoutOptions(next)
    appState.deliveryMode = clampDeliveryModeId(appState.deliveryMode)
    appState.paymentMethod = clampPaymentMethodId(appState.paymentMethod)
    persistState()
    render()
  })

  document.getElementById('co-reset-default')?.addEventListener('click', () => {
    if (!confirm('Limpar todas as opções de pagamento e entrega?')) return
    saveCheckoutOptions(JSON.parse(JSON.stringify(DEFAULT_CHECKOUT_OPTIONS)) as CheckoutOptions)
    appState.deliveryMode = clampDeliveryModeId(appState.deliveryMode)
    appState.paymentMethod = clampPaymentMethodId(appState.paymentMethod)
    persistState()
    render()
  })

  document.getElementById('co-pedido-whatsapp-clear')?.addEventListener('click', () => {
    if (!confirm('Remover o número cadastrado? O botão de WhatsApp na confirmação do pedido deixará de aparecer até cadastrar outro número.')) return
    saveCheckoutOptions({ ...checkoutOptions, pedidoWhatsapp: '' })
    persistState()
    render()
  })

  // Admin – fotos do produto (galeria, arquivo ou câmera)
  const adminFileGallery = document.getElementById('admin-product-file-gallery') as HTMLInputElement | null
  const adminFileCamera = document.getElementById('admin-product-file-camera') as HTMLInputElement | null
  const adminPickGallery = document.getElementById('admin-pick-gallery')
  const adminPickCamera = document.getElementById('admin-pick-camera')
  const adminClearPhoto = document.getElementById('admin-clear-photo')

  const appendAdminDataUrls = (urls: string[]) => {
    const next = [...adminPendingImageDataUrls]
    for (const u of urls) {
      const s = u.trim()
      if (!s) continue
      if (s.startsWith('data:') && s.length > 6_500_000) {
        alert('Uma das imagens é grande demais para guardar no navegador. Reduza o tamanho.')
        continue
      }
      if (next.length >= MAX_PRODUCT_IMAGES) {
        alert(`Limite de ${MAX_PRODUCT_IMAGES} fotos por produto.`)
        break
      }
      next.push(s)
    }
    adminPendingImageDataUrls = next
    render()
  }

  const readAdminImageFile = (file: File | undefined, onDone: (url: string) => void) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') onDone(reader.result)
    }
    reader.readAsDataURL(file)
  }

  const readFileAsDataUrlAsync = (file: File): Promise<string | null> =>
    new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== 'string') resolve(null)
        else if (reader.result.length > 6_500_000) resolve(null)
        else resolve(reader.result)
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(file)
    })

  adminPickGallery?.addEventListener('click', () => adminFileGallery?.click())
  adminPickCamera?.addEventListener('click', () => adminFileCamera?.click())
  adminFileGallery?.addEventListener('change', () => {
    void (async () => {
      const files = adminFileGallery?.files
      if (!files?.length) {
        adminFileGallery!.value = ''
        return
      }
      const fileArr = Array.from(files)
      const room = MAX_PRODUCT_IMAGES - adminPendingImageDataUrls.length
      if (room <= 0) {
        alert(`Limite de ${MAX_PRODUCT_IMAGES} fotos por produto.`)
        adminFileGallery!.value = ''
        return
      }
      if (shouldTryServerUpload()) {
        const slice = fileArr.slice(0, room)
        const up = await storeApi.postUploadArquivos(slice)
        if (up.ok) {
          appendAdminDataUrls(up.urls)
          adminFileGallery!.value = ''
          return
        }
        if (up.erro && !up.erro.includes('Sem conexão')) {
          alert('Upload no servidor: ' + up.erro + '\nTentando salvar no navegador (base64)…')
        }
      }
      const urls: string[] = []
      for (const file of fileArr) {
        if (adminPendingImageDataUrls.length + urls.length >= MAX_PRODUCT_IMAGES) {
          alert(`Limite de ${MAX_PRODUCT_IMAGES} fotos por produto.`)
          break
        }
        const url = await readFileAsDataUrlAsync(file)
        if (!url) alert('Não foi possível ler uma das imagens (tipo inválido ou arquivo grande demais).')
        else urls.push(url)
      }
      if (urls.length) appendAdminDataUrls(urls)
      adminFileGallery!.value = ''
    })()
  })
  adminFileCamera?.addEventListener('change', () => {
    void (async () => {
      const file = adminFileCamera?.files?.[0]
      if (!file) {
        adminFileCamera!.value = ''
        return
      }
      if (adminPendingImageDataUrls.length >= MAX_PRODUCT_IMAGES) {
        alert(`Limite de ${MAX_PRODUCT_IMAGES} fotos por produto.`)
        adminFileCamera!.value = ''
        return
      }
      if (shouldTryServerUpload()) {
        const up = await storeApi.postUploadArquivos([file])
        if (up.ok) {
          appendAdminDataUrls(up.urls)
          adminFileCamera!.value = ''
          return
        }
        if (up.erro && !up.erro.includes('Sem conexão')) {
          alert('Upload no servidor: ' + up.erro + '\nUsando cópia local (base64)…')
        }
      }
      readAdminImageFile(file, (url) => {
        appendAdminDataUrls([url])
        adminFileCamera!.value = ''
      })
    })()
  })
  adminClearPhoto?.addEventListener('click', () => {
    adminPendingImageDataUrls = []
    render()
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-remove-thumb"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.thumbIndex)
      if (Number.isNaN(idx)) return
      adminPendingImageDataUrls = adminPendingImageDataUrls.filter((_, i) => i !== idx)
      render()
    })
  })

  document.getElementById('admin-api-jwt-login')?.addEventListener('click', () => {
    void (async () => {
      const pwd = prompt('Senha da API (ADMIN_PASSWORD ou ADMIN_API_KEY no servidor):')
      if (pwd == null) return
      const r = await storeApi.postAuthLogin(pwd.trim())
      if (!r.ok) {
        alert(r.erro)
        return
      }
      try {
        localStorage.setItem(storeApi.ADMIN_JWT_STORAGE_KEY, r.token)
      } catch {
        alert('Não foi possível guardar o token neste navegador.')
        return
      }
      alert('Sessão API ativa (JWT).')
      render()
    })()
  })
  document.getElementById('admin-api-jwt-logout')?.addEventListener('click', () => {
    storeApi.clearAdminJwt()
    render()
  })

  document.getElementById('admin-load-pedidos')?.addEventListener('click', async () => {
    const out = document.getElementById('admin-pedidos-out')
    if (!out) return
    out.innerHTML = '<p class="muted small">Carregando…</p>'
    const list = await storeApi.fetchPedidos(15000)
    if (list === null) {
      out.innerHTML =
        '<p class="muted small">Não foi possível carregar. Verifique API e MongoDB. Se a gestão estiver protegida, use <strong>Entrar na API</strong> (JWT) ou defina <strong>VITE_ADMIN_API_KEY</strong> igual a <strong>ADMIN_API_KEY</strong> no <code>.env</code>.</p>'
      return
    }
    if (list.length === 0) {
      out.innerHTML = '<p class="muted small">Nenhum pedido registrado ainda.</p>'
      return
    }
    out.innerHTML = adminPedidosTableHtml(list)
  })

  // Admin – adicionar produto
  const adminForm = document.getElementById('admin-form') as HTMLFormElement | null
  adminForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    void (async () => {
      const fd = new FormData(adminForm)
      const get = (k: string) => String(fd.get(k) ?? '').trim()
      const nome = get('nome')
      const marca = get('marca')
      const categoria = get('categoria') as Category
      const preco = parseFloat(get('preco'))
      const uso = get('uso')
      const estoqueIni = Math.max(0, Math.floor(Number(get('estoque'))))
      if (!nome || !marca || !categoria || isNaN(preco) || !uso) {
        alert('Preencha os campos obrigatórios do produto.')
        return
      }
      if (Number.isNaN(estoqueIni)) {
        alert('Informe o estoque inicial (número inteiro ≥ 0).')
        return
      }
      const imagens =
        adminPendingImageDataUrls.length > 0
          ? [...adminPendingImageDataUrls].slice(0, MAX_PRODUCT_IMAGES)
          : ['https://placehold.co/400x220/e8f0fe/1a3a6b?text=Foto']

      const useApi =
        import.meta.env.DEV || import.meta.env.VITE_SYNC_PRODUCTS_FROM_API === 'true'
      if (useApi) {
        const r = await storeApi.postProdutoJson({
          nome,
          marca,
          categoria,
          subcategoria: get('subcategoria') || undefined,
          preco,
          imagens,
          estoque: estoqueIni,
          uso,
          custom: true,
          modelo: false
        })
        if (r.ok) {
          products = [...products, normalizeProduct(r.data)]
          saveProducts(products)
          adminPendingImageDataUrls = []
          adminForm.reset()
          render()
          return
        }
        alert('API: não foi possível criar o produto (' + r.erro + '). Salvando só no navegador.')
      }

      const newProduct: Product = {
        id: `custom-${Date.now()}`,
        nome,
        marca,
        categoria,
        subcategoria: get('subcategoria') || undefined,
        preco,
        imagens,
        estoque: estoqueIni,
        uso,
        custom: true,
        modelo: false
      }
      products = [...products, newProduct]
      saveProducts(products)
      adminPendingImageDataUrls = []
      adminForm.reset()
      render()
    })()
  })

  // Admin – excluir produto
  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-delete"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index)
      void (async () => {
        if (!confirm(`Remover "${products[idx]?.nome}"?`)) return
        const p = products[idx]
        if (p && storeApi.isMongoObjectId(p.id)) {
          const ok = await storeApi.deleteProduto(p.id)
          if (ok && (await refreshProductsFromApi())) return
        }
        products = products.filter((_, i) => i !== idx)
        saveProducts(products)
        render()
      })()
    })
  })

  // Admin – editar preço
  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-save-price"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index)
      void (async () => {
        const input = document.querySelector<HTMLInputElement>(`[data-action="admin-price"][data-index="${idx}"]`)
        const nextPrice = Number(input?.value)
        if (!input || Number.isNaN(nextPrice) || nextPrice < 0) {
          alert('Informe um preço válido para salvar.')
          input?.focus()
          return
        }
        const cur = products[idx]
        if (cur && storeApi.isMongoObjectId(cur.id)) {
          const r = await storeApi.patchProdutoJson(cur.id, { preco: nextPrice })
          if (r.ok) {
            products[idx] = normalizeProduct(r.data)
            saveProducts(products)
            render()
            return
          }
          alert('API: ' + r.erro)
        }
        products[idx] = { ...products[idx], preco: nextPrice }
        saveProducts(products)
        render()
      })()
    })
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-stock-plus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index)
      void (async () => {
        const cur = products[idx]
        if (!cur) return
        const next = cur.estoque + 1
        if (storeApi.isMongoObjectId(cur.id)) {
          const r = await storeApi.patchProdutoJson(cur.id, { estoque: next })
          if (r.ok) {
            products[idx] = normalizeProduct(r.data)
            saveProducts(products)
            render()
            return
          }
          alert('API: ' + r.erro)
        }
        products[idx] = { ...cur, estoque: next }
        saveProducts(products)
        render()
      })()
    })
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-stock-minus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index)
      void (async () => {
        const cur = products[idx]
        if (!cur) return
        const next = Math.max(0, cur.estoque - 1)
        if (storeApi.isMongoObjectId(cur.id)) {
          const r = await storeApi.patchProdutoJson(cur.id, { estoque: next })
          if (r.ok) {
            products[idx] = normalizeProduct(r.data)
            saveProducts(products)
            render()
            return
          }
          alert('API: ' + r.erro)
        }
        products[idx] = { ...cur, estoque: next }
        saveProducts(products)
        render()
      })()
    })
  })

  // Admin – remover só peças de exemplo (modelo)
  document.getElementById('remove-modelo-products')?.addEventListener('click', () => {
    const n = products.filter((p) => p.modelo).length
    if (n === 0) return
    if (!confirm(`Remover ${n} peça(s) de exemplo do catálogo? Elas deixam de aparecer para o cliente.`)) {
      return
    }
    void (async () => {
      const modelos = products.filter((p) => p.modelo)
      const useApi =
        import.meta.env.DEV || import.meta.env.VITE_SYNC_PRODUCTS_FROM_API === 'true'
      if (useApi) {
        for (const p of modelos) {
          if (storeApi.isMongoObjectId(p.id)) await storeApi.deleteProduto(p.id)
        }
        if (await refreshProductsFromApi()) {
          localStorage.setItem(STORAGE_KEYS.modelosExemplosRemovidos, '1')
          return
        }
      }
      products = products.filter((p) => !p.modelo)
      localStorage.setItem(STORAGE_KEYS.modelosExemplosRemovidos, '1')
      saveProducts(products)
      render()
    })()
  })

  // Admin – esvaziar catálogo
  document.getElementById('reset-products')?.addEventListener('click', () => {
    if (!confirm('Remover todos os produtos cadastrados? Esta ação não pode ser desfeita.')) return
    void (async () => {
      const useApi =
        import.meta.env.DEV || import.meta.env.VITE_SYNC_PRODUCTS_FROM_API === 'true'
      if (useApi && products.every((p) => storeApi.isMongoObjectId(p.id))) {
        for (const p of products) {
          await storeApi.deleteProduto(p.id)
        }
        if (await refreshProductsFromApi()) {
          localStorage.setItem(STORAGE_KEYS.modelosExemplosRemovidos, '1')
          return
        }
      }
      products = []
      localStorage.setItem(STORAGE_KEYS.modelosExemplosRemovidos, '1')
      saveProducts(products)
      render()
    })()
  })

  document.getElementById('back-from-admin')?.addEventListener('click', () => setStep('catalogo'))
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  syncCartWithStock()
  const cadastroLanding = appState.step === 'cadastro'
  app.classList.toggle('app-view-cadastro-landing', cadastroLanding)
  document.body.classList.toggle('cadastro-landing-active', cadastroLanding)
  app.innerHTML = template()
  bindEvents()
}

render()
void tryReplaceProductsFromApiIfDev()
