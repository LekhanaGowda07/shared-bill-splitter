import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/')({
  component: Home,
})

type Member = {
  id: string
  name: string
}

type Share = {
  id: string
  memberId: string
  memberName: string
  amountCents: number
  paidAt: string | null
}

type Bill = {
  id: string
  title: string
  totalCents: number
  shares: Share[]
}

type HomeData = {
  home: { id: string; name: string }
  members: Member[]
  bills: Bill[]
}

type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

const money = (cents: number) => `₹${(cents / 100).toFixed(2)}`

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong')
  }

  return data as T
}

function Home() {
  const [homeId, setHomeId] = useState(() => localStorage.getItem('bill-splitter-home') || '')
  const [data, setData] = useState<HomeData | null>(null)
  const [balances, setBalances] = useState<Balance[]>([])
  const [homeName, setHomeName] = useState('')
  const [memberName, setMemberName] = useState('')
  const [billTitle, setBillTitle] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const refresh = useCallback(
    async (id = homeId) => {
      if (!id) return

      const [home, balanceData] = await Promise.all([
        api<HomeData>(`/api/homes/${id}`),
        api<{ balances: Balance[] }>(`/api/homes/${id}/balances`),
      ])

      setData(home)
      setBalances(balanceData.balances)
    },
    [homeId],
  )

  useEffect(() => {
    if (homeId) {
      refresh().catch((err) => setError(err.message))
    }
  }, [homeId, refresh])

  async function createHome(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const result = await api<{ id: string }>('/api/homes', {
        method: 'POST',
        body: JSON.stringify({ name: homeName }),
      })

      localStorage.setItem('bill-splitter-home', result.id)
      setHomeId(result.id)
      setHomeName('')
      setMessage('Home created successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create home')
    } finally {
      setLoading(false)
    }
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    if (!homeId) return

    setLoading(true)
    setError('')

    try {
      await api(`/api/homes/${homeId}/members`, {
        method: 'POST',
        body: JSON.stringify({ name: memberName }),
      })

      setMemberName('')
      await refresh()
      setMessage('Member added successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add member')
    } finally {
      setLoading(false)
    }
  }

  async function createBill(e: React.FormEvent) {
    e.preventDefault()
    if (!homeId) return

    const amount = Number(billAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid bill amount')
      return
    }

    setLoading(true)
    setError('')

    try {
      await api(`/api/homes/${homeId}/bills`, {
        method: 'POST',
        body: JSON.stringify({
          title: billTitle,
          totalCents: Math.round(amount * 100),
        }),
      })

      setBillTitle('')
      setBillAmount('')
      await refresh()
      setMessage('Bill created and split successfully')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create bill')
    } finally {
      setLoading(false)
    }
  }

  async function payShare(billId: string, shareId: string) {
    setLoading(true)
    setError('')

    try {
      await api(`/api/bills/${billId}/shares/${shareId}/pay`, {
        method: 'POST',
        headers: {
          'Idempotency-Key': crypto.randomUUID(),
        },
      })

      await refresh()
      setMessage('Payment marked as completed')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setLoading(false)
    }
  }

  function switchHome() {
    localStorage.removeItem('bill-splitter-home')
    setHomeId('')
    setData(null)
    setBalances([])
    setError('')
    setMessage('')
  }

  return (
    <main className="app">
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #f5f6fa; color: #20243a; font-family: Inter, system-ui, sans-serif; }
        .app { max-width: 1100px; margin: auto; padding: 32px 22px 60px; }
        .header { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 30px; }
        .brand { font-size: 27px; font-weight: 800; letter-spacing: -1px; }
        .brand span { color: #6658d3; }
        .subtitle { color: #777d91; margin-top: 5px; font-size: 14px; }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
        .card { background: white; border: 1px solid #e9eaf0; border-radius: 15px; padding: 23px; box-shadow: 0 4px 18px #1c245008; }
        .wide { grid-column: 1 / -1; }
        h2 { font-size: 18px; margin: 0 0 18px; }
        .muted { color: #85899a; font-size: 13px; }
        input { width: 100%; border: 1px solid #dedfea; border-radius: 9px; padding: 12px 13px; margin-bottom: 12px; font-size: 14px; outline: none; }
        input:focus { border-color: #7668df; box-shadow: 0 0 0 3px #7668df18; }
        button { border: 0; border-radius: 9px; padding: 11px 16px; background: #6658d3; color: white; font-weight: 650; cursor: pointer; }
        button:disabled { opacity: .55; cursor: not-allowed; }
        button.secondary { background: #efedff; color: #5749c1; }
        button.small { padding: 7px 11px; font-size: 12px; }
        .row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .member { padding: 11px 0; border-bottom: 1px solid #f0f0f4; display: flex; align-items: center; gap: 10px; }
        .avatar { width: 34px; height: 34px; border-radius: 50%; background: #eeecff; color: #5b4bc4; display: grid; place-items: center; font-weight: 700; }
        .bill { border: 1px solid #ececf2; border-radius: 11px; padding: 16px; margin-top: 12px; }
        .share { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid #f0f0f4; font-size: 14px; }
        .paid { color: #16845b; font-size: 12px; font-weight: 700; }
        .unpaid { color: #c17b23; font-size: 12px; font-weight: 700; }
        .amount { font-size: 23px; font-weight: 800; margin-top: 7px; }
        .notice { padding: 12px 15px; border-radius: 9px; margin-bottom: 16px; font-size: 14px; }
        .error { background: #fff0f0; color: #bd3434; }
        .success { background: #eaf8f1; color: #16845b; }
        .empty { padding: 22px 0; text-align: center; color: #898da0; font-size: 14px; }
        @media (max-width: 650px) { .grid { grid-template-columns: 1fr; } .wide { grid-column: auto; } .app { padding: 22px 14px; } .header { align-items: flex-start; } .brand { font-size: 23px; } }
      `}</style>

      <header className="header">
        <div>
          <div className="brand">
            Split<span>Wise.</span>
          </div>
          <div className="subtitle">Share expenses. Keep things simple.</div>
        </div>
        {data && (
          <button type="button" className="secondary small" onClick={switchHome}>
            Switch home
          </button>
        )}
      </header>

      {error && <div className="notice error">{error}</div>}
      {message && <div className="notice success">{message}</div>}

      {!homeId || !data ? (
        <section className="card" style={{ maxWidth: 480, margin: '55px auto' }}>
          <h2>{homeId ? 'Loading your home...' : 'Create your home'}</h2>
          {!homeId && (
            <form onSubmit={createHome}>
              <p className="muted">Start a shared space for your friends, roommates or trip.</p>
              <input
                value={homeName}
                onChange={(e) => setHomeName(e.target.value)}
                placeholder="Enter home name"
                required
              />
              <button type="submit" disabled={loading}>
                Create home
              </button>
            </form>
          )}
        </section>
      ) : (
        <>
          <section className="card wide" style={{ marginBottom: 20 }}>
            <div className="row">
              <div>
                <div className="muted">YOUR SHARED SPACE</div>
                <h1 style={{ margin: '6px 0', fontSize: 27 }}>{data.home.name}</h1>
                <div className="muted">
                  {data.members.length} members · {data.bills.length} bills
                </div>
              </div>
              <div>
                <div className="muted">Total outstanding</div>
                <div className="amount">
                  {money(balances.reduce((sum, b) => sum + b.outstandingCents, 0))}
                </div>
              </div>
            </div>
          </section>

          <div className="grid">
            <section className="card">
              <h2>Add a member</h2>
              <form onSubmit={addMember}>
                <input
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Member name"
                  required
                />
                <button type="submit" disabled={loading}>
                  Add member
                </button>
              </form>
              <h2 style={{ marginTop: 25 }}>Members ({data.members.length})</h2>
              {data.members.length === 0 && (
                <div className="empty">No members yet. Add your first member.</div>
              )}
              {data.members.map((member) => (
                <div className="member" key={member.id}>
                  <div className="avatar">{member.name.charAt(0).toUpperCase()}</div>
                  <strong>{member.name}</strong>
                </div>
              ))}
            </section>

            <section className="card">
              <h2>Create a bill</h2>
              <form onSubmit={createBill}>
                <input
                  value={billTitle}
                  onChange={(e) => setBillTitle(e.target.value)}
                  placeholder="Bill title (e.g. Groceries)"
                  required
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  placeholder="Total amount (₹)"
                  required
                />
                <button type="submit" disabled={loading || data.members.length === 0}>
                  Split bill equally
                </button>
                {data.members.length === 0 && (
                  <p className="muted">Add members before creating a bill.</p>
                )}
              </form>
            </section>

            <section className="card">
              <h2>Outstanding balances</h2>
              {balances.length === 0 && <div className="empty">No member balances available.</div>}
              {balances.map((balance) => (
                <div className="member" key={balance.memberId}>
                  <div>
                    <strong>{balance.name}</strong>
                    <div className="muted">Yet to pay</div>
                  </div>
                  <strong>{money(balance.outstandingCents)}</strong>
                </div>
              ))}
            </section>

            <section className="card">
              <h2>Bill summary</h2>
              <div className="muted">Total bills created</div>
              <div className="amount">{data.bills.length}</div>
              <div className="muted" style={{ marginTop: 15 }}>
                Total bill value
              </div>
              <div className="amount">
                {money(data.bills.reduce((sum, bill) => sum + bill.totalCents, 0))}
              </div>
            </section>

            <section className="card wide">
              <h2>Recent bills</h2>
              {data.bills.length === 0 && (
                <div className="empty">No bills yet. Create your first bill.</div>
              )}
              {data.bills.map((bill) => (
                <div className="bill" key={bill.id}>
                  <div className="row">
                    <div>
                      <strong>{bill.title}</strong>
                      <div className="muted">{bill.shares.length} member shares</div>
                    </div>
                    <strong>{money(bill.totalCents)}</strong>
                  </div>

                  {bill.shares.map((share) => (
                    <div className="share" key={share.id}>
                      <div>
                        <strong>{share.memberName}</strong>
                        <div className={share.paidAt ? 'paid' : 'unpaid'}>
                          {share.paidAt ? 'PAID' : 'PENDING'}
                        </div>
                      </div>
                      <div className="row">
                        <strong>{money(share.amountCents)}</strong>
                        {!share.paidAt && (
                          <button
                            type="button"
                            className="small"
                            disabled={loading}
                            onClick={() => payShare(bill.id, share.id)}
                          >
                            Mark paid
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </main>
  )
}
