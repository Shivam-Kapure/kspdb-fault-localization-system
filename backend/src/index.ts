import express from 'express';
import cors from 'cors';
import { initDb } from './db/init';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'Grid Guard Backend API' });
});

async function main() {
  try {
    await initDb();
    app.listen(port, () => {
      console.log(`Grid Guard Backend running on port ${port}`);
    });
  } catch (error) {
    console.error('Fatal error during startup:', error);
    process.exit(1);
  }
}

main();
