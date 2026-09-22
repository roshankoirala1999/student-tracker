import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import serverless from 'serverless-http';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { connectToDatabase } from '../../server/db.ts';
import apiRouter from '../../server/apiRouter.ts';

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Ensure MongoDB is connected for warm/cold serverless lambda invocations
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
  } catch (err) {
    console.error('[Netlify Function DB Error]:', err);
  }
  next();
});

// Support all possible route paths Netlify rewrites into the Lambda
app.use(['/api', '/.netlify/functions/api', '/'], apiRouter);

export const handler = serverless(app);
