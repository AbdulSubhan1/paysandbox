export type CardBrand = 'visa' | 'mastercard';

export type TestCardOutcome =
  | 'succeeded'
  | 'three_ds'
  | 'dispute'
  | 'insufficient_funds'
  | 'expired_card'
  | 'generic_decline'
  | 'incorrect_cvc'
  | 'processing_error';

export interface TestCard {
  key: string;
  number: string;
  brand: CardBrand;
  outcome: TestCardOutcome;
  title: string;
  description: string;
  showInCheckout: boolean;
}

/** The only card numbers PaySandbox accepts. Shared by the browser and the server. */
export const TEST_CARDS: readonly TestCard[] = [
  { key: 'visa_success', number: '4242424242424242', brand: 'visa', outcome: 'succeeded', title: 'Succeeds', description: 'Approved straight away.', showInCheckout: true },
  { key: 'insufficient_funds', number: '4000000000009995', brand: 'visa', outcome: 'insufficient_funds', title: 'Declined: insufficient funds', description: 'Bank declines with insufficient_funds.', showInCheckout: true },
  { key: 'three_ds', number: '4000000000003220', brand: 'visa', outcome: 'three_ds', title: 'Asks for OTP (3-D Secure)', description: 'Opens a bank OTP screen. 123456 passes, anything else fails.', showInCheckout: true },
  { key: 'expired_card', number: '4000000000000069', brand: 'visa', outcome: 'expired_card', title: 'Declined: expired card', description: 'Declined with expired_card, whatever expiry you type.', showInCheckout: true },
  { key: 'mastercard_success', number: '5555555555554444', brand: 'mastercard', outcome: 'succeeded', title: 'Succeeds (Mastercard)', description: 'Same as 4242, different brand.', showInCheckout: false },
  { key: 'generic_decline', number: '4000000000000002', brand: 'visa', outcome: 'generic_decline', title: 'Declined: generic', description: 'Bank declines with no reason given.', showInCheckout: false },
  { key: 'incorrect_cvc', number: '4000000000000127', brand: 'visa', outcome: 'incorrect_cvc', title: 'Declined: incorrect CVC', description: 'Declined with incorrect_cvc.', showInCheckout: false },
  { key: 'processing_error', number: '4000000000000119', brand: 'visa', outcome: 'processing_error', title: 'Processing error', description: 'Gateway error. Safe to retry with the same Idempotency-Key.', showInCheckout: false },
  { key: 'dispute', number: '4000000000000259', brand: 'visa', outcome: 'dispute', title: 'Succeeds, then disputed', description: 'Payment succeeds; a dispute opens shortly after.', showInCheckout: false },
];
