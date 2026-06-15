import "dotenv/config";
import { prisma } from "../src/lib/db/client";

async function main() {
  const cnt = await prisma.sourcePost.count();
  console.log("SourcePost Count:", cnt);
  const posts = await prisma.sourcePost.findMany({ take: 2 });
  console.log("Sample Posts:", JSON.stringify(posts, null, 2));
}

main().catch(console.error);
