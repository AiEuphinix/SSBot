import { Telegraf } from "telegraf";
import dotenv from "dotenv";
dotenv.config();

const bot = new Telegraf(process.env.BOT_TOKEN);
const OWNER_ID = parseInt(process.env.OWNER_ID);

let connectedGroupId = null; // Will store connected group ID

// --- OWNER COMMANDS ---
bot.command("connectgp", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  if (!args) {
    return ctx.reply("Usage: /connectgp <group_id | @username>");
  }

  connectedGroupId = args;
  await ctx.reply(`✅ Bot connected to group: ${args}`);
});

bot.command("disconnectgp", async (ctx) => {
  if (ctx.from.id !== OWNER_ID) return;
  connectedGroupId = null;
  await ctx.reply("❌ Bot disconnected from group.");
});

// --- FORWARD USER PHOTOS ---
bot.on("photo", async (ctx) => {
  if (!connectedGroupId) {
    return ctx.reply("❌ Bot is not connected to any group yet.");
  }

  const user = ctx.from;
  const caption = `
📸 *New Receipt Received*

👤 Name: ${user.first_name || ""} ${user.last_name || ""}
🔗 Username: ${user.username ? "@" + user.username : "Not Available"}
📱 Phone: Not Available
🆔 User ID: \`${user.id}\`
👤 Profile: [Open Profile](tg://user?id=${user.id})
`;

  try {
    const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    await ctx.telegram.sendPhoto(connectedGroupId, photo, {
      caption,
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("Error forwarding photo:", err);
  }
});

bot.launch();
console.log("🚀 Bot is running...");

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
