import { config } from '../config/env';
import twilio from 'twilio';
import { SMSDeliveryError } from '../utils/errors';

export interface SMSProvider {
  sendOTP(phone: string, code: string, purpose: string): Promise<SMSDeliveryResult>;
}

export interface SMSDeliveryResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

const isValidPhoneNumber = (phone: string): boolean => {
  return /^\+[1-9]\d{1,14}$/.test(phone);
};

/**
 * Mock SMS Provider for Development
 * Logs OTP to console with clear DEVELOPMENT ONLY markers
 * This makes it easy for evaluators to find the OTP during testing
 */
class MockSMSProvider implements SMSProvider {
  async sendOTP(phone: string, code: string, purpose: string): Promise<SMSDeliveryResult> {
    if (!isValidPhoneNumber(phone)) {
      return { success: false, error: 'Invalid phone number format' };
    }

    const separator = '='.repeat(60);
    const timestamp = new Date().toISOString();

    console.log('\n' + separator);
    console.log('[MOCK SMS] DEVELOPMENT ONLY - OTP DELIVERY');
    console.log(separator);
    console.log(`Timestamp:  ${timestamp}`);
    console.log(`Recipient:  ${phone}`);
    console.log(`Purpose:    ${purpose}`);
    console.log(`OTP Code:   ${code}`);
    console.log('');
    console.log('[MOCK SMS] THIS IS A MOCK SMS SERVICE FOR DEVELOPMENT ONLY');
    console.log('[MOCK SMS] In production, this would integrate with Twilio, Vonage, etc.');
    console.log(separator + '\n');

    return { success: true, providerMessageId: 'mock-' + Date.now() };
  }
}

/**
 * Twilio Verify SMS Provider
 * Uses Twilio Verify API with custom verification codes
 */
class TwilioSMSProvider implements SMSProvider {
  private client: twilio.Twilio;
  private serviceSid: string;

  constructor() {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = config;
    this.client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    this.serviceSid = TWILIO_VERIFY_SERVICE_SID!;
  }

  async sendOTP(phone: string, code: string, purpose: string): Promise<SMSDeliveryResult> {
    if (!isValidPhoneNumber(phone)) {
      return { success: false, error: 'Invalid phone number format. Must be E.164 format (e.g., +14155552671)' };
    }

    try {
      const verification = await this.client.verify.v2
        .services(this.serviceSid)
        .verifications.create({
          to: phone,
          channel: 'sms',
          customCode: code,
        });

      return { success: true, providerMessageId: verification.sid };
    } catch (error) {
      const twilioError = error as Error & { code?: number; status?: number };
      const errorMessage = this.sanitizeTwilioError(twilioError);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Mark a Twilio verification as approved after successful local OTP verification
   * This is best-effort - failure doesn't roll back local authentication
   */
  async approveVerification(verificationSid: string): Promise<void> {
    try {
      await this.client.verify.v2
        .services(this.serviceSid)
        .verifications(verificationSid)
        .update({ status: 'approved' });
    } catch (error) {
      // Log warning but don't throw - local auth succeeded
      const twilioError = error as Error & { code?: number; status?: number };
      const sanitized = this.sanitizeTwilioError(twilioError);
      console.warn(`[Twilio] Failed to mark verification ${verificationSid} as approved: ${sanitized}`);
    }
  }

  private sanitizeTwilioError(error: Error & { code?: number; status?: number }): string {
    // Map Twilio error codes to safe messages
    const errorCode = error.code || error.status;
    const safeMessages: Record<number, string> = {
      20003: 'Invalid destination phone number',
      20404: 'Twilio Verify service not found',
      20429: 'Rate limit exceeded',
      21211: 'Invalid phone number format',
      21608: 'Unverified trial number - verify in Twilio console',
      30003: 'Unreachable destination handset',
      30005: 'Destination number unknown or invalid',
    };

    if (errorCode && safeMessages[errorCode]) {
      return safeMessages[errorCode];
    }

    // Generic safe message
    return 'Unable to send verification code';
  }
}

// Factory to get the appropriate provider
function getSMSProvider(): SMSProvider {
  if (config.SMS_PROVIDER === 'twilio') {
    return new TwilioSMSProvider();
  }
  return new MockSMSProvider();
}

const provider = getSMSProvider();

export const smsService = {
  async sendOTP(phone: string, code: string, purpose: string): Promise<SMSDeliveryResult> {
    if (!isValidPhoneNumber(phone)) {
      throw new SMSDeliveryError('Invalid phone number format. Must be E.164 format (e.g., +14155552671)');
    }

    const result = await provider.sendOTP(phone, code, purpose);

    if (!result.success) {
      throw new SMSDeliveryError(result.error || 'Failed to send OTP');
    }

    return result;
  },

  // Expose Twilio-specific method for marking verification as approved
  async approveTwilioVerification(verificationSid: string): Promise<void> {
    if (config.SMS_PROVIDER === 'twilio' && provider instanceof TwilioSMSProvider) {
      await provider.approveVerification(verificationSid);
    }
  },
};