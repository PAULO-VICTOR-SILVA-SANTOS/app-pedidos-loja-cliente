import mongoose from 'mongoose'

const productSchema = new mongoose.Schema(
  {
    nome: { type: String, required: true, trim: true },
    marca: { type: String, default: '—', trim: true },
    categoria: { type: String, required: true, trim: true },
    subcategoria: { type: String, trim: true },
    preco: { type: Number, required: true, min: 0 },
    imagens: { type: [String], default: [] },
    tamanhos: { type: [String], default: [] },
    /** Quantidade por tamanho (chaves = PP, P, M, 36, …). */
    estoquePorTamanho: { type: mongoose.Schema.Types.Mixed, default: {} },
    estoque: { type: Number, required: true, min: 0, default: 0 },
    uso: { type: String, default: '', trim: true },
    modelo: { type: Boolean, default: false },
    custom: { type: Boolean, default: false }
  },
  { timestamps: true }
)

export const Product = mongoose.model('Product', productSchema)
