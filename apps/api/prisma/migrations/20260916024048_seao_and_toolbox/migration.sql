-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "nextSeaoNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "seaoDefaultMarginPct" DECIMAL(5,2) NOT NULL DEFAULT 20,
ADD COLUMN     "seaoNumberYear" INTEGER NOT NULL DEFAULT 2026;

-- CreateTable
CREATE TABLE "SeaoFile" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "title" TEXT,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'a_l_etude',
    "submissionDeadline" TIMESTAMP(3),
    "goNoGoDecidedById" TEXT,
    "goNoGoDecidedAt" TIMESTAMP(3),
    "nonSubmissionReason" TEXT,
    "outcomeDecidedById" TEXT,
    "outcomeDecidedAt" TIMESTAMP(3),
    "projectId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SeaoFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeaoDocument" (
    "id" TEXT NOT NULL,
    "seaoFileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "anthropicFileId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeaoDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeaoAnalysis" (
    "id" TEXT NOT NULL,
    "seaoFileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "documentIds" TEXT[],
    "summaryContent" JSONB NOT NULL,
    "changesContent" JSONB,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,

    CONSTRAINT "SeaoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeaoBordereauLine" (
    "id" TEXT NOT NULL,
    "seaoFileId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "marginPct" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "salePrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeaoBordereauLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeaoCompetitor" (
    "id" TEXT NOT NULL,
    "seaoFileId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "submittedPrice" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeaoCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeaoNote" (
    "id" TEXT NOT NULL,
    "seaoFileId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeaoNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolboxCategory" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ToolboxCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolboxChart" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "anthropicFileId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolboxChart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolboxThread" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolboxThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolboxMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "authorId" TEXT,
    "content" JSONB NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeaoFile_displayId_key" ON "SeaoFile"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "SeaoFile_projectId_key" ON "SeaoFile"("projectId");

-- CreateIndex
CREATE INDEX "SeaoFile_status_idx" ON "SeaoFile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SeaoAnalysis_seaoFileId_version_key" ON "SeaoAnalysis"("seaoFileId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "ToolboxCategory_label_key" ON "ToolboxCategory"("label");

-- CreateIndex
CREATE INDEX "ToolboxThread_categoryId_lastMessageAt_idx" ON "ToolboxThread"("categoryId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ToolboxMessage_threadId_createdAt_idx" ON "ToolboxMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "SeaoFile" ADD CONSTRAINT "SeaoFile_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeaoFile" ADD CONSTRAINT "SeaoFile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeaoDocument" ADD CONSTRAINT "SeaoDocument_seaoFileId_fkey" FOREIGN KEY ("seaoFileId") REFERENCES "SeaoFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeaoAnalysis" ADD CONSTRAINT "SeaoAnalysis_seaoFileId_fkey" FOREIGN KEY ("seaoFileId") REFERENCES "SeaoFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeaoBordereauLine" ADD CONSTRAINT "SeaoBordereauLine_seaoFileId_fkey" FOREIGN KEY ("seaoFileId") REFERENCES "SeaoFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeaoCompetitor" ADD CONSTRAINT "SeaoCompetitor_seaoFileId_fkey" FOREIGN KEY ("seaoFileId") REFERENCES "SeaoFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeaoNote" ADD CONSTRAINT "SeaoNote_seaoFileId_fkey" FOREIGN KEY ("seaoFileId") REFERENCES "SeaoFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolboxChart" ADD CONSTRAINT "ToolboxChart_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ToolboxCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolboxThread" ADD CONSTRAINT "ToolboxThread_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ToolboxCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolboxMessage" ADD CONSTRAINT "ToolboxMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ToolboxThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
