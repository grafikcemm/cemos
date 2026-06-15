import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import cron from "node-cron";
import pino from "pino";
import { workerService } from "../src/lib/services/workerService";

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

logger.info("XAgent Background Worker başlatılıyor...");

if (!process.env.OPENROUTER_API_KEY) {
  logger.warn("OPENROUTER_API_KEY is missing. Taslak üretimi başarısız olacaktır.");
}
if (!process.env.SOCIALDATA_API_KEY) {
  logger.warn("SOCIALDATA_API_KEY is missing. Yeni tweet taraması yapılamayacaktır.");
}

// 1. Every minute: check due scheduled items
cron.schedule("* * * * *", async () => {
  logger.info("[cron] duePublishTick tetiklendi");
  try {
    const results = await workerService.duePublishTick();
    if (results.length > 0) {
      logger.info({ results }, `duePublishTick tamamlandı, ${results.length} öge işlendi`);
    } else {
      logger.info("[cron] İşlenecek bekleyen planlanmış öge yok");
    }
  } catch (err) {
    logger.error(err, "[cron] duePublishTick sırasında hata oluştu");
  }
});

// 2. Hourly: scan and generate candidates (scanTick)
cron.schedule("0 * * * *", async () => {
  logger.info("[cron] scanTick tetiklendi");
  try {
    await workerService.scanTick();
    logger.info("[cron] scanTick başarıyla tamamlandı");
  } catch (err) {
    logger.error(err, "[cron] scanTick sırasında hata oluştu");
  }
});

// 3. Daily: prune logs (pruneTick)
cron.schedule("15 4 * * *", async () => {
  logger.info("[cron] pruneTick tetiklendi");
  try {
    await workerService.pruneTick();
    logger.info("[cron] pruneTick başarıyla tamamlandı");
  } catch (err) {
    logger.error(err, "[cron] pruneTick sırasında hata oluştu");
  }
});

logger.info("XAgent Background Worker çalışıyor. Çıkmak için Ctrl+C tuşlarına basın.");
