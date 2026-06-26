-- CreateTable
CREATE TABLE "api_key" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "api_key_pkey" PRIMARY KEY ("id")
);
