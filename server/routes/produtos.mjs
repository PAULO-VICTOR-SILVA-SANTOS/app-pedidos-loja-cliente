import express from 'express'
import mongoose from 'mongoose'
import { requireAdminWhenConfigured } from '../middleware/adminAuth.mjs'
import { Product } from '../models/Product.mjs'
import {
  sanitizeImagens,
  sanitizeEstoquePorTamanho,
  sumEstoquePorTamanho,
  toApiProduct
} from '../utils/productApi.mjs'

export const produtosRouter = express.Router()

// 🧪 TESTE SEM MONGODB
produtosRouter.get('/', async (_req, res) => {
  return res.json([{ teste: 'ok' }])
})

// POST (mantido normal)
produtosRouter.post('/', requireAdminWhenConfigured, async (req, res) => {
  try {
    const b = req.body || {}
    const imagens = sanitizeImagens(b.imagens)
    const tamanhos = Array.isArray(b.tamanhos)
      ? b.tamanhos.map((x) => String(x).trim()).filter(Boolean)
      : []

    if (!b.nome || !String(b.nome).trim()) {
      return res.status(400).json({ erro: 'Nome é obrigatório' })
    }

    if (!b.categoria) {
      return res.status(400).json({ erro: 'Categoria é obrigatória' })
    }

    const preco = Number(b.preco)
    if (Number.isNaN(preco) || preco < 0) {
      return res.status(400).json({ erro: 'Preço inválido' })
    }

    const legacyEstoque = Math.max(0, Math.floor(Number(b.estoque) || 0))
    const estoquePorTamanho = sanitizeEstoquePorTamanho(b.estoquePorTamanho, tamanhos, legacyEstoque)
    const estoque = sumEstoquePorTamanho(estoquePorTamanho, tamanhos)

    const doc = await Product.create({
      nome: String(b.nome).trim(),
      marca: String(b.marca ?? '—').trim(),
      categoria: String(b.categoria).trim(),
      subcategoria: b.subcategoria ? String(b.subcategoria).trim() : undefined,
      preco,
      imagens: imagens.length ? imagens : ['https://placehold.co/400x220/e8f0fe/1a3a6b?text=Foto'],
      tamanhos,
      estoquePorTamanho,
      estoque,
      uso: String(b.uso ?? '').trim(),
      modelo: !!b.modelo,
      custom: !!b.custom
    })

    res.status(201).json(toApiProduct(doc))
  } catch (e) {
    console.error(e)
    res.status(500).json({ erro: 'Falha ao criar produto' })
  }
})

// PATCH
produtosRouter.patch('/:id', requireAdminWhenConfigured, async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ erro: 'ID de produto inválido' })
    }

    const p = await Product.findById(id)
    if (!p) return res.status(404).json({ erro: 'Produto não encontrado' })

    const b = req.body || {}

    if (b.nome != null) p.nome = String(b.nome).trim()
    if (b.marca != null) p.marca = String(b.marca).trim()
    if (b.categoria != null) p.categoria = String(b.categoria).trim()
    if (b.subcategoria !== undefined) p.subcategoria = b.subcategoria ? String(b.subcategoria).trim() : undefined

    if (b.preco != null) {
      const preco = Number(b.preco)
      if (Number.isNaN(preco) || preco < 0) {
        return res.status(400).json({ erro: 'Preço inválido' })
      }
      p.preco = preco
    }

    if (b.imagens != null) {
      p.imagens = sanitizeImagens(b.imagens)
    }

    if (b.tamanhos != null) {
      p.tamanhos = Array.isArray(b.tamanhos)
        ? b.tamanhos.map((x) => String(x).trim()).filter(Boolean)
        : []
    }

    if (b.estoquePorTamanho != null) {
      const sizes = Array.isArray(p.tamanhos) ? p.tamanhos : []
      const legacy = b.estoque != null
        ? Math.max(0, Math.floor(Number(b.estoque)))
        : Number(p.estoque) || 0

      p.estoquePorTamanho = sanitizeEstoquePorTamanho(b.estoquePorTamanho, sizes, legacy)
      p.estoque = sumEstoquePorTamanho(p.estoquePorTamanho, sizes)
    } else if (b.estoque != null) {
      const sizes = Array.isArray(p.tamanhos) ? p.tamanhos : []
      const legacy = Math.max(0, Math.floor(Number(b.estoque)))

      p.estoquePorTamanho = sanitizeEstoquePorTamanho(null, sizes, legacy)
      p.estoque = sumEstoquePorTamanho(p.estoquePorTamanho, sizes)
    }

    if (b.uso != null) p.uso = String(b.uso).trim()
    if (b.modelo != null) p.modelo = !!b.modelo
    if (b.custom != null) p.custom = !!b.custom

    await p.save()

    res.json(toApiProduct(p))
  } catch (e) {
    console.error(e)
    res.status(500).json({ erro: 'Falha ao atualizar produto' })
  }
})

// DELETE
produtosRouter.delete('/:id', requireAdminWhenConfigured, async (req, res) => {
  try {
    const { id } = req.params

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ erro: 'ID de produto inválido' })
    }

    const r = await Product.deleteOne({ _id: id })

    if (r.deletedCount === 0) {
      return res.status(404).json({ erro: 'Produto não encontrado' })
    }

    res.status(204).end()
  } catch (e) {
    console.error(e)
    res.status(500).json({ erro: 'Falha ao excluir produto' })
  }
})