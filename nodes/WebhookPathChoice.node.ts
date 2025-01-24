import type {
	IExecuteFunctions,
	INodeType,
	INodeTypeDescription,
	INodeExecutionData,
	IWebhookFunctions,
	IWebhookResponseData,
	INodeParameters,
	IDataObject,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError, WAIT_INDEFINITELY } from 'n8n-workflow';

// Create helper function (similar to SwitchV3)
function configuredOutputs(parameters: INodeParameters) {
	// one output for each action
	const actionList = ((parameters.actions as IDataObject)?.action as IDataObject[]) ?? [];
	return actionList.map((action, index) => ({
		type: NodeConnectionType.Main,
		displayName: action.name || `Action ${index}`,
	}));
}

export class WebhookPathChoice implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Webhook Path Choice',
		subtitle: '={{$parameter["subject"]}}',
		name: 'webhookPathChoice',
		group: ['transform'],
		version: 1,
		description: 'Requests approval from an external system and waits for result',
		defaults: {
			name: 'Webhook Path Choice',
			color: '#7DC836',
		},
		credentials: [],
		inputs: [NodeConnectionType.Main],
		// Dynamically compute outputs from "actions"
		outputs: `={{(${configuredOutputs})($parameter)}}`,
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				responseData: '',
				path: '={{ $nodeId }}',
				restartWebhook: true,
				isFullPath: true,
			},
		],
		properties: [
			{
				displayName: 'Subject',
				name: 'subject',
				type: 'string',
				default: '',
				required: true,
				description: 'Short descriptive subject of the approval request',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				default: '',
				required: true,
				description: 'Detailed message displayed to the Approver',
			},
			{
				displayName: 'Actions',
				name: 'actions',
				type: 'fixedCollection',
				placeholder: 'Add Action',
				typeOptions: {
					multipleValues: true,
				},
				default: {
					action: [
						{
							name: 'Approve',
							action_is_destructive: false,
							gather_custom_feedback_response: false,
						},{
							name: 'Decline',
							action_is_destructive: true,
							gather_custom_feedback_response: true,
						},
					],	
				},
				options: [
					{
						displayName: 'Action',
						name: 'action',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
								description: 'Name of the action (e.g. Approve)',
							}
						],
					},
				],
				description: 'Define possible actions for the approver. Each action becomes an output branch.',
			}
		],
	};


	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const subject = this.getNodeParameter('subject', 0) as string;
		const message = this.getNodeParameter('message', 0) as string;
		const actions = this.getNodeParameter('actions.action', 0, []) as Array<Record<string, any>>;

		const resumeUrl = this.evaluateExpression('{{ $execution?.resumeUrl }}', 0) as string;
		const nodeId = this.getNode().id;

		// Build arguments to request approval
		const requestBody = {
			subject,
			message,
			webhook_url: `${resumeUrl}/${nodeId}`,
			actions: actions.map((a) => ({
				name: a.name,
			})),
			account_uuid: '00000000-0000-4000-c025-000000000000' // SYSTEM_WORKFLOW_UUID
		};

		this.logger.warn('Starting workflow with arguments:' + JSON.stringify(requestBody));

		/**
		 * the real node would post to an external system to request approval,
		 * and wait for the webhook to be called with JSON body of the form: 
		 * { "action": SELECTED_ACTION_NAME, ...any other desired data }
         * 
         * await this.helpers.httpRequestWithAuthentication.call( ... )
         * 
         * In testing, we just get the webhook URL from the debug output and call it directly
		 */

		// Put execution to wait indefinitely
		await this.putExecutionToWait(WAIT_INDEFINITELY);
		return [this.getInputData()];
	}

	// Provide a webhook method similar to a trigger node
	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		this.logger.info('Webhook received' + JSON.stringify(this.getBodyData()));
		const body = this.getBodyData();
		
		// Pass thru the body to the appropriate output only
		const action = body.action;
		if (!action) {
			throw new NodeOperationError(this.getNode(), 'No "action" received.');
		}
		const allActions = this.getNodeParameter('actions.action', []) as Array<Record<string, any>>;
		const index = allActions.findIndex((a) => a.name === action);
		if (index < 0) {
			throw new NodeOperationError(this.getNode(), `Unknown action: ${action}`);
		}
		const returnArray:any = allActions.map(() => []);
		returnArray[index] = this.helpers.returnJsonArray(body);
		returnArray[index][0].pairedItem = { item: 0 };
		this.logger.info('Webhook response: ' + JSON.stringify(returnArray));

        /**
         * ISSUE: this only works when index === 0
         */

		return {
			webhookResponse: 'OK',
			workflowData: returnArray
		};
	}
}
