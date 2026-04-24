import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { buildApp } from '../server/app.mjs'
import { connectMongo } from '../server/db.mjs'
import { seedProductsIfEmpty } from '../server/seed.mjs'

let app
/** Replica set (POST /pedidos usa transação MongoDB; instância standalone falha). */
let replSet
/** @type {Record<string, string | undefined>} */
const savedEnv = {}

beforeAll(async () => {
  for (const k of [
    'MONGODB_URI',
    'JWT_SECRET',
    'ADMIN_PASSWORD',
    'ADMIN_API_KEY',
    'CLOUDINARY_URL',
    'HELMET_DISABLE',
    'PEDIDOS_RATE_MAX'
  ]) {
    savedEnv[k] = process.env[k]
  }

  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' }
  })
  process.env.MONGODB_URI = replSet.getUri()
  process.env.JWT_SECRET = 'unit-test-jwt-secret-at-least-32-bytes'
  process.env.ADMIN_PASSWORD = 'integration-test-password'
  process.env.ADMIN_API_KEY = ''
  process.env.CLOUDINARY_URL = ''
  process.env.HELMET_DISABLE = 'true'
  process.env.PEDIDOS_RATE_MAX = '9999'

  await connectMongo(process.env.MONGODB_URI)
  await seedProductsIfEmpty()
  app = buildApp()
}, 120000)

afterAll(async () => {
  await mongoose.disconnect()
  if (replSet) await replSet.stop()
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
})

describe('GET /health', () => {
  it('retorna ok', async () => {
    const res = await request(app).get('/health').expect(200)
    expect(res.body).toMatchObject({ ok: true })
  })
})

describe('POST /auth/login', () => {
  it('rejeita senha errada', async () => {
    await request(app).post('/auth/login').send({ password: 'wrong' }).expect(401)
  })

  it('aceita senha correta e devolve token', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ password: 'integration-test-password' })
      .expect(200)
    expect(res.body.token).toBeTruthy()
    expect(typeof res.body.token).toBe('string')
  })
})

describe('GET /produtos', () => {
  it('retorna lista após seed', async () => {
    const res = await request(app).get('/produtos').expect(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body.length).toBeGreaterThan(0)
  })
})

describe('POST /pedidos', () => {
  it('rejeita sem itens', async () => {
    await request(app).post('/pedidos').send({ items: [] }).expect(400)
  })

  it('rejeita id de produto inválido', async () => {
    await request(app)
      .post('/pedidos')
      .send({ items: [{ productId: 'nope', qty: 1 }], total: 10, deliveryFee: 0 })
      .expect(400)
  })

  it('rejeita total divergente do calculado no servidor', async () => {
    const listRes = await request(app).get('/produtos')
    const first = listRes.body[0]
    const pid = first.id
    const preco = Number(first.preco) || 10
    await request(app)
      .post('/pedidos')
      .send({
        items: [{ productId: String(pid), qty: 1 }],
        total: preco + 5,
        deliveryFee: 0
      })
      .expect(400)
  })

  it('cria pedido com produto do catálogo (número gerado no servidor)', async () => {
    const listRes = await request(app).get('/produtos')
    const first = listRes.body[0]
    expect(first).toBeTruthy()
    const pid = first.id
    const preco = Number(first.preco) || 10
    const res = await request(app)
      .post('/pedidos')
      .send({
        items: [{ productId: String(pid), qty: 1 }],
        total: preco,
        deliveryFee: 0,
        customer: { nomeCompleto: 'Teste' }
      })
      .expect(201)
    expect(res.body.ok).toBe(true)
    expect(res.body.numero).toMatch(/^PED-/)
    expect(res.body.orderId).toMatch(/^[a-f0-9]{24}$/i)
  })
})

describe('proteção de gestão (JWT)', () => {
  it('GET /pedidos exige credencial quando só JWT_SECRET está definido', async () => {
    const res = await request(app).get('/pedidos').expect(401)
    expect(res.body.erro).toBeTruthy()
  })

  it('GET /pedidos aceita Bearer JWT', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ password: 'integration-test-password' })
      .expect(200)
    const token = login.body.token
    const res = await request(app).get('/pedidos').set('Authorization', `Bearer ${token}`).expect(200)
    expect(Array.isArray(res.body.items)).toBe(true)
    expect(typeof res.body.total).toBe('number')
  })

  it('POST /produtos exige credencial', async () => {
    await request(app)
      .post('/produtos')
      .send({ nome: 'X', marca: 'm', categoria: 'Bermuda', preco: 1, uso: 'u' })
      .expect(401)
  })

  it('POST /produtos aceita JWT e valida corpo', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ password: 'integration-test-password' })
      .expect(200)
    const token = login.body.token
    await request(app).post('/produtos').set('Authorization', `Bearer ${token}`).send({}).expect(400)
  })

  it('POST /produtos com JWT grava imagens e tamanhos no MongoDB', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ password: 'integration-test-password' })
      .expect(200)
    const token = login.body.token
    const body = {
      nome: 'Peça integração',
      marca: 'Teste',
      categoria: 'Camisetas e blusas',
      preco: 29.9,
      estoque: 3,
      uso: 'Descrição teste',
      imagens: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      tamanhos: ['P', 'M', 'G'],
      custom: true,
      modelo: false
    }
    const res = await request(app)
      .post('/produtos')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201)
    expect(res.body.id).toMatch(/^[a-f0-9]{24}$/i)
    expect(res.body.imagens).toHaveLength(2)
    expect(res.body.tamanhos).toEqual(['P', 'M', 'G'])
    const again = await request(app).get('/produtos').expect(200)
    const found = again.body.find((p) => p.id === res.body.id)
    expect(found).toBeTruthy()
    expect(found.tamanhos).toEqual(['P', 'M', 'G'])
  })
})

describe('Helmet', () => {
  it('envia Content-Security-Policy quando Helmet está ativo', async () => {
    const prev = process.env.HELMET_DISABLE
    delete process.env.HELMET_DISABLE
    const appHelmet = buildApp()
    const res = await request(appHelmet).get('/health').expect(200)
    expect(res.headers['content-security-policy']).toBeTruthy()
    process.env.HELMET_DISABLE = prev
  })
})
