const SOCIALDATA_DAILY_LIMIT = 500;

let dailyTweetCount = 0;
let lastReset = new Date().toDateString();

function resetIfNeeded() {
  const today = new Date().toDateString();
  if (today !== lastReset) {
    dailyTweetCount = 0;
    lastReset = today;
  }
}

export function checkDailyLimit(tweetCount: number): boolean {
  resetIfNeeded();
  return dailyTweetCount + tweetCount <= SOCIALDATA_DAILY_LIMIT;
}

export function trackUsage(tweetCount: number): void {
  resetIfNeeded();
  dailyTweetCount += tweetCount;
}

export function getDailyUsage() {
  resetIfNeeded();

  return {
    used: dailyTweetCount,
    limit: SOCIALDATA_DAILY_LIMIT,
    remaining: SOCIALDATA_DAILY_LIMIT - dailyTweetCount,
    estimatedMonthlyCost: (((dailyTweetCount * 30) / 1000) * 0.15).toFixed(2),
  };
}
