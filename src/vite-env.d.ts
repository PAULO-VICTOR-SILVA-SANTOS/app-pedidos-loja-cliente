/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base da API (ex.: https://meu-servidor.com). Se vazio, em dev usa `/produtos` via proxy. */
  readonly VITE_API_URL?: string
  /** Se `true` em build de produção, tenta buscar catálogo na API (requer VITE_API_URL em geral). */
  readonly VITE_SYNC_PRODUCTS_FROM_API?: string
  /** Igual a `ADMIN_API_KEY` no servidor — enviada nas rotas de gestão (produtos, upload, listagem de pedidos). */
  readonly VITE_ADMIN_API_KEY?: string
  /**
   * Se `"true"`, o painel administrativo exibe o bloco "Pedidos no servidor" (JWT / carregar pedidos da API).
   * Omita em produção para o lojista; use só no `.env` local do desenvolvedor.
   */
  readonly VITE_SHOW_SERVER_ORDERS_DEV?: string
}

declare module '*.jpg' {
  const src: string
  export default src
}

declare module '*.JPG' {
  const src: string
  export default src
}

declare module '*.jpeg' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.svg' {
  const src: string
  export default src
}
