import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import moment from "moment-timezone";
import fs from "fs";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = parseInt(process.env.OWNER_ID);

const DATA_FILE = "connected.json";
let connectedGroupId = null;

// Load saved connection
if (fs.existsSync(DATA_FILE)) {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE));
  if (saved.groupId) connectedGroupId = saved.groupId;
}

// Save connection
function saveConnection(groupId) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ groupId }));
}

// Escape text for MarkdownV2
function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// --- OWNER COMMANDS ---
bot.command("connectgp", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  const args = ctx.message.text.split(" ").slice(1).join(" ");
  if (!args) {
    return ctx.reply("Usage: /connectgp <group_id | @username>");
  }

  connectedGroupId = args;
  saveConnection(args);

  await ctx.reply(`✅ Connected to group: ${args}`);
});

bot.command("disconnect", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;

  connectedGroupId = null;
  saveConnection(null);

  await ctx.reply("❌ Disconnected from group.");
});

// --- USER WORKFLOWS ---
bot.start(async (ctx) => {
  await ctx.reply("မင်္ဂလာပါခင်ဗျ ဒီBotမှာပြေစာလေးပဲပို့ပေးပါခင်ဗျ။");
});

// When user sends a photo (receipt)
bot.on("photo", async (ctx) => {
  if (!connectedGroupId) {
    return ctx.reply("❌ Bot not connected to any group.");
  }

  const user = ctx.from;
  const myanmarTime = moment().tz("Asia/Yangon").format("DD/MM/YY HH:mm:ss");

  // Escape fields
  const name = escapeMarkdown(`${user.first_name || ""} ${user.last_name || ""}`);
  const username = user.username ? `@${escapeMarkdown(user.username)}` : "Not Available";
  const userId = escapeMarkdown(String(user.id));

  const caption =
`*New Receipt Received*
🚹: ${name}
🔗: [Profile](tg://user?id=${user.id})
👤: ${username}
📞: Not Available
🆔: \`${userId}\`
🗓️: ${escapeMarkdown(myanmarTime)}`;

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    // Reply to user
    await ctx.reply("ပြေစာအားလက်ခံရရှိပါတယ် ကျေးဇူးတင်ပါတယ်ခင်ဗျ။");

    // Forward to group with caption
    await ctx.telegram.sendPhoto(connectedGroupId, photo, {
      caption,
      parse_mode: "MarkdownV2"
    });

  } catch (err) {
    console.error("Error handling photo:", err);
  }
});

bot.launch();
console.log("🚀 Bot is running...");

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
