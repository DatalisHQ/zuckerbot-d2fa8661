const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

interface NotificationPayload {
  chatId: string;
  message: string;
  parseMode?: 'HTML' | 'MarkdownV2';
}

export async function sendTelegram({ chatId, message, parseMode = 'HTML' }: NotificationPayload): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('[notifications] Telegram send failed:', e);
    return false;
  }
}

export async function notifyCampaignLaunched(biz: { telegram_chat_id: string | null; notifications_enabled: boolean; name: string }, campaignName: string, dailyBudgetCents: number): Promise<void> {
  if (!biz.notifications_enabled || !biz.telegram_chat_id) return;

  await sendTelegram({
    chatId: biz.telegram_chat_id,
    message: `🚀 <b>Campaign Launched!</b>\n\n` +
      `<b>${campaignName}</b>\n` +
      `Business: ${biz.name}\n` +
      `Daily budget: $${(dailyBudgetCents / 100).toFixed(2)}\n\n` +
      `Reply /pause to pause this campaign.`,
  });
}

export async function notifyCampaignPaused(biz: { telegram_chat_id: string | null; notifications_enabled: boolean; name: string }, campaignName: string): Promise<void> {
  if (!biz.notifications_enabled || !biz.telegram_chat_id) return;

  await sendTelegram({
    chatId: biz.telegram_chat_id,
    message: `⏸ <b>Campaign Paused</b>\n\n` +
      `<b>${campaignName}</b> has been paused.\n` +
      `Reply /resume to resume.`,
  });
}

export async function notifyPerformanceUpdate(biz: { telegram_chat_id: string | null; notifications_enabled: boolean }, summary: string): Promise<void> {
  if (!biz.notifications_enabled || !biz.telegram_chat_id) return;

  await sendTelegram({
    chatId: biz.telegram_chat_id,
    message: `📊 <b>Campaign Update</b>\n\n${summary}`,
  });
}
