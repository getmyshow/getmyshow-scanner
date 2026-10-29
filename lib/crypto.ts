import crypto from "crypto";

const QR_SECRET = process.env.QR_HMAC_SECRET || "getmyshow_secret_qr_token_key_change_in_production";

/**
 * Validates a scanned QR token.
 * Token format: {ticketNumber}.{eventId}.{timestamp}.{signature}
 */
export function verifyQrToken(token: string): {
  valid: boolean;
  ticketNumber?: string;
  eventId?: string;
  error?: string;
} {
  try {
    const parts = token.split(".");
    if (parts.length < 4) {
      // Direct ticket ID lookup fallback
      if (token.startsWith("GMS-") || token.length >= 8) {
        return { valid: true, ticketNumber: token.trim().toUpperCase() };
      }
      return { valid: false, error: "Invalid QR code structure" };
    }

    const [ticketNumber, eventId, timestamp, signature] = parts;
    const payload = `${ticketNumber}.${eventId}.${timestamp}`;
    const expectedSignature = crypto
      .createHmac("sha256", QR_SECRET)
      .update(payload)
      .digest("hex")
      .slice(0, 16);

    if (signature !== expectedSignature) {
      return { valid: false, error: "Cryptographic signature mismatch (Counterfeit Pass)" };
    }

    return {
      valid: true,
      ticketNumber,
      eventId,
    };
  } catch (err) {
    return { valid: false, error: "QR decoding failed" };
  }
}
