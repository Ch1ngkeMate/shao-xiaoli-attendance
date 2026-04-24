-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "points" INTEGER NOT NULL,
    "headcountHint" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "publisherId" TEXT NOT NULL,
    CONSTRAINT "Task_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TaskImage_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskClaim" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'CLAIMED',
    CONSTRAINT "TaskClaim_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submitTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    CONSTRAINT "TaskSubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskSubmission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "EvidenceImage_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TaskSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaskReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "reason" TEXT,
    CONSTRAINT "TaskReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "TaskSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "month" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT,
    "statsJson" TEXT NOT NULL,
    "exportPath" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Task_startTime_endTime_idx" ON "Task"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "Task_publisherId_idx" ON "Task"("publisherId");

-- CreateIndex
CREATE INDEX "TaskImage_taskId_sort_idx" ON "TaskImage"("taskId", "sort");

-- CreateIndex
CREATE INDEX "TaskClaim_userId_claimTime_idx" ON "TaskClaim"("userId", "claimTime");

-- CreateIndex
CREATE INDEX "TaskClaim_taskId_claimTime_idx" ON "TaskClaim"("taskId", "claimTime");

-- CreateIndex
CREATE UNIQUE INDEX "TaskClaim_taskId_userId_key" ON "TaskClaim"("taskId", "userId");

-- CreateIndex
CREATE INDEX "TaskSubmission_userId_submitTime_idx" ON "TaskSubmission"("userId", "submitTime");

-- CreateIndex
CREATE INDEX "TaskSubmission_taskId_submitTime_idx" ON "TaskSubmission"("taskId", "submitTime");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSubmission_taskId_userId_key" ON "TaskSubmission"("taskId", "userId");

-- CreateIndex
CREATE INDEX "EvidenceImage_submissionId_sort_idx" ON "EvidenceImage"("submissionId", "sort");

-- CreateIndex
CREATE UNIQUE INDEX "TaskReview_submissionId_key" ON "TaskReview"("submissionId");

-- CreateIndex
CREATE INDEX "TaskReview_reviewerId_reviewTime_idx" ON "TaskReview"("reviewerId", "reviewTime");

-- CreateIndex
CREATE INDEX "TaskReview_result_idx" ON "TaskReview"("result");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_month_key" ON "MonthlyReport"("month");
