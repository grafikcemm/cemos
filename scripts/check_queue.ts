import "dotenv/config";
import { prisma } from "../src/lib/db/client";

async function main() {
  const item = await prisma.queueItem.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!item) {
    console.log("No queue item found!");
    return;
  }

  console.log("=== Last QueueItem ===");
  console.log("ID:", item.id);
  console.log("Content:", item.content);
  console.log("Edited Content:", item.editedContent);
  console.log("Status:", item.status);
  console.log("Lint Report:", item.lintReport ? JSON.parse(item.lintReport) : "null");
}

main().catch(console.error);
