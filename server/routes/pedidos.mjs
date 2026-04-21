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

/**
 * POST /pedidos — valida estoque, baixa quantidades e grava pedido (transação).
 * Corpo: { numero, items: [{ productId, qty }], total, customer?, deliveryMode?, paymentMethod?, cashChangeFor? }
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

      orderItems.push({
        productId: p._id,
        nome: p.nome,
        qty,
        tamanho,
        precoUnit: p.preco,
        subtotal: qty * p.preco
      })
    }

    const total = Number(b.total)
    if (Number.isNaN(total) || total < 0) {
      throw new Error('Total do pedido inválido')
    }

    const numero = String(b.numero || '').trim() || `PDO-${Date.now().toString(36)}`

    const [order] = await Order.create(
      [
        {
          numero,
          items: orderItems,
          total,
          customer: b.customer && typeof b.customer === 'object' ? b.customer : {},
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

pedidosRouter.get('/', requireAdminWhenConfigured, async (_req, res) => {
  try {
    const list = await Order.find().sort({ createdAt: -1 }).limit(100).lean()
    res.json(list)
  } catch (e) {
    console.error(e)
    res.status(500).json({ erro: 'Falha ao listar pedidos' })
  }
})
