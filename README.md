This repo demonstrates an issue with webhook wait nodes where only the *first* output branch works when resuming a workflow from a webhook.

See workflow_repro.json for an example workflow which uses this node. The example only ever proceeds along the "Approve" path, never the "Decline" path.