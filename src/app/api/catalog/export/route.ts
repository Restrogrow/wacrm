// GET /api/catalog/export — all products as a CSV file. Any member.

import { NextResponse } from 'next/server'

import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { productsToCsv } from '@/lib/catalog/csv'
import { listProducts } from '@/lib/catalog/products'
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function GET() {
  try {
    const ctx = await getCurrentAccount()
    const limit = checkRateLimit(`catalog-export:${ctx.userId}`, { limit: 10, windowMs: 60_000 })
    if (!limit.success) return rateLimitResponse(limit)

    const all = []
    for (let offset = 0; offset < 20_000; offset += 500) {
      const { products } = await listProducts(ctx.supabase, ctx.accountId, { limit: 500, offset })
      all.push(...products)
      if (products.length < 500) break
    }
    const csv = '﻿' + productsToCsv(all)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
