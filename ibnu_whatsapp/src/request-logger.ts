import type { NextFunction, Request, Response } from 'express'

export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now()
    res.on('finish', () => {
      const ms = Date.now() - start
      console.log(`[http] ${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)`)
    })

    next()
  }
}
