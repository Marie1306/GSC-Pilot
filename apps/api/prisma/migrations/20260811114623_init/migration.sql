-- CreateEnum
CREATE TYPE "Persona" AS ENUM ('owner', 'admin', 'boss', 'member', 'warehouse');

-- CreateEnum
CREATE TYPE "BudgetCategory" AS ENUM ('conception', 'fabrication', 'programmation', 'assemblage', 'installation');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT,
    "name" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "persona" "Persona" NOT NULL,
    "jobTitle" TEXT,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skillEfficiencies" JSONB NOT NULL DEFAULT '{}',
    "costRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "techLevelId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechLevel" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "billRate" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "TechLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DelegationGrant" (
    "id" TEXT NOT NULL,
    "delegateId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "categories" TEXT[],
    "monetaryLimit" DECIMAL(10,2),
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "justification" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelegationGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Client',
    "company" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "categories" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SalesChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRequest" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactRole" TEXT,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "summary" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "urgency" TEXT,
    "salesChannelId" TEXT,
    "sourceDetail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "assignedEmployeeId" TEXT,
    "transmittedToOwnerAt" TIMESTAMP(3),
    "budgetId" TEXT,
    "convertedType" TEXT,
    "convertedProjectId" TEXT,
    "convertedRollingId" TEXT,
    "lostReason" TEXT,
    "nextFollowUp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRequestNote" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRequestNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetModel" (
    "id" TEXT NOT NULL,
    "backupHourlyRate" DECIMAL(10,2) NOT NULL DEFAULT 112,
    "backupDefaultPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetModelSection" (
    "id" TEXT NOT NULL,
    "budgetModelId" TEXT NOT NULL,
    "category" "BudgetCategory" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetModelSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetModelRow" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetModelRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "backupHourlyRate" DECIMAL(10,2) NOT NULL,
    "backupHoursPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "backupHoursComplexity" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "contractWonAt" TIMESTAMP(3),

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetSection" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "category" "BudgetCategory" NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "complexity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetRow" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "modelRowId" TEXT,
    "label" TEXT NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "BudgetRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "projectNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "budgetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "sold" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "plannedPurchases" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actualPurchases" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "laborHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "plannedHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "actualHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "backupHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "backupHoursCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "backupHourlyRate" DECIMAL(10,2),
    "billingSplitOverride" JSONB,
    "deadline" TIMESTAMP(3),
    "desiredStart" TIMESTAMP(3),
    "productionCompleted" BOOLEAN NOT NULL DEFAULT false,
    "fulfillmentMode" TEXT,
    "fulfillmentStatus" TEXT,
    "fulfillmentDriverId" TEXT,
    "fulfillmentAddress" TEXT,
    "fulfillmentScheduled" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTeamMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "ProjectTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "subassemblyId" TEXT,
    "amendmentId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "skill" TEXT,
    "plannedHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "plannedCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actualHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "actualCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "purchases" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "maxPeople" INTEGER,
    "minPeople" INTEGER,
    "desiredStart" TIMESTAMP(3),
    "ganttCompleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTaskDependency" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,

    CONSTRAINT "ProjectTaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePlanEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "rollingId" TEXT,
    "serviceCallId" TEXT,
    "label" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "invoiceNumber" TEXT,
    "dueDate" TIMESTAMP(3),
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3),
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoicePlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPurchaseEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "supplier" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "enteredById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectPurchaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thresholdAmount" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PurchaseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "projectId" TEXT,
    "serviceCallId" TEXT,
    "categoryId" TEXT,
    "thresholdAmountAtSubmission" DECIMAL(12,2),
    "supplier" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "estimatedAmountMin" DECIMAL(12,2),
    "estimatedAmountMax" DECIMAL(12,2),
    "status" TEXT NOT NULL DEFAULT 'owner_pending',
    "ownerApprovedById" TEXT,
    "ownerApprovedAt" TIMESTAMP(3),
    "bossApprovedById" TEXT,
    "bossApprovedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PunchableTask" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PunchableTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "employeeId" TEXT NOT NULL,
    "projectType" TEXT NOT NULL,
    "projectId" TEXT,
    "serviceCallId" TEXT,
    "category" TEXT NOT NULL,
    "taskId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "exactMinutes" INTEGER,
    "roundedMinutes" INTEGER,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "costRate" DECIMAL(10,2) NOT NULL,
    "blockageNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCall" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "assignedEmployeeId" TEXT,
    "techLevelId" TEXT,
    "billRate" DECIMAL(10,2),
    "scheduledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "kmTraveled" DECIMAL(10,2),
    "mealsClaimed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "signatureCaptured" BOOLEAN NOT NULL DEFAULT false,
    "signatureImageUrl" TEXT,
    "ownerApprovedById" TEXT,
    "ownerApprovedAt" TIMESTAMP(3),
    "partPricingMarginPctOverride" DECIMAL(5,2),
    "sentToAdminAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCallPart" (
    "id" TEXT NOT NULL,
    "serviceCallId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unit" TEXT,
    "costPerUnit" DECIMAL(10,2),
    "marginPctOverride" DECIMAL(5,2),
    "salePricePerUnit" DECIMAL(10,2),
    "pricedById" TEXT,
    "pricedAt" TIMESTAMP(3),

    CONSTRAINT "ServiceCallPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCallPhoto" (
    "id" TEXT NOT NULL,
    "serviceCallId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "caption" TEXT,

    CONSTRAINT "ServiceCallPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rolling" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "clientRequestId" TEXT,
    "budgetId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sold" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "productionCompleted" BOOLEAN NOT NULL DEFAULT false,
    "fulfillmentMode" TEXT,
    "fulfillmentStatus" TEXT,
    "fulfillmentDriverId" TEXT,
    "fulfillmentAddress" TEXT,
    "fulfillmentScheduled" TIMESTAMP(3),
    "createdDirectly" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rolling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "projectId" TEXT,
    "rollingId" TEXT,
    "contactId" TEXT NOT NULL,
    "address" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "items" TEXT,
    "driverEmployeeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "signatureCaptured" BOOLEAN NOT NULL DEFAULT false,
    "signatureImageUrl" TEXT,
    "conditionNote" TEXT,
    "kmTraveled" DECIMAL(10,2),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subassembly" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "declaredById" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending_parts_list',
    "partsListPreparedById" TEXT,
    "partsListPreparedAt" TIMESTAMP(3),
    "hoursByCategory" JSONB,
    "assemblyReadyDeclaredById" TEXT,
    "assemblyReadyDeclaredAt" TIMESTAMP(3),

    CONSTRAINT "Subassembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Amendment" (
    "id" TEXT NOT NULL,
    "displayId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hoursByCategory" JSONB NOT NULL,
    "marginPct" DECIMAL(5,2) NOT NULL,
    "backupPct" DECIMAL(5,2) NOT NULL,
    "projectBackupRateUsed" DECIMAL(10,2) NOT NULL,
    "purchases" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "laborHours" DECIMAL(10,2) NOT NULL,
    "laborCost" DECIMAL(12,2) NOT NULL,
    "backupEligibleHours" DECIMAL(10,2) NOT NULL,
    "backupHours" DECIMAL(10,2) NOT NULL,
    "backupCost" DECIMAL(12,2) NOT NULL,
    "totalCost" DECIMAL(12,2) NOT NULL,
    "sale" DECIMAL(12,2) NOT NULL,
    "invoiceRequestId" TEXT,

    CONSTRAINT "Amendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT NOT NULL,
    "actorPersona" "Persona" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "justification" TEXT,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "mileageRate" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "breakfastRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lunchRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dinnerRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "defaultBillingSplit" JSONB NOT NULL,
    "projectNumberPrefix" TEXT NOT NULL DEFAULT 'PRJ',
    "nextProjectNumber" INTEGER NOT NULL DEFAULT 1,
    "nextPurchaseRequestNumber" INTEGER NOT NULL DEFAULT 1,
    "servicePartsDefaultMarginPct" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "punchRoundingMinutes" INTEGER NOT NULL DEFAULT 15,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "storagePath" TEXT,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_authUserId_key" ON "Employee"("authUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_persona_idx" ON "Employee"("persona");

-- CreateIndex
CREATE INDEX "DelegationGrant_delegateId_startDate_endDate_idx" ON "DelegationGrant"("delegateId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE INDEX "Contact_name_idx" ON "Contact"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SalesChannel_name_key" ON "SalesChannel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRequest_displayId_key" ON "ClientRequest"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientRequest_budgetId_key" ON "ClientRequest"("budgetId");

-- CreateIndex
CREATE INDEX "ClientRequest_status_idx" ON "ClientRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetModelSection_budgetModelId_category_key" ON "BudgetModelSection"("budgetModelId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetModelRow_sectionId_slug_key" ON "BudgetModelRow"("sectionId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_clientRequestId_key" ON "Budget"("clientRequestId");

-- CreateIndex
CREATE INDEX "Budget_status_idx" ON "Budget"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetSection_budgetId_category_key" ON "BudgetSection"("budgetId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectNumber_key" ON "Project"("projectNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Project_clientRequestId_key" ON "Project"("clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_budgetId_key" ON "Project"("budgetId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTeamMember_projectId_employeeId_key" ON "ProjectTeamMember"("projectId", "employeeId");

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_idx" ON "ProjectTask"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTaskDependency_taskId_dependsOnId_key" ON "ProjectTaskDependency"("taskId", "dependsOnId");

-- CreateIndex
CREATE INDEX "InvoicePlanEntry_status_idx" ON "InvoicePlanEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseCategory_name_key" ON "PurchaseCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_displayId_key" ON "PurchaseRequest"("displayId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_status_idx" ON "PurchaseRequest"("status");

-- CreateIndex
CREATE INDEX "PurchaseRequest_requesterId_idx" ON "PurchaseRequest"("requesterId");

-- CreateIndex
CREATE INDEX "PurchaseRequest_projectId_idx" ON "PurchaseRequest"("projectId");

-- CreateIndex
CREATE INDEX "TimeEntry_employeeId_date_idx" ON "TimeEntry"("employeeId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_status_idx" ON "TimeEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCall_displayId_key" ON "ServiceCall"("displayId");

-- CreateIndex
CREATE INDEX "ServiceCall_status_idx" ON "ServiceCall"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Rolling_clientRequestId_key" ON "Rolling"("clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Rolling_budgetId_key" ON "Rolling"("budgetId");

-- CreateIndex
CREATE INDEX "Rolling_status_idx" ON "Rolling"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Delivery_displayId_key" ON "Delivery"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "Subassembly_projectId_number_key" ON "Subassembly"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Amendment_displayId_key" ON "Amendment"("displayId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_entityType_entityId_idx" ON "AuditLogEntry"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_techLevelId_fkey" FOREIGN KEY ("techLevelId") REFERENCES "TechLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegationGrant" ADD CONSTRAINT "DelegationGrant_delegateId_fkey" FOREIGN KEY ("delegateId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DelegationGrant" ADD CONSTRAINT "DelegationGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequest" ADD CONSTRAINT "ClientRequest_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRequestNote" ADD CONSTRAINT "ClientRequestNote_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "ClientRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetModelSection" ADD CONSTRAINT "BudgetModelSection_budgetModelId_fkey" FOREIGN KEY ("budgetModelId") REFERENCES "BudgetModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetModelRow" ADD CONSTRAINT "BudgetModelRow_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "BudgetModelSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetSection" ADD CONSTRAINT "BudgetSection_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetRow" ADD CONSTRAINT "BudgetRow_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "BudgetSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "ClientRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTeamMember" ADD CONSTRAINT "ProjectTeamMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_subassemblyId_fkey" FOREIGN KEY ("subassemblyId") REFERENCES "Subassembly"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "Amendment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskDependency" ADD CONSTRAINT "ProjectTaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskDependency" ADD CONSTRAINT "ProjectTaskDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "ProjectTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePlanEntry" ADD CONSTRAINT "InvoicePlanEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePlanEntry" ADD CONSTRAINT "InvoicePlanEntry_rollingId_fkey" FOREIGN KEY ("rollingId") REFERENCES "Rolling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePlanEntry" ADD CONSTRAINT "InvoicePlanEntry_serviceCallId_fkey" FOREIGN KEY ("serviceCallId") REFERENCES "ServiceCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPurchaseEntry" ADD CONSTRAINT "ProjectPurchaseEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PurchaseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_serviceCallId_fkey" FOREIGN KEY ("serviceCallId") REFERENCES "ServiceCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PunchableTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCall" ADD CONSTRAINT "ServiceCall_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCallPart" ADD CONSTRAINT "ServiceCallPart_serviceCallId_fkey" FOREIGN KEY ("serviceCallId") REFERENCES "ServiceCall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCallPhoto" ADD CONSTRAINT "ServiceCallPhoto_serviceCallId_fkey" FOREIGN KEY ("serviceCallId") REFERENCES "ServiceCall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rolling" ADD CONSTRAINT "Rolling_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rolling" ADD CONSTRAINT "Rolling_clientRequestId_fkey" FOREIGN KEY ("clientRequestId") REFERENCES "ClientRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rolling" ADD CONSTRAINT "Rolling_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_rollingId_fkey" FOREIGN KEY ("rollingId") REFERENCES "Rolling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subassembly" ADD CONSTRAINT "Subassembly_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Amendment" ADD CONSTRAINT "Amendment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
