import mongoose from 'mongoose'

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    nome: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    tamanho: { type: String, default: '' },
    precoUnit: { type: Number, required: true },
    subtotal: { type: Number, required: true }
  },
  { _id: false }
)

const orderSchema = new mongoose.Schema(
  {
    numero: { type: String, required: true, trim: true },
    items: { type: [orderItemSchema], required: true },
    total: { type: Number, required: true, min: 0 },
    customer: { type: mongoose.Schema.Types.Mixed, default: {} },
    deliveryMode: { type: String, default: '' },
    paymentMethod: { type: String, default: '' },
    cashChangeFor: { type: String, default: '' }
  },
  { timestamps: true }
)

export const Order = mongoose.model('Order', orderSchema)
