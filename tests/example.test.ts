import request from 'supertest'
import app from '../src/app.js'

describe('Example API Endpoints', () => {
  describe('GET /health', () => {
    it('should return 200 OK with health status', async () => {
      const response = await request(app).get('/health')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('status', 'ok')
      expect(response.body).toHaveProperty('timestamp')
      expect(response.body).toHaveProperty('uptime')
    })
  })

  describe('GET /api/examples', () => {
    it('should return 200 OK with examples list', async () => {
      const response = await request(app).get('/api/examples')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('data')
      expect(Array.isArray(response.body.data)).toBe(true)
    })
  })

  describe('GET /api/examples/:id', () => {
    it('should return 200 OK with example by id', async () => {
      const response = await request(app).get('/api/examples/1')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)
      expect(response.body.data).toHaveProperty('id', 1)
    })

    it('should return 404 for non-existent example', async () => {
      const response = await request(app).get('/api/examples/999')

      expect(response.status).toBe(404)
      expect(response.body).toHaveProperty('success', false)
    })
  })

  describe('POST /api/examples', () => {
    it('should create a new example', async () => {
      const newExample = {
        name: 'Test Example',
        description: 'Test Description',
      }

      const response = await request(app).post('/api/examples').send(newExample)

      expect(response.status).toBe(201)
      expect(response.body).toHaveProperty('success', true)
      expect(response.body.data).toHaveProperty('name', newExample.name)
    })

    it('should return 400 if name is missing', async () => {
      const response = await request(app)
        .post('/api/examples')
        .send({ description: 'No name' })

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('success', false)
    })
  })

  describe('GET /non-existent-route', () => {
    it('should return 404 for non-existent route', async () => {
      const response = await request(app).get('/non-existent-route')

      expect(response.status).toBe(404)
      expect(response.body).toHaveProperty('success', false)
    })
  })
})
