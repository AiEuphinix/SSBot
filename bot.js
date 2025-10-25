import { Telegraf, Markup } from "telegraf";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import moment from "moment-timezone";

dotenv.config();

// --- ENV & CONSTANTS ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = parseInt(process.env.OWNER_ID);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!BOT_TOKEN || !OWNER_ID || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing environment variables. Please check your .env file.");
  process.exit(1);
}

// --- INITIALIZATION ---
const bot = new Telegraf(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
let connectedGroupId = null;

// --- HELPER FUNCTIONS ---

// Load connection from Supabase on start
async function loadConnection() {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("connected_group_id")
      .eq("id", 1) // Assuming we only use row with id 1
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = 'single' row not found
      console.error("Error loading connection:", error);
    } else if (data) {
      connectedGroupId = data.connected_group_id;
      if (connectedGroupId) {
        console.log(`✅ Loaded connection from DB. Group: ${connectedGroupId}`);
      } else {
        console.log("No saved connection found in DB.");
      }
    }
  } catch (err) {
    console.error("Error in loadConnection:", err);
  }
}

// Save connection to Supabase
async function saveConnection(groupId) {
  try {
    const { error } = await supabase
      .from("settings")
      .upsert({ id: 1, connected_group_id: groupId }, { onConflict: 'id' });

    if (error) {
      console.error("Error saving connection:", error);
      return false;
    }
    connectedGroupId = groupId; // Update local state
    return true;
  } catch (err) {
    console.error("Error in saveConnection:", err);
    return false;
  }
}

// Escape text for MarkdownV2
function escapeMarkdown(text) {
  if (!text) return "";
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

// Middleware to check if user is owner
const isOwner = (ctx, next) => {
  if (ctx.from.id === OWNER_ID) {
    return next();
  }
  // Optionally reply to non-owners, or just ignore
  // return ctx.reply("You are not authorized to use this command.");
};

// --- OWNER COMMANDS ---

bot.command("connectgp", isOwner, async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1).join(" ");
  if (!args) {
    return ctx.reply("Usage: /connectgp <group_id | @username>");
  }

  const success = await saveConnection(args);
  if (success) {
    await ctx.reply(`✅ Connected to group and saved to DB: ${args}`);
  } else {
    await ctx.reply("❌ Failed to save connection to DB.");
  }
});

bot.command("disconnect", isOwner, async (ctx) => {
  const success = await saveConnection(null);
  if (success) {
    await ctx.reply("❌ Disconnected from group and updated DB.");
  } else {
    await ctx.reply("❌ Failed to update connection in DB.");
  }
});

bot.command("help", isOwner, async (ctx) => {
  const helpText = `
*Owner Commands*
/help - Shows this help message.
/connectgp <group_id> - Connects the bot to a group.
/disconnect - Disconnects the bot from the group.
/receipt - Fetches receipts by date.
  `;
  await ctx.replyWithMarkdown(helpText);
});

bot.command("receipt", isOwner, async (ctx) => {
  try {
    // Fetch all received_at dates
    const { data, error } = await supabase
      .from("receipts")
      .select("received_at");

    if (error) throw error;
    if (!data || data.length === 0) {
      return ctx.reply("No receipts found in database.");
    }

    // Process dates to get unique DD/MM/YY strings in 'Asia/Yangon'
    const uniqueDates = [
      ...new Set(
        data.map((r) =>
          moment(r.received_at).tz("Asia/Yangon").format("DD/MM/YY")
        )
      ),
    ];

    if (uniqueDates.length === 0) {
       return ctx.reply("No receipts found.");
    }

    // Create inline buttons
    const buttons = uniqueDates.map((date) =>
      Markup.button.callback(date, `receipt_date_${date}`)
    );

    // Arrange buttons in rows (e.g., 3 per row)
    const keyboard = Markup.inlineKeyboard(
      Array.from({ length: Math.ceil(buttons.length / 3) }, (_, i) =>
        buttons.slice(i * 3, i * 3 + 3)
      )
    );

    await ctx.reply("နေ့စွဲအားရွေးချယ်ပါ:", keyboard);
  } catch (err) {
    console.error("Error fetching receipt dates:", err);
    await ctx.reply("Error fetching receipt dates.");
  }
});

// --- CALLBACK HANDLERS ---

bot.action(/receipt_date_(.+)/, isOwner, async (ctx) => {
  const dateStr = ctx.match[1];
  await ctx.answerCbQuery(`Fetching receipts for ${dateStr}...`);

  try {
    // Create date range for the selected day in 'Asia/Yangon'
    const startDate = moment
      .tz(dateStr, "DD/MM/YY", "Asia/Yangon")
      .startOf("day")
      .toISOString();
    const endDate = moment
      .tz(dateStr, "DD/MM/YY", "Asia/Yangon")
      .endOf("day")
      .toISOString();

    // Query Supabase for receipts within that range
    const { data, error } = await supabase
      .from("receipts")
      .select("*")
      .gte("received_at", startDate)
      .lte("received_at", endDate)
      .order("received_at", { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) {
      return ctx.reply(`No receipts found for ${dateStr}.`);
    }

    await ctx.reply(`🧾 *Receipts for ${dateStr}* (${data.length} found):`, {
      parse_mode: "MarkdownV2",
    });

    // Send each receipt as a separate photo message
    for (const receipt of data) {
      const name = escapeMarkdown(
        `${receipt.first_name || ""} ${receipt.last_name || ""}`
      );
      const username = receipt.username
        ? `@${escapeMarkdown(receipt.username)}`
        : "Not Available";
      const userId = escapeMarkdown(String(receipt.user_id));
      const receivedTime = escapeMarkdown(
        moment(receipt.received_at)
          .tz("Asia/Yangon")
          .format("DD/MM/YY HH:mm:ss")
      );
      
      let infoCaption = `
*Receipt Info*
🚹: ${name}
🔗: [Profile](tg://user?id=${receipt.user_id})
👤: ${username}
🆔: \`${userId}\`
🗓️: ${receivedTime}`;

      if (receipt.receipt_caption) {
        infoCaption += `\n\n*User Caption:*\n${escapeMarkdown(receipt.receipt_caption)}`;
      }

      await ctx.replyWithPhoto(receipt.receipt_file_id, {
        caption: infoCaption,
        parse_mode: "MarkdownV2",
      });
    }
  } catch (err) {
    console.error("Error fetching receipts by date:", err);
    await ctx.reply("An error occurred while fetching receipts.");
  }
});

// --- USER WORKFLOWS ---

bot.start(async (ctx) => {
  // --- UPDATED MESSAGE HERE ---
  await ctx.reply("မင်္ဂလာပါ၊ ပြေစာအား မိမိဝယ်ယူသော ပစ္စည်းအမည်ကိုရေး၍ ပို့ပေးပါ။\n\nEg: Telegram Premium");
});

// When user sends a photo (receipt)
bot.on("photo", async (ctx) => {
  if (!connectedGroupId) {
    return ctx.reply("❌ Bot not connected to any group.");
  }

  const user = ctx.from;
  const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const userCaption = ctx.message.caption || null;
  const myanmarTime = moment().tz("Asia/Yangon");

  // 1. Save to Supabase
  try {
    const { error } = await supabase.from("receipts").insert({
      user_id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      receipt_file_id: photo,
      receipt_caption: userCaption,
      received_at: myanmarTime.toISOString(), // Store as full ISO timestamp
    });

    if (error) throw error;
  } catch (err) {
    console.error("Error saving receipt to Supabase:", err);
    await ctx.reply("Error processing your receipt. Please try again.");
    return;
  }

  // 2. Forward to Group
  try {
    // Escape fields for bot's own caption
    const name = escapeMarkdown(`${user.first_name || ""} ${user.last_name || ""}`);
    const username = user.username ? `@${escapeMarkdown(user.username)}` : "Not Available";
    const userId = escapeMarkdown(String(user.id));
    const timeStr = escapeMarkdown(myanmarTime.format("DD/MM/YY HH:mm:ss"));

    let botCaption =
`*New Receipt Received*
🚹: ${name}
🔗: [Profile](tg://user?id=${user.id})
👤: ${username}
🆔: \`${userId}\`
🗓️: ${timeStr}`;

    // Append user's caption if it exists
    if (userCaption) {
      botCaption += `\n\n*User Caption:*\n${escapeMarkdown(userCaption)}`;
    }

    // Forward to group
    await ctx.telegram.sendPhoto(connectedGroupId, photo, {
      caption: botCaption,
      parse_mode: "MarkdownV2",
    });

    // Reply to user
    await ctx.reply("ပြေစာအားလက်ခံရရှိပါတယ် ကျေးဇူးတင်ပါတယ်ခင်ဗျ။");

  } catch (err) {
    console.error("Error forwarding photo to group:", err);
    // Don't reply to user again if DB save was successful but forward failed
  }
});

// --- BOT LAUNCH ---
(async () => {
  await loadConnection(); // Load connection before launching
  bot.launch();
  console.log("🚀 Bot is running...");
})();

// Graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
