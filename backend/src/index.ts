import express from 'express';
import cors from 'cors';
import { initDb } from './db/init';
import { initDeviceCache, registerTelemetryHook } from './services/telemetryProcessor';
import { runLocalization } from './services/localizationEngine';
import telemetryRouter from './routes/telemetry';
import simulatorRouter from './routes/simulator';
import ticketsRouter from './routes/tickets';
import { startSimulationLoop } from './services/simulatorService';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'Grid Guard Backend API' });
});

app.use('/api/telemetry', telemetryRouter);
app.use('/api/simulator', simulatorRouter);
app.use('/api/tickets', ticketsRouter);

async function main() {
  try {
    await initDb();
    await initDeviceCache();
    registerTelemetryHook(runLocalization);
    await startSimulationLoop();
    app.listen(port, () => {
      console.log(`Grid Guard Backend running on port ${port}`);
    });
  } catch (error) {
    console.error('Fatal error during startup:', error);
    process.exit(1);
  }
}

main();
