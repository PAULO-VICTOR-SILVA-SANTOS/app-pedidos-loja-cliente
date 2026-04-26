import mongoose from 'mongoose'

/**
 * @param {string} uri
 */
export async function connectMongo(uri) {
  try {
    mongoose.set('strictQuery', true)

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000 // ⏱️ evita travamento
    })

    console.log('[db] MongoDB conectado')
  } catch (error) {
    console.error('[db] Erro ao conectar no Mongo:', error.message)
    throw error
  }
}

export function isMongoReady() {
  return mongoose.connection.readyState === 1
}