-- AlterTable
ALTER TABLE "notification_preferences" ADD COLUMN     "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailOptedInAt" TIMESTAMPTZ(3),
ADD COLUMN     "emailOptedOutAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "notification_channel_deliveries" (
    "id" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "abandonedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_channel_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_channel_deliveries_notificationId_channel_key" ON "notification_channel_deliveries"("notificationId", "channel");

-- AddForeignKey
ALTER TABLE "notification_channel_deliveries" ADD CONSTRAINT "notification_channel_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
