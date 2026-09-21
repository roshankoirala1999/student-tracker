import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import { connectToDatabase } from './server/db.ts';
import apiRouter from './server/apiRouter.ts';

const PORT = 3000;

async function startServer() {
  const app = express();

  // Trust proxy for reverse proxies (e.g. Cloud Run, Nginx)
  app.set('trust proxy', 1);

  // Basic security and parsing middlewares
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // General rate limiter for API endpoints
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: {
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down.',
    },
  });
  app.use('/api', apiLimiter);

  // Attempt database connection asynchronously
  connectToDatabase().catch((err) => {
    console.warn('[Startup DB Connection Notice]:', err?.message || err);
  });

  // Mount API router
  app.use('/api', apiRouter);

  // Centralized Error-Handling Middleware for API routes
  app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[API Error]:', err?.message || err);
    if (res.headersSent) {
      return next(err);
    }
    const status = err.status || err.statusCode || (err.name === 'UnauthorizedError' ? 401 : 500);
    const code = err.code || err.name || 'INTERNAL_SERVER_ERROR';
    const message = err.message || 'An unexpected error occurred. Please try again.';
    return res.status(status).json({
      success: false,
      error: code,
      message,
    });
  });

  // Vite middleware for development vs static files for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Student Tracker Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
