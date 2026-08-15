import { config } from '../config/env';

export interface SMSProvider {
  sendOTP(phone: string, code: string, purpose: string): Promise<void>;
}

/**
 * Mock SMS Provider for Development
 * Logs OTP to console with clear DEVELOPMENT ONLY markers
 * This makes it easy for evaluators to find the OTP during testing
 */
class MockSMSProvider implements SMSProvider {
  async sendOTP(phone: string, code: string, purpose: string): Promise<void> {
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
    console.log('⚠️  THIS IS A MOCK SMS SERVICE FOR DEVELOPMENT ONLY');
    console.log('⚠️  In production, this would integrate with Twilio, Vonage, etc.');
    console.log(separator + '\n');
  }
}

/**
 * Production SMS Provider Interface
 * Replace with actual implementation (Twilio, Vonage, etc.)
 */
class ProductionSMSProvider implements SMSProvider {
  async sendOTP(phone: string, code: string, purpose: string): Promise<void> {
    // TODO: Implement production SMS provider
    // Example Twilio implementation:
    /*
    const twilio = require('twilio')(accountSid, authToken);
    await twilio.messages.create({
      body: `Your ${purpose} code is: ${code}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
    */
    throw new Error('Production SMS provider not implemented');
  }
}

// Factory to get the appropriate provider
function getSMSProvider(): SMSProvider {
  if (config.MOCK_SMS_ENABLED || config.NODE_ENV !== 'production') {
    return new MockSMSProvider();
  }
  return new ProductionSMSProvider();
}

const provider = getSMSProvider();

export const smsService = {
  async sendOTP(phone: string, code: string, purpose: string): Promise<void> {
    // Validate phone number format (E.164)
    if (!/^\+[1-9]\d{1,14}$/.test(phone)) {
      throw new Error('Invalid phone number format. Must be E.164 format (e.g., +14155552671)');
    }

    await provider.sendOTP(phone, code, purpose);
  },
};