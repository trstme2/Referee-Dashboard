import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-api-distance',
      configureServer(server) {
        server.middlewares.use('/api/distance', async (req, res) => {
          try {
            const url = new URL(req.url || '', 'http://localhost')
            const origin = (url.searchParams.get('origin') || '').trim()
            const destination = (url.searchParams.get('destination') || '').trim()
            if (!origin || !destination) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'origin and destination are required' }))
              return
            }

            const key = process.env.GOOGLE_MAPS_API_KEY
            if (!key) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY not set' }))
              return
            }

            const apiUrl = new URL('https://maps.googleapis.com/maps/api/directions/json')
            apiUrl.searchParams.set('origin', origin)
            apiUrl.searchParams.set('destination', destination)
            apiUrl.searchParams.set('key', key)

            const r = await fetch(apiUrl.toString())
            const data: any = await r.json()
            const meters = data?.routes?.[0]?.legs?.[0]?.distance?.value
            if (!meters || !Number.isFinite(Number(meters))) {
              res.statusCode = 422
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'No route found' }))
              return
            }
            const miles = Number(meters) / 1609.344
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ miles }))
          } catch (e: any) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: e?.message || 'Unknown error' }))
          }
        })
      },
    },
  ],
})
