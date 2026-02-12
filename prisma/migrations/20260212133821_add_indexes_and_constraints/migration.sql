-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_applyUrl_key" ON "Opportunity"("applyUrl");

-- CreateIndex
CREATE INDEX "Opportunity_cfpDeadline_idx" ON "Opportunity"("cfpDeadline");

-- CreateIndex
CREATE INDEX "Opportunity_eventDate_idx" ON "Opportunity"("eventDate");

-- CreateIndex
CREATE INDEX "Opportunity_qualityScore_idx" ON "Opportunity"("qualityScore");

-- CreateIndex
CREATE INDEX "Opportunity_format_idx" ON "Opportunity"("format");

-- CreateIndex
CREATE INDEX "Opportunity_source_idx" ON "Opportunity"("source");

-- CreateIndex
CREATE INDEX "Opportunity_createdAt_idx" ON "Opportunity"("createdAt");

-- CreateIndex
CREATE INDEX "Opportunity_isRemote_idx" ON "Opportunity"("isRemote");
