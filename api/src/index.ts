import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()

type JsonObject = Record<string, unknown>

type PaymentRow = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
  idempotencyKey: string | null
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function newId(): string {
  return crypto.randomUUID()
}

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))

// 1. Create a home
app.post('/api/homes', async (c) => {
  const body = await readBody(c.req.raw)

  if (!isObject(body) || typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'Invalid home name' }, 422)
  }

  const id = newId()
  const name = body.name.trim()

  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()

  return c.json({ id, name }, 201)
})

// 2. Add a member
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const body = await readBody(c.req.raw)

  if (!isObject(body) || typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'Invalid member name' }, 422)
  }

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const id = newId()
  const name = body.name.trim()

  await c.env.DB.prepare('INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)')
    .bind(id, homeId, name)
    .run()

  return c.json({ id, homeId, name }, 201)
})

// 3. Create a bill and split it
app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const body = await readBody(c.req.raw)

  if (
    !isObject(body) ||
    typeof body.title !== 'string' ||
    !body.title.trim() ||
    typeof body.totalCents !== 'number' ||
    !Number.isSafeInteger(body.totalCents) ||
    body.totalCents <= 0
  ) {
    return c.json({ error: 'Invalid bill details or amount' }, 422)
  }

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const membersResult = await c.env.DB.prepare(
    'SELECT id FROM members WHERE home_id = ? ORDER BY member_order ASC',
  )
    .bind(homeId)
    .all<{ id: string }>()

  const members = membersResult.results

  if (members.length === 0) {
    return c.json({ error: 'Home has no members' }, 422)
  }

  const id = newId()
  const title = body.title.trim()
  const totalCents = body.totalCents

  const base = Math.floor(totalCents / members.length)
  const remainder = totalCents % members.length

  const shares = members.map((member, index) => ({
    id: newId(),
    memberId: member.id,
    amountCents: base + (index < remainder ? 1 : 0),
    paidAt: null,
  }))

  const statements = [
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
    ).bind(id, homeId, title, totalCents),

    ...shares.map((share) =>
      c.env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)',
      ).bind(share.id, id, share.memberId, share.amountCents),
    ),
  ]

  await c.env.DB.batch(statements)

  return c.json(
    {
      id,
      homeId,
      title,
      totalCents,
      shares,
    },
    201,
  )
})

// 4. Pay a share
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const key = c.req.header('Idempotency-Key')?.trim()

  if (!key) {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const findShare = () =>
    c.env.DB.prepare(`
      SELECT
        s.id,
        s.member_id AS memberId,
        s.amount_cents AS amountCents,
        s.paid_at AS paidAt,
        s.idempotency_key AS idempotencyKey
      FROM shares s
      INNER JOIN bills b ON b.id = s.bill_id
      WHERE b.id = ? AND s.id = ?
    `)
      .bind(billId, shareId)
      .first<PaymentRow>()

  const share = await findShare()

  if (!share) {
    return c.json({ error: 'Bill or share not found' }, 404)
  }

  if (share.paidAt !== null) {
    if (share.idempotencyKey === key) {
      return c.json(
        {
          id: share.id,
          memberId: share.memberId,
          amountCents: share.amountCents,
          paidAt: share.paidAt,
        },
        200,
      )
    }

    return c.json({ error: 'Share already paid' }, 409)
  }

  await c.env.DB.prepare(`
    UPDATE shares
    SET paid_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
        idempotency_key = ?
    WHERE id = ? AND bill_id = ? AND paid_at IS NULL
  `)
    .bind(key, shareId, billId)
    .run()

  // Read the saved result to handle concurrent requests safely.
  const updated = await findShare()

  if (!updated || updated.paidAt === null) {
    return c.json({ error: 'Payment could not be completed' }, 500)
  }

  if (updated.idempotencyKey !== key) {
    return c.json({ error: 'Share already paid' }, 409)
  }

  return c.json(
    {
      id: updated.id,
      memberId: updated.memberId,
      amountCents: updated.amountCents,
      paidAt: updated.paidAt,
    },
    200,
  )
})

// Get an existing home with its members, bills and shares
app.get('/api/homes/:homeId', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id, name FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string; name: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const members = await c.env.DB.prepare(
    'SELECT id, name FROM members WHERE home_id = ? ORDER BY member_order ASC',
  )
    .bind(homeId)
    .all<{ id: string; name: string }>()

  const bills = await c.env.DB.prepare(
    'SELECT id, title, total_cents AS totalCents FROM bills WHERE home_id = ?',
  )
    .bind(homeId)
    .all<{ id: string; title: string; totalCents: number }>()

  const shares = await c.env.DB.prepare(`
    SELECT
      s.id,
      s.bill_id AS billId,
      s.member_id AS memberId,
      m.name AS memberName,
      s.amount_cents AS amountCents,
      s.paid_at AS paidAt
    FROM shares s
    JOIN members m ON m.id = s.member_id
    JOIN bills b ON b.id = s.bill_id
    WHERE b.home_id = ?
  `)
    .bind(homeId)
    .all<{
      id: string
      billId: string
      memberId: string
      memberName: string
      amountCents: number
      paidAt: string | null
    }>()

  return c.json({
    home,
    members: members.results,
    bills: bills.results.map((bill) => ({
      ...bill,
      shares: shares.results.filter((share) => share.billId === bill.id),
    })),
  })
})

// 5. Get home balances
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?').bind(homeId).first()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const result = await c.env.DB.prepare(`
    SELECT
      m.id AS memberId,
      m.name AS name,
      COALESCE(
        SUM(
          CASE
            WHEN b.id IS NOT NULL AND s.paid_at IS NULL
            THEN s.amount_cents
            ELSE 0
          END
        ), 0
      ) AS outstandingCents
    FROM members m
    LEFT JOIN shares s ON s.member_id = m.id
    LEFT JOIN bills b ON b.id = s.bill_id
      AND b.home_id = m.home_id
    WHERE m.home_id = ?
    GROUP BY m.id, m.name, m.member_order
    ORDER BY m.member_order ASC
  `)
    .bind(homeId)
    .all<{
      memberId: string
      name: string
      outstandingCents: number
    }>()

  return c.json({ balances: result.results }, 200)
})

// JSON error responses
app.notFound((c) => c.json({ error: 'Route not found' }, 404))

app.onError((_error, c) => {
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
