import http from 'http';

const TOTAL_MESSAGES = 1000;
const BATCH_SIZE = 500;

interface TelemetryPayload {
  device_id: string;
  event: 'heartbeat' | 'power_lost' | 'boot';
  ts: string;
  seq: number;
  battery_mv: number;
  rssi: number;
  fw: string;
}

function generateBatch(size: number): TelemetryPayload[] {
  const batch: TelemetryPayload[] = [];
  const now = new Date().toISOString();
  for (let i = 0; i < size; i++) {
    batch.push({
      device_id: `KSPDB-DEV-${Math.floor(Math.random() * 1500).toString().padStart(4, '0')}`,
      event: Math.random() < 0.05 ? 'power_lost' : 'heartbeat',
      ts: now,
      seq: Math.floor(Math.random() * 1000),
      battery_mv: 3500 + Math.floor(Math.random() * 200),
      rssi: -65 - Math.floor(Math.random() * 20),
      fw: '1.3.1',
    });
  }
  return batch;
}

function sendRequest(payload: any): Promise<{ statusCode: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const start = Date.now();
    
    const req = http.request(
      'http://localhost:3000/api/telemetry',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res: http.IncomingMessage) => {
        res.resume(); // consume response
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            duration: Date.now() - start,
          });
        });
      }
    );

    req.on('error', (err: Error) => {
      reject(err);
    });

    req.write(data);
    req.end();
  });
}

async function runLoadTest() {
  console.log('==================================================');
  console.log('⚡ STARTING GRIDGUARD HIGH-THROUGHPUT LOAD TEST ⚡');
  console.log(`Sending total of ${TOTAL_MESSAGES} messages in batches of ${BATCH_SIZE}...`);
  console.log('==================================================');

  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;
  const latencies: number[] = [];

  // Run two concurrent batches of 500
  const promises: Promise<any>[] = [];
  for (let b = 0; b < TOTAL_MESSAGES / BATCH_SIZE; b++) {
    const batch = generateBatch(BATCH_SIZE);
    promises.push(
      sendRequest(batch)
        .then((res: { statusCode: number; duration: number }) => {
          if (res.statusCode === 202) {
            successCount += BATCH_SIZE;
          } else {
            failureCount += BATCH_SIZE;
          }
          latencies.push(res.duration);
          console.log(`[Batch ${b + 1}] Sent ${BATCH_SIZE} msgs -> Status: ${res.statusCode} (${res.duration}ms)`);
        })
        .catch((err: any) => {
          failureCount += BATCH_SIZE;
          console.error(`[Batch ${b + 1}] Request failed:`, err.message);
        })
    );
  }

  await Promise.all(promises);

  const totalTime = Date.now() - startTime;
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const througput = (successCount / (totalTime / 1000)).toFixed(2);

  console.log('==================================================');
  console.log('📊 RESULTS SUMMARY:');
  console.log(`- Total Time Elapsed: ${totalTime}ms`);
  console.log(`- Success Rate: ${successCount}/${TOTAL_MESSAGES} (${((successCount / TOTAL_MESSAGES) * 100).toFixed(1)}%)`);
  console.log(`- Avg Roundtrip Latency: ${avgLatency.toFixed(1)}ms`);
  console.log(`- Measured Ingestion Throughput: ${througput} msg/second`);
  console.log('==================================================');
}

runLoadTest();
