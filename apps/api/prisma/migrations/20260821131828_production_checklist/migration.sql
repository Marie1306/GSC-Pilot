-- CreateTable
CREATE TABLE "ChecklistThickness" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChecklistThickness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistMaterial" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChecklistMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistStep" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChecklistStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionChecklist" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "assemblyLabel" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentItemId" TEXT,
    "number" TEXT NOT NULL,
    "quantity" INTEGER,
    "thickness" TEXT,
    "material" TEXT,
    "shapeType" TEXT,
    "tubeShape" TEXT,
    "tubeOD" TEXT,
    "tubeID" TEXT,
    "tubeMeasurement1" TEXT,
    "tubeMeasurement2" TEXT,
    "tubeWallThickness" TEXT,
    "shaftMeasurement" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionChecklistItemStep" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionChecklistItemStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistThickness_label_key" ON "ChecklistThickness"("label");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistMaterial_label_key" ON "ChecklistMaterial"("label");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistStep_label_key" ON "ChecklistStep"("label");

-- CreateIndex
CREATE INDEX "ProductionChecklist_projectId_idx" ON "ProductionChecklist"("projectId");

-- CreateIndex
CREATE INDEX "ProductionChecklistItem_checklistId_idx" ON "ProductionChecklistItem"("checklistId");

-- CreateIndex
CREATE INDEX "ProductionChecklistItem_parentItemId_idx" ON "ProductionChecklistItem"("parentItemId");

-- CreateIndex
CREATE INDEX "ProductionChecklistItemStep_stepId_active_completed_idx" ON "ProductionChecklistItemStep"("stepId", "active", "completed");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionChecklistItemStep_itemId_stepId_key" ON "ProductionChecklistItemStep"("itemId", "stepId");

-- AddForeignKey
ALTER TABLE "ProductionChecklist" ADD CONSTRAINT "ProductionChecklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionChecklistItem" ADD CONSTRAINT "ProductionChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "ProductionChecklist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionChecklistItem" ADD CONSTRAINT "ProductionChecklistItem_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "ProductionChecklistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionChecklistItemStep" ADD CONSTRAINT "ProductionChecklistItemStep_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ProductionChecklistItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionChecklistItemStep" ADD CONSTRAINT "ProductionChecklistItemStep_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ChecklistStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
