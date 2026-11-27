"use client";

import { PageHeader } from "@/components/ui";
import { RunLogs } from "@/components/logs/RunLogs";

// Every workflow run in one place, with each status named.
export default function LogsPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="All Logs"
        subtitle="Consolidated activity across Lead Automation: workflow runs, emails and WhatsApp messages. Click a row for details."
      />
      <RunLogs />
    </div>
  );
}
