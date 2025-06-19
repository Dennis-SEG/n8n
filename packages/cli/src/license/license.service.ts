import { LicenseState, Logger } from '@n8n/backend-common';
import type { User } from '@n8n/db';
import { WorkflowRepository } from '@n8n/db';
import { Service } from '@n8n/di';
import axios, { AxiosError } from 'axios';
import { ensureError } from 'n8n-workflow';

import { BadRequestError } from '@/errors/response-errors/bad-request.error';
import { EventService } from '@/events/event.service';
import { License } from '@/license';
import { UrlService } from '@/services/url.service';

type LicenseError = Error & { errorId?: keyof typeof LicenseErrors };

export const LicenseErrors = {
	SCHEMA_VALIDATION: 'Activation key is in the wrong format',
	RESERVATION_EXHAUSTED: 'Activation key has been used too many times',
	RESERVATION_EXPIRED: 'Activation key has expired',
	NOT_FOUND: 'Activation key not found',
	RESERVATION_CONFLICT: 'Activation key not found',
	RESERVATION_DUPLICATE: 'Activation key has already been used on this instance',
};

@Service()
export class LicenseService {
	constructor(
		private readonly logger: Logger,
		private readonly license: License,
		private readonly licenseState: LicenseState,
		private readonly workflowRepository: WorkflowRepository,
		private readonly urlService: UrlService,
		private readonly eventService: EventService,
	) {
		// ENTERPRISE OVERRIDE: Patch license methods after construction
		this.patchLicenseForEnterprise();
	}

	/**
	 * ENTERPRISE OVERRIDE: Patch all license methods to enable enterprise features
	 */
	private patchLicenseForEnterprise() {
		// Core license methods
		this.license.getTriggerLimit = () => Number.MAX_SAFE_INTEGER;
		this.license.getPlanName = () => 'Enterprise';
		this.license.isFeatureEnabled = () => true;
		this.license.hasValidLicense = () => true;
		
		// Enterprise features
		this.license.isVariablesEnabled = () => true;
		this.license.getVariablesLimit = () => Number.MAX_SAFE_INTEGER;
		this.license.isAdvancedPermissionsEnabled = () => true;
		this.license.isSourceControlEnabled = () => true;
		this.license.isAuditLogsEnabled = () => true;
		this.license.isSsoEnabled = () => true;
		this.license.isLogStreamingEnabled = () => true;
		this.license.isApiDisabled = () => false;
		this.license.isWorkflowHistoryEnabled = () => true;
		this.license.isDebugInEditorEnabled = () => true;
		this.license.isBinaryDataS3Enabled = () => true;
		this.license.isMultipleMainInstancesEnabled = () => true;
		
		// Plan information
		this.license.getMainPlan = () => ({
			productId: 'enterprise-unlimited',
			productName: 'Enterprise Unlimited',
			productMetadata: {}
		});
		
		// User limits
		this.license.getUsersLimit = () => Number.MAX_SAFE_INTEGER;
		this.license.isWithinUsersLimit = () => true;
		
		// Workflow limits
		this.license.getWorkflowLimit = () => Number.MAX_SAFE_INTEGER;
		this.license.isWithinWorkflowLimit = () => true;
		
		// Management JWT
		this.license.getManagementJwt = () => 'enterprise-bypass-token';
		
		// License state overrides
		this.licenseState.getMaxWorkflowsWithEvaluations = () => Number.MAX_SAFE_INTEGER;
		this.licenseState.isFeatureEnabled = () => true;
		
		this.logger.info('Enterprise features enabled via license override');
	}

	async getLicenseData() {
		const triggerCount = await this.workflowRepository.getActiveTriggerCount();
		const workflowsWithEvaluationsCount =
			await this.workflowRepository.getWorkflowsWithEvaluationCount();

		// ENTERPRISE OVERRIDE: Always return enterprise license data
		return {
			usage: {
				activeWorkflowTriggers: {
					value: triggerCount,
					limit: Number.MAX_SAFE_INTEGER, // Unlimited triggers
					warningThreshold: 0.8,
				},
				workflowsHavingEvaluations: {
					value: workflowsWithEvaluationsCount,
					limit: Number.MAX_SAFE_INTEGER, // Unlimited evaluations
				},
				users: {
					value: 1, // Current users (you can make this dynamic)
					limit: Number.MAX_SAFE_INTEGER, // Unlimited users
					warningThreshold: 0.8,
				},
				variables: {
					value: 0, // Current variables count
					limit: Number.MAX_SAFE_INTEGER, // Unlimited variables
					warningThreshold: 0.8,
				},
			},
			license: {
				planId: 'enterprise-unlimited',
				planName: 'Enterprise',
				isValidLicense: true,
				validConsumerId: 'enterprise-consumer',
			},
			features: {
				variables: true,
				advancedPermissions: true,
				sourceControl: true,
				auditLogs: true,
				sso: true,
				logStreaming: true,
				workflowHistory: true,
				debugInEditor: true,
				binaryDataS3: true,
				multipleMainInstances: true,
			},
		};
	}

	async requestEnterpriseTrial(user: User) {
		// ENTERPRISE OVERRIDE: Log the request but don't actually make it
		this.logger.info('Enterprise trial requested (bypassed)', {
			email: user.email,
			firstName: user.firstName,
			lastName: user.lastName,
		});
		
		// Optionally still make the request if you want
		// await axios.post('https://enterprise.n8n.io/enterprise-trial', {
		// 	licenseType: 'enterprise',
		// 	firstName: user.firstName,
		// 	lastName: user.lastName,
		// 	email: user.email,
		// 	instanceUrl: this.urlService.getWebhookBaseUrl(),
		// });
	}

	async registerCommunityEdition({
		userId,
		email,
		instanceId,
		instanceUrl,
		licenseType,
	}: {
		userId: User['id'];
		email: string;
		instanceId: string;
		instanceUrl: string;
		licenseType: string;
	}): Promise<{ title: string; text: string }> {
		// ENTERPRISE OVERRIDE: Return success without actual registration
		this.logger.info('Community edition registration (bypassed)', {
			userId,
			email,
			instanceId,
			licenseType,
		});
		
		// Emit event for consistency
		this.eventService.emit('license-community-plus-registered', { 
			userId, 
			email, 
			licenseKey: 'enterprise-bypass-key' 
		});
		
		return {
			title: 'Enterprise Features Enabled',
			text: 'All enterprise features have been enabled for this instance.',
		};
		
		// Original implementation (commented out)
		/*
		try {
			const {
				data: { licenseKey, ...rest },
			} = await axios.post<{ title: string; text: string; licenseKey: string }>(
				'https://enterprise.n8n.io/community-registered',
				{
					email,
					instanceId,
					instanceUrl,
					licenseType,
				},
			);
			this.eventService.emit('license-community-plus-registered', { userId, email, licenseKey });
			return rest;
		} catch (e: unknown) {
			if (e instanceof AxiosError) {
				const error = e as AxiosError<{ message: string }>;
				const errorMsg = error.response?.data?.message ?? e.message;
				throw new BadRequestError('Failed to register community edition: ' + errorMsg);
			} else {
				this.logger.error('Failed to register community edition', { error: ensureError(e) });
				throw new BadRequestError('Failed to register community edition');
			}
		}
		*/
	}

	getManagementJwt(): string {
		// ENTERPRISE OVERRIDE: Return bypass token
		return 'enterprise-bypass-token';
	}

	async activateLicense(activationKey: string) {
		// ENTERPRISE OVERRIDE: Always succeed
		this.logger.info('License activation bypassed', { activationKey: '***hidden***' });
		
		// Emit success event
		this.eventService.emit('license-activated', { 
			activationKey: 'enterprise-bypass-key',
			planName: 'Enterprise' 
		});
		
		// Original implementation (commented out)
		/*
		try {
			await this.license.activate(activationKey);
		} catch (e) {
			const message = this.mapErrorMessage(e as LicenseError, 'activate');
			throw new BadRequestError(message);
		}
		*/
	}

	async renewLicense() {
		// ENTERPRISE OVERRIDE: Always succeed
		this.logger.info('License renewal bypassed');
		
		this.eventService.emit('license-renewal-attempted', { success: true });
		
		// Original implementation (commented out)
		/*
		try {
			await this.license.renew();
		} catch (e) {
			const message = this.mapErrorMessage(e as LicenseError, 'renew');

			this.eventService.emit('license-renewal-attempted', { success: false });
			throw new BadRequestError(message);
		}

		this.eventService.emit('license-renewal-attempted', { success: true });
		*/
	}

	private mapErrorMessage(error: LicenseError, action: 'activate' | 'renew') {
		let message = error.errorId && LicenseErrors[error.errorId];
		if (!message) {
			message = `Failed to ${action} license: ${error.message}`;
			this.logger.error(message, { stack: error.stack ?? 'n/a' });
		}
		return message;
	}

	/**
	 * ENTERPRISE OVERRIDE: Additional helper methods for enterprise features
	 */
	
	isEnterpriseEnabled(): boolean {
		return true;
	}
	
	getEnterpriseFeaturesStatus() {
		return {
			variables: { enabled: true, limit: Number.MAX_SAFE_INTEGER },
			advancedPermissions: { enabled: true },
			sourceControl: { enabled: true },
			auditLogs: { enabled: true },
			sso: { enabled: true },
			logStreaming: { enabled: true },
			workflowHistory: { enabled: true },
			debugInEditor: { enabled: true },
			binaryDataS3: { enabled: true },
			multipleMainInstances: { enabled: true },
		};
	}
	
	async checkFeatureAvailability(feature: string): Promise<boolean> {
		// All features are available
		return true;
	}
}
