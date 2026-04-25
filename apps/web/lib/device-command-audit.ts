import "server-only";

import { getDb, isDatabaseConfigured } from "@/lib/db";

export async function recordDeviceCommandAudit(input: {
  deviceId: string;
  actorProfileId?: string | null;
  commandType: string;
  result: string;
  detail?: string | null;
}): Promise<void> {
  const db = getDb();

  if (!isDatabaseConfigured() || !db) {
    return;
  }

  await db.deviceCommandAudit.create({
    data: {
      deviceId: input.deviceId,
      actorProfileId: input.actorProfileId ?? null,
      commandType: input.commandType,
      result: input.result,
      detail: input.detail ?? null,
    },
  });
}
