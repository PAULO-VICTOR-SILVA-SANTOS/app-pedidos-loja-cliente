import crypto from 'crypto'
import express from 'express'
import rateLimit from 'express-rate-limit'
import mongoose from 'mongoose'
import { requireAdminWhenConfigured } from '../middleware/adminAuth.mjs'
import { Product } from '../models/Product.mjs'
import { Order } from '../models/Order.mjs'

export const pedidosRouter = express.Router()

/** Limita abuso em checkout público (POST sem chave de admin). */
const postPedidoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Math.max(5, parseInt(process.env.PEDIDOS_RATE_MAX || '45', 10) || 45),
  message: { erro: 'Muitos pedidos deste endereço. Aguarde alguns minutos e tente de novo.' },
  standardHeaders: true,
  legacyHeaders: false
})

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100
}

/** Compara valores monetários em centavos (evita float). */
function moneyEquals(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100)
}

function generateOrderNumero() {
  return `PED-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`
}

/**
 * POST /pedidos — valida estoque, recalcula total com preços do banco, baixa estoque e grava pedido (transação).
 * Corpo: { items: [{ productId, qty, tamanho? }], total, deliveryFee?, customer?, deliveryMode?, paymentMethod?, cashChangeFor? }
 * O campo `numero` do cliente é ignorado; o número oficial é gerado no servidor e devolvido na resposta.
 */
pedidosRouter.post('/', postPedidoLimiter, async (req, res) => {
  const b = req.body || {}
  const items = b.items
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ erro: 'Itens do pedido são obrigatórios' })
  }

  const session = await mongoose.startSession()
  session.startTransaction()
  try {
    const orderItems = []
    let sumSubtotal = 0

    for (const line of items) {
      const pid = line.productId
      const qty = Math.floor(Number(line.qty))
      const tamanho = String(line.tamanho ?? '').trim()
      if (!mongoose.isValidObjectId(pid)) {
        throw new Error('ID de produto inválido no pedido')
      }
      if (qty < 1) throw new Error('Quantidade inválida')
      const p = await Product.findById(pid).session(session)
      if (!p) throw new Error(`Produto não encontrado: ${pid}`)

      const map = p.estoquePorTamanho && typeof p.estoquePorTamanho === 'object' ? p.estoquePorTamanho : null
      const hasPerSize = map && Object.keys(map).length > 0

      if (hasPerSize) {
        if (!tamanho) throw new Error(`Informe o tamanho no item: "${p.nome}"`)
        const cur = Math.max(0, Math.floor(Number(map[tamanho] ?? 0)))
        if (cur < qty) {
          throw new Error(`Estoque insuficiente para "${p.nome}" (${tamanho}). Disponível: ${cur}`)
        }
        map[tamanho] = cur - qty
        p.estoquePorTamanho = map
        p.estoque = Object.values(map).reduce((a, v) => a + Math.max(0, Math.floor(Number(v) || 0)), 0)
      } else {
        if (p.estoque < qty) {
          throw new Error(`Estoque insuficiente para "${p.nome}". Disponível: ${p.estoque}`)
        }
        p.estoque = Math.max(0, p.estoque - qty)
      }
      await p.save({ session })

      const precoUnit = roundMoney(Number(p.preco))
      const subtotal = roundMoney(qty * precoUnit)
      sumSubtotal = roundMoney(sumSubtotal + subtotal)

      orderItems.push({
        productId: p._id,
        nome: p.nome,
        qty,
        tamanho,
        precoUnit,
        subtotal
      })
    }

    const deliveryFee = Math.max(0, roundMoney(Number(b.deliveryFee) || 0))
    const expectedTotal = roundMoney(sumSubtotal + deliveryFee)
    const clientTotal = roundMoney(Number(b.total))

    if (Number.isNaN(clientTotal) || clientTotal < 0) {
      throw new Error('Total do pedido inválido')
    }
    if (!moneyEquals(expectedTotal, clientTotal)) {
      throw new Error(
        `Total divergente do calculado no servidor (${expectedTotal.toFixed(2)}). Atualize a página e tente novamente.`
      )
    }

    const customer =
      b.customer && typeof b.customer === 'object' && !Array.isArray(b.customer) ? b.customer : {}

    const numero = generateOrderNumero()
    const [order] = await Order.create(
      [
        {
          numero,
          items: orderItems,
          total: expectedTotal,
          customer,
          deliveryMode: String(b.deliveryMode ?? ''),
          paymentMethod: String(b.paymentMethod ?? ''),
          cashChangeFor: String(b.cashChangeFor ?? '')
        }
      ],
      { session }
    )

    await session.commitTransaction()
    res.status(201).json({ ok: true, orderId: String(order._id), numero: order.numero })
  } catch (e) {
    await session.abortTransaction()
    const msg = e instanceof Error ? e.message : 'Erro ao registrar pedido'
    res.status(400).json({ erro: msg })
  } finally {
    session.endSession()
  }
})

const DEFAULT_LIST_LIMIT = 100
const MAX_LIST_LIMIT = 500

pedidosRouter.get('/', requireAdminWhenConfigured, async (req, res) => {
  try {
    const rawLimit = parseInt(String(req.query.limit ?? ''), 10)
    const rawSkip = parseInt(String(req.query.skip ?? ''), 10)
    const limit = Math.min(
      MAX_LIST_LIMIT,
      Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_LIST_LIMIT)
    )
    const skip = Math.max(0, Number.isFinite(rawSkip) ? rawSkip : 0)

    const [list, total] = await Promise.all([
      Order.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Order.countDocuments()
    ])
    res.json({ items: list, total, limit, skip })
  } catch (e) {
    console.error(e)
    res.status(500).json({ erro: 'Falha ao listar pedidos' })
  }
})
