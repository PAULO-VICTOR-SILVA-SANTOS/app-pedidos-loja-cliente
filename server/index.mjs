import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { connectMongo } from './db.mjs'
import { buildApp } from './app.mjs'
import { seedProductsIfEmpty } from './seed.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.join(__dirname, '..')

dotenv.config({ path: path.join(rootDir, '.env') })

const app = buildApp()
const PORT = Number(process.env.PORT) || 3000
const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/castro_pedidos'

async function main() {
  try {
    await connectMongo(MONGODB_URI)
    await seedProductsIfEmpty()
    console.log('[api] Mongo conectado com sucesso')
  } catch (e) {
    console.error('[api] Falha ao conectar no MongoDB:', e?.message || e)
    process.exit(1)
  }

  // 🔥 CORREÇÃO IMPORTANTE AQUI
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[api] rodando na porta ${PORT}`)

    if (process.env.JWT_SECRET) {
      console.log('[api] JWT_SECRET ativa')
    }

    if (process.env.ADMIN_API_KEY) {
      console.log('[api] ADMIN_API_KEY ativa')
    }

    if (process.env.CLOUDINARY_URL) {
      console.log('[api] Cloudinary ativo')
    }

    console.log(`GET  /health`)
    console.log(`GET  /produtos`)
  })
}

main()