const MAX_IMAGENS = 10

/**
 * @param {unknown} raw
 * @param {string[]} tamanhos
 * @param {number} legacyEstoque total antigo (único número) quando não há mapa
 */
export function sanitizeEstoquePorTamanho(raw, tamanhos, legacyEstoque) {
  const sizes = Array.isArray(tamanhos) ? tamanhos.map((x) => String(x).trim()).filter(Boolean) : []
  const out = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const sz of sizes) {
      const v = Number(raw[sz])
      out[sz] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
    }
    return out
  }
  const le = Math.max(0, Math.floor(Number(legacyEstoque) || 0))
  const n = sizes.length || 1
  const base = Math.floor(le / n)
  let rem = le - base * n
  for (const sz of sizes) {
    out[sz] = base + (rem > 0 ? 1 : 0)
    if (rem > 0) rem -= 1
  }
  return out
}

export function sumEstoquePorTamanho(map, tamanhos) {
  const sizes = Array.isArray(tamanhos) ? tamanhos : Object.keys(map || {})
  let s = 0
  for (const sz of sizes) {
    s += Math.max(0, Math.floor(Number(map?.[sz] ?? 0)))
  }
  return s
}

/**
 * @param {import('mongoose').Document} doc
 */
export function toApiProduct(doc) {
  const o = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc
  const idVal = o._id ?? o.id
  const tamanhos = Array.isArray(o.tamanhos) ? o.tamanhos.map((x) => String(x).trim()).filter(Boolean) : []
  const legacy = Math.max(0, Math.floor(Number(o.estoque) || 0))
  const estoquePorTamanho = sanitizeEstoquePorTamanho(o.estoquePorTamanho, tamanhos, legacy)
  const estoque = sumEstoquePorTamanho(estoquePorTamanho, tamanhos)
  return {
    id: String(idVal),
    nome: o.nome,
    marca: o.marca,
    categoria: o.categoria,
    subcategoria: o.subcategoria || undefined,
    preco: o.preco,
    imagens: Array.isArray(o.imagens) ? o.imagens.slice(0, MAX_IMAGENS) : [],
    tamanhos,
    estoquePorTamanho,
    estoque,
    uso: o.uso || '',
    modelo: !!o.modelo,
    custom: !!o.custom
  }
}

export function sanitizeImagens(arr) {
  if (!Array.isArray(arr)) return []
  return arr.map((x) => String(x).trim()).filter(Boolean).slice(0, MAX_IMAGENS)
}
