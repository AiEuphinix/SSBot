import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import moment from "moment-timezone";
import fs from "fs";

dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = parseInt(process.env.OWNER_ID);

// store connected group persistently
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

  // Myanmar time
  const myanmarTime = moment().tz("Asia/Yangon").format("DD/MM/YY HH:mm:ss");

  const caption = `
*New Receipt Received*
🚹: ${user.first_name || ""} ${user.last_name || ""}
🔗: [Profile](tg://user?id=${user.id})
👤: ${user.username ? "@" + user.username : "Not Available"}
📞: Not Available
🆔: \`${user.id}\`
🗓️: ${myanmarTime}
`;

  try {
    // Get largest photo
    const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;

    // Reply to user
    await ctx.reply("ပြေစာအားလက်ခံရရှိပါတယ် ကျေးဇူးတင်ပါတယ်ခင်ဗျ။");

    // Forward to group with caption
    await ctx.telegram.sendPhoto(connectedGroupId, photo, {
      caption,
      parse_mode: "Markdown"
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
