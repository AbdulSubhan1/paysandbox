# OTP (3-D Secure)

1. The customer pays with **4000 0000 0000 3220**.
2. The payment becomes **requires action** and PaySandbox sends `payment.requires_action`.
3. A "Sandbox Bank" screen, clearly labelled as a simulation, asks for a code.
4. **123456** → the payment succeeds. A wrong code shows the tries left; after **3 wrong codes**, or **Cancel**, the payment fails with "authentication failed".
5. If the customer abandons the screen, the payment fails when the session expires (24 hours after creation) and `payment.failed` is sent then.

## Rules
- The system shall never store OTP codes.
- The system shall allow 3 attempts per payment.
