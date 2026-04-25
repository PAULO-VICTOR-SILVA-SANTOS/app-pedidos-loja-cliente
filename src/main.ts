import './style.css'
import * as storeApi from './api/storeApi'
import { finalizeAdminProductImages } from './utils/adminImages'
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
/** Estoque por tamanho ≤ este valor dispara alerta no painel admin (sincronização com API). */
const ADMIN_STOCK_ALERT_MIN = 2
/** Intervalo do polling de estoque no admin quando `shouldSyncProductsToApi()` é verdadeiro. */
const ADMIN_STOCK_POLL_MS = 20_000
const ADMIN_STOCK_POLL_SEC = ADMIN_STOCK_POLL_MS / 1000
/** Intervalo para sincronizar o catálogo no cliente com GET /produtos. */
const CATALOG_SYNC_POLL_MS = 20_000
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

type PieceSize = 'PP' | 'P' | 'M' | 'G' | 'GG' | '36' | '37' | '38' | '39' | '40' | '41' | '42' | '43' | '44' | '45'
const APPAREL_SIZES: PieceSize[] = ['PP', 'P', 'M', 'G', 'GG']
const SHOE_SIZES: PieceSize[] = ['36', '37', '38', '39', '40', '41', '42', '43', '44', '45']
const DEFAULT_PIECE_SIZE: PieceSize = 'M'
const CART_KEY_SEPARATOR = '::size::'

type Product = {
  id: string
  nome: string
  marca: string
  categoria: Category
  subcategoria?: string
  preco: number
  /** URLs ou data URLs; frente, costas, lateral… (máx. 10). */
  imagens: string[]
  /** Unidades por tamanho (ex.: P: 3, M: 4, G: 2). */
  estoquePorTamanho: Partial<Record<PieceSize, number>>
  /** Soma do estoque por tamanho (compatível com dados antigos só com número único). */
  estoque: number
  uso: string
  /** Tamanhos disponíveis para o cliente escolher no catálogo. */
  tamanhos: PieceSize[]
  custom?: boolean // adicionado pelo admin
  /** Peça de exemplo (imagens em /modelos/); pode remover no painel */
  modelo?: boolean
}

function splitLegacyEstoqueTotal(total: number, tamanhos: PieceSize[]): Partial<Record<PieceSize, number>> {
  const le = Math.max(0, Math.floor(total))
  const n = tamanhos.length || 1
  const base = Math.floor(le / n)
  let rem = le - base * n
  const out: Partial<Record<PieceSize, number>> = {}
  for (const sz of tamanhos) {
    out[sz] = base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem--
  }
  return out
}

function totalEstoqueFromMap(m: Partial<Record<PieceSize, number>>, tamanhos: PieceSize[]): number {
  return tamanhos.reduce((s, t) => s + Math.max(0, Math.floor(Number(m[t] ?? 0))), 0)
}

function normalizeEstoquePorTamanhoRecord(
  raw: unknown,
  tamanhos: PieceSize[],
  legacyEstoque: number
): Partial<Record<PieceSize, number>> {
  const out: Partial<Record<PieceSize, number>> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    for (const sz of tamanhos) {
      const v = Number(o[sz])
      out[sz] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
    }
    return out
  }
  return splitLegacyEstoqueTotal(legacyEstoque, tamanhos)
}

function stockForSize(p: Product, size: PieceSize): number {
  return Math.max(0, Math.floor(Number(p.estoquePorTamanho?.[size] ?? 0)))
}

function adminStockMonitorKey(productId: string, size: string): string {
  return `${productId}:${size}`
}

function buildAdminStockSnapshot(list: Product[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of list) {
    const sizes = p.tamanhos.length ? p.tamanhos : productSizesForCategory(p.categoria)
    for (const sz of sizes) {
      m.set(adminStockMonitorKey(p.id, sz), stockForSize(p, sz))
    }
  }
  return m
}

type LowStockLine = { nome: string; size: string; qty: number }

function findLowStockEntries(list: Product[], maxUnits: number): LowStockLine[] {
  const out: LowStockLine[] = []
  for (const p of list) {
    const sizes = p.tamanhos.length ? p.tamanhos : productSizesForCategory(p.categoria)
    for (const sz of sizes) {
      const q = stockForSize(p, sz)
      if (q <= maxUnits) {
        out.push({ nome: p.nome, size: sz, qty: q })
      }
    }
  }
  out.sort(
    (a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR') || a.size.localeCompare(b.size, 'pt-BR', { numeric: true })
  )
  return out
}

/** Para o timer. Só use `resetSnapshot` ao sair do painel admin — ao re-renderizar no admin o snapshot é mantido para detectar quedas de estoque. */
function stopAdminStockPolling(resetSnapshot = false) {
  if (adminStockPollTimer !== null) {
    clearInterval(adminStockPollTimer)
    adminStockPollTimer = null
  }
  if (resetSnapshot) {
    adminStockLastSnapshot = new Map()
  }
}

function updateAdminStockAlertPanel(list: Product[]) {
  const box = document.getElementById('admin-stock-alert-list')
  const status = document.getElementById('admin-stock-poll-status')
  if (!box) return
  const lows = findLowStockEntries(list, ADMIN_STOCK_ALERT_MIN)
  if (!lows.length) {
    box.innerHTML = `<p class="muted small">Nenhum tamanho com estoque ≤ ${ADMIN_STOCK_ALERT_MIN} neste momento.</p>`
  } else {
    box.innerHTML = `<ul class="admin-stock-alert-ul">${lows
      .map(
        (l) =>
          `<li><strong>${escapeHtml(l.nome)}</strong> (${escapeHtml(l.size)}): <strong>${l.qty}</strong> un.</li>`
      )
      .join('')}</ul>`
  }
  if (status) {
    status.textContent = `Última verificação: ${new Date().toLocaleTimeString('pt-BR')}`
  }
}

function applyProductStockToAdminInputs(list: Product[]) {
  const byId = new Map(list.map((p) => [p.id, p]))
  document.querySelectorAll<HTMLInputElement>('.stock-edit-input[data-action="admin-stock-size"]').forEach((input) => {
    const id = input.dataset.productId
    const sz = input.dataset.size as PieceSize | undefined
    if (!id || !sz) return
    const p = byId.get(id)
    if (!p) return
    input.value = String(stockForSize(p, sz))
  })
}

function refreshAdminStockNotifyButtonState() {
  const btn = document.getElementById('admin-stock-enable-notify') as HTMLButtonElement | null
  const status = document.getElementById('admin-stock-notify-status')
  if (!btn || !status) return
  if (typeof Notification === 'undefined') {
    btn.style.display = 'none'
    status.textContent = 'Notificações não disponíveis neste navegador.'
    return
  }
  btn.style.display = ''
  if (Notification.permission === 'granted') {
    btn.textContent = 'Avisos ativos ✓'
    btn.disabled = true
    status.textContent = 'Alertas do sistema quando o estoque cruza o limite.'
  } else if (Notification.permission === 'denied') {
    btn.textContent = 'Notificações bloqueadas'
    btn.disabled = true
    status.textContent = 'Permita notificações nas configurações do navegador para este site.'
  } else {
    btn.textContent = 'Permitir avisos do navegador'
    btn.disabled = false
    status.textContent = ''
  }
}

function bindAdminStockMonitorUi() {
  refreshAdminStockNotifyButtonState()
  const notifyBtn = document.getElementById('admin-stock-enable-notify')
  if (notifyBtn && !notifyBtn.dataset.stockNotifyBound) {
    notifyBtn.dataset.stockNotifyBound = '1'
    notifyBtn.addEventListener('click', async () => {
      if (typeof Notification === 'undefined') return
      const perm = await Notification.requestPermission()
      refreshAdminStockNotifyButtonState()
      if (perm === 'granted') {
        try {
          new Notification('Estoque — alertas ativos', {
            body: `Avisaremos quando algum tamanho passar a ter até ${ADMIN_STOCK_ALERT_MIN} unidades.`
          })
        } catch {
          /* ignore */
        }
      }
    })
  }
}

async function adminStockPollTick() {
  if (appState.step !== 'admin' || !shouldSyncProductsToApi()) return
  if (adminStockPollInFlight) return
  adminStockPollInFlight = true
  try {
    const data = await storeApi.fetchProdutos(12000)
    if (data === null || !Array.isArray(data)) return
    const next = data.map(normalizeProduct)
    const prevSnap = adminStockLastSnapshot
    const newSnap = buildAdminStockSnapshot(next)

    if (prevSnap.size > 0 && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const [key, newQty] of newSnap) {
        const oldQty = prevSnap.get(key)
        if (oldQty !== undefined && oldQty > ADMIN_STOCK_ALERT_MIN && newQty <= ADMIN_STOCK_ALERT_MIN) {
          const colon = key.indexOf(':')
          const id = colon >= 0 ? key.slice(0, colon) : key
          const sz = colon >= 0 ? key.slice(colon + 1) : ''
          const p = next.find((x) => x.id === id)
          if (p && sz) {
            try {
              new Notification('Estoque baixo', {
                body: `${p.nome} (${sz}): ${newQty} un. — limite ${ADMIN_STOCK_ALERT_MIN}`,
                tag: `stock-${key}`
              })
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    adminStockLastSnapshot = newSnap
    products = next
    saveProducts(products)
    syncCartWithStock()
    persistState()
    updateAdminStockAlertPanel(next)
    applyProductStockToAdminInputs(next)
    const draftImagesUpdated = syncPendingAfterProductListUpdate()
    if (draftImagesUpdated && appState.step === 'admin') refreshAdminPhotoDraftUi()
  } finally {
    adminStockPollInFlight = false
  }
}

function startAdminStockPolling() {
  stopAdminStockPolling(false)
  if (appState.step !== 'admin' || !shouldSyncProductsToApi()) return
  void adminStockPollTick()
  adminStockPollTimer = setInterval(() => void adminStockPollTick(), ADMIN_STOCK_POLL_MS)
}

function catalogSyncFingerprint(list: Product[]): string {
  return JSON.stringify(
    list.map((p) => ({
      id: p.id,
      nome: p.nome,
      preco: p.preco,
      imagens: p.imagens,
      tamanhos: p.tamanhos,
      estoque: p.estoque,
      estoquePorTamanho: p.estoquePorTamanho
    }))
  )
}

function stopCatalogSyncPolling() {
  if (catalogSyncPollTimer !== null) {
    clearInterval(catalogSyncPollTimer)
    catalogSyncPollTimer = null
  }
}

async function catalogSyncPollTick() {
  if (appState.step !== 'catalogo' || !shouldSyncProductsToApi()) return
  if (catalogSyncPollInFlight) return
  catalogSyncPollInFlight = true
  try {
    const data = await storeApi.fetchProdutos(12000)
    if (data === null || !Array.isArray(data)) return
    const next = data.map(normalizeProduct)
    if (catalogSyncFingerprint(next) === catalogSyncFingerprint(products)) return
    products = next
    saveProducts(products)
    syncCartWithStock()
    persistState()
    render()
  } finally {
    catalogSyncPollInFlight = false
  }
}

function startCatalogSyncPolling() {
  stopCatalogSyncPolling()
  if (appState.step !== 'catalogo' || !shouldSyncProductsToApi()) return
  void catalogSyncPollTick()
  catalogSyncPollTimer = setInterval(() => void catalogSyncPollTick(), CATALOG_SYNC_POLL_MS)
}

function productHasAnyStock(p: Product): boolean {
  return p.tamanhos.some((t) => stockForSize(p, t) > 0)
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
  const base: Array<Omit<Product, 'tamanhos' | 'estoquePorTamanho'>> = [
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
  return base.map((p) => {
    const tamanhos = [...APPAREL_SIZES]
    const estoquePorTamanho = splitLegacyEstoqueTotal(p.estoque, tamanhos)
    const estoque = totalEstoqueFromMap(estoquePorTamanho, tamanhos)
    return { ...p, tamanhos, estoquePorTamanho, estoque }
  })
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

/** Taxa de entrega padrão (R$) no painel; editável a qualquer momento. Só entra no total com “Cobrar taxa…” ativo. */
const DEFAULT_DELIVERY_FEE_REAIS = 5

const DEFAULT_CHECKOUT_OPTIONS: CheckoutOptions = applyPaymentFlagsToOptions(
  applyDeliveryFlagsToOptions({
    pickupEnabled: true,
    deliveryEnabled: true,
    deliveryFeeEnabled: false,
    deliveryFee: DEFAULT_DELIVERY_FEE_REAIS,
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
  /** Legado (não editável no admin); mantido só para compatibilidade com JSON antigo. */
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

/** Índice vindo de `data-index` (evita ambiguidade com `Number('0') || 0`). */
function parseDataIndex(raw: string | undefined): number {
  const n = Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
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
      ramoEmpresa: '',
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
    s.descricaoEmpresa.trim() || s.enderecoEmpresa.trim() || s.telefoneEmpresa.trim()
  )
}

/** Bloco opcional “Sobre a loja” para o cliente (cadastro / catálogo). */
function storeAboutCardHtml(): string {
  if (!hasStoreExtraInfo()) return ''
  const s = storeBranding
  const d = s.descricaoEmpresa.trim()
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

function normalizeSize(raw: unknown): PieceSize | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toUpperCase()
  if (
    v === 'PP' ||
    v === 'P' ||
    v === 'M' ||
    v === 'G' ||
    v === 'GG' ||
    v === '36' ||
    v === '37' ||
    v === '38' ||
    v === '39' ||
    v === '40' ||
    v === '41' ||
    v === '42' ||
    v === '43' ||
    v === '44' ||
    v === '45'
  ) {
    return v
  }
  return null
}

function productSizesForCategory(category: Category): PieceSize[] {
  return category === 'Calçados' ? [...SHOE_SIZES] : [...APPAREL_SIZES]
}

/** Campos numéricos de estoque por tamanho no formulário admin (`name="estoque_${sz}"`). */
function adminEstoqueGridFieldsHtml(
  sizes: PieceSize[],
  estoquePorTamanho: Partial<Record<PieceSize, number>> | undefined
): string {
  return sizes
    .map((sz) => {
      const v = Math.max(0, Math.floor(Number(estoquePorTamanho?.[sz] ?? 0)))
      return `
      <label class="admin-estoque-cell">
        <span class="admin-estoque-sz">${escapeHtml(sz)}</span>
        <input
          type="number"
          min="0"
          step="1"
          name="estoque_${sz}"
          data-estoque-size="${escapeAttr(sz)}"
          value="${v}"
          aria-label="Estoque tamanho ${escapeAttr(sz)}"
        />
      </label>`
    })
    .join('')
}

function readFormEstoquePorTamanho(form: HTMLFormElement, sizes: PieceSize[]): Partial<Record<PieceSize, number>> {
  const out: Partial<Record<PieceSize, number>> = {}
  for (const sz of sizes) {
    const el = form.querySelector<HTMLInputElement>(`input[name="estoque_${sz}"]`)
    out[sz] = Math.max(0, Math.floor(Number(el?.value ?? 0)))
  }
  return out
}

function fichaEstoqueDetalheHtml(p: Product): string {
  const sizes = p.tamanhos.length ? p.tamanhos : productSizesForCategory(p.categoria)
  const parts = sizes.map((sz) => `${sz}: ${stockForSize(p, sz)}`)
  return `${p.estoque} un. no total (${parts.join(' · ')})`
}

function adminTableStockRowHtml(p: Product, rowIndex: number): string {
  const sizes = p.tamanhos.length ? p.tamanhos : productSizesForCategory(p.categoria)
  return `<div class="admin-stock-row admin-estoque-grid compact" role="group" aria-label="Estoque por tamanho de ${escapeAttr(p.nome)}">
    ${sizes
      .map(
        (sz) => `
      <label class="admin-estoque-cell">
        <span class="admin-estoque-sz">${escapeHtml(sz)}</span>
        <input
          type="number"
          min="0"
          step="1"
          class="stock-edit-input"
          value="${stockForSize(p, sz)}"
          data-action="admin-stock-size"
          data-index="${rowIndex}"
          data-product-id="${escapeAttr(p.id)}"
          data-size="${escapeAttr(sz)}"
          aria-label="Estoque ${escapeAttr(sz)} de ${escapeAttr(p.nome)}"
        />
      </label>`
      )
      .join('')}
  </div>`
}

function normalizeProductSizes(raw: unknown, category: Category): PieceSize[] {
  const allowed = productSizesForCategory(category)
  if (!Array.isArray(raw)) return allowed
  const set = new Set<PieceSize>()
  for (const item of raw) {
    const size = normalizeSize(item)
    if (size && allowed.includes(size)) set.add(size)
  }
  return set.size > 0 ? allowed.filter((size) => set.has(size)) : allowed
}

function normalizeProduct(raw: unknown): Product {
  const p = raw as Partial<Product> & { imagem?: unknown; tamanhos?: unknown; estoquePorTamanho?: unknown }
  let imagens: string[] = []
  if (Array.isArray(p.imagens)) {
    imagens = p.imagens
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, MAX_PRODUCT_IMAGES)
  }
  const legacyImg = typeof p.imagem === 'string' ? p.imagem.trim() : ''
  if (!imagens.length && legacyImg) imagens = [legacyImg]

  let legacyEstoque: number
  if (typeof p.estoque === 'number' && !Number.isNaN(p.estoque)) {
    legacyEstoque = Math.max(0, Math.floor(p.estoque))
  } else {
    legacyEstoque = LEGACY_DEFAULT_ESTOQUE
  }

  const cat = normalizeCategory(p.categoria)
  const tamanhos = normalizeProductSizes(p.tamanhos, cat)
  const estoquePorTamanho = normalizeEstoquePorTamanhoRecord(p.estoquePorTamanho, tamanhos, legacyEstoque)
  const estoque = totalEstoqueFromMap(estoquePorTamanho, tamanhos)

  return {
    id: String(p.id ?? `item-${Date.now()}`),
    nome: String(p.nome ?? 'Produto'),
    marca: String(p.marca ?? '—'),
    categoria: cat,
    subcategoria: typeof p.subcategoria === 'string' && p.subcategoria.trim() ? p.subcategoria.trim() : undefined,
    preco: typeof p.preco === 'number' && !Number.isNaN(p.preco) ? p.preco : 0,
    imagens,
    estoquePorTamanho,
    estoque,
    uso: String(p.uso ?? ''),
    tamanhos,
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
  try {
    localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(list))
  } catch (err) {
    // Evita quebrar o cadastro quando o navegador estoura quota (comum com fotos em data URL no mobile).
    console.warn('Falha ao salvar catálogo no localStorage; seguindo com dados em memória/API.', err)
  }
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

const savedStep = normalizePersistedStep(saved.step)
const pedidoNumeroInit = typeof saved.pedidoNumero === 'string' ? saved.pedidoNumero : ''
/**
 * Se já existe pedido finalizado salvo no estado persistido, na próxima abertura
 * começamos um novo fluxo (cadastro + carrinho vazios).
 */
const shouldStartFreshAfterCompletedOrder = Boolean(pedidoNumeroInit.trim()) && savedStep === 'concluido'

const savedCust = shouldStartFreshAfterCompletedOrder ? undefined : (saved.customer as Partial<Customer> | undefined)
const customerMerged: Customer = {
  ...emptyCustomer(),
  ...(savedCust ?? {}),
  cpf: normalizeCpfDigits(String(savedCust?.cpf ?? ''))
}

const cartMerged: Record<string, number> =
  !shouldStartFreshAfterCompletedOrder &&
  saved.cart &&
  typeof saved.cart === 'object' &&
  !Array.isArray(saved.cart)
    ? { ...(saved.cart as Record<string, number>) }
    : {}

const hasName = Boolean(customerMerged.nomeCompleto.trim())
const savedPrev = normalizePersistedStep(saved.prevStep)
let initialStep: Step =
  shouldStartFreshAfterCompletedOrder
    ? 'cadastro'
    : savedStep !== undefined
      ? savedStep
      : hasName
        ? 'catalogo'
        : 'cadastro'
let initialPrev: Step = savedPrev !== undefined ? savedPrev : 'catalogo'

const deliveryModeInit = clampDeliveryModeId(saved.deliveryMode)
const paymentMethodInit = clampPaymentMethodId(saved.paymentMethod)
const filtroBuscaInit = typeof saved.filtroBusca === 'string' ? saved.filtroBusca : ''
const filtroCategoriaInit = normalizeFiltroCatPersist(saved.filtroCategoria)
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

/** Mensagem no catálogo quando não foi possível substituir a lista pelo GET /produtos (senão o usuário vê só peças modelo). */
let apiCatalogSyncMessage: string | null = null

applyDocumentBranding()

/**
 * Sincroniza produtos (e upload de fotos) com a API / MongoDB.
 * Em `npm run dev` sempre ativo. Em build de produção fica ativo por padrão;
 * defina `VITE_SYNC_PRODUCTS_FROM_API=false` só se o front for hospedado sem API (ex.: GitHub Pages puro).
 */
function shouldSyncProductsToApi(): boolean {
  if (import.meta.env.DEV) return true
  return import.meta.env.VITE_SYNC_PRODUCTS_FROM_API !== 'false'
}

function shouldTryServerUpload(): boolean {
  return shouldSyncProductsToApi()
}

/** Ao carregar o app, se a sincronização estiver ativa, substitui o catálogo pelo GET /produtos. */
async function tryReplaceProductsFromApiIfDev() {
  if (!shouldSyncProductsToApi()) {
    apiCatalogSyncMessage = null
    return
  }

  const origin = storeApi.apiOrigin()
  const prod = import.meta.env.PROD

  if (!origin && prod) {
    apiCatalogSyncMessage =
      'Este site foi publicado sem VITE_API_URL: o navegador não sabe onde está sua API, então não baixa o catálogo do MongoDB. Você acaba vendo só as peças de exemplo (fotos antigas do sistema). Corrija na Vercel em Settings → Environment Variables: adicione VITE_API_URL = https://sua-api.onrender.com (sem barra no final), salve e faça Redeploy. No celular pode parecer normal se o app já tinha dados salvos antes.'
    render()
    return
  }

  const data = await storeApi.fetchProdutos(12000)
  if (data === null) {
    apiCatalogSyncMessage = prod
      ? origin
        ? `Não foi possível carregar ${origin}/produtos (API fora do ar, bloqueio de rede ou CORS). O catálogo exibido pode ser só de exemplo ou desatualizado.`
        : 'Não foi possível sincronizar o catálogo com o servidor.'
      : 'Não foi possível carregar /produtos. Rode a API (npm run server) ou npm run dev:all no projeto.'
    render()
    return
  }

  apiCatalogSyncMessage = null
  products = data.map(normalizeProduct)
  saveProducts(products)
  syncPendingAfterProductListUpdate()
  render()
}

/** Recarrega o catálogo a partir do GET /produtos (ex.: após pedido ou alteração no admin). */
async function refreshProductsFromApi(): Promise<boolean> {
  const data = await storeApi.fetchProdutos(8000)
  if (data === null) return false
  apiCatalogSyncMessage = null
  products = data.map(normalizeProduct)
  saveProducts(products)
  syncPendingAfterProductListUpdate()
  render()
  return true
}

function markAdminPhotoDraftDirty(): void {
  adminPhotoDraftDirty = true
}

function resetAdminPhotoDraftDirty(): void {
  adminPhotoDraftDirty = false
}

/**
 * Quando o catálogo é substituído pelo GET /produtos, mantém as miniaturas do admin alinhadas
 * ao produto em edição — mas só se o lojista ainda não tiver alterado fotos no rascunho.
 * Assim evita “trocar sozinho” imagens de PC vs celular e não sobrescreve remoções/adições locais.
 */
function syncPendingAfterProductListUpdate(): boolean {
  if (!adminEditingProductId || adminPhotoDraftDirty) return false
  const p = products.find((x) => x.id === adminEditingProductId)
  if (!p) return false
  const nextUrls = [...p.imagens].slice(0, MAX_PRODUCT_IMAGES)
  if (JSON.stringify(nextUrls) === JSON.stringify(adminPendingImageDataUrls)) return false
  adminPendingImageDataUrls = nextUrls
  return true
}

function adminPhotoThumbsHtml(): string {
  return adminPendingImageDataUrls
    .map(
      (url, idx) => `
                <div class="admin-thumb-cell">
                  <img src="${escapeAttr(url)}" alt="" />
                  <button type="button" class="btn tiny danger admin-thumb-remove" data-action="admin-remove-thumb" data-thumb-index="${idx}" aria-label="Remover foto">×</button>
                </div>`
    )
    .join('')
}

function refreshAdminPhotoDraftUi(): void {
  const countEl = document.getElementById('admin-photo-count')
  const wrap = document.getElementById('admin-photo-thumbs')
  if (countEl) countEl.textContent = `${adminPendingImageDataUrls.length}/${MAX_PRODUCT_IMAGES} fotos`
  if (!wrap) return
  wrap.innerHTML = adminPhotoThumbsHtml()
  wrap.querySelectorAll<HTMLButtonElement>('[data-action="admin-remove-thumb"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.thumbIndex)
      if (Number.isNaN(idx)) return
      markAdminPhotoDraftDirty()
      adminPendingImageDataUrls = adminPendingImageDataUrls.filter((_, i) => i !== idx)
      refreshAdminPhotoDraftUi()
    })
  })
}

/**
 * Fotos da câmera podem ficar só como data: no JSON; no próximo GET o cliente pode falhar ao exibir ou estourar quota.
 * Com API + upload ativo, reenvia cada data URL ao POST /upload e usa a URL http(s) retornada antes de gravar o produto.
 * (Em hosts com disco efêmero, prefira CLOUDINARY_URL na API para URLs estáveis.)
 */
async function ensureHttpImageUrlsForApi(urls: string[]): Promise<string[]> {
  if (!shouldTryServerUpload() || !urls.length) return urls
  const out: string[] = []
  for (const raw of urls) {
    if (out.length >= MAX_PRODUCT_IMAGES) break
    const u = raw.trim()
    if (!u) continue
    if (u.startsWith('data:image')) {
      try {
        const res = await fetch(u)
        const blob = await res.blob()
        if (!blob.size) {
          out.push(u)
          continue
        }
        const mime = blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
        const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'
        const file = new File([blob], `foto.${ext}`, { type: mime })
        const up = await storeApi.postUploadArquivos([file])
        if (up.ok && up.urls[0]) {
          out.push(up.urls[0])
        } else {
          out.push(u)
        }
      } catch {
        out.push(u)
      }
    } else {
      out.push(u)
    }
  }
  return out.slice(0, MAX_PRODUCT_IMAGES)
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
let adminEditingProductId: string | null = null
/** Se true, o catálogo vindo da API não sobrescreve as miniaturas do formulário (rascunho de fotos). */
let adminPhotoDraftDirty = false
let imageViewerState: { productId: string; index: number } | null = null

/** Logo da loja escolhida em arquivo — aplicada ao salvar identidade. Limpa ao sair do admin. */
let brandingPendingLogoDataUrl: string | null = null

let adminSecretBound = false
let adminSecretTapCount = 0
let adminSecretTapResetTimer: ReturnType<typeof setTimeout> | null = null

let adminStockPollTimer: ReturnType<typeof setInterval> | null = null
let adminStockLastSnapshot = new Map<string, number>()
let adminStockPollInFlight = false
let catalogSyncPollTimer: ReturnType<typeof setInterval> | null = null
let catalogSyncPollInFlight = false
const catalogSelectedSizes: Record<string, PieceSize> = {}
const catalogImageIndexByProduct: Record<string, number> = {}
/** Evita listeners duplicados em `.catalog-products-wrap` a cada refresh da grade. */
let catalogGridListenersAbort: AbortController | null = null

function notifySalvoComSucesso(): void {
  alert('Salvo com sucesso.')
}

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

function normalizeCartItemSize(raw: unknown): PieceSize {
  return normalizeSize(raw) ?? DEFAULT_PIECE_SIZE
}

function buildCartItemKey(productId: string, size: PieceSize): string {
  return `${productId}${CART_KEY_SEPARATOR}${size}`
}

function parseCartItemKey(key: string): { productId: string; size: PieceSize } {
  const idx = key.lastIndexOf(CART_KEY_SEPARATOR)
  if (idx < 0) return { productId: key, size: DEFAULT_PIECE_SIZE }
  return {
    productId: key.slice(0, idx),
    size: normalizeCartItemSize(key.slice(idx + CART_KEY_SEPARATOR.length))
  }
}

function firstAvailableSize(p: Product): PieceSize {
  return p.tamanhos[0] ?? DEFAULT_PIECE_SIZE
}

function qtyInCartForProductSize(productId: string, size: PieceSize): number {
  return appState.cart[buildCartItemKey(productId, size)] ?? 0
}

function productQtyInCart(productId: string): number {
  let total = 0
  for (const [key, qty] of Object.entries(appState.cart)) {
    if (qty <= 0) continue
    if (parseCartItemKey(key).productId === productId) total += qty
  }
  return total
}

/** Ajusta quantidades do carrinho ao estoque disponível por tamanho. */
function enforceCartStockForProduct(productId: string, product: Product): boolean {
  let changed = false
  for (const key of Object.keys(appState.cart)) {
    const parsed = parseCartItemKey(key)
    if (parsed.productId !== productId) continue
    const qty = appState.cart[key] ?? 0
    if (qty <= 0) continue
    const max = stockForSize(product, parsed.size)
    if (qty > max) {
      if (max <= 0) delete appState.cart[key]
      else appState.cart[key] = max
      changed = true
    }
  }
  return changed
}

function selectedSizeFromProductCard(productId: string): PieceSize {
  const el = document.querySelector<HTMLSelectElement>(`[data-action="size"][data-id="${productId}"]`)
  const product = products.find((p) => p.id === productId)
  const normalized = normalizeSize(el?.value)
  if (normalized && product?.tamanhos.includes(normalized)) {
    catalogSelectedSizes[productId] = normalized
    return normalized
  }
  const fromMemory = normalizeSize(catalogSelectedSizes[productId])
  if (fromMemory && product?.tamanhos.includes(fromMemory)) return fromMemory
  return product ? firstAvailableSize(product) : DEFAULT_PIECE_SIZE
}

function cartItemSizeLabel(size: PieceSize): string {
  return `Tamanho ${size}`
}

function cartItems() {
  return Object.entries(appState.cart)
    .filter(([, q]) => q > 0)
    .map(([cartKey, qty]) => {
      const { productId, size } = parseCartItemKey(cartKey)
      const product = products.find((p) => p.id === productId)
      if (!product) return null
      const chosenSize = product.tamanhos.includes(size) ? size : firstAvailableSize(product)
      const normalizedKey = buildCartItemKey(productId, chosenSize)
      if (normalizedKey !== cartKey) {
        const existing = appState.cart[normalizedKey] ?? 0
        appState.cart[normalizedKey] = existing + qty
        delete appState.cart[cartKey]
      }
      return { id: normalizedKey, product, size: chosenSize, qty, subtotal: qty * product.preco }
    })
    .filter(
      (x): x is { id: string; product: Product; size: PieceSize; qty: number; subtotal: number } =>
        x !== null
    )
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

function cartButtonInnerHtml(): string {
  const count = cartCount()
  return `
    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
      viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
    Carrinho ${count > 0 ? `<span class="badge">${count}</span>` : ''}
  `
}

function refreshCartIndicators() {
  const goCartBtn = document.getElementById('go-cart')
  if (goCartBtn) goCartBtn.innerHTML = cartButtonInnerHtml()
  const floatingBadge = document.querySelector<HTMLElement>('.floating-cart-badge')
  if (floatingBadge) floatingBadge.textContent = String(cartCount())
}

/** Ajusta quantidades do carrinho se o estoque do produto cair (ex.: painel admin). */
function syncCartWithStock() {
  let changed = false
  for (const key of Object.keys(appState.cart)) {
    const qty = appState.cart[key] ?? 0
    if (qty <= 0) continue
    const parsed = parseCartItemKey(key)
    const p = products.find((pr) => pr.id === parsed.productId)
    if (!p) continue
    changed = enforceCartStockForProduct(parsed.productId, p) || changed
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
    adminEditingProductId = null
    resetAdminPhotoDraftDirty()
    brandingPendingLogoDataUrl = null
    stopAdminStockPolling(true)
  }
  if (step !== 'catalogo') {
    stopCatalogSyncPolling()
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

function registerAdminSecretTap(): boolean {
  adminSecretTapCount += 1
  if (adminSecretTapResetTimer) clearTimeout(adminSecretTapResetTimer)
  adminSecretTapResetTimer = setTimeout(() => {
    adminSecretTapCount = 0
    adminSecretTapResetTimer = null
  }, 1400)
  if (adminSecretTapCount >= 7) {
    adminSecretTapCount = 0
    if (adminSecretTapResetTimer) {
      clearTimeout(adminSecretTapResetTimer)
      adminSecretTapResetTimer = null
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

function updateQty(id: string, qty: number, smoothUi = false) {
  const parsed = parseCartItemKey(id)
  const product = products.find((pr) => pr.id === parsed.productId)
  if (qty <= 0) {
    delete appState.cart[id]
  } else if (product) {
    const maxLine = stockForSize(product, parsed.size)
    if (maxLine <= 0) {
      alert('Item sem estoque neste tamanho.')
      delete appState.cart[id]
    } else if (qty > maxLine) {
      alert(`Só há ${maxLine} unidade(s) disponível(is) no tamanho ${parsed.size}.`)
      appState.cart[id] = maxLine
    } else {
      appState.cart[id] = qty
    }
  } else {
    appState.cart[id] = qty
  }
  persistState()
  if (smoothUi && appState.step === 'catalogo') {
    refreshCatalogGrid()
    refreshCartIndicators()
    return
  }
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

  cartItems().forEach(({ product, size, qty, subtotal }) => {
    lines.push(`• ${product.nome} (${cartItemSizeLabel(size)}) × ${qty} = ${currency.format(subtotal)}`)
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

function normalizeHttpImageUrl(raw: string): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString()
  } catch {
    /* URL inválida */
  }
  return null
}

function productPrimaryImage(p: Product): string {
  const first = p.imagens.find((u) => u.trim())
  return first ? first.trim() : ''
}

function productGalleryUrls(p: Product): string[] {
  const u = p.imagens.map((x) => x.trim()).filter(Boolean).slice(0, MAX_PRODUCT_IMAGES)
  return u.length ? u.map(productImageUrl) : [productImageUrl('')]
}

/** Mensagem de estoque na vitrine para o tamanho selecionado. */
function catalogStockLabel(p: Product, qtyInCartForSize: number, size: PieceSize): string {
  const e = stockForSize(p, size)
  if (e <= 0) return 'Sem estoque neste tamanho'
  if (qtyInCartForSize > e) return `Só há ${e} unidade(s) neste tamanho`
  if (qtyInCartForSize >= e) return 'Quantidade máxima neste tamanho'
  return `${e} un. disponível(is) no tamanho ${size}`
}

function catalogStockClass(p: Product, qtyInCartForSize: number, size: PieceSize): string {
  const e = stockForSize(p, size)
  if (e <= 0) return 'stock-out'
  if (qtyInCartForSize >= e) return 'stock-warn'
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
  const remembered = normalizeSize(catalogSelectedSizes[p.id])
  const selectedSize = remembered && p.tamanhos.includes(remembered) ? remembered : firstAvailableSize(p)
  const qty = qtyInCartForProductSize(p.id, selectedSize)
  const totalQty = productQtyInCart(p.id)
  const gallery = productGalleryUrls(p)
  const currentImageIndexRaw = catalogImageIndexByProduct[p.id] ?? 0
  const currentImageIndex = Math.max(0, Math.min(gallery.length - 1, currentImageIndexRaw))
  const currentImage = gallery[currentImageIndex] ?? productImageUrl('')
  const stockCls = catalogStockClass(p, qty, selectedSize)
  const stockLabel = escapeHtml(catalogStockLabel(p, qty, selectedSize))
  const lineStock = stockForSize(p, selectedSize)
  const plusDisabled = lineStock <= 0 || qty >= lineStock
  const sizeOptions = p.tamanhos
    .map((size) => `<option value="${size}" ${size === selectedSize ? 'selected' : ''}>${size}</option>`)
    .join('')
  const catalogImgExtraAttrs = /^https?:\/\//i.test(currentImage)
    ? ' referrerpolicy="no-referrer" decoding="async"'
    : ' decoding="async"'

  const thumbsHtml =
    gallery.length > 1
      ? `
            <div class="product-catalog-thumbs" role="group" aria-label="Miniaturas — ${escapeAttr(p.nome)}">
              ${gallery
                .map(
                  (src, i) => `
              <button
                type="button"
                class="product-catalog-thumb ${i === currentImageIndex ? 'active' : ''}"
                data-action="select-thumb"
                data-id="${p.id}"
                data-index="${i}"
                aria-label="Mostrar foto ${i + 1} de ${gallery.length}"
                ${i === currentImageIndex ? 'aria-current="true"' : ''}
              >
                <img
                  src="${escapeAttr(src)}"
                  alt=""
                  loading="lazy"
                  onerror="this.src='https://placehold.co/80x80/e8f0fe/1a3a6b?text=Foto'"
                />
              </button>`
                )
                .join('')}
            </div>`
      : ''

  return `
          <article class="product-card">
            <div class="product-card-gallery${gallery.length > 1 ? ' product-card-gallery--multi' : ''}">
            <div class="product-img-wrap">
              <img
                class="product-carousel-slide"
                role="button"
                tabindex="0"
                data-action="open-image"
                data-id="${p.id}"
                data-index="${currentImageIndex}"
                src="${escapeAttr(currentImage)}"
                alt="${escapeHtml(p.nome)}"
                title="Clique para ampliar a foto"
                aria-label="Ampliar foto de ${escapeAttr(p.nome)}"
                loading="eager"${catalogImgExtraAttrs}
                onerror="this.src='https://placehold.co/400x220/e8f0fe/1a3a6b?text=Foto'"
              />
              ${p.custom ? '<span class="badge-custom">Personalizado</span>' : ''}
              ${p.modelo ? '<span class="badge-modelo">Exemplo</span>' : ''}
              <span class="product-carousel-hint muted small" aria-hidden="true">${
                gallery.length > 1
                  ? 'Toque nas miniaturas ou na foto para ampliar'
                  : 'Toque na foto para ampliar'
              }</span>
            </div>
            ${thumbsHtml}
            </div>
            <div class="product-body">
              <h3>${escapeHtml(p.nome)}</h3>
              <p class="muted small">${escapeHtml(p.marca)}</p>
              <p class="stock-msg ${stockCls}">${stockLabel}</p>
              <p class="muted uso-text">${escapeHtml(p.uso)}</p>
              <label class="muted small">
                Tamanho
                <select data-action="size" data-id="${p.id}">
                  ${sizeOptions}
                </select>
              </label>
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
              <button class="btn primary full-width mt4" data-action="open-cart" ${totalQty === 0 || !productHasAnyStock(p) ? 'disabled' : ''}>
                ${!productHasAnyStock(p) ? 'Indisponível' : totalQty > 0 ? `Ir para carrinho (${totalQty})` : 'Selecione tamanho e use + / -'}
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

  catalogGridListenersAbort?.abort()
  catalogGridListenersAbort = new AbortController()
  const { signal } = catalogGridListenersAbort

  wrap.querySelectorAll<HTMLButtonElement>('[data-action="plus"]').forEach((btn) => {
    btn.addEventListener(
      'click',
      () => {
        const productId = btn.dataset.id!
        const size = selectedSizeFromProductCard(productId)
        const key = buildCartItemKey(productId, size)
        updateQty(key, (appState.cart[key] ?? 0) + 1, true)
      },
      { signal }
    )
  })

  wrap.querySelectorAll<HTMLButtonElement>('[data-action="minus"]').forEach((btn) => {
    btn.addEventListener(
      'click',
      () => {
        const productId = btn.dataset.id!
        const size = selectedSizeFromProductCard(productId)
        const key = buildCartItemKey(productId, size)
        updateQty(key, (appState.cart[key] ?? 0) - 1, true)
      },
      { signal }
    )
  })

  wrap.querySelectorAll<HTMLSelectElement>('[data-action="size"]').forEach((sel) => {
    sel.addEventListener(
      'change',
      () => {
        const productId = sel.dataset.id ?? ''
        if (productId) {
          const parsed = normalizeSize(sel.value)
          if (parsed) catalogSelectedSizes[productId] = parsed
        }
        refreshCatalogGrid()
      },
      { signal }
    )
  })

  wrap.querySelectorAll<HTMLButtonElement>('[data-action="open-cart"]').forEach((btn) => {
    btn.addEventListener('click', () => setStep('carrinho'), { signal })
  })

  /* open-tech: já ligado em bindEvents() no catálogo */

  wrap.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement
      const thumbBtn = target.closest<HTMLButtonElement>('[data-action="select-thumb"]')
      if (thumbBtn) {
        e.preventDefault()
        e.stopPropagation()
        const productId = thumbBtn.dataset.id ?? ''
        const idx = parseDataIndex(thumbBtn.dataset.index)
        if (!productId) return
        catalogImageIndexByProduct[productId] = idx
        refreshCatalogGrid()
        window.requestAnimationFrame(() => {
          document.querySelectorAll<HTMLButtonElement>('[data-action="select-thumb"]').forEach((b) => {
            if (b.dataset.id === productId && parseDataIndex(b.dataset.index) === idx) {
              b.closest('.product-card')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }
          })
        })
        return
      }
      const imgWrap = target.closest('.product-img-wrap')
      if (imgWrap) {
        const img = imgWrap.querySelector<HTMLImageElement>('img[data-action="open-image"]')
        if (img) {
          e.preventDefault()
          const productId = img.dataset.id ?? ''
          const idx = parseDataIndex(img.dataset.index)
          if (!productId) return
          imageViewerState = { productId, index: idx }
          render()
        }
      }
    },
    { signal }
  )

  wrap.addEventListener(
    'keydown',
    (evt) => {
      const e = evt as KeyboardEvent
      const target = e.target as HTMLElement
      const img = target.closest<HTMLElement>('img[data-action="open-image"]')
      if (!img) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const productId = img.dataset.id ?? ''
        const idx = parseDataIndex(img.dataset.index)
        if (!productId) return
        imageViewerState = { productId, index: idx }
        render()
      }
    },
    { signal }
  )
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
  const catalogSyncBanner = apiCatalogSyncMessage
    ? `<div class="catalog-api-warning card" role="alert">
        <p class="small" style="margin:0 0 10px;line-height:1.45;">${escapeHtml(apiCatalogSyncMessage)}</p>
        <button type="button" class="btn tiny" id="catalog-retry-api-sync">Tentar carregar o catálogo de novo</button>
      </div>`
    : ''

  return `
    <section class="screen fade-in">
      <header class="toolbar card">
        <div class="toolbar-top">
          ${stepIndicator(2)}
          <p class="eyebrow">Olá, seja bem vindo: ${escapeHtml(appState.customer.nomeCompleto)}</p>
          <h1>Catálogo</h1>
        </div>
        <div class="toolbar-actions">
          <button class="btn" id="back-register">← Voltar para cadastro</button>
          <input id="search" placeholder="Buscar por nome, marca ou categoria…"
            value="${appState.filtroBusca}" aria-label="Buscar produto" />
          <button type="button" class="btn" id="run-search" aria-label="Buscar itens">Buscar</button>
          <select id="category-filter" aria-label="Filtrar por categoria">${optionsHtml}</select>
          <button class="btn primary cart-btn" id="go-cart">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"
              viewBox="0 0 24 24"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            Carrinho ${cartCount() > 0 ? `<span class="badge">${cartCount()}</span>` : ''}
          </button>
        </div>
      </header>

      ${catalogSyncBanner}

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
              <small class="muted">${escapeHtml(item.product.marca)} · ${escapeHtml(cartItemSizeLabel(item.size))}</small>
            </div>
          </div>
        </td>
        <td data-label="Quantidade">
          <div class="qty-wrap inline">
            <button class="qty-btn" data-action="minus" data-id="${item.id}" aria-label="Diminuir">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-action="plus" data-id="${item.id}" aria-label="Aumentar" ${item.qty >= stockForSize(item.product, item.size) ? 'disabled' : ''}>+</button>
          </div>
          <p class="stock-msg ${catalogStockClass(item.product, item.qty, item.size)} small" style="margin-top:6px;">${escapeHtml(catalogStockLabel(item.product, item.qty, item.size))}</p>
        </td>
        <td data-label="Unitário">${currency.format(item.product.preco)}</td>
        <td data-label="Subtotal"><strong>${currency.format(item.subtotal)}</strong></td>
        <td data-label="Ações">
          <button class="btn tiny danger" data-action="remove" data-id="${item.id}" aria-label="Remover item">✕</button>
        </td>
      </tr>
    `
    )
    .join('')

  return `
    <section class="screen card">
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
  const showDeliveryAddressInput = getDeliveryOption(appState.deliveryMode)?.showCustomerAddress === true

  return `
    <section class="screen card">
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

        ${
          showDeliveryAddressInput
            ? `
        <fieldset>
          <legend>Endereço para entrega</legend>
          <label>
            Informe o endereço completo
            <input
              id="checkout-delivery-address"
              type="text"
              autocomplete="street-address"
              placeholder="Rua, número, bairro, cidade e referência"
              value="${escapeAttr(appState.customer.enderecoCompleto)}"
            />
          </label>
        </fieldset>
        `
            : ''
        }

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
  const editingProduct = adminEditingProductId
    ? products.find((p) => p.id === adminEditingProductId) ?? null
    : null
  const editParts = editingProduct?.subcategoria ? String(editingProduct.subcategoria).split(' · ') : []
  const editSize = editParts[0] ?? ''
  const editColor = editParts[1] ?? ''

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
          <strong>${currency.format(p.preco)}</strong>
        </td>
        <td data-label="Estoque">${adminTableStockRowHtml(p, i)}</td>
        <td data-label="Ações">
          <button class="btn tiny" data-action="admin-edit" data-index="${i}" aria-label="Editar cadastro de ${escapeAttr(p.nome)}">Editar cadastro</button>
          <button class="btn tiny" data-action="admin-save-stock" data-index="${i}" aria-label="Salvar novo estoque de ${escapeAttr(p.nome)}">Salvar estoque</button>
          <button class="btn tiny danger" data-action="admin-delete" data-index="${i}" aria-label="Excluir ${escapeAttr(p.nome)}">✕</button>
        </td>
      </tr>
    `
    )
    .join('')

  const optionsHtml = (categories.filter((c) => c !== 'todas') as Category[])
    .map((c) => `<option value="${c}" ${editingProduct?.categoria === c ? 'selected' : ''}>${c}</option>`)
    .join('')
  const adminFormCategoryDefault = editingProduct?.categoria ?? CATEGORY_VALUES[0]
  const adminFormEstoqueSizes = productSizesForCategory(adminFormCategoryDefault)
  const adminFormEstoqueHtml = adminEstoqueGridFieldsHtml(
    adminFormEstoqueSizes,
    editingProduct?.estoquePorTamanho
  )

  const b = storeBranding
  const logoPreviewSrc = escapeAttr(
    brandingPendingLogoDataUrl || b.logoUrl || logoLugarDasTintas
  )

  const adminDeliveryFeeValue = Number(checkoutOptions.deliveryFee) || 0
  const adminPixKeyValue = escapeAttr(checkoutOptions.pixKey ?? '')
  const adminPedidoWhatsappValue = escapeAttr(formatPedidoWhatsappForAdminField(checkoutOptions.pedidoWhatsapp ?? ''))

  const showAdminApiConnection = shouldSyncProductsToApi() || Boolean(storeApi.apiOrigin())
  const showServerOrdersDevPanel = import.meta.env.VITE_SHOW_SERVER_ORDERS_DEV === 'true'

  const adminApiConnectionHtml = showAdminApiConnection
    ? `
      <div class="card" id="admin-api-session-panel">
        <h2>Conexão com a API</h2>
        <p class="muted small" style="margin-bottom:10px;">
          Para <strong>gravar produtos e fotos no servidor</strong>, cada aparelho precisa estar autenticado.
          O token fica só neste navegador — no celular, use <strong>Entrar na API</strong> com a mesma senha configurada na API
          (<code>ADMIN_PASSWORD</code> ou <code>ADMIN_API_KEY</code>).
        </p>
        <p class="muted small" style="margin-bottom:8px;">
          ${
            adminJwtStored()
              ? '<strong>Sessão API:</strong> token JWT guardado neste aparelho.'
              : import.meta.env?.VITE_ADMIN_API_KEY
                ? '<strong>Sessão API:</strong> usando chave do build (<code>VITE_ADMIN_API_KEY</code>).'
                : '<strong>Sessão API:</strong> não configurada — toque em <strong>Entrar na API</strong> abaixo.'
          }
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:4px;align-items:center;">
          <button type="button" class="btn" id="admin-api-jwt-login">Entrar na API (JWT)</button>
          <button type="button" class="btn tiny danger" id="admin-api-jwt-logout">Sair da API</button>
        </div>
        <p class="muted small" style="margin:8px 0 0;">
          Alternativa: mesma chave em <strong>ADMIN_API_KEY</strong> (servidor) e <strong>VITE_ADMIN_API_KEY</strong> no front
          (evite se possível — a chave vai no bundle).
        </p>
      </div>
    `
    : ''

  const adminPedidosServidorHtml = showServerOrdersDevPanel
    ? `
      <div class="card" id="admin-pedidos-panel">
        <h2>Pedidos no servidor</h2>
        <p class="muted small" style="margin-bottom:10px;">
          Últimos pedidos gravados no MongoDB. Se não carregar, confira <strong>Conexão com a API</strong>
          ${showAdminApiConnection ? 'acima' : '(ative sincronização com a API e faça login)'}.
        </p>
        <button type="button" class="btn primary" id="admin-load-pedidos">Carregar pedidos</button>
        <div id="admin-pedidos-out" class="admin-pedidos-out" style="margin-top:14px;"></div>
      </div>
    `
    : ''

  const adminStockMonitorHtml = shouldSyncProductsToApi()
    ? `
      <div class="card" id="admin-stock-monitor-panel">
        <h2>Alertas de estoque (API)</h2>
        <p class="muted small" style="margin-bottom:10px;">
          Atualização automática a cada <strong>${ADMIN_STOCK_POLL_SEC} s</strong> com o painel aberto e sincronização com a API ativa.
          Lista cada <strong>tamanho</strong> com estoque <strong>≤ ${ADMIN_STOCK_ALERT_MIN} un.</strong> (inclui zero).
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">
          <button type="button" class="btn" id="admin-stock-enable-notify">Permitir avisos do navegador</button>
          <span class="muted small" id="admin-stock-notify-status"></span>
        </div>
        <p class="muted small" id="admin-stock-poll-status" aria-live="polite"></p>
        <div id="admin-stock-alert-list"></div>
      </div>
    `
    : ''

  return `
    <section class="screen fade-in">
      <div class="card">
        <p class="eyebrow">Painel administrativo</p>
        <h1>Gerenciar Produtos</h1>
      </div>

      ${adminApiConnectionHtml}
      ${adminStockMonitorHtml}
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
              placeholder="${DEFAULT_DELIVERY_FEE_REAIS.toFixed(2).replace('.', ',')}"
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
            <button type="button" class="btn tiny danger admin-wa-clear-btn" id="co-pedido-whatsapp-clear">Limpar número cadastrado</button>
          </div>
        </div>

        <div class="actions admin-checkout-actions">
          <button type="button" class="btn primary" id="co-save">Salvar entrega e pagamento</button>
          <button type="button" class="btn" id="co-reset-default">Limpar todas as opções</button>
        </div>
      </div>

      <div class="card">
        <h2>${editingProduct ? `Editar cadastro: ${escapeHtml(editingProduct.nome)}` : 'Adicionar produto'}</h2>
        <form id="admin-form" class="form-grid" novalidate>
          <label>
            Nome da peça *
            <input required name="nome" placeholder="Ex.: Camiseta básica algodão" value="${escapeAttr(editingProduct?.nome ?? '')}" />
          </label>
          <label>
            Marca ou coleção (opcional)
            <input name="marca" placeholder="Ex.: própria, marca parceira" value="${escapeAttr(editingProduct?.marca ?? '')}" />
          </label>
          <label>
            Categoria *
            <select required name="categoria" id="admin-categoria-produto">${optionsHtml}</select>
            <small class="muted">Se selecionar <strong>Calçados</strong>, os tamanhos do produto serão de 36 a 45.</small>
          </label>
          <label id="admin-tamanho-texto-wrap" class="admin-size-text-field">
            Tamanho (opcional)
            <select name="tamanhoProduto" id="admin-tamanho-texto">
              <option value="">Selecione (opcional)</option>
              ${APPAREL_SIZES.map((size) => `<option value="${size}" ${editSize === size ? 'selected' : ''}>${size}</option>`).join('')}
            </select>
          </label>
          <label id="admin-tamanho-calcado-wrap" class="admin-size-shoe-field" hidden>
            Número do calçado *
            <select name="tamanhoCalcado" id="admin-tamanho-calcado">
              ${SHOE_SIZES.map((size) => `<option value="${size}" ${editSize === size ? 'selected' : ''}>${size}</option>`).join('')}
            </select>
          </label>
          <label>
            Cor (opcional)
            <input name="corProduto" placeholder="Ex.: Branco" value="${escapeAttr(editColor)}" />
          </label>
          <label>
            Preço (R$) *
            <input required type="number" min="0" step="0.01" name="preco" placeholder="0,00" value="${editingProduct ? String(editingProduct.preco) : ''}" />
          </label>
          <label class="full">
            Estoque por tamanho *
            <span class="muted small" style="display:block;margin-top:4px;">Informe quantas unidades há em cada tamanho (ex.: 3 em P, 4 em M, 2 em G).</span>
            <div id="admin-estoque-por-tamanho-wrap" class="admin-estoque-grid">${adminFormEstoqueHtml}</div>
          </label>
          <label class="full">
            URL da imagem (opcional)
            <input
              type="text"
              name="imagemUrl"
              placeholder="https://site.com/minha-imagem.jpg"
              inputmode="url"
              autocomplete="off"
            />
          </label>
          <div class="full">
            <button type="button" class="btn tiny" id="admin-add-url-image">Adicionar outra imagem (URL)</button>
          </div>
          <div class="full admin-url-preview-wrap" id="admin-url-preview-wrap">
            <p class="muted small" id="admin-url-preview-hint">Pré-visualização da URL da imagem.</p>
            <img id="admin-url-preview-img" class="admin-url-preview-img" alt="Pré-visualização da imagem por URL" hidden />
          </div>
          <div class="full admin-photo-block">
            <p class="muted small" style="margin-bottom: 8px;">Fotos da peça (até ${MAX_PRODUCT_IMAGES}) — frente, costas, lateral…</p>
            <p class="muted small" style="margin-bottom: 8px;">
              Com API ativa, use <strong>Entrar na API</strong> antes de salvar. Em produção, configure <strong>CLOUDINARY_URL</strong> na API para as fotos não dependerem do disco do servidor (ex.: após reinício no Render).
            </p>
            <div class="admin-photo-actions">
              <button type="button" class="btn" id="admin-pick-gallery">📁 Galeria ou arquivo</button>
              <button type="button" class="btn" id="admin-pick-camera">📷 Tirar foto</button>
              <button type="button" class="btn tiny danger" id="admin-clear-photo">Remover todas</button>
            </div>
            <input type="file" id="admin-product-file-gallery" accept="image/*" multiple class="visually-hidden" tabindex="-1" aria-hidden="true" />
            <input type="file" id="admin-product-file-camera" accept="image/*" capture="environment" class="visually-hidden" tabindex="-1" aria-hidden="true" />
            <p class="muted small" id="admin-photo-count">${adminPendingImageDataUrls.length}/${MAX_PRODUCT_IMAGES} fotos</p>
            <div id="admin-photo-thumbs" class="admin-photo-thumbs">
              ${adminPhotoThumbsHtml()}
            </div>
          </div>
          <label class="full">
            Descrição *
            <input required name="uso" placeholder="Tecido, modelagem, cuidados na lavagem…" value="${escapeAttr(editingProduct?.uso ?? '')}" />
          </label>
          <div class="full form-actions">
            <button type="submit" formnovalidate class="btn primary">${editingProduct ? 'Salvar alterações do item' : 'Salvar e adicionar ao catálogo'}</button>
            ${editingProduct ? '<button type="button" class="btn" id="admin-cancel-edit">Cancelar edição</button>' : ''}
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
            <p><strong>Estoque:</strong> ${escapeHtml(fichaEstoqueDetalheHtml(fichaProduto))}</p>
            <p><strong>Descrição:</strong> ${escapeHtml(fichaProduto.uso)}</p>
          </div>
        </div>
      </div>
    `
    : ''
  const currentViewer = imageViewerState
  const imageViewerProduct = currentViewer
    ? products.find((p) => p.id === currentViewer.productId) ?? null
    : null
  const imageViewerGallery = imageViewerProduct ? productGalleryUrls(imageViewerProduct) : []
  const imageViewerIndex =
    currentViewer && imageViewerGallery.length
      ? Math.max(0, Math.min(imageViewerGallery.length - 1, currentViewer.index))
      : 0
  const imageViewerModal =
    imageViewerProduct && imageViewerGallery.length
      ? `
      <div class="image-viewer-overlay" id="image-viewer-overlay" role="dialog" aria-modal="true" aria-label="Visualização da imagem do produto">
        <div class="image-viewer-modal">
          <button class="btn image-viewer-close" id="image-viewer-close" aria-label="Fechar visualização">✕</button>
          ${
            imageViewerGallery.length > 1
              ? `<button class="image-viewer-nav prev" id="image-viewer-prev" aria-label="Imagem anterior">‹</button>
                 <button class="image-viewer-nav next" id="image-viewer-next" aria-label="Próxima imagem">›</button>`
              : ''
          }
          <img
            class="image-viewer-img"
            src="${escapeAttr(imageViewerGallery[imageViewerIndex])}"
            alt="${escapeAttr(imageViewerProduct.nome)}"
            loading="eager"
            onerror="this.src='https://placehold.co/900x700/e8f0fe/1a3a6b?text=Foto'"
          />
          ${
            imageViewerGallery.length > 1
              ? `<div class="image-viewer-thumbs">
                  ${imageViewerGallery
                    .map(
                      (src, idx) => `<button
                        type="button"
                        class="image-viewer-thumb ${idx === imageViewerIndex ? 'active' : ''}"
                        data-action="image-viewer-thumb"
                        data-index="${idx}"
                        aria-label="Abrir imagem ${idx + 1}"
                      ><img src="${escapeAttr(src)}" alt="" loading="lazy" onerror="this.src='https://placehold.co/120x120/e8f0fe/1a3a6b?text=Foto'" /></button>`
                    )
                    .join('')}
                </div>`
              : ''
          }
          <p class="muted small image-viewer-caption">${escapeHtml(imageViewerProduct.nome)} • Foto ${imageViewerIndex + 1} de ${imageViewerGallery.length}</p>
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
      ${imageViewerModal}
    </div>
  `
}

// ─── Bind de eventos ──────────────────────────────────────────────────────────

function bindEvents() {
  if (!adminSecretBound) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (imageViewerState) {
          e.preventDefault()
          imageViewerState = null
          render()
          return
        }
        if (appState.fichaTecnicaId) {
          e.preventDefault()
          appState.fichaTecnicaId = null
          persistState()
          render()
          return
        }
      }
      const isShortcutA = e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')
      const isShortcutB = e.ctrlKey && e.altKey && (e.key === 'A' || e.key === 'a')
      if (isShortcutA || isShortcutB) {
        e.preventDefault()
        requestAdminAccess()
      }
    })
    // Atalho secreto mobile: 7 toques rápidos no canto superior direito.
    document.addEventListener('pointerdown', (e) => {
      const nearTopRight = e.clientX >= window.innerWidth - 72 && e.clientY <= 72
      if (!nearTopRight) return
      registerAdminSecretTap()
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

  document.getElementById('image-viewer-close')?.addEventListener('click', () => {
    imageViewerState = null
    render()
  })
  document.getElementById('image-viewer-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      imageViewerState = null
      render()
    }
  })
  const moveImageViewer = (dir: 1 | -1) => {
    const viewer = imageViewerState
    if (!viewer) return
    const p = products.find((x) => x.id === viewer.productId)
    if (!p) return
    const total = productGalleryUrls(p).length
    if (total <= 1) return
    const nextRaw = viewer.index + dir
    const next = nextRaw < 0 ? total - 1 : nextRaw >= total ? 0 : nextRaw
    imageViewerState = { ...viewer, index: next }
    render()
  }
  document.getElementById('image-viewer-prev')?.addEventListener('click', (e) => {
    e.stopPropagation()
    moveImageViewer(-1)
  })
  document.getElementById('image-viewer-next')?.addEventListener('click', (e) => {
    e.stopPropagation()
    moveImageViewer(1)
  })
  document.querySelectorAll<HTMLButtonElement>('[data-action="image-viewer-thumb"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const viewer = imageViewerState
      if (!viewer) return
      const idx = parseDataIndex(btn.dataset.index)
      imageViewerState = { ...viewer, index: idx }
      render()
    })
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
  document.getElementById('run-search')?.addEventListener('click', () => {
    const search = document.getElementById('search') as HTMLInputElement | null
    appState.filtroBusca = search?.value ?? ''
    refreshCatalogGrid()
    persistState()
  })
  document.getElementById('category-filter')?.addEventListener('change', (e) => {
    appState.filtroCategoria = (e.target as HTMLSelectElement).value as 'todas' | Category
    refreshCatalogGrid()
    persistState()
  })
  document.getElementById('catalog-retry-api-sync')?.addEventListener('click', () => {
    void tryReplaceProductsFromApiIfDev()
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
  const deliveryAddressInput = document.getElementById('checkout-delivery-address') as HTMLInputElement | null
  deliveryAddressInput?.addEventListener('input', () => {
    appState.customer.enderecoCompleto = deliveryAddressInput.value
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
      const selectedDelivery = getDeliveryOption(appState.deliveryMode)
      if (selectedDelivery?.showCustomerAddress) {
        const endereco = String(deliveryAddressInput?.value ?? appState.customer.enderecoCompleto).trim()
        if (!endereco) {
          alert('Informe o endereço para entrega.')
          deliveryAddressInput?.focus()
          return
        }
        appState.customer.enderecoCompleto = endereco
      }

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

      for (const line of cartItems()) {
        const max = stockForSize(line.product, line.size)
        if (line.qty > max) {
          alert(
            max <= 0
              ? `"${line.product.nome}" (${line.size}): sem estoque neste tamanho. Ajuste o carrinho.`
              : `"${line.product.nome}" (${line.size}): só há ${max} unidade(s).`
          )
          return
        }
      }

      const useApiPedido =
        shouldSyncProductsToApi() &&
        cartItems().length > 0 &&
        cartItems().every(({ product }) => storeApi.isMongoObjectId(product.id))

      if (useApiPedido) {
        const r = await storeApi.postPedidoJson({
          items: cartItems().map(({ product, qty, size }) => ({ productId: product.id, qty, tamanho: size })),
          total: checkoutOrderTotal(),
          deliveryFee: checkoutDeliveryFeeTotal(),
          customer: appState.customer,
          deliveryMode: appState.deliveryMode,
          paymentMethod: appState.paymentMethod,
          cashChangeFor: appState.cashChangeFor
        })
        if (r.ok) {
          appState.pedidoNumero = r.numero?.trim() || gerarNumeroPedido()
          persistState()
          await refreshProductsFromApi()
          setStep('concluido')
          return
        }
        alert('Não foi possível registrar o pedido na API: ' + r.erro)
        return
      }

      products = products.map((pr) => {
        const lines = cartItems().filter((it) => it.product.id === pr.id)
        if (!lines.length) return pr
        const nextMap: Partial<Record<PieceSize, number>> = { ...pr.estoquePorTamanho }
        for (const it of lines) {
          const sz = it.size
          const cur = stockForSize(pr, sz)
          nextMap[sz] = Math.max(0, cur - it.qty)
        }
        const estoque = totalEstoqueFromMap(nextMap, pr.tamanhos)
        return { ...pr, estoquePorTamanho: nextMap, estoque }
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
      const parsed = parseCartItemKey(id)
      const isCartKey = id.includes(CART_KEY_SEPARATOR)
      const size = isCartKey ? parsed.size : selectedSizeFromProductCard(parsed.productId)
      const key = buildCartItemKey(parsed.productId, size)
      updateQty(key, (appState.cart[key] ?? 0) + 1, !isCartKey)
    })
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="minus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!
      const parsed = parseCartItemKey(id)
      const isCartKey = id.includes(CART_KEY_SEPARATOR)
      const size = isCartKey ? parsed.size : selectedSizeFromProductCard(parsed.productId)
      const key = buildCartItemKey(parsed.productId, size)
      updateQty(key, (appState.cart[key] ?? 0) - 1, !isCartKey)
    })
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="remove"]').forEach((btn) => {
    btn.addEventListener('click', () => updateQty(btn.dataset.id!, 0))
  })

  document.querySelectorAll<HTMLSelectElement>('[data-action="size"]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const productId = sel.dataset.id ?? ''
      if (productId) {
        const parsed = normalizeSize(sel.value)
        if (parsed) catalogSelectedSizes[productId] = parsed
      }
      render()
    })
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
      ramoEmpresa: '',
      enderecoEmpresa: String(fd.get('enderecoEmpresa') ?? '').trim(),
      telefoneEmpresa: String(fd.get('telefoneEmpresa') ?? '').trim()
    }
    saveBranding(storeBranding)
    applyDocumentBranding()
    notifySalvoComSucesso()
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
    notifySalvoComSucesso()
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
  const openFilePicker = (input: HTMLInputElement | null) => {
    if (!input) return
    try {
      // Permite selecionar novamente a mesma foto (alguns browsers não disparam change sem limpar).
      input.value = ''
    } catch {
      /* ignore */
    }
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker()
        return
      }
    } catch {
      // Alguns navegadores mobile bloqueiam showPicker em certas condições.
    }
    input.click()
  }

  const appendAdminDataUrls = (urls: string[]) => {
    const prevSnap = JSON.stringify(adminPendingImageDataUrls)
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
    if (JSON.stringify(adminPendingImageDataUrls) === prevSnap) return
    markAdminPhotoDraftDirty()
    if (appState.step === 'admin') refreshAdminPhotoDraftUi()
    else render()
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

  adminPickGallery?.addEventListener('click', () => openFilePicker(adminFileGallery))
  adminPickCamera?.addEventListener('click', () => openFilePicker(adminFileCamera))
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
    markAdminPhotoDraftDirty()
    adminPendingImageDataUrls = []
    if (appState.step === 'admin') refreshAdminPhotoDraftUi()
    else render()
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-remove-thumb"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.thumbIndex)
      if (Number.isNaN(idx)) return
      markAdminPhotoDraftDirty()
      adminPendingImageDataUrls = adminPendingImageDataUrls.filter((_, i) => i !== idx)
      if (appState.step === 'admin') refreshAdminPhotoDraftUi()
      else render()
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
  const adminCategorySelect = adminForm?.querySelector<HTMLSelectElement>('select[name="categoria"]') ?? null
  const adminTextSizeWrap = document.getElementById('admin-tamanho-texto-wrap') as HTMLLabelElement | null
  const adminTextSizeSelect = adminForm?.querySelector<HTMLSelectElement>('select[name="tamanhoProduto"]') ?? null
  const adminShoeSizeWrap = document.getElementById('admin-tamanho-calcado-wrap') as HTMLLabelElement | null
  const adminShoeSizeSelect = adminForm?.querySelector<HTMLSelectElement>('select[name="tamanhoCalcado"]') ?? null
  const adminImageUrlInput = adminForm?.querySelector<HTMLInputElement>('input[name="imagemUrl"]') ?? null
  const adminUrlPreviewHint = document.getElementById('admin-url-preview-hint')
  const adminUrlPreviewImg = document.getElementById('admin-url-preview-img') as HTMLImageElement | null
  const adminAddUrlImageBtn = document.getElementById('admin-add-url-image') as HTMLButtonElement | null

  const syncAdminEstoqueGrid = () => {
    const wrap = document.getElementById('admin-estoque-por-tamanho-wrap')
    if (!wrap || !adminCategorySelect) return
    const cat = adminCategorySelect.value as Category
    const sizes = productSizesForCategory(cat)
    const prev: Partial<Record<PieceSize, number>> = {}
    wrap.querySelectorAll<HTMLInputElement>('input[data-estoque-size]').forEach((el) => {
      const sz = el.dataset.estoqueSize as PieceSize | undefined
      if (sz) prev[sz] = Math.max(0, Math.floor(Number(el.value) || 0))
    })
    const merged: Partial<Record<PieceSize, number>> = {}
    for (const sz of sizes) merged[sz] = prev[sz] ?? 0
    wrap.innerHTML = adminEstoqueGridFieldsHtml(sizes, merged)
  }

  const syncAdminSizeFieldsByCategory = () => {
    const categoryValue = String(adminCategorySelect?.value ?? '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    const isShoes = categoryValue === 'calcados'
    if (!adminTextSizeWrap || !adminTextSizeSelect || !adminShoeSizeWrap || !adminShoeSizeSelect) return
    adminShoeSizeWrap.hidden = !isShoes
    adminTextSizeWrap.hidden = Boolean(isShoes)
    adminShoeSizeWrap.style.display = isShoes ? '' : 'none'
    adminTextSizeWrap.style.display = isShoes ? 'none' : ''
    // Campos desabilitados ficam fora da validação nativa e do FormData — evita bloqueio
    // intermitente no mobile quando o bloco de calçado está oculto mas ainda era "required".
    adminShoeSizeSelect.disabled = !isShoes
    adminTextSizeSelect.disabled = Boolean(isShoes)
    adminShoeSizeSelect.required = Boolean(isShoes)
    adminTextSizeSelect.required = false
    if (!isShoes) {
      adminShoeSizeSelect.removeAttribute('required')
    } else {
      adminTextSizeSelect.removeAttribute('required')
    }
    if (isShoes) {
      adminTextSizeSelect.value = ''
    }
    syncAdminEstoqueGrid()
  }

  adminCategorySelect?.addEventListener('change', syncAdminSizeFieldsByCategory)
  adminCategorySelect?.addEventListener('input', syncAdminSizeFieldsByCategory)
  adminForm?.addEventListener('input', (ev) => {
    if (ev.target === adminCategorySelect) syncAdminSizeFieldsByCategory()
  })
  adminForm?.addEventListener('change', (ev) => {
    if (ev.target === adminCategorySelect) syncAdminSizeFieldsByCategory()
  })
  syncAdminSizeFieldsByCategory()
  window.setTimeout(syncAdminSizeFieldsByCategory, 0)

  const syncAdminImageUrlPreview = () => {
    if (!adminImageUrlInput || !adminUrlPreviewHint || !adminUrlPreviewImg) return
    const raw = adminImageUrlInput.value.trim()
    if (!raw) {
      adminUrlPreviewImg.hidden = true
      adminUrlPreviewImg.removeAttribute('src')
      adminUrlPreviewHint.textContent = 'Pré-visualização da URL da imagem.'
      return
    }
    let normalizedUrl = ''
    try {
      const parsed = new URL(raw)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        normalizedUrl = parsed.toString()
      }
    } catch (_) {
      normalizedUrl = ''
    }
    if (!normalizedUrl) {
      adminUrlPreviewImg.hidden = true
      adminUrlPreviewImg.removeAttribute('src')
      adminUrlPreviewHint.textContent = 'URL inválida. Use um endereço completo começando com http:// ou https://.'
      return
    }
    adminUrlPreviewHint.textContent = 'Carregando pré-visualização...'
    adminUrlPreviewImg.hidden = false
    adminUrlPreviewImg.src = normalizedUrl
  }

  adminImageUrlInput?.addEventListener('input', syncAdminImageUrlPreview)
  adminImageUrlInput?.addEventListener('change', syncAdminImageUrlPreview)
  adminImageUrlInput?.addEventListener('blur', syncAdminImageUrlPreview)
  adminUrlPreviewImg?.addEventListener('load', () => {
    if (!adminUrlPreviewHint) return
    adminUrlPreviewHint.textContent = 'Imagem carregada com sucesso.'
  })
  adminUrlPreviewImg?.addEventListener('error', () => {
    if (!adminUrlPreviewHint || !adminUrlPreviewImg) return
    adminUrlPreviewImg.hidden = true
    adminUrlPreviewHint.textContent = 'Não foi possível carregar a imagem dessa URL.'
  })
  adminAddUrlImageBtn?.addEventListener('click', () => {
    if (!adminImageUrlInput) return
    const normalizedUrl = normalizeHttpImageUrl(adminImageUrlInput.value)
    if (!normalizedUrl) {
      alert('Informe uma URL válida de imagem (http:// ou https://).')
      adminImageUrlInput.focus()
      return
    }
    if (adminPendingImageDataUrls.includes(normalizedUrl)) {
      alert('Essa imagem já foi adicionada.')
      return
    }
    if (adminPendingImageDataUrls.length >= MAX_PRODUCT_IMAGES) {
      alert(`Limite de ${MAX_PRODUCT_IMAGES} fotos por produto.`)
      return
    }
    markAdminPhotoDraftDirty()
    adminPendingImageDataUrls = [normalizedUrl, ...adminPendingImageDataUrls].slice(0, MAX_PRODUCT_IMAGES)
    adminImageUrlInput.value = ''
    syncAdminImageUrlPreview()
    if (appState.step === 'admin') refreshAdminPhotoDraftUi()
    else render()
  })
  syncAdminImageUrlPreview()

  adminForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const liveForm = (e.currentTarget ?? e.target) as HTMLFormElement | null
    if (!liveForm || liveForm.id !== 'admin-form') return
    void (async () => {
      try {
      const fd = new FormData(liveForm)
      const get = (k: string) => String(fd.get(k) ?? '').trim()
      const nome = get('nome')
      const marca = get('marca')
      const categoria = get('categoria') as Category
      const tamanhoProduto = categoria === 'Calçados' ? get('tamanhoCalcado') : get('tamanhoProduto')
      const corProduto = get('corProduto')
      const subcategoria = [tamanhoProduto, corProduto].filter(Boolean).join(' · ')
      const tamanhosCategoria = productSizesForCategory(categoria)
      const preco = parseFloat(get('preco'))
      const uso = get('uso')
      const estoquePorTamanhoRaw = readFormEstoquePorTamanho(liveForm, tamanhosCategoria)
      const estoquePorTamanho = normalizeEstoquePorTamanhoRecord(estoquePorTamanhoRaw, tamanhosCategoria, 0)
      const estoqueIni = totalEstoqueFromMap(estoquePorTamanho, tamanhosCategoria)
      const imagemUrl = get('imagemUrl')
      if (!nome || !categoria || isNaN(preco) || !uso) {
        alert('Preencha os campos obrigatórios do produto.')
        return
      }
      const imagensFromUpload =
        adminPendingImageDataUrls.length > 0
          ? [...adminPendingImageDataUrls].slice(0, MAX_PRODUCT_IMAGES)
          : []
      const imagens: string[] = [...imagensFromUpload]
      if (imagemUrl) {
        const normalizedUrl = normalizeHttpImageUrl(imagemUrl) ?? ''
        if (!normalizedUrl) {
          alert('A URL da imagem é inválida. Use um endereço completo começando com http:// ou https://')
          return
        }
        if (!imagens.includes(normalizedUrl)) {
          imagens.unshift(normalizedUrl)
        }
      }
      const editingIndex = adminEditingProductId
        ? products.findIndex((p) => p.id === adminEditingProductId)
        : -1
      const editingProduct = editingIndex >= 0 ? products[editingIndex] : null
      const imagensFinal = finalizeAdminProductImages(imagens, Boolean(editingProduct))

      const useApi = shouldSyncProductsToApi()
      const strictRemotePersistence = useApi && !import.meta.env.DEV
      let imagensForApi = imagensFinal
      if (useApi && shouldTryServerUpload() && imagensFinal.some((x) => String(x).trim().startsWith('data:'))) {
        imagensForApi = await ensureHttpImageUrlsForApi(imagensFinal)
      }

      if (editingProduct && useApi && storeApi.isMongoObjectId(editingProduct.id)) {
        const r = await storeApi.patchProdutoJson(editingProduct.id, {
          nome,
          marca,
          categoria,
          subcategoria: subcategoria || undefined,
          preco,
          imagens: imagensForApi,
          tamanhos: tamanhosCategoria,
          estoque: estoqueIni,
          estoquePorTamanho,
          uso,
          custom: editingProduct.custom === true,
          modelo: editingProduct.modelo === true
        })
        if (r.ok) {
          products = products.map((p, i) => (i === editingIndex ? normalizeProduct(r.data) : p))
          saveProducts(products)
          adminEditingProductId = null
          adminPendingImageDataUrls = []
          resetAdminPhotoDraftDirty()
          liveForm.reset()
          notifySalvoComSucesso()
          render()
          return
        }
        alert(
          'API: não foi possível atualizar o produto (' +
            r.erro +
            '). Verifique MongoDB, login na API (JWT) ou VITE_ADMIN_API_KEY.'
        )
        if (strictRemotePersistence) {
          alert(
            'Publicação em produção: alteração bloqueada para evitar salvar só neste aparelho. Corrija a conexão da API e tente novamente.'
          )
          return
        }
      } else if (!editingProduct && useApi) {
        const r = await storeApi.postProdutoJson({
          nome,
          marca,
          categoria,
          subcategoria: subcategoria || undefined,
          preco,
          imagens: imagensForApi,
          tamanhos: tamanhosCategoria,
          estoque: estoqueIni,
          estoquePorTamanho,
          uso,
          custom: true,
          modelo: false
        })
        if (r.ok) {
          products = [...products, normalizeProduct(r.data)]
          saveProducts(products)
          adminPendingImageDataUrls = []
          resetAdminPhotoDraftDirty()
          liveForm.reset()
          notifySalvoComSucesso()
          render()
          return
        }
        alert(
          'API: não foi possível criar o produto (' +
            r.erro +
            '). Verifique MongoDB, login na API (JWT) ou VITE_ADMIN_API_KEY.'
        )
        if (strictRemotePersistence) {
          alert(
            'Publicação em produção: criação bloqueada para evitar salvar só neste aparelho. Corrija a conexão da API e tente novamente.'
          )
          return
        }
      }

      if (editingProduct) {
        const updated: Product = {
          ...editingProduct,
          nome,
          marca,
          categoria,
          subcategoria: subcategoria || undefined,
          preco,
          imagens: imagensFinal,
          tamanhos: tamanhosCategoria,
          estoquePorTamanho,
          estoque: estoqueIni,
          uso
        }
        products = products.map((p, i) => (i === editingIndex ? updated : p))
        adminEditingProductId = null
      } else {
        const newProduct: Product = {
          id: `custom-${Date.now()}`,
          nome,
          marca,
          categoria,
          subcategoria: subcategoria || undefined,
          preco,
          imagens: imagensFinal,
          tamanhos: tamanhosCategoria,
          estoquePorTamanho,
          estoque: estoqueIni,
          uso,
          custom: true,
          modelo: false
        }
        products = [...products, newProduct]
      }
      saveProducts(products)
      adminPendingImageDataUrls = []
      resetAdminPhotoDraftDirty()
      liveForm.reset()
      notifySalvoComSucesso()
      render()
      } catch (err) {
        console.error(err)
        alert(
          'Não foi possível salvar o produto. Se estiver no celular, verifique conexão e login na API; em seguida recarregue a página e tente de novo.'
        )
      }
    })()
  })

  document.getElementById('admin-cancel-edit')?.addEventListener('click', () => {
    adminEditingProductId = null
    adminPendingImageDataUrls = []
    resetAdminPhotoDraftDirty()
    render()
  })

  // Admin – excluir produto
  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-delete"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index)
      void (async () => {
        if (!confirm(`Remover "${products[idx]?.nome}"?`)) return
        const p = products[idx]
        if (p && adminEditingProductId === p.id) {
          adminEditingProductId = null
          adminPendingImageDataUrls = []
          resetAdminPhotoDraftDirty()
        }
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

  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index)
      const p = products[idx]
      if (!p) return
      resetAdminPhotoDraftDirty()
      adminEditingProductId = p.id
      adminPendingImageDataUrls = [...p.imagens].slice(0, MAX_PRODUCT_IMAGES)
      render()
      window.setTimeout(() => {
        document.getElementById('admin-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
    })
  })

  document.querySelectorAll<HTMLButtonElement>('[data-action="admin-save-stock"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index)
      void (async () => {
        const cur = products[idx]
        if (!cur) return
        const inputs = document.querySelectorAll<HTMLInputElement>(
          `[data-action="admin-stock-size"][data-index="${idx}"]`
        )
        if (!inputs.length) {
          alert('Campos de estoque não encontrados.')
          return
        }
        const map: Partial<Record<PieceSize, number>> = { ...cur.estoquePorTamanho }
        for (const el of inputs) {
          const sz = el.dataset.size as PieceSize | undefined
          if (!sz || !cur.tamanhos.includes(sz)) continue
          const n = Math.floor(Number(el.value))
          if (Number.isNaN(n) || n < 0) {
            alert('Informe estoque válido (número inteiro ≥ 0) em cada tamanho.')
            el.focus()
            return
          }
          map[sz] = n
        }
        const estoquePorTamanho = normalizeEstoquePorTamanhoRecord(map, cur.tamanhos, 0)
        const estoque = totalEstoqueFromMap(estoquePorTamanho, cur.tamanhos)
        if (storeApi.isMongoObjectId(cur.id)) {
          const r = await storeApi.patchProdutoJson(cur.id, { estoque, estoquePorTamanho })
          if (r.ok) {
            products[idx] = normalizeProduct(r.data)
            saveProducts(products)
            notifySalvoComSucesso()
            render()
            return
          }
          alert('API: ' + r.erro)
        }
        products[idx] = { ...cur, estoque, estoquePorTamanho }
        saveProducts(products)
        notifySalvoComSucesso()
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
      const useApi = shouldSyncProductsToApi()
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
      const useApi = shouldSyncProductsToApi()
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

  if (appState.step === 'admin' && shouldSyncProductsToApi()) {
    bindAdminStockMonitorUi()
    startAdminStockPolling()
  }

  if (appState.step === 'catalogo') {
    startCatalogSyncPolling()
    bindCatalogGridActions()
  }
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
