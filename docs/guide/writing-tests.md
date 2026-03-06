# Writing Effective Tests

Good API test coverage is not just about hitting each endpoint once. This guide explains how to write tests that provide meaningful coverage across all the dimensions the analyzer measures.

## General principles

1. **Test behavior, not implementation** – describe what the API should do from the consumer's perspective.
2. **One assertion focus per test** – a test named `POST /orders returns 422 for missing items` should do exactly that.
3. **Use annotations** – `@businessRule`, `@flow`, `@security`, `@errorScenario` keywords in test descriptions activate the corresponding coverage analyzers.
4. **Cover the unhappy path** – most bugs live in error handling, edge cases, and concurrent access.
5. **Keep tests independent** – each test should set up and tear down its own state.

## Endpoint coverage tests

To register coverage for `GET /users`:

```typescript
describe('Users API', () => {
  it('GET /users returns a list of users', async () => {
    const response = await request(app).get('/users')
    expect(response.status).toBe(200)
    expect(Array.isArray(response.body)).toBe(true)
  })

  it('POST /users creates a new user', async () => {
    const response = await request(app)
      .post('/users')
      .send({ name: 'Alice', email: 'alice@example.com' })
    expect(response.status).toBe(201)
  })
})
```

The analyzer matches test description strings against `METHOD /path` patterns from the OpenAPI spec.

## Parameter coverage tests

For each parameter test the four categories:

```typescript
describe('GET /users/{id} - parameter coverage', () => {
  // Valid value
  it('GET /users/123 returns user for valid id', async () => {
    const response = await request(app).get('/users/123')
    expect(response.status).toBe(200)
  })

  // Boundary value
  it('GET /users/0 handles boundary id=0', async () => {
    const response = await request(app).get('/users/0')
    expect([200, 404]).toContain(response.status)
  })

  // Missing value (handled by the path constraint; test via query params)
  it('GET /users without id missing required query param', async () => {
    const response = await request(app).get('/users?sort=')
    expect(response.status).toBe(400)
  })

  // Invalid value
  it('GET /users/abc returns 400 for non-numeric id', async () => {
    const response = await request(app).get('/users/abc')
    expect(response.status).toBe(400)
  })
})
```

## Business rule tests

Use the `@businessRule <rule-id>/<scenario-id>` annotation:

```typescript
it('applies 10% discount after 5th order @businessRule discount-eligibility/repeat-buyer', async () => {
  // Create 5 previous orders for the user
  const response = await request(app)
    .post('/orders')
    .send({ userId: 'vip-user', items: [{ sku: 'A1', qty: 1 }] })
  expect(response.body.discountApplied).toBe(0.1)
})

it('no discount for first-time buyer @businessRule discount-eligibility/first-time-buyer', async () => {
  const response = await request(app)
    .post('/orders')
    .send({ userId: 'new-user', items: [{ sku: 'A1', qty: 1 }] })
  expect(response.body.discountApplied).toBe(0)
})
```

The rule IDs must match those defined in your `business-rules.yaml`.

## Integration flow tests

Use the `@flow <flow-id>` annotation. The test description must reference the flow ID:

```typescript
it('completes full checkout flow @flow user-checkout', async () => {
  // Step 1: fetch the user
  const user = await request(app).get('/users/u1')
  expect(user.status).toBe(200)

  // Step 2: create an order
  const order = await request(app)
    .post('/orders')
    .send({ userId: 'u1', items: [{ sku: 'X9', qty: 2 }] })
  expect(order.status).toBe(201)

  // Step 3: read the order back
  const fetched = await request(app).get(`/orders/${order.body.id}`)
  expect(fetched.status).toBe(200)

  // Step 4: pay
  const payment = await request(app)
    .post('/payments')
    .send({ orderId: order.body.id, method: 'card' })
  expect(payment.status).toBe(201)
})
```

## Security tests

Use the `@security` annotation along with a category keyword (e.g. `authentication`, `authorization`, `injection`):

```typescript
describe('Security tests @security', () => {
  it('returns 401 when Authorization header is missing @security authentication', async () => {
    const response = await request(app).get('/users/1')
    expect(response.status).toBe(401)
  })

  it('returns 403 when user tries to access another user @security authorization', async () => {
    const response = await request(app)
      .get('/users/999')
      .set('Authorization', 'Bearer user-1-token')
    expect(response.status).toBe(403)
  })

  it('rejects SQL injection in name param @security injection', async () => {
    const response = await request(app)
      .post('/users')
      .send({ name: "'; DROP TABLE users;--" })
    expect(response.status).toBe(400)
  })
})
```

Reference: [OWASP API Security Top 10](https://owasp.org/www-project-api-security/).

## Error handling tests

```typescript
describe('Error handling', () => {
  it('returns 404 when user not found @errorScenario not-found', async () => {
    const response = await request(app).get('/users/nonexistent')
    expect(response.status).toBe(404)
    expect(response.body.error).toBeDefined()
  })

  it('returns 422 when order has no items @errorScenario validation', async () => {
    const response = await request(app)
      .post('/orders')
      .send({ userId: 'u1', items: [] })
    expect(response.status).toBe(422)
  })

  it('handles upstream timeout gracefully @errorScenario timeout', async () => {
    // Mock a slow downstream service
    jest.spyOn(paymentService, 'charge').mockRejectedValue(new Error('timeout'))
    const response = await request(app)
      .post('/payments')
      .send({ orderId: 'o1', method: 'card' })
    expect(response.status).toBe(503)
    expect(response.body.error).toMatch(/timeout/)
  })
})
```

## Performance and resilience tests

```typescript
describe('Resilience @resilience', () => {
  it('retries failed downstream call @resilience retry', async () => {
    let callCount = 0
    jest.spyOn(inventoryService, 'check').mockImplementation(async () => {
      callCount++
      if (callCount < 3) throw new Error('transient error')
      return { available: true }
    })
    const response = await request(app).get('/products/p1/availability')
    expect(response.status).toBe(200)
    expect(callCount).toBe(3)
  })

  it('opens circuit breaker after 5 failures @resilience circuit-breaker', async () => {
    jest.spyOn(paymentService, 'charge').mockRejectedValue(new Error('downstream down'))
    for (let i = 0; i < 5; i++) {
      await request(app).post('/payments').send({ orderId: `o${i}` })
    }
    const response = await request(app).post('/payments').send({ orderId: 'o6' })
    expect(response.status).toBe(503)
    expect(response.body.error).toMatch(/circuit/i)
  })
})
```

## Test annotation reference

| Annotation | Coverage type | Format |
|------------|--------------|--------|
| _(endpoint in description)_ | Endpoint | `GET /users` |
| _(parameter scenario in description)_ | Parameter | `boundary id=0` |
| `@businessRule` | Business | `@businessRule rule-id/scenario-id` |
| `@flow` | Integration | `@flow flow-id` |
| `@security` | Security | `@security category` |
| `@errorScenario` | Error | `@errorScenario scenario-keyword` |
| `@resilience` | Resilience | `@resilience category` |

## Next steps

- [Extending via Plugins →](/guide/plugins)
- [Interpreting Reports →](/guide/interpreting-reports)
