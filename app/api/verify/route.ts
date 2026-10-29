import { NextRequest, NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase";
import { verifyQrToken } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { qr_token, event_id, pin, staff_name } = body;

    if (!qr_token || !event_id) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters (qr_token, event_id)" },
        { status: 400 }
      );
    }

    const supabase = getAdminSupabase();

    // 1. Verify Event Scanner PIN
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id, title, scanner_pin")
      .eq("id", event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404 }
      );
    }

    if (pin && event.scanner_pin && pin !== event.scanner_pin) {
      return NextResponse.json(
        { success: false, error: "Invalid Scanner PIN authorization" },
        { status: 403 }
      );
    }

    // 2. Decode QR Token
    const decoded = verifyQrToken(qr_token);
    if (!decoded.valid) {
      return NextResponse.json({
        success: false,
        status: "INVALID",
        error: decoded.error || "Cryptographic verification failed",
      });
    }

    const ticketNumber = decoded.ticketNumber;

    // 3. Query Ticket in Database
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id, ticket_number, event_id, buyer_name, quantity, amount_paid, scanned, scanned_at")
      .eq("ticket_number", ticketNumber)
      .eq("event_id", event_id)
      .single();

    if (ticketError || !ticket) {
      return NextResponse.json({
        success: false,
        status: "INVALID",
        error: "Pass not found for this event",
      });
    }

    // 4. Duplicate Check
    if (ticket.scanned) {
      return NextResponse.json({
        success: true,
        status: "ALREADY_SCANNED",
        attendee_name: ticket.buyer_name,
        quantity: ticket.quantity,
        ticket_number: ticket.ticket_number,
        scanned_at: ticket.scanned_at,
        message: "Pass already used at gate!",
      });
    }

    // 5. Mark Scanned
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("tickets")
      .update({
        scanned: true,
        scanned_at: now,
      })
      .eq("id", ticket.id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: "Database update failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      status: "VALID",
      attendee_name: ticket.buyer_name,
      quantity: ticket.quantity,
      ticket_number: ticket.ticket_number,
      scanned_at: now,
      message: "Pass Validated Successfully",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
