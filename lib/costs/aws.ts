// lib/costs/aws.ts
// Real month-to-date spend via AWS Cost Explorer, using the same platform
// credentials already configured for provisioning Windows VMs (see
// lib/vmProviders/platformCredentials.ts) -- these need the ce:GetCostAndUsage
// IAM permission added, and Cost Explorer must be enabled once in the AWS
// console (takes ~24h to start populating data) before this will succeed.
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import type { CostSnapshot } from "./types";

export async function fetchAwsCost(): Promise<CostSnapshot> {
  const accessKeyId = process.env.AWS_PLATFORM_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_PLATFORM_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) throw new Error("AWS_PLATFORM_ACCESS_KEY_ID / AWS_PLATFORM_SECRET_ACCESS_KEY are not configured.");

  // Cost Explorer is a global service reachable only via us-east-1.
  const ce = new CostExplorerClient({ region: "us-east-1", credentials: { accessKeyId, secretAccessKey } });

  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const startStr = periodStart.toISOString().slice(0, 10);
  // CE requires Start != End -- use tomorrow (exclusive) as the request's
  // End even though the data itself typically lags about a day.
  const endStr = tomorrow.toISOString().slice(0, 10);

  const result = await ce.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: startStr, End: endStr },
    Granularity: "MONTHLY",
    Metrics: ["UnblendedCost"],
  }));

  const amount = result.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount;

  return {
    amountUsd: amount ? parseFloat(amount) : 0,
    periodStart: startStr,
    periodEnd: now.toISOString().slice(0, 10),
  };
}
