import './style.css'
import logoLugarDasTintas from '/logo-castro-multimarcas.svg'

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
  imagem: string
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
      id: 'modelo-camiseta',
      nome: 'Camiseta básica (exemplo)',
      marca: 'Modelo',
      categoria: 'Camisetas e blusas',
      subcategoria: 'M · Branco',
      preco: 49.9,
      imagem: '/modelos/camiseta.svg',
      uso: 'Exemplo: algodão, gola redonda. Edite preço ou exclua e cadastre suas peças reais.',
      modelo: true
    },
    {
      id: 'modelo-calca',
      nome: 'Calça jeans (exemplo)',
      marca: 'Modelo',
      categoria: 'Calças e jeans',
      subcategoria: '42 · Azul',
      preco: 129.9,
      imagem: '/modelos/calca.svg',
      uso: 'Exemplo de descrição. Remova as peças modelo quando não precisar mais.',
      modelo: true
    },
    {
      id: 'modelo-vestido',
      nome: 'Vestido midi (exemplo)',
      marca: 'Modelo',
      categoria: 'Vestidos e saias',
      subcategoria: 'P · Floral',
      preco: 159.9,
      imagem: '/modelos/vestido.svg',
      uso: 'Exemplo para vitrine. O cliente vê no catálogo como qualquer outro produto.',
      modelo: true
    },
    {
      id: 'modelo-shorts',
      nome: 'Shorts casual (exemplo)',
      marca: 'Modelo',
      categoria: 'Shorts e bermudas',
      subcategoria: 'M · Bege',
      preco: 79.9,
      imagem: '/modelos/shorts.svg',
      uso: 'Substitua por fotos reais das suas peças pelo painel administrativo.',
      modelo: true
    },
    {
      id: 'modelo-casaco',
      nome: 'Casaco leve (exemplo)',
      marca: 'Modelo',
      categoria: 'Casacos e jaquetas',
      subcategoria: 'G · Preto',
      preco: 189.9,
      imagem: '/modelos/casaco.svg',
      uso: 'Último exemplo. Use “Remover peças de exemplo” para tirar todos de uma vez.',
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
  deliveryOptions: DeliveryOptionConfig[]
  paymentOptions: PaymentOptionConfig[]
}

const DEFAULT_CHECKOUT_OPTIONS: CheckoutOptions = {
  deliveryOptions: [
    {
      id: 'entrega',
      title: 'Entrega no endereço',
      description: '',
      showCustomerAddress: true
    },
    {
      id: 'retirada',
      title: 'Retirada na loja',
      description: 'Retire pessoalmente no balcão.',
      showCustomerAddress: false
    }
  ],
  paymentOptions: [
    {
      id: 'pix',
      title: 'Pix',
      detail: 'Chave Pix (CNPJ): 13232181000123',
      asksCashChange: false
    },
    {
      id: 'cartao_link',
      title: 'Cartão de crédito',
      detail: 'Solicitar envio do link de pagamento pelo WhatsApp.',
      asksCashChange: false
    },
    {
      id: 'maquineta',
      title: 'Cartão na maquineta',
      detail: 'Solicitar maquineta para pagamento presencial.',
      asksCashChange: false
    },
    {
      id: 'dinheiro',
      title: 'Dinheiro',
      detail: 'Pagamento em espécie na entrega ou retirada.',
      asksCashChange: true
    }
  ]
}

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
      const d = Array.isArray(parsed.deliveryOptions) ? parsed.deliveryOptions : []
      const p = Array.isArray(parsed.paymentOptions) ? parsed.paymentOptions : []
      if (d.length > 0 && p.length > 0) {
        return {
          deliveryOptions: d.map((x) => normalizeDeliveryOption(x as Partial<DeliveryOptionConfig>)),
          paymentOptions: p.map((x) => normalizePaymentOption(x as Partial<PaymentOptionConfig>))
        }
      }
    }
  } catch (_) {
    /* ignora */
  }
  return JSON.parse(JSON.stringify(DEFAULT_CHECKOUT_OPTIONS)) as CheckoutOptions
}

function saveCheckoutOptions(opts: CheckoutOptions) {
  localStorage.setItem(STORAGE_KEYS.checkoutOptions, JSON.stringify(opts))
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
  return opts[0]?.id ?? 'entrega'
}

function clampPaymentMethodId(id: string | undefined): string {
  const opts = checkoutOptions.paymentOptions
  if (id && opts.some((o) => o.id === id)) return id
  return opts[0]?.id ?? 'pix'
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

function normalizeCategory(raw: unknown): Category {
  if (typeof raw === 'string' && CATEGORY_SET.has(raw)) return raw as Category
  return 'Outros'
}

function normalizeProduct(raw: unknown): Product {
  const p = raw as Partial<Product> & { fonte?: string }
  return {
    id: String(p.id ?? `item-${Date.now()}`),
    nome: String(p.nome ?? 'Produto'),
    marca: String(p.marca ?? '—'),
    categoria: normalizeCategory(p.categoria),
    subcategoria: typeof p.subcategoria === 'string' && p.subcategoria.trim() ? p.subcategoria.trim() : undefined,
    preco: typeof p.preco === 'number' && !Number.isNaN(p.preco) ? p.preco : 0,
    imagem: String(p.imagem ?? ''),
    uso: String(p.uso ?? ''),
    custom: p.custom === true,
    modelo: (p as Partial<Product>).modelo === true
  }
}

function loadProducts(): Product[] {
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
}

function loadState(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.state)
    if (raw) return JSON.parse(raw) as PersistedState
  } catch (_) { /* ignora parse error */ }
  return {}
}

function persistState() {
  const toSave: PersistedState = {
    customer: appState.customer,
    cart: appState.cart,
    deliveryMode: appState.deliveryMode,
    paymentMethod: appState.paymentMethod,
    cashChangeFor: appState.cashChangeFor
  }
  localStorage.setItem(STORAGE_KEYS.state, JSON.stringify(toSave))
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

const appState: AppState = {
  step: 'cadastro',
  prevStep: 'catalogo',
  customer: {
    ...emptyCustomer(),
    ...(saved.customer ?? {}),
    cpf: normalizeCpfDigits(String((saved.customer as Partial<Customer> | undefined)?.cpf ?? ''))
  },
  filtroBusca: '',
  filtroCategoria: 'todas',
  cart: saved.cart ?? {},
  deliveryMode: clampDeliveryModeId(saved.deliveryMode),
  paymentMethod: clampPaymentMethodId(saved.paymentMethod),
  cashChangeFor: saved.cashChangeFor ?? '',
  isAdminAuthenticated: false,
  pedidoNumero: '',
  fichaTecnicaId: null
}

// Se havia cadastro salvo, vai direto ao catálogo
if (appState.customer.nomeCompleto) {
  appState.step = 'catalogo'
}

let products = loadProducts()
if (localStorage.getItem(STORAGE_KEYS.products) === null) {
  saveProducts(products)
}
let customerProfiles = loadCustomerProfiles()

applyDocumentBranding()

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

const app = document.querySelector<HTMLDivElement>('#app')!
const ADMIN_PIN = '1323' // troque por um PIN privado

/** Foto escolhida antes de salvar o produto (data URL). Limpa ao sair do admin. */
let adminPendingImageDataUrl: string | null = null

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

function cartCount() {
  return cartItems().reduce((s, i) => s + i.qty, 0)
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
    adminPendingImageDataUrl = null
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
  if (qty <= 0) delete appState.cart[id]
  else appState.cart[id] = qty
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

const LOJA_WHATSAPP = '5583999159349' // número de teste (Brasil)

function paymentMethodLabel(methodId: string): string {
  return getPaymentOption(methodId)?.title ?? methodId
}

function paymentMethodDetail(methodId: string): string {
  const opt = getPaymentOption(methodId)
  if (!opt) return ''
  if (opt.asksCashChange && appState.cashChangeFor) {
    const changeValue = Number(appState.cashChangeFor)
    if (!Number.isNaN(changeValue) && changeValue >= cartTotal()) {
      return `${opt.detail} Troco para: ${currency.format(changeValue)}.`
    }
  }
  return opt.detail
}

function deliveryModeSubtitle(o: DeliveryOptionConfig): string {
  if (o.showCustomerAddress) return appState.customer.enderecoCompleto || '—'
  return o.description || '—'
}

function readCheckoutOptionsFromAdminDom(): CheckoutOptions | null {
  const dBody = document.getElementById('co-delivery-tbody')
  const pBody = document.getElementById('co-payment-tbody')
  if (!dBody || !pBody) return null
  const deliveryOptions: DeliveryOptionConfig[] = []
  for (const row of dBody.querySelectorAll('tr[data-co-delivery]')) {
    const id = row.getAttribute('data-co-delivery')
    if (!id) continue
    const title = (row.querySelector('.co-inp-delivery-title') as HTMLInputElement).value.trim()
    const description = (row.querySelector('.co-inp-delivery-desc') as HTMLInputElement).value.trim()
    const showCustomerAddress = (row.querySelector('.co-inp-delivery-addr') as HTMLInputElement).checked
    if (!title) {
      alert('Preencha o título de cada modalidade de entrega.')
      return null
    }
    deliveryOptions.push(normalizeDeliveryOption({ id, title, description, showCustomerAddress }))
  }
  const paymentOptions: PaymentOptionConfig[] = []
  for (const row of pBody.querySelectorAll('tr[data-co-payment]')) {
    const id = row.getAttribute('data-co-payment')
    if (!id) continue
    const title = (row.querySelector('.co-inp-payment-title') as HTMLInputElement).value.trim()
    const detail = (row.querySelector('.co-inp-payment-detail') as HTMLInputElement).value.trim()
    const asksCashChange = (row.querySelector('.co-inp-payment-cash') as HTMLInputElement).checked
    if (!title) {
      alert('Preencha o título de cada forma de pagamento.')
      return null
    }
    paymentOptions.push(normalizePaymentOption({ id, title, detail, asksCashChange }))
  }
  if (!deliveryOptions.length || !paymentOptions.length) {
    alert('É necessário pelo menos uma modalidade de entrega e uma forma de pagamento.')
    return null
  }
  return { deliveryOptions, paymentOptions }
}

function buildWhatsAppUrl(): string {
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

  lines.push(``, `*Total: ${currency.format(cartTotal())}*`)

  const message = encodeURIComponent(lines.join('\n'))
  return `https://wa.me/${LOJA_WHATSAPP}?text=${message}`
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

function cadastroScreen() {
  const namesOptions = customerNameOptionsHtml()
  return `
    <section class="screen fade-in">
      <div class="card">
        ${stepIndicator(1)}
        <div class="screen-header">
          <p class="eyebrow">Bem-vindo a ${escapeHtml(storeBranding.nomeEmpresa || DEFAULT_BRANDING.nomeEmpresa)}</p>
          <h1>Cadastro do Cliente</h1>
          <p class="lead">Preencha seus dados para acessar o catálogo e realizar pedidos. Se você já se cadastrou antes, digite o <strong>CPF</strong> e os demais campos serão preenchidos automaticamente.</p>
        </div>
        <form id="cadastro-form" class="form-grid" novalidate>
          <datalist id="customer-name-suggestions">${namesOptions}</datalist>
          <label>
            CPF *
            <input
              required
              id="customer-cpf"
              name="cpf"
              value="${escapeAttr(formatCpfDisplay(appState.customer.cpf))}"
              placeholder="000.000.000-00"
              autocomplete="off"
              inputmode="numeric"
              maxlength="14"
            />
          </label>
          <label>
            Nome completo *
            <input required id="customer-full-name" name="nomeCompleto" value="${appState.customer.nomeCompleto}"
              placeholder="Ex: João da Silva" autocomplete="name" list="customer-name-suggestions" />
          </label>
          <label>
            Como prefere ser chamado(a) no pedido *
            <input required id="customer-workshop" name="nomeOficina" value="${appState.customer.nomeOficina}"
              placeholder="Ex: @instagram ou primeiro nome" />
          </label>
          <label class="full">
            Endereço completo *
            <input required id="customer-address" name="enderecoCompleto" value="${appState.customer.enderecoCompleto}"
              placeholder="Rua, número, bairro, cidade – CEP" autocomplete="street-address" />
          </label>
          <label>
            E-mail *
            <input required id="customer-email" type="email" name="email" value="${appState.customer.email}"
              placeholder="seu@email.com" autocomplete="email" />
          </label>
          <label>
            WhatsApp *
            <input id="customer-whatsapp" type="tel" name="whatsapp" value="${appState.customer.whatsapp}"
              placeholder="(00) 00000-0000" autocomplete="tel"
              required maxlength="15" inputmode="numeric" pattern="^\\(\\d{2}\\) \\d{5}-\\d{4}$" />
          </label>
          <div class="full form-actions">
            <button type="submit" class="btn primary">Acessar o Catálogo →</button>
          </div>
        </form>
      </div>
      ${storeAboutCardHtml()}
    </section>
  `
}

function catalogProductCardHtml(p: Product): string {
  const qty = appState.cart[p.id] ?? 0
  const imgSrc = escapeAttr(productImageUrl(p.imagem))
  const chipLine =
    p.subcategoria != null && String(p.subcategoria).trim()
      ? `<p class="chip">${escapeHtml(String(p.subcategoria).trim())}</p>`
      : ''
  return `
          <article class="product-card">
            <div class="product-img-wrap">
              <img src="${imgSrc}" alt="${escapeHtml(p.nome)}" loading="lazy"
                onerror="this.src='https://placehold.co/400x220/e8f0fe/1a3a6b?text=Foto'" />
              ${p.custom ? '<span class="badge-custom">Personalizado</span>' : ''}
              ${p.modelo ? '<span class="badge-modelo">Exemplo</span>' : ''}
            </div>
            <div class="product-body">
              ${chipLine}
              <h3>${escapeHtml(p.nome)}</h3>
              <p class="muted small">${escapeHtml(p.marca)}</p>
              <p class="muted uso-text">${escapeHtml(p.uso)}</p>
              <button class="btn link-btn" data-action="open-tech" data-id="${p.id}">
                Ver descrição
              </button>
              <div class="product-footer">
                <strong class="price">${currency.format(p.preco)}</strong>
                <div class="qty-wrap">
                  <button class="qty-btn" data-action="minus" data-id="${p.id}" aria-label="Diminuir">−</button>
                  <span class="qty-value">${qty}</span>
                  <button class="qty-btn" data-action="plus" data-id="${p.id}" aria-label="Aumentar">+</button>
                </div>
              </div>
              <button class="btn primary full-width mt4" data-action="open-cart" ${qty === 0 ? 'disabled' : ''}>
                ${qty > 0 ? `Ir para carrinho (${qty})` : 'Selecione no + / -'}
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
                src="${escapeAttr(productImageUrl(item.product.imagem))}"
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
            <button class="qty-btn" data-action="plus" data-id="${item.product.id}" aria-label="Aumentar">+</button>
          </div>
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

  const showCashBox = getPaymentOption(appState.paymentMethod)?.asksCashChange === true

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
          ${deliveryRadios}
        </fieldset>

        <fieldset>
          <legend>Forma de pagamento</legend>
          ${paymentRadios}
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
          <p><span class="muted">Total:</span> <strong class="total-highlight">${currency.format(cartTotal())}</strong></p>
        </div>

        <div class="actions">
          <button type="button" class="btn" id="back-cart">← Voltar ao carrinho</button>
          <button type="submit" class="btn primary">Confirmar pedido ✓</button>
        </div>
      </form>
    </section>
  `
}

function successScreen() {
  const mode = getDeliveryOption(appState.deliveryMode)?.title ?? '—'
  const payment = paymentMethodLabel(appState.paymentMethod)
  const paymentDetail = paymentMethodDetail(appState.paymentMethod)
  const waUrl = buildWhatsAppUrl()

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
      <p class="muted">Total: <strong>${currency.format(cartTotal())}</strong></p>

      <div class="wa-banner">
        <p>Envie os detalhes do pedido diretamente via WhatsApp para a loja:</p>
        <a href="${waUrl}" target="_blank" rel="noreferrer noopener" class="btn wa-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.47 14.38c-.25-.13-1.47-.73-1.7-.81-.23-.08-.4-.12-.57.13s-.65.81-.8.97-.3.19-.54.06c-1.57-.78-2.6-1.4-3.64-3.17-.28-.48.28-.44.8-1.47.09-.19.05-.35-.02-.49s-.57-1.37-.78-1.87c-.2-.49-.41-.42-.57-.43h-.48c-.17 0-.44.06-.67.31s-.88.86-.88 2.09.9 2.43 1.03 2.6c.13.17 1.77 2.71 4.3 3.8.6.26 1.07.41 1.43.52.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.2-.58.2-1.08.14-1.18-.06-.1-.22-.16-.47-.28zM12.05 21.78a9.73 9.73 0 0 1-4.97-1.36L4 21.5l1.1-4c-.87-1.52-1.33-3.24-1.33-5.02C3.77 7.06 7.51 3.32 12.05 3.32c2.22 0 4.3.87 5.87 2.44a8.24 8.24 0 0 1 2.43 5.87c0 4.54-3.74 8.15-8.3 8.15zm0-17.38C6.7 4.4 2.35 8.74 2.35 14c0 1.97.57 3.9 1.66 5.57L2 22l2.54-1.97C6.17 21.32 8.07 22 10 22c5.28 0 9.6-4.32 9.6-9.6 0-2.56-1-4.97-2.8-6.77A9.54 9.54 0 0 0 12.05 4.4z"/>
          </svg>
          Enviar pedido pelo WhatsApp
        </a>
      </div>

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
              src="${escapeAttr(productImageUrl(p.imagem))}"
              alt=""
              loading="lazy"
              onerror="this.src='https://placehold.co/96x96/e8f0fe/1a3a6b?text=Foto'"
            />
          </div>
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

  const adminDeliveryRows = checkoutOptions.deliveryOptions
    .map(
      (o) => `
      <tr data-co-delivery="${escapeAttr(o.id)}">
        <td><input type="text" class="co-inp-delivery-title" value="${escapeAttr(o.title)}" /></td>
        <td><input type="text" class="co-inp-delivery-desc" value="${escapeAttr(o.description)}" placeholder="Texto se não marcar end. cliente" /></td>
        <td><input type="checkbox" class="co-inp-delivery-addr" ${o.showCustomerAddress ? 'checked' : ''} title="Mostrar endereço do cliente na finalização" /></td>
        <td><button type="button" class="btn tiny danger" data-action="co-remove-delivery" data-id="${escapeAttr(o.id)}">Excluir</button></td>
      </tr>`
    )
    .join('')

  const adminPaymentRows = checkoutOptions.paymentOptions
    .map(
      (o) => `
      <tr data-co-payment="${escapeAttr(o.id)}">
        <td><input type="text" class="co-inp-payment-title" value="${escapeAttr(o.title)}" /></td>
        <td><input type="text" class="co-inp-payment-detail" value="${escapeAttr(o.detail)}" /></td>
        <td><input type="checkbox" class="co-inp-payment-cash" ${o.asksCashChange ? 'checked' : ''} title="Exibir campo de troco opcional" /></td>
        <td><button type="button" class="btn tiny danger" data-action="co-remove-payment" data-id="${escapeAttr(o.id)}">Excluir</button></td>
      </tr>`
    )
    .join('')

  return `
    <section class="screen fade-in">
      <div class="card">
        <p class="eyebrow">Painel administrativo</p>
        <h1>Gerenciar Produtos</h1>
        <p class="lead">Cadastre peças da sua loja de roupas. Tudo fica salvo neste navegador até você publicar com servidor.</p>
      </div>

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
            <textarea name="descricaoEmpresa" rows="3" maxlength="2000" placeholder="Conte um pouco da história ou do estilo da loja…">${escapeHtml(b.descricaoEmpresa)}</textarea>
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
        <h2>Pagamento e Entrega</h2>
        <p class="muted small" style="margin-bottom: 12px;">
          Opções exibidas na finalização do pedido. Inclua, edite ou exclua linhas; use <strong>Salvar</strong> para aplicar.
          Em entrega, <strong>End. cliente</strong> mostra o endereço cadastrado. Em pagamento, <strong>Troco</strong> ativa o campo de troco (ex.: dinheiro).
        </p>
        <h3 class="checkout-admin-subh">Modalidades de entrega / retirada</h3>
        <div class="table-wrap">
          <table class="admin-table admin-checkout-table">
            <thead><tr><th>Título</th><th>Descrição auxiliar</th><th>End. cliente</th><th></th></tr></thead>
            <tbody id="co-delivery-tbody">${adminDeliveryRows}</tbody>
          </table>
        </div>
        <button type="button" class="btn" id="co-add-delivery" style="margin-bottom: 18px;">+ Adicionar modalidade</button>

        <h3 class="checkout-admin-subh">Formas de pagamento</h3>
        <div class="table-wrap">
          <table class="admin-table admin-checkout-table">
            <thead><tr><th>Título</th><th>Detalhe ao cliente</th><th>Troco</th><th></th></tr></thead>
            <tbody id="co-payment-tbody">${adminPaymentRows}</tbody>
          </table>
        </div>
        <button type="button" class="btn" id="co-add-payment" style="margin-bottom: 18px;">+ Adicionar forma de pagamento</button>

        <div class="actions" style="flex-wrap: wrap; gap: 10px;">
          <button type="button" class="btn primary" id="co-save">Salvar Pagamento e Entrega</button>
          <button type="button" class="btn" id="co-reset-default">Restaurar opções padrão</button>
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
          <div class="full admin-photo-block">
            <p class="muted small" style="margin-bottom: 8px;">Foto da peça — use a galeria, arquivos do computador ou a câmera do celular.</p>
            <div class="admin-photo-actions">
              <button type="button" class="btn" id="admin-pick-gallery">📁 Galeria ou arquivo</button>
              <button type="button" class="btn" id="admin-pick-camera">📷 Tirar foto</button>
              <button type="button" class="btn tiny danger" id="admin-clear-photo">Remover foto</button>
            </div>
            <input type="file" id="admin-product-file-gallery" accept="image/*" class="visually-hidden" tabindex="-1" aria-hidden="true" />
            <input type="file" id="admin-product-file-camera" accept="image/*" capture="environment" class="visually-hidden" tabindex="-1" aria-hidden="true" />
            <div class="admin-photo-preview-wrap">
              <img id="admin-product-preview" class="admin-product-preview" alt="Pré-visualização"
                ${adminPendingImageDataUrl ? `src="${escapeAttr(adminPendingImageDataUrl)}"` : 'hidden'}
                style="max-height: 200px; border-radius: 12px; object-fit: contain; ${adminPendingImageDataUrl ? '' : 'display: none;'}" />
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
            <thead><tr><th>Foto</th><th>Nome</th><th>Marca</th><th>Categoria</th><th>Preço</th><th>Ações</th></tr></thead>
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
            <p><strong>Marca:</strong> ${escapeHtml(fichaProduto.marca)}</p>
            <p><strong>Categoria:</strong> ${escapeHtml(fichaProduto.categoria)}${fichaProduto.subcategoria ? ` · ${escapeHtml(fichaProduto.subcategoria)}` : ''}</p>
            <p><strong>Preço:</strong> ${currency.format(fichaProduto.preco)}</p>
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

  return `
    <div class="app-shell">
      <header class="topbar">
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
      </header>
      ${backStep ? '<button class="btn floating-back" id="floating-back" aria-label="Voltar para a página anterior">← Voltar</button>' : ''}
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
      render()
    })
  })
  document.getElementById('close-ficha')?.addEventListener('click', () => {
    appState.fichaTecnicaId = null
    render()
  })
  document.getElementById('ficha-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      appState.fichaTecnicaId = null
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
    if (!get('nomeCompleto') || !get('nomeOficina') || !get('enderecoCompleto') || !get('email') || !get('whatsapp')) {
      alert('Preencha todos os campos obrigatórios (*).')
      return
    }
    if (!isValidWhatsapp(get('whatsapp'))) {
      alert('Informe o WhatsApp no formato (00) 00000-0000.')
      whatsappInput?.focus()
      return
    }
    appState.customer = {
      cpf: cpfDigits,
      nomeCompleto: get('nomeCompleto'),
      nomeOficina: get('nomeOficina'),
      enderecoCompleto: get('enderecoCompleto'),
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
  })
  document.getElementById('category-filter')?.addEventListener('change', (e) => {
    appState.filtroCategoria = (e.target as HTMLSelectElement).value as 'todas' | Category
    refreshCatalogGrid()
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

  const checkoutForm = document.getElementById('checkout-form') as HTMLFormElement | null
  checkoutForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const selected = document.querySelector<HTMLInputElement>('input[name="deliveryMode"]:checked')
    const selectedPayment = document.querySelector<HTMLInputElement>('input[name="paymentMethod"]:checked')
    appState.deliveryMode = clampDeliveryModeId(selected?.value)
    appState.paymentMethod = clampPaymentMethodId(selectedPayment?.value)

    const payOpt = getPaymentOption(appState.paymentMethod)
    if (payOpt?.asksCashChange && appState.cashChangeFor) {
      const changeValue = Number(appState.cashChangeFor)
      if (Number.isNaN(changeValue) || changeValue < cartTotal()) {
        alert(`O valor de troco deve ser maior ou igual ao total do pedido (${currency.format(cartTotal())}).`)
        cashChangeInput?.focus()
        return
      }
    }

    appState.pedidoNumero = gerarNumeroPedido()
    setStep('concluido')
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
    checkoutOptions = next
    saveCheckoutOptions(checkoutOptions)
    appState.deliveryMode = clampDeliveryModeId(appState.deliveryMode)
    appState.paymentMethod = clampPaymentMethodId(appState.paymentMethod)
    persistState()
    render()
  })

  document.getElementById('co-reset-default')?.addEventListener('click', () => {
    if (!confirm('Restaurar as opções de pagamento e entrega padrão?')) return
    checkoutOptions = JSON.parse(JSON.stringify(DEFAULT_CHECKOUT_OPTIONS)) as CheckoutOptions
    saveCheckoutOptions(checkoutOptions)
    appState.deliveryMode = clampDeliveryModeId(appState.deliveryMode)
    appState.paymentMethod = clampPaymentMethodId(appState.paymentMethod)
    persistState()
    render()
  })

  document.getElementById('co-add-delivery')?.addEventListener('click', () => {
    checkoutOptions.deliveryOptions.push(
      normalizeDeliveryOption({
        id: `del-${Date.now()}`,
        title: 'Nova modalidade',
        description: '',
        showCustomerAddress: false
      })
    )
    saveCheckoutOptions(checkoutOptions)
    render()
  })

  document.getElementById('co-add-payment')?.addEventListener('click', () => {
    checkoutOptions.paymentOptions.push(
      normalizePaymentOption({
        id: `pay-${Date.now()}`,
        title: 'Nova forma de pagamento',
        detail: '',
        asksCashChange: false
      })
    )
    saveCheckoutOptions(checkoutOptions)
    render()
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="co-remove-delivery"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      if (!id) return
      if (checkoutOptions.deliveryOptions.length <= 1) {
        alert('Mantenha pelo menos uma modalidade de entrega.')
        return
      }
      if (!confirm('Excluir esta modalidade?')) return
      checkoutOptions.deliveryOptions = checkoutOptions.deliveryOptions.filter((o) => o.id !== id)
      saveCheckoutOptions(checkoutOptions)
      appState.deliveryMode = clampDeliveryModeId(appState.deliveryMode)
      persistState()
      render()
    })
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="co-remove-payment"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      if (!id) return
      if (checkoutOptions.paymentOptions.length <= 1) {
        alert('Mantenha pelo menos uma forma de pagamento.')
        return
      }
      if (!confirm('Excluir esta forma de pagamento?')) return
      checkoutOptions.paymentOptions = checkoutOptions.paymentOptions.filter((o) => o.id !== id)
      saveCheckoutOptions(checkoutOptions)
      appState.paymentMethod = clampPaymentMethodId(appState.paymentMethod)
      persistState()
      render()
    })
  })

  // Admin – fotos do produto (galeria, arquivo ou câmera)
  const adminFileGallery = document.getElementById('admin-product-file-gallery') as HTMLInputElement | null
  const adminFileCamera = document.getElementById('admin-product-file-camera') as HTMLInputElement | null
  const adminPickGallery = document.getElementById('admin-pick-gallery')
  const adminPickCamera = document.getElementById('admin-pick-camera')
  const adminClearPhoto = document.getElementById('admin-clear-photo')
  const adminPreview = document.getElementById('admin-product-preview') as HTMLImageElement | null

  const applyAdminPreview = (dataUrl: string) => {
    if (dataUrl.length > 6_500_000) {
      alert('Esta imagem é grande demais para guardar no navegador. Reduza o tamanho do arquivo.')
      return
    }
    adminPendingImageDataUrl = dataUrl
    if (adminPreview) {
      adminPreview.removeAttribute('hidden')
      adminPreview.src = dataUrl
      adminPreview.style.display = 'block'
    }
  }

  const readAdminImageFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') applyAdminPreview(reader.result)
    }
    reader.readAsDataURL(file)
  }

  adminPickGallery?.addEventListener('click', () => adminFileGallery?.click())
  adminPickCamera?.addEventListener('click', () => adminFileCamera?.click())
  adminFileGallery?.addEventListener('change', () => {
    readAdminImageFile(adminFileGallery.files?.[0])
    adminFileGallery.value = ''
  })
  adminFileCamera?.addEventListener('change', () => {
    readAdminImageFile(adminFileCamera.files?.[0])
    adminFileCamera.value = ''
  })
  adminClearPhoto?.addEventListener('click', () => {
    adminPendingImageDataUrl = null
    if (adminPreview) {
      adminPreview.removeAttribute('src')
      adminPreview.setAttribute('hidden', '')
      adminPreview.style.display = 'none'
    }
  })

  // Admin – adicionar produto
  const adminForm = document.getElementById('admin-form') as HTMLFormElement | null
  adminForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const fd = new FormData(adminForm)
    const get = (k: string) => String(fd.get(k) ?? '').trim()
    const nome = get('nome')
    const marca = get('marca')
    const categoria = get('categoria') as Category
    const preco = parseFloat(get('preco'))
    const uso = get('uso')
    if (!nome || !marca || !categoria || isNaN(preco) || !uso) {
      alert('Preencha os campos obrigatórios do produto.')
      return
    }
    const imagem =
      adminPendingImageDataUrl ||
      'https://placehold.co/400x220/e8f0fe/1a3a6b?text=Foto'
    const newProduct: Product = {
      id: `custom-${Date.now()}`,
      nome,
      marca,
      categoria,
      subcategoria: get('subcategoria') || undefined,
      preco,
      imagem,
      uso,
      custom: true,
      modelo: false
    }
    products = [...products, newProduct]
    saveProducts(products)
    adminPendingImageDataUrl = null
    adminForm.reset()
    render()
  })

  // Admin – excluir produto
  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-delete"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index)
      if (confirm(`Remover "${products[idx]?.nome}"?`)) {
        products = products.filter((_, i) => i !== idx)
        saveProducts(products)
        render()
      }
    })
  })

  // Admin – editar preço
  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-save-price"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index)
      const input = document.querySelector<HTMLInputElement>(`[data-action="admin-price"][data-index="${idx}"]`)
      const nextPrice = Number(input?.value)
      if (!input || Number.isNaN(nextPrice) || nextPrice < 0) {
        alert('Informe um preço válido para salvar.')
        input?.focus()
        return
      }
      products[idx] = { ...products[idx], preco: nextPrice }
      saveProducts(products)
      render()
    })
  })

  // Admin – remover só peças de exemplo (modelo)
  document.getElementById('remove-modelo-products')?.addEventListener('click', () => {
    const n = products.filter((p) => p.modelo).length
    if (n === 0) return
    if (!confirm(`Remover ${n} peça(s) de exemplo do catálogo? Elas deixam de aparecer para o cliente.`)) {
      return
    }
    products = products.filter((p) => !p.modelo)
    localStorage.setItem(STORAGE_KEYS.modelosExemplosRemovidos, '1')
    saveProducts(products)
    render()
  })

  // Admin – esvaziar catálogo
  document.getElementById('reset-products')?.addEventListener('click', () => {
    if (confirm('Remover todos os produtos cadastrados? Esta ação não pode ser desfeita.')) {
      products = []
      localStorage.setItem(STORAGE_KEYS.modelosExemplosRemovidos, '1')
      saveProducts(products)
      render()
    }
  })

  document.getElementById('back-from-admin')?.addEventListener('click', () => setStep('catalogo'))
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  app.innerHTML = template()
  bindEvents()
}

render()
