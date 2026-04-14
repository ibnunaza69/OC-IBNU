import type { NextFunction, Request, Response } from 'express'

export function apiKeyMiddleware(allowedKeys: string[]) {
  const keys = allowedKeys.filter(Boolean)

  return (req: Request, res: Response, next: NextFunction) => {
    if (keys.length === 0) {
      return next()
    }

    const rawKey = req.header('x-api-key') || req.query.apiKey
    const apiKey = Array.isArray(rawKey) ? rawKey[0] : rawKey

    if (!apiKey || !keys.includes(String(apiKey))) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      })
    }

    return next()
  }
}
