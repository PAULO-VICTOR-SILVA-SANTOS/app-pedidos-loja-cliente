import './style.css'
import logoLugarDasTintas from '../images/Logo Lugar Das tintas.JPG'

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Step = 'cadastro' | 'catalogo' | 'carrinho' | 'checkout' | 'concluido' | 'admin'

type Customer = {
  nomeCompleto: string
  enderecoCompleto: string
  nomeOficina: string
  email: string
  whatsapp: string
}

type Category =
  | 'primers'
  | 'vernizes'
  | 'massas'
  | 'tintas poliester'
  | 'tintas pu'
  | 'tintas sintetica'
  | 'tintas laca'
  | 'lixas'

type Product = {
  id: string
  nome: string
  marca: string
  categoria: Category
  subcategoria?: string
  preco: number
  imagem: string
  uso: string
  fonte: string
  custom?: boolean // adicionado pelo admin
}

type DeliveryMode = 'entrega' | 'retirada'
type PaymentMethod = 'pix' | 'cartao_link' | 'maquineta' | 'dinheiro'

type AppState = {
  step: Step
  prevStep: Step
  customer: Customer
  filtroBusca: string
  filtroCategoria: 'todas' | Category
  cart: Record<string, number>
  deliveryMode: DeliveryMode
  paymentMethod: PaymentMethod
  cashChangeFor: string
  isAdminAuthenticated: boolean
  pedidoNumero: string
  fichaTecnicaId: string | null
}

// ─── Catálogo base ───────────────────────────────────────────────────────────

const defaultProducts: Product[] = [
  {
    id: 'maza-primer-fast-6500',
    nome: 'Kit Primer PU Fast 6500',
    marca: 'Maza',
    categoria: 'primers',
    preco: 289.9,
    imagem:
      'https://maza.com.br/images/banners/Esmalte_PU_Acetinado_PNG(4).png',
    uso: 'Primer PU de secagem rápida para preparação de chapa e repintura. Excelente aderência e nivelamento.',
    fonte: 'https://www.maza.com.br/produto/109/kit-primer-pu-fast-6500'
  },
  {
    id: 'maza-primer-pu1500',
    nome: 'Kit Primer PU1500',
    marca: 'Maza',
    categoria: 'primers',
    preco: 229.9,
    imagem: 'https://maza.com.br/images/banners/Esmalte_PU_Acetinado_PNG(1).png',
    uso: 'Primer PU para nivelamento antes de base e verniz. Alta cobertura.',
    fonte: 'https://www.maza.com.br/produto/106/kit-primer-pu1500'
  },
  {
    id: 'maza-primer-sintetico',
    nome: 'Primer Sintético Vermelho Óxido',
    marca: 'Maza',
    categoria: 'primers',
    preco: 149.9,
    imagem: 'https://maza.com.br/images/banners/Design%20sem%20nome%20(84).png',
    uso: 'Primer anticorrosivo para aplicação direta em metal lixado.',
    fonte: 'https://www.maza.com.br/produto/99/primer-sintetico-vermelho-oxido'
  },
  {
    id: 'maza-verniz-5500',
    nome: 'Kit Verniz PU Alto Sólidos 5500',
    marca: 'Maza',
    categoria: 'vernizes',
    preco: 399.9,
    imagem:
      'https://maza.com.br/images/banners/KIT%20VERNIZ%20PU%20ALTO%20SOLIDOS%205500%20-%20SITE.png',
    uso: 'Verniz PU para acabamento de alta resistência e brilho intenso. Secagem rápida.',
    fonte: 'https://www.maza.com.br/produto/120/kit-verniz-pu-alto-solidos-5500'
  },
  {
    id: 'maza-verniz-pu-1500',
    nome: 'Kit Verniz PU 1500',
    marca: 'Maza',
    categoria: 'vernizes',
    preco: 329.9,
    imagem: 'https://maza.com.br/images/banners/Kit_Primer_1500_PNG.png',
    uso: 'Verniz PU brilhante com ótima resistência química e intempéries.',
    fonte: 'https://www.maza.com.br/produto/118/kit-verniz-pu-1500'
  },
  {
    id: 'maza-mazadur-poliester',
    nome: 'Mazadur Poliéster',
    marca: 'Maza',
    categoria: 'tintas poliester',
    preco: 219.9,
    imagem:
      'https://maza.com.br/images/banners/Mazadur_Poliester_Galao_PNG.png',
    uso: 'Tinta poliéster para repintura automotiva com excelente cobertura e rendimento.',
    fonte: 'https://www.maza.com.br/produto/117/mazadur-poliester'
  },
  {
    id: 'maza-mazadur-pu',
    nome: 'Mazadur PU',
    marca: 'Maza',
    categoria: 'tintas pu',
    preco: 259.9,
    imagem: 'https://maza.com.br/images/banners/Design%20sem%20nome%20(88).png',
    uso: 'Tinta PU bicomponente para acabamento com alta resistência química e mecânica.',
    fonte: 'https://www.maza.com.br/produto/116/mazadur-pu'
  },
  {
    id: 'maza-mazalux',
    nome: 'Mazalux (Tinta Sintética)',
    marca: 'Maza',
    categoria: 'tintas sintetica',
    preco: 164.9,
    imagem: 'https://maza.com.br/images/banners/Design%20sem%20nome%20(74).png',
    uso: 'Esmalte sintético para manutenção e pintura geral automotiva em peças metálicas.',
    fonte: 'https://www.maza.com.br/produto/114/mazalux'
  },
  {
    id: 'maza-mazalac',
    nome: 'Mazalac (Laca)',
    marca: 'Maza',
    categoria: 'tintas laca',
    preco: 189.9,
    imagem:
      'https://maza.com.br/images/banners/Maza_Automotivo_Mazalac_Galao.png',
    uso: 'Laca nitrocelulose para acabamentos finos e reparos rápidos com secagem acelerada.',
    fonte: 'https://www.maza.com.br/produto/115/mazalac'
  },
  {
    id: 'sherwin-lazzudur',
    nome: 'Lazzudur (Base Poliéster)',
    marca: 'Sherwin-Williams',
    categoria: 'tintas poliester',
    preco: 279.9,
    imagem:
      'https://www.sherwin-auto.com.br/wp-content/uploads/2021/08/sherwinauto-default.jpg',
    uso: 'Base poliéster para sistema de cores e repintura automotiva de alta cobertura.',
    fonte:
      'https://www.sherwin-auto.com.br/produtos/tintas/tintas-base-poliester/lazzudur/'
  },
  {
    id: 'sherwin-lazzudur-pu',
    nome: 'Lazzudur PU',
    marca: 'Sherwin-Williams',
    categoria: 'tintas pu',
    preco: 309.9,
    imagem:
      'https://www.sherwin-auto.com.br/wp-content/uploads/2021/08/sherwinauto-default.jpg',
    uso: 'Base poliuretano com secagem controlada, resistência mecânica e brilho superior.',
    fonte:
      'https://www.sherwin-auto.com.br/produtos/tintas/tintas-base-poliuretano/lazzudur-pu/'
  },
  {
    id: 'sherwin-lazzuril-sintetico',
    nome: 'Lazzuril Esmalte Sintético',
    marca: 'Sherwin-Williams',
    categoria: 'tintas sintetica',
    preco: 179.9,
    imagem:
      'https://www.sherwin-auto.com.br/wp-content/uploads/2021/08/sherwinauto-default.jpg',
    uso: 'Esmalte sintético para pintura de peças e estruturas metálicas com boa durabilidade.',
    fonte:
      'https://www.sherwin-auto.com.br/produtos/tintas/tintas-esmalte-sintetico/lazzuril-esmalte-sintetico/'
  },
  {
    id: 'sherwin-lazzulac',
    nome: 'Lazzulac (Laca Nitrocelulose)',
    marca: 'Sherwin-Williams',
    categoria: 'tintas laca',
    preco: 209.9,
    imagem:
      'https://www.sherwin-auto.com.br/wp-content/uploads/2021/08/sherwinauto-default.jpg',
    uso: 'Laca nitrocelulose voltada para acabamento com secagem rápida e brilho.',
    fonte:
      'https://www.sherwin-auto.com.br/produtos/tintas/tintas-laca-nitrocelulose/lazzulac/'
  },
  {
    id: 'sherwin-primer-pu',
    nome: 'Primer PU Sherwin',
    marca: 'Sherwin-Williams',
    categoria: 'primers',
    preco: 249.9,
    imagem:
      'https://www.sherwin-auto.com.br/wp-content/uploads/2021/08/sherwinauto-default.jpg',
    uso: 'Primer PU para nivelamento de superfície antes da base e verniz. Excelente aderência.',
    fonte: 'https://www.sherwin-auto.com.br/produto/primers/primers-primer-pu/'
  },
  {
    id: 'sherwin-verniz-pu',
    nome: 'Verniz PU Sherwin',
    marca: 'Sherwin-Williams',
    categoria: 'vernizes',
    preco: 359.9,
    imagem:
      'https://www.sherwin-auto.com.br/wp-content/uploads/2021/08/sherwinauto-default.jpg',
    uso: 'Verniz PU para proteção UV e acabamento final de alto brilho.',
    fonte: 'https://www.sherwin-auto.com.br/produto/vernizes/vernizes-vernizes-pu/'
  },
  {
    id: 'sherwin-massa-poliester',
    nome: 'Massa Poliéster',
    marca: 'Sherwin-Williams',
    categoria: 'massas',
    preco: 69.9,
    imagem:
      'https://www.sherwin-auto.com.br/wp-content/uploads/2021/08/sherwinauto-default.jpg',
    uso: 'Massa para correção de imperfeições antes da aplicação do primer.',
    fonte: 'https://www.sherwin-auto.com.br/produto/massas/massas-massa-poliester/'
  },
  {
    id: 'lixa-agua-p400',
    nome: "Lixa d'Água P400",
    marca: 'Premium Abrasivos',
    categoria: 'lixas',
    subcategoria: 'de agua',
    preco: 4.9,
    imagem:
      'https://images.unsplash.com/photo-1581093588401-22d1f7f5f0fd?auto=format&fit=crop&w=800&q=80',
    uso: 'Lixamento úmido entre etapas de preparação da pintura.',
    fonte:
      'https://www.sherwin-auto.com.br/produto/equipamentos-e-acessorios/equipamentos-e-acessorios-abrasivo/'
  },
  {
    id: 'lixa-ferro-p80',
    nome: 'Lixa para Ferro P80',
    marca: 'Premium Abrasivos',
    categoria: 'lixas',
    subcategoria: 'ferro',
    preco: 5.5,
    imagem:
      'https://images.unsplash.com/photo-1542202229-2df1f7258f6f?auto=format&fit=crop&w=800&q=80',
    uso: 'Desbaste em metal e remoção de tinta antiga, antes do primer.',
    fonte:
      'https://www.sherwin-auto.com.br/produto/equipamentos-e-acessorios/equipamentos-e-acessorios-abrasivo/'
  },
  {
    id: 'lixa-seco-p320',
    nome: 'Lixa a Seco P320',
    marca: 'Premium Abrasivos',
    categoria: 'lixas',
    subcategoria: 'a seco',
    preco: 4.2,
    imagem:
      'https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=800&q=80',
    uso: 'Lixamento a seco em massa e primer para acabamento uniforme.',
    fonte:
      'https://www.sherwin-auto.com.br/produto/equipamentos-e-acessorios/equipamentos-e-acessorios-abrasivo/'
  }
]

// ─── Persistência (LocalStorage) ─────────────────────────────────────────────

const STORAGE_KEYS = {
  products: 'apd_products',
  state: 'apd_state'
}

function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.products)
    if (raw) return JSON.parse(raw) as Product[]
  } catch (_) { /* ignora parse error */ }
  return [...defaultProducts]
}

function saveProducts(list: Product[]) {
  localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(list))
}

type PersistedState = {
  customer: Customer
  cart: Record<string, number>
  deliveryMode: DeliveryMode
  paymentMethod: PaymentMethod
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

const appState: AppState = {
  step: 'cadastro',
  prevStep: 'catalogo',
  customer: saved.customer ?? {
    nomeCompleto: '',
    enderecoCompleto: '',
    nomeOficina: '',
    email: '',
    whatsapp: ''
  },
  filtroBusca: '',
  filtroCategoria: 'todas',
  cart: saved.cart ?? {},
  deliveryMode: saved.deliveryMode ?? 'entrega',
  paymentMethod: saved.paymentMethod ?? 'pix',
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

const categories: Array<'todas' | Category> = [
  'todas',
  'primers',
  'vernizes',
  'massas',
  'tintas poliester',
  'tintas pu',
  'tintas sintetica',
  'tintas laca',
  'lixas'
]

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const app = document.querySelector<HTMLDivElement>('#app')!

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
  appState.prevStep = appState.step
  appState.step = step
  persistState()
  render()
  window.scrollTo({ top: 0, behavior: 'smooth' })
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
  appState.customer = {
    nomeCompleto: '',
    enderecoCompleto: '',
    nomeOficina: '',
    email: '',
    whatsapp: ''
  }
  appState.cart = {}
  appState.filtroBusca = ''
  appState.filtroCategoria = 'todas'
  appState.deliveryMode = 'entrega'
  appState.paymentMethod = 'pix'
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
const PIX_CNPJ = '13232181000123'

function paymentMethodLabel(method: PaymentMethod): string {
  const labels: Record<PaymentMethod, string> = {
    pix: 'Pix',
    cartao_link: 'Cartão de crédito (link de pagamento)',
    maquineta: 'Cartão na maquineta (presencial)',
    dinheiro: 'Dinheiro'
  }
  return labels[method]
}

function paymentMethodDetail(method: PaymentMethod): string {
  const details: Record<PaymentMethod, string> = {
    pix: `Chave Pix (CNPJ): ${PIX_CNPJ}`,
    cartao_link: 'Solicita envio do link de pagamento por WhatsApp.',
    maquineta: 'Solicita maquineta para pagamento presencial.',
    dinheiro: appState.cashChangeFor
      ? `Pagamento em dinheiro. Troco para: ${currency.format(Number(appState.cashChangeFor))}.`
      : 'Pagamento em dinheiro na entrega/retirada.'
  }
  return details[method]
}

function buildWhatsAppUrl(): string {
  const lines: string[] = [
    `*Novo Pedido - Lugar das Tintas*`,
    `*Nº ${appState.pedidoNumero}*`,
    ``,
    `*Cliente:* ${appState.customer.nomeCompleto}`,
    `*Oficina:* ${appState.customer.nomeOficina}`,
    `*E-mail:* ${appState.customer.email}`,
    `*Endereço:* ${appState.customer.enderecoCompleto}`,
    `*Modalidade:* ${appState.deliveryMode === 'entrega' ? 'Entrega' : 'Retirada na loja'}`,
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

// ─── Telas ────────────────────────────────────────────────────────────────────

function logoHtml() {
  return `
    <div class="brand-logo">
      <img
        src="${logoLugarDasTintas}"
        alt="Lugar das Tintas"
        onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
      />
      <span class="brand-text" style="display:none">
        <span class="brand-accent">Lugar</span>&nbsp;das&nbsp;<span class="brand-accent">Tintas</span>
      </span>
      <span class="brand-tagline">LUGAR DAS TINTAS AUTOMOTIVAS</span>
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
  return `
    <section class="screen card fade-in">
      ${stepIndicator(1)}
      <div class="screen-header">
        <p class="eyebrow">Bem-vindo ao sistema de pedidos</p>
        <h1>Cadastro do Cliente</h1>
        <p class="lead">Preencha seus dados para acessar o catálogo e realizar pedidos.</p>
      </div>
      <form id="cadastro-form" class="form-grid" novalidate>
        <label>
          Nome completo *
          <input required name="nomeCompleto" value="${appState.customer.nomeCompleto}"
            placeholder="Ex: João da Silva" autocomplete="name" />
        </label>
        <label>
          Nome da oficina *
          <input required name="nomeOficina" value="${appState.customer.nomeOficina}"
            placeholder="Ex: Auto Center Premium" />
        </label>
        <label class="full">
          Endereço completo *
          <input required name="enderecoCompleto" value="${appState.customer.enderecoCompleto}"
            placeholder="Rua, número, bairro, cidade – CEP" autocomplete="street-address" />
        </label>
        <label>
          E-mail *
          <input required type="email" name="email" value="${appState.customer.email}"
            placeholder="contato@oficina.com" autocomplete="email" />
        </label>
        <label>
          WhatsApp *
          <input type="tel" name="whatsapp" value="${appState.customer.whatsapp}"
            placeholder="(00) 00000-0000" autocomplete="tel"
            required maxlength="15" inputmode="numeric" pattern="^\\(\\d{2}\\) \\d{5}-\\d{4}$" />
        </label>
        <div class="full form-actions">
          <button type="submit" class="btn primary">Acessar o Catálogo →</button>
        </div>
      </form>
    </section>
  `
}

function catalogCardsHtml() {
  const filtered = getFiltered()
  return filtered.length
    ? filtered
        .map((p) => {
          const qty = appState.cart[p.id] ?? 0
          return `
          <article class="product-card">
            <div class="product-img-wrap">
              <img src="${p.imagem}" alt="${p.nome}" loading="lazy"
                onerror="this.src='https://placehold.co/400x220/e8f0fe/1a3a6b?text=Produto'" />
              ${p.custom ? '<span class="badge-custom">Personalizado</span>' : ''}
            </div>
            <div class="product-body">
              <p class="chip">${p.categoria}${p.subcategoria ? ` · ${p.subcategoria}` : ''}</p>
              <h3>${p.nome}</h3>
              <p class="muted small">${p.marca}</p>
              <p class="muted uso-text">${p.uso}</p>
              <button class="btn link-btn" data-action="open-tech" data-id="${p.id}">
                Ver ficha técnica
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
          </article>
        `
        })
        .join('')
    : '<p class="empty-msg">Nenhum produto encontrado com esse filtro.</p>'
}

function bindCatalogGridActions() {
  const grid = document.querySelector('.products-grid')
  if (!grid) return

  grid.querySelectorAll<HTMLButtonElement>('[data-action="plus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!
      updateQty(id, (appState.cart[id] ?? 0) + 1)
    })
  })

  grid.querySelectorAll<HTMLButtonElement>('[data-action="minus"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!
      updateQty(id, (appState.cart[id] ?? 0) - 1)
    })
  })

  grid.querySelectorAll<HTMLButtonElement>('[data-action="open-cart"]').forEach((btn) => {
    btn.addEventListener('click', () => setStep('carrinho'))
  })

  grid.querySelectorAll<HTMLButtonElement>('[data-action="open-tech"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appState.fichaTecnicaId = btn.dataset.id ?? null
      render()
    })
  })
}

function refreshCatalogGrid() {
  const grid = document.querySelector('.products-grid') as HTMLDivElement | null
  if (!grid) return
  grid.innerHTML = catalogCardsHtml()
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
          <p class="eyebrow">Cliente: ${appState.customer.nomeOficina || appState.customer.nomeCompleto}</p>
          <h1>Catálogo de Produtos</h1>
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

      <div class="supplier-box card">
        <p class="eyebrow">Referência de mercado (uso interno)</p>
        <p class="muted small">
          Preços, imagens e especificações técnicas são consolidados internamente neste app.
          O cliente permanece 100% na navegação da loja, sem redirecionamento para fornecedores.
        </p>
      </div>

      <div class="products-grid">${cardsHtml}</div>
    </section>
  `
}

function cartScreen() {
  const items = cartItems()
  const rows = items
    .map(
      (item) => `
      <tr>
        <td>
          <strong>${item.product.nome}</strong><br/>
          <small class="muted">${item.product.marca}</small>
        </td>
        <td>
          <div class="qty-wrap inline">
            <button class="qty-btn" data-action="minus" data-id="${item.product.id}" aria-label="Diminuir">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" data-action="plus" data-id="${item.product.id}" aria-label="Aumentar">+</button>
          </div>
        </td>
        <td>${currency.format(item.product.preco)}</td>
        <td><strong>${currency.format(item.subtotal)}</strong></td>
        <td>
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
            <div class="table-wrap">
              <table>
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
          <label class="radio-card ${appState.deliveryMode === 'entrega' ? 'selected' : ''}">
            <input type="radio" name="deliveryMode" value="entrega"
              ${appState.deliveryMode === 'entrega' ? 'checked' : ''} />
            <div>
              <strong>Entrega no endereço</strong>
              <p class="muted">${appState.customer.enderecoCompleto || '—'}</p>
            </div>
          </label>
          <label class="radio-card ${appState.deliveryMode === 'retirada' ? 'selected' : ''}">
            <input type="radio" name="deliveryMode" value="retirada"
              ${appState.deliveryMode === 'retirada' ? 'checked' : ''} />
            <div>
              <strong>Retirada na loja</strong>
              <p class="muted">Retire pessoalmente no balcão</p>
            </div>
          </label>
        </fieldset>

        <fieldset>
          <legend>Forma de pagamento</legend>
          <label class="radio-card ${appState.paymentMethod === 'pix' ? 'selected' : ''}">
            <input type="radio" name="paymentMethod" value="pix"
              ${appState.paymentMethod === 'pix' ? 'checked' : ''} />
            <div>
              <strong>Pix</strong>
              <p class="muted pix-key">Chave CNPJ: ${PIX_CNPJ}</p>
            </div>
          </label>
          <label class="radio-card ${appState.paymentMethod === 'cartao_link' ? 'selected' : ''}">
            <input type="radio" name="paymentMethod" value="cartao_link"
              ${appState.paymentMethod === 'cartao_link' ? 'checked' : ''} />
            <div>
              <strong>Cartão de crédito</strong>
              <p class="muted">Solicitar envio de link de pagamento pelo WhatsApp</p>
            </div>
          </label>
          <label class="radio-card ${appState.paymentMethod === 'maquineta' ? 'selected' : ''}">
            <input type="radio" name="paymentMethod" value="maquineta"
              ${appState.paymentMethod === 'maquineta' ? 'checked' : ''} />
            <div>
              <strong>Cartão na maquineta</strong>
              <p class="muted">Solicitar maquineta para pagamento presencial</p>
            </div>
          </label>
          <label class="radio-card ${appState.paymentMethod === 'dinheiro' ? 'selected' : ''}">
            <input type="radio" name="paymentMethod" value="dinheiro"
              ${appState.paymentMethod === 'dinheiro' ? 'checked' : ''} />
            <div>
              <strong>Dinheiro</strong>
              <p class="muted">Pagamento em espécie na entrega ou retirada</p>
            </div>
          </label>
          <div class="cash-change-box ${appState.paymentMethod === 'dinheiro' ? '' : 'hidden'}" id="cash-change-box">
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
          <p><span class="muted">Oficina:</span> <strong>${appState.customer.nomeOficina}</strong></p>
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
  const mode = appState.deliveryMode === 'entrega' ? 'Entrega no endereço' : 'Retirada na loja'
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
        <td data-label="Nome">${p.nome}</td>
        <td data-label="Marca">${p.marca}</td>
        <td data-label="Categoria">${p.categoria}</td>
        <td data-label="Preço">
          <input
            class="price-edit-input"
            type="number"
            min="0"
            step="0.01"
            value="${p.preco.toFixed(2)}"
            data-action="admin-price"
            data-index="${i}"
            aria-label="Preço de ${p.nome}"
          />
        </td>
        <td data-label="Ficha">
          <button class="btn tiny" data-action="open-tech" data-id="${p.id}" aria-label="Ver ficha técnica de ${p.nome}">Ver</button>
        </td>
        <td data-label="Ações">
          <button class="btn tiny" data-action="admin-save-price" data-index="${i}" aria-label="Salvar novo preço de ${p.nome}">Salvar</button>
          <button class="btn tiny danger" data-action="admin-delete" data-index="${i}" aria-label="Excluir ${p.nome}">✕</button>
        </td>
      </tr>
    `
    )
    .join('')

  const optionsHtml = (categories.filter((c) => c !== 'todas') as Category[])
    .map((c) => `<option value="${c}">${c}</option>`)
    .join('')

  return `
    <section class="screen fade-in">
      <div class="card">
        <p class="eyebrow">Painel administrativo</p>
        <h1>Gerenciar Produtos</h1>
        <p class="lead">Adicione, remova ou edite produtos do catálogo. As alterações são salvas no navegador.</p>
      </div>

      <div class="card">
        <h2>Adicionar produto</h2>
        <form id="admin-form" class="form-grid" novalidate>
          <label>
            Nome do produto *
            <input required name="nome" placeholder="Nome do produto" />
          </label>
          <label>
            Marca *
            <input required name="marca" placeholder="Ex: Maza, Sherwin-Williams" />
          </label>
          <label>
            Categoria *
            <select required name="categoria">${optionsHtml}</select>
          </label>
          <label>
            Subcategoria
            <input name="subcategoria" placeholder="Ex: de agua, ferro, a seco" />
          </label>
          <label>
            Preço (R$) *
            <input required type="number" min="0" step="0.01" name="preco" placeholder="0,00" />
          </label>
          <label>
            URL da imagem
            <input type="url" name="imagem" placeholder="https://…" />
          </label>
          <label class="full">
            Descrição / modo de uso *
            <input required name="uso" placeholder="Como usar este produto" />
          </label>
          <label class="full">
            Fonte técnica (uso interno)
            <input type="url" name="fonte" placeholder="https://…" />
          </label>
          <div class="full form-actions">
            <button type="submit" class="btn primary">Adicionar ao catálogo</button>
          </div>
        </form>
      </div>

      <div class="card">
        <h2>Produtos cadastrados (${products.length})</h2>
        <div class="table-wrap">
          <table class="admin-table">
            <thead><tr><th>Nome</th><th>Marca</th><th>Categoria</th><th>Preço</th><th>Ficha</th><th>Ações</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="actions">
          <button class="btn" id="back-from-admin">← Voltar ao catálogo</button>
          <button class="btn danger" id="reset-products">Restaurar catálogo padrão</button>
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
      <div class="ficha-overlay" id="ficha-overlay" role="dialog" aria-modal="true" aria-label="Ficha técnica do produto">
        <div class="ficha-modal" id="ficha-modal">
          <div class="ficha-header">
            <h3>Ficha técnica - ${fichaProduto.nome}</h3>
            <button class="btn" id="close-ficha" aria-label="Fechar ficha técnica">✕</button>
          </div>
          <div class="ficha-body">
            <p><strong>Marca:</strong> ${fichaProduto.marca}</p>
            <p><strong>Categoria:</strong> ${fichaProduto.categoria}${fichaProduto.subcategoria ? ` · ${fichaProduto.subcategoria}` : ''}</p>
            <p><strong>Preço de mercado:</strong> ${currency.format(fichaProduto.preco)}</p>
            <p><strong>Aplicação técnica:</strong> ${fichaProduto.uso}</p>
            <p class="muted small">
              Dados técnicos consolidados internamente a partir de referências de mercado.
            </p>
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
          <button type="button" class="btn admin-btn" id="open-admin" title="Painel Admin">⚙</button>
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
  // Ficha técnica dentro do app.
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
    if (appState.customer.nomeCompleto) setStep('catalogo')
    else setStep('cadastro')
  })
  document.getElementById('new-registration')?.addEventListener('click', () => {
    if (confirm('Iniciar um novo cadastro de cliente? Os dados atuais serão limpos.')) {
      resetToNewCustomerRegistration()
    }
  })
  document.getElementById('open-admin')?.addEventListener('click', () => setStep('admin'))
  // Cadastro
  const cadastroForm = document.getElementById('cadastro-form') as HTMLFormElement | null
  const whatsappInput = cadastroForm?.querySelector<HTMLInputElement>('input[name="whatsapp"]')
  whatsappInput?.addEventListener('input', () => {
    whatsappInput.value = formatWhatsapp(whatsappInput.value)
  })

  cadastroForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const fd = new FormData(cadastroForm)
    const get = (k: string) => String(fd.get(k) ?? '').trim()
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
      nomeCompleto: get('nomeCompleto'),
      nomeOficina: get('nomeOficina'),
      enderecoCompleto: get('enderecoCompleto'),
      email: get('email'),
      whatsapp: get('whatsapp')
    }
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

  document.querySelectorAll<HTMLInputElement>('input[name="paymentMethod"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      appState.paymentMethod = (radio.value as PaymentMethod)
      const cashBox = document.getElementById('cash-change-box')
      if (appState.paymentMethod === 'dinheiro') cashBox?.classList.remove('hidden')
      else {
        cashBox?.classList.add('hidden')
        appState.cashChangeFor = ''
        if (cashChangeInput) cashChangeInput.value = ''
      }
      persistState()
    })
  })

  const checkoutForm = document.getElementById('checkout-form') as HTMLFormElement | null
  checkoutForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    const selected = document.querySelector<HTMLInputElement>('input[name="deliveryMode"]:checked')
    const selectedPayment = document.querySelector<HTMLInputElement>('input[name="paymentMethod"]:checked')
    appState.deliveryMode = (selected?.value as DeliveryMode) ?? 'entrega'
    appState.paymentMethod = (selectedPayment?.value as PaymentMethod) ?? 'pix'

    if (appState.paymentMethod === 'dinheiro' && appState.cashChangeFor) {
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
    const newProduct: Product = {
      id: `custom-${Date.now()}`,
      nome,
      marca,
      categoria,
      subcategoria: get('subcategoria') || undefined,
      preco,
      imagem: get('imagem') || 'https://placehold.co/400x220/e8f0fe/1a3a6b?text=Produto',
      uso,
      fonte: get('fonte') || '#',
      custom: true
    }
    products = [...products, newProduct]
    saveProducts(products)
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

  // Admin – restaurar padrão
  document.getElementById('reset-products')?.addEventListener('click', () => {
    if (confirm('Restaurar catálogo padrão? Produtos personalizados serão perdidos.')) {
      products = [...defaultProducts]
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
