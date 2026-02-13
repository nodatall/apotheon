import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { healthRouter } from './routes/health.js';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);

app.listen(port, () => {
  // Framework-only startup log.
  console.log(`API listening on http://localhost:${port}`);
});
