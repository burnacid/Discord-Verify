import { ChannelType } from "discord.js";
import type { VoiceState } from "discord.js";
import { client } from "../client.js";
import { prisma } from "../../db.js";

client.on("voiceStateUpdate", (oldState, newState) => {
  if (newState.channelId && newState.channelId !== oldState.channelId) {
    handleJoin(newState).catch((err) => console.error("JTC join handling failed", err));
  }
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    handleLeave(oldState).catch((err) => console.error("JTC leave handling failed", err));
  }
});

async function handleJoin(newState: VoiceState): Promise<void> {
  const trigger = await prisma.jtcTrigger.findUnique({ where: { channelId: newState.channelId! } });
  if (!trigger) return;

  const triggerChannel = newState.channel;
  if (!triggerChannel) return;

  const number = (await prisma.jtcChannel.count({ where: { triggerId: trigger.id } })) + 1;

  const created = await newState.guild.channels.create({
    name: `${trigger.name} #${number}`,
    type: ChannelType.GuildVoice,
    parent: triggerChannel.parentId,
  });

  await prisma.jtcChannel.create({
    data: { channelId: created.id, triggerId: trigger.id, number },
  });

  await newState.setChannel(created);
}

async function handleLeave(oldState: VoiceState): Promise<void> {
  const channelId = oldState.channelId;
  if (!channelId) return;

  const tracked = await prisma.jtcChannel.findUnique({ where: { channelId } });
  if (!tracked) return;

  await deleteIfEmpty(channelId);
}

async function deleteIfEmpty(channelId: string): Promise<void> {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      // Channel is already gone (e.g. deleted manually) — stop tracking it.
      await prisma.jtcChannel.delete({ where: { channelId } }).catch(() => {});
      return;
    }
    if (channel.isVoiceBased() && channel.members.size === 0) {
      await channel.delete();
      await prisma.jtcChannel.delete({ where: { channelId } }).catch(() => {});
    }
    // Still occupied — leave the tracking row alone for the next leave event.
  } catch (err) {
    // Most likely the channel no longer exists (e.g. deleted manually) —
    // stop tracking it rather than retrying forever.
    console.error(`Failed to check/delete JTC channel ${channelId}, dropping it from tracking`, err);
    await prisma.jtcChannel.delete({ where: { channelId } }).catch(() => {});
  }
}

// Self-healing sweep for channels that emptied out while the bot was
// offline — the live voiceStateUpdate handler covers normal operation.
export async function sweepEmptyJtcChannels(): Promise<void> {
  const tracked = await prisma.jtcChannel.findMany();
  for (const row of tracked) {
    await deleteIfEmpty(row.channelId);
  }
}
